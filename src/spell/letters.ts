// Turns a typed word into the sequence of "legs" needed to spell it by train.
import { isLetterLine } from "../data/lineColors";

export interface WordLeg {
  /** The single uppercase letter this leg spells. */
  letter: string;
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
 * Convert a word into legs. Consecutive identical letters collapse into one
 * leg (you can't transfer from a line to itself), since riding a line once
 * already "spells" that letter.
 */
export function wordToLegs(word: string): WordLeg[] {
  const letters = normalizeWord(word);
  const legs: WordLeg[] = [];
  let prev = "";
  for (const letter of letters) {
    if (letter === prev) continue; // collapse doubles (e.g. JAZZ -> J A Z)
    prev = letter;
    if (isLetterLine(letter)) {
      legs.push({ letter, type: "train", line: letter });
    } else {
      legs.push({ letter, type: "walk" });
    }
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
