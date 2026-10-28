'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import styles from './vocab-course-pillars.module.css';

/** Короткий ориентир «что / где / как» для контура словаря ↔ практики ↔ прогресса. */
export function VocabCoursePillars() {
  const router = useRouter();
  return (
    <section className={styles.section} aria-label="Курс слов">
      <p className={styles.lead}>Перейти</p>
      <div className={styles.row}>
        <button type="button" className={styles.card} onClick={() => router.push('/dashboard?tab=dictionary')}>
          <span className={styles.kicker}>Словарь</span>
          <strong>Что учу</strong>
          <span className={styles.hint}>Списки и привязка к сценам</span>
        </button>
        <button type="button" className={styles.card} onClick={() => router.push('/dashboard?tab=agent')}>
          <span className={styles.kicker}>Практика</span>
          <strong>Где применяю</strong>
          <span className={styles.hint}>До 5 слов в сцене или дебате</span>
        </button>
        <button type="button" className={styles.card} onClick={() => router.push('/dashboard?tab=progress')}>
          <span className={styles.kicker}>Прогресс</span>
          <strong>Как усваиваю</strong>
          <span className={styles.hint}>Сессия → модуль → слово</span>
        </button>
      </div>
    </section>
  );
}
