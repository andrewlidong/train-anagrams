// Turns a typed word into the sequence of "legs" needed to spell it by train.
import { isLetterLine } from "../data/lineColors";

export interface WordLeg {
  /** The single uppercase letter this leg's line/venue represents. */
  letter: string;
  /** The run of identical letters this leg covers, e.g. "ZZ" in JAZZ. */
  letters: string;
  /** "train" if a lettered line exists; "walk" for a missing-letter wildcard. */
  type: "train" | "walk";
  /** The subway line ridden (same as `letter`) for train legs. */
  line?: string;
}

/** Keep only A–Z letters and uppercase them. */
export function normalizeWord(word: string): string {
  return word.toUpperCase().replace(/[^A-Z]/g, "");
}

/**
 * Convert a word into legs. Consecutive identical letters are grouped into one
 * leg (you can't transfer from a line to itself), but the run is recorded in
 * `letters` so doubled letters like the ZZ in JAZZ are still shown.
 */
export function wordToLegs(word: string): WordLeg[] {
  const legs: WordLeg[] = [];
  for (const letter of normalizeWord(word)) {
    const last = legs[legs.length - 1];
    if (last && last.letter === letter) {
      last.letters += letter; // extend the run (e.g. JAZZ -> J A ZZ)
      continue;
    }
    legs.push(
      isLetterLine(letter)
        ? { letter, letters: letter, type: "train", line: letter }
        : { letter, letters: letter, type: "walk" },
    );
  }
  return legs;
}

/** The distinct letters in a word that have no subway line. */
export function missingLetters(word: string): string[] {
  const seen = new Set<string>();
  for (const letter of normalizeWord(word)) {
    if (!isLetterLine(letter)) seen.add(letter);
  }
  return [...seen].sort();
}
