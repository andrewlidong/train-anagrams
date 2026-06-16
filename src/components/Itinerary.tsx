import type { FinderResult } from "../spell/finder";
import { isRealWord } from "../spell/dictionary";
import { categoryEmoji } from "../date/venues";
import { RouteBullet } from "./RouteBullet";

interface Props {
  result: FinderResult;
}

export function Itinerary({ result }: Props) {
  const { legs, upper, notes } = result;
  const real = isRealWord(upper);

  if (legs.length === 0) {
    return (
      <div className="itinerary empty">
        <p>Couldn't build a path for "{upper}". Try a word with subway letters (A, C, E, F…).</p>
      </div>
    );
  }

  const rows: JSX.Element[] = [];
  legs.forEach((leg, i) => {
    if (leg.kind === "ride") {
      rows.push(
        <li key={`r${i}`} className="step ride">
          <RouteBullet route={leg.line} size={24} />
          <span>
            Ride the <strong>{leg.line}</strong> from <em>{leg.from.name}</em> to{" "}
            <em>{leg.to.name}</em>
          </span>
        </li>,
      );
      const next = legs[i + 1];
      if (next && next.kind === "ride") {
        rows.push(
          <li key={`t${i}`} className="step transfer">
            🔁 Transfer <strong>{leg.line}</strong> → <strong>{next.line}</strong> at{" "}
            <em>{leg.to.name}</em>
          </li>,
        );
      }
    } else if (leg.letter && leg.venue) {
      rows.push(
        <li key={`w${i}`} className="step date-spot">
          {categoryEmoji(leg.venue.category)}{" "}
          <span>
            Walk to <strong>{leg.venue.name}</strong> <em>({leg.venue.category})</em> for{" "}
            <strong>{leg.letter}</strong> — {Math.round(leg.meters)} m
          </span>
        </li>,
      );
    } else if (leg.letter) {
      rows.push(
        <li key={`w${i}`} className="step walk">
          🔎 Finding a spot for <strong>{leg.letter}</strong>…
        </li>,
      );
    } else {
      rows.push(
        <li key={`w${i}`} className="step walk">
          🚶 Walk {Math.round(leg.meters)} m to transfer
        </li>,
      );
    }
  });

  return (
    <div className="itinerary">
      <div className="spelled-header">
        <span className="spelled">{upper}</span>
        {real && <span className="real-badge">real word ✓</span>}
        {!result.feasible && <span className="warn-badge">no train route</span>}
      </div>
      <ol>{rows}</ol>
      {notes.length > 0 && (
        <ul className="notes">
          {notes.map((n, i) => (
            <li key={i}>ℹ️ {n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
