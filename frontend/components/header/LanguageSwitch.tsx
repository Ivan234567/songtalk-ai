'use client';

import React from 'react';
import { useLearningLanguage } from '@/context/LearningLanguageContext';
import { LearningLanguage, LEARNING_LANGUAGE_LABELS } from '@/lib/learning-language';
import styles from './language-switch.module.css';

const OPTIONS: LearningLanguage[] = ['en', 'zh'];

export const LanguageSwitch: React.FC = () => {
  const { learningLanguage, setLearningLanguage, isLanguageReady, isSavingLanguage } = useLearningLanguage();
  const isDisabled = !isLanguageReady || isSavingLanguage;

  return (
    <div
      className={styles.switchRoot}
      role="group"
      aria-label="Язык обучения"
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
  );
};
