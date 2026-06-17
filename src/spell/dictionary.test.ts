import { describe, it, expect } from "vitest";
import { isFullyRidable, randomSpellable, spellableSuggestions } from "./dictionary";

describe("dictionary", () => {
  it("isFullyRidable rejects words with no-train letters", () => {
    expect(isFullyRidable("cab")).toBe(true);
    expect(isFullyRidable("fox")).toBe(false); // O and X have no line
  });

  it("spellableSuggestions returns only fully-ridable words", () => {
    const words = spellableSuggestions(20);
    expect(words.length).toBeGreaterThan(0);
    expect(words.every((w) => isFullyRidable(w))).toBe(true);
  });

  it("randomSpellable returns a ridable 4–9 letter word", () => {
    for (let i = 0; i < 10; i++) {
      const w = randomSpellable();
      expect(isFullyRidable(w)).toBe(true);
      expect(w.length).toBeGreaterThanOrEqual(4);
      expect(w.length).toBeLessThanOrEqual(9);
    }
  });
});
