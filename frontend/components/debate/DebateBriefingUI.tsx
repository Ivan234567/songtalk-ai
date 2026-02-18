'use client';

import React from 'react';
import type {
  DebateMicroGoal,
  DebatePosition,
  DebateProfanityIntensity,
  DebateSettings,
  DebateSlangMode,
  DebateWhoStarts,
} from '@/lib/debate';

type BriefingEditStep = 'topic' | 'position';

type DebateBriefingUIProps = {
  topic: string;
  topicRu?: string;
  userPosition: DebatePosition;
  aiPosition: DebatePosition;
  difficulty?: 'easy' | 'medium' | 'hard';
  microGoals?: DebateMicroGoal[];
  whoStarts?: DebateWhoStarts;
  debateSettings?: DebateSettings;
  onBack: () => void;
  onStart: () => void;
  /** Переход к конкретному шагу для редактирования */
  onEditStep?: (step: BriefingEditStep) => void;
};

const debateColors = {
  bar: 'rgba(99, 102, 241, 0.9)',
  glow: 'rgba(99, 102, 241, 0.3)',
};

const BRIEFING_ICONS = {
  goal: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  tips: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  play: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  edit: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
};

const goalColor = 'rgba(34, 197, 94, 1)';
const goalBg = 'rgba(34, 197, 94, 0.12)';
const tipsColor = 'rgba(245, 158, 11, 1)';
const tipsBg = 'rgba(245, 158, 11, 0.12)';

const SLANG_MODE_LABELS: Record<DebateSlangMode, string> = {
  off: 'Нейтрально',
  light: 'Сленг: легкий',
  heavy: 'Сленг: активный',
};

const PROFANITY_INTENSITY_LABELS: Record<DebateProfanityIntensity, string> = {
  light: '18+: мягко',
  medium: '18+: средне',
  hard: '18+: жёстко',
};

function getDebateStyleBadges(settings?: DebateSettings): Array<{ label: string; bg: string; color: string }> {
  const badges: Array<{ label: string; bg: string; color: string }> = [];
  const slangMode = settings?.slangMode ?? 'off';
  badges.push({
    label: SLANG_MODE_LABELS[slangMode],
    bg: slangMode === 'off' ? 'rgba(107, 114, 128, 0.14)' : 'rgba(99, 102, 241, 0.14)',
    color: slangMode === 'off' ? 'rgb(75, 85, 99)' : 'rgb(67, 56, 202)',
  });

  if (settings?.allowProfanity) {
    const intensity = settings.profanityIntensity ?? 'light';
    badges.push({
      label: PROFANITY_INTENSITY_LABELS[intensity],
      bg: 'rgba(239, 68, 68, 0.14)',
      color: 'rgb(185, 28, 28)',
    });
    badges.push({
      label: settings.aiMayUseProfanity ? 'ИИ может 18+' : 'ИИ без 18+',
      bg: settings.aiMayUseProfanity ? 'rgba(180, 83, 9, 0.14)' : 'rgba(2, 132, 199, 0.12)',
      color: settings.aiMayUseProfanity ? 'rgb(146, 64, 14)' : 'rgb(3, 105, 161)',
    });
  } else {
    badges.push({
      label: 'Без 18+',
      bg: 'rgba(16, 185, 129, 0.14)',
      color: 'rgb(5, 150, 105)',
    });
  }

  return badges;
}

// Цель дебата (статический текст)
const DEBATE_GOAL_RU = `Дебат успешно завершен, когда:
• Обе стороны представили свои основные аргументы (минимум 2-3 обмена репликами)
• Вы защитили свою позицию хотя бы одним четким аргументом
• Произошел естественный обмен мнениями`;

// Подсказки для максимального балла
const MAX_SCORE_TIPS_RU = `Для максимального балла:
• Используйте полные предложения
• Структурируйте аргументы: "First... Second... Finally..."
• Используйте связующие слова: "However", "Moreover", "On the other hand"
• Подкрепляйте аргументы примерами
• Отвечайте на аргументы оппонента напрямую`;

