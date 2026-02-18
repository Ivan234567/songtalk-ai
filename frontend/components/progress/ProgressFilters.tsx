'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PERIOD_FILTER_OPTIONS, getPeriodStart } from './hooks';
import type { PeriodFilterValue, ProgressModeValue, ProgressViewValue } from './hooks';
import styles from './progress.module.css';

/* ─── helpers ────────────────────────────────────────────────── */

function formatDateRange(period: PeriodFilterValue): string {
  if (period === 'all') return 'Все данные';
  const start = getPeriodStart(period);
  if (!start) return '';
  const now = new Date();
  const fmt = (d: Date) =>
    d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  return `${fmt(start)} — ${fmt(now)}`;
}

const PERIOD_SHORTCUTS: Record<string, PeriodFilterValue> = {
  '1': '7d',
  '2': '30d',
  '3': '90d',
  '4': 'all',
};

/* ─── SegmentedControl with animated pill ────────────────────── */

type SegmentOption<T extends string> = {
  value: T;
  label: string;
  badge?: number;
  tooltip?: string;
  shortcutHint?: string;
};

type SegmentedControlProps<T extends string> = {
  ariaLabel: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
};

function SegmentedControl<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pillPos, setPillPos] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [animated, setAnimated] = useState(false);

  const measure = useCallback(() => {
    const container = containerRef.current;
    const btn = btnRefs.current[value];
    if (!container || !btn) return;
    setPillPos({
      left: btn.offsetLeft,
      top: btn.offsetTop,
      width: btn.offsetWidth,
      height: btn.offsetHeight,
    });
  }, [value]);

  // Measure pill position synchronously before paint
  useLayoutEffect(() => {
    measure();
  }, [measure]);

  // Enable animations after first position is committed
  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 60);
    return () => clearTimeout(timer);
  }, []);

  // Re-measure on resize
  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      className={styles.segment}
    >
      {pillPos && (
        <div
          className={`${styles.segmentPill} ${animated ? styles.segmentPillAnimated : ''}`}
          style={{
            left: pillPos.left,
            top: pillPos.top,
            width: pillPos.width,
            height: pillPos.height,
            opacity: 1,
          }}
        />
      )}
      {options.map((opt) => (
        <button
          key={opt.value}
          ref={(el) => {
            btnRefs.current[opt.value] = el;
          }}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`${styles.segmentTab} ${value === opt.value ? styles.segmentTabActive : ''}`}
          data-tooltip={opt.tooltip || undefined}
        >
          {opt.label}
          {opt.shortcutHint && (
            <span className={styles.segmentKey} aria-hidden="true">
              {opt.shortcutHint}
            </span>
          )}
          {typeof opt.badge === 'number' && (
            <span className={styles.segmentBadge}>{opt.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ─── ProgressFilters ────────────────────────────────────────── */

type ProgressFiltersProps = {
  periodFilter: PeriodFilterValue;
  onPeriodChange: (p: PeriodFilterValue) => void;
  mode: ProgressModeValue;
  onModeChange: (m: ProgressModeValue) => void;
  progressView: ProgressViewValue;
  onProgressViewChange: (v: ProgressViewValue) => void;
  roleplayCount?: number;
  debateCount?: number;
  systemCount?: number;
  personalCount?: number;
};

export function ProgressFilters({
  periodFilter,
  onPeriodChange,
  mode,
  onModeChange,
  progressView,
  onProgressViewChange,
  roleplayCount,
  debateCount,
  systemCount,
  personalCount,
}: ProgressFiltersProps) {
  /* Keyboard shortcuts for all filter groups */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      const period = PERIOD_SHORTCUTS[key];
      if (period) {
        e.preventDefault();
        onPeriodChange(period);
        return;
      }
      if (key === 'r') {
        e.preventDefault();
        onModeChange('roleplay');
        return;
      }
      if (key === 'd') {
        e.preventDefault();
        onModeChange('debate');
        return;
      }
      if (key === 's') {
        e.preventDefault();
        onProgressViewChange('system');
        return;
      }
      if (key === 'l') {
        e.preventDefault();
        onProgressViewChange('personal');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onPeriodChange, onModeChange, onProgressViewChange]);

  const periodOptions: SegmentOption<PeriodFilterValue>[] = PERIOD_FILTER_OPTIONS.map(
    (opt, i) => ({
      value: opt.value,
      label: opt.label,
      tooltip: `${formatDateRange(opt.value)}  ·  клавиша ${i + 1}`,
      shortcutHint: `${i + 1}`,
    })
  );

  const modeOptions: SegmentOption<ProgressModeValue>[] = [
    { value: 'roleplay', label: 'Ролевые сценарии', badge: roleplayCount, shortcutHint: 'R' },
    { value: 'debate', label: 'Дебаты', badge: debateCount, shortcutHint: 'D' },
  ];

  const viewOptions: SegmentOption<ProgressViewValue>[] = [
    { value: 'system', label: 'Системные', badge: systemCount, shortcutHint: 'S' },
    { value: 'personal', label: 'Личные', badge: personalCount, shortcutHint: 'L' },
  ];

  return (
    <div className={styles.filters}>
      <div className={styles.filtersRow}>
        <SegmentedControl
          ariaLabel="Фильтр периода"
          options={periodOptions}
          value={periodFilter}
          onChange={onPeriodChange}
        />
        <SegmentedControl
          ariaLabel="Фильтр режима"
          options={modeOptions}
          value={mode}
          onChange={onModeChange}
        />
        <SegmentedControl
          ariaLabel="Фильтр контента"
          options={viewOptions}
          value={progressView}
          onChange={onProgressViewChange}
        />
      </div>
    </div>
  );
}
