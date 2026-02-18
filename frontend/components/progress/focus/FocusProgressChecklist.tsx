'use client';

import React, { useState, useMemo } from 'react';
import styles from './focus.module.css';

type Step = {
  id: string;
  title: string;
  completed: boolean;
};

type Goal = {
  goal_id: string;
  goal_label?: string;
  achieved: boolean;
};

type FocusProgressChecklistProps = {
  steps: Step[];
  goals: Goal[];
  className?: string;
};

type TabType = 'steps' | 'goals';

export function FocusProgressChecklist({
  steps,
  goals,
  className = '',
}: FocusProgressChecklistProps) {
  const [activeTab, setActiveTab] = useState<TabType>('steps');

  // Calculate stats
  const stepsStats = useMemo(() => {
    const completed = steps.filter((s) => s.completed).length;
    const total = steps.length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, pct };
  }, [steps]);

  const goalsStats = useMemo(() => {
    const achieved = goals.filter((g) => g.achieved).length;
    const total = goals.length;
    const pct = total > 0 ? Math.round((achieved / total) * 100) : 0;
    return { achieved, total, pct };
  }, [goals]);

  // Current tab stats
  const currentStats = activeTab === 'steps' 
    ? { done: stepsStats.completed, total: stepsStats.total, pct: stepsStats.pct }
    : { done: goalsStats.achieved, total: goalsStats.total, pct: goalsStats.pct };

  const isEmpty = steps.length === 0 && goals.length === 0;

  if (isEmpty) {
    return (
      <section className={`${styles.card} ${className}`}>
        <h2 className={styles.sectionTitle}>Прогресс сессии</h2>
        <p className={styles.checklistEmpty}>
          Нет данных о шагах и целях для этой попытки.
        </p>
      </section>
    );
  }

  return (
    <section className={`${styles.card} ${className}`}>
      {/* Header with tabs */}
      <div className={styles.checklistHeader}>
        <h2 className={styles.sectionTitle}>Прогресс сессии</h2>
        <div className={styles.checklistTabs}>
          <button
            type="button"
            className={`${styles.checklistTab} ${activeTab === 'steps' ? styles.checklistTabActive : ''}`}
            onClick={() => setActiveTab('steps')}
          >
            <span className={styles.checklistTabIcon}>📋</span>
            <span>Шаги</span>
            <span className={styles.checklistTabBadge}>{stepsStats.completed}/{stepsStats.total}</span>
          </button>
          <button
            type="button"
            className={`${styles.checklistTab} ${activeTab === 'goals' ? styles.checklistTabActive : ''}`}
            onClick={() => setActiveTab('goals')}
          >
            <span className={styles.checklistTabIcon}>🎯</span>
            <span>Цели</span>
            <span className={styles.checklistTabBadge}>{goalsStats.achieved}/{goalsStats.total}</span>
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className={styles.checklistProgress}>
        <div className={styles.checklistProgressBar}>
          <div 
            className={styles.checklistProgressFill}
            style={{ 
              width: `${currentStats.pct}%`,
              background: currentStats.pct === 100 
                ? 'var(--accent)' 
                : currentStats.pct >= 50 
                  ? 'linear-gradient(90deg, var(--accent), rgba(245, 158, 11, 0.9))'
                  : 'rgba(245, 158, 11, 0.9)',
            }}
          />
        </div>
        <div className={styles.checklistProgressLabel}>
          <span className={styles.checklistProgressPct}>{currentStats.pct}%</span>
          <span className={styles.checklistProgressText}>
            {activeTab === 'steps' ? 'выполнено' : 'достигнуто'}
          </span>
        </div>
      </div>

      {/* Items list */}
      <div className={styles.checklistItems}>
        {activeTab === 'steps' && (
          <>
            {steps.length === 0 ? (
              <p className={styles.checklistEmpty}>Шаги не найдены.</p>
            ) : (
              steps.map((step, index) => (
                <div 
                  key={step.id} 
                  className={`${styles.checklistItem} ${step.completed ? styles.checklistItemDone : styles.checklistItemPending}`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className={styles.checklistItemNumber}>{index + 1}</div>
                  <div className={styles.checklistItemIcon}>
                    {step.completed ? (
                      <span className={styles.checklistIconDone}>✓</span>
                    ) : (
                      <span className={styles.checklistIconPending}>○</span>
                    )}
                  </div>
                  <div className={styles.checklistItemContent}>
                    <span className={styles.checklistItemTitle}>{step.title}</span>
                    <span className={styles.checklistItemStatus}>
                      {step.completed ? 'Выполнено' : 'Пропущено'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {activeTab === 'goals' && (
          <>
            {goals.length === 0 ? (
              <p className={styles.checklistEmpty}>Цели не найдены.</p>
            ) : (
              goals.map((goal, index) => (
                <div 
                  key={goal.goal_id} 
                  className={`${styles.checklistItem} ${goal.achieved ? styles.checklistItemDone : styles.checklistItemPending}`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className={styles.checklistItemNumber}>{index + 1}</div>
                  <div className={styles.checklistItemIcon}>
                    {goal.achieved ? (
                      <span className={styles.checklistIconDone}>✓</span>
                    ) : (
                      <span className={styles.checklistIconPending}>△</span>
                    )}
                  </div>
                  <div className={styles.checklistItemContent}>
                    <span className={styles.checklistItemTitle}>
                      {goal.goal_label || goal.goal_id}
                    </span>
                    <span className={styles.checklistItemStatus}>
                      {goal.achieved ? 'Достигнута' : 'Не достигнута'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>

      {/* Summary */}
      {currentStats.total > 0 && (
        <div className={styles.checklistSummary}>
          {currentStats.pct === 100 ? (
            <div className={styles.checklistSummarySuccess}>
              <span>🎉</span>
              <span>Отлично! Все {activeTab === 'steps' ? 'шаги выполнены' : 'цели достигнуты'}!</span>
            </div>
          ) : currentStats.pct >= 50 ? (
            <div className={styles.checklistSummaryPartial}>
              <span>💪</span>
              <span>Хороший результат! Осталось {currentStats.total - currentStats.done} {activeTab === 'steps' ? 'шагов' : 'целей'}.</span>
            </div>
          ) : (
            <div className={styles.checklistSummaryLow}>
              <span>📝</span>
              <span>Есть над чем поработать. Попробуйте ещё раз!</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
