// Official MTA trunk-line colors and the set of lines whose id is a letter.

/** Lettered subway lines you can actually ride (their id IS an alphabet letter). */
export const LETTER_LINES = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "J",
  "L",
  "M",
  "N",
  "Q",
  "R",
  "S",
  "W",
  "Z",
] as const;

export type LetterLine = (typeof LETTER_LINES)[number];

const LETTER_LINE_SET = new Set<string>(LETTER_LINES);

/** Letters of the alphabet that have NO corresponding subway line. */
export const MISSING_LETTERS = "HIKOPTUVXY".split("");

export function isLetterLine(letter: string): letter is LetterLine {
  return LETTER_LINE_SET.has(letter.toUpperCase());
}

const TRUNK_COLOR: Record<string, string> = {
  "1": "#EE352E",
  "2": "#EE352E",
  "3": "#EE352E",
  "4": "#00933C",
  "5": "#00933C",
  "6": "#00933C",
  "7": "#B933AD",
  A: "#0039A6",
  C: "#0039A6",
  E: "#0039A6",
  B: "#FF6319",
  D: "#FF6319",
  F: "#FF6319",
  M: "#FF6319",
  G: "#6CBE45",
  J: "#996633",
  Z: "#996633",
  L: "#A7A9AC",
  N: "#FCCC0A",
  Q: "#FCCC0A",
  R: "#FCCC0A",
  W: "#FCCC0A",
  S: "#808183",
};

const DEFAULT_COLOR = "#5a5a5a";

/** Official background color for a route bullet. */
export function routeColor(route: string): string {
  return TRUNK_COLOR[route.toUpperCase()] ?? DEFAULT_COLOR;
}

/** Yellow (N/Q/R/W) bullets need black text; everything else is white. */
export function routeTextColor(route: string): string {
  return TRUNK_COLOR[route.toUpperCase()] === "#FCCC0A" ? "#000000" : "#ffffff";
}
