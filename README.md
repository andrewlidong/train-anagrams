# 🚇 Subway Spell

### ▶︎ Live: **https://andrewlidong.github.io/train-anagrams/**

Spell words by **riding NYC subway lines**. The lettered trains (A, C, E, F, J, L, M, N, Q,
R, W, Z, B, D, G, S) are literally letters — so to spell **FACE** you ride the **F**, transfer
to the **A**, then the **C**, then the **E**. Every transfer is a real one you could actually
make, and the whole trip is drawn on a geographic NYC map with an animated train that rides it.

## Two modes
- **Spell a word** (finder) — type a word and the app finds a ridable path whose line letters
  spell it, with a step-by-step itinerary and the route drawn on the map. Letters with no train
  (`H I K O P T U V X Y`) become a short walk to a real bar, café, park, or landmark starting
  with that letter (live from OpenStreetMap, with a curated fallback).
- **Explore** — start on any line and follow real transfers one stop at a time, watching the
  string you're spelling grow (with a "real word ✓" badge).

## How it works
1. **Live data** is fetched once and cached in `localStorage`, from NY State open data (Socrata):
   - Stations / routes / transfers — `data.ny.gov/resource/39hk-dx4f.json`
   - Subway line geometry — `data.ny.gov/resource/s692-irgq.json`
2. **Transfer graph** — stations are grouped into **complexes** (`complex_id`); two lines are
   connected where a complex serves both (in-system transfer) or where complexes sit within
   ~400 m (out-of-system walking transfer).
3. **Path-finding** — each lettered train is a single line, so a word fixes the exact line
   sequence (`MADAGASCAR` → M·A·D·A·G·A·S·C·A·R). Finding the trip is then a small **layered
   shortest-path** that picks the best transfer station between each pair of lines
   (`src/spell/finder.ts`). Doubled letters collapse (you can't transfer a line to itself), and
   gaps with no real transfer fall back to a walk.
4. **Map** — **Leaflet + CARTO/OpenStreetMap** basemaps with the full network drawn in official
   MTA colors. The spelled route is traced along the **real track geometry** (each ride is
   projected onto its line's polyline), and an **animated train** rides the whole path with
   play/pause and 0.5×–4× speed controls.

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
  date/    venues.ts (no-train letters → real bar/café/park/landmark via Overpass)
  map/     SubwayMap.tsx · PathLayer.tsx · TrainAnimation.tsx · geometry.ts
  components/  ModeToggle · WordInput · Itinerary · ExplorePanel · RouteBullet
  App.tsx · main.tsx · styles.css
```

## Deploy
Pushing to `main` triggers `.github/workflows/deploy.yml`, which tests, builds, and publishes
to GitHub Pages.

Data © MTA / NY State Open Data · venues © OpenStreetMap (Overpass) · maps © OpenStreetMap, CARTO.
