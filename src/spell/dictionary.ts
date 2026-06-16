// Lightweight dictionary used to flag real words and suggest spellable ones.
import { WORDS } from "../data/words";
import { LETTER_LINES } from "../data/lineColors";

const WORD_SET = new Set(WORDS);
const AVAILABLE = new Set<string>(LETTER_LINES);

/** Is `word` a common English word? */
export function isRealWord(word: string): boolean {
  const w = word.toLowerCase();
  return w.length >= 2 && WORD_SET.has(w);
}

/** True if every letter of `word` has a corresponding subway line. */
export function isFullyRidable(word: string): boolean {
  const upper = word.toUpperCase();
  return upper.length > 0 && [...upper].every((c) => AVAILABLE.has(c));
}

/**
 * Common words that can be spelled entirely with lettered subway lines
 * (no walking wildcards needed). Returns up to `limit`, longest first.
 */
export function spellableSuggestions(limit = 30): string[] {
  const matches: string[] = [];
  for (const w of WORDS) {
    if (w.length >= 3 && isFullyRidable(w)) matches.push(w);
  }
  matches.sort((a, b) => b.length - a.length || a.localeCompare(b));
  return matches.slice(0, limit);
}
