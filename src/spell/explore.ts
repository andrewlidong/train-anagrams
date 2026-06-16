// Explore mode: build a path one transfer at a time and see what it spells.
import { LETTER_LINES } from "../data/lineColors";
import type { SubwayGraph } from "../data/buildGraph";

/** Lettered lines present in the data — valid starting points. */
export function startingLines(graph: SubwayGraph): string[] {
  const available = new Set(graph.lines());
  return LETTER_LINES.filter((l) => available.has(l));
}

/** Lettered lines you can transfer to from `current` (excludes itself). */
export function validNextLines(current: string, graph: SubwayGraph): string[] {
  const reachable = new Set(graph.nextLines(current));
  return LETTER_LINES.filter((l) => l !== current && reachable.has(l));
}

/** The string spelled by a sequence of ridden lines. */
export function spelled(lines: string[]): string {
  return lines.join("");
}
