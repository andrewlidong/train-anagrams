# 🚇 Subway Spell

Spell words by **riding NYC subway lines**. The lettered trains (A, C, E, F, J, L, M, N, Q,
R, W, Z, B, D, G, S) are literally letters — so to spell **FACE** you ride the **F**, transfer
to the **A**, then the **C**, then the **E**. Every transfer is a real one you could actually
make, and the whole trip is drawn on a geographic NYC map.

## Two modes
- **Spell a word** (finder) — type a word and the app finds a ridable path whose line letters
  spell it, with a step-by-step itinerary and the route drawn on the map. Letters with no train
  (`H I K O P T U V X Y`) become walking-wildcard legs.
- **Explore** — start on any line and follow real transfers one stop at a time, watching the
  string you're spelling grow (with a "real word ✓" badge).

## How it works
- **Live data** from NY State open data (Socrata), cached in `localStorage`:
  - Stations / routes / transfers — `data.ny.gov/resource/39hk-dx4f.json`
  - Subway line geometry — `data.ny.gov/resource/s692-irgq.json`
- Stations are grouped into **complexes** (`complex_id`); two lines connect where a complex
  serves both (in-system transfer) or where complexes sit within ~400 m (walking transfer).
- Because each lettered train is a single line, a word fixes the line sequence — so finding a
  path is a small **layered shortest-path** over candidate transfer stations (`src/spell/finder.ts`).
- The map is **Leaflet + OpenStreetMap** with the subway lines overlaid in official MTA colors
  and the spelled path highlighted on top.

## Run it
```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run build      # type-check + production build
npm run build:wordlist  # regenerate src/data/words.ts from a common-word list
```

## Project layout
```
src/
  data/    fetchMta.ts · buildGraph.ts · lineColors.ts · words.ts (generated)
  spell/   letters.ts · finder.ts · explore.ts · dictionary.ts
  map/     SubwayMap.tsx · PathLayer.tsx
  components/  ModeToggle · WordInput · Itinerary · ExplorePanel · RouteBullet
  App.tsx · main.tsx · styles.css
```

Data © MTA / NY State Open Data. Map © OpenStreetMap contributors.
