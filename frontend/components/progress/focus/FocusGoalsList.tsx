'use client';

import React from 'react';
import styles from './focus.module.css';

type Goal = {
  goal_id: string;
  goal_label?: string;
  achieved: boolean;
};

type FocusGoalsListProps = {
  goals: Goal[];
  className?: string;
};

export function FocusGoalsList({ goals, className = '' }: FocusGoalsListProps) {
  if (goals.length === 0) {
    return (
      <section className={`${styles.card} ${className}`}>
        <h2 className={styles.sectionTitle}>Цели оценки</h2>
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', opacity: 0.72 }}>
          Цели не найдены для этой попытки.
        </p>
      </section>
    );
  }

  return (
    <section className={`${styles.card} ${className}`}>
      <h2 className={styles.sectionTitle}>Цели оценки</h2>
      <div style={{ marginTop: '0.75rem' }}>
        {goals.map((goal) => (
          <div key={goal.goal_id} className={styles.goalItem}>
            <span
              className={`${styles.stepIcon} ${goal.achieved ? styles.stepIconDone : styles.stepIconMissed}`}
              title={goal.achieved ? 'Достигнута' : 'Не достигнута'}
            >
              {goal.achieved ? '✓' : '△'}
            </span>
            <span style={{ flex: 1, opacity: goal.achieved ? 1 : 0.85 }}>
              {goal.goal_label || goal.goal_id}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
