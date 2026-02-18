'use client';

import React from 'react';

type TrendPoint = {
  key: string;
  value: number;
  label?: string;
};

type TrendMiniChartProps = {
  points: TrendPoint[];
  maxValue?: number;
  width?: number;
  height?: number;
  selectedKey?: string | null;
  onPointClick?: (key: string) => void;
  className?: string;
};

export function TrendMiniChart({
  points,
  maxValue = 10,
  width = 280,
  height = 120,
  selectedKey = null,
  onPointClick,
  className = '',
}: TrendMiniChartProps) {
  if (points.length === 0) {
    return (
      <div
        className={className}
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.86rem',
          color: 'var(--text-primary)',
          opacity: 0.75,
        }}
      >
        Нет данных
      </div>
    );
  }

  const padding = { left: 24, right: 24, top: 16, bottom: 24 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const coords = points.map((point, idx) => {
    const x =
      points.length <= 1
        ? padding.left + innerW / 2
        : padding.left + (idx / (points.length - 1)) * innerW;
    const y = padding.top + ((maxValue - point.value) / maxValue) * innerH;
    return { ...point, x, y };
  });

  const pathD = coords
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      className={className}
      style={{ maxWidth: width }}
    >
      <path
        d={pathD}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {coords.map((p) => {
        const active = p.key === selectedKey;
        return (
          <circle
            key={p.key}
            cx={p.x}
            cy={p.y}
            r={active ? 6 : 4.5}
            fill={active ? 'var(--accent-strong)' : 'var(--accent)'}
            style={{ cursor: onPointClick ? 'pointer' : 'default' }}
            onClick={() => onPointClick?.(p.key)}
            role={onPointClick ? 'button' : undefined}
            tabIndex={onPointClick ? 0 : undefined}
            onKeyDown={(e) => {
              if (onPointClick && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onPointClick(p.key);
              }
            }}
            aria-label={p.label ? `${p.label}: ${p.value.toFixed(1)}` : undefined}
          />
        );
      })}
    </svg>
  );
}
