'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ProgressIcon } from '@/components/sidebar/Sidebar';
import styles from './landing.module.css';

/** Мини-кольцо балла 7.2/10 + подпись */
function ScoreRingMock() {
  return (
    <div className={styles.progressScoreWrap} role="img" aria-label="Средний балл">
      <div className={styles.progressScoreRing}>
        <span className={styles.progressScoreValue}>7.2</span>
        <span className={styles.progressScoreMax}>/10</span>
      </div>
      <span className={styles.progressScoreLabel}>средний балл</span>
    </div>
  );
}

/** Мини-бары критериев (беглость, лексика, произношение, логика) */
function CriteriaBarsMock() {
  const bars = [
    { label: 'Беглость', value: 78 },
    { label: 'Лексика', value: 85 },
    { label: 'Произн.', value: 72 },
    { label: 'Логика', value: 80 },
  ];
  return (
    <div className={styles.progressCriteriaWrap} role="img" aria-label="Критерии">
      {bars.map((b, i) => (
        <div key={i} className={styles.progressCriteriaRow}>
          <span className={styles.progressCriteriaLabel}>{b.label}</span>
          <div className={styles.progressCriteriaBarBg}>
            <div className={styles.progressCriteriaBarFill} style={{ width: `${b.value}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Одна рекомендация — «Практиковать: Сценарий X» */
function RecommendationMock() {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={`${styles.progressRecCard} ${hovered ? styles.progressRecCardHover : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="img"
      aria-label="Рекомендация"
    >
      <span className={styles.progressRecBadge}>Подтянуть беглость</span>
      <span className={styles.progressRecTitle}>Сценарий «Отель»</span>
      <span className={styles.progressRecCta}>{hovered ? 'Открыть →' : 'Практиковать'}</span>
    </div>
  );
}

/** Три строки фидбека: сильные стороны, зоны роста, полезные фразы */
function FeedbackMock() {
  return (
    <div className={styles.progressFeedbackWrap} role="img" aria-label="Фидбек">
      <div className={styles.progressFeedbackRow}>
        <span className={styles.progressFeedbackTag}>Сильные:</span>
        <span className={styles.progressFeedbackText}>чёткие ответы, хорошая лексика</span>
      </div>
      <div className={styles.progressFeedbackRow}>
        <span className={styles.progressFeedbackTag}>Рост:</span>
        <span className={styles.progressFeedbackText}>темп, связки между фразами</span>
      </div>
      <div className={styles.progressFeedbackRow}>
        <span className={styles.progressFeedbackTag}>Фразы:</span>
        <span className={styles.progressFeedbackText}>I’d like to…, Could you…?</span>
      </div>
    </div>
  );
}

/** Тренд-спарклайн + streak «5 дней» */
function TrendStreakMock() {
  const [hovered, setHovered] = useState(false);
  const points = [4, 5, 5.5, 6, 6.5, 7, 6.8, 7.2];
  return (
    <div
      className={`${styles.progressTrendWrap} ${hovered ? styles.progressTrendWrapHover : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="img"
      aria-label="Тренд и серия"
    >
      <div className={styles.progressTrendChart}>
        <svg viewBox="0 0 80 28" className={styles.progressTrendSvg}>
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points.map((y, i) => `${(i / (points.length - 1)) * 76 + 2},${26 - (y / 10) * 22}`).join(' ')}
          />
        </svg>
        <span className={styles.progressTrendLabel}>Балл по дням</span>
      </div>
      <div className={styles.progressStreakBadge}>
        <span className={styles.progressStreakFire}>🔥</span>
        <span className={styles.progressStreakDays}>5 дней</span>
      </div>
    </div>
  );
}

const featureBlocks = [
  {
    key: 'criteria',
    hero: true,
    title: 'Понятные критерии оценки',
    text: 'Узнай свой средний балл по 10-балльной шкале и детальный разбор навыков: беглость, лексика, произношение, логика.',
    illo: (
      <div className={styles.featureBlockIllo} role="img" aria-label="Критерии и балл">
        <ScoreRingMock />
        <CriteriaBarsMock />
      </div>
    ),
  },
  {
    key: 'recommendations',
    hero: false,
    title: 'Умные рекомендации',
    text: 'Система сама подскажет, какой сценарий или дебат лучше всего пройти, чтобы «подтянуть» самый слабый навык.',
    illo: (
      <div className={styles.featureBlockIllo} role="img" aria-label="Рекомендация">
        <RecommendationMock />
      </div>
    ),
  },
  {
    key: 'feedback',
    hero: false,
    title: 'Разбор каждого диалога',
    text: 'После каждой тренировки ты получаешь фидбек с сильными сторонами, зонами роста и списком полезных фраз из разговора.',
    illo: (
      <div className={styles.featureBlockIllo} role="img" aria-label="Фидбек">
        <FeedbackMock />
      </div>
    ),
  },
  {
    key: 'trends',
    hero: false,
    title: 'Тренды и серия дней',
    text: 'График среднего балла по времени и счётчик дней подряд с практикой — видишь прогресс и не теряешь мотивацию.',
    illo: (
      <div className={styles.featureBlockIllo} role="img" aria-label="Тренд и streak">
        <TrendStreakMock />
      </div>
    ),
  },
];

interface FeatureSlideProgressProps {
  sectionId?: string;
  highlight?: boolean;
}

export function FeatureSlideProgress({ sectionId, highlight }: FeatureSlideProgressProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const highlightPills = ['Критерии', 'Рекомендации', 'Разбор', 'Тренды'];

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => setInView(e.isIntersecting),
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section ref={sectionRef} id={sectionId} className={`${styles.featureSlide} ${highlight ? styles.featureSlideHighlight : ''}`} aria-labelledby="feature-progress-title">
      <div className={styles.featureSlideStage} aria-hidden="true" />
      <div className={styles.featureProjection} aria-hidden="true" />
      <div className={styles.featureSlideGrain} aria-hidden="true" />

      <div className={`${styles.featureSlideContent} ${styles.featureSlideContentGrid}`}>
        <div className={`${styles.featureSlideText} ${inView ? styles.featureSlideTextRevealed : ''}`}>
          <div className={styles.featureTextPanel}>
            <div className={styles.featurePills}>
              {highlightPills.map((pill, i) => (
                <span key={pill} className={styles.featurePill} style={{ animationDelay: `${i * 0.06}s` }}>
                  {pill}
                </span>
              ))}
            </div>
            <p className={styles.featureLabel}>Прогресс</p>
            <h2 id="feature-progress-title" className={styles.featureTitle}>
              <span className={styles.featureTitleBlock}>
                <span className={styles.featureTitleIcon} aria-hidden><ProgressIcon size={32} /></span>
                <span className={styles.featureTitleLine}>Аналитика: Твой прогресс в цифрах и фактах</span>
              </span>
            </h2>
            <p className={styles.featureTagline}>
              Больше никаких догадок — только объективные данные и четкие рекомендации.
            </p>
            <div className={styles.featureBlocksGrid}>
              {featureBlocks.map((block, i) => (
                <div
                  key={block.key}
                  className={`${styles.featureBlockCard} ${block.hero ? styles.featureBlockCardHero : ''}`}
                  style={{ animationDelay: `${0.08 + i * 0.1}s` }}
                >
                  <span className={styles.featureBlockNum} aria-hidden>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className={styles.featureBlockTitle}>{block.title}</span>
                  <span className={styles.featureBlockText}>{block.text}</span>
                  {block.illo}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
