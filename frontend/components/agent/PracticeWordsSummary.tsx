'use client';

import React from 'react';
import type { ChatPracticeSense, PracticeVerdict } from './ChatPracticeWords';
import type { PracticeProgressItem } from './PracticeWordsProgress';
import styles from './practice-words-summary.module.css';

const VERDICT_LABELS: Record<string, string> = {
  produced: 'Ты сказал сам',
  wrong_sense: 'Смысл другой',
  echoed: 'Повторил за собеседником',
  hinted: 'После подсказки',
  mentioned: 'Неясно, то ли слово',
  unused: 'Не прозвучало',
};

function intervalLabel(days?: number | null): string {
  if (days == null || !Number.isInteger(days) || days <= 0) return '';
  const mod10 = days % 10;
  const mod100 = days % 100;
  const word = mod10 === 1 && mod100 !== 11
    ? 'день'
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? 'дня'
      : 'дней';
  return `снова через ${days} ${word}`;
}

type PracticeWordsSummaryProps = {
  senses: ChatPracticeSense[];
  progressItems?: PracticeProgressItem[] | null;
  usedCount?: number;
  totalCount?: number;
  results?: PracticeVerdict[] | null;
  assessable?: boolean;
  assessing?: boolean;
  assessError?: string | null;
  storeWarning?: string | null;
  onAssess?: () => void;
  variant?: 'card' | 'plain';
};

export function PracticeWordsSummary({
  senses,
  progressItems = null,
  usedCount,
  totalCount,
  results = null,
  assessable = false,
  assessing = false,
  assessError = null,
  storeWarning = null,
  onAssess,
  variant = 'card',
}: PracticeWordsSummaryProps) {
  if (!senses.length) return null;

  const lines = results || [];
  const assessed = lines.length > 0;
  const progressById = new Map((progressItems || []).map((item) => [item.senseId, item]));
  const total = totalCount ?? senses.length;
  const used = assessed
    ? lines.filter((item) => item.verdict === 'produced').length
    : usedCount ?? (progressItems || []).filter((item) => item.status === 'used').length;
  const showButton = assessable && !assessed && Boolean(onAssess);

  return (
    <section
      className={variant === 'plain' ? `${styles.wrap} ${styles.plain}` : styles.wrap}
      aria-label="Итог слов в разговоре"
    >
      <div className={styles.head}>
        <div className={styles.titleBlock}>
          <span className={styles.eyebrow}>{assessed ? 'Разбор речи' : 'Итог по словам'}</span>
          <h3 className={styles.title}>
            {used} из {total}
            <span className={styles.titleMuted}>
              {assessed ? ' сказал сам' : ' использовано в разговоре'}
            </span>
          </h3>
        </div>
        <span className={styles.badge} data-done={used >= total && total > 0 ? '1' : '0'}>
          {used}/{total}
        </span>
      </div>

      <ul className={styles.list}>
        {senses.map((sense) => {
          const result = lines.find((item) => item.senseId === sense.senseId);
          const progress = progressById.get(sense.senseId);
          const status = progress?.status || 'waiting';
          const when = result && (result.verdict === 'produced' || result.verdict === 'wrong_sense')
            ? intervalLabel(result.intervalDays)
            : '';
          return (
            <li
              key={sense.senseId}
              className={styles.item}
              data-status={result ? result.verdict : status}
            >
              <span className={styles.dot} aria-hidden />
              <div className={styles.text}>
                <span className={styles.gloss}>{sense.glossRu}</span>
                <span className={styles.meta}>
                  {result
                    ? `${sense.headword}: ${VERDICT_LABELS[result.verdict] || result.verdict}${when ? ` · ${when}` : ''}`
                    : status === 'used'
                      ? `Использовано в разговоре${progress?.headword ? ` · ${progress.headword}` : ''}`
                      : status === 'not_counted'
                        ? 'Пока не засчитано'
                        : 'Ещё не сказал'}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {showButton && (
        <button
          type="button"
          className={styles.assessBtn}
          disabled={assessing}
          onClick={onAssess}
        >
          {assessing ? 'Слушаю…' : 'Проверить, сказал ли я сам'}
        </button>
      )}
      {assessing && !showButton && (
        <p className={styles.hint}>Слушаю, как ты сказал эти слова…</p>
      )}
      {assessError && <p className={styles.hint}>{assessError}</p>}
      {storeWarning && <p className={styles.hint}>{storeWarning}</p>}
      {!assessed && !showButton && !assessing && !assessError && (
        <p className={styles.hint}>
          Это ещё не оценка SRS — только что прозвучало в разговоре.
        </p>
      )}
    </section>
  );
}
