import { describe, it, expect } from "vitest";
import { buildComplexes, SubwayGraph, haversineMeters } from "./buildGraph";
import type { Station } from "../types";

function station(name: string, complexId: string, routes: string[], lat: number, lng: number): Station {
  return { stopId: name, name, complexId, borough: "M", routes, pos: { lat, lng } };
}

describe("buildComplexes", () => {
  it("groups stations by complexId and unions routes", () => {
    const complexes = buildComplexes([
      station("A St", "1", ["F"], 40.7, -74.0),
      station("A St Lower", "1", ["A"], 40.7001, -74.0001),
      station("B St", "2", ["C"], 40.71, -74.01),
    ]);
    const c1 = complexes.find((c) => c.id === "1")!;
    expect(c1.routes).toEqual(["A", "F"]);
    expect(complexes).toHaveLength(2);
  });
});

describe("SubwayGraph transfers", () => {
  const complexes = buildComplexes([
    station("FA", "fa", ["F", "A"], 40.73, -74.0),
    station("AC", "ac", ["A", "C"], 40.74, -74.0),
    station("Conly", "c2", ["C"], 40.75, -74.0),
  ]);
  const graph = new SubwayGraph(complexes);

  it("finds in-system transfers between lines sharing a complex", () => {
    expect(graph.inSystemTransfers("F", "A").map((c) => c.id)).toEqual(["fa"]);
    expect(graph.connected("A", "C")).toBe(true);
  });

  it("reports reachable next lines", () => {
    expect(graph.nextLines("A").sort()).toEqual(["C", "F"]);
  });
});

describe("haversineMeters", () => {
  it("is ~0 for identical points and positive otherwise", () => {
    const a = { lat: 40.7, lng: -74.0 };
    expect(haversineMeters(a, a)).toBeCloseTo(0, 5);
    expect(haversineMeters(a, { lat: 40.71, lng: -74.0 })).toBeGreaterThan(1000);
  });
});
