import { Fragment } from "react";
import { CircleMarker, Marker, Polyline, Tooltip } from "react-leaflet";
import L from "leaflet";
import type { ItineraryLeg } from "../spell/finder";
import { routeColor, routeTextColor } from "../data/lineColors";
import { traceLine, type LineIndex } from "./geometry";
import type { LatLng } from "../types";

const ll = (p: { lat: number; lng: number }): [number, number] => [p.lat, p.lng];

function midpoint(points: LatLng[]): LatLng {
  return points[Math.floor(points.length / 2)] ?? points[0];
}

/** An MTA-style line bullet rendered as a Leaflet marker icon. */
function bulletIcon(label: string, bg: string, fg: string, dashed = false): L.DivIcon {
  return L.divIcon({
    className: "leg-bullet-icon",
    html: `<span class="leg-bullet${dashed ? " dashed" : ""}" style="background:${bg};color:${fg}">${label}</span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

interface MarkerInfo {
  pos: [number, number];
  name: string;
}

interface Props {
  legs: ItineraryLeg[];
  lineIndex: LineIndex;
}

/** Draws the active spelled path: ride legs follow real track geometry, walks
 * are dashed, big line-letter bullets sit on each leg, and stops are marked. */
export function PathLayer({ legs, lineIndex }: Props) {
  if (legs.length === 0) return null;

  // Ordered, de-duplicated stops along the path.
  const markers: MarkerInfo[] = [];
  const pushMarker = (m: MarkerInfo) => {
    const last = markers[markers.length - 1];
    if (!last || last.pos[0] !== m.pos[0] || last.pos[1] !== m.pos[1]) markers.push(m);
  };
  pushMarker({ pos: ll(legs[0].from.pos), name: legs[0].from.name });
  for (const leg of legs) pushMarker({ pos: ll(leg.to.pos), name: leg.to.name });

  return (
    <>
      {legs.map((leg, i) => {
        if (leg.kind === "ride") {
          const traced = traceLine(lineIndex, leg.line, leg.from.pos, leg.to.pos);
          const mid = midpoint(traced);
          return (
            <Fragment key={`leg-${i}`}>
              <Polyline
                positions={traced.map(ll)}
                pathOptions={{ color: routeColor(leg.line), weight: 7, opacity: 0.95, lineCap: "round" }}
              />
              <Marker
                position={ll(mid)}
                icon={bulletIcon(leg.line, routeColor(leg.line), routeTextColor(leg.line))}
                interactive={false}
              />
            </Fragment>
          );
        }
        const mid = midpoint([leg.from.pos, leg.to.pos]);
        return (
          <Fragment key={`leg-${i}`}>
            <Polyline
              positions={[ll(leg.from.pos), ll(leg.to.pos)]}
              pathOptions={{ color: "#444", weight: 4, opacity: 0.85, dashArray: "4 8" }}
            />
            <Marker
              position={ll(mid)}
              icon={bulletIcon(leg.letter ?? "🚶", "#f4f4f5", "#333", true)}
              interactive={false}
            />
          </Fragment>
        );
      })}

      {markers.map((m, i) => (
        <CircleMarker
          key={`m-${i}`}
          center={m.pos}
          radius={i === 0 || i === markers.length - 1 ? 8 : 6}
          pathOptions={{
            color: "#111",
            weight: 2,
            fillColor: i === 0 ? "#16a34a" : i === markers.length - 1 ? "#dc2626" : "#fff",
            fillOpacity: 1,
          }}
        >
          <Tooltip direction="top">{m.name}</Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}
