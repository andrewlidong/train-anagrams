import { useEffect, useMemo, useState } from "react";
import type { MtaData } from "./types";
import { loadMtaData } from "./data/fetchMta";
import { SubwayGraph } from "./data/buildGraph";
import { findPath, type FinderResult } from "./spell/finder";
import { spelled } from "./spell/explore";
import { spellableSuggestions } from "./spell/dictionary";
import { SubwayMap } from "./map/SubwayMap";
import { ModeToggle, type Mode } from "./components/ModeToggle";
import { WordInput } from "./components/WordInput";
import { Itinerary } from "./components/Itinerary";
import { ExplorePanel } from "./components/ExplorePanel";

export default function App() {
  const [data, setData] = useState<MtaData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("finder");
  const [finderResult, setFinderResult] = useState<FinderResult | null>(null);
  const [exploreLines, setExploreLines] = useState<string[]>([]);

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
  const suggestions = useMemo(() => (data ? spellableSuggestions(14) : []), [data]);

  // Whichever mode is active determines the path drawn on the map.
  const exploreResult = useMemo(
    () => (graph && exploreLines.length ? findPath(spelled(exploreLines), graph) : null),
    [graph, exploreLines],
  );
  const activeLegs =
    mode === "finder" ? (finderResult?.legs ?? []) : (exploreResult?.legs ?? []);

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

        {mode === "finder" ? (
          <>
            <WordInput onSubmit={(w) => setFinderResult(findPath(w, graph))} suggestions={suggestions} />
            {finderResult && <Itinerary result={finderResult} />}
          </>
        ) : (
          <ExplorePanel graph={graph} lines={exploreLines} onChange={setExploreLines} />
        )}

        <footer>
          Data: <a href="https://data.ny.gov">MTA / NY State Open Data</a>. Map ©{" "}
          <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>.
        </footer>
      </aside>

      <main className="map-wrap">
        <SubwayMap lines={data.lines} legs={activeLegs} />
      </main>
    </div>
  );
}
