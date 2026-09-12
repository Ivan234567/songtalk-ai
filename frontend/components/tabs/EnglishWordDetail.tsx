'use client';

import React from 'react';
import { formatPartOfSpeech, getWordLevelBadge, type CefrLevel } from '@/lib/vocabulary';

type VocabularyCategory = {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  icon: string | null;
};

type EnglishWord = {
  id: string;
  word: string;
  translations: { translation: string; source?: string }[] | null;
  difficulty_level: CefrLevel | null;
  part_of_speech: string | null;
  notes?: string | null;
  phonetic_transcription?: string | null;
  categories?: VocabularyCategory[];
  videos?: { id: string; title: string }[];
};

type EnglishWordDetailProps = {
  word: EnglishWord;
  examples: string[];
  wordAudioUrl: string | null;
  wordAudioLoading: boolean;
  wordAudioRef: React.RefObject<HTMLAudioElement | null>;
  categories: VocabularyCategory[];
  onPronounce: () => void;
  onAssignCategories: () => void;
};

export function EnglishWordDetail({
  word,
  examples,
  wordAudioUrl,
  wordAudioLoading,
  wordAudioRef,
  categories,
  onPronounce,
  onAssignCategories,
}: EnglishWordDetailProps) {
  const level = getWordLevelBadge(word, 'en');
  const pos = formatPartOfSpeech(word.part_of_speech);
  const visibleCategories = (word.categories || []).filter((cat) =>
    categories.some((item) => item.id === cat.id),
  );

  return (
    <div className="zh-detail-panel">
      <div className="zh-detail-hero">
        <div className="en-detail-hero-top">
          <div className="zh-translation-label" style={{ marginBottom: 0 }}>
            Разбор слова
          </div>
          <div className="zh-detail-meta">
            {level ? <span className="zh-detail-meta-chip">{level}</span> : null}
            {pos ? (
              <span className="zh-detail-meta-chip" style={{ background: 'rgba(51,65,85,0.95)' }}>
                {pos}
              </span>
            ) : null}
          </div>
        </div>

        <div className="en-detail-head">
          <div className="en-detail-word">{word.word}</div>
          {word.phonetic_transcription ? (
            <div className="en-detail-ipa">{word.phonetic_transcription}</div>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={onPronounce}
            disabled={wordAudioLoading}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '0.65rem',
              border: '1px solid rgba(82,82,91,0.9)',
              background: wordAudioLoading ? 'rgba(24,24,27,0.95)' : 'rgba(17,98,47,0.9)',
              color: wordAudioLoading ? 'rgba(148,163,184,0.9)' : '#e5e7eb',
              fontSize: '0.8rem',
              cursor: wordAudioLoading ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              opacity: wordAudioLoading ? 0.7 : 1,
              transition: 'all 0.2s',
            }}
            title={
              wordAudioLoading
                ? 'Синтез произношения...'
                : wordAudioUrl
                  ? 'Воспроизвести произношение'
                  : 'Синтезировать и воспроизвести произношение'
            }
          >
            {wordAudioLoading ? '🔊 Синтез...' : wordAudioUrl ? '▶ Произношение' : '🔊 Произношение'}
          </button>
        </div>
      </div>

      {word.translations && word.translations.length > 0 && (
        <div className="zh-translation-block">
          <div className="zh-translation-label">Перевод</div>
          <div className="en-translation-chips">
            {word.translations.map((item, idx) => (
              <span key={`${item.translation}-${idx}`} className="en-translation-chip">
                {item.translation}
              </span>
            ))}
          </div>
        </div>
      )}

      {examples.length > 0 && (
        <div>
          <div className="zh-translation-label" style={{ marginBottom: '0.5rem' }}>
            Примеры
          </div>
          <ul className="en-example-list">
            {examples.map((example, idx) => (
              <li key={`${example}-${idx}`} className="en-example-item">
                {example}
              </li>
            ))}
          </ul>
        </div>
      )}

      {word.notes ? (
        <div className="zh-translation-block">
          <div className="zh-translation-label">Заметка</div>
          <div className="zh-translation-text" style={{ fontSize: '0.92rem', fontWeight: 500 }}>
            {word.notes}
          </div>
        </div>
      ) : null}

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

      {word.videos && word.videos.length > 0 && (
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
            {word.videos.map((v) => (
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

      <audio ref={wordAudioRef} src={wordAudioUrl || undefined} />
    </div>
  );
}
