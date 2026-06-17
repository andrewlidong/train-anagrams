// Renders public/favicon.svg to PWA PNG icons. One-off: needs @resvg/resvg-js.
// Run: npm i -D @resvg/resvg-js && node scripts/build-icons.mjs
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";

const svg = readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8");

for (const size of [192, 512]) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    font: {
      loadSystemFonts: true,
      fontDirs: ["/System/Library/Fonts", "/Library/Fonts", "/System/Library/Fonts/Supplemental"],
      defaultFontFamily: "Helvetica",
    },
  });
  const png = resvg.render().asPng();
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), png);
  console.log(`Wrote public/icon-${size}.png`);
}
