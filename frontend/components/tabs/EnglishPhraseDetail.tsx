'use client';

import React from 'react';
import type { CefrLevel } from '@/lib/vocabulary';

type VocabularyCategory = {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  icon: string | null;
};

type PhraseKind = 'idiom' | 'phrasal-verb';

type EnglishPhraseDetailProps = {
  kind: PhraseKind;
  phrase: string;
  meaning?: string | null;
  literalTranslation?: string | null;
  examples?: string[] | null;
  difficultyLevel?: CefrLevel | string | null;
  categories?: VocabularyCategory[];
  allowedCategories: VocabularyCategory[];
  videos?: { id: string; title: string }[];
  audioUrl: string | null;
  audioLoading: boolean;
  onPronounce: () => void;
  onAssignCategories?: () => void;
};

const COPY: Record<
  PhraseKind,
  { kicker: string; typeChip: string; meaning: string; literal: string; hint: string }
> = {
  idiom: {
    kicker: 'Разбор идиомы',
    typeChip: 'идиома',
    meaning: 'Смысл',
    literal: 'Дословно',
    hint: 'По словам это не то же самое — запоминайте смысл выше.',
  },
  'phrasal-verb': {
    kicker: 'Разбор фразового глагола',
    typeChip: 'фраз. глагол',
    meaning: 'Смысл',
    literal: 'Дословно',
    hint: 'Глагол + частица дают новый смысл, а не сумму частей.',
  },
};

export function EnglishPhraseDetail({
  kind,
  phrase,
  meaning,
  literalTranslation,
  examples,
  difficultyLevel,
  categories,
  allowedCategories,
  videos,
  audioUrl,
  audioLoading,
  onPronounce,
  onAssignCategories,
}: EnglishPhraseDetailProps) {
  const copy = COPY[kind];
  const visibleCategories = (categories || []).filter((cat) =>
    allowedCategories.some((item) => item.id === cat.id),
  );
  const usage = (examples || []).map((item) => item.trim()).filter(Boolean);

  return (
    <div className="zh-detail-panel">
      <div className="zh-detail-hero">
        <div className="en-detail-hero-top">
          <div className="zh-translation-label" style={{ marginBottom: 0 }}>
            {copy.kicker}
          </div>
          <div className="zh-detail-meta">
            <span className="zh-detail-meta-chip" style={{ background: 'rgba(51,65,85,0.95)' }}>
              {copy.typeChip}
            </span>
            {difficultyLevel ? <span className="zh-detail-meta-chip">{difficultyLevel}</span> : null}
          </div>
        </div>

        <div className="en-detail-head">
          <div className="en-detail-word">{phrase}</div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={onPronounce}
            disabled={audioLoading}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '0.65rem',
              border: '1px solid rgba(82,82,91,0.9)',
              background: audioLoading ? 'rgba(24,24,27,0.95)' : 'rgba(17,98,47,0.9)',
              color: audioLoading ? 'rgba(148,163,184,0.9)' : '#e5e7eb',
              fontSize: '0.8rem',
              cursor: audioLoading ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              opacity: audioLoading ? 0.7 : 1,
              transition: 'all 0.2s',
            }}
            title={
              audioLoading
                ? 'Синтез произношения...'
                : audioUrl
                  ? 'Воспроизвести произношение'
                  : 'Синтезировать и воспроизвести произношение'
            }
          >
            {audioLoading ? '🔊 Синтез...' : audioUrl ? '▶ Произношение' : '🔊 Произношение'}
          </button>
        </div>
      </div>

      {meaning ? (
        <div className="zh-translation-block">
          <div className="zh-translation-label">{copy.meaning}</div>
          <div className="zh-translation-text">{meaning}</div>
        </div>
      ) : null}

      {literalTranslation ? (
        <div className="en-literal-block">
          <div className="zh-translation-label">{copy.literal}</div>
          <div className="en-literal-text">{literalTranslation}</div>
          <p className="en-literal-hint">{copy.hint}</p>
        </div>
      ) : null}

      {usage.length > 0 && (
        <div>
          <div className="zh-translation-label" style={{ marginBottom: '0.5rem' }}>
            Примеры
          </div>
          <ul className="en-example-list">
            {usage.map((example, idx) => (
              <li key={`${example}-${idx}`} className="en-example-item">
                {example}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div
          style={{
            fontSize: '0.8rem',
            color: 'rgba(148,163,184,0.9)',
            marginBottom: '0.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>Категории:</span>
          {onAssignCategories ? (
            <button
              onClick={onAssignCategories}
              style={{
                padding: '0.3rem 0.6rem',
                borderRadius: '0.5rem',
                border: '1px solid rgba(75,85,99,0.9)',
                background: 'rgba(24,24,27,0.95)',
                color: '#e5e7eb',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Изменить
            </button>
          ) : null}
        </div>
        {visibleCategories.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {visibleCategories.map((cat) => (
              <span
                key={cat.id}
                style={{
                  padding: '0.25rem 0.6rem',
                  borderRadius: '999px',
                  background: cat.color || '#11622f',
                  color: '#ffffff',
                  fontSize: '0.8rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
                title={cat.description || cat.name}
              >
                {cat.icon ? <span>{cat.icon}</span> : null}
                <span>{cat.name}</span>
              </span>
            ))}
          </div>
        ) : (
          <div
            style={{
              fontSize: '0.85rem',
              color: 'rgba(148,163,184,0.7)',
              fontStyle: 'italic',
            }}
          >
            Нет категорий
          </div>
        )}
      </div>

      {videos && videos.length > 0 && (
        <div>
          <div
            style={{
              fontSize: '0.8rem',
              color: 'rgba(148,163,184,0.9)',
              marginBottom: '0.15rem',
            }}
          >
            Связанные видео:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.85rem' }}>
            {videos.map((v) => (
              <span
                key={v.id}
                style={{
                  padding: '0.3rem 0.6rem',
                  borderRadius: '999px',
                  background: '#256f40',
                  color: 'rgba(219,234,254,0.98)',
                }}
              >
                {v.title || 'Видео'}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
