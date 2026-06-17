// Renders scripts/og-image.svg to public/og.png (1200x630) for link previews.
// One-off: requires `npm i -D @resvg/resvg-js`. Run: node scripts/build-og.mjs
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";

const svg = readFileSync(new URL("./og-image.svg", import.meta.url), "utf8");
const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: 1200 },
  font: {
    loadSystemFonts: true,
    fontDirs: ["/System/Library/Fonts", "/Library/Fonts", "/System/Library/Fonts/Supplemental"],
    defaultFontFamily: "Helvetica",
  },
});
const png = resvg.render().asPng();
writeFileSync(new URL("../public/og.png", import.meta.url), png);
console.log("Wrote public/og.png");
