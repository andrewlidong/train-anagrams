import { describe, it, expect } from "vitest";
import { normalizeWord, wordToLegs, missingLetters } from "./letters";

describe("normalizeWord", () => {
  it("uppercases and strips non-letters", () => {
    expect(normalizeWord("Times Sq-42!")).toBe("TIMESSQ");
  });
});

describe("wordToLegs", () => {
  it("maps available letters to train legs", () => {
    const legs = wordToLegs("FACE");
    expect(legs.map((l) => l.letter)).toEqual(["F", "A", "C", "E"]);
    expect(legs.every((l) => l.type === "train")).toBe(true);
  });

  it("groups consecutive duplicate letters but records the run", () => {
    const legs = wordToLegs("JAZZ");
    expect(legs.map((l) => l.letter)).toEqual(["J", "A", "Z"]);
    expect(legs.map((l) => l.letters)).toEqual(["J", "A", "ZZ"]);
    // The full word is recoverable from the runs.
    expect(legs.map((l) => l.letters).join("")).toBe("JAZZ");
  });

  it("marks letters with no line as walk legs", () => {
    const legs = wordToLegs("FOX");
    expect(legs.map((l) => `${l.letter}:${l.type}`)).toEqual(["F:train", "O:walk", "X:walk"]);
  });
});

describe("missingLetters", () => {
  it("returns distinct sorted letters with no subway line", () => {
    expect(missingLetters("FOX")).toEqual(["O", "X"]);
    expect(missingLetters("FACE")).toEqual([]);
  });
});
