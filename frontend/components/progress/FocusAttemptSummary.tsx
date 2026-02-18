'use client';

import React from 'react';
import { ScoreRing } from '@/components/ui/ScoreRing';
import styles from './progress.module.css';

type FocusAttemptSummaryProps = {
  attemptNumber: number | null;
  dateLabel: string;
  score: number | null;
  stepCompletionPct: number | null;
  goalSummary: string;
};

export function FocusAttemptSummary({
  attemptNumber,
  dateLabel,
  score,
  stepCompletionPct,
  goalSummary,
}: FocusAttemptSummaryProps) {
  return (
    <div className={styles.card}>
      <h3 className={styles.sectionTitle}>Сводка попытки</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1rem', alignItems: 'center', marginTop: '0.75rem' }}>
        <ScoreRing score={score} size={88} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {attemptNumber != null && (
            <div><span className={styles.kpiLabel}>Попытка</span> <strong>#{attemptNumber}</strong></div>
          )}
          <div><span className={styles.kpiLabel}>Дата</span> {dateLabel}</div>
          <div><span className={styles.kpiLabel}>Шаги</span> {stepCompletionPct != null ? `${stepCompletionPct}%` : '—'}</div>
          <div><span className={styles.kpiLabel}>Цели</span> {goalSummary}</div>
        </div>
      </div>
    </div>
  );
}
