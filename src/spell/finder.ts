// Finder mode: given a word, build a real, ridable subway path whose line
// letters spell it. Train legs are optimized with a layered shortest-path over
// candidate transfer points; missing letters become walking-wildcard legs.
import type { Complex, LatLng } from "../types";
import { SubwayGraph, WALK_TRANSFER_METERS, haversineMeters } from "../data/buildGraph";
import { normalizeWord, wordToLegs, missingLetters, type WordLeg } from "./letters";

// Every strategy strongly avoids walking and strongly prefers actually riding a
// train between distinct stations (rather than transferring in place). They
// differ only in how much ride length matters once those are satisfied.
//   walk >> samePenalty >> ride  — so it never walks to dodge a same-station
//   transfer, and never picks a same-station transfer when a real ride exists.
export type RouteStrategy = "scenic" | "least-walk" | "fastest";

interface Weights {
  ride: number; // cost per meter ridden
  walk: number; // cost per meter walked (kept very high to minimize walking)
  samePenalty: number; // penalty for a transfer that doesn't change station
}

const STRATEGY_WEIGHTS: Record<RouteStrategy, Weights> = {
  scenic: { ride: 0.1, walk: 60, samePenalty: 6000 }, // rides cheap → spread out, always ride
  "least-walk": { ride: 0.5, walk: 120, samePenalty: 1500 }, // accept a boring transfer over any walk
  fastest: { ride: 1, walk: 60, samePenalty: 6000 }, // nearest distinct station → short real rides
};

const SAME_STATION_RIDE_M = 60; // a ride shorter than this counts as "same station"

export interface RouteOptions {
  strategy?: RouteStrategy;
  /** Bump to get a different but still-good route ("another route"). */
  variant?: number;
}

