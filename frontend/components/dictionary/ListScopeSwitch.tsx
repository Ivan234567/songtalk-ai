'use client';

import React, { useEffect, useState } from 'react';
import styles from './list-scope-switch.module.css';

export type ListScope = 'all' | 'mine' | 'packs';

const STORAGE_KEY = 'speakeasy-list-scope';

export function readListScope(): ListScope {
  if (typeof window === 'undefined') return 'all';
  const value = window.sessionStorage.getItem(STORAGE_KEY);
  return value === 'mine' || value === 'packs' ? value : 'all';
}

export function writeListScope(scope: ListScope) {
  window.sessionStorage.setItem(STORAGE_KEY, scope);
}

type ListScopeSwitchProps = {
  value: ListScope;
  mineCount: number;
  packCount: number;
  onChange: (scope: ListScope) => void;
};

const OPTIONS: Array<{ id: ListScope; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'mine', label: 'Мои' },
  { id: 'packs', label: 'Наборы' },
];

export function ListScopeSwitch({ value, mineCount, packCount, onChange }: ListScopeSwitchProps) {
  const counts: Record<ListScope, number> = {
    all: mineCount + packCount,
    mine: mineCount,
    packs: packCount,
  };
  return (
    <div className={styles.switch} role="group" aria-label="Какие списки показать">
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={styles.option}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
          <span className={styles.count}>{counts[option.id]}</span>
        </button>
      ))}
    </div>
  );
}

export function useListScope() {
  const [scope, setScope] = useState<ListScope>('all');
  useEffect(() => {
    setScope(readListScope());
  }, []);
  const change = (next: ListScope) => {
    setScope(next);
    writeListScope(next);
  };
  return [scope, change] as const;
}
