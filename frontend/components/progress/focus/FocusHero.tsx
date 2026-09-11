'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './focus.module.css';

type FocusHeroProps = {
  title: string;
  subtitle: string | null;
  mode: 'roleplay' | 'debate' | 'voice';
  backHref: string;
  score: number | null;
  attemptNumber: number | null;
  dateLabel: string;
  stepCompletionPct: number | null;
  goalsDone: number;
  goalsTotal: number;
  bestScore: number | null;
  scoreMaxLabel?: string;
};

export function FocusHero({
  title,
  subtitle,
  mode,
  backHref,
  score,
  attemptNumber,
  dateLabel,
  stepCompletionPct,
  goalsDone,
  goalsTotal,
  bestScore,
  scoreMaxLabel = '/10',
}: FocusHeroProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (score == null) return;

    const duration = 800;
    const steps = 30;
    const increment = score / steps;
    let current = 0;
    let step = 0;

    const interval = setInterval(() => {
      step++;
      current = Math.min(score, increment * step);
      setAnimatedScore(current);
      if (step >= steps) clearInterval(interval);
    }, duration / steps);

    return () => clearInterval(interval);
  }, [score]);

  const displayScore = score != null ? animatedScore : null;
  const pct =
    displayScore != null
      ? Math.max(0, Math.min(100, scoreMaxLabel === '%' ? displayScore : (displayScore / 10) * 100))
      : 0;

  const modeLabel = mode === 'roleplay' ? 'Ролевой сценарий' : mode === 'voice' ? 'Голосовая минутка' : 'Дебаты';
  const modeIcon = mode === 'roleplay' ? '🎭' : mode === 'voice' ? '🎙️' : '⚔️';

  return (
    <section className={styles.hero}>
      {/* Top bar */}
      <div className={styles.heroTopBar}>
        <Link href={backHref} className={styles.heroBackBtn}>
          <span className={styles.heroBackIcon}>←</span>
          <span>Назад</span>
        </Link>
        <div className={styles.heroBadge}>
          <span>{modeIcon}</span>
          <span>{modeLabel}</span>
        </div>
      </div>

      {/* Score ring */}
      <div className={styles.heroScoreWrapper}>
        <div
          className={`${styles.heroScoreRing} ${mounted ? styles.heroScoreRingAnimated : ''}`}
          style={{
            background: `conic-gradient(var(--accent) ${pct}%, var(--bg) ${pct}% 100%)`,
          }}
        >
          <div className={styles.heroScoreInner}>
            <span className={styles.heroScoreValue}>
              {displayScore != null
                ? scoreMaxLabel === '%'
                  ? `${Math.round(displayScore)}`
                  : displayScore.toFixed(1)
                : '—'}
            </span>
            <span className={styles.heroScoreMax}>{scoreMaxLabel === '%' ? '%' : scoreMaxLabel}</span>
          </div>
        </div>
        {mounted && score != null && <div className={styles.heroScoreGlow} />}
      </div>

      {/* Title */}
      <h1 className={styles.heroTitle}>{title}</h1>
      {subtitle && <p className={styles.heroSubtitle}>{subtitle}</p>}

      {/* Meta */}
      <p className={styles.heroMeta}>
        {attemptNumber != null && <span>Попытка #{attemptNumber}</span>}
        {attemptNumber != null && <span className={styles.heroMetaDot}>·</span>}
        <span>{dateLabel}</span>
      </p>

      {/* KPI cards */}
      <div className={styles.heroKpiRow}>
        <div className={styles.heroKpiCard}>
          <span className={styles.heroKpiIcon}>🏆</span>
          <div className={styles.heroKpiContent}>
            <span className={styles.heroKpiValue}>
              {bestScore != null ? bestScore.toFixed(1) : '—'}
            </span>
            <span className={styles.heroKpiLabel}>Лучший</span>
          </div>
        </div>
      </div>
    </section>
  );
}
