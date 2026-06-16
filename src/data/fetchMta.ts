// Fetches NYC subway data live from the NY State open-data (Socrata) API and
// caches it in localStorage. Two datasets are used:
//   - Stations / routes / transfers: 39hk-dx4f
//   - Subway service line geometry:   s692-irgq
import type { LatLng, LineGeometry, MtaData, Station } from "../types";
import { buildComplexes } from "./buildGraph";

const STATIONS_URL =
  "https://data.ny.gov/resource/39hk-dx4f.json?$limit=2000";
const LINES_URL = "https://data.ny.gov/resource/s692-irgq.json?$limit=2000";

const CACHE_KEY = "subway-spell:mta-data:v1";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

interface StationRaw {
  gtfs_stop_id?: string;
  stop_name?: string;
  complex_id?: string;
  borough?: string;
  daytime_routes?: string;
  gtfs_latitude?: string;
  gtfs_longitude?: string;
}

interface GeoJsonGeometry {
  type: "MultiLineString" | "LineString";
  coordinates: number[][] | number[][][];
}

interface LineRaw {
  service?: string;
  service_name?: string;
  geometry?: GeoJsonGeometry;
}

interface CacheEnvelope {
  ts: number;
  stations: Station[];
  lines: LineGeometry[];
}

function parseRoutes(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .trim()
    .split(/[\s,]+/)
    .map((r) => r.toUpperCase())
    .filter(Boolean);
}

function parseStations(rows: StationRaw[]): Station[] {
  const out: Station[] = [];
  for (const r of rows) {
    const lat = Number(r.gtfs_latitude);
    const lng = Number(r.gtfs_longitude);
    if (!r.stop_name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({
      stopId: r.gtfs_stop_id ?? `${r.stop_name}-${lat}`,
      name: r.stop_name,
      complexId: r.complex_id || r.gtfs_stop_id || r.stop_name,
      borough: r.borough ?? "",
      routes: parseRoutes(r.daytime_routes),
      pos: { lat, lng },
    });
  }
  return out;
}

function toPaths(geometry: GeoJsonGeometry | undefined): LatLng[][] {
  if (!geometry) return [];
  const toLatLng = (pair: number[]): LatLng => ({ lat: pair[1], lng: pair[0] });
  if (geometry.type === "LineString") {
    return [(geometry.coordinates as number[][]).map(toLatLng)];
  }
  return (geometry.coordinates as number[][][]).map((line) => line.map(toLatLng));
}

function parseLines(rows: LineRaw[]): LineGeometry[] {
  const out: LineGeometry[] = [];
  for (const r of rows) {
    const paths = toPaths(r.geometry);
    if (!r.service || paths.length === 0) continue;
    out.push({
      service: String(r.service).toUpperCase(),
      name: r.service_name ?? String(r.service),
      paths,
    });
  }
  return out;
}

function readCache(): CacheEnvelope | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope;
    if (!parsed.ts || Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    if (!parsed.stations?.length || !parsed.lines?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(stations: Station[], lines: LineGeometry[]): void {
  try {
    const envelope: CacheEnvelope = { ts: Date.now(), stations, lines };
    localStorage.setItem(CACHE_KEY, JSON.stringify(envelope));
  } catch {
    // Storage full or unavailable — non-fatal, we just refetch next time.
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status}) for ${url}`);
  return (await res.json()) as T;
}

/**
 * Load all MTA data: from cache if fresh, otherwise from the live feeds.
 * Returns parsed stations, derived complexes, and line geometry.
 */
export async function loadMtaData(): Promise<MtaData> {
  const cached = readCache();
  if (cached) {
    return {
      stations: cached.stations,
      complexes: buildComplexes(cached.stations),
      lines: cached.lines,
    };
  }

  const [stationRows, lineRows] = await Promise.all([
    fetchJson<StationRaw[]>(STATIONS_URL),
    fetchJson<LineRaw[]>(LINES_URL),
  ]);

  const stations = parseStations(stationRows);
  const lines = parseLines(lineRows);
  if (stations.length === 0) throw new Error("No subway stations returned.");

  writeCache(stations, lines);
  return { stations, complexes: buildComplexes(stations), lines };
}
