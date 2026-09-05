'use client';

import React from 'react';
import { LanguageToast } from '@/context/LearningLanguageContext';
import styles from './language-toast.module.css';

interface LanguageToastStackProps {
  toasts: LanguageToast[];
  onDismiss: (id: number) => void;
}

export const LanguageToastStack: React.FC<LanguageToastStackProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className={styles.toastStack} aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={[styles.toast, toast.kind === 'error' ? styles.toastError : ''].filter(Boolean).join(' ')}
        >
          <span>{toast.message}</span>
          <button
            type="button"
            className={styles.toastClose}
            aria-label="Закрыть"
            onClick={() => onDismiss(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};
