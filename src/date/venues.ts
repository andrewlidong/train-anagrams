// Turns "missing letter" walk legs into real NYC date spots (restaurants,
// cafes, bars) that start with that letter, found near where you are on the
// path. Live data from OpenStreetMap's Overpass API, with a curated fallback.
import type { LatLng } from "../types";
import type { DateSpot, FinderResult, ItineraryLeg, NamedPoint } from "../spell/finder";
import { haversineMeters } from "../data/buildGraph";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

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

function midpoint(a: LatLng, b: LatLng): LatLng {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}

interface OverpassElement {
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const cache = new Map<string, DateSpot | null>();

function cacheKey(letter: string, near: LatLng, next: LatLng | null): string {
  const n = next ? `:${next.lat.toFixed(3)}:${next.lng.toFixed(3)}` : "";
  return `${letter}:${near.lat.toFixed(3)}:${near.lng.toFixed(3)}${n}`;
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

async function queryOverpass(center: LatLng, radius: number, signal?: AbortSignal): Promise<OverpassElement[]> {
  const a = `${Math.round(radius)},${center.lat},${center.lng}`;
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

/**
 * Pick the venue that adds the least walking: minimize the walk from `near`
 * to the venue plus the onward walk to `next` (the station you must reach
 * afterwards), so the detour never doubles back. With no `next` this is just
 * nearest-to-`near`.
 */
export function pickVenue(candidates: DateSpot[], near: LatLng, next: LatLng | null): DateSpot | null {
  const target = next ?? near;
  let best: DateSpot | null = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    const score = haversineMeters(near, c.pos) + haversineMeters(c.pos, target);
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** Find a real date spot starting with `letter` on the way from `near` to `next`. */
export async function findDateSpot(
  letter: string,
  near: LatLng,
  next: LatLng | null = null,
  signal?: AbortSignal,
): Promise<DateSpot | null> {
  const key = cacheKey(letter, near, next);
  if (cache.has(key)) return cache.get(key)!;

  const target = next ?? near;
  const gap = haversineMeters(near, target);
  // Search around the midpoint of the walk, wide enough to cover both ends.
  const center = midpoint(near, target);
  const radius = Math.min(1200, Math.max(600, gap / 2 + 300));

  let best: DateSpot | null = null;
  try {
    const elements = await queryOverpass(center, radius, signal);
    const candidates: DateSpot[] = [];
    for (const el of elements) {
      const name = el.tags?.name;
      if (!name || firstLetter(name) !== letter.toUpperCase()) continue;
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (lat == null || lon == null) continue;
      candidates.push({ name, category: classify(el.tags ?? {}), pos: { lat, lng: lon } });
    }
    best = pickVenue(candidates, near, next);
  } catch {
    if (signal?.aborted) return null;
  }

  if (!best) best = fallbackSpot(letter, near, next);
  cache.set(key, best);
  return best;
}

// Curated real NYC bars / cafés / parks / landmarks across boroughs, used when
// Overpass returns nothing for a letter. The nearest-to-the-path one wins.
export const FALLBACK: Record<string, DateSpot[]> = {
  H: [
    { name: "High Line", category: "park", pos: { lat: 40.748, lng: -74.0048 } },
    { name: "Herbert Von King Park", category: "park", pos: { lat: 40.69, lng: -73.9463 } },
    { name: "Hunters Point South Park", category: "park", pos: { lat: 40.7424, lng: -73.9582 } },
  ],
  I: [
    { name: "Irving Farm Coffee Roasters", category: "café", pos: { lat: 40.7345, lng: -73.9823 } },
    { name: "Industry City", category: "landmark", pos: { lat: 40.6558, lng: -74.0091 } },
    { name: "Isamu Noguchi Museum", category: "landmark", pos: { lat: 40.7668, lng: -73.9376 } },
  ],
  K: [
    { name: "King Cole Bar", category: "bar", pos: { lat: 40.7615, lng: -73.9747 } },
    { name: "Kings Theatre", category: "landmark", pos: { lat: 40.6465, lng: -73.9576 } },
    { name: "Knockdown Center", category: "landmark", pos: { lat: 40.7166, lng: -73.9124 } },
  ],
  O: [
    { name: "Old Town Bar", category: "bar", pos: { lat: 40.7376, lng: -73.9882 } },
    { name: "Oculus", category: "landmark", pos: { lat: 40.7115, lng: -74.0113 } },
    { name: "Owl's Head Park", category: "park", pos: { lat: 40.6395, lng: -74.0326 } },
  ],
  P: [
    { name: "Paley Park", category: "park", pos: { lat: 40.7596, lng: -73.9742 } },
    { name: "Prospect Park", category: "park", pos: { lat: 40.6602, lng: -73.969 } },
    { name: "Pulaski Bridge", category: "landmark", pos: { lat: 40.7396, lng: -73.9532 } },
  ],
  T: [
    { name: "Tompkins Square Park", category: "park", pos: { lat: 40.7268, lng: -73.9815 } },
    { name: "Transmitter Park", category: "park", pos: { lat: 40.729, lng: -73.9585 } },
    { name: "Trinity Church", category: "landmark", pos: { lat: 40.7081, lng: -74.012 } },
  ],
  U: [
    { name: "Union Square Park", category: "park", pos: { lat: 40.7359, lng: -73.9911 } },
    { name: "Unisphere", category: "landmark", pos: { lat: 40.7461, lng: -73.8448 } },
  ],
  V: [
    { name: "Vol de Nuit", category: "bar", pos: { lat: 40.7307, lng: -74.0006 } },
    { name: "Variety Coffee Roasters", category: "café", pos: { lat: 40.7141, lng: -73.9444 } },
    { name: "Vessel", category: "landmark", pos: { lat: 40.7538, lng: -74.0022 } },
  ],
  X: [
    { name: "Xocolatti", category: "café", pos: { lat: 40.7232, lng: -74.0006 } },
    { name: "Xi'an Famous Foods", category: "restaurant", pos: { lat: 40.7597, lng: -73.8283 } },
  ],
  Y: [
    { name: "Yankee Stadium", category: "landmark", pos: { lat: 40.8296, lng: -73.9262 } },
    { name: "Yemen Café", category: "restaurant", pos: { lat: 40.6902, lng: -73.9953 } },
  ],
};

/** A fallback venue may add at most this much walking over the direct path. */
const MAX_FALLBACK_DETOUR_M = 1500;

function fallbackSpot(letter: string, near: LatLng, next: LatLng | null): DateSpot {
  const target = next ?? near;
  const best = pickVenue(FALLBACK[letter.toUpperCase()] ?? [], near, next);
  if (best) {
    const detour =
      haversineMeters(near, best.pos) + haversineMeters(best.pos, target) - haversineMeters(near, target);
    if (detour <= MAX_FALLBACK_DETOUR_M) return { ...best };
  }
  // Last resort: a generic pin just off the direct path — never a cross-town hike.
  const mid = midpoint(near, target);
  return { name: `a ${letter}-spot`, category: "restaurant", pos: { lat: mid.lat + 0.002, lng: mid.lng + 0.002 } };
}

/**
 * Replace wildcard walk legs with walks to real date spots, chaining each from
 * the previous point so the itinerary flows. Any gap left between a venue and
 * the next station becomes an explicit connector walk leg, so every meter the
 * user walks is shown and counted. Returns a new FinderResult.
 */
export async function attachDateSpots(result: FinderResult, signal?: AbortSignal): Promise<FinderResult> {
  if (result.legs.length === 0) return result;

  // For each leg, the next fixed point the user must reach afterwards (a
  // station — venues move, stations don't), so detours head toward it.
  const nextFixed: (LatLng | null)[] = new Array(result.legs.length).fill(null);
  let upcoming: LatLng | null = null;
  for (let i = result.legs.length - 1; i >= 0; i--) {
    nextFixed[i] = upcoming;
    const leg = result.legs[i];
    if (leg.kind === "ride" || !leg.letter) upcoming = leg.from.pos;
  }

  let lastPos: LatLng = result.legs[0].from.pos;
  let lastName = result.legs[0].from.name;
  const out: ItineraryLeg[] = [];

  const connect = (to: NamedPoint) => {
    const meters = haversineMeters(lastPos, to.pos);
    if (meters > 30) {
      out.push({ kind: "walk", letter: null, letters: "", from: { name: lastName, pos: lastPos }, to, meters });
    }
  };

  for (let i = 0; i < result.legs.length; i++) {
    const leg = result.legs[i];
    if (leg.kind === "ride" || !leg.letter) {
      connect(leg.from); // walk back from a venue to the station — no teleports
      out.push(leg);
      lastPos = leg.to.pos;
      lastName = leg.to.name;
      continue;
    }
    const spot = await findDateSpot(leg.letter, lastPos, nextFixed[i], signal);
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