export function DebateBriefingUI({
  topic,
  topicRu,
  userPosition,
  aiPosition,
  difficulty,
  microGoals = [],
  whoStarts = 'ai',
  debateSettings,
  onBack,
  onStart,
  onEditStep,
}: DebateBriefingUIProps) {
  const userPositionText = userPosition === 'for' ? 'За' : 'Против';
  const aiPositionText = aiPosition === 'for' ? 'За' : 'Против';
  const difficultyText = difficulty === 'easy' ? 'Легкая' : difficulty === 'hard' ? 'Сложная' : 'Средняя';
  const styleBadges = getDebateStyleBadges(debateSettings);

  const cardBase = {
    padding: '0.25rem 0',
    textAlign: 'left' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  };

  return (
    <div
      className="debate-briefing"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 260px',
        gridTemplateRows: 'auto auto auto',
        gap: '1.25rem 2rem',
        padding: '1.75rem 2rem',
        alignContent: 'start',
        maxHeight: '80vh',
        boxSizing: 'border-box',
        overflowY: 'auto',
      }}
    >
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Назад к выбору темы"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.5rem 0.75rem',
            border: '1px solid var(--sidebar-border)',
            borderRadius: 8,
            background: 'transparent',
            color: 'var(--sidebar-text)',
            fontSize: '0.9375rem',
            fontWeight: 500,
            cursor: 'pointer',
            opacity: 0.9,
            transition: 'background 0.2s ease, border-color 0.2s ease',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Назад
        </button>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--sidebar-text)', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Перед началом дебата
        </span>
      </div>

      <div style={{ gridColumn: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {/* Тема — кликабельная для редактирования */}
        <div
          role={onEditStep ? 'button' : undefined}
          tabIndex={onEditStep ? 0 : undefined}
          onClick={onEditStep ? () => onEditStep('topic') : undefined}
          onKeyDown={onEditStep ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEditStep('topic'); } } : undefined}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            cursor: onEditStep ? 'pointer' : 'default',
            padding: '0.625rem 0.875rem',
            borderRadius: 12,
            border: '1px solid var(--sidebar-border)',
            background: 'var(--sidebar-hover)',
            transition: 'border-color 0.2s ease, background 0.2s ease',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--sidebar-text)', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>Тема</div>
            <h2 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 700, color: 'var(--sidebar-text)', lineHeight: 1.25, letterSpacing: '-0.02em' }}>
              {topicRu || topic}
            </h2>
            {topicRu && topic !== topicRu && (
              <div style={{ fontSize: '0.8125rem', opacity: 0.65, color: 'var(--sidebar-text)', marginTop: '0.2rem' }}>{topic}</div>
            )}
          </div>
          {onEditStep && (
            <span style={{ flexShrink: 0, opacity: 0.45, marginTop: '0.2rem', color: 'var(--sidebar-text)' }} aria-label="Изменить тему">
              {BRIEFING_ICONS.edit}
            </span>
          )}
        </div>

        {/* Настройки — кликабельные для редактирования */}
        <div
          role={onEditStep ? 'button' : undefined}
          tabIndex={onEditStep ? 0 : undefined}
          onClick={onEditStep ? () => onEditStep('position') : undefined}
          onKeyDown={onEditStep ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEditStep('position'); } } : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            cursor: onEditStep ? 'pointer' : 'default',
            padding: '0.625rem 0.875rem',
            borderRadius: 12,
            border: '1px solid var(--sidebar-border)',
            background: 'var(--sidebar-hover)',
            transition: 'border-color 0.2s ease, background 0.2s ease',
          }}
        >
          <div style={{ flex: 1, display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--sidebar-text)', opacity: 0.6 }}>Вы:</span>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: userPosition === 'for' ? 'rgb(22, 163, 74)' : 'rgb(220, 38, 38)' }}>{userPositionText}</span>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--sidebar-text)', opacity: 0.6 }}>ИИ:</span>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: aiPosition === 'for' ? 'rgb(22, 163, 74)' : 'rgb(220, 38, 38)' }}>{aiPositionText}</span>
            </div>
            {difficulty && (
              <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: 6, background: 'var(--sidebar-bg)', color: 'var(--sidebar-text)', opacity: 0.8 }}>
                {difficultyText}
              </span>
            )}
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--sidebar-text)', opacity: 0.6 }}>Начинает:</span>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--sidebar-text)' }}>{whoStarts === 'user' ? 'Вы' : 'ИИ'}</span>
            </div>
            {styleBadges.length > 0 && (
              <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--sidebar-text)', opacity: 0.6 }}>Стиль:</span>
                {styleBadges.map((badge) => (
                  <span
                    key={badge.label}
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '0.15rem 0.45rem',
                      borderRadius: 6,
                      background: badge.bg,
                      color: badge.color,
                    }}
                  >
                    {badge.label}
                  </span>
                ))}
              </div>
            )}
            {microGoals.length > 0 && (
              <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--sidebar-text)', opacity: 0.6 }}>Цели:</span>
                {microGoals.map((g) => (
                  <span key={g.id} style={{ fontSize: '0.75rem', fontWeight: 500, padding: '0.15rem 0.45rem', borderRadius: 6, background: 'rgba(99, 102, 241, 0.12)', color: 'rgba(99, 102, 241, 1)' }}>
                    {g.labelRu}
                  </span>
                ))}
              </div>
            )}
          </div>
          {onEditStep && (
            <span style={{ flexShrink: 0, opacity: 0.45, color: 'var(--sidebar-text)' }} aria-label="Изменить настройки">
              {BRIEFING_ICONS.edit}
            </span>
          )}
        </div>
      </div>

      <div style={{ gridColumn: 2, gridRow: '2 / 4', display: 'flex', flexDirection: 'column', gap: '1.25rem', alignSelf: 'start', paddingTop: '0.25rem' }}>
        <button
          type="button"
          onClick={onStart}
          className="debate-briefing-start"
          style={{
            width: '100%',
            padding: '1rem 1.375rem',
            borderRadius: 12,
            border: 'none',
            background: '#46af7d',
            color: '#fff',
            fontSize: '1.0625rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: '0 4px 14px rgba(70, 175, 125, 0.35)',
            transition: 'transform 0.15s ease, box-shadow 0.2s ease',
          }}
        >
          {BRIEFING_ICONS.play}
          {whoStarts === 'user' ? 'Начать — ваше слово' : 'Начать дебат'}
        </button>
      </div>

      <div style={{ gridColumn: 1, gridRow: 3, display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0 }}>
        {/* Цель дебата */}
        <div
          style={{
            ...cardBase,
            borderRadius: 12,
            border: 'none',
            background: 'transparent',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'flex', color: goalColor, opacity: 0.95 }}>{BRIEFING_ICONS.goal}</span>
            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--sidebar-text)', opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Цель дебата
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.9375rem', lineHeight: 1.75, color: 'var(--sidebar-text)', opacity: 0.95, whiteSpace: 'pre-line' }}>
            {DEBATE_GOAL_RU}
          </p>
        </div>

        {/* Подсказки для максимального балла */}
        <div
          style={{
            ...cardBase,
            borderRadius: 12,
            border: 'none',
            background: 'transparent',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'flex', color: tipsColor, opacity: 0.95 }}>{BRIEFING_ICONS.tips}</span>
            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--sidebar-text)', opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Подсказки для максимального балла
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.9375rem', lineHeight: 1.75, color: 'var(--sidebar-text)', opacity: 0.95, whiteSpace: 'pre-line' }}>
            {MAX_SCORE_TIPS_RU}
          </p>
        </div>
        {microGoals.length > 0 && (
          <div
            style={{
              ...cardBase,
              borderRadius: 12,
              border: 'none',
              background: 'transparent',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: 'rgba(99, 102, 241, 0.9)' }} />
              <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--sidebar-text)', opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Микро-цели сессии
              </span>
              {onEditStep && (
                <button
                  type="button"
                  onClick={() => onEditStep('position')}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', opacity: 0.45, color: 'var(--sidebar-text)', padding: 2, display: 'inline-flex', borderRadius: 4 }}
                  aria-label="Изменить микро-цели"
                >
                  {BRIEFING_ICONS.edit}
                </button>
              )}
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--sidebar-text)', opacity: 0.95, fontSize: '0.9375rem', lineHeight: 1.75, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {microGoals.map((goal) => (
                <li key={goal.id}>
                  <span style={{ fontWeight: 600 }}>{goal.labelRu}:</span> {goal.hintRu}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
