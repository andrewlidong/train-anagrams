import { useState } from "react";
import { tripStats, type FinderResult } from "../spell/finder";
import { isRealWord } from "../spell/dictionary";
import { categoryEmoji } from "../date/venues";
import { wordShareUrl } from "../share";
import { RouteBullet } from "./RouteBullet";

interface Props {
  result: FinderResult;
  activeLeg: number;
}

export function Itinerary({ result, activeLeg }: Props) {
  const { legs, upper, notes } = result;
  const real = isRealWord(upper);
  const [copied, setCopied] = useState(false);

  if (legs.length === 0) {
    return (
      <div className="itinerary empty">
        <p>Couldn't build a path for "{upper}". Try a word with subway letters (A, C, E, F…).</p>
      </div>
    );
  }

  const stats = tripStats(legs);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(wordShareUrl(window.location.href, upper));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const rows: JSX.Element[] = [];
  legs.forEach((leg, i) => {
    const active = i === activeLeg ? " active" : "";
    if (leg.kind === "ride") {
      rows.push(
        <li key={`r${i}`} className={`step ride${active}`}>
          <RouteBullet route={leg.line} size={24} />
          <span>
            Ride the <strong>{leg.line}</strong>
            {leg.letters.length > 1 && <em> (spells {leg.letters})</em>} from <em>{leg.from.name}</em> to{" "}
            <em>{leg.to.name}</em>
          </span>
        </li>,
      );
      const next = legs[i + 1];
      if (next && next.kind === "ride") {
        rows.push(
          <li key={`t${i}`} className="step transfer">
            🔁 Transfer <strong>{leg.line}</strong> → <strong>{next.line}</strong> at <em>{leg.to.name}</em>
          </li>,
        );
      }
    } else if (leg.letter && leg.venue) {
      rows.push(
        <li key={`w${i}`} className={`step date-spot${active}`}>
          {categoryEmoji(leg.venue.category)}{" "}
          <span>
            Walk to <strong>{leg.venue.name}</strong> <em>({leg.venue.category})</em> for{" "}
            <strong>{leg.letters}</strong> — {Math.round(leg.meters)} m
          </span>
        </li>,
      );
    } else if (leg.letter) {
      rows.push(
        <li key={`w${i}`} className={`step walk${active}`}>
          🔎 Finding a spot for <strong>{leg.letters}</strong>…
        </li>,
      );
    } else {
      rows.push(
        <li key={`w${i}`} className={`step walk${active}`}>
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
        <button className="copy-link" onClick={copyLink} title="Copy a shareable link to this route">
          {copied ? "✓ Copied" : "🔗 Share"}
        </button>
      </div>

      <div className="trip-stats">
        🚆 {stats.trains} {stats.trains === 1 ? "train" : "trains"} · 🔁 {stats.transfers}{" "}
        {stats.transfers === 1 ? "transfer" : "transfers"} · 📍 {stats.stations} stops · ~{stats.minutes} min
        {stats.walkKm > 0.05 && <> · 🚶 {stats.walkKm.toFixed(1)} km</>}
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
