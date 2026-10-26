'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ScoreRing } from '@/components/ui/ScoreRing';
import { TrendChart, type TrendChartPoint } from '@/components/ui/TrendChart';
import { PERIOD_FILTER_OPTIONS } from './hooks';
import type { PeriodFilterValue } from './hooks';
import styles from './progress.module.css';

export type DeltaInfo = {
  value: number;
  label: string;
  isPositive: boolean;
} | null;

type ProgressHeroProps = {
  periodFilter: PeriodFilterValue;
  avgScore: number | null;
  sessionsCount: number;
  trendPoints: TrendChartPoint[];
  selectedTrendKey: string | null;
  onTrendPointClick: (key: string | null) => void;
  weakestCriterionLabel: string | null;
  deltaVsPrevious?: DeltaInfo;
  streakDays?: number;
};

function getPeriodLabel(period: PeriodFilterValue): string {
  const opt = PERIOD_FILTER_OPTIONS.find((o) => o.value === period);
  return opt?.label ?? '30 дней';
}

export function ProgressHero({
  periodFilter,
  avgScore,
  sessionsCount,
  trendPoints,
  selectedTrendKey,
  onTrendPointClick,
  weakestCriterionLabel,
  deltaVsPrevious,
  streakDays,
}: ProgressHeroProps) {
  const router = useRouter();

  return (
    <div className={styles.hero}>
      <div className={styles.heroGrid}>
        {/* Left column: info */}
        <div className={styles.heroLeft}>
          <h2 className={styles.heroTitle}>Панель прогресса</h2>
          <p className={styles.heroSubtitle}>
            Твой прогресс за {getPeriodLabel(periodFilter)}.
          </p>
          <div className={styles.heroMetrics}>
            <ScoreRing score={avgScore} size={80} strokeWidth={6} />
            <div className={styles.heroMetricsText}>
              <div className={styles.heroHint}>средний балл из 10</div>
              <div className={styles.heroHint}>Практик: {sessionsCount} сессий</div>
              {weakestCriterionLabel && (
                <div className={styles.heroHint}>
                  Слабый критерий: <strong>{weakestCriterionLabel}</strong>
                </div>
              )}
            </div>
          </div>
          <div className={styles.heroMeta}>
            {deltaVsPrevious && (
              <span
                className={styles.heroDelta}
                style={{
                  color: deltaVsPrevious.isPositive ? 'var(--accent)' : 'rgba(239, 68, 68, 0.9)',
                }}
              >
                {deltaVsPrevious.isPositive ? '↑' : '↓'} {Math.abs(deltaVsPrevious.value).toFixed(1)}{' '}
                {deltaVsPrevious.label}
              </span>
            )}
            {typeof streakDays === 'number' && streakDays > 0 && (
              <span className={styles.heroStreak}>
                <span className={styles.heroStreakIcon}>🔥</span>
                {streakDays} {streakDays === 1 ? 'день' : streakDays < 5 ? 'дня' : 'дней'} подряд
              </span>
            )}
          </div>
          <div className={styles.heroActions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => router.push('/dashboard?tab=agent')}
            >
              Начать практику
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={() => router.push('/dashboard?tab=dictionary&review=1')}
            >
              Послушать слова
            </button>
          </div>
        </div>
        {/* Right column: chart */}
        <div className={styles.heroChartCol}>
          <TrendChart
            points={trendPoints}
            height={330}
            selectedKey={selectedTrendKey}
            onPointClick={(key) => onTrendPointClick(key === selectedTrendKey ? null : key)}
          />
        </div>
      </div>
    </div>
  );
}
