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

function nearestOther(list: Complex[], c: Complex): Complex | null {
  let best: Complex | null = null;
  let bestDist = Infinity;
  for (const x of list) {
    if (x.id === c.id) continue;
    const d = haversineMeters(x.pos, c.pos);
    if (d < bestDist) {
      bestDist = d;
      best = x;
    }
  }
  return best;
}

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

interface RunResult {
  legs: ItineraryLeg[];
  boardPoint: NamedPoint;
  endPoint: NamedPoint;
  notes: string[];
}

/** Solve a maximal run of consecutive train legs into an itinerary. */
function solveTrainRun(wordLegs: WordLeg[], graph: SubwayGraph, w: Weights, variant: number): RunResult | null {
  const lines = wordLegs.map((l) => l.line!);
  const runLetters = wordLegs.map((l) => l.letters);
  if (lines.some((l) => graph.complexesServingLine(l).length === 0)) return null;
  const notes: string[] = [];

  if (lines.length === 1) {
    const cs = graph.complexesServingLine(lines[0]);
    const board = cs[0];
    const end = nearestOther(cs, board) ?? board;
    return {
      legs: [
        { kind: "ride", letter: lines[0], letters: runLetters[0], line: lines[0], from: point(board), to: point(end) },
      ],
      boardPoint: point(board),
      endPoint: point(end),
      notes,
    };
  }

  const k = lines.length - 1; // number of transitions
  const optionsPerT: TransferOption[][] = [];
  for (let t = 0; t < k; t++) {
    const opts = transferOptions(lines[t], lines[t + 1], graph);
    if (opts.length === 0) return null;
    optionsPerT.push(opts);
  }

  // Jitter for "another route": big enough to reshuffle which distinct station
  // is chosen, but capped below samePenalty/walk so it never turns a real ride
  // into a same-station transfer or a walk.
  const jitterScale = variant ? Math.min(w.samePenalty * 0.4, 1500) : 0;

  // Layered DP over candidate transfer stations, weighted by the strategy.
  let prevCost = optionsPerT[0].map((o, i) => o.walk * w.walk + jitter(variant * 131 + i) * jitterScale);
  const back: number[][] = [];
  for (let t = 1; t < k; t++) {
    const cur = optionsPerT[t];
    const prev = optionsPerT[t - 1];
    const curCost = new Array<number>(cur.length).fill(Infinity);
    const curBack = new Array<number>(cur.length).fill(-1);
    for (let i = 0; i < cur.length; i++) {
      const extra = jitter(variant * 131 + t * 17 + i * 7) * jitterScale;
      for (let j = 0; j < prev.length; j++) {
        const ride = haversineMeters(prev[j].depart.pos, cur[i].arrive.pos);
        let cost = prevCost[j] + ride * w.ride + cur[i].walk * w.walk + extra;
        if (ride < SAME_STATION_RIDE_M) cost += w.samePenalty; // force a real ride between transfers
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
  const chosen = new Array<number>(k);
  chosen[k - 1] = bestI;
  for (let t = k - 2; t >= 0; t--) chosen[t] = back[t][chosen[t + 1]];
  const opts = chosen.map((idx, t) => optionsPerT[t][idx]);

  const board = nearestOther(graph.complexesServingLine(lines[0]), opts[0].arrive) ?? opts[0].arrive;
  const end =
    nearestOther(graph.complexesServingLine(lines[k]), opts[k - 1].depart) ?? opts[k - 1].depart;

  const legs: ItineraryLeg[] = [];
  legs.push({
    kind: "ride",
    letter: lines[0],
    letters: runLetters[0],
    line: lines[0],
    from: point(board),
    to: point(opts[0].arrive),
  });
  for (let t = 0; t < k; t++) {
    const o = opts[t];
    if (o.walk > 0 && o.arrive.id !== o.depart.id) {
      legs.push({ kind: "walk", letter: null, letters: "", from: point(o.arrive), to: point(o.depart), meters: o.walk });
      if (o.walk > WALK_TRANSFER_METERS) {
        notes.push(
          `No direct transfer from ${lines[t]} to ${lines[t + 1]} — a ${Math.round(
            o.walk,
          )} m walk is required.`,
        );
      }
    }
    const to = t + 1 < k ? point(opts[t + 1].arrive) : point(end);
    legs.push({
      kind: "ride",
      letter: lines[t + 1],
      letters: runLetters[t + 1],
      line: lines[t + 1],
      from: point(o.depart),
      to,
    });
  }

  return { legs, boardPoint: point(board), endPoint: point(end), notes };
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

  const out: ItineraryLeg[] = [];
  let feasible = false;
  let prevEnd: NamedPoint | null = null;
  let pendingWalks: string[] = [];

  for (const seg of segments) {
    if (seg.type === "walk") {
      pendingWalks.push(...seg.legs.map((l) => l.letters));
      continue;
    }
    const run = solveTrainRun(seg.legs, graph, weights, variant);
    if (!run) {
      notes.push("Some lines in this word aren't in the data feed.");
      continue;
    }
    feasible = true;
    notes.push(...run.notes);

    if (pendingWalks.length > 0) {
      const anchorFrom = prevEnd ?? { name: "start", pos: offset(run.boardPoint.pos, -2) };
      out.push(...wildcardWalks(pendingWalks, anchorFrom, run.boardPoint));
      pendingWalks = [];
    }
    out.push(...run.legs);
    prevEnd = run.endPoint;
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
      lines.push(`🚶 Walk ${Math.round(leg.meters)} m to transfer`);
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
