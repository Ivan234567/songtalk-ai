'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { RoleplayScenario } from '@/lib/roleplay';
import {
  createUserScenario,
  deleteUserScenario,
  generateUserScenario,
  listUserScenarios,
  updateUserScenario,
  type GenerateScenarioResult,
  type UserScenario,
  type UserScenarioLevel,
} from '@/lib/user-scenarios';
import { LevelDropdown } from '@/components/ui/LevelDropdown';
import { BriefingView } from './RoleplayModeUI';

type SlangMode = 'off' | 'light' | 'heavy';
type ProfanityIntensity = 'light' | 'medium' | 'hard';

const LEVELS: { value: UserScenarioLevel; label: string }[] = [
  { value: 'A1', label: 'A1' },
  { value: 'A2', label: 'A2' },
  { value: 'B1', label: 'B1' },
  { value: 'B2', label: 'B2' },
  { value: 'C1', label: 'C1' },
  { value: 'easy', label: 'Лёгкий' },
  { value: 'medium', label: 'Средний' },
  { value: 'hard', label: 'Сложный' },
];

const SLANG_OPTIONS: Array<{ value: SlangMode; label: string }> = [
  { value: 'off', label: 'Без сленга' },
  { value: 'light', label: 'Лёгкий сленг' },
  { value: 'heavy', label: 'Живой сленг' },
];

const PROFANITY_OPTIONS: Array<{ value: ProfanityIntensity; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

function getScenarioStyleBadges(
  scenario: Pick<UserScenario, 'slangMode' | 'allowProfanity' | 'aiMayUseProfanity' | 'profanityIntensity'>
): Array<{ label: string; bg: string; color: string }> {
  const badges: Array<{ label: string; bg: string; color: string }> = [];
  const slang = scenario.slangMode ?? 'light';
  if (slang === 'off') {
    badges.push({ label: 'Без сленга', bg: 'rgba(148, 163, 184, 0.14)', color: 'rgb(100, 116, 139)' });
  } else if (slang === 'heavy') {
    badges.push({ label: 'Сленг: активный', bg: 'rgba(103, 199, 163, 0.16)', color: 'rgb(79, 168, 134)' });
  } else {
    badges.push({ label: 'Сленг: лёгкий', bg: 'rgba(103, 199, 163, 0.12)', color: 'rgb(103, 199, 163)' });
  }
  if (scenario.allowProfanity) {
    const intensity = scenario.profanityIntensity ?? 'light';
    badges.push({
      label: `18+ мат: ${intensity}`,
      bg: intensity === 'hard' ? 'rgba(239, 68, 68, 0.16)' : 'rgba(249, 115, 22, 0.14)',
      color: intensity === 'hard' ? 'rgb(185, 28, 28)' : 'rgb(194, 65, 12)',
    });
    badges.push({
      label: scenario.aiMayUseProfanity ? 'ИИ: мат включён' : 'ИИ: без мата',
      bg: scenario.aiMayUseProfanity ? 'rgba(168, 85, 247, 0.14)' : 'rgba(16, 185, 129, 0.14)',
      color: scenario.aiMayUseProfanity ? 'rgb(126, 34, 206)' : 'rgb(5, 150, 105)',
    });
  }
  return badges;
}

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2rem',
  background: 'rgba(0,0,0,0.5)',
  backdropFilter: 'blur(4px)',
};

const modalPanelStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 560,
  maxHeight: '90vh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 20,
  background: 'var(--sidebar-bg)',
  border: '1px solid var(--sidebar-border)',
  boxShadow: '0 24px 48px rgba(0,0,0,0.2)',
};

const inputStyle: React.CSSProperties = {
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

const btnPrimary: React.CSSProperties = {
  padding: '0.75rem 1.5rem',
  borderRadius: 12,
  border: 'none',
  background: 'rgba(99, 102, 241, 0.9)',
  color: '#fff',
  fontSize: '1.0625rem',
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
  transition: 'opacity 0.2s ease, transform 0.1s ease',
};

const btnSecondary: React.CSSProperties = {
  padding: '0.7rem 1.25rem',
  borderRadius: 12,
  border: '1px solid var(--sidebar-border)',
  background: 'transparent',
  color: 'var(--sidebar-text)',
  fontSize: '1rem',
  cursor: 'pointer',
  transition: 'background 0.2s ease, border-color 0.2s ease',
};

const createSectionTitle: React.CSSProperties = {
  marginBottom: '0.5rem',
  fontSize: '0.875rem',
  fontWeight: 700,
  color: 'var(--sidebar-text)',
  opacity: 0.7,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const createLabelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 8,
  fontSize: '0.9375rem',
  fontWeight: 500,
  color: 'var(--sidebar-text)',
  opacity: 0.9,
};

/** Иконки для мини-превью брифинга (как в BriefingView, компактно) */
const PREVIEW_ICONS = {
  setting: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  scenario: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  ),
  yourRole: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  goal: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  firstLine: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  tips: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  ),
};

const barColor = 'rgba(99, 102, 241, 1)';
const barBg = 'rgba(99, 102, 241, 0.12)';
const goalColor = 'rgba(34, 197, 94, 1)';
const goalBg = 'rgba(34, 197, 94, 0.12)';
const tipsColor = 'rgba(245, 158, 11, 1)';
const tipsBg = 'rgba(245, 158, 11, 0.12)';

