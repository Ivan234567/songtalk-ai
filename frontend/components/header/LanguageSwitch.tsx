'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { useLearningLanguage } from '@/context/LearningLanguageContext';
import { LearningLanguage, LEARNING_LANGUAGE_LABELS } from '@/lib/learning-language';
import styles from './language-switch.module.css';

const OPTIONS: LearningLanguage[] = ['en', 'zh'];

export const LanguageSwitch: React.FC = () => {
  const { learningLanguage, setLearningLanguage, isLanguageReady, isSavingLanguage } = useLearningLanguage();
  const isDisabled = !isLanguageReady || isSavingLanguage;
  const [hintOpen, setHintOpen] = useState(false);
  const clusterRef = useRef<HTMLDivElement>(null);
  const hintId = useId();

  useEffect(() => {
    if (!hintOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!clusterRef.current?.contains(event.target as Node)) setHintOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHintOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [hintOpen]);

  return (
    <div
      ref={clusterRef}
      className={styles.cluster}
      onMouseEnter={() => setHintOpen(true)}
      onMouseLeave={() => setHintOpen(false)}
    >
      <button
        type="button"
        className={styles.cue}
        aria-expanded={hintOpen}
        aria-controls={hintId}
        onClick={() => {
          if (window.matchMedia('(hover: hover)').matches) return;
          setHintOpen((open) => !open);
        }}
      >
        <span className={styles.dots} aria-hidden="true">
          <i className={styles.dotEn} />
          <i className={styles.dotZh} />
        </span>
        <span className={styles.cueLabel}>два языка</span>
      </button>

      <div
        className={styles.switchRoot}
        role="group"
        aria-label="Язык практики"
        aria-describedby={hintId}
        aria-busy={isSavingLanguage}
        data-language={learningLanguage}
      >
        {OPTIONS.map((lang) => {
          const isActive = learningLanguage === lang;
          return (
            <button
              key={lang}
              type="button"
              className={[styles.switchBtn, isActive ? styles.switchBtnActive : ''].filter(Boolean).join(' ')}
              aria-pressed={isActive}
              disabled={isDisabled}
              onClick={() => setLearningLanguage(lang)}
            >
              {LEARNING_LANGUAGE_LABELS[lang]}
            </button>
          );
        })}
      </div>

      <div
        id={hintId}
        className={[styles.card, hintOpen ? styles.cardOpen : ''].filter(Boolean).join(' ')}
        role="note"
        hidden={!hintOpen}
      >
        <span className={styles.cardKicker}>Не перевод сайта</span>
        <p className={styles.cardText}>
          English и 中文 — разные занятия. Словарь, сценарии и прогресс у каждого свои. Меню остаётся на русском.
        </p>
      </div>
    </div>
  );
};
