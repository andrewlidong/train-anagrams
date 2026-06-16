import { useEffect, useMemo, useState } from "react";
import { LayersControl, MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import type { LineGeometry } from "../types";
import type { ItineraryLeg } from "../spell/finder";
import { routeColor } from "../data/lineColors";
import { PathLayer } from "./PathLayer";
import { TrainAnimation } from "./TrainAnimation";
import { buildLineIndex } from "./geometry";

const NYC_CENTER: [number, number] = [40.7306, -73.9866];

interface Props {
  lines: LineGeometry[];
  legs: ItineraryLeg[];
}

/** Pans/zooms the map to fit the active path whenever it changes. */
function FitToPath({ legs }: { legs: ItineraryLeg[] }) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = [];
    for (const leg of legs) {
      pts.push([leg.from.pos.lat, leg.from.pos.lng]);
      pts.push([leg.to.pos.lat, leg.to.pos.lng]);
    }
    if (pts.length >= 2) {
      map.fitBounds(pts as LatLngBoundsExpression, { padding: [60, 60], maxZoom: 14 });
    }
  }, [legs, map]);
  return null;
}

export function SubwayMap({ lines, legs }: Props) {
  const lineIndex = useMemo(() => buildLineIndex(lines), [lines]);
  const [playing, setPlaying] = useState(true);

  // The full subway network, drawn boldly so it reads like a subway map.
  const network = useMemo(
    () =>
      lines.flatMap((line) =>
        line.paths.map((path, i) => (
          <Polyline
            key={`${line.service}-${i}`}
            positions={path.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{ color: routeColor(line.service), weight: 3.5, opacity: 0.7, lineCap: "round" }}
          />
        )),
      ),
    [lines],
  );

  return (
    <div className="map-shell">
      <MapContainer center={NYC_CENTER} zoom={12} className="map" scrollWheelZoom>
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Clean">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Dark">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Streets">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>
        </LayersControl>
        {network}
        <PathLayer legs={legs} lineIndex={lineIndex} />
        <TrainAnimation legs={legs} lineIndex={lineIndex} playing={playing} />
        <FitToPath legs={legs} />
      </MapContainer>

      {legs.length > 0 && (
        <button className="ride-toggle" onClick={() => setPlaying((p) => !p)}>
          {playing ? "⏸ Pause train" : "🚆 Run train"}
        </button>
      )}
    </div>
  );
}
