'use client';

import React, { useMemo, useState } from 'react';
import type { CriteriaScores } from '@/lib/speaking-assessment';
import styles from './progress.module.css';

type CriteriaItem = {
  key: keyof CriteriaScores;
  label: string;
  value: number;
  min: number | null;
  max: number | null;
  samples: number;
  delta: number;
};

type CriteriaOverviewProps = {
  criteria: CriteriaItem[];
  selectedCriterionKey?: keyof CriteriaScores | null;
  onCriterionSelect?: (key: keyof CriteriaScores | null) => void;
  className?: string;
};

function getBarColor(score: number): string {
  if (score >= 7.5) return 'var(--accent)';
  if (score >= 5) return 'rgba(245, 158, 11, 0.9)';
  return 'rgba(239, 68, 68, 0.9)';
}

type ViewMode = 'bars' | 'radar';

function buildRadarPoints(values: number[], cx: number, cy: number, radius: number): string {
  return values
    .map((v, i) => {
      const angle = (-Math.PI / 2) + ((Math.PI * 2) / values.length) * i;
      const r = (Math.max(0, Math.min(10, v)) / 10) * radius;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

function getTrendLabel(delta: number): string {
  if (Math.abs(delta) < 0.05) return 'стабильно';
  return delta > 0 ? `рост +${delta.toFixed(1)}` : `снижение ${delta.toFixed(1)}`;
}

export function CriteriaOverview({
  criteria,
  selectedCriterionKey = null,
  onCriterionSelect,
  className = '',
}: CriteriaOverviewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('bars');

  const radarPolygon = useMemo(
    () => buildRadarPoints(criteria.map((c) => c.value), 100, 100, 74),
    [criteria]
  );

  if (criteria.length === 0) {
    return (
      <section className={`${styles.card} ${className}`}>
        <h3 className={styles.sectionTitle}>Критерии оценки</h3>
        <p className={styles.sectionHint} style={{ marginTop: '0.5rem' }}>
          Нет оценок для выбранных фильтров.
        </p>
      </section>
    );
  }

  return (
    <section className={`${styles.card} ${className}`}>
      <div className={styles.criteriaTopRow}>
        <h3 className={styles.sectionTitle}>Критерии оценки</h3>
        <div className={styles.criteriaViewToggle}>
          <button
            type="button"
            className={`${styles.criteriaToggleBtn} ${viewMode === 'bars' ? styles.criteriaToggleBtnActive : ''}`}
            onClick={() => setViewMode('bars')}
          >
            Бары
          </button>
          <button
            type="button"
            className={`${styles.criteriaToggleBtn} ${viewMode === 'radar' ? styles.criteriaToggleBtnActive : ''}`}
            onClick={() => setViewMode('radar')}
          >
            Радар
          </button>
        </div>
      </div>

      {viewMode === 'bars' ? (
        <div className={styles.criteriaGrid} style={{ marginTop: 8 }}>
          {criteria.map((c) => {
            const pct = Math.max(0, Math.min(100, c.value * 10));
            const barColor = getBarColor(c.value);
            const isActive = selectedCriterionKey === c.key;
            const tooltip = `Оценок: ${c.samples} · min: ${c.min != null ? c.min.toFixed(1) : '—'} · max: ${c.max != null ? c.max.toFixed(1) : '—'} · ${getTrendLabel(c.delta)}`;
            return (
              <button
                key={c.key}
                type="button"
                className={`${styles.criteriaItem} ${isActive ? styles.criteriaItemActive : ''}`}
                onClick={() => onCriterionSelect?.(isActive ? null : c.key)}
                title={tooltip}
              >
                <div className={styles.criteriaHeader}>
                  <span className={styles.criteriaLabel}>{c.label}</span>
                  <span className={styles.criteriaValue}>
                    {c.value.toFixed(1)}
                    <span className={styles.criteriaTrend}>
                      {Math.abs(c.delta) < 0.05 ? '→' : c.delta > 0 ? '↑' : '↓'}
                    </span>
                  </span>
                </div>
                <div className={styles.criteriaBar}>
                  <div
                    className={styles.criteriaFill}
                    style={{ width: `${pct}%`, background: barColor }}
                  />
                </div>
                <div className={styles.criteriaStats}>
                  {c.samples} оценок · min {c.min != null ? c.min.toFixed(1) : '—'} · max{' '}
                  {c.max != null ? c.max.toFixed(1) : '—'}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className={styles.radarWrap}>
          <svg viewBox="0 0 200 200" className={styles.radarSvg} aria-label="Радар критериев">
            {[20, 40, 60, 80, 100].map((r, idx) => (
              <circle
                key={idx}
                cx="100"
                cy="100"
                r={(74 * r) / 100}
                fill="none"
                stroke="var(--stroke)"
                strokeOpacity={0.45}
                strokeDasharray="3 3"
              />
            ))}
            <polygon
              points={radarPolygon}
              fill="rgba(34, 197, 94, 0.2)"
              stroke="var(--accent)"
              strokeWidth="2"
            />
          </svg>
          <div className={styles.radarLegend}>
            {criteria.map((c) => {
              const isActive = selectedCriterionKey === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  className={`${styles.radarLegendItem} ${isActive ? styles.radarLegendItemActive : ''}`}
                  onClick={() => onCriterionSelect?.(isActive ? null : c.key)}
                >
                  <span>{c.label}</span>
                  <strong>{c.value.toFixed(1)}</strong>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
