'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  formatPracticeRemaining,
  formatPracticeRemainingShort,
  practiceMinutesFromRub,
} from '@/lib/practice-time';
import styles from './practice-time-chip.module.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const LOW_MINUTES = 15;

type PracticeTimeChipProps = {
  onOpen: () => void;
  refreshKey?: string;
};

export function PracticeTimeChip({ onOpen, refreshKey }: PracticeTimeChipProps) {
  const [minutes, setMinutes] = useState<number | null>(null);
  const [shortLabel, setShortLabel] = useState<string | null>(null);
  const [fullLabel, setFullLabel] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/api/balance`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const body = await res.json();
        const rub = Number(body.balance_rub ?? 0);
        if (cancelled || !Number.isFinite(rub)) return;
        setMinutes(practiceMinutesFromRub(rub));
        setShortLabel(formatPracticeRemainingShort(rub));
        setFullLabel(formatPracticeRemaining(rub));
      } catch {
        if (!cancelled) setShortLabel(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (!shortLabel) {
    return <span className={styles.skeleton} aria-hidden="true" />;
  }

  const low = (minutes ?? 0) < LOW_MINUTES;

  return (
    <button
      type="button"
      className={low ? `${styles.chip} ${styles.chipLow}` : styles.chip}
      onClick={onOpen}
      title={`Осталось ${fullLabel}`}
    >
      <ClockIcon />
      <span>≈ {shortLabel}</span>
    </button>
  );
}

function ClockIcon() {
  return (
    <svg className={styles.icon} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8.2V12l2.6 1.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
