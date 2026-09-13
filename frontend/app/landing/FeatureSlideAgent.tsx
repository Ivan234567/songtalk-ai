'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AgentIcon } from '@/components/sidebar/Sidebar';
import { LangPreviewToggle, useLandingPreviewLang, type LandingPreviewLang } from './preview-lang';
import styles from './landing.module.css';

const ICO = {
  chat: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  people: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  chevron: (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
};

function RecordOrbMock({ placeholder }: { placeholder: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div className={styles.featureOrbWrap} style={{ width: '100%' }} role="img" aria-label="Запись голоса и чат">
      <div className={styles.prodOrbRing}>
        <div
          className={`${styles.featureOrb} ${hovered ? styles.featureOrbListening : ''}`}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            width: 72,
            height: 72,
            background: hovered
              ? 'radial-gradient(120% 120% at 35% 25%, rgba(165, 180, 252, 0.95), rgba(99, 102, 241, 0.9) 45%, rgba(79, 70, 229, 0.85))'
              : 'radial-gradient(120% 120% at 32% 28%, rgba(203, 213, 225, 0.55), rgba(148, 163, 184, 0.35) 50%, rgba(100, 116, 139, 0.45))',
            boxShadow: hovered
              ? '0 0 0 3px rgba(99, 102, 241, 0.35), 0 0 28px 8px rgba(99, 102, 241, 0.22)'
              : '0 8px 20px rgba(0,0,0,0.3)',
          }}
        />
      </div>
      <span className={styles.featureOrbLabel}>{hovered ? 'Слушаю…' : 'Нажмите и говорите'}</span>
      <div className={styles.prodComposer}>
        <span className={styles.prodComposerInput}>{placeholder}</span>
        <span className={styles.prodMic} aria-hidden />
      </div>
    </div>
  );
}

function HintPanelMock({ isZh }: { isZh: boolean }) {
  const modes = isZh
    ? ['Базовый', 'С лексикой', 'Вежливый', 'Разговорный']
    : ['Проще', 'Обычно', 'Живее'];
  const [active, setActive] = useState(isZh ? 'Базовый' : 'Обычно');
  return (
    <div className={styles.prodHintPanel} role="img" aria-label="Подсказка ответа">
      <span className={styles.prodHintLabel}>Подсказка ответа</span>
      <div className={styles.prodChipRow}>
        {modes.map((m) => (
          <button
            key={m}
            type="button"
            className={`${styles.prodChip} ${active === m ? styles.prodChipActive : ''}`}
            onClick={() => setActive(m)}
          >
            {m}
          </button>
        ))}
      </div>
      <button type="button" className={styles.prodBtn}>Получить подсказку</button>
    </div>
  );
}

