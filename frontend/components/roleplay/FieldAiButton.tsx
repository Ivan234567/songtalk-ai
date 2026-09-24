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
        width: 28,
        height: 28,
        borderRadius: 8,
        border: '1px solid var(--sidebar-border)',
        background: 'transparent',
        color: 'var(--sidebar-text)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled || busy ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 0.8,
        flexShrink: 0,
        padding: 0,
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
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
          <path d="M19 14l.7 1.8L21.5 16.5 19.7 17.2 19 19l-.7-1.8-1.8-.7 1.8-.7L19 14z" />
        </svg>
      )}
      <style>{`@keyframes field-ai-spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}

export function fieldFlashStyle(active: boolean): React.CSSProperties {
  if (!active) return {};
  return { boxShadow: '0 0 0 2px rgba(79, 168, 134, 0.75)' };
}
