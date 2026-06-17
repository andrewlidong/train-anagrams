import { describe, it, expect } from "vitest";
import { classify, categoryEmoji } from "./venues";

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
