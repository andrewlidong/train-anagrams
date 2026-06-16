// Builds the line-transfer graph from station/complex data. This is what lets
// us decide whether you can transfer from one lettered train to the next.
import type { Complex, LatLng, Station } from "../types";

/** Max walking distance (meters) treated as an out-of-system transfer. */
export const WALK_TRANSFER_METERS = 400;

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance between two points, in meters. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Group station records into complexes by `complexId`. */
export function buildComplexes(stations: Station[]): Complex[] {
  const groups = new Map<string, Station[]>();
  for (const s of stations) {
    const list = groups.get(s.complexId);
    if (list) list.push(s);
    else groups.set(s.complexId, [s]);
  }

  const complexes: Complex[] = [];
  for (const [id, members] of groups) {
    const routes = new Set<string>();
    let lat = 0;
    let lng = 0;
    const names = new Set<string>();
    for (const m of members) {
      m.routes.forEach((r) => routes.add(r));
      lat += m.pos.lat;
      lng += m.pos.lng;
      names.add(m.name);
    }
    complexes.push({
      id,
      name: [...names].join(" / "),
      routes: [...routes].sort(),
      pos: { lat: lat / members.length, lng: lng / members.length },
    });
  }
  return complexes;
}

export interface WalkingTransfer {
  a: Complex;
  b: Complex;
  meters: number;
}

/**
 * Indexed view over complexes that answers transfer questions between lines.
 */
export class SubwayGraph {
  readonly complexes: Complex[];
  private byLine = new Map<string, Complex[]>();
  /** Lines reachable from a line (in-system or walking). */
  private adjacency = new Map<string, Set<string>>();

  constructor(complexes: Complex[]) {
    this.complexes = complexes;
    for (const c of complexes) {
      for (const line of c.routes) {
        const list = this.byLine.get(line);
        if (list) list.push(c);
        else this.byLine.set(line, [c]);
      }
    }
    this.buildAdjacency();
  }

  private buildAdjacency(): void {
    const add = (from: string, to: string) => {
      let set = this.adjacency.get(from);
      if (!set) {
        set = new Set();
        this.adjacency.set(from, set);
      }
      set.add(to);
    };

    // In-system: any two lines sharing a complex.
    for (const c of this.complexes) {
      for (const a of c.routes) {
        for (const b of c.routes) {
          if (a !== b) add(a, b);
        }
      }
    }

    // Out-of-system walking transfers between nearby complexes.
    for (let i = 0; i < this.complexes.length; i++) {
      for (let j = i + 1; j < this.complexes.length; j++) {
        const ci = this.complexes[i];
        const cj = this.complexes[j];
        if (haversineMeters(ci.pos, cj.pos) > WALK_TRANSFER_METERS) continue;
        for (const a of ci.routes) {
          for (const b of cj.routes) {
            if (a !== b) {
              add(a, b);
              add(b, a);
            }
          }
        }
      }
    }
  }

  lines(): string[] {
    return [...this.byLine.keys()].sort();
  }

  complexesServingLine(line: string): Complex[] {
    return this.byLine.get(line) ?? [];
  }

  /** Lines you can transfer to directly from `line`. */
  nextLines(line: string): string[] {
    return [...(this.adjacency.get(line) ?? [])].sort();
  }

  /** True if a direct (in-system or walking) transfer exists between the lines. */
  connected(a: string, b: string): boolean {
    return this.adjacency.get(a)?.has(b) ?? false;
  }

  /** Complexes that serve BOTH lines (in-system transfer points). */
  inSystemTransfers(a: string, b: string): Complex[] {
    return this.complexesServingLine(a).filter((c) => c.routes.includes(b));
  }

  /** Nearby complex pairs allowing a walking transfer between the lines. */
  walkingTransfers(a: string, b: string): WalkingTransfer[] {
    const out: WalkingTransfer[] = [];
    const aComplexes = this.complexesServingLine(a);
    const bComplexes = this.complexesServingLine(b);
    for (const ca of aComplexes) {
      for (const cb of bComplexes) {
        if (ca.id === cb.id) continue;
        const meters = haversineMeters(ca.pos, cb.pos);
        if (meters <= WALK_TRANSFER_METERS) out.push({ a: ca, b: cb, meters });
      }
    }
    return out.sort((x, y) => x.meters - y.meters);
  }
}
