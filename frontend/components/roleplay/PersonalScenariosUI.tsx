'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { RoleplayScenario } from '@/lib/roleplay';
import {
  createUserScenario,
  deleteUserScenario,
  generateUserScenario,
  generateUserScenarioField,
  listUserScenarios,
  updateUserScenario,
  type GenerateScenarioResult,
  type UserScenario,
  type UserScenarioField,
  type UserScenarioLevel,
} from '@/lib/user-scenarios';
import { FieldAiButton, fieldFlashStyle } from '@/components/roleplay/FieldAiButton';
import createStyles from './scenario-create.module.css';
import { LevelDropdown } from '@/components/ui/LevelDropdown';
import { LevelRequiredNotice } from '@/components/ui/HskLevelPicker';
import {
  PracticeWordsInSheet,
  type PracticeWordsSession,
} from '@/components/agent/PracticeWordsInSheet';
import { buildRoleplayPracticeContext } from '@/lib/practice-list-context';
import { bindPracticeList } from '@/lib/practice-list-binding';
import { ZhPlayModeDots } from '@/components/roleplay/ZhPlayModeDots';
import type { PlayMode } from '@/lib/play-mode';

type SlangMode = 'off' | 'light' | 'heavy';
type ProfanityIntensity = 'light' | 'medium' | 'hard';

