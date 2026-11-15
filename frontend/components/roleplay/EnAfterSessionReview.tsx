'use client';

import React from 'react';
import type { PlayMode } from '@/lib/play-mode';
import { EN_DEFAULT_REPAIR_PHRASES } from '@/lib/en-play-mode';

const card: React.CSSProperties = {
  margin: 0,
  padding: '0.65rem 0.8rem',
  borderRadius: 10,
  background: 'var(--sidebar-hover)',
  border: '1px solid var(--sidebar-border)',
  textAlign: 'left',
};

export function EnAfterSessionReview({
  playMode,
}: {
  playMode: PlayMode;
}) {
  const showPhrases = playMode === 'life' || playMode === 'stress';
  if (!showPhrases) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', width: '100%' }}>
      {showPhrases && (
        <div style={card}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.7, marginBottom: 8 }}>
            Если не расслышали
          </div>
          {EN_DEFAULT_REPAIR_PHRASES.map((p) => (
            <div key={p.en} style={{ marginBottom: 6 }}>
              <p style={{ margin: 0, fontSize: '0.875rem' }}>«{p.en}»</p>
              <p style={{ margin: '0.1rem 0 0', fontSize: '0.8125rem', opacity: 0.85 }}>— {p.ru}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
