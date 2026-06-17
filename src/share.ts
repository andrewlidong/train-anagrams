// Helpers for shareable word links (?word=FACE).
import { normalizeWord } from "./spell/letters";

/** Read and normalize the `word` query param from a location search string. */
export function readWordFromUrl(search: string): string | null {
  const raw = new URLSearchParams(search).get("word");
  if (!raw) return null;
  const word = normalizeWord(raw);
  return word || null;
}

/** Build a shareable URL for `word` based on the current href. */
export function wordShareUrl(href: string, word: string): string {
  const url = new URL(href);
  url.searchParams.set("word", normalizeWord(word));
  return url.toString();
}
