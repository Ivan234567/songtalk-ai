'use client';

import React from 'react';
import type { ChatPracticeSense } from './ChatPracticeWords';
import styles from './practice-words-progress.module.css';

export type PracticeProgressStatus = 'waiting' | 'used' | 'not_counted';

export type PracticeProgressItem = {
  senseId: string;
  headword: string;
  glossRu: string;
  status: PracticeProgressStatus;
  verdict?: string;
};

const STATUS_LABEL: Record<PracticeProgressStatus, string> = {
  waiting: 'Ещё не сказал',
  used: 'Использовано в разговоре',
  not_counted: 'Пока не засчитано',
};

type PracticeWordsProgressProps = {
  senses: ChatPracticeSense[];
  items?: PracticeProgressItem[] | null;
  usedCount?: number;
  totalCount?: number;
  locked?: boolean;
};

export function PracticeWordsProgress({
  senses,
  items = null,
  usedCount,
  totalCount,
  locked = false,
}: PracticeWordsProgressProps) {
  if (!senses.length) return null;
  const byId = new Map((items || []).map((item) => [item.senseId, item]));
  const total = totalCount ?? senses.length;
  const used = usedCount ?? (items || []).filter((item) => item.status === 'used').length;

  return (
    <section className={styles.wrap} aria-label="Прогресс слов в разговоре">
      <div className={styles.head}>
        <span className={styles.eyebrow}>Слова в разговоре</span>
        <span className={styles.counter}>
          {used}/{total}
        </span>
      </div>
      <ul className={styles.list}>
        {senses.map((sense) => {
          const row = byId.get(sense.senseId);
          const status: PracticeProgressStatus = row?.status
            || (locked ? 'waiting' : 'waiting');
          return (
            <li key={sense.senseId} className={styles.item} data-status={status}>
              <span className={styles.dot} aria-hidden />
              <div className={styles.text}>
                <span className={styles.gloss}>{sense.glossRu}</span>
                <span className={styles.meta}>
                  {STATUS_LABEL[status]}
                  {status === 'used' && row?.headword ? ` · ${row.headword}` : ''}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
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
