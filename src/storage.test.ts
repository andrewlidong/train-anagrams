import { describe, it, expect, beforeEach } from "vitest";
import { addRecent, getRecents, getFavorites, isFavorite, toggleFavorite } from "./storage";

beforeEach(() => {
  const store = new Map<string, string>();
  // Minimal localStorage shim for the node test environment.
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});

describe("recents", () => {
  it("dedupes and keeps most-recent first", () => {
    addRecent("face");
    addRecent("cab");
    addRecent("FACE");
    expect(getRecents()).toEqual(["FACE", "CAB"]);
  });
});

describe("favorites", () => {
  it("toggles on and off", () => {
    expect(isFavorite("FACE")).toBe(false);
    toggleFavorite("face");
    expect(isFavorite("FACE")).toBe(true);
    expect(getFavorites()).toContain("FACE");
    toggleFavorite("FACE");
    expect(isFavorite("FACE")).toBe(false);
  });
});
