'use client';

import React from 'react';
import styles from './word-detail-card.module.css';

export type WordSenseCard = {
  id: string | null;
  gloss_ru: string;
  part_of_speech: string | null;
  examples: string[];
};

export type WordCardPayload = {
  vocabulary_id: string;
  headword: string;
  phonetic: string | null;
  pinyin: string | null;
  part_of_speech: string | null;
  senses: WordSenseCard[];
  examples: string[];
  enriched?: boolean;
};

type Props = {
  card: WordCardPayload | null;
  loading: boolean;
  error: string | null;
  speaking: boolean;
  onClose: () => void;
  onSpeak: () => void;
};

export function WordDetailCard({ card, loading, error, speaking, onClose, onSpeak }: Props) {
  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <aside
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={card?.headword || 'Слово в словаре'}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.top}>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        {loading && <p className={styles.muted}>Ищем значения и примеры…</p>}
        {error && <p className={styles.error}>{error}</p>}

        {!loading && card && (
          <>
            <div className={styles.hero}>
              <div className={styles.headword}>{card.headword}</div>
              {(card.phonetic || card.pinyin) && (
                <div className={styles.phonetic}>{card.phonetic || card.pinyin}</div>
              )}
              {card.part_of_speech && <div className={styles.pos}>{card.part_of_speech}</div>}
              <button type="button" className={styles.speak} onClick={onSpeak} disabled={speaking}>
                {speaking ? 'Произносим…' : 'Произношение'}
              </button>
            </div>

            <div className={styles.section}>
              <h2 className={styles.label}>Значения</h2>
              <ol className={styles.senseList}>
                {card.senses.map((sense, index) => (
                  <li key={sense.id || `${sense.gloss_ru}-${index}`} className={styles.sense}>
                    <div className={styles.senseGloss}>
                      <span className={styles.senseIndex}>{index + 1}.</span>
                      {sense.gloss_ru}
                      {sense.part_of_speech ? (
                        <span className={styles.sensePos}>{sense.part_of_speech}</span>
                      ) : null}
                    </div>
                    {sense.examples.length > 0 && (
                      <ul className={styles.examples}>
                        {sense.examples.map((example) => (
                          <li key={example}>{example}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            </div>

            {card.examples.length > 0 && card.senses.every((sense) => sense.examples.length === 0) && (
              <div className={styles.section}>
                <h2 className={styles.label}>Примеры</h2>
                <ul className={styles.examples}>
                  {card.examples.map((example) => (
                    <li key={example}>{example}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
