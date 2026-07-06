import { describe, it, expect } from "vitest";
import { buildComplexes, haversineMeters, SubwayGraph } from "../data/buildGraph";
import type { Station } from "../types";
import { findPath, itineraryText, tripStats } from "./finder";

function station(name: string, complexId: string, routes: string[], lat: number, lng: number): Station {
  return { stopId: name, name, complexId, borough: "M", routes, pos: { lat, lng } };
}

// A tiny network where F-A, A-C, C-E all share transfer complexes, so "FACE"
// is fully ridable. Extra single-line stations give board/end points. The G
// line has a far-away station listed FIRST so any arbitrary "first station"
// board choice is observable, and the D stations sit near the main cluster so
// words like "DOG" need a wildcard walk between the D and G rides.
const complexes = buildComplexes([
  station("F end", "f0", ["F"], 40.700, -74.00),
  station("F/A", "fa", ["F", "A"], 40.710, -74.00),
  station("A/C", "ac", ["A", "C"], 40.720, -74.00),
  station("C/E", "ce", ["C", "E"], 40.730, -74.00),
  station("E end", "e0", ["E"], 40.740, -74.00),
  station("G far", "g1", ["G"], 40.800, -73.95),
  station("G near", "g2", ["G"], 40.712, -74.001),
  station("D a", "d1", ["D"], 40.700, -74.002),
  station("D b", "d2", ["D"], 40.706, -74.001),
]);
const graph = new SubwayGraph(complexes);

function walkMeters(result: ReturnType<typeof findPath>): number {
  return result.legs.filter((l) => l.kind === "walk").reduce((m, l) => m + (l as { meters: number }).meters, 0);
}

describe("findPath", () => {
  it("builds a feasible ride spelling a fully-lettered word", () => {
    const result = findPath("FACE", graph);
    expect(result.feasible).toBe(true);
    const rides = result.legs.filter((l) => l.kind === "ride");
    expect(rides.map((l) => (l as { line: string }).line)).toEqual(["F", "A", "C", "E"]);
  });

  it("represents missing letters as walking wildcard legs", () => {
    const result = findPath("FOX", graph);
    expect(result.missingLetters).toEqual(["O", "X"]);
    const walkLetters = result.legs
      .filter((l) => l.kind === "walk" && l.letter)
      .map((l) => (l as { letter: string }).letter);
    expect(walkLetters).toEqual(["O", "X"]);
  });

  it("handles a single-letter word", () => {
    const result = findPath("A", graph);
    expect(result.feasible).toBe(true);
    expect(result.legs.filter((l) => l.kind === "ride")).toHaveLength(1);
  });

  it("preserves doubled letters in the leg run", () => {
    // FACEE: the final E is doubled and should ride E once but spell "EE".
    const result = findPath("FACEE", graph);
    const eLeg = result.legs.find((l) => l.kind === "ride" && l.line === "E");
    expect((eLeg as { letters: string }).letters).toBe("EE");
    const spelled = result.legs
      .filter((l) => l.letters)
      .map((l) => l.letters)
      .join("");
    expect(spelled).toBe("FACEE");
  });

  it("reports trip stats", () => {
    const stats = tripStats(findPath("FACE", graph).legs);
    expect(stats.trains).toBe(4);
    expect(stats.transfers).toBe(3);
    expect(stats.stations).toBeGreaterThan(1);
    expect(stats.minutes).toBeGreaterThanOrEqual(0);
  });

  it("accepts routing strategy + variant options and stays feasible", () => {
    for (const strategy of ["scenic", "least-walk", "fastest"] as const) {
      expect(findPath("FACE", graph, { strategy }).feasible).toBe(true);
    }
    expect(findPath("FACE", graph, { variant: 3 }).feasible).toBe(true);
  });

  it("renders itinerary text with ride lines", () => {
    const text = itineraryText(findPath("FACE", graph));
    expect(text).toContain("FACE");
    expect(text).toContain("Ride");
  });

  it("keeps the wildcard walk between train runs short", () => {
    // DOG: ride D, walk for O, ride G. The gap between the D and G rides must
    // be minimized by the routing — not left to arbitrary station choices
    // (boarding G at "G far" would mean a ~10 km walk).
    const result = findPath("DOG", graph);
    expect(result.feasible).toBe(true);
    expect(walkMeters(result)).toBeLessThan(2000);
  });

  it("boards a run after a gap near the previous run's end", () => {
    const result = findPath("DOG", graph);
    const gRide = result.legs.find((l) => l.kind === "ride" && l.line === "G");
    expect((gRide as { from: { name: string } }).from.name).toBe("G near");
  });

  it("produces a connected itinerary (no teleports)", () => {
    for (const word of ["FACE", "DOG", "FOX"]) {
      const { legs } = findPath(word, graph);
      for (let i = 1; i < legs.length; i++) {
        expect(haversineMeters(legs[i - 1].to.pos, legs[i].from.pos)).toBeLessThan(5);
      }
    }
  });

  it("never walks more on least-walk than on scenic", () => {
    const leastWalk = walkMeters(findPath("DOG", graph, { strategy: "least-walk" }));
    const scenic = walkMeters(findPath("DOG", graph, { strategy: "scenic" }));
    expect(leastWalk).toBeLessThanOrEqual(scenic + 1);
  });
});
