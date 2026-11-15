'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import styles from './landing.module.css';
import { useLandingPreviewLang } from './preview-lang';
import { useAccountHome } from '@/lib/account-home';

export function FinalCtaSection() {
  const { previewLang } = useLandingPreviewLang();
  const isZh = previewLang === 'zh';
  const [user, setUser] = useState<User | null>(null);
  const home = useAccountHome();
  const partner = Boolean(user) && home === 'partner';

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
          {partner
            ? 'Откройте партнёрский кабинет.'
            : user
            ? isZh
              ? 'Пополни баланс. Слова, которым пора, уже ждут ситуативный диалог HSK.'
              : 'Пополни баланс. Слова, которым пора, уже ждут сценарий или дебат.'
            : isZh
              ? 'Зарегистрируйся. Слова, которым пора, войдут в ситуативный диалог HSK. Плати только за то, что реально потратил.'
              : 'Зарегистрируйся. Слова, которым пора, войдут в сценарий или дебат. Плати только за то, что реально потратил, без ежемесячной подписки.'}
        </p>
        <div className={styles.finalCtaWrap}>
          <Link
            href={!user ? '/auth/register' : partner ? '/partner' : '/dashboard?tab=balance'}
            className={`${styles.finalCtaButton} ${!user ? styles.finalCtaButtonPulse : ''}`}
            aria-disabled={Boolean(user) && home === 'loading'}
            onClick={(event) => {
              if (user && home === 'loading') event.preventDefault();
            }}
          >
            {!user ? 'Зарегистрироваться' : partner ? 'Партнёрский кабинет' : 'Пополнить баланс'}
            <span className={styles.finalCtaArrow} aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
