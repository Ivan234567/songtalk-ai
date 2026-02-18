'use client';

import React, { useRef, useState, useEffect } from 'react';
import styles from './landing.module.css';

const TESTIMONIALS = [
  {
    quote: 'Наконец перестала молчать на созвонах. Тренировала ответы с ИИ — теперь формулирую мысли без паники.',
    name: 'Мария',
    role: 'менеджер в IT',
  },
  {
    quote: 'Караоке по любимым трекам плюс словарь — слова из песен реально осели. Говорю увереннее.',
    name: 'Дмитрий',
    role: 'изучает английский',
  },
  {
    quote: 'Удобно, что вижу прогресс в цифрах. Понимаю, где подтянуть, а не просто „занимаюсь вроде бы“.',
    name: 'Анна',
    role: 'готовится к собеседованию',
  },
] as const;

const STAT = {
  value: '500+',
  label: 'уже практикуют с Speakeasy',
};

export function SocialProofSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => setInView(e.isIntersecting),
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section id="reviews" className={styles.socialProofSection} ref={sectionRef} aria-labelledby="social-proof-title">
      <div className={styles.socialProofInner}>
        <p className={styles.socialProofLabel}>Отзывы</p>
        <h2 id="social-proof-title" className={styles.socialProofTitle}>
          Им уже проще говорить
        </h2>
        <p className={styles.socialProofSubtitle}>
          Опыт тех, кто тренирует речь и лексику с Speakeasy
        </p>

        <div className={styles.socialProofStat}>
          <span className={styles.socialProofStatValue}>{STAT.value}</span>
          <span className={styles.socialProofStatLabel}>{STAT.label}</span>
        </div>

        <ul className={styles.socialProofList} role="list">
          {TESTIMONIALS.map((item, i) => (
            <li
              key={i}
              className={`${styles.socialProofCard} ${inView ? styles.socialProofCardRevealed : ''}`}
              style={{ transitionDelay: inView ? `${i * 0.1}s` : '0s' }}
            >
              <blockquote className={styles.socialProofQuote}>
                «{item.quote}»
              </blockquote>
              <footer className={styles.socialProofAuthor}>
                <span className={styles.socialProofName}>{item.name}</span>
                <span className={styles.socialProofRole}>{item.role}</span>
              </footer>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
