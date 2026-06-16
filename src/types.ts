// Shared domain types for the Subway Spell app.

/** A geographic point (WGS84). */
export interface LatLng {
  lat: number;
  lng: number;
}

/** A single station record after parsing the MTA stations feed. */
export interface Station {
  stopId: string;
  name: string;
  complexId: string;
  borough: string;
  routes: string[];
  pos: LatLng;
}

/**
 * A station complex: one or more physically-connected stations grouped by
 * `complex_id`. Transfers between lines happen within a complex.
 */
export interface Complex {
  id: string;
  name: string;
  /** Union of all routes served by the complex's member stations. */
  routes: string[];
  /** Centroid of the member stations. */
  pos: LatLng;
}

/** Geometry for one subway service line, used to draw the map. */
export interface LineGeometry {
  service: string; // route id, e.g. "A", "1"
  name: string;
  /** Array of polylines (each an array of [lat, lng]). */
  paths: LatLng[][];
}

/** Parsed, ready-to-use MTA data. */
export interface MtaData {
  stations: Station[];
  complexes: Complex[];
  lines: LineGeometry[];
}
