'use client';

import React, { useMemo } from 'react';

type SparklineProps = {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
};

export function Sparkline({
  values,
  width = 80,
  height = 24,
  color = 'var(--accent)',
  className = '',
}: SparklineProps) {
  const { pathD, areaD } = useMemo(() => {
    if (values.length < 2) return { pathD: '', areaD: '' };

    const pad = 2;
    const innerW = width - pad * 2;
    const innerH = height - pad * 2;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const points = values.map((v, i) => ({
      x: pad + (i / (values.length - 1)) * innerW,
      y: pad + ((max - v) / range) * innerH,
    }));

    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const area =
      line +
      ` L ${points[points.length - 1].x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`;

    return { pathD: line, areaD: area };
  }, [values, width, height]);

  if (values.length < 2) return null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <path d={areaD} fill={color} fillOpacity={0.12} />
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
