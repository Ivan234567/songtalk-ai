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

function FlagUk() {
  return (
    <span className={styles.langFlag} aria-hidden>
      <svg viewBox="0 0 60 40" focusable="false">
        <rect width="60" height="40" fill="#012169" />
        <path d="M0,0 L60,40 M60,0 L0,40" stroke="#fff" strokeWidth="8" />
        <path d="M0,0 L60,40 M60,0 L0,40" stroke="#C8102E" strokeWidth="4" />
        <path d="M30,0 V40 M0,20 H60" stroke="#fff" strokeWidth="13" />
        <path d="M30,0 V40 M0,20 H60" stroke="#C8102E" strokeWidth="7" />
      </svg>
    </span>
  );
}

function FlagCn() {
  const star = '0,-6 1.76,-1.85 6.7,-1.85 2.47,0.93 4.23,5.07 0,2.29 -4.23,5.07 -2.47,0.93 -6.7,-1.85 -1.76,-1.85';
  return (
    <span className={styles.langFlag} aria-hidden>
      <svg viewBox="0 0 90 60" focusable="false">
        <rect width="90" height="60" fill="#DE2910" />
        <g fill="#FFDE00">
          <polygon points={star} transform="translate(15,15) scale(1.45)" />
          <polygon points={star} transform="translate(30,7) rotate(18) scale(0.45)" />
          <polygon points={star} transform="translate(36,14) rotate(36) scale(0.45)" />
          <polygon points={star} transform="translate(36,23) rotate(18) scale(0.45)" />
          <polygon points={star} transform="translate(30,30) rotate(36) scale(0.45)" />
        </g>
      </svg>
    </span>
  );
}

const OPTIONS: { id: LandingPreviewLang; label: string; Flag: () => React.ReactElement }[] = [
  { id: 'en', label: 'English', Flag: FlagUk },
  { id: 'zh', label: '中文', Flag: FlagCn },
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
        const Flag = opt.Flag;
        return (
          <button
            key={opt.id}
            type="button"
            className={`${styles.langToggleBtn} ${active ? styles.langToggleBtnActive : ''}`}
            aria-pressed={active}
            aria-label={opt.id === 'en' ? 'Превью на английском' : 'Превью на китайском'}
            onClick={() => setPreviewLang(opt.id)}
          >
            <Flag />
            <span className={styles.langToggleBtnLabel}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
