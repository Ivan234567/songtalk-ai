'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';

export type TrendChartPoint = {
  key: string;
  value: number;
  label?: string;
  count?: number;
};

type TrendChartProps = {
  points: TrendChartPoint[];
  maxValue?: number;
  height?: number;
  selectedKey?: string | null;
  onPointClick?: (key: string | null) => void;
  className?: string;
};

/* ─── layout constants ───────────────────────────────────────── */
const W = 1080;
const PAD = { left: 32, right: 14, top: 14, bottom: 22 };

/* ─── helpers ────────────────────────────────────────────────── */

/** Build a monotone cubic Catmull-Rom path (smooth curve). */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function niceYTicks(max: number, count = 3): number[] {
  const step = Math.ceil(max / count);
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(max);
  return ticks;
}

/* ─── component ──────────────────────────────────────────────── */

export function TrendChart({
  points,
  maxValue = 10,
  height = 110,
  selectedKey = null,
  onPointClick,
  className = '',
}: TrendChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const innerW = W - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const coords = useMemo(() => {
    if (points.length === 0) return [];
    return points.map((pt, i) => ({
      ...pt,
      x:
        points.length <= 1
          ? PAD.left + innerW / 2
          : PAD.left + (i / (points.length - 1)) * innerW,
      y: PAD.top + ((maxValue - pt.value) / maxValue) * innerH,
    }));
  }, [points, maxValue, innerW, innerH]);

  const { linePath, areaPath } = useMemo(() => {
    if (coords.length === 0) return { linePath: '', areaPath: '' };
    const line = smoothPath(coords);
    const bottom = PAD.top + innerH;
    const area =
      line +
      ` L ${coords[coords.length - 1].x} ${bottom} L ${coords[0].x} ${bottom} Z`;
    return { linePath: line, areaPath: area };
  }, [coords, innerH]);

  const yTicks = useMemo(() => niceYTicks(maxValue, 3), [maxValue]);

  /* Snap hover to nearest point based on mouse X */
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || coords.length === 0) return;
      const rect = svg.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * W;
      let closest = 0;
      let closestDist = Infinity;
      for (let i = 0; i < coords.length; i++) {
        const dist = Math.abs(coords[i].x - mouseX);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      }
      setHoverIdx(closest);
    },
    [coords]
  );

  const handleMouseLeave = useCallback(() => setHoverIdx(null), []);

  const activeIdx =
    hoverIdx ??
    (selectedKey != null ? coords.findIndex((c) => c.key === selectedKey) : -1);
  const activePoint = activeIdx >= 0 ? coords[activeIdx] : null;

  /* X-axis labels: first, last, and optionally middle */
  const xLabels = useMemo(() => {
    if (coords.length === 0) return [];
    if (coords.length === 1) return [{ x: coords[0].x, text: coords[0].label ?? '' }];
    const labels: { x: number; text: string }[] = [
      { x: coords[0].x, text: coords[0].label ?? '' },
    ];
    if (coords.length > 4) {
      const mid = Math.floor(coords.length / 2);
      labels.push({ x: coords[mid].x, text: coords[mid].label ?? '' });
    }
    labels.push({
      x: coords[coords.length - 1].x,
      text: coords[coords.length - 1].label ?? '',
    });
    return labels;
  }, [coords]);

  if (points.length === 0) {
    return (
      <div
        className={className}
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.82rem',
          color: 'var(--text-muted)',
          opacity: 0.7,
        }}
      >
        Нет данных
      </div>
    );
  }

  return (
    <div className={className} style={{ position: 'relative', width: '100%', minWidth: 0 }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <linearGradient id="trendFill" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Y grid lines + labels */}
        {yTicks.map((tick) => {
          const y = PAD.top + ((maxValue - tick) / maxValue) * innerH;
          return (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={PAD.left + innerW}
                y1={y}
                y2={y}
                stroke="var(--stroke)"
                strokeOpacity={0.35}
                strokeDasharray="3 3"
              />
              <text
                x={PAD.left - 6}
                y={y + 3.5}
                textAnchor="end"
                fill="var(--text-muted)"
                fontSize="25"
                opacity={0.6}
              >
                {tick}
              </text>
            </g>
          );
        })}

        {/* Area + Line */}
        <path d={areaPath} fill="url(#trendFill)" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Points */}
        {coords.map((p, i) => {
          const isActive = i === activeIdx;
          return (
            <circle
              key={p.key}
              cx={p.x}
              cy={p.y}
              r={isActive ? 5 : 3}
              fill="var(--accent)"
              fillOpacity={isActive ? 1 : 0.55}
              stroke={isActive ? 'var(--bg)' : 'none'}
              strokeWidth={isActive ? 2 : 0}
              style={{ cursor: onPointClick ? 'pointer' : 'default', transition: 'r 0.15s ease' }}
              onClick={() => onPointClick?.(p.key === selectedKey ? null : p.key)}
            />
          );
        })}

        {/* Vertical crosshair on hover */}
        {activePoint && hoverIdx != null && (
          <line
            x1={activePoint.x}
            x2={activePoint.x}
            y1={PAD.top}
            y2={PAD.top + innerH}
            stroke="var(--accent)"
            strokeOpacity={0.3}
            strokeWidth={1}
            strokeDasharray="2 2"
          />
        )}

        {/* X-axis labels */}
        {xLabels.map((lbl, i) => (
          <text
            key={i}
            x={lbl.x}
            y={height - 4}
            textAnchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}
            fill="var(--text-muted)"
            fontSize="12"
            opacity={0.6}
          >
            {lbl.text}
          </text>
        ))}
      </svg>

      {/* Tooltip anchored to point */}
      {activePoint && hoverIdx != null && (
        <div
          style={{
            position: 'absolute',
            left: `${(activePoint.x / W) * 100}%`,
            top: 0,
            transform: 'translateX(-50%)',
            padding: '0.3rem 0.55rem',
            borderRadius: 8,
            background: 'var(--card-strong)',
            border: '1px solid var(--stroke)',
            fontSize: '0.95rem',
            color: 'var(--text-primary)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            pointerEvents: 'none',
            zIndex: 10,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontWeight: 600 }}>{activePoint.value.toFixed(1)}</span>
          <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
            {activePoint.label}
            {typeof activePoint.count === 'number' && ` · ${activePoint.count} сес.`}
          </span>
        </div>
      )}
    </div>
  );
}
