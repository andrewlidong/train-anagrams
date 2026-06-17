// Resolves real on-street walking geometry for walk legs via the public OSRM
// foot router, with a per-request timeout and a straight-line fallback.
import type { LatLng } from "../types";
import type { FinderResult, ItineraryLeg } from "../spell/finder";
import { haversineMeters } from "./buildGraph";

const OSRM = "https://router.project-osrm.org/route/v1/foot/";
const TIMEOUT_MS = 6000;

const cache = new Map<string, LatLng[] | null>();

function key(from: LatLng, to: LatLng): string {
  return `${from.lat.toFixed(4)},${from.lng.toFixed(4)};${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
}

async function footRoute(from: LatLng, to: LatLng, signal?: AbortSignal): Promise<LatLng[] | null> {
  const k = key(from, to);
  if (cache.has(k)) return cache.get(k)!;

  const url = `${OSRM}${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      cache.set(k, null);
      return null;
    }
    const json = (await res.json()) as { routes?: { geometry?: { coordinates?: number[][] } }[] };
    const coords = json.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      cache.set(k, null);
      return null;
    }
    const path = coords.map((c) => ({ lat: c[1], lng: c[0] }));
    cache.set(k, path);
    return path;
  } catch {
    return null; // timed out / offline — caller falls back to a straight line
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Attach real on-street geometry to each walk leg (sequential, gentle on OSRM). */
export async function attachWalkingPaths(result: FinderResult, signal?: AbortSignal): Promise<FinderResult> {
  const hasWalks = result.legs.some((l) => l.kind === "walk" && l.meters > 30);
  if (!hasWalks) return result;

  const legs: ItineraryLeg[] = [];
  for (const leg of result.legs) {
    if (leg.kind === "walk" && leg.meters > 30 && haversineMeters(leg.from.pos, leg.to.pos) > 30) {
      const path = await footRoute(leg.from.pos, leg.to.pos, signal);
      legs.push(path ? { ...leg, path } : leg);
    } else {
      legs.push(leg);
    }
  }
  return { ...result, legs };
}
