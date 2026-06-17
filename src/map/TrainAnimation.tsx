import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { ItineraryLeg } from "../spell/finder";
import type { LatLng } from "../types";
import { routeColor } from "../data/lineColors";
import { traceLine, type LineIndex } from "./geometry";
import { haversineMeters } from "../data/buildGraph";

function trainIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "train-icon",
    html: `<span class="train-puck" style="border-color:${color}">🚆</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function lerp(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

interface Props {
  legs: ItineraryLeg[];
  lineIndex: LineIndex;
  playing: boolean;
  /** Speed multiplier (1 = normal). */
  speed: number;
  /** Called when the train crosses into a new leg (by index). */
  onLegChange?: (legIndex: number) => void;
}

/** Animates a little train marker along the full spelled route, looping. */
export function TrainAnimation({ legs, lineIndex, playing, speed, onLegChange }: Props) {
  const map = useMap();
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const onLegChangeRef = useRef(onLegChange);
  onLegChangeRef.current = onLegChange;

  useEffect(() => {
    // Flatten every leg into one continuous polyline with a per-segment color.
    const points: LatLng[] = [];
    const segColor: string[] = [];
    const segLeg: number[] = [];
    legs.forEach((leg, li) => {
      const pts =
        leg.kind === "ride" ? traceLine(lineIndex, leg.line, leg.from.pos, leg.to.pos) : [leg.from.pos, leg.to.pos];
      const color = leg.kind === "ride" ? routeColor(leg.line) : "#555";
      for (const p of pts) {
        if (points.length > 0) {
          segColor.push(color);
          segLeg.push(li);
        }
        points.push(p);
      }
    });
    if (points.length < 2) return;

    // Cumulative distance along the path for constant-speed motion.
    const cum: number[] = [0];
    for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + haversineMeters(points[i - 1], points[i]));
    const total = cum[cum.length - 1];
    if (total <= 0) return;

    const sample = (d: number): { pos: LatLng; color: string; leg: number } => {
      if (d <= 0) return { pos: points[0], color: segColor[0], leg: segLeg[0] };
      for (let i = 0; i < segColor.length; i++) {
        if (d <= cum[i + 1]) {
          const segLen = cum[i + 1] - cum[i];
          const f = segLen > 0 ? (d - cum[i]) / segLen : 0;
          return { pos: lerp(points[i], points[i + 1], f), color: segColor[i], leg: segLeg[i] };
        }
      }
      const last = segColor.length - 1;
      return { pos: points[points.length - 1], color: segColor[last], leg: segLeg[last] };
    };

    const duration = Math.min(14, Math.max(4, total / 1200)); // seconds, distance-scaled
    const baseSpeed = total / duration; // meters per second at 1x
    const HOLD_MS = 700; // pause at each end before looping

    const marker = L.marker([points[0].lat, points[0].lng], {
      icon: trainIcon(segColor[0]),
      interactive: false,
      zIndexOffset: 1000,
    }).addTo(map);

    let dist = 0;
    let prevTs = 0;
    let holdUntil = 0;
    let atEnd = false;
    let lastColor = segColor[0];
    let lastLeg = -1;
    let raf = 0;

    const step = (ts: number) => {
      if (!prevTs) prevTs = ts;
      const dt = (ts - prevTs) / 1000;
      prevTs = ts;

      if (playingRef.current && ts >= holdUntil) {
        if (atEnd) {
          dist = 0; // loop: resume from the start after the hold
          atEnd = false;
        } else {
          dist += dt * baseSpeed * speedRef.current;
          if (dist >= total) {
            dist = total;
            atEnd = true;
            holdUntil = ts + HOLD_MS;
          }
        }
        const { pos, color, leg } = sample(dist);
        marker.setLatLng([pos.lat, pos.lng]);
        if (color !== lastColor) {
          marker.setIcon(trainIcon(color));
          lastColor = color;
        }
        if (leg !== lastLeg) {
          lastLeg = leg;
          onLegChangeRef.current?.(leg);
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      marker.remove();
    };
  }, [legs, lineIndex, map]);

  return null;
}