// Deterministic pseudo-random in [0,1) so "another route" is repeatable.
function jitter(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export interface NamedPoint {
  name: string;
  pos: LatLng;
}

export interface RideLeg {
  kind: "ride";
  letter: string;
  /** The run of letters this ride spells (e.g. "ZZ" in JAZZ). */
  letters: string;
  line: string;
  from: NamedPoint;
  to: NamedPoint;
}

/** A real date spot (restaurant/cafe/bar) used to "spell" a letter with no train. */
export interface DateSpot {
  name: string;
  category: string; // OSM amenity, e.g. "restaurant", "cafe", "bar"
  pos: LatLng;
}

export interface WalkLeg {
  kind: "walk";
  /** The missing letter this walk represents, or null for a transfer walk. */
  letter: string | null;
  /** The run of letters this walk spells ("" for a plain transfer walk). */
  letters: string;
  from: NamedPoint;
  to: NamedPoint;
  meters: number;
  /** The venue (bar/café/park/landmark) this walk leads to (resolved async). */
  venue?: DateSpot;
  /** Real on-street walking geometry (resolved async via OSRM). */
  path?: LatLng[];
}

export type ItineraryLeg = RideLeg | WalkLeg;

export interface FinderResult {
  word: string;
  upper: string;
  legs: ItineraryLeg[];
  missingLetters: string[];
  feasible: boolean;
  notes: string[];
}

interface TransferOption {
  arrive: Complex; // station on the line you're leaving
  depart: Complex; // station on the line you're boarding
  walk: number; // meters walked during the transfer (0 if in-system)
}

const point = (c: Complex): NamedPoint => ({ name: c.name, pos: c.pos });

function transferOptions(a: string, b: string, graph: SubwayGraph): TransferOption[] {
  const opts: TransferOption[] = [];
  for (const c of graph.inSystemTransfers(a, b)) {
    opts.push({ arrive: c, depart: c, walk: 0 });
  }
  for (const w of graph.walkingTransfers(a, b)) {
    opts.push({ arrive: w.a, depart: w.b, walk: w.meters });
  }
  if (opts.length === 0) {
    // No real transfer: bridge with the shortest possible walk between the
    // two lines (surfaced to the user as a long walk).
    const as = graph.complexesServingLine(a);
    const bs = graph.complexesServingLine(b);
    let best: TransferOption | null = null;
    for (const ca of as) {
      for (const cb of bs) {
        const d = haversineMeters(ca.pos, cb.pos);
        if (!best || d < best.walk) best = { arrive: ca, depart: cb, walk: d };
      }
    }
    if (best) opts.push(best);
  }
  return opts;
}

// The whole word is solved as ONE layered shortest-path: board stations,
// transfer stations, and end stations are all layers, and the walk gaps
// between train runs (missing-letter venue detours) are edges weighted by
// w.walk — so the optimizer sees, and minimizes, every meter walked.
interface DpNode {
  arrive: Complex; // where the incoming edge lands
  depart: Complex; // where the outgoing edge leaves (differs for walking transfers)
  walkIn: number; // meters walked inside the node (out-of-system transfer)
}

interface DpLayer {
  nodes: DpNode[];
  /** How you reach this layer: ride a line, walk a wildcard gap, or nothing (first layer). */
  edge: "ride" | "gap" | null;
  /** Line ridden / letters spelled on a "ride" edge. */
  line?: string;
  letters?: string;
  /** Missing-letter runs spelled while walking a "gap" edge. */
  gapRuns?: string[];
}

const asNode = (c: Complex): DpNode => ({ arrive: c, depart: c, walkIn: 0 });

/** Layers for one maximal run of train legs: board → transfers → end. */
function buildRunLayers(wordLegs: WordLeg[], graph: SubwayGraph): DpLayer[] | null {
  const lines = wordLegs.map((l) => l.line!);
  if (lines.some((l) => graph.complexesServingLine(l).length === 0)) return null;

  const layers: DpLayer[] = [{ nodes: graph.complexesServingLine(lines[0]).map(asNode), edge: null }];
  for (let t = 0; t < lines.length - 1; t++) {
    const opts = transferOptions(lines[t], lines[t + 1], graph);
    if (opts.length === 0) return null;
    layers.push({
      nodes: opts.map((o) => ({ arrive: o.arrive, depart: o.depart, walkIn: o.walk })),
      edge: "ride",
      line: lines[t],
      letters: wordLegs[t].letters,
    });
  }
  const last = lines.length - 1;
  layers.push({
    nodes: graph.complexesServingLine(lines[last]).map(asNode),
    edge: "ride",
    line: lines[last],
    letters: wordLegs[last].letters,
  });
  return layers;
}

/** Shortest path through the layers; returns the chosen node index per layer. */
function solveLayers(layers: DpLayer[], w: Weights, variant: number): number[] {
  // Jitter for "another route": big enough to reshuffle which distinct station
  // is chosen, but capped below samePenalty/walk so it never turns a real ride
  // into a same-station transfer or a walk.
  const jitterScale = variant ? Math.min(w.samePenalty * 0.4, 1500) : 0;

  let prevCost = layers[0].nodes.map(
    (n, i) => n.walkIn * w.walk + jitter(variant * 131 + i) * jitterScale,
  );
  const back: number[][] = [];
  for (let t = 1; t < layers.length; t++) {
    const layer = layers[t];
    const prev = layers[t - 1];
    const curCost = new Array<number>(layer.nodes.length).fill(Infinity);
    const curBack = new Array<number>(layer.nodes.length).fill(-1);
    for (let i = 0; i < layer.nodes.length; i++) {
      const n = layer.nodes[i];
      const extra = n.walkIn * w.walk + jitter(variant * 131 + t * 17 + i * 7) * jitterScale;
      for (let j = 0; j < prev.nodes.length; j++) {
        const dist = haversineMeters(prev.nodes[j].depart.pos, n.arrive.pos);
        let cost = prevCost[j] + extra + dist * (layer.edge === "gap" ? w.walk : w.ride);
        if (layer.edge === "ride" && dist < SAME_STATION_RIDE_M) cost += w.samePenalty; // force a real ride
        if (cost < curCost[i]) {
          curCost[i] = cost;
          curBack[i] = j;
        }
      }
    }
    back.push(curBack);
    prevCost = curCost;
  }

  let bestI = 0;
  for (let i = 1; i < prevCost.length; i++) if (prevCost[i] < prevCost[bestI]) bestI = i;
  const chosen = new Array<number>(layers.length);
  chosen[layers.length - 1] = bestI;
  for (let t = layers.length - 2; t >= 0; t--) chosen[t] = back[t][chosen[t + 1]];
  return chosen;
}

/** Turn the chosen path through the layers into itinerary legs. */
function emitLegs(layers: DpLayer[], chosen: number[]): { legs: ItineraryLeg[]; notes: string[] } {
  const legs: ItineraryLeg[] = [];
  const notes: string[] = [];
  for (let t = 1; t < layers.length; t++) {
    const layer = layers[t];
    const prev = layers[t - 1].nodes[chosen[t - 1]];
    const cur = layer.nodes[chosen[t]];
    if (layer.edge === "ride") {
      legs.push({
        kind: "ride",
        letter: layer.line!,
        letters: layer.letters!,
        line: layer.line!,
        from: point(prev.depart),
        to: point(cur.arrive),
      });
    } else {
      const from = point(prev.depart);
      const to = point(cur.arrive);
      if (layer.gapRuns!.length > 0) {
        legs.push(...wildcardWalks(layer.gapRuns!, from, to));
      } else if (haversineMeters(from.pos, to.pos) > 30) {
        legs.push({ kind: "walk", letter: null, letters: "", from, to, meters: haversineMeters(from.pos, to.pos) });
      }
    }
    if (cur.walkIn > 0 && cur.arrive.id !== cur.depart.id) {
      legs.push({
        kind: "walk",
        letter: null,
        letters: "",
        from: point(cur.arrive),
        to: point(cur.depart),
        meters: cur.walkIn,
      });
      if (cur.walkIn > WALK_TRANSFER_METERS) {
        notes.push(
          `No direct transfer from ${layer.line} to ${layers[t + 1]?.line} — a ${Math.round(
            cur.walkIn,
          )} m walk is required.`,
        );
      }
    }
  }
  return { legs, notes };
}

function lerp(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

function offset(p: LatLng, i: number): LatLng {
  return { lat: p.lat + 0.0016 * (i + 1), lng: p.lng + 0.0016 * (i + 1) };
}

/**
 * Build walk legs for a stretch of missing-letter runs between two anchor
 * points. Each entry of `runs` is a run of identical letters (e.g. "OO").
 */
function wildcardWalks(runs: string[], from: NamedPoint, to: NamedPoint): WalkLeg[] {
  const legs: WalkLeg[] = [];
  const n = runs.length;
  let prev = from.pos;
  let prevName = from.name;
  for (let i = 0; i < n; i++) {
    const frac = (i + 1) / (n + 1);
    const pos = lerp(from.pos, to.pos, frac);
    const isLast = i === n - 1;
    const next = isLast ? to.pos : pos;
    const nextName = isLast ? to.name : `walk (${runs[i]})`;
    legs.push({
      kind: "walk",
      letter: runs[i][0],
      letters: runs[i],
      from: { name: prevName, pos: prev },
      to: { name: nextName, pos: next },
      meters: haversineMeters(prev, next),
    });
    prev = next;
    prevName = nextName;
  }
  return legs;
}

/** Find a ridable path that spells `word`. */
export function findPath(word: string, graph: SubwayGraph, opts: RouteOptions = {}): FinderResult {
  const weights = STRATEGY_WEIGHTS[opts.strategy ?? "scenic"];
  const variant = opts.variant ?? 0;
  const upper = normalizeWord(word);
  const wordLegs = wordToLegs(word);
  const missing = missingLetters(word);
  const notes: string[] = [];

  if (/(.)\1/.test(upper)) {
    notes.push("Doubled letters are spelled by riding the line once (you can't transfer to the same line).");
  }

  // Split legs into maximal runs of train legs separated by walk (wildcard) legs.
  const segments: { type: "train" | "walk"; legs: WordLeg[] }[] = [];
  for (const leg of wordLegs) {
    const last = segments[segments.length - 1];
    if (last && last.type === leg.type) last.legs.push(leg);
    else segments.push({ type: leg.type, legs: [leg] });
  }

  // Chain every run into one global DP: the wildcard walks between runs become
  // "gap" edges, so board/end stations are chosen to keep those walks short.
  const layers: DpLayer[] = [];
  let leadingWalks: string[] = [];
  let pendingWalks: string[] = [];
  for (const seg of segments) {
    if (seg.type === "walk") {
      pendingWalks.push(...seg.legs.map((l) => l.letters));
      continue;
    }
    const runLayers = buildRunLayers(seg.legs, graph);
    if (!runLayers) {
      notes.push("Some lines in this word aren't in the data feed.");
      continue;
    }
    if (layers.length === 0) {
      leadingWalks = pendingWalks;
    } else {
      runLayers[0] = { ...runLayers[0], edge: "gap", gapRuns: pendingWalks };
    }
    layers.push(...runLayers);
    pendingWalks = [];
  }

  const out: ItineraryLeg[] = [];
  const feasible = layers.length > 0;
  let prevEnd: NamedPoint | null = null;

  if (feasible) {
    const chosen = solveLayers(layers, weights, variant);
    const { legs, notes: legNotes } = emitLegs(layers, chosen);
    notes.push(...legNotes);

    if (leadingWalks.length > 0) {
      const boardPoint = point(layers[0].nodes[chosen[0]].arrive);
      const anchorFrom = { name: "start", pos: offset(boardPoint.pos, -2) };
      out.push(...wildcardWalks(leadingWalks, anchorFrom, boardPoint));
    }
    out.push(...legs);
    const lastLayer = layers[layers.length - 1];
    prevEnd = point(lastLayer.nodes[chosen[chosen.length - 1]].depart);
  }

  // Trailing wildcard letters after the last train run.
  if (pendingWalks.length > 0) {
    const from = prevEnd ?? { name: "start", pos: { lat: 40.7128, lng: -74.006 } };
    const to: NamedPoint = { name: "end", pos: offset(from.pos, pendingWalks.length) };
    out.push(...wildcardWalks(pendingWalks, from, to));
  }

  if (missing.length > 0) {
    notes.push(
      `No train for ${missing.join(", ")} — we'll detour to a bar, café, park or landmark starting with ${
        missing.length > 1 ? "those letters" : "that letter"
      }.`,
    );
  }

  return { word, upper, legs: out, missingLetters: missing, feasible, notes };
}

/** A plain-text version of the itinerary, for copying/sharing. */
export function itineraryText(result: FinderResult): string {
  const lines = [`Subway Spell — "${result.upper}"`, ""];
  for (const leg of result.legs) {
    if (leg.kind === "ride") {
      lines.push(`🚆 Ride ${leg.line}: ${leg.from.name} → ${leg.to.name}`);
    } else if (leg.venue) {
      lines.push(`🚶 Walk to ${leg.venue.name} (${leg.venue.category}) for ${leg.letters}`);
    } else if (leg.letter) {
      lines.push(`🚶 Walk for ${leg.letters}`);
    } else {
      lines.push(`🚶 Walk ${Math.round(leg.meters)} m to ${leg.to.name}`);
    }
  }
  return lines.join("\n");
}

export interface TripStats {
  trains: number;
  transfers: number;
  stations: number;
  rideKm: number;
  walkKm: number;
  minutes: number;
}

/** Rough trip statistics for an itinerary (distances are straight-line estimates). */
export function tripStats(legs: ItineraryLeg[]): TripStats {
  let rideM = 0;
  let walkM = 0;
  let trains = 0;
  const stations = new Set<string>();
  for (const leg of legs) {
    if (leg.kind === "ride") {
      trains++;
      rideM += haversineMeters(leg.from.pos, leg.to.pos);
      stations.add(leg.from.name);
      stations.add(leg.to.name);
    } else {
      walkM += leg.meters;
    }
  }
  const transfers = Math.max(0, trains - 1);
  // ~30 km/h subway incl. stops, ~5 km/h walk, ~2.5 min per transfer.
  const minutes = Math.round(rideM / 500 + walkM / 83 + transfers * 2.5);
  return { trains, transfers, stations: stations.size, rideKm: rideM / 1000, walkKm: walkM / 1000, minutes };
}
