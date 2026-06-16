import { describe, it, expect } from "vitest";
import { buildLineIndex, traceLine } from "./geometry";
import type { LineGeometry } from "../types";

// A straight north-south "A" line with 5 evenly spaced vertices.
const lines: LineGeometry[] = [
  {
    service: "A",
    name: "A line",
    paths: [
      [
        { lat: 40.70, lng: -74.0 },
        { lat: 40.71, lng: -74.0 },
        { lat: 40.72, lng: -74.0 },
        { lat: 40.73, lng: -74.0 },
        { lat: 40.74, lng: -74.0 },
      ],
    ],
  },
];

describe("traceLine", () => {
  const index = buildLineIndex(lines);

  it("follows the real geometry between two stations", () => {
    const path = traceLine(index, "A", { lat: 40.705, lng: -74.0 }, { lat: 40.735, lng: -74.0 });
    // Should include intermediate vertices, not just the two endpoints.
    expect(path.length).toBeGreaterThan(2);
    expect(path[0]).toEqual({ lat: 40.705, lng: -74.0 });
    expect(path[path.length - 1]).toEqual({ lat: 40.735, lng: -74.0 });
  });

  it("orients the slice in travel direction", () => {
    const path = traceLine(index, "A", { lat: 40.735, lng: -74.0 }, { lat: 40.705, lng: -74.0 });
    expect(path[1].lat).toBeGreaterThan(path[path.length - 2].lat);
  });

  it("falls back to a straight line for unknown services", () => {
    const path = traceLine(index, "Q", { lat: 40.70, lng: -74.0 }, { lat: 40.74, lng: -74.0 });
    expect(path).toHaveLength(2);
  });
});
