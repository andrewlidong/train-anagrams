import type { ItineraryLeg } from "../spell/finder";
import { routeColor, routeTextColor } from "../data/lineColors";

interface Cell {
  char: string;
  type: "train" | "venue";
  line?: string;
  legIndex: number;
}

interface Props {
  legs: ItineraryLeg[];
  activeLeg: number;
}

/** The spelled word laid out left-to-right as line bullets / venue letters,
 * with the leg the train is currently on highlighted. */
export function SpellingStrip({ legs, activeLeg }: Props) {
  const cells: Cell[] = [];
  legs.forEach((leg, i) => {
    if (leg.kind === "ride") {
      for (const c of leg.letters) cells.push({ char: c, type: "train", line: leg.line, legIndex: i });
    } else if (leg.letter) {
      for (const c of leg.letters) cells.push({ char: c, type: "venue", legIndex: i });
    }
  });
  if (cells.length === 0) return null;

  return (
    <div className="spelling-strip">
      {cells.map((cell, idx) => (
        <span
          key={idx}
          className={`strip-cell ${cell.type}${cell.legIndex === activeLeg ? " active" : ""}`}
          style={
            cell.type === "train"
              ? { background: routeColor(cell.line!), color: routeTextColor(cell.line!) }
              : undefined
          }
        >
          {cell.char}
        </span>
      ))}
    </div>
  );
}
