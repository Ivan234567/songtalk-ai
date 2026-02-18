'use client';

import React, { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import styles from './landing.module.css';

const IconTTS = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
  </svg>
);

const IconBook = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    <path d="M8 7h8" />
    <path d="M8 11h6" />
  </svg>
);

const IconWhisper = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="22" />
  </svg>
);

const TARIFFS = [
  {
    id: 'start',
    name: 'Стартовый',
    price: 300,
    dialogue: '≈ 1 час живого диалога',
    rows: [
      { model: 'GPT-4o-mini-tts (озвучка)', get: '32 600 символов', like: '30 минут аудиокниги (20 страниц текста)', Icon: IconTTS },
      { model: 'Deepseek (генерация)', get: '~840 000 токенов', like: 'почти 1 том «Войны и мира»', Icon: IconBook },
      { model: 'Whisper (распознавание)', get: '32 минуты', like: '2 интервью по 15 минут', Icon: IconWhisper },
    ],
  },
  {
    id: 'optimal',
    name: 'Оптимальный',
    price: 700,
    dialogue: '≈ 2,5 часа диалога',
    featured: true,
    rows: [
      { model: 'GPT-4o-mini-tts (озвучка)', get: '76 000 символов', like: 'полнометражный мультфильм (70 мин эфира)', Icon: IconTTS },
      { model: 'Deepseek (генерация)', get: '~1 950 000 токенов', like: 'более 2 томов «Войны и мира»', Icon: IconBook },
      { model: 'Whisper (распознавание)', get: '76 минут', like: 'курс из 4 лекций', Icon: IconWhisper },
    ],
  },
  {
    id: 'pro',
    name: 'Профессиональный',
    price: 1500,
    dialogue: '≈ 5,5 часов диалога',
    rows: [
      { model: 'GPT-4o-mini-tts (озвучка)', get: '163 000 символов', like: 'аудиоспектакль (2,5 часа контента)', Icon: IconTTS },
      { model: 'Deepseek (генерация)', get: '~4 200 000 токенов', like: 'почти 5 томов «Войны и мира» (больше всего романа!)', Icon: IconBook },
      { model: 'Whisper (распознавание)', get: '163 минуты', like: 'полный аудиокурс (3 вебинара)', Icon: IconWhisper },
    ],
  },
];

export function PricingSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => setInView(e.isIntersecting),
      { threshold: 0.08 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => setUser(u ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <section id="pricing" className={styles.pricingSection} ref={sectionRef} aria-labelledby="pricing-title">
      <div className={styles.pricingInner}>
        <p className={styles.pricingLabel}>Тарифы</p>
        <h2 id="pricing-title" className={styles.pricingTitle}>
          Выбери объём практики
        </h2>
        <p className={styles.pricingSubtitle}>
          Всё по тарифу: минуты диалога, озвучка и распознавание — в понятных объёмах
        </p>

        <div className={styles.pricingGrid}>
          {TARIFFS.map((tariff, i) => (
            <article
              key={tariff.id}
              className={`${styles.pricingCard} ${tariff.featured ? styles.pricingCardFeatured : ''} ${inView ? styles.pricingCardRevealed : ''}`}
              style={{ transitionDelay: inView ? `${i * 0.1}s` : '0s' }}
            >
              <div className={styles.pricingCardHead}>
                <h3 className={styles.pricingCardName}>{tariff.name}</h3>
                <p className={styles.pricingCardPrice}>
                  <span className={styles.pricingCardPriceValue}>{tariff.price}</span>
                  <span className={styles.pricingCardPriceCur}> ₽</span>
                </p>
                <p className={styles.pricingCardDialogue}>{tariff.dialogue}</p>
              </div>

              <div className={styles.pricingCardTableWrap}>
                <table className={styles.pricingTable}>
                  <thead>
                    <tr>
                      <th scope="col">Модель</th>
                      <th scope="col">Что получит</th>
                      <th scope="col">Это как...</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tariff.rows.map((row, j) => {
                      const Icon = row.Icon;
                      return (
                      <tr key={j}>
                        <td>
                          <span className={styles.pricingTableModel}>
                            <span className={styles.pricingTableModelIcon} aria-hidden><Icon /></span>
                            {row.model}
                          </span>
                        </td>
                        <td className={styles.pricingTableGet}>{row.get}</td>
                        <td className={styles.pricingTableLike}>{row.like}</td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>

              <div className={styles.pricingCardCta}>
                <Link
                  href={user ? '/dashboard' : '/auth/register'}
                  className={styles.pricingCardButton}
                >
                  Пополнить баланс
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