/** Мини-превью брифинга по payload (место, роль, цель, начальная фраза, советы по баллам) для проверки перед сохранением. compact — меньше отступы и шрифты, чтобы влезало в окно без скролла. */
function BriefingPreview({ payload, title, compact }: { payload: Record<string, unknown>; title?: string; compact?: boolean }) {
  const setting = (payload.settingRu ?? payload.setting) as string | undefined;
  const scenarioText = (payload.scenarioTextRu ?? payload.scenarioText) as string | undefined;
  const yourRole = (payload.yourRoleRu ?? payload.yourRole) as string | undefined;
  const goalText = (payload.goalRu ?? payload.goal) as string | undefined;
  const suggestedFirstLine = payload.suggestedFirstLine as string | undefined;
  const maxScoreTipsRu = payload.maxScoreTipsRu as string | undefined;

  const blockPad = compact ? '0.65rem 0.9rem' : '0.9rem 1.15rem';
  const blockGap = compact ? 8 : 10;
  const labelFont = compact ? '0.75rem' : '0.8125rem';
  const bodyFont = compact ? '0.875rem' : '1rem';
  const bodyLine = compact ? 1.45 : 1.55;
  const blockRadius = compact ? 12 : 16;
  const iconSize = compact ? 32 : 42;

  const block = (icon: React.ReactNode, label: string, text: string, accentColor: string, accentBg: string) => (
    <div
      key={label}
      style={{
        padding: blockPad,
        borderRadius: blockRadius,
        border: '1px solid var(--sidebar-border)',
        background: 'var(--sidebar-hover)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: blockGap,
        position: 'relative' as const,
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${accentColor}, transparent)`, opacity: 0.6, borderRadius: `${blockRadius}px 0 0 ${blockRadius}px` }} aria-hidden />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 2 }}>
        <span
          style={{
            width: iconSize,
            height: iconSize,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: accentBg,
            color: accentColor,
            flexShrink: 0,
            transform: compact ? undefined : 'scale(1.2)',
          }}
        >
          {icon}
        </span>
        <span style={{ fontSize: labelFont, fontWeight: 700, color: 'var(--sidebar-text)', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
      </div>
      <p style={{ margin: 0, paddingLeft: 3 + iconSize + 10, fontSize: bodyFont, lineHeight: bodyLine, color: 'var(--sidebar-text)', opacity: 0.95, ...(compact ? { display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' } : {}) }}>
        {text}
      </p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '0.4rem' : '0.65rem' }}>
      {title && (
        <div style={{ marginBottom: compact ? 2 : 4 }}>
          <h3 style={{ margin: 0, fontSize: compact ? '0.9375rem' : '1.0625rem', fontWeight: 700, color: 'var(--sidebar-text)', letterSpacing: '-0.02em' }}>
            {title}
          </h3>
          <div style={{ marginTop: 6, height: 2, width: 32, borderRadius: 1, background: `linear-gradient(90deg, ${barColor}, transparent)` }} aria-hidden />
        </div>
      )}
      {!compact && (
        <p style={{ margin: '0 0 0.25rem', fontSize: '0.8125rem', color: 'var(--sidebar-text)', opacity: 0.65 }}>
          Так сценарий будет выглядеть в брифинге перед стартом. Проверьте перед сохранением.
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: compact ? '0.6rem' : '0.85rem' }}>
        {setting && block(PREVIEW_ICONS.setting, 'Место', setting, barColor, barBg)}
        {scenarioText && block(PREVIEW_ICONS.scenario, 'Ситуация', scenarioText, barColor, barBg)}
        {yourRole && block(PREVIEW_ICONS.yourRole, 'Ваша роль', yourRole, barColor, barBg)}
        {goalText && block(PREVIEW_ICONS.goal, 'Цель', goalText, goalColor, goalBg)}
        {suggestedFirstLine && (
          <div
            key="firstLine"
            style={{
              padding: blockPad,
              borderRadius: blockRadius,
              border: '1px solid rgba(99, 102, 241, 0.25)',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, var(--sidebar-active) 100%)',
              boxShadow: '0 1px 3px rgba(99, 102, 241, 0.08)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: compact ? 8 : 12,
              position: 'relative' as const,
            }}
          >
            <span
              style={{
                width: iconSize,
                height: iconSize,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: barBg,
                color: barColor,
                flexShrink: 0,
                transform: compact ? undefined : 'scale(1.2)',
              }}
            >
              {PREVIEW_ICONS.firstLine}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: labelFont, fontWeight: 700, color: 'var(--sidebar-text)', opacity: 0.75, marginBottom: compact ? 4 : 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Начните с фразы
              </span>
              <p style={{ margin: 0, fontSize: compact ? '0.875rem' : '1rem', fontWeight: 500, lineHeight: 1.45, color: 'var(--sidebar-text)', fontStyle: 'italic', ...(compact ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' } : {}) }}>
                «{suggestedFirstLine}»
              </p>
            </div>
          </div>
        )}
        {maxScoreTipsRu && block(PREVIEW_ICONS.tips, 'Советы по баллам', maxScoreTipsRu, tipsColor, tipsBg)}
      </div>
    </div>
  );
}

export type PersonalScenariosUIProps = {
  /** При выборе сценария для игры (Play) */
  onSelectScenario: (scenario: RoleplayScenario) => void;
  onClose: () => void;
  /** С какой вкладки открыли: создание или список */
  initialView: 'create' | 'my';
  /** Id сценария, который нужно подсветить и проскроллить к (например после «Сохранить в мои» из каталога) */
  highlightedScenarioId?: string | null;
};

/** Превращает UserScenario в RoleplayScenario для передачи в AgentTab */
function toRoleplayScenario(s: UserScenario): RoleplayScenario {
  return {
    id: s.id,
    title: s.title,
    systemPrompt: s.systemPrompt ?? '',
    goal: s.goal,
    goalRu: s.goalRu,
    steps: s.steps,
    setting: s.setting,
    scenarioText: s.scenarioText,
    yourRole: s.yourRole,
    settingRu: s.settingRu,
    scenarioTextRu: s.scenarioTextRu,
    yourRoleRu: s.yourRoleRu,
    openingInstruction: s.openingInstruction,
    characterOpening: s.characterOpening,
    suggestedFirstLine: s.suggestedFirstLine,
    maxScoreTipsRu: s.maxScoreTipsRu,
    difficulty: s.difficulty,
    optionalTwist: s.optionalTwist,
    description: s.description,
    slangMode: s.slangMode,
    allowProfanity: s.allowProfanity,
    aiMayUseProfanity: s.aiMayUseProfanity,
    profanityIntensity: s.profanityIntensity,
    category: s.category ?? 'everyday',
    language: s.language ?? 'en',
    level: s.level,
  };
}

/** Карточка сценария: название, уровень, цель/шаги, приоритет «Пройти», меню действий */
const ScenarioCard = React.forwardRef(function ScenarioCard({
  scenario: s,
  showArchived,
  editId,
  archivingId,
  deletingId,
  duplicatingId,
  cardMenuOpenId,
  setCardMenuOpenId,
  truncate: truncateFn,
  onPlay,
  onEdit,
  onArchive,
  onDelete,
  onDuplicate,
  isHighlighted,
}: {
  scenario: UserScenario;
  showArchived: boolean;
  editId: string | null;
  archivingId: string | null;
  deletingId: string | null;
  duplicatingId: string | null;
  cardMenuOpenId: string | null;
  setCardMenuOpenId: (id: string | null) => void;
  truncate: (str: string | undefined, max: number) => string;
  onPlay: (s: UserScenario) => void;
  onEdit: (s: UserScenario) => void;
  onArchive: (id: string, archive: boolean) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (s: UserScenario) => void;
  isHighlighted?: boolean;
}, ref: React.Ref<HTMLLIElement>) {
  const goalShort = truncateFn(s.goalRu ?? (s.goal as string), 55);
  const stepsCount = Array.isArray(s.steps) ? s.steps.length : 0;
  const subtitle = goalShort || (stepsCount > 0 ? `${stepsCount} ${stepsCount === 1 ? 'шаг' : stepsCount < 5 ? 'шага' : 'шагов'}` : '');
  const styleBadges = getScenarioStyleBadges(s);
  const isMenuOpen = cardMenuOpenId === s.id;
  const menuWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) setCardMenuOpenId(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [isMenuOpen, setCardMenuOpenId]);

  const count = s.completions_count ?? 0;
  const lastAt = s.last_completed_at ? (() => {
    try {
      const d = new Date(s.last_completed_at);
      return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return null;
    }
  })() : null;

  return (
    <li
      ref={ref}
      style={{
        padding: '0.75rem 1rem',
        borderRadius: 12,
        border: isHighlighted ? '2px solid rgba(34, 197, 94, 0.6)' : '1px solid var(--sidebar-border)',
        background: isHighlighted ? 'rgba(34, 197, 94, 0.08)' : 'var(--sidebar-hover)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--sidebar-text)' }}>{s.title}</span>
          <span
            style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              padding: '0.2rem 0.5rem',
              borderRadius: 6,
              background: 'var(--sidebar-active)',
              color: 'var(--sidebar-text)',
              opacity: 0.9,
            }}
          >
            {s.level}
          </span>
          {styleBadges.map((badge) => (
            <span
              key={badge.label}
              style={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                padding: '0.2rem 0.5rem',
                borderRadius: 6,
                background: badge.bg,
                color: badge.color,
                border: '1px solid transparent',
              }}
            >
              {badge.label}
            </span>
          ))}
        </div>
        {subtitle && (
          <div style={{ fontSize: '0.8125rem', opacity: 0.75, marginTop: 4, color: 'var(--sidebar-text)' }}>
            {subtitle}
          </div>
        )}
        {(count > 0 || lastAt) && (
          <div style={{ fontSize: '0.75rem', opacity: 0.65, marginTop: 6, color: 'var(--sidebar-text)' }}>
            {count > 0 && <span>Завершён {count} {count === 1 ? 'раз' : count < 5 ? 'раза' : 'раз'}</span>}
            {count > 0 && lastAt && ' · '}
            {lastAt && <span>Последний раз: {lastAt}</span>}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        {!showArchived && (
          <button
            type="button"
            onClick={() => onPlay(s)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 10,
              border: 'none',
              background: 'rgba(79, 168, 134, 0.85)',
              color: '#fff',
              fontSize: '0.9375rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(79, 168, 134, 0.35)',
            }}
          >
            Пройти
          </button>
        )}
        <div ref={menuWrapRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setCardMenuOpenId(isMenuOpen ? null : s.id)}
            aria-label="Действия"
            style={{
              ...btnSecondary,
              padding: '0.4rem 0.5rem',
              minWidth: 32,
            }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="6" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="18" r="1.5" />
            </svg>
          </button>
          {isMenuOpen && (
            <div
                role="menu"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: 6,
                  zIndex: 2,
                  minWidth: 200,
                  padding: 6,
                  borderRadius: 12,
                  border: '1px solid var(--sidebar-border)',
                  background: 'var(--sidebar-bg)',
                  color: 'var(--sidebar-text)',
                  boxShadow: '0 10px 32px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04)',
                }}
              >
                {([
                  [
                    'Редактировать',
                    () => { onEdit(s); setCardMenuOpenId(null); },
                    !!editId,
                    <svg key="edit" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.85 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>,
                  ],
                  onDuplicate
                    ? [
                        duplicatingId === s.id ? '…' : 'Создать копию',
                        () => { onDuplicate(s); },
                        duplicatingId === s.id,
                        <svg key="copy" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.85 }}><rect width={14} height={14} x={8} y={8} rx={2} ry={2} /><path d="M4 16V4a2 2 0 0 1 2-2h10" /></svg>,
                      ]
                    : null,
                  [
                    archivingId === s.id ? '…' : showArchived ? 'Восстановить' : 'В архив',
                    () => { onArchive(s.id, !showArchived); setCardMenuOpenId(null); },
                    archivingId === s.id,
                    <svg key="archive" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.85 }}><rect width={20} height={5} x={2} y={3} rx={1} /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></svg>,
                  ],
                ].filter(Boolean) as [string, () => void, boolean, React.ReactNode][]).map(([label, onAction, disabled, icon], idx) => (
                  <button
                    key={`card-menu-${idx}`}
                    type="button"
                    role="menuitem"
                    onClick={onAction}
                    disabled={disabled}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '0.5rem 0.75rem',
                      border: 'none',
                      borderRadius: 8,
                      background: 'transparent',
                      color: 'var(--sidebar-text)',
                      fontSize: '0.9375rem',
                      cursor: disabled ? 'default' : 'pointer',
                      opacity: disabled ? 0.6 : 1,
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--sidebar-hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {icon}
                    <span>{label}</span>
                  </button>
                ))}
                <div style={{ height: 1, background: 'var(--sidebar-border)', margin: '4px 0', opacity: 0.8 }} aria-hidden />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { onDelete(s.id); setCardMenuOpenId(null); }}
                  disabled={deletingId === s.id}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '0.5rem 0.75rem',
                    border: 'none',
                    borderRadius: 8,
                    background: 'transparent',
                    color: 'var(--sidebar-text)',
                    fontSize: '0.9375rem',
                    cursor: deletingId === s.id ? 'default' : 'pointer',
                    opacity: deletingId === s.id ? 0.6 : 1,
                    transition: 'background 0.15s ease, color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (deletingId !== s.id) {
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
                      e.currentTarget.style.color = 'rgb(220, 38, 38)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--sidebar-text)';
                  }}
                >
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.9 }}>
                    <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1={10} y1={11} x2={10} y2={17} /><line x1={14} y1={11} x2={14} y2={17} />
                  </svg>
                  <span>{deletingId === s.id ? '…' : 'Удалить'}</span>
                </button>
              </div>
          )}
        </div>
      </div>
    </li>
  );
});

export function PersonalScenariosUI({
  onSelectScenario,
  onClose,
  initialView,
  highlightedScenarioId,
}: PersonalScenariosUIProps) {
  const [view, setView] = useState<'create' | 'my' | 'edit'>(initialView);

  // Create flow
  const [prompt, setPrompt] = useState('');
  const [topic, setTopic] = useState('');
  const [place, setPlace] = useState('');
  const [userRole, setUserRole] = useState('');
  const [goalStructured, setGoalStructured] = useState('');
  const [createSlangMode, setCreateSlangMode] = useState<SlangMode>('light');
  const [createAllowProfanity, setCreateAllowProfanity] = useState(false);
  const [createAiMayUseProfanity, setCreateAiMayUseProfanity] = useState(false);
  const [createProfanityIntensity, setCreateProfanityIntensity] = useState<ProfanityIntensity>('light');
  const [level, setLevel] = useState<UserScenarioLevel>('medium');
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GenerateScenarioResult | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Шаг мастера (1 = опишите ситуацию, 2 = цель и шаги, 3 = название и сохранение). */
  const [createStep, setCreateStep] = useState<1 | 2 | 3>(1);

  // My scenarios list
  const [scenarios, setScenarios] = useState<UserScenario[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  /** Сценарий, выбранный для игры: показываем брифинг перед стартом */
  const [briefingScenario, setBriefingScenario] = useState<UserScenario | null>(null);
  /** Поиск по названию и фильтр по уровню в «Мои сценарии» */
  const [mySearchQuery, setMySearchQuery] = useState('');
  const [myLevelFilter, setMyLevelFilter] = useState<string>('all');
  /** Сортировка: last_used = по последнему использованию, updated = по дате обновления */
  const [mySortBy, setMySortBy] = useState<'last_used' | 'updated'>('last_used');
  /** Открыто ли меню действий для карточки (id сценария или null) */
  const [cardMenuOpenId, setCardMenuOpenId] = useState<string | null>(null);
  /** Id сценария, для которого выполняется «Создать копию» (из меню карточки) */
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  // Edit flow
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ title: string; level: UserScenarioLevel; payload: Record<string, unknown> } | null>(null);
  const [editSaveLoading, setEditSaveLoading] = useState(false);
  const [editDuplicateLoading, setEditDuplicateLoading] = useState(false);
  /** Вкладка в модалке редактирования: main = основное, practice = для практики */
  const [editTab, setEditTab] = useState<'main' | 'practice'>('main');

  const highlightedCardRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!highlightedScenarioId || view !== 'my') return;
    const t = window.setTimeout(() => {
      highlightedCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 300);
    return () => window.clearTimeout(t);
  }, [highlightedScenarioId, view]);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const list = await listUserScenarios({ archived: showArchived });
      setScenarios(list);
    } catch {
      setScenarios([]);
    } finally {
      setListLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    if (view === 'my') loadList();
  }, [view, loadList]);

  const query = mySearchQuery.trim().toLowerCase();
  const filteredAndSortedScenarios = React.useMemo(() => {
    let list = [...scenarios];
    if (query) {
      list = list.filter((s) => s.title.toLowerCase().includes(query));
    }
    if (myLevelFilter !== 'all') {
      list = list.filter((s) => s.level === myLevelFilter);
    }
    if (mySortBy === 'last_used') {
      list.sort((a, b) => {
        const aAt = a.last_completed_at || a.updated_at || a.created_at || '';
        const bAt = b.last_completed_at || b.updated_at || b.created_at || '';
        return bAt.localeCompare(aAt);
      });
    } else {
      list.sort((a, b) => {
        const aAt = a.updated_at || a.created_at || '';
        const bAt = b.updated_at || b.created_at || '';
        return bAt.localeCompare(aAt);
      });
    }
    return list;
  }, [scenarios, query, myLevelFilter, mySortBy]);

  /** «Недавно играли» — только из Supabase (roleplay_completions), не из localStorage */
  const recentlyPlayedScenarios = React.useMemo(() => {
    return filteredAndSortedScenarios
      .filter((s) => s.last_completed_at && !showArchived)
      .slice(0, 5);
  }, [filteredAndSortedScenarios, showArchived]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (cardMenuOpenId) setCardMenuOpenId(null);
        else if (briefingScenario) setBriefingScenario(null);
        else if (view === 'edit' && editId) {
          setEditId(null);
          setEditDraft(null);
        } else if (generated) {
          setGenerated(null);
          setEditTitle('');
          setCreateStep(1);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, editId, generated, briefingScenario, cardMenuOpenId, onClose]);

  const handleGenerate = async () => {
    if (!prompt.trim() && !topic.trim() && !place.trim() && !userRole.trim() && !goalStructured.trim()) {
      setGenerateError('Введите запрос или заполните поля (тема, место, роль, цель).');
      return;
    }
    setGenerateLoading(true);
    setGenerateError(null);
    try {
      const result = await generateUserScenario({
        prompt: prompt.trim() || undefined,
        level,
        structured: {
          topic: topic.trim() || undefined,
          place: place.trim() || undefined,
          userRole: userRole.trim() || undefined,
          goal: goalStructured.trim() || undefined,
          slangMode: createSlangMode,
          allowProfanity: createAllowProfanity,
          aiMayUseProfanity: createAllowProfanity ? createAiMayUseProfanity : false,
          profanityIntensity: createProfanityIntensity,
        },
      });
      setGenerated({
        ...result,
        payload: {
          ...result.payload,
          slangMode: createSlangMode,
          allowProfanity: createAllowProfanity,
          aiMayUseProfanity: createAllowProfanity ? createAiMayUseProfanity : false,
          profanityIntensity: createProfanityIntensity,
        },
      });
      setEditTitle(result.title);
      setCreateStep(2);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Ошибка генерации');
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleSaveNew = async () => {
    if (!generated || !editTitle.trim()) return;
    setSaveLoading(true);
    setSaveError(null);
    try {
      await createUserScenario({
        title: editTitle.trim(),
        level: generated.level,
        payload: generated.payload,
      });
      setGenerated(null);
      setEditTitle('');
      setCreateStep(1);
      setPrompt('');
      setTopic('');
      setPlace('');
      setUserRole('');
      setGoalStructured('');
      setCreateSlangMode('light');
      setCreateAllowProfanity(false);
      setCreateAiMayUseProfanity(false);
      setCreateProfanityIntensity('light');
      setView('my');
      loadList();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaveLoading(false);
    }
  };

  const handlePlay = (s: UserScenario) => {
    setBriefingScenario(s);
  };

  const handleStartFromBriefing = (scenarioWithSettings: RoleplayScenario) => {
    if (briefingScenario) {
      onSelectScenario(scenarioWithSettings);
      onClose();
    }
  };

  const handleArchive = async (id: string, archive: boolean) => {
    setArchivingId(id);
    try {
      await updateUserScenario(id, { archived: archive });
      await loadList();
    } finally {
      setArchivingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить сценарий без возможности восстановления?')) return;
    setDeletingId(id);
    try {
      await deleteUserScenario(id);
      await loadList();
    } finally {
      setDeletingId(null);
    }
  };

  const startEdit = async (s: UserScenario) => {
    setEditId(s.id);
    setEditTab('main');
    setEditDraft({
      title: s.title,
      level: s.level,
      payload: {
        systemPrompt: s.systemPrompt,
        goal: s.goal,
        goalRu: s.goalRu,
        steps: s.steps,
        setting: s.setting,
        scenarioText: s.scenarioText,
        yourRole: s.yourRole,
        settingRu: s.settingRu,
        scenarioTextRu: s.scenarioTextRu,
        yourRoleRu: s.yourRoleRu,
        goalRu: s.goalRu,
        openingInstruction: s.openingInstruction,
        characterOpening: s.characterOpening,
        suggestedFirstLine: s.suggestedFirstLine,
        maxScoreTipsRu: s.maxScoreTipsRu,
        difficulty: s.difficulty,
        optionalTwist: s.optionalTwist,
        description: s.description,
        slangMode: s.slangMode,
        allowProfanity: s.allowProfanity,
        aiMayUseProfanity: s.aiMayUseProfanity,
        profanityIntensity: s.profanityIntensity,
      },
    });
  };

  const handleSaveEdit = async () => {
    if (!editId || !editDraft) return;
    setEditSaveLoading(true);
    try {
      await updateUserScenario(editId, {
        title: editDraft.title,
        level: editDraft.level,
        payload: editDraft.payload,
      });
      setEditId(null);
      setEditDraft(null);
      loadList();
    } finally {
      setEditSaveLoading(false);
    }
  };

  /** Создать копию сценария из текущего черновика (в модалке редактирования) */
  const handleDuplicateFromDraft = async () => {
    if (!editDraft) return;
    setEditDuplicateLoading(true);
    try {
      await createUserScenario({
        title: editDraft.title.trim() ? `${editDraft.title.trim()} (копия)` : 'Сценарий (копия)',
        level: editDraft.level,
        payload: editDraft.payload,
      });
      setEditId(null);
      setEditDraft(null);
      loadList();
    } finally {
      setEditDuplicateLoading(false);
    }
  };

  /** Создать копию сценария из карточки (без открытия редактирования) */
  const handleDuplicateFromScenario = async (s: UserScenario) => {
    setDuplicatingId(s.id);
    const payload: Record<string, unknown> = {
      systemPrompt: s.systemPrompt,
      goal: s.goal,
      goalRu: s.goalRu,
      steps: s.steps,
      setting: s.setting,
      scenarioText: s.scenarioText,
      yourRole: s.yourRole,
      settingRu: s.settingRu,
      scenarioTextRu: s.scenarioTextRu,
      yourRoleRu: s.yourRoleRu,
      openingInstruction: s.openingInstruction,
      characterOpening: s.characterOpening,
      suggestedFirstLine: s.suggestedFirstLine,
      maxScoreTipsRu: s.maxScoreTipsRu,
      difficulty: s.difficulty,
      optionalTwist: s.optionalTwist,
      description: s.description,
      slangMode: s.slangMode,
      allowProfanity: s.allowProfanity,
      aiMayUseProfanity: s.aiMayUseProfanity,
      profanityIntensity: s.profanityIntensity,
    };
    try {
      await createUserScenario({
        title: `${s.title} (копия)`,
        level: s.level,
        payload,
      });
      setCardMenuOpenId(null);
      loadList();
    } catch {
      // ошибка уже показана через fetchApi
    } finally {
      setDuplicatingId(null);
    }
  };

  const renderHeader = (title: string, showTabs?: boolean, onBack?: () => void) => (
    <div
      style={{
        padding: '1rem 1.25rem',
        borderBottom: '1px solid var(--sidebar-border)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
      }}
    >
      {onBack && (
        <button type="button" onClick={onBack} style={{ ...btnSecondary, padding: '0.4rem' }} aria-label="Назад">
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      {showTabs && !onBack && (
        <div
          style={{
            display: 'inline-flex',
            padding: 4,
            borderRadius: 14,
            background: 'var(--sidebar-hover)',
            border: '1px solid var(--sidebar-border)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.04)',
            marginRight: 'auto',
          }}
        >
          <button
            type="button"
            onClick={() => setView('create')}
            style={{
              padding: '0.5rem 0.875rem',
              borderRadius: 10,
              border: 'none',
              background: view === 'create' ? 'var(--sidebar-active)' : 'transparent',
              color: 'var(--sidebar-text)',
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: view === 'create' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            Создать
          </button>
          <button
            type="button"
            onClick={() => setView('my')}
            style={{
              padding: '0.5rem 0.875rem',
              borderRadius: 10,
              border: 'none',
              background: view === 'my' ? 'var(--sidebar-active)' : 'transparent',
              color: 'var(--sidebar-text)',
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: view === 'my' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            Мои сценарии
          </button>
        </div>
      )}
      <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--sidebar-text)', flex: 1 }}>
        {title}
      </h2>
      <button type="button" onClick={onClose} aria-label="Закрыть" style={{ ...btnSecondary, padding: '0.4rem' }}>
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <line x1={18} y1={6} x2={6} y2={18} />
          <line x1={6} y1={6} x2={18} y2={18} />
        </svg>
      </button>
    </div>
  );

  const isWizardStep2Or3 = generated && createStep >= 2;
  const isWizardStep3 = generated && createStep === 3;
  const stepLabels = ['Опишите ситуацию', 'Цель и шаги', 'Название и сохранение'] as const;

  const renderCreateForm = () => {
    const currentStepNum = !generated ? 1 : createStep;
    return (
      <>
        {renderHeader('Создать сценарий', true)}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            overflow: 'hidden',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            scrollbarGutter: 'stable',
          }}
        >
          {/* Индикатор шагов */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '1rem',
              padding: '0.5rem 0',
              borderBottom: '1px solid var(--sidebar-border)',
              flexShrink: 0,
            }}
          >
            {([1, 2, 3] as const).map((num) => (
              <React.Fragment key={num}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.9375rem',
                    fontWeight: currentStepNum === num ? 600 : 500,
                    color: 'var(--sidebar-text)',
                    opacity: currentStepNum === num ? 1 : currentStepNum > num ? 0.8 : 0.5,
                  }}
                >
                  <span
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      background: currentStepNum === num ? 'rgba(99, 102, 241, 0.2)' : 'var(--sidebar-hover)',
                      border: currentStepNum === num ? '2px solid rgba(99, 102, 241, 0.6)' : '1px solid var(--sidebar-border)',
                      color: currentStepNum === num ? 'rgba(99, 102, 241, 1)' : 'var(--sidebar-text)',
                    }}
                  >
                    {num}
                  </span>
                  <span>{stepLabels[num - 1]}</span>
                </div>
                {num < 3 && (
                  <div style={{ flex: 1, minWidth: 20, height: 1, margin: '0 0.5rem', background: 'var(--sidebar-border)', opacity: 0.5 }} aria-hidden />
                )}
              </React.Fragment>
            ))}
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '0.25rem', scrollbarGutter: 'stable' }}>
          {/* Контент шага — flex чтобы заполнить без скролла */}
          <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Шаг 1: Опишите ситуацию */}
          {(!generated || createStep === 1) && (
            <>
              <p style={{ margin: '0 0 0.75rem', fontSize: '1rem', color: 'var(--sidebar-text)', opacity: 0.85, lineHeight: 1.45, flexShrink: 0 }}>
                Опишите сценарий и/или заполните поля. Уровень задаёт сложность языка.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '1rem 1.25rem',
                  maxWidth: 980,
                  flex: 1,
                  minHeight: 0,
                  alignContent: 'start',
                }}
              >
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={createSectionTitle}>Запрос</span>
                  <label style={{ display: 'block' }}>
                    <span style={createLabelStyle}>Свободный текст</span>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Например: диалог в кафе — заказать кофе и десерт, уточнить счёт"
                      rows={2}
                      style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
                    />
                  </label>
                </div>
                <div>
                  <span style={createSectionTitle}>Детали (по желанию)</span>
                  <label style={{ display: 'block', marginBottom: '0.75rem' }}>
                    <span style={createLabelStyle}>Тема</span>
                    <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="кафе, такси" style={inputStyle} />
                  </label>
                  <label style={{ display: 'block', marginBottom: '0.75rem' }}>
                    <span style={createLabelStyle}>Место</span>
                    <input type="text" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="аэропорт, офис" style={inputStyle} />
                  </label>
                  <label style={{ display: 'block' }}>
                    <span style={{ ...createLabelStyle, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      Уровень
                      <span
                        title="Уровень задаёт сложность сценария при генерации и фильтры; в диалоге ИИ подстраивается под вашу речь."
                        style={{ cursor: 'help', display: 'inline-flex', color: 'var(--sidebar-text)', opacity: 0.65 }}
                        aria-label="Подсказка про уровень"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                      </span>
                    </span>
                    <LevelDropdown
                      value={level}
                      onChange={setLevel}
                      options={LEVELS}
                      ariaLabel="Уровень сценария"
                    />
                  </label>
                  <div style={{ marginTop: '0.75rem', padding: '0.75rem', borderRadius: 10, border: '1px solid var(--sidebar-border)', background: 'var(--sidebar-bg)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <span style={{ ...createLabelStyle, marginBottom: 0, fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.75 }}>
                      Сленг и 18+ настройки (необязательно)
                    </span>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ ...createLabelStyle, marginBottom: 0, fontSize: '0.85rem' }}>Стиль сленга</span>
                      <select
                        value={createSlangMode}
                        onChange={(e) => setCreateSlangMode(e.target.value as SlangMode)}
                        style={{ ...inputStyle, padding: '0.55rem 0.75rem', fontSize: '0.9375rem' }}
                      >
                        {SLANG_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', color: 'var(--sidebar-text)' }}>
                      <input
                        type="checkbox"
                        checked={createAllowProfanity}
                        onChange={(e) => {
                          const next = e.target.checked;
                          setCreateAllowProfanity(next);
                          if (!next) setCreateAiMayUseProfanity(false);
                        }}
                      />
                      Разрешить нецензурную лексику (18+)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', color: 'var(--sidebar-text)', opacity: createAllowProfanity ? 1 : 0.55 }}>
                      <input
                        type="checkbox"
                        checked={createAiMayUseProfanity}
                        disabled={!createAllowProfanity}
                        onChange={(e) => setCreateAiMayUseProfanity(e.target.checked)}
                      />
                      ИИ тоже может ругаться матом
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: createAllowProfanity ? 1 : 0.55 }}>
                      <span style={{ ...createLabelStyle, marginBottom: 0, fontSize: '0.85rem' }}>Интенсивность</span>
                      <select
                        value={createProfanityIntensity}
                        disabled={!createAllowProfanity}
                        onChange={(e) => setCreateProfanityIntensity(e.target.value as ProfanityIntensity)}
                        style={{ ...inputStyle, padding: '0.55rem 0.75rem', fontSize: '0.9375rem' }}
                      >
                        {PROFANITY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
                <div>
                  <span style={createSectionTitle}>Роль и цель</span>
                  <label style={{ display: 'block', marginBottom: '0.75rem' }}>
                    <span style={createLabelStyle}>Ваша роль</span>
                    <input type="text" value={userRole} onChange={(e) => setUserRole(e.target.value)} placeholder="клиент, пассажир" style={inputStyle} />
                  </label>
                  <label style={{ display: 'block' }}>
                    <span style={createLabelStyle}>Цель диалога</span>
                    <input type="text" value={goalStructured} onChange={(e) => setGoalStructured(e.target.value)} placeholder="заказать такси до отеля" style={inputStyle} />
                  </label>
                </div>
              </div>
              {generateError && (
                <p style={{ margin: '0.75rem 0 0', padding: '0.75rem 1rem', borderRadius: 10, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--sidebar-text)', fontSize: '0.9375rem', flexShrink: 0 }}>
                  {generateError}
                </p>
              )}
            </>
          )}

          {/* Шаг 2: Цель и шаги + превью (компактно, без скролла) */}
          {isWizardStep2Or3 && !isWizardStep3 && generated && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 260px) 1fr', gap: '0.75rem', flex: 1, minHeight: 0, alignContent: 'start', alignItems: 'stretch' }}>
                <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: 0 }}>
                  <div
                    style={{
                      padding: '0.6rem 0.9rem',
                      borderRadius: 10,
                      background: 'var(--sidebar-hover)',
                      border: '1px solid var(--sidebar-border)',
                      flex: '0 1 auto',
                      minHeight: 0,
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.7, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Цель</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--sidebar-text)', lineHeight: 1.35 }}>
                      {(generated.payload.goalRu as string) || (generated.payload.goal as string) || '—'}
                    </div>
                    {Array.isArray(generated.payload.steps) && (generated.payload.steps as { titleRu?: string }[]).length > 0 && (
                      <>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.7, marginTop: '0.5rem', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Шаги</div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--sidebar-text)', opacity: 0.9, lineHeight: 1.4 }}>
                          {(generated.payload.steps as { titleRu?: string }[]).map((s) => s.titleRu).filter(Boolean).join(' → ')}
                        </div>
                      </>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flexShrink: 0 }}>
                    <button type="button" onClick={() => setCreateStep(3)} style={btnPrimary}>
                      Далее — название и сохранение
                    </button>
                    <button type="button" onClick={() => setCreateStep(1)} style={btnSecondary}>
                      Назад
                    </button>
                  </div>
                </div>
                <div style={{ borderRadius: 10, border: '1px solid var(--sidebar-border)', background: 'var(--sidebar-hover)', padding: '0.5rem', minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', width: '100%' }}>
                  <BriefingPreview payload={generated.payload} title="Превью брифинга" compact />
                </div>
              </div>
            </>
          )}

          {/* Шаг 3: Название и сохранение — та же раскладка, что и шаг 2 (слева форма, справа превью) */}
          {isWizardStep3 && generated && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 260px) 1fr', gap: '0.75rem', flex: 1, minHeight: 0, alignContent: 'start', alignItems: 'stretch' }}>
                <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: '1rem', color: 'var(--sidebar-text)', opacity: 0.85, flexShrink: 0 }}>
                    Задайте название и сохраните — сценарий появится в «Мои сценарии».
                  </p>
                  <div style={{ flexShrink: 0 }}>
                    <label style={{ display: 'block' }}>
                      <span style={createLabelStyle}>Название сценария</span>
                      <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Например: Заказ в кафе" style={inputStyle} />
                    </label>
                  </div>
                  {saveError && (
                    <p style={{ margin: '0 0 0.5rem', padding: 0, fontSize: '0.9375rem', color: 'var(--sidebar-text)', opacity: 0.9, flexShrink: 0 }}>
                      {saveError}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
                    <button type="button" onClick={handleSaveNew} disabled={saveLoading} style={{ ...btnPrimary, opacity: saveLoading ? 0.7 : 1 }}>
                      {saveLoading ? 'Сохранение…' : 'Сохранить сценарий'}
                    </button>
                    <button type="button" onClick={() => setCreateStep(2)} style={btnSecondary}>
                      Назад
                    </button>
                    <button
                      type="button"
                      onClick={() => { setGenerated(null); setEditTitle(''); setCreateStep(1); }}
                      style={btnSecondary}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
                <div style={{ borderRadius: 10, border: '1px solid var(--sidebar-border)', background: 'var(--sidebar-hover)', padding: '0.5rem', minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', width: '100%' }}>
                  <BriefingPreview payload={generated.payload} title="Брифинг перед стартом" compact />
                </div>
              </div>
            </>
          )}
          </div>
          </div>
          {(!generated || createStep === 1) && (
            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                flexWrap: 'wrap',
                flexShrink: 0,
                marginTop: '1rem',
                paddingTop: '0.85rem',
                borderTop: '1px solid var(--sidebar-border)',
                background: 'var(--sidebar-bg)',
              }}
            >
              <button type="button" onClick={handleGenerate} disabled={generateLoading} style={{ ...btnPrimary, opacity: generateLoading ? 0.7 : 1 }}>
                {generateLoading ? 'Генерация…' : 'Сгенерировать сценарий'}
              </button>
            </div>
          )}
        </div>
      </>
    );
  };

  const truncate = (str: string | undefined, max: number) => {
    if (!str || !str.trim()) return '';
    const t = str.trim();
    return t.length <= max ? t : t.slice(0, max) + '…';
  };

  const renderMyList = () => {
    const levelOptions: { value: string; label: string }[] = [
      { value: 'all', label: 'Все уровни' },
      ...LEVELS.map((l) => ({ value: l.value, label: l.label })),
    ];
    const listToShow = filteredAndSortedScenarios;
    const showRecent = recentlyPlayedScenarios.length > 0;
    const mainList = showRecent
      ? listToShow.filter((s) => !recentlyPlayedScenarios.some((r) => r.id === s.id))
      : listToShow;

    return (
      <>
        {renderHeader('Мои сценарии', true)}
        <div style={{ padding: '0 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setShowArchived(false)}
              style={{ ...btnSecondary, background: !showArchived ? 'var(--sidebar-active)' : 'transparent', color: 'var(--sidebar-text)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = !showArchived ? 'var(--sidebar-active)' : 'var(--sidebar-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = !showArchived ? 'var(--sidebar-active)' : 'transparent'; }}
            >
              Активные
            </button>
            <button
              type="button"
              onClick={() => setShowArchived(true)}
              style={{ ...btnSecondary, background: showArchived ? 'var(--sidebar-active)' : 'transparent', color: 'var(--sidebar-text)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = showArchived ? 'var(--sidebar-active)' : 'var(--sidebar-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = showArchived ? 'var(--sidebar-active)' : 'transparent'; }}
            >
              Архив
            </button>
          </div>
          <label style={{ position: 'relative', display: 'block' }}>
            <input
              type="search"
              aria-label="Поиск по названию"
              placeholder="Поиск по названию…"
              value={mySearchQuery}
              onChange={(e) => setMySearchQuery(e.target.value)}
              autoComplete="off"
              style={{
                ...inputStyle,
                width: '100%',
                paddingLeft: '2.25rem',
              }}
            />
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, pointerEvents: 'none' }}
            >
              <circle cx={11} cy={11} r={8} />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ width: 'auto', minWidth: 120 }}>
              <LevelDropdown
                value={myLevelFilter}
                onChange={setMyLevelFilter}
                options={levelOptions}
                openUpward={false}
                style={{ width: 'auto', minWidth: 120 }}
                ariaLabel="Фильтр по уровню"
              />
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--sidebar-text)', opacity: 0.7 }}>Сортировка:</span>
            <button
              type="button"
              onClick={() => setMySortBy('last_used')}
              style={{ ...btnSecondary, background: mySortBy === 'last_used' ? 'var(--sidebar-active)' : 'transparent', color: 'var(--sidebar-text)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = mySortBy === 'last_used' ? 'var(--sidebar-active)' : 'var(--sidebar-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = mySortBy === 'last_used' ? 'var(--sidebar-active)' : 'transparent'; }}
            >
              По использованию
            </button>
            <button
              type="button"
              onClick={() => setMySortBy('updated')}
              style={{ ...btnSecondary, background: mySortBy === 'updated' ? 'var(--sidebar-active)' : 'transparent', color: 'var(--sidebar-text)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = mySortBy === 'updated' ? 'var(--sidebar-active)' : 'var(--sidebar-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = mySortBy === 'updated' ? 'var(--sidebar-active)' : 'transparent'; }}
            >
              По обновлению
            </button>
          </div>
        </div>
        <div style={{ padding: '1rem 1.25rem', overflowY: 'auto', flex: 1 }}>
          {listLoading ? (
            <p style={{ margin: 0, fontSize: '0.9375rem', color: 'var(--sidebar-text)', opacity: 0.7 }}>Загрузка…</p>
          ) : scenarios.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.9375rem', color: 'var(--sidebar-text)', opacity: 0.7 }}>
              {showArchived ? 'В архиве пока ничего нет.' : 'У вас пока нет сохранённых сценариев. Создайте сценарий с ИИ или выберите сценарий из каталога.'}
            </p>
          ) : listToShow.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.9375rem', color: 'var(--sidebar-text)', opacity: 0.7 }}>
              По запросу ничего не найдено. Измените поиск или фильтр.
            </p>
          ) : (
            <>
              {showRecent && (
                <div style={{ marginBottom: '1rem' }}>
                  <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--sidebar-text)', opacity: 0.8 }}>
                    Недавно играли
                  </h3>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {recentlyPlayedScenarios.map((s) => (
                      <ScenarioCard
                        key={s.id}
                        ref={s.id === highlightedScenarioId ? highlightedCardRef : undefined}
                        scenario={s}
                        showArchived={showArchived}
                        editId={editId}
                        archivingId={archivingId}
                        deletingId={deletingId}
                        duplicatingId={duplicatingId}
                        cardMenuOpenId={cardMenuOpenId}
                        setCardMenuOpenId={setCardMenuOpenId}
                        truncate={truncate}
                        onPlay={handlePlay}
                        onEdit={startEdit}
                        onArchive={handleArchive}
                        onDelete={handleDelete}
                        onDuplicate={handleDuplicateFromScenario}
                        isHighlighted={s.id === highlightedScenarioId}
                      />
                    ))}
                  </ul>
                </div>
              )}
              {mainList.length > 0 && (
                <div>
                  {showRecent && (
                    <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--sidebar-text)', opacity: 0.8 }}>
                    Все сценарии
                  </h3>
                )}
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {mainList.map((s) => (
                      <ScenarioCard
                        key={s.id}
                        ref={s.id === highlightedScenarioId ? highlightedCardRef : undefined}
                        scenario={s}
                        showArchived={showArchived}
                        editId={editId}
                        archivingId={archivingId}
                        deletingId={deletingId}
                        duplicatingId={duplicatingId}
                        cardMenuOpenId={cardMenuOpenId}
                        setCardMenuOpenId={setCardMenuOpenId}
                        truncate={truncate}
                        onPlay={handlePlay}
                        onEdit={startEdit}
                        onArchive={handleArchive}
                        onDelete={handleDelete}
                        onDuplicate={handleDuplicateFromScenario}
                        isHighlighted={s.id === highlightedScenarioId}
                      />
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </>
    );
  };

  const renderEditModal = () => {
    if (!editId || !editDraft) return null;
    const p = editDraft.payload;
    const steps = (Array.isArray(p.steps) ? p.steps : []) as { id?: string; order: number; titleRu: string; titleEn?: string }[];
    const setPayload = (updates: Record<string, unknown>) =>
      setEditDraft((d) => (d ? { ...d, payload: { ...d.payload, ...updates } } : null));
    const updateStep = (index: number, field: 'titleRu' | 'titleEn', value: string) => {
      const next = steps.map((st, i) => (i === index ? { ...st, [field]: value } : st));
      setPayload({ steps: next });
    };
    const addStep = () => {
      const next = [...steps, { id: `step-${Date.now()}`, order: steps.length, titleRu: '', titleEn: '' }];
      setPayload({ steps: next });
    };
    const removeStep = (index: number) => {
      const next = steps.filter((_, i) => i !== index).map((st, i) => ({ ...st, order: i }));
      setPayload({ steps: next });
    };

    const editTabButton = (tab: 'main' | 'practice', label: string) => (
      <button
        type="button"
        onClick={() => setEditTab(tab)}
        style={{
          padding: '0.5rem 0.875rem',
          borderRadius: 10,
          border: 'none',
          background: editTab === tab ? 'var(--sidebar-active)' : 'transparent',
          color: 'var(--sidebar-text)',
          fontSize: '0.8125rem',
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          boxShadow: editTab === tab ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
        }}
      >
        {label}
      </button>
    );

    return (
      <div style={modalOverlayStyle} onClick={() => { setEditId(null); setEditDraft(null); }}>
        <div style={{ ...modalPanelStyle, maxWidth: 1680, maxHeight: '94vh' }} onClick={(e) => e.stopPropagation()}>
          {renderHeader('Редактировать сценарий', false, () => { setEditId(null); setEditDraft(null); })}
          <div
            style={{
              padding: '0.5rem 1.25rem 0.75rem',
              borderBottom: '1px solid var(--sidebar-border)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                padding: 4,
                borderRadius: 14,
                background: 'var(--sidebar-hover)',
                border: '1px solid var(--sidebar-border)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
            >
              {editTabButton('main', 'Основное')}
              {editTabButton('practice', 'Для практики')}
            </div>
          </div>
          <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {editTab === 'main' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', flexShrink: 0 }}>
                <div>
                  <span style={createSectionTitle}>Название и уровень</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <label style={{ display: 'block' }}>
                      <span style={createLabelStyle}>Название</span>
                      <input
                        type="text"
                        value={editDraft.title}
                        onChange={(e) => setEditDraft((d) => (d ? { ...d, title: e.target.value } : null))}
                        style={inputStyle}
                        placeholder="Название сценария"
                      />
                    </label>
                    <label style={{ display: 'block' }}>
                      <span style={{ ...createLabelStyle, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        Уровень
                        <span
                          title="Уровень задаёт сложность сценария при генерации и фильтры; в диалоге ИИ подстраивается под вашу речь."
                          style={{ cursor: 'help', display: 'inline-flex', color: 'var(--sidebar-text)', opacity: 0.65 }}
                          aria-label="Подсказка про уровень"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                        </span>
                      </span>
                      <LevelDropdown
                        value={editDraft.level}
                        onChange={(v) => setEditDraft((d) => (d ? { ...d, level: v } : null))}
                        options={LEVELS}
                        ariaLabel="Уровень сценария"
                      />
                    </label>
                  </div>
                </div>
                <div>
                  <span style={createSectionTitle}>Цель</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <label style={{ display: 'block' }}>
                      <span style={createLabelStyle}>Цель (EN)</span>
                      <input
                        type="text"
                        value={(p.goal as string) ?? ''}
                        onChange={(e) => setPayload({ goal: e.target.value })}
                        style={inputStyle}
                        placeholder="Goal of the dialogue"
                      />
                    </label>
                    <label style={{ display: 'block' }}>
                      <span style={createLabelStyle}>Цель (RU)</span>
                      <input
                        type="text"
                        value={(p.goalRu as string) ?? ''}
                        onChange={(e) => setPayload({ goalRu: e.target.value })}
                        style={inputStyle}
                        placeholder="Цель диалога"
                      />
                    </label>
                  </div>
                </div>
                <div>
                  <span style={createSectionTitle}>Сленг и 18+ настройки (необязательно)</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <label style={{ display: 'block' }}>
                      <span style={createLabelStyle}>Стиль сленга</span>
                      <select
                        value={(p.slangMode as SlangMode) ?? 'light'}
                        onChange={(e) => setPayload({ slangMode: e.target.value as SlangMode })}
                        style={{ ...inputStyle, padding: '0.6rem 0.75rem', fontSize: '0.95rem' }}
                      >
                        {SLANG_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem', color: 'var(--sidebar-text)' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(p.allowProfanity)}
                        onChange={(e) => {
                          const next = e.target.checked;
                          setPayload({
                            allowProfanity: next,
                            aiMayUseProfanity: next ? Boolean(p.aiMayUseProfanity) : false,
                          });
                        }}
                      />
                      Разрешить нецензурную лексику (18+)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem', color: 'var(--sidebar-text)', opacity: Boolean(p.allowProfanity) ? 1 : 0.55 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(p.aiMayUseProfanity)}
                        disabled={!Boolean(p.allowProfanity)}
                        onChange={(e) => setPayload({ aiMayUseProfanity: e.target.checked })}
                      />
                      ИИ тоже может ругаться матом
                    </label>
                    <label style={{ display: 'block', opacity: Boolean(p.allowProfanity) ? 1 : 0.55 }}>
                      <span style={createLabelStyle}>Интенсивность</span>
                      <select
                        value={(p.profanityIntensity as ProfanityIntensity) ?? 'light'}
                        disabled={!Boolean(p.allowProfanity)}
                        onChange={(e) => setPayload({ profanityIntensity: e.target.value as ProfanityIntensity })}
                        style={{ ...inputStyle, padding: '0.6rem 0.75rem', fontSize: '0.95rem' }}
                      >
                        {PROFANITY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
                <div>
                  <span style={createSectionTitle}>Инструкция для ИИ-персонажа</span>
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', color: 'var(--sidebar-text)', opacity: 0.7, lineHeight: 1.4 }}>
                    System prompt — как вести себя персонажу в диалоге.
                  </p>
                  <textarea
                    value={(p.systemPrompt as string) ?? ''}
                    onChange={(e) => setPayload({ systemPrompt: e.target.value })}
                    rows={6}
                    style={{ ...inputStyle, resize: 'vertical', minHeight: 120 }}
                    placeholder="Опишите характер, тон, правила ответов…"
                  />
                </div>
              </div>
            )}
            {editTab === 'practice' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', flexShrink: 0 }}>
                <div>
                  <span style={createSectionTitle}>Место и ситуация</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <label style={{ display: 'block' }}>
                      <span style={createLabelStyle}>Место (EN)</span>
                      <input
                        type="text"
                        value={(p.setting as string) ?? ''}
                        onChange={(e) => setPayload({ setting: e.target.value })}
                        style={inputStyle}
                        placeholder="e.g. café, airport"
                      />
                    </label>
                    <label style={{ display: 'block' }}>
                      <span style={createLabelStyle}>Место (RU)</span>
                      <input
                        type="text"
                        value={(p.settingRu as string) ?? ''}
                        onChange={(e) => setPayload({ settingRu: e.target.value })}
                        style={inputStyle}
                        placeholder="Например: кафе, аэропорт"
                      />
                    </label>
                    <label style={{ display: 'block' }}>
                      <span style={createLabelStyle}>Ситуация (EN)</span>
                      <input
                        type="text"
                        value={(p.scenarioText as string) ?? ''}
                        onChange={(e) => setPayload({ scenarioText: e.target.value })}
                        style={inputStyle}
                        placeholder="Short scenario description"
                      />
                    </label>
                    <label style={{ display: 'block' }}>
                      <span style={createLabelStyle}>Ситуация (RU)</span>
                      <input
                        type="text"
                        value={(p.scenarioTextRu as string) ?? ''}
                        onChange={(e) => setPayload({ scenarioTextRu: e.target.value })}
                        style={inputStyle}
                        placeholder="Краткое описание ситуации"
                      />
                    </label>
                  </div>
                </div>
                <div>
                  <span style={createSectionTitle}>Ваша роль</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <label style={{ display: 'block' }}>
                      <span style={createLabelStyle}>Роль (EN)</span>
                      <input
                        type="text"
                        value={(p.yourRole as string) ?? ''}
                        onChange={(e) => setPayload({ yourRole: e.target.value })}
                        style={inputStyle}
                        placeholder="e.g. customer, passenger"
                      />
                    </label>
                    <label style={{ display: 'block' }}>
                      <span style={createLabelStyle}>Роль (RU)</span>
                      <input
                        type="text"
                        value={(p.yourRoleRu as string) ?? ''}
                        onChange={(e) => setPayload({ yourRoleRu: e.target.value })}
                        style={inputStyle}
                        placeholder="Например: клиент, пассажир"
                      />
                    </label>
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={createSectionTitle}>Шаги сценария</span>
                    <button type="button" onClick={addStep} style={{ ...btnSecondary, padding: '0.4rem 0.75rem', fontSize: '0.8125rem' }}>
                      Добавить шаг
                    </button>
                  </div>
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', color: 'var(--sidebar-text)', opacity: 0.7, lineHeight: 1.4 }}>
                    Чекпоинты, которые отображаются ученику по ходу диалога.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {steps.map((st, i) => (
                      <div key={st.id ?? i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.9375rem', fontWeight: 500, width: 28, color: 'var(--sidebar-text)', opacity: 0.8, flexShrink: 0 }}>{i + 1}.</span>
                        <input
                          type="text"
                          value={st.titleRu ?? ''}
                          onChange={(e) => updateStep(i, 'titleRu', e.target.value)}
                          placeholder="Название шага (RU)"
                          style={{ ...inputStyle, flex: 1 }}
                        />
                        <button type="button" onClick={() => removeStep(i)} aria-label="Удалить шаг" style={{ ...btnSecondary, padding: '0.4rem', flexShrink: 0 }}>
                          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <span style={createSectionTitle}>Старт диалога и подсказки</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <label style={{ display: 'block' }}>
                      <span style={createLabelStyle}>Начните с фразы</span>
                      <input
                        type="text"
                        value={(p.suggestedFirstLine as string) ?? ''}
                        onChange={(e) => setPayload({ suggestedFirstLine: e.target.value })}
                        style={inputStyle}
                        placeholder="Фраза, с которой ученик может начать"
                      />
                    </label>
                    <label style={{ display: 'block' }}>
                      <span style={createLabelStyle}>Первая реплика персонажа</span>
                      <input
                        type="text"
                        value={(p.characterOpening as string) ?? ''}
                        onChange={(e) => setPayload({ characterOpening: e.target.value })}
                        style={inputStyle}
                        placeholder="Что говорит ИИ в начале"
                      />
                    </label>
                    <label style={{ display: 'block' }}>
                      <span style={createLabelStyle}>Советы по баллам</span>
                      <textarea
                        value={(p.maxScoreTipsRu as string) ?? ''}
                        onChange={(e) => setPayload({ maxScoreTipsRu: e.target.value })}
                        rows={2}
                        style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
                        placeholder="Как говорить, чтобы получить максимальные баллы"
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap', alignItems: 'center', flexShrink: 0, paddingTop: '0.25rem', borderTop: '1px solid var(--sidebar-border)' }}>
              <button type="button" onClick={handleSaveEdit} disabled={editSaveLoading} style={{ ...btnPrimary, opacity: editSaveLoading ? 0.7 : 1 }}>
                {editSaveLoading ? 'Сохранение…' : 'Сохранить'}
              </button>
              <button type="button" onClick={handleDuplicateFromDraft} disabled={editDuplicateLoading} style={btnSecondary}>
                {editDuplicateLoading ? '…' : 'Создать копию'}
              </button>
              <button type="button" onClick={() => { setEditId(null); setEditDraft(null); }} style={btnSecondary}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderBriefing = () => {
    if (!briefingScenario) return null;
    return (
      <div
        className="roleplay-briefing"
        style={{
          padding: '1rem 1.25rem',
          overflowY: 'auto',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <BriefingView
          scenario={toRoleplayScenario(briefingScenario)}
          onBack={() => setBriefingScenario(null)}
          onStart={handleStartFromBriefing}
        />
      </div>
    );
  };

  return (
    <>
      <div role="dialog" aria-modal="true" aria-label={briefingScenario ? 'Перед началом диалога' : 'Личные сценарии'} style={modalOverlayStyle} onClick={briefingScenario ? undefined : onClose}>
        <div style={{ ...modalPanelStyle, maxWidth: briefingScenario ? 8100 : 14400, maxHeight: '94vh' }} onClick={(e) => e.stopPropagation()}>
          {briefingScenario ? (
            <>
              <div
                style={{
                  padding: '1rem 1.25rem',
                  borderBottom: '1px solid var(--sidebar-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontSize: '0.9375rem', color: 'var(--sidebar-text)', opacity: 0.75 }}>
                  Перед началом диалога
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Закрыть"
                  style={{
                    padding: '0.35rem',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--sidebar-text)',
                    opacity: 0.7,
                    cursor: 'pointer',
                    borderRadius: 8,
                  }}
                >
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <line x1={18} y1={6} x2={6} y2={18} />
                    <line x1={6} y1={6} x2={18} y2={18} />
                  </svg>
                </button>
              </div>
              {renderBriefing()}
            </>
          ) : (
            <>
              {view === 'create' && renderCreateForm()}
              {view === 'my' && renderMyList()}
            </>
          )}
        </div>
      </div>
      {renderEditModal()}
    </>
  );
}
