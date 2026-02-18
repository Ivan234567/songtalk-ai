'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AgentIcon } from '@/components/sidebar/Sidebar';
import styles from './landing.module.css';

/** Макет кнопки записи (орб) — интерактивный: при hover «слушает» */
function RecordOrbMock() {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={styles.featureOrbWrap}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="img"
      aria-label="Кнопка записи голоса"
    >
      <div
        className={`${styles.featureOrb} ${hovered ? styles.featureOrbListening : ''}`}
        style={{
          background: hovered
            ? 'radial-gradient(120% 120% at 35% 25%, rgba(165, 180, 252, 0.95), rgba(99, 102, 241, 0.9) 45%, rgba(79, 70, 229, 0.85))'
            : 'radial-gradient(120% 120% at 35% 25%, rgba(203, 213, 225, 0.5), rgba(148, 163, 184, 0.35) 50%, rgba(100, 116, 139, 0.4))',
          boxShadow: hovered
            ? '0 0 0 4px rgba(99, 102, 241, 0.35), 0 0 50px 20px rgba(99, 102, 241, 0.25)'
            : '0 0 30px 0 rgba(99, 102, 241, 0.12), 0 16px 40px -12px rgba(0, 0, 0, 0.35)',
        }}
      />
      <span className={styles.featureOrbLabel}>{hovered ? 'Говорите…' : 'Нажмите'}</span>
    </div>
  );
}

/** Макет кнопки «Подсказка ответа» */
function HintButtonMock() {
  return (
    <div className={styles.featureHintMock} role="img" aria-label="Кнопка подсказки">
      <div className={styles.featureHintInner}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span>Подсказка ответа</span>
      </div>
    </div>
  );
}

/** Макет вкладок режимов */
function ModeTabsMock() {
  return (
    <div className={styles.featureModeTabs} role="img" aria-label="Modes: freestyle, roleplays, debate">
      <span className={styles.featureModeTab}>Freestyle Mode</span>
      <span className={`${styles.featureModeTab} ${styles.featureModeTabActive}`}>Roleplays</span>
      <span className={styles.featureModeTab}>Debate</span>
    </div>
  );
}

const plusIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

/** Макет кнопки создания сценария */
function CreateScenarioButtonMock() {
  return (
    <div className={styles.featureCreateBtn} role="img" aria-label="Create scenario">
      <span className={styles.featureCreateBtnIcon}>{plusIcon}</span>
      <span>Create Scenario</span>
    </div>
  );
}

/** Макет кнопки создания дебата */
function CreateDebateButtonMock() {
  return (
    <div className={styles.featureCreateBtn} role="img" aria-label="Create debate">
      <span className={styles.featureCreateBtnIcon}>{plusIcon}</span>
      <span>Create Debate</span>
    </div>
  );
}

/** Макет настроек стиля — как в AgentTab (фристайл) */
function StyleSettingsMock() {
  return (
    <div
      role="img"
      aria-label="Style settings"
      style={{
        padding: '0.65rem 0.9rem',
        borderRadius: 16,
        border: '1px solid rgba(255, 255, 255, 0.2)',
        background: 'rgba(255, 255, 255, 0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
        width: 200,
        minWidth: 0,
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          opacity: 0.8,
          color: '#fff',
        }}
      >
        Style
      </span>
      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
        {['Neutral', 'Light slang', 'Heavy slang'].map((label, i) => (
          <span
            key={label}
            style={{
              border: '1px solid rgba(255, 255, 255, 0.1)',
              background: i === 1 ? 'rgba(107, 240, 176, 0.15)' : 'rgba(255, 255, 255, 0.05)',
              color: i === 1 ? 'rgba(107, 240, 176, 0.95)' : 'rgba(255, 255, 255, 0.85)',
              borderRadius: 999,
              padding: '0.2rem 0.5rem',
              fontSize: '0.7rem',
              fontWeight: 600,
            }}
          >
            {label}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.85)' }}>Slang</span>
        <div
          style={{
            borderRadius: 12,
            border: '1px solid rgba(255, 255, 255, 0.12)',
            background: 'rgba(255, 255, 255, 0.06)',
            color: 'rgba(255, 255, 255, 0.9)',
            padding: '0.2rem 1.5rem 0.2rem 0.45rem',
            fontSize: '0.75rem',
            position: 'relative',
          }}
        >
          light
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', opacity: 0.7 }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.7)' }}>
          <input type="checkbox" disabled style={{ width: 12, height: 12 }} />
          18+
        </label>
      </div>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: '0.75rem',
          color: 'rgba(255, 255, 255, 0.85)',
          minWidth: 0,
        }}
      >
        <span style={{ flexShrink: 0, opacity: 0.85 }}>Formality</span>
        <input
          type="range"
          min={0}
          max={100}
          defaultValue={35}
          disabled
          style={{ flex: '1 1 40px', minWidth: 0, maxWidth: '100%', accentColor: 'rgba(107, 240, 176, 0.8)' }}
        />
        <span style={{ flexShrink: 0, width: 18, textAlign: 'right', opacity: 0.7, fontSize: '0.7rem' }}>4</span>
      </label>
    </div>
  );
}

