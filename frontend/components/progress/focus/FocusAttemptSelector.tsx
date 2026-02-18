'use client';

import React, { useMemo } from 'react';
import styles from './focus.module.css';

type FocusAttempt = {
  attemptId: string;
  completedAt: string;
  overallScore: number | null;
  stepCompletionPct: number | null;
};

type FocusAttemptSelectorProps = {
  attempts: FocusAttempt[];
  selectedAttemptId: string | null;
  onSelect: (attemptId: string) => void;
  className?: string;
};

export function FocusAttemptSelector({
  attempts,
  selectedAttemptId,
  onSelect,
  className = '',
}: FocusAttemptSelectorProps) {
  // Reverse to show chronologically (oldest first)
  const chronoAttempts = useMemo(() => [...attempts].reverse(), [attempts]);

  // Calculate progress stats
  const progressStats = useMemo(() => {
    const scores = chronoAttempts
      .map((a) => a.overallScore)
      .filter((s): s is number => s != null);

    if (scores.length < 2) {
      return { delta: null, trend: 'neutral' as const, attemptsCount: attempts.length };
    }

    const first = scores[0];
    const last = scores[scores.length - 1];
    const delta = Math.round((last - first) * 10) / 10;
    const trend = delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral';

    return { delta, trend, attemptsCount: attempts.length };
  }, [attempts.length, chronoAttempts]);

  // Find best score
  const bestScore = useMemo(() => {
    const scores = attempts
      .map((a) => a.overallScore)
      .filter((s): s is number => s != null);
    return scores.length > 0 ? Math.max(...scores) : null;
  }, [attempts]);

  if (attempts.length === 0) {
    return (
      <section className={`${styles.card} ${className}`}>
        <h2 className={styles.sectionTitle}>История попыток</h2>
        <p style={{ marginTop: '0.6rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          Нет попыток для отображения.
        </p>
      </section>
    );
  }

  return (
    <section className={`${styles.card} ${className}`}>
      <div className={styles.timelineHeader}>
        <h2 className={styles.sectionTitle}>История попыток</h2>
        {progressStats.delta != null && (
          <div className={`${styles.timelineTrend} ${styles[`timelineTrend${progressStats.trend === 'up' ? 'Up' : progressStats.trend === 'down' ? 'Down' : 'Neutral'}`]}`}>
            <span className={styles.timelineTrendIcon}>
              {progressStats.trend === 'up' ? '↑' : progressStats.trend === 'down' ? '↓' : '→'}
            </span>
            <span className={styles.timelineTrendValue}>
              {progressStats.delta > 0 ? '+' : ''}{progressStats.delta}
            </span>
            <span className={styles.timelineTrendLabel}>
              за {progressStats.attemptsCount} {progressStats.attemptsCount === 1 ? 'попытку' : progressStats.attemptsCount < 5 ? 'попытки' : 'попыток'}
            </span>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className={styles.timeline}>
        {/* Progress line */}
        <div className={styles.timelineLine}>
          <div 
            className={styles.timelineLineFill}
            style={{
              width: attempts.length > 1 
                ? `${((chronoAttempts.findIndex((a) => a.attemptId === selectedAttemptId) + 1) / chronoAttempts.length) * 100}%`
                : '100%',
            }}
          />
        </div>

        {/* Points */}
        <div className={styles.timelinePoints}>
          {chronoAttempts.map((attempt, index) => {
            const isActive = attempt.attemptId === selectedAttemptId;
            const isBest = attempt.overallScore === bestScore && bestScore != null;
            const attemptDate = new Date(attempt.completedAt).toLocaleDateString('ru-RU', {
              day: '2-digit',
              month: 'short',
            });

            return (
              <button
                key={attempt.attemptId}
                type="button"
                className={`${styles.timelinePoint} ${isActive ? styles.timelinePointActive : ''} ${isBest ? styles.timelinePointBest : ''}`}
                onClick={() => onSelect(attempt.attemptId)}
                title={`Попытка #${index + 1} — ${attemptDate}`}
              >
                {/* Point dot */}
                <div className={styles.timelinePointDot}>
                  {isActive && <div className={styles.timelinePointPulse} />}
                  <div className={styles.timelinePointCore}>
                    {isBest && <span className={styles.timelinePointStar}>★</span>}
                  </div>
                </div>

                {/* Score */}
                <div className={styles.timelinePointScore}>
                  {attempt.overallScore != null ? attempt.overallScore.toFixed(1) : '—'}
                </div>

                {/* Number and date */}
                <div className={styles.timelinePointMeta}>
                  <span className={styles.timelinePointNumber}>#{index + 1}</span>
                  <span className={styles.timelinePointDate}>{attemptDate}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected attempt details */}
      {selectedAttemptId && (
        <div className={styles.timelineDetails}>
          {(() => {
            const selected = attempts.find((a) => a.attemptId === selectedAttemptId);
            if (!selected) return null;
            const chronoIndex = chronoAttempts.findIndex((a) => a.attemptId === selectedAttemptId);

            return (
              <>
                <div className={styles.timelineDetailItem}>
                  <span className={styles.timelineDetailIcon}>📊</span>
                  <span className={styles.timelineDetailLabel}>Балл:</span>
                  <span className={styles.timelineDetailValue}>
                    {selected.overallScore != null ? selected.overallScore.toFixed(1) : '—'}/10
                  </span>
                </div>
                <div className={styles.timelineDetailItem}>
                  <span className={styles.timelineDetailIcon}>📅</span>
                  <span className={styles.timelineDetailLabel}>Дата:</span>
                  <span className={styles.timelineDetailValue}>
                    {new Date(selected.completedAt).toLocaleDateString('ru-RU', {
                      day: '2-digit',
                      month: 'long',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </section>
  );
}
