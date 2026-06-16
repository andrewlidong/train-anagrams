// Helpers to make the highlighted path follow the real track geometry. Each
// ride leg is projected onto the line's actual polyline (perpendicular to the
// nearest segment) and the polyline is sliced between those two projections.
import type { LatLng, LineGeometry } from "../types";
import { haversineMeters } from "../data/buildGraph";

/** Lookup from a service id (e.g. "A") to its polyline segments. */
export type LineIndex = Map<string, LatLng[][]>;

export function buildLineIndex(lines: LineGeometry[]): LineIndex {
  const index: LineIndex = new Map();
  for (const line of lines) index.set(line.service.toUpperCase(), line.paths);
  return index;
}

interface Projection {
  arc: number; // distance along the polyline to the projected point
  dist: number; // distance from the query point to the polyline
  point: LatLng;
}

/** Closest point on segment [a,b] to p (planar approx in lat/lng). */
function closestOnSegment(a: LatLng, b: LatLng, p: LatLng): { t: number; point: LatLng } {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { t, point: { lat: a.lat + t * dy, lng: a.lng + t * dx } };
}

function cumulative(path: LatLng[]): number[] {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversineMeters(path[i - 1], path[i]));
  return cum;
}

function project(path: LatLng[], cum: number[], p: LatLng): Projection {
  let best: Projection = { arc: 0, dist: Infinity, point: path[0] };
  for (let i = 0; i < path.length - 1; i++) {
    const seg = closestOnSegment(path[i], path[i + 1], p);
    const d = haversineMeters(seg.point, p);
    if (d < best.dist) {
      best = { arc: cum[i] + seg.t * (cum[i + 1] - cum[i]), dist: d, point: seg.point };
    }
  }
  return best;
}

// If a station projects farther than this from a line's geometry, the geometry
// doesn't match — fall back to a straight connector.
const MATCH_THRESHOLD_M = 3000;

/**
 * Returns the run of points along a line's real geometry between two stations,
 * following the track exactly between the two projected positions.
 */
export function traceLine(
  index: LineIndex,
  service: string,
  from: LatLng,
  to: LatLng,
): LatLng[] {
  const paths = index.get(service.toUpperCase());
  if (!paths || paths.length === 0) return [from, to];

  let best: { path: LatLng[]; cum: number[]; f: Projection; t: Projection; score: number } | null = null;
  for (const path of paths) {
    if (path.length < 2) continue;
    const cum = cumulative(path);
    const f = project(path, cum, from);
    const t = project(path, cum, to);
    const score = f.dist + t.dist;
    if (!best || score < best.score) best = { path, cum, f, t, score };
  }
  if (!best || best.score > MATCH_THRESHOLD_M) return [from, to];

  const { path, cum, f, t } = best;
  const lo = Math.min(f.arc, t.arc);
  const hi = Math.max(f.arc, t.arc);
  const between = path.filter((_, i) => cum[i] > lo && cum[i] < hi);
  const ascending = f.arc <= t.arc;
  const mid = ascending ? between : between.reverse();
  return [from, f.point, ...mid, t.point, to];
}
