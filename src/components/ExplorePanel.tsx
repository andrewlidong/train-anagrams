import type { SubwayGraph } from "../data/buildGraph";
import { startingLines, validNextLines, spelled } from "../spell/explore";
import { isRealWord } from "../spell/dictionary";
import { RouteBullet } from "./RouteBullet";

interface Props {
  graph: SubwayGraph;
  lines: string[];
  onChange: (lines: string[]) => void;
}

export function ExplorePanel({ graph, lines, onChange }: Props) {
  const current = lines[lines.length - 1];
  const word = spelled(lines);
  const nextOptions = current ? validNextLines(current, graph) : startingLines(graph);

  return (
    <div className="explore-panel">
      {lines.length === 0 ? (
        <p className="explore-prompt">Pick a line to start your trip:</p>
      ) : (
        <div className="explore-spelled">
          <span className="label">Spelling</span>
          <div className="spelled-line">
            {lines.map((l, i) => (
              <RouteBullet key={i} route={l} size={34} />
            ))}
          </div>
          <div className="spelled-word">
            "{word}"{isRealWord(word) && <span className="real-badge">real word ✓</span>}
          </div>
          <div className="explore-actions">
            <button onClick={() => onChange(lines.slice(0, -1))}>↩ Undo</button>
            <button onClick={() => onChange([])}>✕ Reset</button>
          </div>
        </div>
      )}

      <div className="next-lines">
        <span className="label">{current ? `Transfer from ${current} to:` : "Start with:"}</span>
        <div className="bullet-row">
          {nextOptions.length === 0 ? (
            <span className="dead-end">Dead end — no further transfers. Undo to back up.</span>
          ) : (
            nextOptions.map((l) => (
              <RouteBullet key={l} route={l} size={36} onClick={() => onChange([...lines, l])} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