const LEVELS: { value: UserScenarioLevel; label: string }[] = [
  { value: 'A1', label: 'A1' },
  { value: 'A2', label: 'A2' },
  { value: 'B1', label: 'B1' },
  { value: 'B2', label: 'B2' },
  { value: 'C1', label: 'C1' },
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

export type ScenarioCreateSeed = {
  level?: UserScenarioLevel | null;
  prompt?: string;
  topic?: string;
  place?: string;
  role?: string;
  goal?: string;
  generated?: GenerateScenarioResult | null;
  /** Уже сохранённый сценарий этого списка: повторное сохранение обновляет его, а не создаёт второй. */
  savedId?: string | null;
};

export type PersonalScenariosUIProps = {
  /** При выборе сценария для игры (Play) */
  onSelectScenario: (scenario: RoleplayScenario) => void;
  onClose: () => void;
  /** С какой вкладки открыли: создание или список */
  initialView: 'create' | 'my';
  /** Id сценария, который нужно подсветить и проскроллить к (например после «Сохранить в мои» из каталога) */
  highlightedScenarioId?: string | null;
  initialBriefingId?: string | null;
  initialPlayMode?: PlayMode;
  practiceWords?: PracticeWordsSession | null;
  seedPrompt?: string | null;
  /** Практика: открыть мастер уже с уровнем, целью и текстом сцены, не перескакивая шаги */
  initialSeed?: ScenarioCreateSeed | null;
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
    masteredModes: s.mastered_modes,
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
          {s.mastered_modes && (s.completions_count ?? 0) > 0 && (
            <ZhPlayModeDots mastered={s.mastered_modes} compact />
          )}
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
  initialBriefingId,
  practiceWords = null,
  seedPrompt = null,
  initialSeed = null,
}: PersonalScenariosUIProps) {
  const [view, setView] = useState<'create' | 'my'>(initialView);

  // Create flow
  const [prompt, setPrompt] = useState(initialSeed?.prompt || seedPrompt || '');
  const [topic, setTopic] = useState(initialSeed?.topic || '');
  const [place, setPlace] = useState(initialSeed?.place || '');
  const [userRole, setUserRole] = useState(initialSeed?.role || '');
  const [goalStructured, setGoalStructured] = useState(initialSeed?.goal || '');
  const [createSlangMode, setCreateSlangMode] = useState<SlangMode>('light');
  const [createAllowProfanity, setCreateAllowProfanity] = useState(false);
  const [createAiMayUseProfanity, setCreateAiMayUseProfanity] = useState(false);
  const [createProfanityIntensity, setCreateProfanityIntensity] = useState<ProfanityIntensity>('light');
  const [level, setLevel] = useState<UserScenarioLevel | null>(initialSeed?.level ?? null);
  const [levelNotice, setLevelNotice] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GenerateScenarioResult | null>(initialSeed?.generated ?? null);
  const draftListRef = useRef(`draft-${crypto.randomUUID()}`);
  const [fieldBusy, setFieldBusy] = useState<UserScenarioField | null>(null);
  const [flashField, setFlashField] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState(initialSeed?.generated?.title || '');
  const savedScenarioIdRef = useRef<string | null>(initialSeed?.savedId || null);
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
  const [readyScenario, setReadyScenario] = useState<UserScenario | null>(null);
  const [whoStarts, setWhoStarts] = useState<'ai' | 'user'>('ai');
  /** Поиск по названию и фильтр по уровню в «Мои сценарии» */
  const [mySearchQuery, setMySearchQuery] = useState('');
  const [myLevelFilter, setMyLevelFilter] = useState<string>('all');
  /** Сортировка: last_used = по последнему использованию, updated = по дате обновления */
  const [mySortBy, setMySortBy] = useState<'last_used' | 'updated'>('last_used');
  /** Открыто ли меню действий для карточки (id сценария или null) */
  const [cardMenuOpenId, setCardMenuOpenId] = useState<string | null>(null);
  /** Id сценария, для которого выполняется «Создать копию» (из меню карточки) */
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  /** Сценарий, который правим в мастере «Подготовка сцены». Сохранение обновляет его, а не создаёт второй. */
  const [editId, setEditId] = useState<string | null>(null);

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

  const openedBriefingRef = useRef(false);
  useEffect(() => {
    if (!initialBriefingId || openedBriefingRef.current || scenarios.length === 0) return;
    const found = scenarios.find((s) => s.id === initialBriefingId);
    if (!found) return;
    openedBriefingRef.current = true;
    fillFromScenario(found);
  }, [initialBriefingId, scenarios]);

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
        else if (generated) {
          setGenerated(null);
          setEditTitle('');
          setCreateStep(1);
          setEditId(null);
          savedScenarioIdRef.current = null;
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, editId, generated, briefingScenario, cardMenuOpenId, onClose]);

  const slangStructured = {
    slangMode: createSlangMode,
    allowProfanity: createAllowProfanity,
    aiMayUseProfanity: createAllowProfanity ? createAiMayUseProfanity : false,
    profanityIntensity: createProfanityIntensity,
  };

  const applyGenerated = (result: GenerateScenarioResult, seedPrompt?: string) => {
    const payload = { ...result.payload, ...slangStructured, manual: false };
    setGenerated({ ...result, payload });
    setEditTitle(result.title);
    if (seedPrompt) {
      setPrompt(seedPrompt);
      setTopic(seedPrompt);
    }
    if (typeof payload.settingRu === 'string' && payload.settingRu.trim()) setPlace(payload.settingRu);
    if (typeof payload.yourRoleRu === 'string' && payload.yourRoleRu.trim()) setUserRole(payload.yourRoleRu);
    if (typeof payload.goalRu === 'string' && payload.goalRu.trim()) setGoalStructured(payload.goalRu);
    setCreateStep((current) => (current > 1 ? current : 1));
  };

  const composeManualSystemPrompt = (goalText: string) => {
    const situation = [prompt.trim(), topic.trim(), place.trim()].filter(Boolean).join('. ') || 'An everyday conversation.';
    const role = userRole.trim() || 'the other person in this conversation';
    const goal = goalText.trim() || 'Have a short conversation.';
    return [
      `Character: You are the person talking with the learner. The learner's role: ${role}.`,
      '',
      `Situation: ${situation}`,
      '',
      `Goal: ${goal}`,
      '',
      'Style: Speak only in English. Use short, simple sentences (1–2). Confirm what you heard. If the learner struggles, offer a simple choice.',
      '',
      'First line: Start in character and help the learner begin.',
    ].join('\n');
  };

  const buildManualDraft = (chosenLevel: UserScenarioLevel): GenerateScenarioResult => {
    const goal = goalStructured.trim() || 'Провести диалог';
    const titleSource = topic.trim() || prompt.trim() || place.trim() || 'Новый сценарий';
    return {
      title: titleSource.slice(0, 80),
      level: chosenLevel,
      payload: {
        ...slangStructured,
        manual: true,
        language: 'en',
        category: 'everyday',
        description: prompt.trim() || topic.trim(),
        settingRu: place.trim(),
        setting: place.trim(),
        scenarioTextRu: prompt.trim() || topic.trim(),
        scenarioText: prompt.trim() || topic.trim(),
        yourRoleRu: userRole.trim(),
        yourRole: userRole.trim(),
        goalRu: goal,
        goal,
        systemPrompt: composeManualSystemPrompt(goal),
        steps: [{ id: 'step1', order: 1, titleRu: goal, titleEn: goal }],
      },
    };
  };

  const handleContinue = () => {
    if (!level) {
      askForLevel();
      return;
    }
    if (!generated) {
      const draft = buildManualDraft(level);
      setGenerated(draft);
      setEditTitle((current) => (current.trim() ? current : draft.title));
      if (!goalStructured.trim()) setGoalStructured('Провести диалог');
    }
    setCreateStep(2);
  };

  const patchGeneratedPayload = (partial: Record<string, unknown>) => {
    setGenerated((current) => (current ? { ...current, payload: { ...current.payload, ...partial } } : current));
  };

  const flash = (id: string) => {
    setFlashField(id);
    window.setTimeout(() => setFlashField((cur) => (cur === id ? null : cur)), 1200);
  };

  const askForLevel = () => {
    setLevelNotice(true);
    window.setTimeout(() => setLevelNotice(false), 3200);
  };

  const handleFieldRegen = async (field: UserScenarioField) => {
    if (!level) {
      askForLevel();
      return;
    }
    setFieldBusy(field);
    setGenerateError(null);
    try {
      const steps = Array.isArray(generated?.payload.steps) ? generated?.payload.steps : [];
      const result = await generateUserScenarioField({
        field,
        level,
        topic: topic.trim() || undefined,
        place: place.trim() || undefined,
        userRole: userRole.trim() || undefined,
        goal: goalStructured.trim() || undefined,
        avoid: field === 'steps'
          ? (steps as { titleRu?: string }[]).map((s) => s.titleRu).filter(Boolean).join('; ')
          : field === 'topic' ? topic : field === 'place' ? place : field === 'role' ? userRole : goalStructured,
        systemPrompt: typeof generated?.payload.systemPrompt === 'string' ? generated.payload.systemPrompt : undefined,
      });
      const patch = result.patch || {};
      if (field === 'topic' && typeof patch.text === 'string') setTopic(patch.text);
      if (field === 'place' && typeof patch.text === 'string') setPlace(patch.text);
      if (field === 'role' && typeof patch.text === 'string') setUserRole(patch.text);
      if (field === 'goal' && typeof patch.text === 'string') setGoalStructured(patch.text);
      const { text: _text, ...payloadPatch } = patch;
      if (generated) patchGeneratedPayload(payloadPatch);
      flash(field);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Не удалось обновить поле');
    } finally {
      setFieldBusy(null);
    }
  };

  const pinScenarioForList = async (result: GenerateScenarioResult, title: string) => {
    const listId = practiceWords?.listId;
    if (!listId) return;
    const name = title.trim() || result.title.trim();
    if (!name) return;
    const existingId = savedScenarioIdRef.current;
    const saved = existingId
      ? await updateUserScenario(existingId, { title: name, level: result.level, payload: result.payload })
      : await createUserScenario({ title: name, level: result.level, payload: result.payload });
    savedScenarioIdRef.current = saved.id;
    await bindPracticeList(listId, {
      kind: 'scenario',
      ref: saved.id,
      origin: 'user',
      label: saved.title || name,
    });
  };

  const handleGenerate = async () => {
    if (!level) {
      askForLevel();
      return;
    }
    const hasInput = Boolean(prompt.trim() || topic.trim() || place.trim() || userRole.trim() || goalStructured.trim());
    setGenerateLoading(true);
    setGenerateError(null);
    try {
      const result = await generateUserScenario({
        prompt: hasInput ? (prompt.trim() || undefined) : `Короткий учебный диалог для уровня ${level}`,
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
      applyGenerated({ ...result, level });
      try {
        await pinScenarioForList({ ...result, level }, result.title);
      } catch {
        setGenerateError('Сцена собрана, но не удалось закрепить её за списком');
      }
      flash('form');
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Ошибка генерации');
    } finally {
      setGenerateLoading(false);
    }
  };

  const fillFromScenario = (s: UserScenario) => {
    setBriefingScenario(null);
    setReadyScenario(s);
    setEditId(null);
    savedScenarioIdRef.current = null;
    setView('create');
    setEditTitle(s.title || '');
    setLevel(s.level);
    setPlace(s.settingRu || s.setting || '');
    setUserRole(s.yourRoleRu || s.yourRole || '');
    setGoalStructured(s.goalRu || s.goal || '');
    setPrompt(s.scenarioTextRu || s.scenarioText || s.description || '');
    setTopic(s.title || '');
    setCreateSlangMode((s.slangMode as SlangMode) || 'light');
    setCreateAllowProfanity(Boolean(s.allowProfanity));
    setCreateAiMayUseProfanity(Boolean(s.aiMayUseProfanity));
    setCreateProfanityIntensity((s.profanityIntensity as ProfanityIntensity) || 'light');
    setGenerated({
      title: s.title,
      level: s.level,
      payload: { ...s },
    });
    setCreateStep(3);
    setWhoStarts(s.characterOpening?.trim() ? 'ai' : 'user');
  };

  const beginPrepared = (saved: UserScenario) => {
    onSelectScenario({
      ...toRoleplayScenario(saved),
      title: editTitle.trim() || saved.title,
      settingRu: place,
      yourRoleRu: userRole,
      goalRu: goalStructured,
      scenarioTextRu: prompt,
      slangMode: createSlangMode,
      allowProfanity: createAllowProfanity,
      aiMayUseProfanity: createAllowProfanity ? createAiMayUseProfanity : false,
      profanityIntensity: createProfanityIntensity,
      level: level || saved.level,
      playMode: 'rehearsal',
      characterOpening: whoStarts === 'ai' ? saved.characterOpening : undefined,
      openingInstruction: whoStarts === 'ai' ? saved.openingInstruction : undefined,
    });
  };

  const handleSaveNew = async () => {
    if (!generated || !editTitle.trim()) return;
    setSaveLoading(true);
    setSaveError(null);
    try {
      const title = editTitle.trim();
      const existingId = savedScenarioIdRef.current;
      const payload: Record<string, unknown> = {
        ...generated.payload,
        settingRu: place.trim() || generated.payload.settingRu,
        yourRoleRu: userRole.trim() || generated.payload.yourRoleRu,
        goalRu: goalStructured.trim() || generated.payload.goalRu,
        scenarioTextRu: prompt.trim() || generated.payload.scenarioTextRu,
      };
      if (existingId) {
        payload.slangMode = createSlangMode;
        payload.allowProfanity = createAllowProfanity;
        payload.aiMayUseProfanity = createAllowProfanity ? createAiMayUseProfanity : false;
        payload.profanityIntensity = createProfanityIntensity;
        if (whoStarts === 'user') {
          payload.characterOpening = '';
          payload.openingInstruction = '';
        }
      }
      const created = existingId
        ? await updateUserScenario(existingId, {
          title,
          level: level || generated.level,
          payload,
        })
        : await createUserScenario({
          title,
          level: level || generated.level,
          payload,
        });
      savedScenarioIdRef.current = created.id;
      setReadyScenario(created);
      loadList();
      if (practiceWords?.listId && created.id) {
        await bindPracticeList(practiceWords.listId, {
          kind: 'scenario',
          ref: created.id,
          origin: 'user',
          label: created.title || title,
        }).catch(() => { /* сцена уже сохранена */ });
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaveLoading(false);
    }
  };

  const handlePlay = (s: UserScenario) => {
    fillFromScenario(s);
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

  const startEdit = (s: UserScenario) => {
    setCardMenuOpenId(null);
    setBriefingScenario(null);
    setReadyScenario(null);
    setSaveError(null);
    setEditId(s.id);
    savedScenarioIdRef.current = s.id;
    setView('create');
    setEditTitle(s.title || '');
    setLevel(s.level);
    setPlace(s.settingRu || s.setting || '');
    setUserRole(s.yourRoleRu || s.yourRole || '');
    setGoalStructured(s.goalRu || s.goal || '');
    setPrompt(s.scenarioTextRu || s.scenarioText || s.description || '');
    setTopic(s.title || '');
    setCreateSlangMode((s.slangMode as SlangMode) || 'light');
    setCreateAllowProfanity(Boolean(s.allowProfanity));
    setCreateAiMayUseProfanity(Boolean(s.aiMayUseProfanity));
    setCreateProfanityIntensity((s.profanityIntensity as ProfanityIntensity) || 'light');
    setGenerated({
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
    setCreateStep(1);
    setWhoStarts(s.characterOpening?.trim() ? 'ai' : 'user');
  };

  const resetCreateDraft = () => {
    setEditId(null);
    savedScenarioIdRef.current = null;
    setGenerated(null);
    setReadyScenario(null);
    setEditTitle('');
    setPrompt(seedPrompt || '');
    setTopic('');
    setPlace('');
    setUserRole('');
    setGoalStructured('');
    setLevel(null);
    setCreateStep(1);
    setWhoStarts('ai');
    setSaveError(null);
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

  const renderCreateForm = () => {
  const shownStep: 1 | 2 | 3 = !generated ? 1 : createStep;
  const rawSteps = Array.isArray(generated?.payload.steps)
    ? (generated.payload.steps as { id?: string; titleRu?: string; titleEn?: string }[])
    : [];
  const firstLine = typeof generated?.payload.suggestedFirstLine === 'string' ? generated.payload.suggestedFirstLine.trim() : '';
  const situationText = (typeof generated?.payload.scenarioTextRu === 'string' && generated.payload.scenarioTextRu.trim())
    ? generated.payload.scenarioTextRu
    : prompt.trim();
  const tipsRaw = typeof generated?.payload.maxScoreTipsRu === 'string' ? generated.payload.maxScoreTipsRu.trim() : '';
  const tipItems = tipsRaw
    ? (tipsRaw.split(/\s*(?:\d+[.)]\s+)/).map((item) => item.trim()).filter(Boolean).length > 1
      ? tipsRaw.split(/\s*(?:\d+[.)]\s+)/).map((item) => item.trim()).filter(Boolean)
      : tipsRaw.split(/\n+/).map((item) => item.trim()).filter(Boolean))
    : [];
  const roleText = userRole.trim();
  const youCaption = roleText && roleText.length <= 28 && !roleText.includes(':') ? roleText : 'Ваша роль';
  const roleNote = roleText && roleText !== youCaption ? roleText : '';
  const partnerName = 'Собеседник';
  const visibleSteps = rawSteps.filter((step) => step.titleRu?.trim());
  const stepPhrases = (step: { titleRu?: string; titleEn?: string }, index: number) => {
    const phrases: { en: string; ru?: string }[] = [];
    if (index === 0 && firstLine) phrases.push({ en: firstLine });
    const english = step.titleEn?.trim() || '';
    if (english && english !== step.titleRu?.trim() && english !== firstLine) phrases.push({ en: english });
    return phrases;
  };
  const stepNames = ['Ситуация', 'Цель и шаги', 'Название'] as const;
  const primaryLabel = shownStep === 1
    ? 'Дальше: цель и шаги'
    : shownStep === 2
      ? 'Дальше: название и сохранение'
      : readyScenario ? 'Начать диалог' : saveLoading ? 'Сохранение…' : 'Сохранить сценарий';

  const goStep = (num: 1 | 2 | 3) => {
    if (num === 1) {
      setCreateStep(1);
      return;
    }
    if (!level) {
      askForLevel();
      return;
    }
    if (!generated) {
      handleContinue();
      return;
    }
    setCreateStep(num);
  };

  const aiBtn = (field: UserScenarioField, label: string, text?: string) => (
    <FieldAiButton
      iconOnly={!text}
      text={text}
      label={label}
      busy={fieldBusy === field}
      disabled={Boolean(fieldBusy) || generateLoading}
      onClick={() => handleFieldRegen(field)}
    />
  );

  return (
    <div className={createStyles.shell}>
      <header className={createStyles.top}>
        <h2>{editId ? 'Редактирование' : 'Подготовка сцены'}</h2>
        <div className={createStyles.seg} role="group" aria-label="Раздел">
          <button type="button" aria-pressed="true" onClick={() => { if (editId) resetCreateDraft(); setView('create'); }}>Создать</button>
          <button type="button" aria-pressed="false" onClick={() => { setView('my'); loadList(); }}>Мои сценарии</button>
        </div>
        <button type="button" className={createStyles.x} onClick={onClose} aria-label="Закрыть">✕</button>
      </header>
      <ol className={createStyles.stepper}>
        {stepNames.map((name, index) => {
          const num = (index + 1) as 1 | 2 | 3;
          const state = shownStep === num ? createStyles.on : shownStep > num ? createStyles.done : '';
          return (
            <li key={name} className={state}>
              <button type="button" onClick={() => goStep(num)} aria-current={shownStep === num ? 'step' : undefined}>
                <span className={createStyles.dot}>{shownStep > num ? '✓' : num}</span>
                <span className={createStyles.lbl}>{name}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className={createStyles.track} aria-hidden="true"><i style={{ width: `${(shownStep / 3) * 100}%` }} /></div>
      <div className={createStyles.body}>
        <div className={createStyles.form}>
          {shownStep === 1 && (
            <>
              <h3>О чём будет сцена</h3>
              <p className={createStyles.sub}>Опишите ситуацию своими словами и ИИ соберёт сцену. Или заполните поля вручную.</p>
              <div className={createStyles.hero}>
                <textarea className={createStyles.field} rows={3} value={prompt} onChange={(e) => { const value = e.target.value; setPrompt(value); if (generated) patchGeneratedPayload({ scenarioTextRu: value }); }} aria-label="Описание ситуации" placeholder="Диалог в кафе — заказать кофе и десерт, уточнить счёт" />
                <div className={createStyles.heroFoot}>
                  <small>Поля ниже заполнятся автоматически</small>
                  <button type="button" className={createStyles.assemble} onClick={handleGenerate} disabled={generateLoading || Boolean(fieldBusy)}>
                    {generateLoading ? 'Собираю…' : 'Собрать сцену'}
                  </button>
                </div>
              </div>
              <div className={createStyles.row2}>
                <label className={createStyles.fld}>
                  <span>Тема</span>
                  <div className={createStyles.inp}>
                    <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="кафе, такси" style={fieldFlashStyle(flashField === 'topic')} />
                    {aiBtn('topic', 'Другая тема')}
                  </div>
                </label>
                <label className={createStyles.fld}>
                  <span>Место</span>
                  <div className={createStyles.inp}>
                    <input value={place} onChange={(e) => { setPlace(e.target.value); if (generated) patchGeneratedPayload({ settingRu: e.target.value }); }} placeholder="аэропорт, офис" style={fieldFlashStyle(flashField === 'place')} />
                    {aiBtn('place', 'Другое место')}
                  </div>
                </label>
              </div>
              <label className={createStyles.fld}>
                <span>Ваша роль</span>
                <div className={createStyles.inp}>
                  <input value={userRole} onChange={(e) => { setUserRole(e.target.value); if (generated) patchGeneratedPayload({ yourRoleRu: e.target.value }); }} placeholder="клиент, пассажир" style={fieldFlashStyle(flashField === 'role')} />
                  {aiBtn('role', 'Другая роль')}
                </div>
              </label>
              <div className={createStyles.grp} role="group" aria-label="Уровень">
                <span>Уровень</span>
                <div className={createStyles.levels}>
                  {LEVELS.map((item) => (
                    <button key={item.value} type="button" aria-pressed={level === item.value} onClick={() => setLevel(item.value)}>{item.label}</button>
                  ))}
                </div>
                <p className={createStyles.note}>От уровня зависят сложность реплик и подбор слов. В диалоге ИИ подстраивается под вашу речь.</p>
              </div>
              {generateError && <p className={createStyles.err}>{generateError}</p>}
            </>
          )}

          {shownStep === 2 && generated && (
            <>
              <h3>Цель и шаги</h3>
              <p className={createStyles.sub}>Цель — что вы хотите получить от разговора. Шаги — по каким точкам пройдёт диалог.</p>
              <label className={createStyles.fld}>
                <span>Цель диалога</span>
                <div className={createStyles.inp}>
                <textarea
                  className={createStyles.field}
                  rows={3}
                  value={goalStructured}
                  onChange={(e) => {
                    const value = e.target.value;
                    setGoalStructured(value);
                    const manual = generated.payload.manual === true;
                    patchGeneratedPayload({
                      goalRu: value,
                      goal: value,
                      ...(manual ? { systemPrompt: composeManualSystemPrompt(value) } : {}),
                    });
                  }}
                  style={fieldFlashStyle(flashField === 'goal')}
                />
                {aiBtn('goal', 'Другая цель')}
                </div>
              </label>
              <div className={createStyles.grp}>
                <span>Шаги по порядку {aiBtn('steps', 'Другие шаги', 'Другие шаги')}</span>
                {rawSteps.map((step, index) => (
                  <div key={step.id || index} className={createStyles.stepRow}>
                    <input
                      className={createStyles.plain}
                      value={step.titleRu || ''}
                      aria-label={`Шаг ${index + 1}`}
                      placeholder={`Шаг ${index + 1}`}
                      onChange={(e) => {
                        const next = rawSteps.map((item, i) => (i === index ? { ...item, titleRu: e.target.value } : item));
                        patchGeneratedPayload({ steps: next });
                      }}
                    />
                    <button
                      type="button"
                      aria-label={`Убрать шаг ${index + 1}`}
                      onClick={() => {
                        const next = rawSteps.filter((_, i) => i !== index);
                        patchGeneratedPayload({ steps: next.length ? next : [{ id: 'step1', order: 1, titleRu: '', titleEn: '' }] });
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className={createStyles.ghost}
                  onClick={() => {
                    patchGeneratedPayload({
                      steps: [...rawSteps, { id: `step${rawSteps.length + 1}`, order: rawSteps.length + 1, titleRu: '', titleEn: '' }],
                    });
                  }}
                >
                  Добавить шаг
                </button>
                <p className={createStyles.note}>Значок меняет только это поле. Поля можно править, пока диалог не начат.</p>
              </div>
            </>
          )}

          {shownStep === 3 && generated && (
            <>
              <h3>Название и слова</h3>
              <p className={createStyles.sub}>Сценарий появится в «Моих сценариях». Слова из списка сохранятся в ваш словарь.</p>
              <label className={createStyles.fld}>
                <span>Название сценария</span>
                <input className={createStyles.plain} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Например: Заказ в кафе" />
              </label>
              <div className={createStyles.grp} role="group" aria-label="Кто начинает">
                <span>Кто начинает</span>
                <div className={createStyles.levels}>
                  <button type="button" aria-pressed={whoStarts === 'ai'} onClick={() => setWhoStarts('ai')}>ИИ начинает</button>
                  <button type="button" aria-pressed={whoStarts === 'user'} onClick={() => setWhoStarts('user')}>Я начну</button>
                </div>
                <p className={createStyles.note}>
                  {whoStarts === 'ai' ? 'Собеседник говорит первым.' : 'Вы подходите и говорите первым.'}
                </p>
              </div>
              {practiceWords && (
                <PracticeWordsInSheet
                  {...practiceWords}
                  listContext={buildRoleplayPracticeContext({
                    id: draftListRef.current,
                    title: editTitle.trim() || 'Новый сценарий',
                    goalRu: typeof generated.payload.goalRu === 'string' ? generated.payload.goalRu : null,
                    goal: typeof generated.payload.goal === 'string' ? generated.payload.goal : null,
                    settingRu: typeof generated.payload.settingRu === 'string' ? generated.payload.settingRu : null,
                    scenarioTextRu: typeof generated.payload.scenarioTextRu === 'string' ? generated.payload.scenarioTextRu : null,
                    yourRoleRu: typeof generated.payload.yourRoleRu === 'string' ? generated.payload.yourRoleRu : null,
                    steps: rawSteps,
                  })}
                  toolsMode="scene"
                  title="Слова под этот сценарий"
                  subtitle="ИИ соберёт около 20 слов под название, цель и шаги. Список сохранится в словарь."
                />
              )}
              {saveError && <p className={createStyles.err}>{saveError}</p>}
            </>
          )}
          <LevelRequiredNotice open={levelNotice} message="Сначала выберите уровень" />
        </div>
        <aside className={createStyles.side} aria-label="Бриф сцены">
          <article className={createStyles.brief}>
            <header className={createStyles.bHead}>
              <div className={createStyles.bChips}>
                <span className={`${createStyles.bChip} ${createStyles.bLv}`}>{level || 'Уровень'}</span>
                {place.trim() && (
                  <span className={createStyles.bChip}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10z"/><circle cx="12" cy="11" r="2"/></svg>
                    {place.trim()}
                  </span>
                )}
              </div>
              <h3 className={createStyles.bTitle}>{editTitle.trim() || topic.trim() || 'Без названия'}</h3>
              <p className={createStyles.bSit}>{situationText || 'Опишите ситуацию своими словами.'}</p>
              <div className={createStyles.bWho}>
                <div className={createStyles.bPerson}>
                  <span className={`${createStyles.bAv} ${createStyles.bMe}`}>В</span>
                  <span><b>Вы</b><small>{youCaption}</small></span>
                </div>
                <span className={createStyles.bSwap} aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 8h12l-3-3M17 16H5l3 3"/></svg>
                </span>
                <div className={`${createStyles.bPerson} ${createStyles.bPersonOther}`}>
                  <span className={`${createStyles.bAv} ${createStyles.bOther}`}>{partnerName.charAt(0)}</span>
                  <span><b>{partnerName}</b><small>{partnerName === 'Собеседник' ? 'Персонаж' : 'Собеседник'}</small></span>
                </div>
              </div>
              {roleNote && <p className={createStyles.bNote}>{roleNote}</p>}
            </header>
            <section className={createStyles.bGoal}>
              <h4 className={createStyles.bH}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>
                Цель сцены
              </h4>
              <p>{goalStructured.trim() || 'Цель появится на следующем шаге'}</p>
            </section>
            {visibleSteps.length > 0 && (
              <section className={createStyles.bSec}>
                <h4 className={createStyles.bH}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></svg>
                  Шаги · {visibleSteps.length}
                </h4>
                <ol className={createStyles.bSteps}>
                  {visibleSteps.map((step, index) => {
                    const phrases = stepPhrases(step, index);
                    return (
                      <li key={step.id || index}>
                        {phrases.length > 0 ? (
                          <details name="brief-step" open={index === 0}>
                            <summary>
                              <span className={createStyles.bNum}>{index + 1}</span>
                              <span className={createStyles.bStepText}>{step.titleRu}</span>
                              <span className={createStyles.bHint}>
                                Как сказать
                                <svg className={createStyles.bChev} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M6 9l6 6 6-6"/></svg>
                              </span>
                            </summary>
                            <div className={createStyles.bPhrases}>
                              {phrases.map((phrase) => (
                                <div key={phrase.en} className={createStyles.bPhrase}>
                                  <b>{phrase.en}</b>
                                  {phrase.ru && <small>{phrase.ru}</small>}
                                </div>
                              ))}
                            </div>
                          </details>
                        ) : (
                          <span className={createStyles.bPlain}>
                            <span className={createStyles.bNum}>{index + 1}</span>
                            {step.titleRu}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}
            {(tipItems.length > 0 || visibleSteps.length > 0) && (
              <footer className={createStyles.bScore}>
                <h4 className={createStyles.bH}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8L3.5 9.7l5.9-.9z"/></svg>
                  Как набрать максимум баллов
                </h4>
                {visibleSteps.length > 0 && (
                  <div className={createStyles.bPips} aria-hidden>
                    {visibleSteps.map((step, index) => <i key={step.id || index} />)}
                  </div>
                )}
                {tipItems.length > 0 && (
                  <ul className={createStyles.bTips}>
                    {tipItems.map((tip) => (
                      <li key={tip}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </footer>
            )}
          </article>
        </aside>
      </div>
      <footer className={createStyles.actions}>
        <button
          type="button"
          className={createStyles.btn}
          onClick={() => {
            if (shownStep === 1) {
              if (editId) {
                resetCreateDraft();
                setView('my');
              } else {
                onClose();
              }
            } else setCreateStep((shownStep - 1) as 1 | 2);
          }}
        >
          Назад
        </button>
        {shownStep === 3 && (
          <button
            type="button"
            className={createStyles.btn}
            onClick={() => {
              const wasEditing = Boolean(editId);
              resetCreateDraft();
              if (wasEditing) setView('my');
            }}
          >
            Отмена
          </button>
        )}
        <button
          type="button"
          className={createStyles.primary}
          disabled={saveLoading || generateLoading}
          onClick={() => {
            if (shownStep === 1) handleContinue();
            else if (shownStep === 2) setCreateStep(3);
            else if (readyScenario) beginPrepared(readyScenario);
            else handleSaveNew();
          }}
        >
          {primaryLabel}
        </button>
      </footer>
    </div>
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
      <div className={createStyles.shell}>
        <header className={createStyles.top}>
          <h2>Мои сценарии</h2>
          <div className={createStyles.seg} role="group" aria-label="Раздел">
            <button type="button" aria-pressed="false" onClick={() => { resetCreateDraft(); setView('create'); }}>Создать</button>
            <button type="button" aria-pressed="true">Мои сценарии</button>
          </div>
          <button type="button" className={createStyles.x} onClick={onClose} aria-label="Закрыть">✕</button>
        </header>
        <div style={{ padding: '16px 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', overflow: 'auto', minHeight: 0, flex: 1 }}>
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
      </div>
    );
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Личные сценарии" style={modalOverlayStyle} onClick={onClose}>
      <div style={{ ...modalPanelStyle, maxWidth: view === 'my' ? 960 : 1120, height: 'min(860px, calc(100vh - 48px))', maxHeight: '94vh' }} onClick={(e) => e.stopPropagation()}>
        {view === 'create' && renderCreateForm()}
        {view === 'my' && renderMyList()}
      </div>
    </div>
  );
}
