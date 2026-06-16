import { useEffect, useMemo, useState } from "react";
import { CircleMarker, LayersControl, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import type { Complex, LineGeometry } from "../types";
import type { ItineraryLeg } from "../spell/finder";
import { routeColor } from "../data/lineColors";
import { PathLayer } from "./PathLayer";
import { TrainAnimation } from "./TrainAnimation";
import { buildLineIndex } from "./geometry";

const NYC_CENTER: [number, number] = [40.7306, -73.9866];

interface Props {
  lines: LineGeometry[];
  complexes: Complex[];
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

export function SubwayMap({ lines, complexes, legs }: Props) {
  const lineIndex = useMemo(() => buildLineIndex(lines), [lines]);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const active = legs.length > 0;
  const SPEEDS = [0.5, 1, 2, 4];

  // Real revenue routes only (drop peak-direction / non-revenue variants).
  const drawn = useMemo(() => lines.filter((l) => !l.service.includes(" ")), [lines]);

  // The full subway network drawn from real track geometry; dimmed when a
  // route is highlighted so the spelled path stands out.
  const network = useMemo(
    () =>
      drawn.flatMap((line) =>
        line.paths.map((path, i) => (
          <Polyline
            key={`${line.service}-${i}`}
            positions={path.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{
              color: routeColor(line.service),
              weight: active ? 2.5 : 3.5,
              opacity: active ? 0.3 : 0.9,
              lineCap: "round",
            }}
            interactive={false}
          />
        )),
      ),
    [drawn, active],
  );

  // Station dots — make the map read like a transit map.
  const stationDots = useMemo(
    () =>
      complexes.map((c) => (
        <CircleMarker
          key={c.id}
          center={[c.pos.lat, c.pos.lng]}
          radius={2.6}
          pathOptions={{
            color: "#374151",
            weight: 1,
            fillColor: "#ffffff",
            fillOpacity: active ? 0.4 : 0.95,
            opacity: active ? 0.4 : 0.9,
          }}
        >
          <Tooltip direction="top">{c.name}</Tooltip>
        </CircleMarker>
      )),
    [complexes, active],
  );

  return (
    <div className="map-shell">
      <MapContainer center={NYC_CENTER} zoom={12} className="map" scrollWheelZoom preferCanvas>
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
        {stationDots}
        <PathLayer legs={legs} lineIndex={lineIndex} />
        <TrainAnimation legs={legs} lineIndex={lineIndex} playing={playing} speed={speed} />
        <FitToPath legs={legs} />
      </MapContainer>

      {active && (
        <div className="map-controls">
          <button className="ride-toggle" onClick={() => setPlaying((p) => !p)}>
            {playing ? "⏸ Pause" : "🚆 Run"}
          </button>
          <div className="speed-control" role="group" aria-label="Train speed">
            {SPEEDS.map((s) => (
              <button key={s} className={s === speed ? "active" : ""} onClick={() => setSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
