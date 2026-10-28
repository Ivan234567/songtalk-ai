'use client';

import React from 'react';
import type { ChatPracticeSense, PracticeVerdict } from './ChatPracticeWords';
import styles from './practice-words-progress.module.css';

export type PracticeProgressStatus = 'waiting' | 'used' | 'not_counted';

export type PracticeProgressItem = {
  senseId: string;
  headword: string;
  glossRu: string;
  status: PracticeProgressStatus;
  verdict?: string;
};

const VERDICT_OK = new Set(['produced']);

type PracticeWordsProgressProps = {
  senses: ChatPracticeSense[];
  items?: PracticeProgressItem[] | null;
  results?: PracticeVerdict[] | null;
  usedCount?: number;
  totalCount?: number;
  locked?: boolean;
  revealed?: Record<string, boolean>;
  onToggleReveal?: (senseId: string) => void;
  assessable?: boolean;
  assessing?: boolean;
  assessError?: string | null;
  storeWarning?: string | null;
  onAssess?: () => void;
};

function toneForSense(
  senseId: string,
  progress: PracticeProgressItem | undefined,
  result: PracticeVerdict | undefined,
): 'ok' | 'bad' | 'idle' | 'maybe' {
  if (result) return VERDICT_OK.has(result.verdict) ? 'ok' : 'bad';
  if (progress?.status === 'used') return 'ok';
  if (progress?.status === 'not_counted') return 'maybe';
  return 'idle';
}

function captionForSense(
  sense: ChatPracticeSense,
  progress: PracticeProgressItem | undefined,
  result: PracticeVerdict | undefined,
): string {
  if (result) {
    if (result.verdict === 'produced') {
      const days = result.intervalDays;
      if (days != null && Number.isInteger(days) && days > 0) return `Сказал сам · через ${days} дн.`;
      return 'Сказал сам';
    }
    if (result.verdict === 'unused') return 'Не прозвучало';
    if (result.verdict === 'wrong_sense') return 'Другой смысл';
    if (result.verdict === 'echoed') return 'Повтор за ИИ';
    if (result.verdict === 'hinted') return 'После подсказки';
    if (result.verdict === 'mentioned') return 'Неясно';
    return result.verdict;
  }
  if (progress?.status === 'used') return 'Использовано в разговоре';
  if (progress?.status === 'not_counted') return 'Пока не засчитано';
  return 'Ждём в речи';
}

export function PracticeWordsProgress({
  senses,
  items = null,
  results = null,
  usedCount,
  totalCount,
  locked = false,
  revealed = {},
  onToggleReveal,
  assessError = null,
  storeWarning = null,
}: PracticeWordsProgressProps) {
  if (!senses.length) return null;
  const byId = new Map((items || []).map((item) => [item.senseId, item]));
  const resultById = new Map((results || []).map((item) => [item.senseId, item]));
  const assessed = (results || []).length > 0;
  const total = totalCount ?? senses.length;
  const used = assessed
    ? (results || []).filter((item) => VERDICT_OK.has(item.verdict)).length
    : usedCount ?? (items || []).filter((item) => item.status === 'used').length;
  return (
    <section className={styles.wrap} aria-label="Слова в разговоре">
      <div className={styles.head}>
        <span className={styles.eyebrow}>Скажи сам</span>
        <span className={styles.counter} data-done={used >= total && total > 0 ? '1' : '0'}>
          {used}/{total}
        </span>
      </div>

      <ul className={styles.list}>
        {senses.map((sense) => {
          const progress = byId.get(sense.senseId);
          const result = resultById.get(sense.senseId);
          const tone = toneForSense(sense.senseId, progress, result);
          return (
            <li key={sense.senseId} className={styles.item} data-tone={tone}>
              <div className={styles.card}>
                <span className={styles.rail} aria-hidden />
                <span className={styles.body}>
                  <span className={styles.headwordRow}>
                    <span className={styles.headword}>{sense.headword}</span>
                    <span className={styles.toneMark} aria-hidden>
                      {tone === 'ok' ? '✓' : tone === 'bad' ? '!' : ''}
                    </span>
                  </span>
                  <span className={`${styles.glossBlock} ${styles.glossOpen}`}>
                    <span className={styles.glossLabel}>Перевод</span>
                    <span className={styles.gloss}>{sense.glossRu}</span>
                  </span>
                  <span className={styles.caption}>{captionForSense(sense, progress, result)}</span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {assessError && <p className={styles.hint}>{assessError}</p>}
      {storeWarning && <p className={styles.hint}>{storeWarning}</p>}
    </section>
  );
}

export function mapPracticeProgressPayload(data: {
  items?: Array<{
    sense_id?: string;
    headword?: string;
    gloss_ru?: string;
    status?: string;
    verdict?: string;
  }>;
  used_count?: number;
  total_count?: number;
} | null | undefined): {
  items: PracticeProgressItem[];
  usedCount: number;
  totalCount: number;
} | null {
  if (!data || !Array.isArray(data.items)) return null;
  const items = data.items.flatMap((item) => {
    const senseId = typeof item?.sense_id === 'string' ? item.sense_id : '';
    const headword = typeof item?.headword === 'string' ? item.headword.trim() : '';
    const glossRu = typeof item?.gloss_ru === 'string' ? item.gloss_ru.trim() : '';
    const status = item?.status === 'used' || item?.status === 'not_counted' || item?.status === 'waiting'
      ? item.status
      : null;
    return senseId && status ? [{
      senseId,
      headword,
      glossRu,
      status,
      verdict: typeof item?.verdict === 'string' ? item.verdict : undefined,
    }] : [];
  });
  if (!items.length) return null;
  return {
    items,
    usedCount: typeof data.used_count === 'number' ? data.used_count : items.filter((i) => i.status === 'used').length,
    totalCount: typeof data.total_count === 'number' ? data.total_count : items.length,
  };
}
