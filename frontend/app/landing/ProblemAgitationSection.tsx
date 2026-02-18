'use client';

import React, { useState, useEffect, useRef } from 'react';
import styles from './landing.module.css';

const FEATURE_IDS = {
  agent: 'feature-slide-agent',
  karaoke: 'feature-slide-karaoke',
  progress: 'feature-slide-progress',
  dictionary: 'feature-slide-dictionary',
} as const;

export type FeatureSectionId = keyof typeof FEATURE_IDS;

interface ProblemAgitationSectionProps {
  onScrollToFeature: (sectionId: string) => void;
}

export function ProblemAgitationSection({ onScrollToFeature }: ProblemAgitationSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => setInView(e.isIntersecting),
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const handleScrollTo = (id: FeatureSectionId) => {
    onScrollToFeature(FEATURE_IDS[id]);
  };

  return (
    <section
      id="problem"
      ref={sectionRef}
      className={styles.problemSection}
      aria-labelledby="problem-section-title"
    >
      <div className={styles.problemSectionInner}>
        <p id="problem-section-title" className={styles.problemSectionLabel}>
          Вы не один такой
        </p>
        <h2 className={styles.problemSectionTitle}>
          Узнаёте себя?
        </h2>

        <div className={styles.problemCards}>
          {/* Блок 1: Боль — понимаешь, но молчишь */}
          <div className={`${styles.problemCard} ${inView ? styles.problemCardRevealed : ''}`}>
            <div className={styles.problemCardGlow} aria-hidden />
            <p className={styles.problemCardQuestion}>
              Понимаю всё, но молчу?
            </p>
            <p className={styles.problemCardText}>
              Понимание и говорение — это два разных навыка. Вы отлично научились слушать, а разговорная «мышца» пока не натренирована. Ей нужна не критика, а спокойная практика, где ошибки — это нормально.
            </p>
            <button
              type="button"
              onClick={() => handleScrollTo('agent')}
              className={styles.problemCardCta}
            >
              <span className={styles.problemCardCtaText}>Собеседник</span>
              <span className={styles.problemCardCtaArrow} aria-hidden>→</span>
            </button>
          </div>

          {/* Блок 2: Агитация — слова, прогресс, контекст */}
          <div className={`${styles.problemCard} ${inView ? styles.problemCardRevealed : ''}`} style={{ animationDelay: '0.12s' }}>
            <div className={styles.problemCardGlow} aria-hidden />
            <p className={styles.problemCardQuestion}>
              Учите слова по песням и сериалам, но они вылетают из головы? Не видите, растёте ли вы вообще?
            </p>
            <p className={styles.problemCardText}>
              Нет системы повторений, контекста и понятного прогресса. Хочется собирать лексику из любимого контента и видеть результат в цифрах.
            </p>
            <div className={styles.problemCardCtaGroup}>
              <button type="button" onClick={() => handleScrollTo('karaoke')} className={styles.problemCardCtaSmall}>
                Караоке
              </button>
              <button type="button" onClick={() => handleScrollTo('dictionary')} className={styles.problemCardCtaSmall}>
                Словарь
              </button>
              <button type="button" onClick={() => handleScrollTo('progress')} className={styles.problemCardCtaSmall}>
                Аналитика
              </button>
            </div>
          </div>
        </div>

        <p className={styles.problemSectionHint}>
          Нажмите на решение — покажем, как это работает
        </p>
      </div>
    </section>
  );
}