function ModeTabsMock({ previewLang }: { previewLang: LandingPreviewLang }) {
  const isZh = previewLang === 'zh';
  const [mode, setMode] = useState<'chat' | 'roleplay' | 'debate'>('roleplay');
  const [menuOpen, setMenuOpen] = useState(false);
  const roleplayLabel = isZh ? 'Ситуативный диалог' : 'Roleplays';

  return (
    <div style={{ position: 'relative', width: '100%' }} role="img" aria-label="Режимы собеседника">
      <div className={styles.prodSeg}>
        <button
          type="button"
          className={`${styles.prodSegBtn} ${mode === 'chat' ? styles.prodSegBtnActive : ''}`}
          onClick={() => { setMode('chat'); setMenuOpen(false); }}
        >
          {ICO.chat}
          {isZh ? 'Свободный диалог' : 'Freestyle Mode'}
        </button>
        <button
          type="button"
          className={`${styles.prodSegBtn} ${mode === 'roleplay' ? styles.prodSegBtnActive : ''}`}
          onClick={() => { setMode('roleplay'); setMenuOpen((v) => !v); }}
        >
          {ICO.people}
          {roleplayLabel}
          {ICO.chevron}
        </button>
        {!isZh && (
          <button
            type="button"
            className={`${styles.prodSegBtn} ${mode === 'debate' ? styles.prodSegBtnActive : ''}`}
            onClick={() => { setMode('debate'); setMenuOpen(false); }}
          >
            {ICO.chat}
            Дебаты
            {ICO.chevron}
          </button>
        )}
      </div>
      {menuOpen && (
        <div className={styles.prodSegMenu}>
          <div className={styles.prodSegMenuHead}>{isZh ? 'Сценарии' : 'Сценарии'}</div>
          {['Каталог сценариев', 'Создать сценарий', 'Мои сценарии'].map((item) => (
            <button key={item} type="button" className={styles.prodSegMenuItem} onClick={() => setMenuOpen(false)}>
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StyleSettingsMock() {
  const [preset, setPreset] = useState('Light slang');
  return (
    <div className={styles.prodPanel} role="img" aria-label="Настройки стиля">
      <span className={styles.prodPanelLabel}>Style</span>
      <div className={styles.prodChipRow}>
        {['Neutral', 'Light slang', 'Heavy slang'].map((label) => (
          <button
            key={label}
            type="button"
            className={`${styles.prodChip} ${preset === label ? styles.prodChipAccent : ''}`}
            onClick={() => setPreset(label)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={styles.prodChipRow} style={{ alignItems: 'center' }}>
        <span style={{ fontSize: '0.72rem', opacity: 0.8 }}>Slang</span>
        <span className={styles.prodSelect} style={{ width: 'auto', padding: '0.2rem 1.4rem 0.2rem 0.45rem', position: 'relative' }}>
          light
          <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', opacity: 0.7 }}>{ICO.chevron}</span>
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', opacity: 0.8 }}>
          <input type="checkbox" disabled style={{ width: 12, height: 12 }} />
          18+
        </label>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem' }}>
        <span style={{ opacity: 0.8 }}>Formality</span>
        <input type="range" min={0} max={100} defaultValue={35} disabled style={{ flex: 1, minWidth: 0, accentColor: 'rgba(107, 240, 176, 0.8)' }} />
        <span style={{ opacity: 0.7, width: 14, textAlign: 'right' }}>4</span>
      </label>
    </div>
  );
}

function HskSettingsMock() {
  return (
    <div className={styles.prodPanel} role="img" aria-label="Настройки HSK">
      <span className={styles.prodPanelLabel}>Уровень сложности</span>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: '0.75rem' }}>
        <span style={{ opacity: 0.85 }}>Уровень HSK</span>
        <span className={styles.prodSelect} style={{ width: 'auto', maxWidth: '58%' }}>HSK 3 — средний</span>
      </div>
      <span className={styles.prodPanelLabel}>Отображение</span>
      <div className={`${styles.prodToggleRow} ${styles.prodToggleRowOn}`}>
        <input type="checkbox" defaultChecked disabled style={{ accentColor: 'rgb(99, 102, 241)', width: 14, height: 14 }} />
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 500 }}>Пиньинь</div>
          <div style={{ fontSize: '0.62rem', opacity: 0.5 }}>Транскрипция с тонами</div>
        </div>
      </div>
      <div className={`${styles.prodToggleRow} ${styles.prodToggleRowOn}`}>
        <input type="checkbox" defaultChecked disabled style={{ accentColor: 'rgb(99, 102, 241)', width: 14, height: 14 }} />
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 500 }}>Перевод</div>
          <div style={{ fontSize: '0.62rem', opacity: 0.5 }}>Русский поверх реплик</div>
        </div>
      </div>
    </div>
  );
}

interface FeatureSlideAgentProps {
  sectionId?: string;
  highlight?: boolean;
}

export function FeatureSlideAgent({ sectionId, highlight }: FeatureSlideAgentProps) {
  const { previewLang } = useLandingPreviewLang();
  const isZh = previewLang === 'zh';
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const highlightPills = isZh
    ? ['Голос + чат', 'HSK-замок', 'Пиньинь']
    : ['Голос + чат', 'Подсказки на лету', 'Без расписаний'];

  const featureBlocks = [
    {
      key: 'modes',
      hero: false,
      title: isZh ? 'Два режима + сценарии HSK' : 'Три режима + твои сценарии',
      text: isZh
        ? 'Болтай свободно или проходи ситуативный диалог: каталог HSK, свои сценарии, генерация. Замок HSK держит ИИ на выбранном уровне — не выше и не ниже. Не нашёл тему? Опиши её своими словами — ИИ соберёт сценарий.'
        : 'Болтай свободно, оттачивай фразы в реалистичных ситуациях (собеседование, свидание) или тренируй аргументы в дебатах. Не нашел подходящую тему? Опиши её своими словами, и ИИ сам сгенерирует для тебя уникальный сценарий с учетом твоего уровня и целей.',
      illo: (
        <div className={`${styles.featureBlockIllo} ${styles.prodIllo}`} role="img" aria-label="Режимы и создание сценариев">
          <ModeTabsMock previewLang={previewLang} />
        </div>
      ),
    },
    {
      key: 'voice',
      hero: true,
      title: 'Говори или печатай',
      text: 'Практикуй устную речь с голосовым ИИ-партнером или общайся в чате, если пока стесняешься.',
      illo: (
        <div className={`${styles.featureBlockIllo} ${styles.prodIllo}`} role="img" aria-label="Голос или чат">
          <RecordOrbMock placeholder={isZh ? '你好…' : 'Type your message…'} />
        </div>
      ),
    },
    {
      key: 'hints',
      hero: false,
      title: 'Умные подсказки',
      text: isZh
        ? 'Если забыл слово или не знаешь, как построить фразу, нажми «Подсказка» — режимы Базовый, С лексикой, Вежливый или Разговорный на твоём HSK.'
        : 'Если забыл слово или не знаешь, как построить фразу, нажми «Подсказка» — ИИ предложит варианты: Проще, Обычно или Живее.',
      illo: (
        <div className={`${styles.featureBlockIllo} ${styles.prodIllo}`} role="img" aria-label="Подсказка и варианты">
          <HintPanelMock key={previewLang} isZh={isZh} />
        </div>
      ),
    },
    {
      key: 'style',
      hero: false,
      title: isZh ? 'Уровень HSK и подсказки' : 'Гибкие настройки стиля',
      text: isZh
        ? 'Замок HSK не даёт ИИ уехать выше твоего уровня. Включи пиньинь и перевод — читай и слушай в своём темпе.'
        : 'Хочешь освоить деловой стиль или живую разговорную речь? Настрой уровень формальности, разреши или запрети нецензурную лексику — ИИ подстроится под тебя.',
      illo: (
        <div className={`${styles.featureBlockIllo} ${styles.prodIllo}`} role="img" aria-label={isZh ? 'Настройки HSK' : 'Настройки стиля'}>
          {isZh ? <HskSettingsMock /> : <StyleSettingsMock />}
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
            <div className={styles.featurePillsRow}>
              <div className={styles.featurePills}>
                {highlightPills.map((pill, i) => (
                  <span key={pill} className={styles.featurePill} style={{ animationDelay: `${i * 0.06}s` }}>
                    {i === 0 && <span className={styles.featurePillLive} aria-hidden />}
                    {pill}
                  </span>
                ))}
              </div>
              <LangPreviewToggle />
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
