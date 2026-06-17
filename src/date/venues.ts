// Turns "missing letter" walk legs into real NYC date spots (restaurants,
// cafes, bars) that start with that letter, found near where you are on the
// path. Live data from OpenStreetMap's Overpass API, with a curated fallback.
import type { LatLng } from "../types";
import type { DateSpot, FinderResult, ItineraryLeg } from "../spell/finder";
import { haversineMeters } from "../data/buildGraph";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const SEARCH_RADIUS_M = 1000;

/** Emoji for a venue category, for map markers / itinerary. */
export function categoryEmoji(category: string): string {
  switch (category) {
    case "café":
    case "cafe":
      return "☕";
    case "bar":
      return "🍸";
    case "park":
      return "🌳";
    case "landmark":
      return "🗽";
    default:
      return "📍";
  }
}

/** Map raw OSM tags into one of our buckets: bar / café / park / landmark. */
export function classify(tags: Record<string, string>): string {
  if (tags.leisure === "park") return "park";
  if (tags.tourism || tags.historic) return "landmark";
  if (tags.amenity === "cafe") return "café";
  if (tags.amenity === "bar" || tags.amenity === "pub") return "bar";
  return "landmark";
}

/** First alphabetic letter of a venue name, ignoring a leading "The ". */
function firstLetter(name: string): string {
  const cleaned = name.replace(/^(the|le|la|el)\s+/i, "").trim();
  return (cleaned[0] ?? "").toUpperCase();
}

interface OverpassElement {
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const cache = new Map<string, DateSpot | null>();

function cacheKey(letter: string, near: LatLng): string {
  return `${letter}:${near.lat.toFixed(3)}:${near.lng.toFixed(3)}`;
}

// Per-request budget so a slow/unreachable Overpass mirror falls back fast.
const REQUEST_TIMEOUT_MS = 7000;

async function fetchWithTimeout(endpoint: string, body: string, signal?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(endpoint, { method: "POST", body, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function queryOverpass(near: LatLng, signal?: AbortSignal): Promise<OverpassElement[]> {
  const a = `${SEARCH_RADIUS_M},${near.lat},${near.lng}`;
  const query = `[out:json][timeout:8];
(
  nwr["amenity"~"^(bar|pub|cafe)$"]["name"](around:${a});
  nwr["leisure"="park"]["name"](around:${a});
  nwr["tourism"~"^(attraction|museum|gallery|viewpoint|artwork)$"]["name"](around:${a});
  nwr["historic"~"^(monument|memorial|castle|ruins)$"]["name"](around:${a});
);
out center 120;`;
  const body = "data=" + encodeURIComponent(query);

  for (const endpoint of OVERPASS_ENDPOINTS) {
    if (signal?.aborted) throw new Error("aborted");
    try {
      const res = await fetchWithTimeout(endpoint, body, signal);
      if (!res.ok) continue;
      const json = (await res.json()) as { elements?: OverpassElement[] };
      if (json.elements?.length) return json.elements;
    } catch {
      if (signal?.aborted) throw new Error("aborted");
      // timed out or failed — try the next mirror
    }
  }
  return [];
}

/** Find the nearest real date spot starting with `letter` near `near`. */
export async function findDateSpot(
  letter: string,
  near: LatLng,
  signal?: AbortSignal,
): Promise<DateSpot | null> {
  const key = cacheKey(letter, near);
  if (cache.has(key)) return cache.get(key)!;

  let best: DateSpot | null = null;
  try {
    const elements = await queryOverpass(near, signal);
    let bestDist = Infinity;
    for (const el of elements) {
      const name = el.tags?.name;
      if (!name || firstLetter(name) !== letter.toUpperCase()) continue;
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (lat == null || lon == null) continue;
      const pos = { lat, lng: lon };
      const d = haversineMeters(near, pos);
      if (d < bestDist) {
        bestDist = d;
        best = { name, category: classify(el.tags ?? {}), pos };
      }
    }
  } catch {
    if (signal?.aborted) return null;
  }

  if (!best) best = fallbackSpot(letter, near);
  cache.set(key, best);
  return best;
}

// Curated real NYC bars / cafés / parks / landmarks, used when Overpass
// returns nothing for a letter.
const FALLBACK: Record<string, Omit<DateSpot, "pos"> & { pos: LatLng }> = {
  H: { name: "High Line", category: "park", pos: { lat: 40.748, lng: -74.0048 } },
  I: { name: "Irving Farm Coffee Roasters", category: "café", pos: { lat: 40.7345, lng: -73.9823 } },
  K: { name: "King Cole Bar", category: "bar", pos: { lat: 40.7615, lng: -73.9747 } },
  O: { name: "Old Town Bar", category: "bar", pos: { lat: 40.7376, lng: -73.9882 } },
  P: { name: "Paley Park", category: "park", pos: { lat: 40.7596, lng: -73.9742 } },
  T: { name: "Tompkins Square Park", category: "park", pos: { lat: 40.7268, lng: -73.9815 } },
  U: { name: "Union Square Park", category: "park", pos: { lat: 40.7359, lng: -73.9911 } },
  V: { name: "Vol de Nuit", category: "bar", pos: { lat: 40.7307, lng: -74.0006 } },
  X: { name: "Xocolatti", category: "café", pos: { lat: 40.7232, lng: -74.0006 } },
  Y: { name: "Yankee Stadium", category: "landmark", pos: { lat: 40.8296, lng: -73.9262 } },
};

function fallbackSpot(letter: string, near: LatLng): DateSpot | null {
  const f = FALLBACK[letter.toUpperCase()];
  if (f) return { name: f.name, category: f.category, pos: f.pos };
  // Last resort: a generic pin offset slightly from the anchor.
  return { name: `a ${letter}-spot`, category: "restaurant", pos: { lat: near.lat + 0.002, lng: near.lng + 0.002 } };
}

/**
 * Replace wildcard walk legs with walks to real date spots, chaining each from
 * the previous point so the itinerary flows. Returns a new FinderResult.
 */
export async function attachDateSpots(result: FinderResult, signal?: AbortSignal): Promise<FinderResult> {
  if (result.legs.length === 0) return result;
  let lastPos: LatLng = result.legs[0].from.pos;
  let lastName = result.legs[0].from.name;
  const out: ItineraryLeg[] = [];

  for (const leg of result.legs) {
    if (leg.kind === "ride") {
      out.push(leg);
      lastPos = leg.to.pos;
      lastName = leg.to.name;
      continue;
    }
    if (!leg.letter) {
      out.push(leg); // plain transfer walk
      lastPos = leg.to.pos;
      lastName = leg.to.name;
      continue;
    }
    const spot = await findDateSpot(leg.letter, lastPos, signal);
    if (spot) {
      out.push({
        ...leg,
        from: { name: lastName, pos: lastPos },
        to: { name: spot.name, pos: spot.pos },
        meters: haversineMeters(lastPos, spot.pos),
        venue: spot,
      });
      lastPos = spot.pos;
      lastName = spot.name;
    } else {
      out.push({ ...leg, from: { name: lastName, pos: lastPos } });
      lastPos = leg.to.pos;
      lastName = leg.to.name;
    }
  }

  return { ...result, legs: out };
}
