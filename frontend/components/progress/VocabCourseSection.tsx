'use client';

import React, { useState } from 'react';
import { VocabCoursePillars } from './VocabCoursePillars';
import { VocabPracticeRecent } from './VocabPracticeRecent';
import { VocabCourseModules } from './VocabCourseModules';
import styles from './vocab-course-section.module.css';

export type CourseFunnelTotals = {
  due: number;
  learning: number;
  fresh: number;
  mastered: number;
};

/** Третья опора курса: словарь ↔ практика ↔ прогресс слов на одном экране. */
export function VocabCourseSection({
  embedded = false,
  onTotals,
}: {
  embedded?: boolean;
  onTotals?: (totals: CourseFunnelTotals) => void;
}) {
  const [part, setPart] = useState<'recent' | 'modules'>('recent');
  return (
    <section className={embedded ? styles.embedded : styles.wrap} aria-label="Курс слов">
      <div className={styles.head} hidden={embedded}>
        <p className={styles.eyebrow}>Курс слов</p>
        <h2 className={styles.title}>Как усваиваются слова</h2>
        <p className={styles.lead}>
          Отдельно от оценки сцены: модуль (список), урок (сессия ≤5) и слово (вехи + история).
        </p>
      </div>
      <VocabCoursePillars />
      {embedded ? (
        <>
          <div className={styles.subtabs} role="tablist" aria-label="Разделы слов">
            <button type="button" role="tab" aria-selected={part === 'recent'} onClick={() => setPart('recent')}>Недавние уроки слов</button>
            <button type="button" role="tab" aria-selected={part === 'modules'} onClick={() => setPart('modules')}>Модули слов</button>
          </div>
          <div hidden={part !== 'recent'}>
            <VocabPracticeRecent hideTitle />
          </div>
          <div hidden={part !== 'modules'}>
            <VocabCourseModules onTotals={onTotals} hideTitle />
          </div>
        </>
      ) : (
        <>
          <VocabPracticeRecent />
          <VocabCourseModules onTotals={onTotals} />
        </>
      )}
    </section>
  );
}
