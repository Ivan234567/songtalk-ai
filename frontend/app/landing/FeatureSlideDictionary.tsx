'use client';

import React, { useState, useEffect, useRef } from 'react';
import { DictionaryIcon } from '@/components/sidebar/Sidebar';
import { LangPreviewToggle, useLandingPreviewLang, type LandingPreviewLang } from './preview-lang';
import styles from './landing.module.css';

type EnCardKey = 'words' | 'idioms' | 'phrasal';
type ZhCardKey = 'words' | 'characters' | 'chengyu';

function CardTypesMock({ previewLang }: { previewLang: LandingPreviewLang }) {
  const isZh = previewLang === 'zh';
  const [enActive, setEnActive] = useState<EnCardKey>('idioms');
  const [zhActive, setZhActive] = useState<ZhCardKey>('words');

  if (isZh) {
    return (
      <div className={styles.dictTypesWrap} role="img" aria-label="Типы карточек">
        <div className={styles.dictTypesTabs}>
          {([
            { key: 'words', label: 'Слова' },
            { key: 'characters', label: 'Иероглифы' },
            { key: 'chengyu', label: '成语' },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`${styles.dictTypesTab} ${zhActive === tab.key ? styles.dictTypesTabActive : ''}`}
              onClick={() => setZhActive(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className={styles.dictTypesExample}>
          {zhActive === 'words' && (
            <span className={`${styles.dictTypesPhrase} ${styles.dictTypesPhraseStack}`}>
              <span className={styles.mockHanzi}>你好</span>
              <span className={styles.mockPinyin}>nǐ hǎo — привет</span>
            </span>
          )}
          {zhActive === 'characters' && (
            <span className={`${styles.dictTypesPhrase} ${styles.dictTypesPhraseStack}`}>
              <span className={styles.mockHanzi}>你</span>
              <span className={styles.mockPinyin}>nǐ</span>
              <span className={styles.hskBadge}>HSK 1</span>
            </span>
          )}
          {zhActive === 'chengyu' && (
            <span className={`${styles.dictTypesPhrase} ${styles.dictTypesPhraseStack}`}>
              <span className={styles.mockHanzi}>马马虎虎</span>
              <span className={styles.mockPinyin}>mǎmǎhūhū — так себе</span>
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dictTypesWrap} role="img" aria-label="Типы карточек">
      <div className={styles.dictTypesTabs}>
        {(['words', 'idioms', 'phrasal'] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={`${styles.dictTypesTab} ${enActive === key ? styles.dictTypesTabActive : ''}`}
            onClick={() => setEnActive(key)}
          >
            {key === 'words' && 'Слова'}
            {key === 'idioms' && 'Идиомы'}
            {key === 'phrasal' && 'Фраз. глаголы'}
          </button>
        ))}
      </div>
      <div className={styles.dictTypesExample}>
        {enActive === 'words' && <span className={styles.dictTypesPhrase}>give up — сдаваться</span>}
        {enActive === 'idioms' && <span className={styles.dictTypesPhrase}>it's raining cats and dogs</span>}
        {enActive === 'phrasal' && <span className={styles.dictTypesPhrase}>give up — бросать, сдаваться</span>}
      </div>
    </div>
  );
}

/** Озвучка слова — нажми и услышишь */
function TtsMock({ previewLang }: { previewLang: LandingPreviewLang }) {
  const [hovered, setHovered] = useState(false);
  const isZh = previewLang === 'zh';
  return (
    <div
      className={`${styles.dictTtsWrap} ${hovered ? styles.dictTtsWrapHover : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="img"
      aria-label="Озвучка слова"
    >
      <span className={styles.dictTtsStack}>
        <span className={`${styles.dictTtsWord} ${isZh ? styles.mockHanzi : ''}`}>{isZh ? '你好' : 'give up'}</span>
        {isZh && <span className={styles.mockPinyin}>nǐ hǎo</span>}
      </span>
      <span className={styles.dictTtsBtn} aria-hidden>🔊</span>
      <span className={styles.dictTtsHint}>{hovered ? 'Нажми — услышишь' : 'Озвучка'}</span>
    </div>
  );
}

/** Контекст из видео/диалога */
function ContextMock({ previewLang }: { previewLang: LandingPreviewLang }) {
  const isZh = previewLang === 'zh';
  return (
    <div className={styles.dictContextWrap} role="img" aria-label="Контекст">
      <div className={`${styles.dictContextWord} ${isZh ? styles.mockHanzi : ''}`}>{isZh ? '月亮' : 'give up'}</div>
      {isZh && <div className={styles.mockPinyin}>yuèliang</div>}
      <div className={styles.dictContextLine}>
        {isZh ? '«…月亮代表我的心…» — из клипа' : '«…I won\'t give up on us…» — из клипа'}
      </div>
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
    ? ['Слова', 'Иероглифы', '成语', 'Озвучка']
    : ['Слова', 'Идиомы', 'Озвучка', 'Категории'];

  const featureBlocks = [
    {
      key: 'types',
      hero: true,
      title: isZh ? 'Слова, иероглифы, 成语' : 'Три типа карточек',
      text: isZh
        ? 'Сохраняй слова с пиньинем, отдельные иероглифы с уровнем HSK и 成语 — в одном словаре.'
        : 'Сохраняй не только отдельные слова, но и целые идиомы («it\'s raining cats and dogs») и фразовые глаголы («give up»).',
      illo: (
        <div className={styles.featureBlockIllo} role="img" aria-label="Типы карточек">
          <CardTypesMock previewLang={previewLang} />
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
          <TtsMock previewLang={previewLang} />
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
          <ContextMock previewLang={previewLang} />
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
                ? 'Собирай и повторяй слова, иероглифы и 成语 в одном месте.'
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
