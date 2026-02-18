'use client';

import React, { useState, useEffect, useRef } from 'react';
import { KaraokeIcon } from '@/components/sidebar/Sidebar';
import styles from './landing.module.css';

/** Поле ввода ссылки YouTube — интерактив при фокусе и hover */
function YouTubeUrlMock() {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const showHint = focused || hovered;
  return (
    <div
      className={`${styles.featureKaraokeUrlWrap} ${showHint ? styles.featureKaraokeUrlWrapReveal : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <input
        type="text"
        readOnly
        value=""
        placeholder="https://youtube.com/watch?v=..."
        className={`${styles.featureKaraokeUrlInput} ${showHint ? styles.featureKaraokeUrlFocused : ''}`}
        aria-label="Ссылка на YouTube"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      <span className={styles.featureKaraokeUrlHint}>
        {showHint ? 'Субтитры подгрузятся автоматически' : 'Вставьте ссылку'}
      </span>
    </div>
  );
}

/** Строка караоке с подсветкой текущего слова и кликабельным словом */
function KaraokeLineMock() {
  const [activeWord, setActiveWord] = useState<string | null>(null);
  const words = ['I', 'want', 'it', 'that', 'way'];
  return (
    <div className={styles.featureKaraokeLineWrap} role="img" aria-label="Строка караоке">
      <div className={styles.featureKaraokeLine}>
        {words.map((word, i) => (
          <span
            key={i}
            className={`${styles.featureKaraokeWord} ${i === 2 ? styles.featureKaraokeWordActive : ''} ${word === 'that' ? styles.featureKaraokeWordClickable : ''}`}
            onClick={() => word === 'that' && setActiveWord(activeWord ? null : 'that')}
            onMouseEnter={() => word === 'that' && setActiveWord('that')}
            onMouseLeave={() => setActiveWord(null)}
          >
            {word}
          </span>
        ))}
      </div>
      {activeWord && (
        <div className={styles.featureKaraokeTooltip}>
          <span className={styles.featureKaraokeTooltipTranslation}>that — тот самый; that way — таким образом</span>
          <span className={styles.featureKaraokeTooltipBtn}>+ В словарь</span>
        </div>
      )}
    </div>
  );
}

/** Переключатель режимов: видео+субтитры / только текст */
function ViewModeToggleMock() {
  const [mode, setMode] = useState<'full' | 'text'>('full');
  return (
    <div className={styles.featureKaraokeViewModes} role="img" aria-label="Режимы просмотра">
      <button
        type="button"
        className={`${styles.featureKaraokeViewBtn} ${mode === 'full' ? styles.featureKaraokeViewBtnActive : ''}`}
        onClick={() => setMode('full')}
        aria-pressed={mode === 'full'}
      >
        Видео + субтитры
      </button>
      <button
        type="button"
        className={`${styles.featureKaraokeViewBtn} ${mode === 'text' ? styles.featureKaraokeViewBtnActive : ''}`}
        onClick={() => setMode('text')}
        aria-pressed={mode === 'text'}
      >
        Только текст
      </button>
    </div>
  );
}

/** Маленькая карточка песни из коллекции под стиль слайда */
function SavedSongCardMini() {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={`${styles.karaokeCardMini} ${hovered ? styles.karaokeCardMiniHover : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="img"
      aria-label="Песня из коллекции"
    >
      <div className={styles.karaokeCardMiniThumb}>
        <span className={styles.karaokeCardMiniPlay}>▶</span>
      </div>
      <div className={styles.karaokeCardMiniTitle}>I Want It That Way</div>
    </div>
  );
}

const featureBlocks = [
  {
    key: 'sync',
    hero: true,
    title: 'Синхронизация слов и видео',
    text: 'Вставь ссылку на YouTube, и субтитры автоматически подгрузятся. Текст подсвечивается в такт речи — как в караоке.',
    illo: (
      <div className={styles.featureBlockIllo} role="img" aria-label="Ссылка YouTube и субтитры">
        <YouTubeUrlMock />
      </div>
    ),
  },
  {
    key: 'modes',
    hero: false,
    title: 'Два режима просмотра',
    text: 'Смотри клип с субтитрами или переключись в режим «только текст», чтобы сосредоточиться на разборе сложных фраз.',
    illo: (
      <div className={styles.featureBlockIllo} role="img" aria-label="Режимы видео и текст">
        <ViewModeToggleMock />
      </div>
    ),
  },
  {
    key: 'dictionary',
    hero: false,
    title: 'Кликни — добавь в словарь',
    text: 'Увидел незнакомое слово или классную идиому? Кликни на него — получи перевод и сохрани в свой словарь вместе с контекстом из песни.',
    illo: (
      <div className={styles.featureBlockIllo} role="img" aria-label="Клик по слову в караоке">
        <KaraokeLineMock />
      </div>
    ),
  },
  {
    key: 'collection',
    hero: false,
    title: 'Твоя коллекция песен',
    text: 'Все загруженные видео в одном месте. Запускай караоке одной кнопкой и возвращайся к любимым трекам когда угодно.',
    illo: (
      <div className={styles.featureBlockIllo} role="img" aria-label="Коллекция">
        <SavedSongCardMini />
      </div>
    ),
  },
];

interface FeatureSlideKaraokeProps {
  sectionId?: string;
  highlight?: boolean;
}

export function FeatureSlideKaraoke({ sectionId, highlight }: FeatureSlideKaraokeProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const highlightPills = ['YouTube', 'Словарь', 'Два режима', 'Коллекция'];

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
    <section ref={sectionRef} id={sectionId} className={`${styles.featureSlide} ${highlight ? styles.featureSlideHighlight : ''}`} aria-labelledby="feature-karaoke-title">
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
            <p className={styles.featureLabel}>Музыка и видео</p>
            <h2 id="feature-karaoke-title" className={styles.featureTitle}>
              <span className={styles.featureTitleBlock}>
                <span className={styles.featureTitleIcon} aria-hidden><KaraokeIcon size={32} /></span>
                <span className={styles.featureTitleLine}>Караоке: Учи язык по любимым видео</span>
              </span>
            </h2>
            <p className={styles.featureTagline}>
              Учи английский через музыку и YouTube, даже не замечая этого.
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
