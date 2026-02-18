'use client';

import React, { useEffect, useRef, useState } from 'react';

const baseInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem 1rem',
  borderRadius: 12,
  border: '1px solid var(--sidebar-border)',
  background: 'var(--sidebar-hover)',
  color: 'var(--sidebar-text)',
  fontSize: '1.0625rem',
  outline: 'none',
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
};

/** Кастомный выпадающий список уровня (фон и текст как в сайдбаре, без белого нативного select) */
export function LevelDropdown<T extends string>({
  value,
  onChange,
  options,
  style,
  ariaLabel,
  openUpward = true,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  style?: React.CSSProperties;
  ariaLabel?: string;
  /** true = список вверх, false = вниз */
  openUpward?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentLabel = options.find((o) => o.value === value)?.label ?? value;

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const listStyle: React.CSSProperties = openUpward
    ? { position: 'absolute' as const, left: 0, right: 0, bottom: '100%', marginBottom: 4, boxShadow: '0 -8px 24px rgba(0,0,0,0.15)' }
    : { position: 'absolute' as const, left: 0, right: 0, top: '100%', marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' };

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        style={{
          ...baseInputStyle,
          width: '100%',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          ...style,
        }}
      >
        <span>{currentLabel}</span>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ flexShrink: 0, opacity: 0.7 }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          style={{
            ...listStyle,
            padding: 4,
            borderRadius: 12,
            border: '1px solid var(--sidebar-border)',
            background: 'var(--sidebar-bg)',
            color: 'var(--sidebar-text)',
            listStyle: 'none',
            maxHeight: 280,
            overflowY: 'auto',
            zIndex: 1001,
          }}
        >
          {options.map((opt) => (
            <li key={opt.value || 'all'} role="option" aria-selected={opt.value === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                style={{
                  width: '100%',
                  padding: '0.6rem 1rem',
                  border: 'none',
                  borderRadius: 8,
                  background: opt.value === value ? 'var(--sidebar-active)' : 'transparent',
                  color: 'var(--sidebar-text)',
                  fontSize: '1rem',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (opt.value !== value) e.currentTarget.style.background = 'var(--sidebar-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = opt.value === value ? 'var(--sidebar-active)' : 'transparent';
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
