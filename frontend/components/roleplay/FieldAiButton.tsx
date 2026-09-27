'use client';

import React from 'react';

type Props = {
  label: string;
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export function FieldAiButton({ label, busy, disabled, onClick }: Props) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled || busy}
      onClick={onClick}
      style={{
        height: 34,
        padding: '0 10px',
        borderRadius: 10,
        border: '1px solid rgba(16, 140, 98, 0.55)',
        background: busy ? 'rgba(16, 140, 98, 0.28)' : 'rgba(16, 140, 98, 0.16)',
        color: 'rgb(8, 110, 74)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        cursor: disabled || busy ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        flexShrink: 0,
        fontSize: '0.75rem',
        fontWeight: 800,
        letterSpacing: '0.04em',
      }}
    >
      {busy ? (
        <span
          aria-hidden
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            border: '2px solid currentColor',
            borderRightColor: 'transparent',
            display: 'inline-block',
            animation: 'field-ai-spin 0.7s linear infinite',
          }}
        />
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 4l5 5" />
          <path d="M14 5l-9 9 2 2 9-9" />
          <path d="M4 20l3.5-1.2L5.2 16.5 4 20z" />
          <path d="M15 4l1.2-1.2M19 8l1.2 1.2M17.2 3.2l.6 1.4M20.2 6.2l-1.4.6" />
        </svg>
        <span>ИИ</span>
      )}
      <style>{`@keyframes field-ai-spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}

export function fieldFlashStyle(active: boolean): React.CSSProperties {
  if (!active) return {};
  return { boxShadow: '0 0 0 2px rgba(79, 168, 134, 0.75)' };
}
