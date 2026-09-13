'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AgentIcon } from '@/components/sidebar/Sidebar';
import { LangPreviewToggle, useLandingPreviewLang } from './preview-lang';
import styles from './landing.module.css';

function VoiceTypeMock() {
  const [active, setActive] = useState<'voicemail' | 'explain' | 'retell'>('explain');
  const types = [
    { key: 'voicemail' as const, label: 'Голосовое' },
    { key: 'explain' as const, label: 'Объяснение' },
    { key: 'retell' as const, label: 'Пересказ' },
  ];
  return (
    <div className={styles.prodPanel} role="img" aria-label="Типы голосовой минутки">
      <span className={styles.prodPanelLabel}>Тип</span>
      <div className={styles.prodChipRow}>
        {types.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`${styles.prodChip} ${active === tab.key ? styles.prodChipAccent : ''}`}
            onClick={() => setActive(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <span className={styles.prodPanelLabel}>HSK</span>
      <span className={styles.prodSelect}>HSK 3 — средний</span>
    </div>
  );
}

function UtteranceMock() {
  return (
    <div className={styles.prodPanel} role="img" aria-label="Одно высказывание">
      <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>Кафе</div>
      <div className={styles.prodChipRow}>
        <span className={styles.prodChipAccent} style={{ cursor: 'default' }}>Объяснение</span>
        <span className={styles.prodChip} style={{ cursor: 'default' }}>HSK 3</span>
        <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>ориентир 20 сек</span>
      </div>
      <div>
        <div className={styles.prodPanelLabel}>Что сказать</div>
        <div style={{ fontSize: '0.75rem', marginTop: 4 }}>Закажи кофе одним высказыванием.</div>
      </div>
    </div>
  );
}

function ChecklistMock() {
  const items = [
    { label: 'Назвал напиток', status: 'done' as const },
    { label: 'Вежливая просьба', status: 'almost' as const },
    { label: 'Сказал количество', status: 'missed' as const },
  ];
  const cls = { done: styles.prodCheckDone, almost: styles.prodCheckAlmost, missed: styles.prodCheckMissed };
  const tag = { done: 'Сделано', almost: 'Почти', missed: 'Мало' };
  return (
    <div className={styles.prodPanel} role="img" aria-label="Чеклист">
      <span className={styles.prodPanelLabel}>Чеклист</span>
      {items.map((item) => (
        <div key={item.label} className={`${styles.prodCheckItem} ${cls[item.status]}`}>
          <span>{item.label}</span>
          <span style={{ fontWeight: 600 }}>{tag[item.status]}</span>
        </div>
      ))}
    </div>
  );
}

function VerdictMock() {
  return (
    <div className={styles.prodPanel} role="img" aria-label="Оценка минутки">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Кафе</span>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(245, 158, 11, 0.95)' }}>Почти</span>
      </div>
      <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>Объяснение · HSK 3</span>
      <button type="button" className={`${styles.prodBtn} ${styles.prodBtnGreen}`}>Повторить</button>
    </div>
  );
}

interface FeatureSlideVoiceTasksProps {
  sectionId?: string;
  highlight?: boolean;
}

export function FeatureSlideVoiceTasks({ sectionId, highlight }: FeatureSlideVoiceTasksProps) {
  const { previewLang } = useLandingPreviewLang();
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const highlightPills = ['Одно высказывание', 'Чеклист', 'HSK', 'Оценка'];

  const featureBlocks = [
    {
      key: 'types',
      hero: true,
      title: 'Три типа минутки',
      text: 'Голосовое сообщение, короткое объяснение или пересказ стимула. Одна реплика — ИИ проверяет, что прозвучало.',
      illo: (
        <div className={`${styles.featureBlockIllo} ${styles.prodIllo}`} role="img" aria-label="Типы минутки">
          <VoiceTypeMock />
        </div>
      ),
    },
    {
      key: 'utterance',
      hero: false,
      title: 'Одна реплика, не диалог',
      text: 'Нет ролей, шагов и «кто начинает». Говоришь одно высказывание на своём HSK — ИИ проверяет, что сказано.',
      illo: (
        <div className={`${styles.featureBlockIllo} ${styles.prodIllo}`} role="img" aria-label="Пример высказывания">
          <UtteranceMock />
        </div>
      ),
    },
    {
      key: 'checklist',
      hero: false,
      title: 'Чеклист по делу',
      text: 'Перед записью видно, что должно прозвучать. После — пункты: сделано, почти или мало.',
      illo: (
        <div className={`${styles.featureBlockIllo} ${styles.prodIllo}`} role="img" aria-label="Чеклист">
          <ChecklistMock />
        </div>
      ),
    },
    {
      key: 'verdict',
      hero: false,
      title: 'Оценка сразу',
      text: 'Вердикт «сделано / почти / мало» — и можно повторить ту же минутку, не уходя в длинный диалог.',
      illo: (
        <div className={`${styles.featureBlockIllo} ${styles.prodIllo}`} role="img" aria-label="Вердикт">
          <VerdictMock />
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

  if (previewLang !== 'zh') return null;

  return (
    <section ref={sectionRef} id={sectionId} className={`${styles.featureSlide} ${highlight ? styles.featureSlideHighlight : ''}`} aria-labelledby="feature-voice-title">
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
            <p className={styles.featureLabel}>Короткая речь</p>
            <h2 id="feature-voice-title" className={styles.featureTitle}>
              <span className={styles.featureTitleBlock}>
                <span className={styles.featureTitleIcon} aria-hidden><AgentIcon size={32} /></span>
                <span className={styles.featureTitleLine}>Голосовая минутка</span>
              </span>
            </h2>
            <p className={styles.featureTagline}>
              Одно высказывание на твоём HSK: чеклист, оценка, можно сразу повторить.
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
