'use client';

import React from 'react';
import { VocabCoursePillars } from './VocabCoursePillars';
import { VocabPracticeRecent } from './VocabPracticeRecent';
import { VocabCourseModules } from './VocabCourseModules';
import styles from './vocab-course-section.module.css';

/** Третья опора курса: словарь ↔ практика ↔ прогресс слов на одном экране. */
export function VocabCourseSection() {
  return (
    <section className={styles.wrap} aria-label="Курс слов">
      <div className={styles.head}>
        <p className={styles.eyebrow}>Курс слов</p>
        <h2 className={styles.title}>Как усваиваются слова</h2>
        <p className={styles.lead}>
          Отдельно от оценки сцены: модуль (список), урок (сессия ≤5) и слово (вехи + история).
        </p>
      </div>
      <VocabCoursePillars />
      <VocabPracticeRecent />
      <VocabCourseModules />
    </section>
  );
}
