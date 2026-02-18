'use client';

import React from 'react';
import styles from './focus.module.css';

type FocusFeedbackPanelProps = {
  strengths: string[];
  improvements: string[];
  comment: string;
};

export function FocusFeedbackPanel({ strengths, improvements, comment }: FocusFeedbackPanelProps) {
  return (
    <section className={styles.card}>
      <h3 className={styles.sectionTitle}>Обратная связь от AI-тренера</h3>

      <div className={styles.feedbackGrid}>
        {/* Strengths */}
        {strengths.length > 0 && (
          <div className={styles.feedbackCard} data-type="strengths">
            <div className={styles.feedbackHeader}>
              <span className={styles.feedbackIcon}>✨</span>
              <span className={styles.feedbackTitle}>Сильные стороны</span>
            </div>
            <ul className={styles.feedbackList}>
              {strengths.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Improvements */}
        {improvements.length > 0 && (
          <div className={styles.feedbackCard} data-type="improvements">
            <div className={styles.feedbackHeader}>
              <span className={styles.feedbackIcon}>🎯</span>
              <span className={styles.feedbackTitle}>Над чем поработать</span>
            </div>
            <ul className={styles.feedbackList}>
              {improvements.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Comment */}
      <div className={styles.feedbackComment}>
        <div className={styles.feedbackCommentHeader}>
          <span className={styles.feedbackIcon}>💬</span>
          <span className={styles.feedbackTitle}>Комментарий тренера</span>
        </div>
        <blockquote className={styles.feedbackQuote}>
          {comment}
        </blockquote>
      </div>
    </section>
  );
}
