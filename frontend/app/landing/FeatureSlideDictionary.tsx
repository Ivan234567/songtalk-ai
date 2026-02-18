'use client';

import React, { useState, useEffect, useRef } from 'react';
import { DictionaryIcon } from '@/components/sidebar/Sidebar';
import styles from './landing.module.css';

/** Три типа карточек: слова, идиомы, фразовые глаголы */
function CardTypesMock() {
  const [active, setActive] = useState<'words' | 'idioms' | 'phrasal'>('idioms');
  return (
    <div className={styles.dictTypesWrap} role="img" aria-label="Типы карточек">
      <div className={styles.dictTypesTabs}>
        {(['words', 'idioms', 'phrasal'] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={`${styles.dictTypesTab} ${active === key ? styles.dictTypesTabActive : ''}`}
            onClick={() => setActive(key)}
          >
            {key === 'words' && 'Слова'}
            {key === 'idioms' && 'Идиомы'}
            {key === 'phrasal' && 'Фраз. глаголы'}
          </button>
        ))}
      </div>
      <div className={styles.dictTypesExample}>
        {active === 'words' && <span className={styles.dictTypesPhrase}>give up — сдаваться</span>}
        {active === 'idioms' && <span className={styles.dictTypesPhrase}>it's raining cats and dogs</span>}
        {active === 'phrasal' && <span className={styles.dictTypesPhrase}>give up — бросать, сдаваться</span>}
      </div>
    </div>
  );
}

/** Озвучка слова — нажми и услышишь */
function TtsMock() {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={`${styles.dictTtsWrap} ${hovered ? styles.dictTtsWrapHover : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="img"
      aria-label="Озвучка слова"
    >
      <span className={styles.dictTtsWord}>give up</span>
      <span className={styles.dictTtsBtn} aria-hidden>🔊</span>
      <span className={styles.dictTtsHint}>{hovered ? 'Нажми — услышишь' : 'Озвучка'}</span>
    </div>
  );
}

/** Контекст из видео/диалога */
function ContextMock() {
  return (
    <div className={styles.dictContextWrap} role="img" aria-label="Контекст">
      <div className={styles.dictContextWord}>give up</div>
      <div className={styles.dictContextLine}>«…I won't give up on us…» — из клипа</div>
    </div>
  );
}

/** Категории + экспорт */
function CategoriesMock() {
  const [hovered, setHovered] = useState(false);
  const tags = ['Бизнес', 'Еда', 'Сериалы'];
  return (
    <div className={styles.dictCategoriesWrap} role="img" aria-label="Категории">
      <div className={styles.dictCategoriesTags}>
        {tags.map((t) => (
          <span key={t} className={styles.dictCategoriesTag}>{t}</span>
        ))}
      </div>
      <span
        className={`${styles.dictCategoriesExport} ${hovered ? styles.dictCategoriesExportHover : ''}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        Экспорт CSV / Anki
      </span>
    </div>
  );
}

const featureBlocks = [
  {
    key: 'types',
    hero: true,
    title: 'Три типа карточек',
    text: 'Сохраняй не только отдельные слова, но и целые идиомы («it\'s raining cats and dogs») и фразовые глаголы («give up»).',
    illo: (
      <div className={styles.featureBlockIllo} role="img" aria-label="Типы карточек">
        <CardTypesMock />
      </div>
    ),
  },
  {
    key: 'tts',
    hero: false,
    title: 'Озвучка слова',
    text: 'Нажми на кнопку — и услышишь правильное произношение. Так проще запомнить и не путать похожие слова.',
    illo: (
      <div className={styles.featureBlockIllo} role="img" aria-label="Озвучка">
        <TtsMock />
      </div>
    ),
  },
  {
    key: 'context',
    hero: false,
    title: 'Контекст — всему голова',
    text: 'Каждое слово хранится с примером из видео или диалога, где ты его встретил. Так его легче вспомнить и правильно использовать.',
    illo: (
      <div className={styles.featureBlockIllo} role="img" aria-label="Контекст">
        <ContextMock />
      </div>
    ),
  },
  {
    key: 'categories',
    hero: false,
    title: 'Категории и порядок',
    text: 'Раскладывай слова по папкам («Бизнес», «Еда», «Сериалы»), ищи по фильтрам и экспортируй в любом формате.',
    illo: (
      <div className={styles.featureBlockIllo} role="img" aria-label="Категории">
        <CategoriesMock />
      </div>
    ),
  },
];

interface FeatureSlideDictionaryProps {
  sectionId?: string;
  highlight?: boolean;
}

export function FeatureSlideDictionary({ sectionId, highlight }: FeatureSlideDictionaryProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const highlightPills = ['Слова', 'Идиомы', 'Озвучка', 'Категории'];

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
    <section ref={sectionRef} id={sectionId} className={`${styles.featureSlide} ${highlight ? styles.featureSlideHighlight : ''}`} aria-labelledby="feature-dictionary-title">
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
            <p className={styles.featureLabel}>База знаний</p>
            <h2 id="feature-dictionary-title" className={styles.featureTitle}>
              <span className={styles.featureTitleBlock}>
                <span className={styles.featureTitleIcon} aria-hidden><DictionaryIcon size={32} /></span>
                <span className={styles.featureTitleLine}>Словарь: Твоя личная база знаний</span>
              </span>
            </h2>
            <p className={styles.featureTagline}>
              Собирай и повторяй слова, идиомы и фразовые глаголы в одном месте.
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
