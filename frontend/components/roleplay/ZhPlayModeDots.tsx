'use client';

import React from 'react';
import {
  ZH_PLAY_MODES,
  ZH_PLAY_MODE_LABELS,
  type ZhPlayMode,
  masteredModesList,
  type ZhMasteredModes,
} from '@/lib/zh-play-mode';

export function ZhPlayModeDots({
  mastered,
  compact = false,
}: {
  mastered?: ZhMasteredModes | ZhPlayMode[];
  compact?: boolean;
}) {
  const done = new Set(masteredModesList(mastered));
  return (
    <span
      aria-label={`Режимы: ${ZH_PLAY_MODES.map((m) => `${ZH_PLAY_MODE_LABELS[m]}${done.has(m) ? ' пройден' : ''}`).join(', ')}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: compact ? 6 : 8, flexWrap: 'wrap' }}
    >
      {ZH_PLAY_MODES.map((mode) => {
        const on = done.has(mode);
        return (
          <span
            key={mode}
            title={ZH_PLAY_MODE_LABELS[mode]}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: compact ? '0.625rem' : '0.6875rem',
              fontWeight: 600,
              opacity: on ? 1 : 0.55,
              color: 'var(--sidebar-text)',
            }}
          >
            <span
              aria-hidden
              style={{
                width: compact ? 7 : 8,
                height: compact ? 7 : 8,
                borderRadius: '50%',
                background: on ? 'rgba(34, 197, 94, 0.95)' : 'transparent',
                border: on ? 'none' : '1.5px solid var(--sidebar-border)',
              }}
            />
            {ZH_PLAY_MODE_LABELS[mode]}
          </span>
        );
      })}
    </span>
  );
}
