'use client';

import React from 'react';
import Link from 'next/link';
import styles from './progress.module.css';

type FocusProgressHeaderProps = {
  title: string;
  subtitle: string | null;
  backHref: string;
};

export function FocusProgressHeader({ title, subtitle, backHref }: FocusProgressHeaderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
      <Link href={backHref} className={styles.btn}>
        ← Вернуться к прогрессу
      </Link>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{title}</h1>
        {subtitle && (
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem', opacity: 0.8 }}>{subtitle}</p>
        )}
      </div>
    </div>
  );
}
