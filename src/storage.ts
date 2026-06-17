// Recent searches and favorites, persisted in localStorage.
const RECENTS_KEY = "subway-spell:recents";
const FAVES_KEY = "subway-spell:favorites";
const MAX_RECENTS = 8;
const MAX_FAVES = 40;

function read(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(key: string, list: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

export function getRecents(): string[] {
  return read(RECENTS_KEY);
}

export function addRecent(word: string): string[] {
  const w = word.toUpperCase();
  if (!w) return read(RECENTS_KEY);
  const list = [w, ...read(RECENTS_KEY).filter((x) => x !== w)].slice(0, MAX_RECENTS);
  write(RECENTS_KEY, list);
  return list;
}

export function getFavorites(): string[] {
  return read(FAVES_KEY);
}

export function isFavorite(word: string): boolean {
  return read(FAVES_KEY).includes(word.toUpperCase());
}

export function toggleFavorite(word: string): string[] {
  const w = word.toUpperCase();
  const cur = read(FAVES_KEY);
  const list = cur.includes(w) ? cur.filter((x) => x !== w) : [w, ...cur].slice(0, MAX_FAVES);
  write(FAVES_KEY, list);
  return list;
}