interface FeatureSlideAgentProps {
  sectionId?: string;
  highlight?: boolean;
}

export function FeatureSlideAgent({ sectionId, highlight }: FeatureSlideAgentProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const highlightPills = ['Голос + чат', 'Подсказки на лету', 'Без расписаний'];

const featureBlocks = [
  {
    key: 'modes',
    hero: false,
    title: 'Три режима + твои сценарии',
    text: 'Болтай свободно, оттачивай фразы в реалистичных ситуациях (собеседование, свидание) или тренируй аргументы в дебатах. Не нашел подходящую тему? Опиши её своими словами, и ИИ сам сгенерирует для тебя уникальный сценарий с учетом твоего уровня и целей.',
    illo: (
      <div className={styles.featureBlockIllo} role="img" aria-label="Режимы и создание сценариев">
        <div className={styles.featureBlockIlloRow}>
          <CreateScenarioButtonMock />
          <CreateDebateButtonMock />
        </div>
        <ModeTabsMock />
      </div>
    ),
  },
  {
    key: 'voice',
    hero: true,
    title: 'Говори или печатай',
    text: 'Практикуй устную речь с голосовым ИИ-партнером или общайся в чате, если пока стесняешься.',
    illo: (
      <div className={styles.featureBlockIllo} role="img" aria-label="Голос или чат">
        <RecordOrbMock />
        <div className={styles.featureChatHint}>
          <span className={styles.featureChatHintPlaceholder}>Type your message…</span>
        </div>
      </div>
    ),
  },
  {
    key: 'hints',
    hero: false,
    title: 'Умные подсказки',
    text: 'Если забыл слово или не знаешь, как построить фразу, нажми «Подсказка» — ИИ предложит варианты: проще, вежливее, с использованием сленга.',
    illo: (
      <div className={styles.featureBlockIllo} role="img" aria-label="Подсказка и варианты">
        <HintButtonMock />
        <div className={styles.featureHintVariants}>
          <span>проще</span>
          <span>вежливее</span>
          <span>сленг</span>
        </div>
      </div>
    ),
  },
  {
    key: 'style',
    hero: false,
    title: 'Гибкие настройки стиля',
    text: 'Хочешь освоить деловой английский или научиться понимать сленг любимых рэперов? Настрой уровень формальности, разреши или запрети нецензурную лексику — ИИ подстроится под тебя.',
    illo: (
      <div className={styles.featureBlockIllo} role="img" aria-label="Настройки стиля">
        <StyleSettingsMock />
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
    <section ref={sectionRef} id={sectionId} className={`${styles.featureSlide} ${highlight ? styles.featureSlideHighlight : ''}`} aria-labelledby="feature-agent-title">
      <div className={styles.featureSlideStage} aria-hidden="true" />
      <div className={styles.featureProjection} aria-hidden="true" />
      <div className={styles.featureSlideGrain} aria-hidden="true" />

      <div className={`${styles.featureSlideContent} ${styles.featureSlideContentGrid}`}>
        <div className={`${styles.featureSlideText} ${inView ? styles.featureSlideTextRevealed : ''}`}>
          <div className={styles.featureTextPanel}>
            <div className={styles.featurePills}>
              {highlightPills.map((pill, i) => (
                <span key={pill} className={styles.featurePill} style={{ animationDelay: `${i * 0.06}s` }}>
                  {i === 0 && <span className={styles.featurePillLive} aria-hidden />}
                  {pill}
                </span>
              ))}
            </div>
            <p className={styles.featureLabel}>Разговорный режим</p>
            <h2 id="feature-agent-title" className={styles.featureTitle}>
              <span className={styles.featureTitleBlock}>
                <span className={styles.featureTitleIcon} aria-hidden><AgentIcon size={32} /></span>
                <span className={styles.featureTitleLine}>Собеседник</span>
              </span>
            </h2>
            <p className={styles.featureTagline}>
              Твой личный речевой тренажер
            </p>
            <p className={`${styles.featureIntro} ${styles.featureIntroSheen}`}>
              Забудь про скучные учебники. Говори на темы, которые интересны именно тебе.
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
