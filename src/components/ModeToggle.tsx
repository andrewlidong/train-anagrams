export type Mode = "finder" | "explore";

interface Props {
  mode: Mode;
  onChange: (mode: Mode) => void;
}

export function ModeToggle({ mode, onChange }: Props) {
  return (
    <div className="mode-toggle">
      <button className={mode === "finder" ? "active" : ""} onClick={() => onChange("finder")}>
        🔤 Spell a word
      </button>
      <button className={mode === "explore" ? "active" : ""} onClick={() => onChange("explore")}>
        🧭 Explore
      </button>
    </div>
  );
}
