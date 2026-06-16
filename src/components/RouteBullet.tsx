import { routeColor, routeTextColor } from "../data/lineColors";

interface Props {
  route: string;
  size?: number;
  onClick?: () => void;
  dimmed?: boolean;
  title?: string;
}

/** A circular MTA-style line bullet (e.g. the orange "F"). */
export function RouteBullet({ route, size = 30, onClick, dimmed, title }: Props) {
  return (
    <span
      onClick={onClick}
      title={title}
      className={`route-bullet${onClick ? " clickable" : ""}${dimmed ? " dimmed" : ""}`}
      style={{
        background: routeColor(route),
        color: routeTextColor(route),
        width: size,
        height: size,
        fontSize: size * 0.55,
      }}
    >
      {route.toUpperCase()}
    </span>
  );
}
