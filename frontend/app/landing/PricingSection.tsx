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
    dialogue: '≈ 2 часа разговора с агентом',
    rows: [
      { model: 'Диалог с агентом', get: 'до ~2 часов', like: 'сценарии, дебаты или свободный разговор', Icon: IconWhisper },
      { model: 'Озвучка', get: 'до 800 озвучек', like: 'слова и фразы в словаре', Icon: IconTTS },
      { model: 'Получение', get: 'сразу в аккаунте', like: 'сумма падает на баланс, доставки нет', Icon: IconBook },
    ],
  },
  {
    id: 'optimal',
    name: 'Оптимальный',
    price: 500,
    dialogue: '≈ 3,5 часа практики',
    featured: true,
    rows: [
      { model: 'Диалог с агентом', get: 'около 3,5 часов', like: 'тот же баланс на все разделы', Icon: IconWhisper },
      { model: 'Озвучка', get: 'до 1 300 озвучек', like: 'произношение слов и фраз', Icon: IconTTS },
      { model: 'Получение', get: 'сразу в аккаунте', like: 'после оплаты баланс обновляется в кабинете', Icon: IconBook },
    ],
  },
  {
    id: 'pro',
    name: 'Профессиональный',
    price: 1000,
    dialogue: '≈ 7 часов разговора',
    rows: [
      { model: 'Диалог с агентом', get: 'около 7 часов', like: 'длинная практика без подписки', Icon: IconWhisper },
      { model: 'Озвучка', get: 'до 2 500 озвучек', like: 'или смесь диалога и озвучки', Icon: IconTTS },
      { model: 'Получение', get: 'сразу в аккаунте', like: 'отдельный файл или письмо с заказом не приходит', Icon: IconBook },
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
          Фиксированные суммы 300, 500 и 1 000 ₽. После оплаты баланс сразу появляется в аккаунте, подписки нет.
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
                  href={user ? '/dashboard?tab=balance' : '/auth/register'}
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
