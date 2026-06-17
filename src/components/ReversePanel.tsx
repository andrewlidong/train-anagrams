import { useMemo, useState } from "react";
import type { SubwayGraph } from "../data/buildGraph";
import { startingLines } from "../spell/explore";
import { wordsFromLetters } from "../spell/dictionary";
import { RouteBullet } from "./RouteBullet";

interface Props {
  graph: SubwayGraph;
  onPick: (word: string) => void;
}

/** Pick the lines you'll ride, see which real words you can spell with them. */
export function ReversePanel({ graph, onPick }: Props) {
  const lines = useMemo(() => startingLines(graph), [graph]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(lines));

  const toggle = (l: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(l) ? next.delete(l) : next.add(l);
      return next;
    });

  const words = useMemo(() => wordsFromLetters(selected, 80), [selected]);

  return (
    <div className="reverse-panel">
      <p className="explore-prompt">Pick the lines you'll ride:</p>
      <div className="bullet-row">
        {lines.map((l) => (
          <RouteBullet key={l} route={l} size={32} onClick={() => toggle(l)} dimmed={!selected.has(l)} />
        ))}
      </div>
      <div className="reverse-actions">
        <button onClick={() => setSelected(new Set(lines))}>All</button>
        <button onClick={() => setSelected(new Set())}>None</button>
        <span className="label">{words.length} words</span>
      </div>
      <div className="reverse-words">
        {words.length === 0 ? (
          <span className="dead-end">Pick a few lines to see spellable words.</span>
        ) : (
          words.map((w) => (
            <button key={w} className="chip" onClick={() => onPick(w.toUpperCase())}>
              {w}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
