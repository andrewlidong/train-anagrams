export type Mode = "finder" | "explore" | "reverse";

interface Props {
  mode: Mode;
  onChange: (mode: Mode) => void;
}

export function ModeToggle({ mode, onChange }: Props) {
  return (
    <div className="mode-toggle">
      <button className={mode === "finder" ? "active" : ""} onClick={() => onChange("finder")}>
        🔤 Spell
      </button>
      <button className={mode === "explore" ? "active" : ""} onClick={() => onChange("explore")}>
        🧭 Explore
      </button>
      <button className={mode === "reverse" ? "active" : ""} onClick={() => onChange("reverse")}>
        🔡 What can I spell?
      </button>
    </div>
  );
}
