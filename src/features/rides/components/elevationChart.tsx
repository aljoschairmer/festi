"use client";

import {
  Area,
  AreaChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ElevationMarker, ElevationPoint } from "../types";

type ElevationChartProps = {
  data: ElevationPoint[];
  className?: string;
  /** Called with the hovered point (or null on leave) to highlight the map. */
  onHover?: (point: ElevationPoint | null) => void;
  /** Flagged points of interest (climbs, sprints, start/finish) drawn above the profile. */
  markers?: ElevationMarker[];
};

/** Flag colors per marker kind; KOM red matches the profile accent. */
const MARKER_COLORS: Record<ElevationMarker["kind"], string> = {
  start: "#3b82f6",
  finish: "#171717",
  kom: "#ef4444",
  sprint: "#16a34a",
};

/** Vertical layout of the flag rows above the plot area, in px. */
const FLAG_ROW_STEP = 17;
const FLAG_ZONE_HEIGHT = 46;
const FLAG_HEIGHT = 11;

/** Longer labels are cut so two stagger rows stay readable. */
function truncateLabel(label: string): string {
  return label.length > 24 ? `${label.slice(0, 23)}…` : label;
}

/** The flag glyph: category/sprint badge, start pennant, or checkered finish. */
function FlagGlyph({ marker }: { marker: ElevationMarker }) {
  const color = MARKER_COLORS[marker.kind];
  if (marker.kind === "finish") {
    // 3x2 checkered flag.
    const cell = 4;
    return (
      <g>
        <rect
          x={0}
          y={0}
          width={cell * 3}
          height={cell * 2}
          fill="#ffffff"
          stroke={color}
          strokeWidth={0.75}
        />
        {[0, 2].map((col) => (
          <rect
            key={col}
            x={col * cell}
            y={0}
            width={cell}
            height={cell}
            fill={color}
          />
        ))}
        <rect x={cell} y={cell} width={cell} height={cell} fill={color} />
      </g>
    );
  }
  if (marker.badge) {
    return (
      <g>
        <rect
          x={0}
          y={0}
          width={13}
          height={FLAG_HEIGHT}
          rx={1.5}
          fill={color}
        />
        <text
          x={6.5}
          y={FLAG_HEIGHT / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={8}
          fontWeight={700}
          fill="#ffffff"
        >
          {marker.badge}
        </text>
      </g>
    );
  }
  // Plain pennant (start).
  return (
    <path d={`M0 0 L11 ${FLAG_HEIGHT / 2} L0 ${FLAG_HEIGHT} Z`} fill={color} />
  );
}

/**
 * Renders one marker's flag row above the plot: a pole continuing the
 * (in-plot) reference line up through the chart margin, the flag glyph, and
 * the label text — mirrored to the left near the right edge so nothing
 * overflows the chart.
 */
function renderMarkerFlag(marker: ElevationMarker, align: "left" | "right") {
  return (props: unknown) => {
    const viewBox = (props as { viewBox?: { x?: number; y?: number } }).viewBox;
    const cx = viewBox?.x ?? 0;
    const plotTop = viewBox?.y ?? FLAG_ZONE_HEIGHT;
    const flagTop =
      plotTop - FLAG_ZONE_HEIGHT + 2 + marker.level * FLAG_ROW_STEP;
    return (
      <g transform={`translate(${cx},0)`}>
        {marker.title && <title>{marker.title}</title>}
        <line
          x1={0}
          x2={0}
          y1={flagTop + FLAG_HEIGHT}
          y2={plotTop}
          stroke="currentColor"
          strokeOpacity={0.25}
          strokeWidth={1}
        />
        <g transform={`translate(${align === "left" ? 0 : -13},${flagTop})`}>
          <FlagGlyph marker={marker} />
        </g>
        {marker.label && (
          <text
            x={align === "left" ? 16 : -16}
            y={flagTop + FLAG_HEIGHT / 2}
            textAnchor={align === "left" ? "start" : "end"}
            dominantBaseline="central"
            fontSize={9.5}
            fill="currentColor"
            fillOpacity={0.8}
          >
            {truncateLabel(marker.label)}
          </text>
        )}
      </g>
    );
  };
}

/**
 * Elevation profile as a filled area chart (distance in km vs. elevation in m).
 * With `markers`, a flag zone (categorized climbs, sprints, start/finish — à
 * la official race profiles) extends the chart upward; the profile itself is
 * unchanged. Renders nothing when there is no usable profile.
 */
export function ElevationChart({
  data,
  className,
  onHover,
  markers,
}: ElevationChartProps) {
  if (data.length < 2) {
    return (
      <div className={className}>
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Elevation</span>
        </div>
        <div className="flex h-32 w-full items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
          Add points on the map to see the elevation profile.
        </div>
      </div>
    );
  }

  const elevations = data.map((point) => point.elevation);
  const min = Math.min(...elevations);
  const max = Math.max(...elevations);
  const pad = Math.max(10, Math.round((max - min) * 0.1));
  const maxDistance = data[data.length - 1].distance;
  const hasMarkers = (markers?.length ?? 0) > 0;

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Elevation</span>
        <span>
          {min} m – {max} m
        </span>
      </div>
      <div className={hasMarkers ? "h-44 w-full" : "h-32 w-full"}>
        {/* `minWidth`/`minHeight`: the container is measured before the
            surrounding panel has laid out, which made Recharts warn about a
            -1 × -1 chart and flash an empty box on first paint. */}
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          minHeight={0}
        >
          <AreaChart
            data={data}
            margin={{
              // The flag zone lives in the top margin, above the plot area.
              top: hasMarkers ? FLAG_ZONE_HEIGHT : 4,
              right: 8,
              bottom: 0,
              left: -8,
            }}
            onMouseMove={(state) => {
              if (!onHover) return;
              const s = state as {
                isTooltipActive?: boolean;
                activeTooltipIndex?: number | null;
                activeIndex?: number | null;
                activeLabel?: number | string | null;
              };
              if (s.isTooltipActive === false) {
                onHover(null);
                return;
              }
              const idx = s.activeTooltipIndex ?? s.activeIndex ?? null;
              if (idx != null && idx >= 0 && idx < data.length) {
                onHover(data[idx]);
                return;
              }
              // Fallback: match by the active x-axis label (distance).
              if (s.activeLabel != null) {
                const label = Number(s.activeLabel);
                const match = data.find((p) => p.distance === label);
                if (match) {
                  onHover(match);
                  return;
                }
              }
              onHover(null);
            }}
            onMouseLeave={() => onHover?.(null)}
          >
            <defs>
              <linearGradient id="elevationFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="distance"
              type="number"
              domain={[0, "dataMax"]}
              tickFormatter={(value) => `${value} km`}
              tick={{ fontSize: 11 }}
              stroke="currentColor"
              className="text-muted-foreground"
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              domain={[min - pad, max + pad]}
              tickFormatter={(value) => `${value}`}
              tick={{ fontSize: 11 }}
              stroke="currentColor"
              className="text-muted-foreground"
              tickLine={false}
              width={40}
            />
            <Tooltip
              cursor={{ stroke: "#ef4444", strokeWidth: 1 }}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid rgba(239,68,68,0.3)",
                fontSize: 12,
                padding: "6px 10px",
              }}
              labelFormatter={(value) => `${value} km`}
              formatter={(value) => [`${value} m`, "Elevation"]}
            />
            <Area
              type="monotone"
              dataKey="elevation"
              stroke="#ef4444"
              strokeWidth={2}
              fill="url(#elevationFill)"
              isAnimationActive={false}
            />
            {markers?.map((marker) => (
              <ReferenceLine
                key={`flag-${marker.kind}-${marker.km}`}
                x={marker.km}
                stroke="currentColor"
                strokeOpacity={0.2}
                strokeDasharray="2 3"
                label={renderMarkerFlag(
                  marker,
                  // Mirror labels near the right edge so they stay inside.
                  marker.km > maxDistance * 0.82 ? "right" : "left",
                )}
              />
            ))}
            {markers?.map((marker) => (
              <ReferenceDot
                key={`dot-${marker.kind}-${marker.km}`}
                x={marker.km}
                y={marker.elevation}
                r={3.5}
                fill={MARKER_COLORS[marker.kind]}
                stroke="#ffffff"
                strokeWidth={1.5}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
