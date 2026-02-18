'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Sparkline } from '@/components/ui/Sparkline';
import { useCountUp } from '@/components/ui/useCountUp';
import styles from './progress.module.css';

/* ─── types ──────────────────────────────────────────────────── */

type DeltaValue = {
  diff: number;
  label: string;
} | null;

export type KpiCardsProps = {
  avgScore: number | null;
  sessionsCount: number;
  bestScore: number | null;
  avgScoreSparkline: number[];
  sessionsSparkline: number[];
  avgScoreDelta: DeltaValue;
  sessionsDelta: DeltaValue;
};

/* ─── single card ────────────────────────────────────────────── */

function KpiCard({
  label,
  value,
  displayValue,
  hint,
  sparkline,
  sparklineColor,
  delta,
  onClick,
}: {
  label: string;
  value: number;
  displayValue: string;
  hint: string;
  sparkline?: number[];
  sparklineColor?: string;
  delta?: DeltaValue;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'article';
  const tagProps = onClick
    ? { type: 'button' as const, onClick, className: `${styles.kpiCard} ${styles.kpiCardClickable}` }
    : { className: styles.kpiCard };

  return (
    <Tag {...tagProps}>
      <span className={styles.kpiLabel}>{label}</span>
      <div className={styles.kpiRow}>
        <strong className={styles.kpiValue}>{displayValue}</strong>
        {sparkline && sparkline.length >= 2 && (
          <Sparkline values={sparkline} color={sparklineColor} width={72} height={22} />
        )}
      </div>
      <div className={styles.kpiBottom}>
        <span className={styles.kpiHint}>{hint}</span>
        {delta && Math.abs(delta.diff) >= 0.05 && (
          <span
            className={styles.kpiDelta}
            style={{
              color: delta.diff > 0 ? 'var(--accent)' : 'rgba(239, 68, 68, 0.9)',
            }}
          >
            {delta.diff > 0 ? '↑' : '↓'}{' '}
            {Math.abs(delta.diff) % 1 === 0
              ? Math.abs(delta.diff)
              : Math.abs(delta.diff).toFixed(1)}{' '}
            {delta.label}
          </span>
        )}
      </div>
    </Tag>
  );
}

/* ─── KpiCards grid ──────────────────────────────────────────── */

export function KpiCards({
  avgScore,
  sessionsCount,
  bestScore,
  avgScoreSparkline,
  sessionsSparkline,
  avgScoreDelta,
  sessionsDelta,
}: KpiCardsProps) {
  const router = useRouter();

  const avgDisplay = useCountUp({
    target: avgScore ?? 0,
    decimals: 1,
    enabled: avgScore != null,
  });
  const sessionsDisplay = useCountUp({ target: sessionsCount, duration: 500 });
  const bestDisplay = useCountUp({
    target: bestScore ?? 0,
    decimals: 1,
    enabled: bestScore != null,
  });

  return (
    <div className={styles.kpiGrid}>
      <KpiCard
        label="Средний балл"
        value={avgScore ?? 0}
        displayValue={avgScore != null ? avgDisplay : '—'}
        hint="из 10"
        sparkline={avgScoreSparkline}
        delta={avgScoreDelta}
      />
      <KpiCard
        label="Сессии"
        value={sessionsCount}
        displayValue={sessionsDisplay}
        hint="выбранный период"
        sparkline={sessionsSparkline}
        sparklineColor="rgba(103, 199, 163, 0.8)"
        delta={sessionsDelta}
      />
      <KpiCard
        label="Лучший балл"
        value={bestScore ?? 0}
        displayValue={bestScore != null ? bestDisplay : '—'}
        hint="за период"
        sparklineColor="rgba(250, 204, 21, 0.8)"
      />
    </div>
  );
}
