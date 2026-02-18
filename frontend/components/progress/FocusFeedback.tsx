'use client';

import React from 'react';
import styles from './progress.module.css';

type FocusFeedbackProps = {
  strengths: string[];
  improvements: string[];
  comment: string;
};

export function FocusFeedback({ strengths, improvements, comment }: FocusFeedbackProps) {
  return (
    <div className={styles.card}>
      <h3 className={styles.sectionTitle}>Обратная связь</h3>
      <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
        {strengths.length > 0 && (
          <div style={{ borderRadius: 12, border: '1px solid rgba(34,197,94,0.42)', background: 'rgba(34,197,94,0.09)', padding: '0.64rem 0.7rem' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'rgba(187,247,208,0.95)' }}>Сильные стороны</div>
            <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0, fontSize: '0.9rem', lineHeight: 1.45 }}>
              {strengths.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        )}
        {improvements.length > 0 && (
          <div style={{ borderRadius: 12, border: '1px solid rgba(245,158,11,0.45)', background: 'rgba(245,158,11,0.09)', padding: '0.64rem 0.7rem' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'rgba(254,243,199,0.95)' }}>Над чем поработать</div>
            <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0, fontSize: '0.9rem', lineHeight: 1.45 }}>
              {improvements.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        )}
        <div style={{ borderRadius: 12, border: '1px solid var(--stroke)', background: 'var(--card)', padding: '0.64rem 0.7rem' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, opacity: 0.86 }}>Комментарий</div>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.95rem', lineHeight: 1.55, opacity: 0.92 }}>{comment}</p>
        </div>
      </div>
    </div>
  );
}
