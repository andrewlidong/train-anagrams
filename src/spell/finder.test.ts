import { describe, it, expect } from "vitest";
import { buildComplexes, SubwayGraph } from "../data/buildGraph";
import type { Station } from "../types";
import { findPath, itineraryText, tripStats } from "./finder";

function station(name: string, complexId: string, routes: string[], lat: number, lng: number): Station {
  return { stopId: name, name, complexId, borough: "M", routes, pos: { lat, lng } };
}

// A tiny network where F-A, A-C, C-E all share transfer complexes, so "FACE"
// is fully ridable. Extra single-line stations give board/end points.
const complexes = buildComplexes([
  station("F end", "f0", ["F"], 40.700, -74.00),
  station("F/A", "fa", ["F", "A"], 40.710, -74.00),
  station("A/C", "ac", ["A", "C"], 40.720, -74.00),
  station("C/E", "ce", ["C", "E"], 40.730, -74.00),
  station("E end", "e0", ["E"], 40.740, -74.00),
]);
const graph = new SubwayGraph(complexes);

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
});
