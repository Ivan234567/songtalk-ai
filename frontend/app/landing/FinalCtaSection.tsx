'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import styles from './landing.module.css';
import { useLandingPreviewLang } from './preview-lang';

export function FinalCtaSection() {
  const { previewLang } = useLandingPreviewLang();
  const isZh = previewLang === 'zh';
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => setUser(u ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <section id="cta" className={styles.finalCtaSection} aria-labelledby="final-cta-title">
      <div className={styles.finalCtaInner}>
        <h2 id="final-cta-title" className={styles.finalCtaTitle}>
          Начни практиковать
        </h2>
        <p className={styles.finalCtaSubtitle}>
          {user
            ? isZh
              ? 'Пополни баланс и занимайся в своём темпе — сценарии HSK, голосовые минутки и словарь уже ждут.'
              : 'Пополни баланс и занимайся в своём темпе — собеседник, дебаты, караоке, словарь и аналитика уже ждут.'
            : isZh
              ? 'Зарегистрируйся и тренируй китайский: ситуативные диалоги HSK, голосовые минутки, словарь с пиньинем. Плати только за то, что реально потратил.'
              : 'Зарегистрируйся, пополни баланс на любую сумму и плати только за то, что реально потратил на занятия. Никакой ежемесячной подписки.'}
        </p>
        <div className={styles.finalCtaWrap}>
          <Link
            href={user ? '/dashboard' : '/auth/register'}
            className={`${styles.finalCtaButton} ${!user ? styles.finalCtaButtonPulse : ''}`}
          >
            {user ? 'Пополнить баланс' : 'Зарегистрироваться'}
            <span className={styles.finalCtaArrow} aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
