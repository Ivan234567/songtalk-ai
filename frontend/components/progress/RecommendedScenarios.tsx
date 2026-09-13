'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCriteriaLabel } from '@/lib/speaking-assessment';
import { Sparkline } from '@/components/ui/Sparkline';
import styles from './progress.module.css';

export type RecommendRow = {
  id: string;
  rowMode: 'roleplay' | 'debate' | 'voice';
  title: string;
  completedAt: string;
  score: number | null;
  criterionScore: number;
  objectKey: string;
  completionId: string;
  attemptsCount?: number;
  scoreHistory?: number[];
  reasonText?: string;
  priority?: 'high' | 'medium' | 'low';
  practiceMode?: 'rehearsal' | 'life' | 'stress';
  practiceLabel?: string;
};

type RecommendedScenariosProps = {
  weakestCriterionKey: string | null;
  rows: RecommendRow[];
  onOpenFocus?: (objectKey: string, completionId?: string) => void;
  onStartPractice?: (objectKey: string, practiceMode?: RecommendRow['practiceMode']) => void;
  className?: string;
  criterionLabelPrefix?: string;
  criterionLabel?: string;
};

export function RecommendedScenarios({
  weakestCriterionKey,
  rows,
  onOpenFocus,
  onStartPractice,
  className = '',
  criterionLabelPrefix = 'Слабый критерий',
  criterionLabel,
}: RecommendedScenariosProps) {
  const router = useRouter();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const showRecommendations = rows.length > 0;

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < maxScroll - 4);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => updateScrollState();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [rows.length, showRecommendations, updateScrollState]);

  if (!showRecommendations) {
    return (
      <section className={`${styles.card} ${className}`}>
        <h3 className={styles.sectionTitle}>Сценарии для повторения</h3>
        <p className={styles.sectionHint} style={{ marginTop: '0.5rem' }}>
          Недостаточно данных для рекомендаций. Пройдите больше сессий.
        </p>
      </section>
    );
  }

  const hasCriterion = Boolean(weakestCriterionKey && criterionLabel);

  const handleClick = (row: RecommendRow) => {
    if (onOpenFocus) {
      onOpenFocus(row.objectKey, row.completionId);
    } else {
      router.push(`/dashboard/progress/focus/${encodeURIComponent(row.objectKey)}?attempt=${row.completionId}`);
    }
  };

  const handlePracticeNow = (row: RecommendRow) => {
    if (onStartPractice) {
      onStartPractice(row.objectKey, row.practiceMode);
    } else {
      const params = new URLSearchParams({ tab: 'agent', from: 'progress', target: row.objectKey });
      if (row.practiceMode) params.set('play_mode', row.practiceMode);
      router.push(`/dashboard?${params.toString()}`);
    }
  };

  const priorityLabel = (p: RecommendRow['priority']) => {
    if (p === 'high') return 'Высокий приоритет';
    if (p === 'medium') return 'Средний приоритет';
    return 'Низкий приоритет';
  };

  const scrollCards = (dir: 'left' | 'right') => {
    const el = scrollerRef.current;
    if (!el) return;
    const firstCard = el.querySelector(`.${styles.recommendRow}`) as HTMLElement | null;
    const cardWidth = firstCard?.offsetWidth ?? Math.floor(el.clientWidth / 3);
    const gap = 10; // sync with css gap
    const delta = cardWidth + gap;
    el.scrollBy({ left: dir === 'right' ? delta : -delta, behavior: 'smooth' });
  };

  return (
    <section className={`${styles.card} ${className}`}>
      <h3 className={styles.sectionTitle}>Сценарии для повторения</h3>
      <p className={styles.sectionHint} style={{ marginTop: '0.25rem' }}>
        {hasCriterion ? (
          <>
            {criterionLabelPrefix}: <strong>{criterionLabel || getCriteriaLabel(weakestCriterionKey as 'fluency')}</strong>.
            Рекомендуем повторить:
          </>
        ) : (
          'Следующий слой той же сцены — не новый диалог.'
        )}
      </p>
      <div className={styles.recommendCarousel} style={{ marginTop: '0.45rem' }}>
        <button
          type="button"
          className={styles.recommendNavBtn}
          onClick={() => scrollCards('left')}
          aria-label="Прокрутить рекомендации влево"
          disabled={!canScrollLeft}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <div ref={scrollerRef} className={styles.recommendScroller}>
          {rows.map((row) => (
            <article
              key={row.id}
              className={styles.recommendRow}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <span className={styles.recommendTitle}>
                  {row.rowMode === 'roleplay' ? '🎭 ' : row.rowMode === 'voice' ? '🎙️ ' : '⚔️ '}
                  {row.title}
                </span>
                <span
                  className={`${styles.recommendPriority} ${
                    row.priority === 'high'
                      ? styles.recommendPriorityHigh
                      : row.priority === 'medium'
                        ? styles.recommendPriorityMedium
                        : styles.recommendPriorityLow
                  }`}
                >
                  {priorityLabel(row.priority)}
                </span>
              </div>

              <div className={styles.recommendCriterion}>
                {row.practiceMode
                  ? `Следующий слой: ${row.practiceMode === 'life' ? 'Как в жизни' : row.practiceMode === 'stress' ? 'Стресс' : 'Репетиция'}`
                  : `${criterionLabel || (weakestCriterionKey ? getCriteriaLabel(weakestCriterionKey as 'fluency') : 'Критерий')}: ${row.criterionScore.toFixed(1)} · Балл: ${
                      row.score != null ? row.score.toFixed(1) : '—'
                    }`}
              </div>

              {row.reasonText && (
                <div className={styles.recommendReason}>{row.reasonText}</div>
              )}

              {Array.isArray(row.scoreHistory) && row.scoreHistory.length >= 2 && (
                <div className={styles.recommendHistory}>
                  <Sparkline values={row.scoreHistory} width={110} height={26} color="rgba(34, 197, 94, 0.9)" />
                  <span className={styles.recommendMeta}>
                    {row.attemptsCount ?? row.scoreHistory.length} попыток
                  </span>
                </div>
              )}

              <div className={styles.recommendMeta}>
                Последняя сессия: {new Date(row.completedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
              </div>

              <div className={styles.recommendActions}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  onClick={() => handlePracticeNow(row)}
                >
                  {row.practiceLabel || 'Практиковать сейчас'}
                </button>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={() => handleClick(row)}
                >
                  Открыть разбор
                </button>
              </div>
            </article>
          ))}
        </div>
        <button
          type="button"
          className={styles.recommendNavBtn}
          onClick={() => scrollCards('right')}
          aria-label="Прокрутить рекомендации вправо"
          disabled={!canScrollRight}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </section>
  );
}
