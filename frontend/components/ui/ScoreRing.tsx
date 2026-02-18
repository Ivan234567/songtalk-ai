'use client';

import React from 'react';

type ScoreRingProps = {
  score: number | null;
  maxScore?: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
};

export function ScoreRing({
  score,
  maxScore = 10,
  size = 108,
  strokeWidth = 8,
  className = '',
}: ScoreRingProps) {
  const pct = score != null ? Math.max(0, Math.min(100, (score / maxScore) * 100)) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `conic-gradient(rgba(34,197,94,0.92) ${pct}%, rgba(255,255,255,0.14) ${pct}% 100%)`,
        display: 'grid',
        placeItems: 'center',
        border: '1px solid var(--stroke)',
        boxShadow: 'inset 0 0 20px rgba(0,0,0,0.22), 0 10px 18px rgba(0,0,0,0.22)',
        transition: 'background 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div
        style={{
          width: size - strokeWidth * 2,
          height: size - strokeWidth * 2,
          borderRadius: '50%',
          background: 'rgba(18,18,18,0.95)',
          border: '1px solid var(--stroke)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        <strong style={{ fontSize: '1.32rem', lineHeight: 1 }}>
          {score != null ? score.toFixed(1) : '—'}
        </strong>
        <span style={{ fontSize: '0.78rem', opacity: 0.7 }}>из {maxScore}</span>
      </div>
    </div>
  );
}
