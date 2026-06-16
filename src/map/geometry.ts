// Helpers to make the highlighted path follow the real track geometry instead
// of drawing straight lines between transfer stations.
import type { LatLng, LineGeometry } from "../types";
import { haversineMeters } from "../data/buildGraph";

/** Lookup from a service id (e.g. "A") to its polyline segments. */
export type LineIndex = Map<string, LatLng[][]>;

export function buildLineIndex(lines: LineGeometry[]): LineIndex {
  const index: LineIndex = new Map();
  for (const line of lines) index.set(line.service.toUpperCase(), line.paths);
  return index;
}

function nearestVertex(path: LatLng[], p: LatLng): { idx: number; dist: number } {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = haversineMeters(path[i], p);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return { idx: bestIdx, dist: bestDist };
}

// If the nearest geometry vertex is farther than this from a station, the
// geometry doesn't really match — fall back to a straight line.
const MATCH_THRESHOLD_M = 1500;

/**
 * Returns the run of points along a line's real geometry between two stations.
 * Picks the polyline segment closest to both endpoints, slices it between the
 * nearest vertices, and pins the exact station coordinates at the ends.
 */
export function traceLine(
  index: LineIndex,
  service: string,
  from: LatLng,
  to: LatLng,
): LatLng[] {
  const paths = index.get(service.toUpperCase());
  if (!paths || paths.length === 0) return [from, to];

  let best: { path: LatLng[]; fi: number; ti: number; score: number } | null = null;
  for (const path of paths) {
    if (path.length < 2) continue;
    const f = nearestVertex(path, from);
    const t = nearestVertex(path, to);
    const score = f.dist + t.dist;
    if (!best || score < best.score) best = { path, fi: f.idx, ti: t.idx, score };
  }
  if (!best || best.score > MATCH_THRESHOLD_M * 2) return [from, to];

  const lo = Math.min(best.fi, best.ti);
  const hi = Math.max(best.fi, best.ti);
  let slice = best.path.slice(lo, hi + 1);
  if (best.fi > best.ti) slice = slice.reverse();
  return [from, ...slice, to];
}
