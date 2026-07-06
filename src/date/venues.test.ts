import { afterEach, describe, expect, it, vi } from "vitest";
import type { LatLng } from "../types";
import type { DateSpot, FinderResult } from "../spell/finder";
import { tripStats } from "../spell/finder";
import { attachDateSpots, categoryEmoji, classify, findDateSpot, pickVenue } from "./venues";
import { haversineMeters } from "../data/buildGraph";

describe("classify OSM tags into venue buckets", () => {
  it("maps parks, landmarks, cafés and bars", () => {
    expect(classify({ leisure: "park" })).toBe("park");
    expect(classify({ tourism: "museum" })).toBe("landmark");
    expect(classify({ historic: "monument" })).toBe("landmark");
    expect(classify({ amenity: "cafe" })).toBe("café");
    expect(classify({ amenity: "bar" })).toBe("bar");
    expect(classify({ amenity: "pub" })).toBe("bar");
  });
});

describe("categoryEmoji", () => {
  it("has an emoji per bucket", () => {
    expect(categoryEmoji("park")).toBe("🌳");
    expect(categoryEmoji("café")).toBe("☕");
    expect(categoryEmoji("bar")).toBe("🍸");
    expect(categoryEmoji("landmark")).toBe("🗽");
  });
});

const spot = (name: string, lat: number, lng: number): DateSpot => ({
  name,
  category: "bar",
  pos: { lat, lng },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubOverpass(elements: object[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ elements }) }),
  );
}

describe("pickVenue", () => {
  it("prefers a venue on the way to the next stop over one slightly nearer but backwards", () => {
    const near: LatLng = { lat: 40.7, lng: -74.0 };
    const next: LatLng = { lat: 40.7, lng: -73.988 }; // ~1 km east
    const backwards = spot("Backwards Bar", 40.7, -74.0024); // ~200 m west of near
    const onTheWay = spot("Onward Bar", 40.7, -73.9964); // ~300 m east, between the two
    expect(pickVenue([backwards, onTheWay], near, next)?.name).toBe("Onward Bar");
    // Without a next anchor it degenerates to nearest-to-near.
    expect(pickVenue([backwards, onTheWay], near, null)?.name).toBe("Backwards Bar");
  });
});

describe("findDateSpot fallback", () => {
  it("never drags the user to a far-away curated fallback", async () => {
    // Overpass is unreachable; the nearest curated Y venue (Yankee Stadium /
    // Yemen Café) is several km from south Brooklyn — expect a generic pin
    // near the path instead of a cross-town hike.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const near: LatLng = { lat: 40.62, lng: -74.001 };
    const found = await findDateSpot("Y", near);
    expect(found).not.toBeNull();
    expect(haversineMeters(near, found!.pos)).toBeLessThan(1000);
  });
});

describe("attachDateSpots", () => {
  it("inserts an explicit connector walk from the venue back to the next station", async () => {
    const a: LatLng = { lat: 40.7, lng: -74.0 };
    const b: LatLng = { lat: 40.706, lng: -74.0 };
    const c: LatLng = { lat: 40.72, lng: -74.0 };
    stubOverpass([
      { type: "node", lat: 40.703, lon: -73.998, tags: { name: "Old Oak", amenity: "bar" } },
    ]);
    const result: FinderResult = {
      word: "dob",
      upper: "DOB",
      missingLetters: ["O"],
      feasible: true,
      notes: [],
      legs: [
        {
          kind: "walk",
          letter: "O",
          letters: "O",
          from: { name: "A st", pos: a },
          to: { name: "B st", pos: b },
          meters: haversineMeters(a, b),
        },
        {
          kind: "ride",
          letter: "B",
          letters: "B",
          line: "B",
          from: { name: "B st", pos: b },
          to: { name: "C st", pos: c },
        },
      ],
    };

    const attached = await attachDateSpots(result);
    expect(attached.legs).toHaveLength(3);

    const [venueWalk, connector, ride] = attached.legs;
    expect(venueWalk.kind).toBe("walk");
    expect((venueWalk as { venue?: DateSpot }).venue?.name).toBe("Old Oak");

    expect(connector.kind).toBe("walk");
    expect((connector as { letter: string | null }).letter).toBeNull();
    expect(connector.from.name).toBe("Old Oak");
    expect(connector.to.name).toBe("B st");
    expect(ride.kind).toBe("ride");

    // No teleports, and the connector is counted in the stats.
    for (let i = 1; i < attached.legs.length; i++) {
      expect(haversineMeters(attached.legs[i - 1].to.pos, attached.legs[i].from.pos)).toBeLessThan(5);
    }
    const walkM =
      (venueWalk as { meters: number }).meters + (connector as { meters: number }).meters;
    expect(tripStats(attached.legs).walkKm * 1000).toBeCloseTo(walkM, 0);
  });
});
