'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ProgressIcon } from '@/components/sidebar/Sidebar';
import { LangPreviewToggle, useLandingPreviewLang, type LandingPreviewLang } from './preview-lang';
import styles from './landing.module.css';

function ScoreRingMock() {
  return (
    <div className={styles.prodKpi} role="img" aria-label="Средний балл">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          className={styles.prodRing}
          style={{ background: 'conic-gradient(rgba(34,197,94,0.92) 72%, rgba(255,255,255,0.14) 72% 100%)' }}
        >
          <div className={styles.prodRingInner}>
            <strong style={{ fontSize: '0.95rem', lineHeight: 1 }}>7.2</strong>
            <span style={{ fontSize: '0.58rem', opacity: 0.7 }}>из 10</span>
          </div>
        </div>
        <div>
          <div className={styles.prodKpiLabel}>Средний балл</div>
          <div className={styles.prodKpiValue}>7.2</div>
          <div style={{ fontSize: '0.65rem', color: 'rgba(107, 240, 176, 0.9)' }}>↑ 0.4 за неделю</div>
        </div>
      </div>
    </div>
  );
}

function CriteriaBarsMock({ previewLang }: { previewLang: LandingPreviewLang }) {
  const bars = previewLang === 'zh'
    ? [
        { label: 'Цель и шаги', value: 8.2 },
        { label: 'Слова урока', value: 8.5 },
        { label: 'Грамматика', value: 7.4 },
        { label: 'Диалог', value: 8.0 },
        { label: 'Связность', value: 7.6 },
      ]
    : [
        { label: 'Беглость', value: 7.8 },
        { label: 'Лексика и грамматика', value: 8.5 },
        { label: 'Произношение', value: 7.2 },
        { label: 'Полнота и логика', value: 8.0 },
        { label: 'Диалог', value: 7.6 },
      ];
  const color = (v: number) => (v >= 7.5 ? 'var(--accent, rgba(107,240,176,0.95))' : v >= 5 ? 'rgba(245, 158, 11, 0.9)' : 'rgba(239, 68, 68, 0.9)');
  return (
    <div className={styles.prodPanel} role="img" aria-label="Критерии">
      <span className={styles.prodPanelLabel}>Критерии оценки</span>
      {bars.map((b) => (
        <div key={b.label} className={styles.prodCriteriaRow}>
          <div className={styles.prodCriteriaTop}>
            <span>{b.label}</span>
            <span>{b.value.toFixed(1)}</span>
          </div>
          <div className={styles.prodCriteriaTrack}>
            <div className={styles.prodCriteriaFill} style={{ width: `${b.value * 10}%`, background: color(b.value) }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RecommendationMock({ previewLang }: { previewLang: LandingPreviewLang }) {
  const isZh = previewLang === 'zh';
  return (
    <div className={styles.prodPanel} role="img" aria-label="Рекомендация">
      <span className={styles.prodPanelLabel}>Сценарии для повторения</span>
      <p style={{ margin: 0, fontSize: '0.7rem', opacity: 0.75 }}>
        Слабый критерий: <strong>{isZh ? 'слова урока' : 'беглость'}</strong>
      </p>
      <div className={styles.prodWordCard} style={{ padding: '0.5rem 0.65rem' }}>
        <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(245, 158, 11, 0.95)' }}>Высокий приоритет</span>
        <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{isZh ? 'Голосовая минутка «Кафе»' : 'Сценарий «Отель»'}</span>
        <button type="button" className={`${styles.prodBtn} ${styles.prodBtnGreen}`} style={{ alignSelf: 'flex-start' }}>
          Практиковать
        </button>
      </div>
    </div>
  );
}

function FeedbackMock({ previewLang }: { previewLang: LandingPreviewLang }) {
  const isZh = previewLang === 'zh';
  return (
    <div className={styles.prodPanel} role="img" aria-label="Фидбек">
      <span className={styles.prodPanelLabel}>Разбор</span>
      <div className={styles.prodCheckItem} style={{ border: '1px solid rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.08)' }}>
        <span><strong>Сильные: </strong>{isZh ? 'цель сценария, слова урока' : 'чёткие ответы, хорошая лексика'}</span>
      </div>
      <div className={styles.prodCheckItem} style={{ border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.08)' }}>
        <span><strong>Рост: </strong>{isZh ? 'грамматика, связность реплик' : 'темп, связки между фразами'}</span>
      </div>
      <div style={{ fontSize: '0.72rem' }}>
        <strong>Фразы: </strong>{isZh ? '我想… / wǒ xiǎng' : 'I’d like to…, Could you…?'}
      </div>
    </div>
  );
}

function TrendStreakMock() {
  const points = [4, 5, 5.5, 6, 6.5, 7, 6.8, 7.2];
  return (
    <div className={styles.prodKpi} role="img" aria-label="Тренд и серия">
      <div className={styles.prodKpiLabel}>Балл по дням</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <svg viewBox="0 0 80 28" width="88" height="28" style={{ color: 'rgba(107, 240, 176, 0.95)' }}>
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points.map((y, i) => `${(i / (points.length - 1)) * 76 + 2},${26 - (y / 10) * 22}`).join(' ')}
          />
        </svg>
        <span style={{ fontSize: '0.75rem' }}>🔥 5 дней</span>
      </div>
    </div>
  );
}

interface FeatureSlideProgressProps {
  sectionId?: string;
  highlight?: boolean;
}

export function FeatureSlideProgress({ sectionId, highlight }: FeatureSlideProgressProps) {
  const { previewLang } = useLandingPreviewLang();
  const isZh = previewLang === 'zh';
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const highlightPills = ['Критерии', 'Рекомендации', 'Разбор', 'Тренды'];

  const featureBlocks = [
    {
      key: 'criteria',
      hero: true,
      title: 'Понятные критерии оценки',
      text: isZh
        ? 'Узнай свой средний балл по 10-балльной шкале и разбор по китайским критериям: цель и шаги, слова урока, грамматика, диалог, связность.'
        : 'Узнай свой средний балл по 10-балльной шкале и детальный разбор навыков: беглость, лексика, произношение, логика.',
      illo: (
        <div className={`${styles.featureBlockIllo} ${styles.prodIllo}`} role="img" aria-label="Критерии и балл">
          <ScoreRingMock />
          <CriteriaBarsMock previewLang={previewLang} />
        </div>
      ),
    },
    {
      key: 'recommendations',
      hero: false,
      title: 'Умные рекомендации',
      text: isZh
        ? 'Система сама подскажет, какой сценарий или голосовую минутку лучше пройти, чтобы подтянуть самый слабый навык.'
        : 'Система сама подскажет, какой сценарий или дебат лучше всего пройти, чтобы «подтянуть» самый слабый навык.',
      illo: (
        <div className={`${styles.featureBlockIllo} ${styles.prodIllo}`} role="img" aria-label="Рекомендация">
          <RecommendationMock previewLang={previewLang} />
        </div>
      ),
    },
    {
      key: 'feedback',
      hero: false,
      title: isZh ? 'Разбор сценария и минутки' : 'Разбор каждого диалога',
      text: isZh
        ? 'После сценария и голосовой минутки — сильные стороны, зоны роста и полезная фраза с пиньинем.'
        : 'После каждой тренировки ты получаешь фидбек с сильными сторонами, зонами роста и списком полезных фраз из разговора.',
      illo: (
        <div className={`${styles.featureBlockIllo} ${styles.prodIllo}`} role="img" aria-label="Фидбек">
          <FeedbackMock previewLang={previewLang} />
        </div>
      ),
    },
    {
      key: 'trends',
      hero: false,
      title: 'Тренды и серия дней',
      text: 'График среднего балла по времени и счётчик дней подряд с практикой — видишь прогресс и не теряешь мотивацию.',
      illo: (
        <div className={`${styles.featureBlockIllo} ${styles.prodIllo}`} role="img" aria-label="Тренд и streak">
          <TrendStreakMock />
        </div>
      ),
    },
  ];

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
            <div className={styles.featurePillsRow}>
              <div className={styles.featurePills}>
                {highlightPills.map((pill, i) => (
                  <span key={pill} className={styles.featurePill} style={{ animationDelay: `${i * 0.06}s` }}>
                    {pill}
                  </span>
                ))}
              </div>
              <LangPreviewToggle />
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
