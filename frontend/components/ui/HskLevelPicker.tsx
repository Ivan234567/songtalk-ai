'use client';

import React from 'react';
import type { ZhHskLevel } from '@/lib/zh-scenarios';

const LEVELS: ZhHskLevel[] = [1, 2, 3, 4, 5, 6];

export function HskLevelPicker({
  value,
  onChange,
}: {
  value: ZhHskLevel;
  onChange: (v: ZhHskLevel) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Уровень HSK"
      style={{
        display: 'flex',
        width: '100%',
        padding: 4,
        gap: 4,
        borderRadius: 14,
        background: 'var(--sidebar-hover)',
        border: '1px solid var(--sidebar-border)',
      }}
    >
      {LEVELS.map((level) => {
        const selected = level === value;
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`HSK ${level}`}
            onClick={() => onChange(level)}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '0.5rem 0',
              border: 'none',
              borderRadius: 10,
              background: selected ? 'var(--sidebar-active)' : 'transparent',
              color: 'var(--sidebar-text)',
              fontSize: '0.9rem',
              fontWeight: selected ? 600 : 500,
              fontVariantNumeric: 'tabular-nums',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              if (!selected) e.currentTarget.style.background = 'var(--sidebar-bg)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = selected ? 'var(--sidebar-active)' : 'transparent';
            }}
          >
            {level}
          </button>
        );
      })}
    </div>
  );
}
