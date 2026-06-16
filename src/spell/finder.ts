// Finder mode: given a word, build a real, ridable subway path whose line
// letters spell it. Train legs are optimized with a layered shortest-path over
// candidate transfer points; missing letters become walking-wildcard legs.
import type { Complex, LatLng } from "../types";
import { SubwayGraph, WALK_TRANSFER_METERS, haversineMeters } from "../data/buildGraph";
import { normalizeWord, wordToLegs, missingLetters, type WordLeg } from "./letters";

export interface NamedPoint {
  name: string;
  pos: LatLng;
}

export interface RideLeg {
  kind: "ride";
  letter: string;
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
  from: NamedPoint;
  to: NamedPoint;
  meters: number;
  /** The date spot this walk leads to (resolved asynchronously after finding). */
  venue?: DateSpot;
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

/** Solve a maximal run of consecutive train lines into an itinerary. */
function solveTrainRun(lines: string[], graph: SubwayGraph): RunResult | null {
  if (lines.some((l) => graph.complexesServingLine(l).length === 0)) return null;
  const notes: string[] = [];

  if (lines.length === 1) {
    const cs = graph.complexesServingLine(lines[0]);
    const board = cs[0];
    const end = nearestOther(cs, board) ?? board;
    return {
      legs: [{ kind: "ride", letter: lines[0], line: lines[0], from: point(board), to: point(end) }],
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

  // Layered DP: minimize total ride + walk distance.
  let prevCost = optionsPerT[0].map((o) => o.walk);
  const back: number[][] = [];
  for (let t = 1; t < k; t++) {
    const cur = optionsPerT[t];
    const prev = optionsPerT[t - 1];
    const curCost = new Array<number>(cur.length).fill(Infinity);
    const curBack = new Array<number>(cur.length).fill(-1);
    for (let i = 0; i < cur.length; i++) {
      for (let j = 0; j < prev.length; j++) {
        const ride = haversineMeters(prev[j].depart.pos, cur[i].arrive.pos);
        const cost = prevCost[j] + ride + cur[i].walk;
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
  legs.push({ kind: "ride", letter: lines[0], line: lines[0], from: point(board), to: point(opts[0].arrive) });
  for (let t = 0; t < k; t++) {
    const o = opts[t];
    if (o.walk > 0 && o.arrive.id !== o.depart.id) {
      legs.push({ kind: "walk", letter: null, from: point(o.arrive), to: point(o.depart), meters: o.walk });
      if (o.walk > WALK_TRANSFER_METERS) {
        notes.push(
          `No direct transfer from ${lines[t]} to ${lines[t + 1]} — a ${Math.round(
            o.walk,
          )} m walk is required.`,
        );
      }
    }
    const to = t + 1 < k ? point(opts[t + 1].arrive) : point(end);
    legs.push({ kind: "ride", letter: lines[t + 1], line: lines[t + 1], from: point(o.depart), to });
  }

  return { legs, boardPoint: point(board), endPoint: point(end), notes };
}

function lerp(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

function offset(p: LatLng, i: number): LatLng {
  return { lat: p.lat + 0.0016 * (i + 1), lng: p.lng + 0.0016 * (i + 1) };
}

/** Build walk legs for a stretch of missing letters between two anchor points. */
function wildcardWalks(letters: string[], from: NamedPoint, to: NamedPoint): WalkLeg[] {
  const legs: WalkLeg[] = [];
  const n = letters.length;
  let prev = from.pos;
  let prevName = from.name;
  for (let i = 0; i < n; i++) {
    const frac = (i + 1) / (n + 1);
    const pos = lerp(from.pos, to.pos, frac);
    const isLast = i === n - 1;
    const next = isLast ? to.pos : pos;
    const nextName = isLast ? to.name : `walk (${letters[i]})`;
    legs.push({
      kind: "walk",
      letter: letters[i],
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
export function findPath(word: string, graph: SubwayGraph): FinderResult {
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
      pendingWalks.push(...seg.legs.map((l) => l.letter));
      continue;
    }
    const run = solveTrainRun(seg.legs.map((l) => l.line!), graph);
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
      `No train for ${missing.join(", ")} — we'll walk you to date spots starting with ${
        missing.length > 1 ? "those letters" : "that letter"
      }.`,
    );
  }

  return { word, upper, legs: out, missingLetters: missing, feasible, notes };
}
