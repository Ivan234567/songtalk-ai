'use client';

import React from 'react';
import { SenseCourseTimeline } from './SenseCourseTimeline';
import styles from './word-detail-card.module.css';

export type WordExample = {
  text: string;
  translation?: string | null;
};

export type WordSenseCard = {
  id: string | null;
  gloss_ru: string;
  definition?: string | null;
  part_of_speech: string | null;
  examples: Array<string | WordExample>;
};

export type WordCardPayload = {
  vocabulary_id: string;
  headword: string;
  phonetic: string | null;
  pinyin: string | null;
  part_of_speech: string | null;
  difficulty_level?: string | null;
  senses: WordSenseCard[];
  examples: Array<string | WordExample>;
  enriched?: boolean;
};

type WordStatus = 'new' | 'learning' | 'due' | 'mastered';
export type SpeechProgress = 'none' | 'said' | 'repeated';

type Props = {
  card: WordCardPayload | null;
  loading: boolean;
  error: string | null;
  speaking: boolean;
  status?: WordStatus | null;
  speech?: SpeechProgress | null;
  recognizes?: boolean;
  progress?: number | null;
  nextLabel?: string | null;
  index?: number;
  total?: number;
  onClose: () => void;
  onSpeak: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onRemove?: () => void;
  onPractice?: () => void;
};

const STATUS_LABEL: Record<WordStatus, string> = {
  new: 'Новые',
  learning: 'Учу',
  due: 'К повторению',
  mastered: 'Освоены',
};

const STATUS_COLOR: Record<WordStatus, string> = {
  new: '#7aa2ff',
  learning: '#ffa14d',
  due: '#ff7a7a',
  mastered: '#6fdc9a',
};

const SPEECH_LADDER: Array<{ id: SpeechProgress; label: string }> = [
  { id: 'none', label: 'Новое' },
  { id: 'said', label: 'Сказал сам' },
  { id: 'repeated', label: 'Повторно использовал' },
];

function speechStage(speech: SpeechProgress | null) {
  if (speech === 'repeated') return 2;
  if (speech === 'said') return 1;
  return 0;
}

function asExample(value: string | WordExample | undefined) {
  if (!value) return null;
  if (typeof value === 'string') return { text: value, translation: '' };
  return { text: value.text, translation: value.translation || '' };
}

function Chevron({ dir }: { dir: 'l' | 'r' }) {
  return (
    <svg className={styles.ico} viewBox="0 0 24 24" aria-hidden="true">
      <path d={dir === 'l' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  );
}

export function WordDetailCard({
  card,
  loading,
  error,
  speaking,
  status = null,
  speech = 'none',
  recognizes = false,
  nextLabel = null,
  index = 0,
  total = 0,
  onClose,
  onSpeak,
  onPrev,
  onNext,
  onPractice,
}: Props) {
  const sense = card?.senses?.[0];
  const example = asExample(sense?.examples?.[0] || card?.examples?.[0]);
  const statusKey = status || 'new';
  const stage = speechStage(speech);
  const ipa = [card?.phonetic || card?.pinyin, card?.part_of_speech || sense?.part_of_speech]
    .filter(Boolean)
    .join(' · ');
  const gloss = sense?.gloss_ru || '';
  const definition = sense?.definition || '';

  return (
    <div className={styles.scrim} onClick={onClose} role="presentation">
      <aside
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={card?.headword || 'Слово в словаре'}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.nav}>
          <div>
            <button type="button" className={styles.ib} onClick={onPrev} disabled={!onPrev || index <= 0} aria-label="Предыдущее">
              <Chevron dir="l" />
            </button>
            <span>{total > 0 ? `${index + 1} из ${total}` : '—'}</span>
            <button type="button" className={styles.ib} onClick={onNext} disabled={!onNext || index >= total - 1} aria-label="Следующее">
              <Chevron dir="r" />
            </button>
          </div>
          <button type="button" className={styles.ib} onClick={onClose} aria-label="Закрыть">
            <svg className={styles.ico} viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {loading && !card && <p className={styles.mut}>Открываем слово…</p>}
        {error && <p className={styles.err}>{error}</p>}

        {card && (
          <>
            <span className={styles.st} style={{ ['--c' as string]: STATUS_COLOR[statusKey] }}>
              {STATUS_LABEL[statusKey]}{nextLabel ? ` · ${nextLabel}` : ''}
            </span>
            <div className={styles.hw}>{card.headword}</div>
            <div className={styles.ph}>
              <span>{ipa}</span>
              <button type="button" className={styles.ib} aria-label="Произнести" disabled={speaking} onClick={onSpeak}>
                <svg className={styles.ico} viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 9.5v5h4l5 4v-13l-5 4zM16.5 8.5a5 5 0 010 7" />
                </svg>
              </button>
            </div>
            {(gloss || definition) && (
              <p className={styles.def}>
                {gloss && <b>{gloss}</b>}
                {gloss && definition ? ' — ' : ''}
                {definition}
              </p>
            )}
            {example?.text && (
              <div className={styles.bub}>
                <b>{example.text}</b>
                {example.translation && <small>{example.translation}</small>}
              </div>
            )}
            <div className={styles.sec}>
              <h3>Речь</h3>
              <ol className={styles.lad}>
                {SPEECH_LADDER.map((item, step) => (
                  <li
                    key={item.id}
                    className={[
                      step <= stage ? styles.done : '',
                      step === stage ? styles.now : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {item.label}
                  </li>
                ))}
              </ol>
              {recognizes && <p className={styles.mut}>Узнавание · Узнаёт</p>}
            </div>
            <SenseCourseTimeline senseId={sense?.id} variant="sheet" />
            {onPractice && (
              <button type="button" className={styles.practice} onClick={onPractice}>
                Сказать в сцене
              </button>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
