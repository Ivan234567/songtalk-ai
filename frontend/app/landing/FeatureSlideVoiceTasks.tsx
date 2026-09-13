'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AgentIcon } from '@/components/sidebar/Sidebar';
import { LangPreviewToggle } from './preview-lang';
import styles from './landing.module.css';

function VoiceTypeMock() {
  const [active, setActive] = useState<'voicemail' | 'explain' | 'retell'>('explain');
  const types = [
    { key: 'voicemail' as const, label: 'Голосовое' },
    { key: 'explain' as const, label: 'Объяснение' },
    { key: 'retell' as const, label: 'Пересказ' },
  ];
  const examples = {
    voicemail: 'Одно сообщение адресату — без ответа собеседника.',
    explain: 'Факт и просьба одним высказыванием.',
    retell: 'Своими словами после короткого стимула.',
  };
  return (
    <div className={styles.dictTypesWrap} role="img" aria-label="Типы голосовой минутки">
      <div className={styles.dictTypesTabs}>
        {types.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`${styles.dictTypesTab} ${active === tab.key ? styles.dictTypesTabActive : ''}`}
            onClick={() => setActive(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className={styles.dictTypesExample}>
        <span className={styles.dictTypesPhrase}>{examples[active]}</span>
      </div>
    </div>
  );
}

function UtteranceMock() {
  return (
    <div className={styles.dictContextWrap} role="img" aria-label="Одно высказывание">
      <span className={styles.hskBadge}>HSK 3 · ~20 сек</span>
      <div className={`${styles.dictContextWord} ${styles.mockHanzi}`}>我想点一杯咖啡。</div>
      <div className={styles.mockPinyin}>wǒ xiǎng diǎn yì bēi kāfēi</div>
      <div className={styles.dictContextLine}>Одна реплика, не диалог</div>
    </div>
  );
}

function ChecklistMock() {
  const items = [
    { label: 'Назвал напиток', status: 'done' },
    { label: 'Вежливая просьба', status: 'almost' },
    { label: 'Сказал количество', status: 'missed' },
  ];
  return (
    <div className={styles.progressFeedbackWrap} role="img" aria-label="Чеклист">
      {items.map((item) => (
        <div key={item.label} className={styles.progressFeedbackRow}>
          <span className={styles.progressFeedbackTag}>
            {item.status === 'done' ? 'сделано' : item.status === 'almost' ? 'почти' : 'мало'}
          </span>
          <span className={styles.progressFeedbackText}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function VerdictMock() {
  return (
    <div className={styles.progressRecCard} role="img" aria-label="Оценка минутки">
      <span className={styles.progressRecBadge}>Почти</span>
      <span className={styles.progressRecTitle}>Голосовая минутка «Кафе»</span>
      <span className={styles.progressRecCta}>Повторить →</span>
    </div>
  );
}

interface FeatureSlideVoiceTasksProps {
  sectionId?: string;
  highlight?: boolean;
}

export function FeatureSlideVoiceTasks({ sectionId, highlight }: FeatureSlideVoiceTasksProps) {
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
        <div className={styles.featureBlockIllo} role="img" aria-label="Типы минутки">
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
        <div className={styles.featureBlockIllo} role="img" aria-label="Пример высказывания">
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
        <div className={styles.featureBlockIllo} role="img" aria-label="Чеклист">
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
        <div className={styles.featureBlockIllo} role="img" aria-label="Вердикт">
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
