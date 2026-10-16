// Regression sweep: run every word in the app's word list through the finder
// against LIVE MTA data and check that each itinerary physically makes sense.
// Run with: npx vite-node scripts/check-routes.ts [strategy]
//
// Invariants checked per itinerary:
//   spell    — the legs spell the word exactly (when feasible)
//   connect  — consecutive legs share an endpoint (no teleports)
//   realride — every ride moves between distinct stations (>= 60 m)
//   online   — both ride endpoints are stations that serve the ridden line
//   transfer — back-to-back rides transfer at one complex serving both lines,
//              or via a walk leg <= 400 m (longer only with an explanatory note)
//   track    — both ride endpoints sit on ONE continuous piece of the line's
//              real geometry (catches e.g. "rides" between disconnected shuttles)
//   walkcap  — venue (wildcard) walks stay under 3 km
import { loadMtaData } from "../src/data/fetchMta";
import { SubwayGraph, WALK_TRANSFER_METERS, haversineMeters } from "../src/data/buildGraph";
import { findPath, type ItineraryLeg, type RouteStrategy } from "../src/spell/finder";
import { normalizeWord } from "../src/spell/letters";
import { WORDS } from "../src/data/words";
import type { Complex, LatLng } from "../src/types";

const strategy = (process.argv[2] ?? "scenic") as RouteStrategy;

const data = await loadMtaData();
const graph = new SubwayGraph(data.complexes);

const complexAt = new Map<string, Complex>();
for (const c of data.complexes) complexAt.set(`${c.pos.lat},${c.pos.lng}`, c);
const lookup = (pos: LatLng): Complex | undefined => complexAt.get(`${pos.lat},${pos.lng}`);

// Distance from a point to a polyline (planar projection, same as the map).
function distToPath(path: LatLng[], p: LatLng): number {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b.lng - a.lng;
    const dy = b.lat - a.lat;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const q = { lat: a.lat + t * dy, lng: a.lng + t * dx };
    best = Math.min(best, haversineMeters(q, p));
  }
  return best;
}

// Merge geometry rows per service (a service can span several data rows), and
// fold the three shuttles (Franklin SF / 42 St ST / Rockaway SR) into "S",
// which is how the stations dataset labels them.
const lineGeom = new Map<string, LatLng[][]>();
for (const l of data.lines) {
  let key = l.service.toUpperCase();
  if (key === "SF" || key === "ST" || key === "SR") key = "S";
  lineGeom.set(key, [...(lineGeom.get(key) ?? []), ...l.paths.filter((p) => p.length >= 2)]);
}

// Group each service's pieces into connected components: two pieces connect if
// an endpoint of one lies near the other (branches join the trunk mid-line).
const lineComponents = new Map<string, LatLng[][][]>();
function componentsFor(line: string): LatLng[][][] {
  const cached = lineComponents.get(line);
  if (cached) return cached;
  const pieces = lineGeom.get(line) ?? [];
  const parent = pieces.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const touches = (a: LatLng[], b: LatLng[]) =>
        distToPath(b, a[0]) < 300 || distToPath(b, a[a.length - 1]) < 300;
      if (touches(pieces[i], pieces[j]) || touches(pieces[j], pieces[i])) parent[find(i)] = find(j);
    }
  }
  const byRoot = new Map<number, LatLng[][]>();
  pieces.forEach((p, i) => {
    const r = find(i);
    byRoot.set(r, [...(byRoot.get(r) ?? []), p]);
  });
  const comps = [...byRoot.values()];
  lineComponents.set(line, comps);
  return comps;
}

/** Do both endpoints sit on one connected component of the line's geometry? */
const trackCache = new Map<string, boolean>();
function onOneTrack(line: string, from: LatLng, to: LatLng): boolean {
  const comps = componentsFor(line);
  if (comps.length === 0) return true; // no geometry to check against
  const key = `${line}:${from.lat},${from.lng}:${to.lat},${to.lng}`;
  const cached = trackCache.get(key);
  if (cached !== undefined) return cached;
  let ok = false;
  for (const comp of comps) {
    const near = (p: LatLng) => comp.some((piece) => distToPath(piece, p) < 1000);
    if (near(from) && near(to)) {
      ok = true;
      break;
    }
  }
  trackCache.set(key, ok);
  return ok;
}

