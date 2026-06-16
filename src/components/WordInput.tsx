import { useState } from "react";
import { LETTER_LINES, MISSING_LETTERS, isLetterLine } from "../data/lineColors";
import { RouteBullet } from "./RouteBullet";
import { normalizeWord } from "../spell/letters";

interface Props {
  onSubmit: (word: string) => void;
  suggestions: string[];
}

export function WordInput({ onSubmit, suggestions }: Props) {
  const [value, setValue] = useState("");
  const upper = normalizeWord(value);

  const submit = (word: string) => {
    setValue(word);
    onSubmit(word);
  };

  return (
    <div className="word-input">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (upper) onSubmit(value);
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Type a word, e.g. FACE"
          autoFocus
          spellCheck={false}
        />
        <button type="submit" disabled={!upper}>
          Find path
        </button>
      </form>

      {upper && (
        <div className="letter-preview">
          {[...upper].map((c, i) =>
            isLetterLine(c) ? (
              <RouteBullet key={i} route={c} size={26} title={`Ride the ${c} train`} />
            ) : (
              <span key={i} className="missing-letter" title={`No ${c} train — walking wildcard`}>
                {c}
              </span>
            ),
          )}
        </div>
      )}

      <div className="hint">
        Trains for: {LETTER_LINES.join(" ")} &nbsp;·&nbsp; no train for: {MISSING_LETTERS.join(" ")}
      </div>

      <div className="suggestions">
        <span className="suggestions-label">Try:</span>
        {suggestions.map((w) => (
          <button key={w} className="chip" onClick={() => submit(w.toUpperCase())}>
            {w}
          </button>
        ))}
      </div>
    </div>
  );
}
