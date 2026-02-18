'use client';

import React from 'react';
import styles from './focus.module.css';

type Step = {
  id: string;
  title: string;
  completed: boolean;
};

type FocusStepsListProps = {
  steps: Step[];
  className?: string;
};

export function FocusStepsList({ steps, className = '' }: FocusStepsListProps) {
  if (steps.length === 0) {
    return (
      <section className={`${styles.card} ${className}`}>
        <h2 className={styles.sectionTitle}>Шаги сценария</h2>
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', opacity: 0.72 }}>
          Шаги не найдены для этой попытки.
        </p>
      </section>
    );
  }

  return (
    <section className={`${styles.card} ${className}`}>
      <h2 className={styles.sectionTitle}>Шаги сценария</h2>
      <div style={{ marginTop: '0.75rem' }}>
        {steps.map((step) => (
          <div key={step.id} className={styles.stepItem}>
            <span
              className={`${styles.stepIcon} ${step.completed ? styles.stepIconDone : styles.stepIconMissed}`}
              title={step.completed ? 'Выполнено' : 'Пропущено'}
            >
              {step.completed ? '✓' : '○'}
            </span>
            <span style={{ flex: 1, opacity: step.completed ? 1 : 0.85 }}>{step.title}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