const violations = new Map<string, string[]>();
function flag(kind: string, detail: string): void {
  const list = violations.get(kind) ?? [];
  list.push(detail);
  violations.set(kind, list);
}

let checked = 0;
let feasibleCount = 0;
for (const word of WORDS) {
  const upper = normalizeWord(word);
  if (upper.length < 2) continue;
  const result = findPath(word, graph, { strategy });
  checked++;
  if (!result.feasible) continue;
  feasibleCount++;
  const legs = result.legs;

  const spelled = legs.map((l) => l.letters).join("");
  if (spelled !== upper) flag("spell", `${upper}: spells "${spelled}"`);

  for (let i = 1; i < legs.length; i++) {
    if (haversineMeters(legs[i - 1].to.pos, legs[i].from.pos) > 5) {
      flag("connect", `${upper}: gap before leg ${i} (${legs[i - 1].to.name} -> ${legs[i].from.name})`);
    }
  }

  let prevRide: (ItineraryLeg & { kind: "ride" }) | null = null;
  let walkBetween: number | null = null; // meters walked since the last ride
  for (const leg of legs) {
    if (leg.kind === "walk") {
      if (leg.letter) {
        // Venue walk: breaks the ride->ride transfer chain. The cap sits just
        // above the worst genuine minimum (~3.9 km for J→shuttle words like
        // JOSE — the J and the 42 St shuttle never come closer than that).
        if (leg.meters > 4000) flag("walkcap", `${upper}: ${Math.round(leg.meters)} m venue walk for ${leg.letters}`);
        prevRide = null;
        walkBetween = null;
      } else {
        walkBetween = (walkBetween ?? 0) + leg.meters;
      }
      continue;
    }

    const ride = haversineMeters(leg.from.pos, leg.to.pos);
    if (ride < 60) flag("realride", `${upper}: ${leg.line} ride ${leg.from.name} -> ${leg.to.name} is ${Math.round(ride)} m`);

    const fromC = lookup(leg.from.pos);
    const toC = lookup(leg.to.pos);
    if (!fromC?.routes.includes(leg.line) || !toC?.routes.includes(leg.line)) {
      flag("online", `${upper}: ${leg.line} ride ${leg.from.name} -> ${leg.to.name} touches a station not on the ${leg.line}`);
    }

    if (!onOneTrack(leg.line, leg.from.pos, leg.to.pos)) {
      flag("track", `${upper}: ${leg.line} ride ${leg.from.name} -> ${leg.to.name} spans disconnected track`);
    }

    if (prevRide) {
      if (walkBetween == null) {
        const at = lookup(leg.from.pos);
        if (!at || !at.routes.includes(prevRide.line) || !at.routes.includes(leg.line)) {
          flag("transfer", `${upper}: ${prevRide.line} -> ${leg.line} in-place transfer at ${leg.from.name} lacks both lines`);
        }
      } else if (walkBetween > WALK_TRANSFER_METERS) {
        const noted = result.notes.some((n) => n.includes(`from ${prevRide!.line} to ${leg.line}`));
        if (!noted) {
          flag("transfer", `${upper}: unnoted ${Math.round(walkBetween)} m transfer walk ${prevRide.line} -> ${leg.line}`);
        }
      }
    }
    prevRide = leg;
    walkBetween = null;
  }
}

console.log(`\nChecked ${checked} words (strategy: ${strategy}); ${feasibleCount} feasible.`);
if (violations.size === 0) {
  console.log("All invariants hold. ✓");
} else {
  for (const [kind, list] of violations) {
    console.log(`\n${kind}: ${list.length} violation(s)`);
    for (const v of list.slice(0, 8)) console.log(`  - ${v}`);
    if (list.length > 8) console.log(`  … and ${list.length - 8} more`);
  }
  process.exitCode = 1;
}
