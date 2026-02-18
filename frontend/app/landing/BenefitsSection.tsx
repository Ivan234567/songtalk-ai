'use client';

import React, { useState, useEffect, useRef } from 'react';
import styles from './landing.module.css';

const BENEFITS = [
  {
    theme: 'Речь',
    before: 'На созвоне понимаю всё, но сказать не решаюсь.',
    after: 'Отвечаю и уточняю — практика дала уверенность.',
    via: ['Собеседник'],
    viaText: 'Диалоги с ИИ, сценарии и подсказки — практикуй в своём темпе, без страха ошибиться.',
    iconBefore: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="22" />
        <line x1="5" y1="5" x2="19" y2="19" />
      </svg>
    ),
    iconAfter: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>
    ),
  },
  {
    theme: 'Лексика',
    before: 'Песни и сериалы смотрю впустую — слова не оседают.',
    after: 'Лексика из любимого контента в словаре и в речи.',
    via: ['Караоке', 'Словарь'],
    viaText: 'Слова из видео в коллекцию, озвучка и повторение в словаре.',
    iconBefore: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
        <path d="M8 7h8" />
        <path d="M8 11h6" />
      </svg>
    ),
    iconAfter: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
        <path d="m9 10 2 2 4-4" />
      </svg>
    ),
  },
  {
    theme: 'Прогресс',
    before: 'Занимаюсь вроде бы, но расту ли — непонятно.',
    after: 'Баллы и тренды показывают, где я вырос.',
    via: ['Аналитика'],
    viaText: 'Оценка по критериям, разбор диалогов, графики и рекомендации.',
    iconBefore: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-3 3" />
      </svg>
    ),
    iconAfter: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 3v18h18" />
        <path d="M7 14 11 10 15 14 21 8" />
      </svg>
    ),
  },
] as const;

export function BenefitsSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const [hoverCard, setHoverCard] = useState<number | null>(null);
  const [highlightSide, setHighlightSide] = useState<'before' | 'after' | null>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => setInView(e.isIntersecting),
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const handleBeforeEnter = (i: number) => {
    setHoverCard(i);
    setHighlightSide('after');
  };
  const handleAfterEnter = (i: number) => {
    setHoverCard(i);
    setHighlightSide('before');
  };
  const handleCardLeave = () => {
    setHoverCard(null);
    setHighlightSide(null);
  };

  return (
    <section id="benefits" className={styles.benefitsSection} ref={sectionRef} aria-labelledby="benefits-title">
      <div className={styles.benefitsBg} aria-hidden />
      <div className={styles.benefitsInner}>
        <p className={styles.benefitsLabel}>Результат</p>
        <h2 id="benefits-title" className={styles.benefitsTitle}>
          Что меняется
        </h2>
        <p className={styles.benefitsSubtitle}>
          Не характеристики продукта — ваша жизнь до и после
        </p>

        <div className={styles.benefitsGrid}>
          {BENEFITS.map((item, i) => (
            <article
              key={i}
              className={`${styles.benefitsCard} ${inView ? styles.benefitsCardRevealed : ''}`}
              style={{ transitionDelay: inView ? `${i * 0.12}s` : '0s' }}
              data-highlight={hoverCard === i ? highlightSide : undefined}
              onMouseLeave={handleCardLeave}
            >
              <span className={styles.benefitsCardTheme}>{item.theme}</span>
              <div
                className={styles.benefitsCardBefore}
                onMouseEnter={() => handleBeforeEnter(i)}
              >
                <span className={styles.benefitsCardTag}>
                  <span className={styles.benefitsCardTagIcon}>{item.iconBefore}</span>
                  До
                </span>
                <p className={styles.benefitsCardText}>{item.before}</p>
              </div>
              <div className={styles.benefitsCardBridge} aria-hidden>
                <span className={styles.benefitsCardBridgeLine} />
                <span className={styles.benefitsCardArrow} title="До → После" aria-hidden>
                  <svg className={styles.benefitsCardArrowSvg} viewBox="0 0 32 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M2 7h20M18 3l4 4-4 4" />
                  </svg>
                </span>
              </div>
              <div
                className={styles.benefitsCardAfter}
                onMouseEnter={() => handleAfterEnter(i)}
              >
                <span className={styles.benefitsCardTag}>
                  <span className={styles.benefitsCardTagIcon}>{item.iconAfter}</span>
                  После
                </span>
                <p className={styles.benefitsCardText}>{item.after}</p>
                <p className={styles.benefitsCardVia}>
                  <span className={styles.benefitsCardViaLabel}>Благодаря:</span>{' '}
                  <span className={styles.benefitsCardViaPills}>
                    {item.via.join(' + ')}
                  </span>
                  — {item.viaText}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
