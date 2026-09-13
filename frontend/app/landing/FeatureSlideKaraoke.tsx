'use client';

import React, { useState, useEffect, useRef } from 'react';
import { KaraokeIcon } from '@/components/sidebar/Sidebar';
import { LangPreviewToggle, useLandingPreviewLang } from './preview-lang';
import styles from './landing.module.css';

/** Поле ввода ссылки YouTube — интерактив при фокусе и hover */
function YouTubeUrlMock() {
  return (
    <div className={styles.prodKaraokeBar} role="img" aria-label="Ссылка YouTube">
      <div className={styles.prodKaraokeInputWrap}>
        <span className={styles.prodKaraokeLinkIcon} aria-hidden>🔗</span>
        <div className={styles.prodKaraokeInput}>Вставьте ссылку на YouTube видео...</div>
      </div>
      <button type="button" className={styles.prodKaraokeLoad}>▶ Загрузить</button>
    </div>
  );
}

function KaraokeLineMock() {
  const [activeWord, setActiveWord] = useState<string | null>(null);
  const tokens = [
    { text: 'I', clickable: false, active: false },
    { text: 'want', clickable: false, active: false },
    { text: 'it', clickable: false, active: true },
    { text: 'that', clickable: true, active: false },
    { text: 'way', clickable: false, active: false },
  ];

  return (
    <div role="img" aria-label="Строка караоке">
      <div className={styles.prodKaraokeLine}>
        {tokens.map((token, i) => (
          <span
            key={`${token.text}-${i}`}
            className={`${token.active ? styles.prodKaraokeWordActive : ''} ${token.clickable ? styles.prodKaraokeWordClick : ''}`}
            onClick={() => token.clickable && setActiveWord(activeWord ? null : token.text)}
            onMouseEnter={() => token.clickable && setActiveWord(token.text)}
            onMouseLeave={() => setActiveWord(null)}
          >
            {token.text}
          </span>
        ))}
      </div>
      {activeWord && (
        <div className={styles.featureKaraokeTooltip} style={{ marginTop: 8 }}>
          <span className={styles.featureKaraokeTooltipTranslation}>
            that — тот самый; that way — таким образом
          </span>
          <span className={styles.featureKaraokeTooltipBtn}>Добавить в словарь</span>
        </div>
      )}
    </div>
  );
}

function ViewModeToggleMock() {
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }} role="img" aria-label="Режимы просмотра">
      <div className={styles.prodYtThumb}>
        <span className={styles.prodYtPlay}>▶</span>
      </div>
      <button type="button" className={styles.prodKaraokeLoad} style={{ alignSelf: 'flex-start' }}>
        📝 Открыть текст
      </button>
    </div>
  );
}

function SavedSongCardMini() {
  return (
    <div style={{ width: '100%', textAlign: 'left' }} role="img" aria-label="Песня из коллекции">
      <div className={styles.prodYtThumb}>
        <span className={styles.prodYtPlay}>▶</span>
      </div>
      <div style={{ marginTop: 6, fontSize: '0.75rem', fontWeight: 600 }}>I Want It That Way</div>
      <div style={{ fontSize: '0.65rem', opacity: 0.55 }}>YouTube · караоке</div>
    </div>
  );
}

interface FeatureSlideKaraokeProps {
  sectionId?: string;
  highlight?: boolean;
}

export function FeatureSlideKaraoke({ sectionId, highlight }: FeatureSlideKaraokeProps) {
  const { previewLang } = useLandingPreviewLang();
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const highlightPills = ['YouTube', 'Словарь', 'Текст', 'Коллекция'];

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

  if (previewLang === 'zh') return null;

  const featureBlocks = [
    {
      key: 'sync',
      hero: true,
      title: 'Синхронизация слов и видео',
      text: 'Вставь ссылку на YouTube, и субтитры автоматически подгрузятся. Текст подсвечивается в такт речи — как в караоке.',
      illo: (
        <div className={`${styles.featureBlockIllo} ${styles.prodIllo}`} role="img" aria-label="Ссылка YouTube и субтитры">
          <YouTubeUrlMock />
        </div>
      ),
    },
    {
      key: 'modes',
      hero: false,
      title: 'Клип и полноэкранный текст',
      text: 'Видео можно свернуть и открыть текст песни на весь экран — слова подсвечиваются в такт, как в Spotify.',
      illo: (
        <div className={`${styles.featureBlockIllo} ${styles.prodIllo}`} role="img" aria-label="Режимы видео и текст">
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
        <div className={`${styles.featureBlockIllo} ${styles.prodIllo}`} role="img" aria-label="Клик по слову в караоке">
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
        <div className={`${styles.featureBlockIllo} ${styles.prodIllo}`} role="img" aria-label="Коллекция">
          <SavedSongCardMini />
        </div>
      ),
    },
  ];

  return (
    <section ref={sectionRef} id={sectionId} className={`${styles.featureSlide} ${highlight ? styles.featureSlideHighlight : ''}`} aria-labelledby="feature-karaoke-title">
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
            <p className={styles.featureLabel}>Музыка и видео</p>
            <h2 id="feature-karaoke-title" className={styles.featureTitle}>
              <span className={styles.featureTitleBlock}>
                <span className={styles.featureTitleIcon} aria-hidden><KaraokeIcon size={32} /></span>
                <span className={styles.featureTitleLine}>Караоке: Учи язык по любимым видео</span>
              </span>
            </h2>
            <p className={styles.featureTagline}>
              Учи язык через музыку и YouTube, даже не замечая этого.
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
