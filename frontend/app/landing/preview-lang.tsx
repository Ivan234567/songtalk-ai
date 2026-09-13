'use client';

import React, { createContext, useContext, useMemo, useState } from 'react';
import styles from './landing.module.css';

export type LandingPreviewLang = 'en' | 'zh';

type LandingPreviewLangContextValue = {
  previewLang: LandingPreviewLang;
  setPreviewLang: (lang: LandingPreviewLang) => void;
};

const LandingPreviewLangContext = createContext<LandingPreviewLangContextValue | null>(null);

export function LandingPreviewLangProvider({ children }: { children: React.ReactNode }) {
  const [previewLang, setPreviewLang] = useState<LandingPreviewLang>('en');
  const value = useMemo(() => ({ previewLang, setPreviewLang }), [previewLang]);
  return (
    <LandingPreviewLangContext.Provider value={value}>
      {children}
    </LandingPreviewLangContext.Provider>
  );
}

export function useLandingPreviewLang(): LandingPreviewLangContextValue {
  const ctx = useContext(LandingPreviewLangContext);
  if (!ctx) {
    throw new Error('useLandingPreviewLang must be used within LandingPreviewLangProvider');
  }
  return ctx;
}

const OPTIONS: { id: LandingPreviewLang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'zh', label: '中文' },
];

type LangPreviewToggleProps = {
  variant?: 'hero' | 'slide' | 'header';
};

export function LangPreviewToggle({ variant = 'slide' }: LangPreviewToggleProps) {
  const { previewLang, setPreviewLang } = useLandingPreviewLang();
  const wrapClass = [
    styles.langToggle,
    variant === 'hero' ? styles.langToggleHero : '',
    variant === 'slide' ? styles.langToggleSlide : '',
    variant === 'header' ? styles.langToggleHeader : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={wrapClass}
      role="group"
      aria-label="Превью языка: английский или китайский"
    >
      {OPTIONS.map((opt) => {
        const active = previewLang === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            className={`${styles.langToggleBtn} ${active ? styles.langToggleBtnActive : ''}`}
            aria-pressed={active}
            onClick={() => setPreviewLang(opt.id)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
