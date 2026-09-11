'use client';

import React from 'react';
import styles from './focus.module.css';

type CriteriaItem = {
  key: string;
  label: string;
  value: number;
};

type FocusCriteriaProps = {
  criteria: CriteriaItem[];
};

const CRITERIA_ICONS: Record<string, string> = {
  fluency: '🗣️',
  vocabulary_grammar: '📚',
  pronunciation: '🎯',
  completeness: '✅',
  dialogue_skills: '💬',
  task_completion: '✅',
  vocabulary: '📚',
  grammar: '🧩',
  interaction: '💬',
  connected_speech: '🔗',
};

const CRITERIA_DESCRIPTIONS: Record<string, string> = {
  fluency: 'Скорость и плавность речи',
  vocabulary_grammar: 'Словарный запас и грамматика',
  pronunciation: 'Произношение и интонация',
  completeness: 'Полнота выполнения задания',
  dialogue_skills: 'Навыки ведения диалога',
  task_completion: 'Достижение цели сценария и шагов',
  vocabulary: 'Нужные слова и уместность HSK',
  grammar: 'Порядок слов и частицы',
  interaction: 'Вопросы, реакции, не односложные ответы',
  connected_speech: 'Длина и связность реплик',
};

function getScoreLevel(score: number): { label: string; color: string; bg: string; border: string } {
  if (score >= 8) {
    return {
      label: 'Отлично',
      color: 'var(--accent)',
      bg: 'var(--accent-soft)',
      border: 'var(--accent)',
    };
  }
  if (score >= 6) {
    return {
      label: 'Хорошо',
      color: 'rgba(245, 158, 11, 0.95)',
      bg: 'rgba(245, 158, 11, 0.12)',
      border: 'rgba(245, 158, 11, 0.5)',
    };
  }
  if (score >= 4) {
    return {
      label: 'Средне',
      color: 'rgba(251, 191, 36, 0.95)',
      bg: 'rgba(251, 191, 36, 0.1)',
      border: 'rgba(251, 191, 36, 0.4)',
    };
  }
  return {
    label: 'Требует работы',
    color: 'rgba(239, 68, 68, 0.9)',
    bg: 'rgba(239, 68, 68, 0.1)',
    border: 'rgba(239, 68, 68, 0.4)',
  };
}

export function FocusCriteria({ criteria }: FocusCriteriaProps) {
  if (criteria.length === 0) {
    return (
      <section className={styles.card}>
        <h3 className={styles.sectionTitle}>Критерии оценки</h3>
        <p style={{ marginTop: '0.6rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          Нет оценок для этой попытки.
        </p>
      </section>
    );
  }

  // Find best and worst criteria
  const sortedCriteria = [...criteria].sort((a, b) => b.value - a.value);
  const bestKey = sortedCriteria[0]?.key;
  const worstKey = sortedCriteria[sortedCriteria.length - 1]?.key;

  return (
    <section className={styles.card}>
      <h3 className={styles.sectionTitle}>Критерии оценки</h3>
      <div className={styles.criteriaGrid}>
        {criteria.map((c) => {
          const pct = Math.max(0, Math.min(100, c.value * 10));
          const level = getScoreLevel(c.value);
          const icon = CRITERIA_ICONS[c.key] || '📊';
          const description = CRITERIA_DESCRIPTIONS[c.key] || '';
          const isBest = c.key === bestKey && c.value >= 6;
          const isWorst = c.key === worstKey && c.value < 7;

          return (
            <div 
              key={c.key} 
              className={`${styles.criteriaCard} ${isBest ? styles.criteriaCardBest : ''} ${isWorst ? styles.criteriaCardWorst : ''}`}
              data-level={level.label}
            >
              {/* Badge for best/worst */}
              {isBest && <span className={styles.criteriaBadgeBest}>Лучший</span>}
              {isWorst && <span className={styles.criteriaBadgeWorst}>Работать</span>}

              {/* Icon */}
              <span className={styles.criteriaIcon}>{icon}</span>

              {/* Ring with score */}
              <div
                className={styles.criteriaRing}
                style={{
                  background: `conic-gradient(${level.color} ${pct}%, var(--bg) ${pct}% 100%)`,
                }}
              >
                <div className={styles.criteriaRingInner}>
                  <span className={styles.criteriaRingValue}>{c.value.toFixed(1)}</span>
                </div>
              </div>

              {/* Label */}
              <span className={styles.criteriaLabel}>{c.label}</span>

              {/* Level badge */}
              <span 
                className={styles.criteriaLevelBadge}
                style={{ 
                  background: level.bg,
                  borderColor: level.border,
                  color: level.color,
                }}
              >
                {level.label}
              </span>

              {/* Progress bar */}
              <div className={styles.criteriaProgressBar}>
                <div 
                  className={styles.criteriaProgressFill}
                  style={{ 
                    width: `${pct}%`,
                    background: level.color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
