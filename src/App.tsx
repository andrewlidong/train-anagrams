import { useEffect, useMemo, useState } from "react";
import type { MtaData } from "./types";
import { loadMtaData } from "./data/fetchMta";
import { SubwayGraph } from "./data/buildGraph";
import { findPath, type FinderResult, type RouteStrategy } from "./spell/finder";
import { normalizeWord } from "./spell/letters";
import { attachDateSpots } from "./date/venues";
import { attachWalkingPaths } from "./data/walking";
import { spelled } from "./spell/explore";
import { spellableSuggestions } from "./spell/dictionary";
import { readWordFromUrl } from "./share";
import { addRecent, getFavorites, getRecents, toggleFavorite } from "./storage";
import { SubwayMap } from "./map/SubwayMap";
import { ModeToggle, type Mode } from "./components/ModeToggle";
import { WordInput } from "./components/WordInput";
import { Itinerary } from "./components/Itinerary";
import { ExplorePanel } from "./components/ExplorePanel";
import { ReversePanel } from "./components/ReversePanel";

const STRATEGIES: { key: RouteStrategy; label: string }[] = [
  { key: "scenic", label: "More stops" },
  { key: "least-walk", label: "Least walking" },
  { key: "fastest", label: "Fastest" },
];

export default function App() {
  const [data, setData] = useState<MtaData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("finder");
  const [word, setWord] = useState("");
  const [strategy, setStrategy] = useState<RouteStrategy>("scenic");
  const [variant, setVariant] = useState(0);
  const [finderResult, setFinderResult] = useState<FinderResult | null>(null);
  const [displayResult, setDisplayResult] = useState<FinderResult | null>(null);
  const [exploreLines, setExploreLines] = useState<string[]>([]);
  const [activeLeg, setActiveLeg] = useState(0);
  const [recents, setRecents] = useState<string[]>(() => getRecents());
  const [favorites, setFavorites] = useState<string[]>(() => getFavorites());

  useEffect(() => {
    let cancelled = false;
    loadMtaData()
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(String(e?.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, []);

  const graph = useMemo(() => (data ? new SubwayGraph(data.complexes) : null), [data]);
  const suggestions = useMemo(() => (data ? spellableSuggestions(12) : []), [data]);

  // On first load, take a word from the URL (?word=FACE) if present.
  useEffect(() => {
    if (!graph) return;
    const w = readWordFromUrl(window.location.search);
    if (w) {
      setMode("finder");
      setWord(w);
      setRecents(addRecent(w));
    }
  }, [graph]);

  // Recompute the route when the word, strategy, or variant changes.
  useEffect(() => {
    if (!graph || !word) {
      setFinderResult(null);
      return;
    }
    setFinderResult(findPath(word, graph, { strategy, variant }));
    const url = new URL(window.location.href);
    url.searchParams.set("word", word);
    window.history.replaceState(null, "", url);
    document.title = `${word} · Subway Spell`;
  }, [graph, word, strategy, variant]);

  // Resolve venue stops (Overpass) then on-street walking geometry (OSRM).
  useEffect(() => {
    if (!finderResult) {
      setDisplayResult(null);
      return;
    }
    setDisplayResult(finderResult);
    const ctrl = new AbortController();
    (async () => {
      let r = finderResult;
      if (finderResult.missingLetters.length) {
        r = await attachDateSpots(finderResult, ctrl.signal);
        setDisplayResult(r);
      }
      setDisplayResult(await attachWalkingPaths(r, ctrl.signal));
    })().catch(() => {});
    return () => ctrl.abort();
  }, [finderResult]);

  const exploreResult = useMemo(
    () => (graph && exploreLines.length ? findPath(spelled(exploreLines), graph) : null),
    [graph, exploreLines],
  );
  const activeLegs =
    mode === "finder" ? (displayResult?.legs ?? []) : mode === "explore" ? (exploreResult?.legs ?? []) : [];

  // Reset the highlighted leg whenever the drawn path changes.
  useEffect(() => {
    setActiveLeg(0);
  }, [displayResult, exploreResult, mode]);

  const runWord = (w: string) => {
    const upper = normalizeWord(w);
    if (!upper) return;
    setMode("finder");
    setVariant(0);
    setWord(upper);
    setRecents(addRecent(upper));
  };

  const favWord = displayResult?.upper ?? "";
  const isFav = favorites.includes(favWord);
  const activeWord = mode === "finder" ? favWord : mode === "explore" ? spelled(exploreLines) : "";

  if (error) {
    return (
      <div className="fullscreen-message">
        <h1>🚇 Subway Spell</h1>
        <p>Couldn't load the live MTA data.</p>
        <pre>{error}</pre>
        <button onClick={() => location.reload()}>Retry</button>
      </div>
    );
  }

  if (!data || !graph) {
    return (
      <div className="fullscreen-message">
        <h1>🚇 Subway Spell</h1>
        <p>Loading live NYC subway data…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="panel">
        <header>
          <h1>🚇 Subway Spell</h1>
          <p className="tagline">Spell words by riding NYC subway lines.</p>
        </header>

        <ModeToggle mode={mode} onChange={setMode} />

        {mode === "finder" && (
          <>
            <WordInput
              onSubmit={runWord}
              suggestions={suggestions}
              recents={recents}
              favorites={favorites}
              showExtras={!displayResult}
            />
            {displayResult && (
              <div className="route-options">
                {STRATEGIES.map((s) => (
                  <button
                    key={s.key}
                    className={`opt${s.key === strategy ? " active" : ""}`}
                    onClick={() => setStrategy(s.key)}
                  >
                    {s.label}
                  </button>
                ))}
                <button className="opt" onClick={() => setVariant((v) => v + 1)}>
                  🔀 Another route
                </button>
              </div>
            )}
            {displayResult && (
              <Itinerary
                result={displayResult}
                activeLeg={activeLeg}
                favorite={isFav}
                onToggleFavorite={() => favWord && setFavorites(toggleFavorite(favWord))}
              />
            )}
          </>
        )}

        {mode === "explore" && <ExplorePanel graph={graph} lines={exploreLines} onChange={setExploreLines} />}

        {mode === "reverse" && <ReversePanel graph={graph} onPick={runWord} />}

        <footer>
          Data: <a href="https://data.ny.gov">MTA / NY State Open Data</a> · venues ©{" "}
          <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>.
        </footer>
      </aside>

      <main className="map-wrap">
        <SubwayMap
          lines={data.lines}
          complexes={data.complexes}
          legs={activeLegs}
          activeLeg={activeLeg}
          onLegChange={setActiveLeg}
          word={activeWord}
        />
      </main>
    </div>
  );
}
