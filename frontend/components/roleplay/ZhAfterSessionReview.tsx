'use client';

import React from 'react';
import {
  nextZhPlayModeCta,
  type ZhListenReview,
  type ZhPlayMode,
  type ZhRewindFork,
} from '@/lib/zh-play-mode';

const card: React.CSSProperties = {
  margin: 0,
  padding: '0.65rem 0.8rem',
  borderRadius: 10,
  background: 'var(--sidebar-hover)',
  border: '1px solid var(--sidebar-border)',
  textAlign: 'left',
};

export function ZhAfterSessionReview({
  playMode,
  review,
  rewindUsed,
  onRewind,
  onNextMode,
}: {
  playMode: ZhPlayMode;
  review: ZhListenReview | null;
  rewindUsed: boolean;
  onRewind?: (fork: ZhRewindFork) => void;
  onNextMode?: () => void;
}) {
  const nextCta = nextZhPlayModeCta(playMode);
  const missed = review?.missed_listening || [];
  const phrases = review?.repair_phrases || [];
  const forks = review?.rewind_forks || [];

  if (!review && !nextCta) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', width: '100%' }}>
      {missed.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.7, marginBottom: 8 }}>
            Слышал ли
          </div>
          {missed.map((item, i) => (
            <div key={`${item.said_zh}-${i}`} style={{ marginBottom: i === missed.length - 1 ? 0 : 8 }}>
              {item.said_zh ? (
                <p style={{ margin: 0, fontSize: '0.875rem', fontStyle: 'italic' }}>«{item.said_zh}»</p>
              ) : null}
              {item.said_ru ? (
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', opacity: 0.75 }}>{item.said_ru}</p>
              ) : null}
              {item.what_happened_ru ? (
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8125rem', lineHeight: 1.4 }}>{item.what_happened_ru}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {phrases.length > 0 && (playMode === 'life' || playMode === 'stress' || missed.length > 0) && (
        <div style={card}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.7, marginBottom: 8 }}>
            Если не расслышали
          </div>
          {phrases.map((p) => (
            <div key={p.zh} style={{ marginBottom: 6 }}>
              <p style={{ margin: 0, fontSize: '0.875rem' }}>«{p.zh}»</p>
              {p.pinyin ? <p style={{ margin: '0.1rem 0 0', fontSize: '0.75rem', opacity: 0.7 }}>{p.pinyin}</p> : null}
              {p.ru ? <p style={{ margin: '0.1rem 0 0', fontSize: '0.8125rem', opacity: 0.85 }}>— {p.ru}</p> : null}
            </div>
          ))}
        </div>
      )}

      {forks.length > 0 && onRewind && (
        <div style={card}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.7, marginBottom: 8 }}>
            Переиграть момент
          </div>
          {rewindUsed ? (
            <p style={{ margin: 0, fontSize: '0.8125rem', opacity: 0.75 }}>Одна переигровка на эту попытку уже использована.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {forks.map((fork, i) => (
                <button
                  key={`${fork.title_ru}-${i}`}
                  type="button"
                  onClick={() => onRewind(fork)}
                  style={{
                    padding: '0.45rem 0.65rem',
                    borderRadius: 8,
                    border: '1px solid var(--sidebar-border)',
                    background: 'var(--sidebar-bg)',
                    color: 'var(--sidebar-text)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    lineHeight: 1.4,
                  }}
                >
                  {fork.title_ru}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {nextCta && onNextMode && (
        <button
          type="button"
          onClick={onNextMode}
          style={{
            padding: '0.55rem 1.1rem',
            borderRadius: 10,
            border: '1px solid rgba(79, 168, 134, 0.45)',
            background: 'rgba(79, 168, 134, 0.14)',
            color: 'var(--sidebar-text)',
            fontSize: '0.8125rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {nextCta}
        </button>
      )}
    </div>
  );
}
