// Short, recognizable famous snippets to spell by subway. Non-letters are
// stripped when routing, so titles/phrases work fine.
export type Theme = "lyric" | "quote" | "poem";

const FAMOUS: Record<Theme, string[]> = {
  lyric: [
    "Let It Be",
    "Hey Jude",
    "Bad Romance",
    "Born To Run",
    "Dancing Queen",
    "Sweet Caroline",
    "Bohemian",
    "Mrs Robinson",
    "Wonderwall",
    "Free Bird",
  ],
  quote: [
    "Carpe Diem",
    "Less Is More",
    "Stay Gold",
    "Be The Change",
    "Make It So",
    "Game Over",
    "Veni Vidi Vici",
    "Eureka",
    "So It Goes",
    "Just Do It",
  ],
  poem: [
    "Nevermore",
    "Two Roads",
    "Rage Rage",
    "A Red Rose",
    "Do Not Go Gentle",
    "Caged Bird",
    "Brave New",
    "Ozymandias",
    "Daffodils",
    "Fog Comes",
  ],
};

/** A random famous snippet from the given theme. */
export function randomFamous(theme: Theme): string {
  const list = FAMOUS[theme];
  return list[Math.floor(Math.random() * list.length)];
}
