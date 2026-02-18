'use client';

import React, { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { FeatureSlideAgent } from './FeatureSlideAgent';
import { FeatureSlideKaraoke } from './FeatureSlideKaraoke';
import { FeatureSlideProgress } from './FeatureSlideProgress';
import { FeatureSlideDictionary } from './FeatureSlideDictionary';
import { ProblemAgitationSection } from './ProblemAgitationSection';
import { HowItWorksSection } from './HowItWorksSection';
import { BenefitsSection } from './BenefitsSection';
import { SocialProofSection } from './SocialProofSection';
import { PricingSection } from './PricingSection';
import { FinalCtaSection } from './FinalCtaSection';
import { FaqSection } from './FaqSection';
import { FooterSection } from './FooterSection';
import styles from './landing.module.css';

const HIGHLIGHT_DURATION_MS = 2600;

const VIEWBOX_WIDTH = 1200;
const VIEWBOX_HEIGHT = 240;

// Базовая форма волны (симметричная, как в аудио-вайвформе), потом зеркалим для полной длины.
const BASE_WAVEFORM = [
  10, 14, 20, 28, 36, 48, 62, 78, 94, 110, 124, 136, 146, 154, 160, 166, 170, 166, 160, 154, 146, 136, 124, 110,
  94, 78, 62, 48, 36, 28, 20, 14, 10,
];

const WAVEFORM = [...BASE_WAVEFORM, ...BASE_WAVEFORM.slice().reverse()];
const BAR_GAP = VIEWBOX_WIDTH / WAVEFORM.length;
const BAR_WIDTH = BAR_GAP * 0.68;

function HeroWaves() {
  return (
    <div className={styles.heroWavesWrap}>
      <svg
        className={styles.heroWavesSvg}
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="waveGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#79e0c2" stopOpacity="0.2" />
            <stop offset="45%" stopColor="#4ad495" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#2fb06e" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="waveGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2fb06e" stopOpacity="0.22" />
            <stop offset="55%" stopColor="#6bf0b0" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#83ffce" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="waveGradSoft" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2fb06e" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#2a7c55" stopOpacity="0.3" />
          </linearGradient>
          <filter id="waveBlur" x="-10%" y="-20%" width="120%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="8" />
          </filter>
        </defs>
        <g className={styles.heroWavesBack}>
          {WAVEFORM.map((height, i) => {
            const x = i * BAR_GAP + (BAR_GAP - BAR_WIDTH) / 2;
            const barHeight = height * 0.62 + 10;
            return (
              <rect
                key={`bg-${i}`}
                x={x}
                y={(VIEWBOX_HEIGHT - barHeight) / 2}
                width={BAR_WIDTH}
                height={barHeight}
                rx={BAR_WIDTH / 2}
                className={styles.heroWaveBarBack}
                style={{
                  animationDelay: `${(i % 12) * 0.08}s`,
                  ['--bar-duration' as string]: `${2.6 + (i % 6) * 0.12}s`,
                  ['--bar-jitter' as string]: `${0.06 + (i % 7) * 0.012}`,
                  opacity: 0.35 + (barHeight / VIEWBOX_HEIGHT) * 0.25,
                }}
                fill="url(#waveGradSoft)"
                filter="url(#waveBlur)"
              />
            );
          })}
        </g>
        <g className={styles.heroWavesFront}>
          {WAVEFORM.map((height, i) => {
            const x = i * BAR_GAP + (BAR_GAP - BAR_WIDTH) / 2;
            const barHeight = height;
            const jitter = 0.1 + ((i * 3) % 9) * 0.016; // ровное, но «живое» движение
            return (
              <rect
                key={`front-${i}`}
                x={x}
                y={(VIEWBOX_HEIGHT - barHeight) / 2}
                width={BAR_WIDTH}
                height={barHeight}
                rx={BAR_WIDTH / 2}
                className={styles.heroWaveBar}
                style={{
                  animationDelay: `${(i % 10) * 0.06}s`,
                  ['--bar-duration' as string]: `${2 + (i % 5) * 0.16}s`,
                  ['--bar-jitter' as string]: `${jitter}`,
                  opacity: 0.28 + (barHeight / VIEWBOX_HEIGHT) * 0.55,
                }}
                fill={i % 2 === 0 ? 'url(#waveGrad1)' : 'url(#waveGrad2)'}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function Logo() {
  return <span className={styles.logoText}>Speakeasy</span>;
}

export default function LandingPage() {
  const [highlightSection, setHighlightSection] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToFeature = useCallback((sectionId: string) => {
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setHighlightSection(sectionId);
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightSection(null);
        highlightTimeoutRef.current = null;
      }, HIGHLIGHT_DURATION_MS);
    }
  }, []);

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <Link href="/" className={styles.logoLink} aria-label="Speakeasy — на главную">
          <Logo />
        </Link>
        <nav className={styles.nav} aria-label="Основная навигация">
          <Link href="/auth/login" className={styles.navBtnOutline}>
            Войти
          </Link>
          <Link href="/auth/register" className={styles.navBtnOutline}>
            Регистрация
          </Link>
        </nav>
      </header>

      <section id="hero" className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroContent}>
          <h1 id="hero-title" className={styles.heroTitle}>
            Speakeasy — говори легко, даже если ошибаешься.
          </h1>
          <p className={styles.heroSubtitle}>
            Хватит молчать — тренируй речь в живых сценариях с ИИ. От заказа кофе до дебатов. Без осуждающих взглядов. Только ты и твой темп.
          </p>
          <div className={styles.heroCtaWrap}>
            <Link href="/auth/register" className={styles.heroCtaGlass}>
              Начать
              <span className={styles.heroCtaArrow} aria-hidden>→</span>
            </Link>
          </div>
        </div>
        <div className={styles.heroWaves} aria-hidden="true">
          <HeroWaves />
        </div>
      </section>

      <ProblemAgitationSection onScrollToFeature={scrollToFeature} />

      <div className={styles.featuresCarousel}>
        <FeatureSlideAgent
          sectionId="feature-slide-agent"
          highlight={highlightSection === 'feature-slide-agent'}
        />
        <FeatureSlideKaraoke
          sectionId="feature-slide-karaoke"
          highlight={highlightSection === 'feature-slide-karaoke'}
        />
        <FeatureSlideProgress
          sectionId="feature-slide-progress"
          highlight={highlightSection === 'feature-slide-progress'}
        />
        <FeatureSlideDictionary
          sectionId="feature-slide-dictionary"
          highlight={highlightSection === 'feature-slide-dictionary'}
        />
      </div>

      <HowItWorksSection />
      <BenefitsSection />
      <SocialProofSection />
      <PricingSection />
      <FinalCtaSection />
      <FaqSection />
      <FooterSection />
    </div>
  );
}
