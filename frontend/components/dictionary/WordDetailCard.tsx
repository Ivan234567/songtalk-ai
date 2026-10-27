'use client';

import React from 'react';
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

type Props = {
  card: WordCardPayload | null;
  loading: boolean;
  error: string | null;
  speaking: boolean;
  status?: WordStatus | null;
  progress?: number | null;
  index?: number;
  total?: number;
  onClose: () => void;
  onSpeak: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onRemove?: () => void;
};

const STATUS_LABEL: Record<WordStatus, string> = {
  new: 'Новые',
  learning: 'Учу',
  due: 'К повторению',
  mastered: 'Освоены',
};

const STATUS_HINT: Record<WordStatus, string> = {
  new: '— Ещё не изучалось',
  learning: '— В процессе изучения',
  due: '— Пора повторить',
  mastered: '— Уже в долгой памяти',
};

function asExample(item: string | WordExample): WordExample {
  if (typeof item === 'string') return { text: item, translation: null };
  return { text: item.text, translation: item.translation || null };
}

function BookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.18" />
      <path d="M8 12.5l2.5 2.5L16 9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 10v4h3l4 3V7l-4 3H4Z" fill="currentColor" />
      <path d="M15.5 9.5a4 4 0 0 1 0 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M17.8 7.2a7 7 0 0 1 0 9.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 7h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M9 7V5h6v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M8 7l1 12h6l1-12" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

export function WordDetailCard({
  card,
  loading,
  error,
  speaking,
  status = null,
  progress = null,
  index = 0,
  total = 0,
  onClose,
  onSpeak,
  onPrev,
  onNext,
  onRemove,
}: Props) {
  const meta = [
    card?.part_of_speech,
    card?.difficulty_level,
  ].filter(Boolean).map((item) => String(item).toUpperCase());

  const progressValue = Math.max(0, Math.min(100, Number(progress) || 0));
  const statusKey = status || 'new';

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <aside
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={card?.headword || 'Слово в словаре'}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.nav}>
          <div className={styles.navPager}>
            <button type="button" className={styles.iconBtn} onClick={onPrev} disabled={!onPrev || index <= 0} aria-label="Предыдущее слово">
              ‹
            </button>
            <span className={styles.counter}>{total > 0 ? `${index + 1} / ${total}` : '—'}</span>
            <button type="button" className={styles.iconBtn} onClick={onNext} disabled={!onNext || index >= total - 1} aria-label="Следующее слово">
              ›
            </button>
          </div>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        {loading && <p className={styles.muted}>Ищем значения и примеры…</p>}
        {error && <p className={styles.error}>{error}</p>}

        {!loading && card && (
          <>
            <div className={styles.hero}>
              <div className={styles.heroTop}>
                <div>
                  {meta.length > 0 && <div className={styles.meta}>{meta.join(' • ')}</div>}
                  <h1 className={styles.headword}>{card.headword}</h1>
                  <div className={styles.phoneticRow}>
                    {(card.phonetic || card.pinyin) && (
                      <span className={styles.phonetic}>{card.phonetic || card.pinyin}</span>
                    )}
                    <button
                      type="button"
                      className={styles.speakBtn}
                      onClick={onSpeak}
                      disabled={speaking}
                      aria-label="Произнести"
                      title="Произношение"
                    >
                      <SpeakerIcon />
                    </button>
                  </div>
                </div>
                {onRemove && (
                  <button type="button" className={styles.trashBtn} onClick={onRemove} aria-label="Убрать из списка" title="Убрать из списка">
                    <TrashIcon />
                  </button>
                )}
              </div>
            </div>

            <section className={styles.meanings}>
              <div className={styles.meaningsHead}>
                <BookIcon />
                <span>Значения</span>
              </div>
              <div className={styles.senseList}>
                {card.senses.map((sense, senseIndex) => {
                  const examples = (sense.examples || []).map(asExample);
                  return (
                    <article key={sense.id || `${sense.gloss_ru}-${senseIndex}`} className={styles.senseCard}>
                      <div className={styles.senseTitle}>
                        <span className={styles.check}><CheckIcon /></span>
                        <span>{sense.definition || sense.gloss_ru}</span>
                      </div>
                      <div className={styles.glossRow}>
                        <span className={styles.glossArrow}>→ {sense.gloss_ru}</span>
                        <div className={styles.chips}>
                          {sense.part_of_speech && <span className={styles.chip}>{sense.part_of_speech}</span>}
                          {card.difficulty_level && <span className={styles.chip}>{card.difficulty_level}</span>}
                        </div>
                      </div>
                      {examples.map((example) => (
                        <div key={example.text} className={styles.exampleBlock}>
                          <p className={styles.exampleEn}>{example.text}</p>
                          {example.translation && <p className={styles.exampleRu}>{example.translation}</p>}
                        </div>
                      ))}
                    </article>
                  );
                })}
              </div>
            </section>

            <section className={styles.progressCard}>
              <div
                className={styles.ring}
                style={{ background: `conic-gradient(var(--accent) ${progressValue * 3.6}deg, rgba(255,255,255,0.08) 0deg)` }}
              >
                <div className={styles.ringInner}>{progressValue}%</div>
              </div>
              <div className={styles.progressText}>
                <strong>{STATUS_LABEL[statusKey]}</strong>
                <span className={styles.statusPill}>{STATUS_HINT[statusKey]}</span>
              </div>
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
