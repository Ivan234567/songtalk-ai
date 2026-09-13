'use client';

import React, { useState, useEffect, useRef } from 'react';
import { DictionaryIcon } from '@/components/sidebar/Sidebar';
import { LangPreviewToggle, useLandingPreviewLang, type LandingPreviewLang } from './preview-lang';
import styles from './landing.module.css';

type EnCardKey = 'words' | 'idioms' | 'phrasal';
type ZhCardKey = 'words' | 'characters';

function CardTypesMock({ previewLang }: { previewLang: LandingPreviewLang }) {
  const isZh = previewLang === 'zh';
  const [enActive, setEnActive] = useState<EnCardKey>('idioms');
  const [zhActive, setZhActive] = useState<ZhCardKey>('words');

  if (isZh) {
    return (
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }} role="img" aria-label="Типы карточек">
        <div className={styles.prodDictSeg}>
          {([
            { key: 'words', label: '词语' },
            { key: 'characters', label: '汉字' },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`${styles.prodDictSegBtn} ${zhActive === tab.key ? styles.prodDictSegBtnActive : ''}`}
              onClick={() => setZhActive(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className={styles.prodSearch}>{zhActive === 'words' ? 'Поиск по слову или pinyin...' : 'Поиск по иероглифу, pinyin или переводу...'}</div>
        <div className={styles.prodWordCard}>
          <span className={styles.prodWordMeta}>Разбор слова</span>
          {zhActive === 'words' ? (
            <>
              <span className={styles.mockHanzi} style={{ fontSize: '1.35rem' }}>你好</span>
              <span className={styles.mockPinyin}>nǐ hǎo</span>
              <span style={{ fontSize: '0.78rem' }}>привет</span>
              <span className={styles.hskBadge}>HSK 1</span>
            </>
          ) : (
            <>
              <span className={styles.mockHanzi} style={{ fontSize: '1.6rem' }}>你</span>
              <span className={styles.mockPinyin}>nǐ</span>
              <span style={{ fontSize: '0.78rem' }}>ты</span>
              <span className={styles.hskBadge}>HSK 1</span>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }} role="img" aria-label="Типы карточек">
      <div className={styles.prodDictSeg}>
        {([
          { key: 'words', label: 'Слова' },
          { key: 'idioms', label: 'Идиомы' },
          { key: 'phrasal', label: 'Фразовые глаголы' },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`${styles.prodDictSegBtn} ${enActive === tab.key ? styles.prodDictSegBtnActive : ''}`}
            onClick={() => setEnActive(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className={styles.prodSearch}>
        {enActive === 'words' && 'Поиск по слову...'}
        {enActive === 'idioms' && 'Поиск по идиомам...'}
        {enActive === 'phrasal' && 'Поиск по фразовым глаголам...'}
      </div>
      <div className={styles.prodWordCard}>
        <span className={styles.prodWordMeta}>Карточка</span>
        {enActive === 'words' && <span style={{ fontSize: '0.95rem', fontWeight: 700 }}>give up — сдаваться</span>}
        {enActive === 'idioms' && <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>it&apos;s raining cats and dogs</span>}
        {enActive === 'phrasal' && <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>give up — бросать, сдаваться</span>}
      </div>
    </div>
  );
}

function TtsMock({ previewLang }: { previewLang: LandingPreviewLang }) {
  const isZh = previewLang === 'zh';
  return (
    <div className={styles.prodWordCard} role="img" aria-label="Озвучка слова">
      <span className={styles.prodWordMeta}>Разбор слова</span>
      <span className={`${styles.dictTtsWord} ${isZh ? styles.mockHanzi : ''}`} style={{ fontSize: isZh ? '1.35rem' : '1rem' }}>
        {isZh ? '你好' : 'give up'}
      </span>
      {isZh && <span className={styles.mockPinyin}>nǐ hǎo</span>}
      <button type="button" className={styles.prodSpeakBtn}>🔊 Произношение</button>
    </div>
  );
}

function ContextMock({ previewLang }: { previewLang: LandingPreviewLang }) {
  const isZh = previewLang === 'zh';
  return (
    <div className={styles.prodWordCard} role="img" aria-label="Контекст">
      <span className={styles.prodWordMeta}>Пример</span>
      <span className={`${isZh ? styles.mockHanzi : ''}`} style={{ fontSize: isZh ? '1.15rem' : '0.95rem', fontWeight: 700 }}>
        {isZh ? '咖啡' : 'give up'}
      </span>
      {isZh && <span className={styles.mockPinyin}>kāfēi</span>}
      <span style={{ fontSize: '0.72rem', opacity: 0.8, lineHeight: 1.4 }}>
        {isZh ? '«我想点一杯咖啡» — из сценария «Кафе»' : '«…I won\'t give up on us…» — из клипа'}
      </span>
    </div>
  );
}

function CategoriesMock({ previewLang }: { previewLang: LandingPreviewLang }) {
  const tags = previewLang === 'zh' ? ['咖啡', '旅行', '日常'] : ['Бизнес', 'Еда', 'Сериалы'];
  return (
    <div className={styles.prodPanel} role="img" aria-label="Категории">
      <span className={styles.prodPanelLabel}>Категории</span>
      <div className={styles.prodChipRow}>
        {tags.map((t) => (
          <span key={t} className={styles.prodChip} style={{ cursor: 'default' }}>{t}</span>
        ))}
      </div>
      <button type="button" className={styles.prodSpeakBtn}>Экспорт CSV / Anki</button>
    </div>
  );
}

interface FeatureSlideDictionaryProps {
  sectionId?: string;
  highlight?: boolean;
}

export function FeatureSlideDictionary({ sectionId, highlight }: FeatureSlideDictionaryProps) {
  const { previewLang } = useLandingPreviewLang();
  const isZh = previewLang === 'zh';
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const highlightPills = isZh
    ? ['词语', '汉字', 'Пиньинь', 'Озвучка']
    : ['Слова', 'Идиомы', 'Озвучка', 'Категории'];

  const featureBlocks = [
    {
      key: 'types',
      hero: true,
      title: isZh ? '词语 и 汉字' : 'Три типа карточек',
      text: isZh
        ? 'Две вкладки: слова с пиньинем и тонами и отдельные иероглифы с уровнем HSK. Кликни по иероглифу — увидишь перевод.'
        : 'Сохраняй не только отдельные слова, но и целые идиомы («it\'s raining cats and dogs») и фразовые глаголы («give up»).',
      illo: (
        <div className={`${styles.featureBlockIllo} ${styles.prodIllo}`} role="img" aria-label="Типы карточек">
          <CardTypesMock previewLang={previewLang} />
        </div>
      ),
    },
    {
      key: 'tts',
      hero: false,
      title: 'Озвучка слова',
      text: isZh
        ? 'Нажми на кнопку — услышишь слово с пиньинем и тонами. Так проще запомнить и не путать похожие иероглифы.'
        : 'Нажми на кнопку — и услышишь правильное произношение. Так проще запомнить и не путать похожие слова.',
      illo: (
        <div className={`${styles.featureBlockIllo} ${styles.prodIllo}`} role="img" aria-label="Озвучка">
          <TtsMock previewLang={previewLang} />
        </div>
      ),
    },
    {
      key: 'context',
      hero: false,
      title: 'Контекст — всему голова',
      text: isZh
        ? 'Каждое слово хранится с примером из сценария, где ты его встретил. Так его легче вспомнить и правильно использовать.'
        : 'Каждое слово хранится с примером из видео или диалога, где ты его встретил. Так его легче вспомнить и правильно использовать.',
      illo: (
        <div className={`${styles.featureBlockIllo} ${styles.prodIllo}`} role="img" aria-label="Контекст">
          <ContextMock previewLang={previewLang} />
        </div>
      ),
    },
    {
      key: 'categories',
      hero: false,
      title: 'Категории и порядок',
      text: isZh
        ? 'Раскладывай слова по папкам («咖啡», «旅行», «日常»), ищи по фильтрам и экспортируй в любом формате.'
        : 'Раскладывай слова по папкам («Бизнес», «Еда», «Сериалы»), ищи по фильтрам и экспортируй в любом формате.',
      illo: (
        <div className={`${styles.featureBlockIllo} ${styles.prodIllo}`} role="img" aria-label="Категории">
          <CategoriesMock previewLang={previewLang} />
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
    <section ref={sectionRef} id={sectionId} className={`${styles.featureSlide} ${highlight ? styles.featureSlideHighlight : ''}`} aria-labelledby="feature-dictionary-title">
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
            <p className={styles.featureLabel}>База знаний</p>
            <h2 id="feature-dictionary-title" className={styles.featureTitle}>
              <span className={styles.featureTitleBlock}>
                <span className={styles.featureTitleIcon} aria-hidden><DictionaryIcon size={32} /></span>
                <span className={styles.featureTitleLine}>Словарь: Твоя личная база знаний</span>
              </span>
            </h2>
            <p className={styles.featureTagline}>
              {isZh
                ? 'Собирай и повторяй 词语 и 汉字 с пиньинем в одном месте.'
                : 'Собирай и повторяй слова, идиомы и фразовые глаголы в одном месте.'}
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
