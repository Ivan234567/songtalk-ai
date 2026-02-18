'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  getRoleplayScenariosGroupedByTheme,
  ROLEPLAY_CATEGORY_COLORS,
  type RoleplayScenario,
} from '@/lib/roleplay';
import { createUserScenario, type UserScenarioLevel } from '@/lib/user-scenarios';

/** Значение фильтра сложности в модалке сценариев */
type DifficultyFilter = 'all' | 'easy' | 'medium' | 'hard';
type SlangMode = 'off' | 'light' | 'heavy';
type ProfanityIntensity = 'light' | 'medium' | 'hard';

const DIFFICULTY_FILTER_OPTIONS: { value: DifficultyFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'easy', label: 'Лёгкие' },
  { value: 'medium', label: 'Средние' },
  { value: 'hard', label: 'Сложные' },
];

const DIFFICULTY_BADGE: Record<'easy' | 'medium' | 'hard', string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

const SLANG_LABELS: Record<SlangMode, string> = {
  off: 'Без сленга',
  light: 'Лёгкий сленг',
  heavy: 'Живой сленг',
};

const PROFANITY_INTENSITY_LABELS: Record<ProfanityIntensity, string> = {
  light: 'Light',
  medium: 'Medium',
  hard: 'Hard',
};

function getScenarioStyleBadges(
  scenario: Pick<RoleplayScenario, 'slangMode' | 'allowProfanity' | 'aiMayUseProfanity' | 'profanityIntensity'>
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
      label: `18+ мат: ${PROFANITY_INTENSITY_LABELS[intensity]}`,
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

type AgentMode = 'chat' | 'roleplay' | 'debate';

export type DebateView = 'catalog' | 'create' | 'my';

export type RoleplayModeUIProps = {
  mode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  selectedScenario: RoleplayScenario | null;
  onSelectScenario: (scenario: RoleplayScenario) => void;
  onClearScenario: () => void;
  /** Для панели в углу: открыт ли модал выбора сценария */
  scenarioModalOpen?: boolean;
  onScenarioModalOpenChange?: (open: boolean) => void;
  /** Рендер: "bar" — компактная полоска (режим + кнопка сценария), "hint" — под орбом (чип + подсказка) */
  placement: 'bar' | 'hint';
  /** Текущий экран модалки: каталог, создание с ИИ или мои сценарии */
  scenarioView?: 'catalog' | 'create' | 'my';
  /** Сменить экран модалки (при открытии выбора из выпадающего меню) */
  onScenarioViewChange?: (view: 'catalog' | 'create' | 'my') => void;
  /** После копирования системного сценария в «Мои»: переключить на «Мои» и выделить новый сценарий */
  onCopyToMineSuccess?: (newScenarioId: string) => void;
  /** Открыт ли модал настройки дебата */
  debateSetupOpen?: boolean;
  onDebateSetupOpenChange?: (open: boolean) => void;
  /** Текущий экран дебатной модалки */
  debateView?: DebateView;
  onDebateViewChange?: (view: DebateView) => void;
};

/** Иконки для вкладок режима в bar */
const MODE_ICONS = {
  chat: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  roleplay: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  debate: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M8 10h.01" />
      <path d="M12 10h.01" />
      <path d="M16 10h.01" />
      <path d="M8 14h.01" />
      <path d="M12 14h.01" />
      <path d="M16 14h.01" />
    </svg>
  ),
};

/** Иконки тем сценариев (Заказ такси, Бронирование отеля) */
const THEME_ICONS: Record<string, React.ReactNode> = {
  taxi: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 17h14v-4H5v4z" />
      <path d="M7 13h10" />
      <circle cx="7.5" cy="17" r="1.5" />
      <circle cx="16.5" cy="17" r="1.5" />
    </svg>
  ),
  hotel: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 21V7l8-5 8 5v14H4z" />
      <path d="M12 12v9" />
    </svg>
  ),
  supermarket: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  ),
  clothes: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
    </svg>
  ),
  restaurant: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h0" />
      <path d="M21 15v7" />
    </svg>
  ),
  coffee: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
      <line x1="6" y1="1" x2="6" y2="4" />
      <line x1="10" y1="1" x2="10" y2="4" />
      <line x1="14" y1="1" x2="14" y2="4" />
    </svg>
  ),
  apartment: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 21V7l8-5 8 5v14H4z" />
      <path d="M9 21v-6h6v6" />
      <path d="M9 10h.01" />
      <path d="M15 10h.01" />
    </svg>
  ),
  friend: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  salon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9V3l6 6 6-6v6" />
      <path d="M6 15l6 6 6-6" />
    </svg>
  ),
  pharmacy: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2v20M2 12h20" />
    </svg>
  ),
  flowers: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="2" />
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="M2 12h4" />
      <path d="M18 12h4" />
      <path d="M5 5l3 3" />
      <path d="M16 16l3 3" />
      <path d="M5 19l3-3" />
      <path d="M16 8l3-3" />
    </svg>
  ),
  cake: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2v3" />
      <path d="M9 6h6" />
      <path d="M4 10h16v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8z" />
      <path d="M4 14h16" />
    </svg>
  ),
  drycleaning: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 7h12" />
      <path d="M9 7l3 3 3-3" />
      <path d="M5 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2" />
      <path d="M6 12h12v7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-7z" />
    </svg>
  ),
  postoffice: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7h18v10H3V7z" />
      <path d="M3 7l9 6 9-6" />
      <path d="M3 17l6-5" />
      <path d="M21 17l-6-5" />
    </svg>
  ),
  lunch: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 3v8a2 2 0 0 0 2 2h1v8" />
      <path d="M8 3v8" />
      <path d="M12 3v18" />
      <path d="M18 3v18" />
    </svg>
  ),
  anniversary: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 21v-6a4 4 0 0 1 8 0v6" />
      <path d="M4 9l8-5 8 5" />
      <path d="M6 10h12" />
    </svg>
  ),
  dietary: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  ),
  datenight: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
  doctor: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  train: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="4" width="20" height="10" rx="1" />
      <path d="M8 4V2" />
      <path d="M16 4V2" />
      <path d="M6 14v4" />
      <path d="M10 14v4" />
      <path d="M14 14v4" />
      <path d="M18 14v4" />
      <path d="M6 18h12" />
    </svg>
  ),
  travel: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  conflict: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      <path d="M8 12h8" />
      <path d="M8 16h8" />
    </svg>
  ),
  party: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5.8 11.3L2 22l10.7-3.79" />
      <path d="M4 3l.7 2.9" />
      <path d="M12 3l.7 2.9" />
      <path d="M20 3l.7 2.9" />
      <path d="M4 3h16" />
      <path d="M12 22V9" />
      <path d="M9 22V9" />
      <path d="M15 22V9" />
    </svg>
  ),
  police: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22v-4" />
      <path d="M12 18H9a3 3 0 0 1 0-6h6a3 3 0 0 1 0 6h-3" />
      <path d="M12 2v4" />
      <path d="M4 6h16" />
      <path d="M6 2v4" />
      <path d="M18 2v4" />
    </svg>
  ),
  petshop: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  luggage: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-2" />
      <path d="M6 2h12v16H6V2z" />
      <path d="M9 6v4" />
      <path d="M15 6v4" />
    </svg>
  ),
  carrental: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 17h14v-5H5v5z" />
      <path d="M5 12V7l5.5-4 7 4v5" />
      <circle cx="7.5" cy="17" r="1.5" />
      <circle cx="16.5" cy="17" r="1.5" />
    </svg>
  ),
  vet: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="7" cy="7" r="1.5" />
      <circle cx="12" cy="6" r="1.5" />
      <circle cx="17" cy="7" r="1.5" />
      <path d="M6.5 13a5.5 5.5 0 0 0 11 0c0-2.5-2.5-3.5-5.5-3.5S6.5 10.5 6.5 13z" />
    </svg>
  ),
  mechanic: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 7l-5 5" />
      <path d="M7.5 7.5a2.5 2.5 0 1 0 3.5 3.5" />
      <path d="M16.5 16.5a2.5 2.5 0 1 0 3.5 3.5L18 22l-2-2" />
    </svg>
  ),
};

/** Иконки для выпадающего меню Debates */
const DEBATE_MENU_ICONS = {
  catalog: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  create: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  ),
  my: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  ),
};

/** Иконки для выпадающего меню Roleplays */
const ROLEPLAY_MENU_ICONS = {
  catalog: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  create: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  ),
  my: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  ),
};

const barStyles = {
  wrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexWrap: 'wrap' as const,
  },
  segment: {
    display: 'inline-flex',
    padding: 4,
    borderRadius: 14,
    background: 'var(--sidebar-hover)',
    border: '1px solid var(--sidebar-border)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.04)',
  },
  tab: (active: boolean) => ({
    padding: '0.5rem 0.875rem',
    borderRadius: 10,
    border: 'none' as const,
    background: active ? 'var(--sidebar-active)' : 'transparent',
    color: 'var(--sidebar-text)',
    fontSize: '0.8125rem',
    fontWeight: 500,
    cursor: 'pointer' as const,
    transition: 'background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '0.4rem',
    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
  }),
};

export function RoleplayModeUI({
  mode,
  onModeChange,
  selectedScenario,
  onSelectScenario,
  onClearScenario,
  scenarioModalOpen = false,
  onScenarioModalOpenChange,
  placement,
  scenarioView = 'catalog',
  onScenarioViewChange,
  onCopyToMineSuccess,
  debateSetupOpen = false,
  onDebateSetupOpenChange,
  debateView = 'catalog',
  onDebateViewChange,
}: RoleplayModeUIProps) {
  const [hintVisible, setHintVisible] = useState(false);
  const [roleplayDropdownOpen, setRoleplayDropdownOpen] = useState(false);
  const [debateDropdownOpen, setDebateDropdownOpen] = useState(false);

  if (placement === 'bar') {
    const openRoleplayWithView = (view: 'catalog' | 'create' | 'my') => {
      onModeChange('roleplay');
      onScenarioViewChange?.(view);
      onScenarioModalOpenChange?.(true);
      setRoleplayDropdownOpen(false);
    };
    const openDebateWithView = (view: DebateView) => {
      onModeChange('debate');
      onDebateViewChange?.(view);
      onDebateSetupOpenChange?.(true);
      setDebateDropdownOpen(false);
    };
    return (
      <>
        <div style={barStyles.wrap}>
          <div role="tablist" aria-label="Режим агента" style={barStyles.segment} className="agent-mode-segment">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'chat'}
              onClick={() => onModeChange('chat')}
              style={barStyles.tab(mode === 'chat')}
              className="agent-mode-tab"
            >
              <span style={{ opacity: mode === 'chat' ? 1 : 0.75, display: 'flex' }}>{MODE_ICONS.chat}</span>
              <span>Freestyle Mode</span>
            </button>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'roleplay'}
                aria-expanded={roleplayDropdownOpen}
                aria-haspopup="menu"
                onClick={() => (roleplayDropdownOpen ? setRoleplayDropdownOpen(false) : setRoleplayDropdownOpen(true))}
                style={{
                  ...barStyles.tab(mode === 'roleplay'),
                  maxWidth: mode === 'roleplay' && selectedScenario ? 220 : undefined,
                }}
                className="agent-mode-tab"
                title={mode === 'roleplay' && selectedScenario ? 'Сменить сценарий' : 'Ролевой режим — каталог, создать или мои сценарии'}
              >
                <span style={{ opacity: mode === 'roleplay' ? 1 : 0.75, display: 'flex', flexShrink: 0 }}>{MODE_ICONS.roleplay}</span>
                <span style={{ whiteSpace: 'nowrap' }}>Roleplays</span>
                {mode === 'roleplay' && selectedScenario ? (
                  <>
                    <span style={{ opacity: 0.6, fontSize: '0.75rem' }}>·</span>
                    <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.95 }}>
                      {selectedScenario.title}
                    </span>
                  </>
                ) : null}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7, transform: roleplayDropdownOpen ? 'rotate(180deg)' : 'none' }} aria-hidden>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {roleplayDropdownOpen && (
                <>
                  <div role="presentation" className="roleplay-dropdown-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setRoleplayDropdownOpen(false)} />
                  <div
                    role="menu"
                    aria-label="Меню Roleplays"
                    className="roleplay-dropdown-panel"
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      left: 'auto',
                      marginTop: 6,
                      minWidth: 240,
                      padding: 6,
                      borderRadius: 14,
                      background: 'var(--sidebar-bg)',
                      border: '1px solid var(--sidebar-border)',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.08), 0 10px 20px -4px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.02)',
                      zIndex: 1000,
                    }}
                  >
                    <div className="roleplay-dropdown-header" style={{ padding: '6px 10px 8px', marginBottom: 2, borderBottom: '1px solid var(--sidebar-border)' }}>
                      <span style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sidebar-text)', opacity: 0.7 }}>
                        Сценарии
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <button
                        type="button"
                        role="menuitem"
                        className="roleplay-dropdown-item"
                        onClick={() => openRoleplayWithView('catalog')}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--sidebar-text)', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s ease, color 0.15s ease' }}
                      >
                        <span style={{ display: 'flex', color: 'var(--sidebar-text)', opacity: 0.85 }}>{ROLEPLAY_MENU_ICONS.catalog}</span>
                        <span>Каталог сценариев</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="roleplay-dropdown-item"
                        onClick={() => openRoleplayWithView('create')}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--sidebar-text)', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s ease, color 0.15s ease' }}
                      >
                        <span style={{ display: 'flex', color: 'var(--sidebar-text)', opacity: 0.85 }}>{ROLEPLAY_MENU_ICONS.create}</span>
                        <span>Создать сценарий</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="roleplay-dropdown-item"
                        onClick={() => openRoleplayWithView('my')}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--sidebar-text)', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s ease, color 0.15s ease' }}
                      >
                        <span style={{ display: 'flex', color: 'var(--sidebar-text)', opacity: 0.85 }}>{ROLEPLAY_MENU_ICONS.my}</span>
                        <span>Мои сценарии</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'debate'}
                aria-expanded={debateDropdownOpen}
                aria-haspopup="menu"
                onClick={() => (debateDropdownOpen ? setDebateDropdownOpen(false) : setDebateDropdownOpen(true))}
                style={barStyles.tab(mode === 'debate')}
                className="agent-mode-tab"
                title="Дебаты — каталог, создать или мои темы"
              >
                <span style={{ opacity: mode === 'debate' ? 1 : 0.75, display: 'flex', flexShrink: 0 }}>{MODE_ICONS.debate}</span>
                <span style={{ whiteSpace: 'nowrap' }}>Дебаты</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7, transform: debateDropdownOpen ? 'rotate(180deg)' : 'none' }} aria-hidden>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {debateDropdownOpen && (
                <>
                  <div role="presentation" className="roleplay-dropdown-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setDebateDropdownOpen(false)} />
                  <div
                    role="menu"
                    aria-label="Меню Дебатов"
                    className="roleplay-dropdown-panel"
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      left: 'auto',
                      marginTop: 6,
                      minWidth: 240,
                      padding: 6,
                      borderRadius: 14,
                      background: 'var(--sidebar-bg)',
                      border: '1px solid var(--sidebar-border)',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.08), 0 10px 20px -4px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.02)',
                      zIndex: 1000,
                    }}
                  >
                    <div className="roleplay-dropdown-header" style={{ padding: '6px 10px 8px', marginBottom: 2, borderBottom: '1px solid var(--sidebar-border)' }}>
                      <span style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sidebar-text)', opacity: 0.7 }}>
                        Дебаты
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <button
                        type="button"
                        role="menuitem"
                        className="roleplay-dropdown-item"
                        onClick={() => openDebateWithView('catalog')}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--sidebar-text)', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s ease, color 0.15s ease' }}
                      >
                        <span style={{ display: 'flex', color: 'var(--sidebar-text)', opacity: 0.85 }}>{DEBATE_MENU_ICONS.catalog}</span>
                        <span>Каталог дебатов</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="roleplay-dropdown-item"
                        onClick={() => openDebateWithView('create')}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--sidebar-text)', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s ease, color 0.15s ease' }}
                      >
                        <span style={{ display: 'flex', color: 'var(--sidebar-text)', opacity: 0.85 }}>{DEBATE_MENU_ICONS.create}</span>
                        <span>Создать тему дебата</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="roleplay-dropdown-item"
                        onClick={() => openDebateWithView('my')}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--sidebar-text)', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s ease, color 0.15s ease' }}
                      >
                        <span style={{ display: 'flex', color: 'var(--sidebar-text)', opacity: 0.85 }}>{DEBATE_MENU_ICONS.my}</span>
                        <span>Мои дебаты</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        {scenarioModalOpen && onScenarioModalOpenChange && scenarioView === 'catalog' && (
          <ScenarioModal
            onSelect={(s) => {
              onSelectScenario(s);
              onScenarioModalOpenChange(false);
            }}
            onClose={() => onScenarioModalOpenChange(false)}
            onScenarioViewChange={onScenarioViewChange}
            onCopyToMineSuccess={onCopyToMineSuccess}
          />
        )}
      </>
    );
  }

  // placement === 'hint': под орбом, в стиле учебного задания
  if (!selectedScenario) return null;
  const hasGoal = Boolean(selectedScenario.goalRu);
  const hasFirstLine = Boolean(selectedScenario.suggestedFirstLine);
  const hintBtnStyle = {
    padding: '0.4rem 0.75rem',
    borderRadius: 10,
    border: '1px solid rgba(99, 102, 241, 0.35)',
    background: 'rgba(99, 102, 241, 0.1)',
    color: 'var(--sidebar-text)',
    fontSize: '0.8125rem',
    fontWeight: 500,
    cursor: 'pointer' as const,
    opacity: 0.95,
    transition: 'background 0.2s ease, border-color 0.2s ease, opacity 0.2s ease',
  };
  const hintBtnHover = (e: React.MouseEvent<HTMLButtonElement>, over: boolean) => {
    e.currentTarget.style.background = over ? 'rgba(99, 102, 241, 0.18)' : 'rgba(99, 102, 241, 0.1)';
    e.currentTarget.style.borderColor = over ? 'rgba(99, 102, 241, 0.5)' : 'rgba(99, 102, 241, 0.35)';
    e.currentTarget.style.opacity = over ? '1' : '0.95';
  };
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: '0.75rem',
        width: '100%',
        maxWidth: 420,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <span
          style={{
            fontSize: '0.8125rem',
            color: 'var(--sidebar-text)',
            opacity: 0.85,
            padding: '0.35rem 0.6rem',
            borderRadius: 8,
            background: 'var(--sidebar-hover)',
            border: '1px solid var(--sidebar-border)',
          }}
        >
          {selectedScenario.title}
        </span>
        <button
          type="button"
          onClick={() => onScenarioModalOpenChange?.(true)}
          style={{
            padding: '0.4rem 0.75rem',
            borderRadius: 10,
            border: '1px solid var(--sidebar-border)',
            background: 'var(--sidebar-hover)',
            color: 'var(--sidebar-text)',
            fontSize: '0.8125rem',
            fontWeight: 500,
            cursor: 'pointer',
            opacity: 0.9,
            transition: 'background 0.2s ease, border-color 0.2s ease, opacity 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--sidebar-active)';
            e.currentTarget.style.opacity = '1';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--sidebar-hover)';
            e.currentTarget.style.opacity = '0.9';
          }}
        >
          Сменить
        </button>
        {(hasGoal || hasFirstLine) && (
          <button
            type="button"
            onClick={() => setHintVisible((v) => !v)}
            style={hintBtnStyle}
            onMouseEnter={(e) => hintBtnHover(e, true)}
            onMouseLeave={(e) => hintBtnHover(e, false)}
          >
            Цель задания
          </button>
        )}
      </div>
      {(hasGoal || hasFirstLine) && hintVisible && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.625rem',
            padding: '0.75rem 1rem',
            borderRadius: 12,
            background: 'rgba(99, 102, 241, 0.06)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
          }}
        >
          {hasGoal && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  color: 'var(--sidebar-text)',
                  opacity: 0.8,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Цель задания
              </span>
              <p style={{ margin: 0, fontSize: '0.8125rem', lineHeight: 1.45, color: 'var(--sidebar-text)', opacity: 0.95 }}>
                {selectedScenario.goalRu}
              </p>
            </div>
          )}
          {hasFirstLine && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  color: 'var(--sidebar-text)',
                  opacity: 0.8,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Стартовая фраза
              </span>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.875rem',
                  lineHeight: 1.45,
                  color: 'var(--sidebar-text)',
                  fontStyle: 'italic',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 8,
                  background: 'var(--sidebar-hover)',
                  border: '1px solid var(--sidebar-border)',
                  borderLeftWidth: 3,
                  borderLeftColor: 'rgba(99, 102, 241, 0.5)',
                }}
              >
                {selectedScenario.suggestedFirstLine}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Собрать payload для createUserScenario из системного сценария (без id) */
function scenarioToPayload(scenario: RoleplayScenario): Record<string, unknown> {
  const { id: _id, ...rest } = scenario;
  return rest as Record<string, unknown>;
}

/** Крупная карточка сценария: описание + как пользователь должен себя вести */
function ScenarioCard({
  scenario,
  onSelect,
  onSaveToMine,
  savingToMineId,
}: {
  scenario: RoleplayScenario;
  onSelect: () => void;
  onSaveToMine?: (s: RoleplayScenario) => void;
  savingToMineId?: string | null;
}) {
  const [hover, setHover] = useState(false);
  const colors = ROLEPLAY_CATEGORY_COLORS[scenario.category];
  const firstSuggestedLine = scenario.suggestedFirstLine;
  const shortInfo = scenario.description ?? (firstSuggestedLine ? `Начальная фраза: «${firstSuggestedLine}»` : null);
  const isSaving = savingToMineId === scenario.id;
  const styleBadges = getScenarioStyleBadges(scenario);
  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '0.625rem',
        width: '100%',
        padding: '1.25rem 1.5rem',
        borderRadius: 14,
        border: '1px solid var(--sidebar-border)',
        borderLeftWidth: 5,
        borderLeftColor: colors.bar,
        background: hover ? 'var(--sidebar-active)' : 'var(--sidebar-hover)',
        color: 'var(--sidebar-text)',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
        boxShadow: hover ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
        minHeight: 120,
      }}
    >
      <span style={{ display: 'block', fontSize: '1rem', fontWeight: 600, lineHeight: 1.3 }}>
        {scenario.title}
      </span>
      {shortInfo && (
        <span
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontSize: '0.875rem',
            opacity: 0.78,
            lineHeight: 1.4,
          }}
        >
          {shortInfo}
        </span>
      )}
      {(scenario.yourRoleRu ?? scenario.yourRole) && (
        <span
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontSize: '0.8125rem',
            opacity: 0.7,
            lineHeight: 1.35,
            fontStyle: 'italic',
          }}
        >
          Ваша роль: {scenario.yourRoleRu ?? scenario.yourRole}
        </span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 'auto', width: '100%', flexWrap: 'wrap' }}>
        {scenario.difficulty && (
          <span
            style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              padding: '0.2rem 0.5rem',
              borderRadius: 6,
              background: scenario.difficulty === 'easy' ? 'rgba(34, 197, 94, 0.15)' : scenario.difficulty === 'medium' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(239, 68, 68, 0.12)',
              color: scenario.difficulty === 'easy' ? 'rgb(22, 163, 74)' : scenario.difficulty === 'medium' ? 'rgb(202, 138, 4)' : 'rgb(185, 28, 28)',
              border: '1px solid transparent',
            }}
          >
            {DIFFICULTY_BADGE[scenario.difficulty]}
          </span>
        )}
        {scenario.language && (
          <span
            style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              opacity: 0.65,
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
            }}
          >
            {scenario.language}
          </span>
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
        <span style={{ marginLeft: 'auto', fontSize: '0.8125rem', fontWeight: 500, opacity: 0.85 }}>
          Выбрать →
        </span>
        {onSaveToMine && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSaveToMine(scenario);
            }}
            disabled={isSaving}
            aria-label="Сохранить в мои сценарии"
            style={{
              padding: '0.35rem 0.6rem',
              borderRadius: 8,
              border: '1px solid var(--sidebar-border)',
              background: 'var(--sidebar-bg)',
              color: 'var(--sidebar-text)',
              fontSize: '0.75rem',
              fontWeight: 500,
              cursor: isSaving ? 'wait' : 'pointer',
              opacity: isSaving ? 0.7 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {isSaving ? 'Сохранение…' : 'Сохранить в мои'}
          </button>
        )}
      </div>
    </button>
  );
}

/** Иконки для блоков брифинга (Место, Ситуация, Ваша роль, Начальная фраза) */
const BRIEFING_ICONS = {
  setting: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  scenario: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  ),
  yourRole: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  goal: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  firstLine: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  play: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
};

/** Уточняющее окно перед стартом диалога — ПК-версия: двухколоночный layout, без скролла. Экспортируется для брифинга личных сценариев. */
export function BriefingView({
  scenario,
  onBack,
  onStart,
}: {
  scenario: RoleplayScenario;
  onBack: () => void;
  onStart: (scenario: RoleplayScenario) => void;
}) {
  const colors = ROLEPLAY_CATEGORY_COLORS[scenario.category];
  const setting = scenario.settingRu ?? scenario.setting;
  const scenarioText = scenario.scenarioTextRu ?? scenario.scenarioText;
  const yourRole = scenario.yourRoleRu ?? scenario.yourRole;
  const goalText = scenario.goalRu ?? scenario.goal;
  const hasBriefing = setting || scenarioText || yourRole || goalText;
  const [slangMode, setSlangMode] = useState<SlangMode>(scenario.slangMode ?? 'light');
  const [allowProfanity, setAllowProfanity] = useState<boolean>(Boolean(scenario.allowProfanity));
  const [aiMayUseProfanity, setAiMayUseProfanity] = useState<boolean>(Boolean(scenario.aiMayUseProfanity));
  const [profanityIntensity, setProfanityIntensity] = useState<ProfanityIntensity>(scenario.profanityIntensity ?? 'light');

  useEffect(() => {
    setSlangMode(scenario.slangMode ?? 'light');
    setAllowProfanity(Boolean(scenario.allowProfanity));
    setAiMayUseProfanity(Boolean(scenario.aiMayUseProfanity));
    setProfanityIntensity(scenario.profanityIntensity ?? 'light');
  }, [scenario]);
  const styleBadges = getScenarioStyleBadges({
    slangMode,
    allowProfanity,
    aiMayUseProfanity,
    profanityIntensity,
  });

  const cardBase = {
    padding: '1rem 1.25rem',
    textAlign: 'left' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
    minHeight: 0,
  };

  return (
    <div
      className="roleplay-briefing"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 260px',
        gridTemplateRows: 'auto auto 1fr',
        gap: '1.5rem 2rem',
        padding: '1.75rem 2rem',
        alignContent: 'start',
        maxHeight: '80vh',
        boxSizing: 'border-box',
        overflow: 'auto',
      }}
    >
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Назад к списку"
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
          Перед началом диалога
        </span>
      </div>

      <div style={{ gridColumn: 1 }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--sidebar-text)', lineHeight: 1.2, letterSpacing: '-0.02em' }}>
          {scenario.title}
        </h2>
        {scenario.language && (
          <span style={{ display: 'inline-block', marginTop: 10, fontSize: '0.75rem', fontWeight: 600, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Язык: {scenario.language}
          </span>
        )}
        {styleBadges.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {styleBadges.map((badge) => (
              <span
                key={badge.label}
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.45rem',
                  borderRadius: 6,
                  background: badge.bg,
                  color: badge.color,
                  border: '1px solid transparent',
                  letterSpacing: '0.01em',
                }}
              >
                {badge.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={{ gridColumn: 2, gridRow: '2 / 4', display: 'flex', flexDirection: 'column', gap: '1.25rem', justifyContent: 'center', minHeight: 0 }}>
        {scenario.suggestedFirstLine && (
          <div
            style={{
              padding: '1.25rem 1.375rem',
              borderRadius: 12,
              border: '1px solid var(--sidebar-border)',
              background: 'var(--sidebar-active)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
            }}
          >
            <span style={{ display: 'flex', color: colors.bar, opacity: 0.9, flexShrink: 0 }}>{BRIEFING_ICONS.firstLine}</span>
            <div style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--sidebar-text)', opacity: 0.75, marginBottom: 8 }}>
                Начните с фразы
              </span>
              <p style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 500, lineHeight: 1.4, color: 'var(--sidebar-text)' }}>
                «{scenario.suggestedFirstLine}»
              </p>
            </div>
          </div>
        )}
        <div
          style={{
            padding: '1rem 1.125rem',
            borderRadius: 12,
            border: '1px solid var(--sidebar-border)',
            background: 'var(--sidebar-bg)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--sidebar-text)', opacity: 0.78, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Сленг и стиль речи
          </span>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--sidebar-text)', opacity: 0.78 }}>Стиль сленга</span>
            <select
              className="roleplay-modern-select"
              value={slangMode}
              onChange={(e) => setSlangMode(e.target.value as SlangMode)}
              style={{
                borderRadius: 8,
                border: '1px solid rgba(148, 163, 184, 0.45)',
                background: 'rgba(148, 163, 184, 0.14)',
                color: 'var(--sidebar-text)',
                fontSize: '0.8125rem',
                padding: '0.5rem 2rem 0.5rem 0.65rem',
              }}
            >
              {Object.entries(SLANG_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem', color: 'var(--sidebar-text)' }}>
            <input
              type="checkbox"
              checked={allowProfanity}
              onChange={(e) => {
                const next = e.target.checked;
                setAllowProfanity(next);
                if (!next) setAiMayUseProfanity(false);
              }}
            />
            Разрешить нецензурную лексику (18+)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem', color: 'var(--sidebar-text)', opacity: allowProfanity ? 1 : 0.55 }}>
            <input
              type="checkbox"
              checked={aiMayUseProfanity}
              disabled={!allowProfanity}
              onChange={(e) => setAiMayUseProfanity(e.target.checked)}
            />
            ИИ тоже может ругаться матом
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: allowProfanity ? 1 : 0.55 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--sidebar-text)', opacity: 0.78 }}>Интенсивность</span>
            <select
              className="roleplay-modern-select"
              value={profanityIntensity}
              disabled={!allowProfanity}
              onChange={(e) => setProfanityIntensity(e.target.value as ProfanityIntensity)}
              style={{
                borderRadius: 8,
                border: '1px solid rgba(148, 163, 184, 0.45)',
                background: 'rgba(148, 163, 184, 0.14)',
                color: 'var(--sidebar-text)',
                fontSize: '0.8125rem',
                padding: '0.5rem 2rem 0.5rem 0.65rem',
              }}
            >
              {Object.entries(PROFANITY_INTENSITY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={() =>
            onStart({
              ...scenario,
              slangMode,
              allowProfanity,
              aiMayUseProfanity: allowProfanity ? aiMayUseProfanity : false,
              profanityIntensity,
            })
          }
          className="roleplay-briefing-start"
          style={{
            '--accent': '#68c995',
            '--accent-strong': '#46af7d',
            '--accent-soft': 'rgba(104, 201, 149, 0.16)',
            width: '100%',
            padding: '1rem 1.375rem',
            borderRadius: 12,
            border: 'none',
            background: 'var(--accent)',
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
          Начать диалог
        </button>
      </div>

      {hasBriefing ? (
        <div style={{ gridColumn: 1, gridRow: 3, display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0, minHeight: 0, overflowY: 'auto' }}>
          {setting && (
            <div style={cardBase}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'flex', color: colors.bar, opacity: 0.95 }}>{BRIEFING_ICONS.setting}</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--sidebar-text)', opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Место
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.9375rem', lineHeight: 1.5, color: 'var(--sidebar-text)', opacity: 0.95 }}>
                {setting}
              </p>
            </div>
          )}
          {scenarioText && (
            <div style={cardBase}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'flex', color: colors.bar, opacity: 0.95 }}>{BRIEFING_ICONS.scenario}</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--sidebar-text)', opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Ситуация
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.9375rem', lineHeight: 1.5, color: 'var(--sidebar-text)', opacity: 0.95 }}>
                {scenarioText}
              </p>
            </div>
          )}
          {yourRole && (
            <div style={cardBase}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'flex', color: colors.bar, opacity: 0.95 }}>{BRIEFING_ICONS.yourRole}</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--sidebar-text)', opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Ваша роль
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.9375rem', lineHeight: 1.5, color: 'var(--sidebar-text)', opacity: 0.95 }}>
                {yourRole}
              </p>
            </div>
          )}
          {goalText && (
            <div style={cardBase}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'flex', color: 'rgba(34, 197, 94, 0.9)' }}>{BRIEFING_ICONS.goal}</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--sidebar-text)', opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Цель
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.9375rem', lineHeight: 1.5, color: 'var(--sidebar-text)', opacity: 0.95 }}>
                {goalText}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div style={{ gridColumn: 1, gridRow: 3 }}>
          <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.5, color: 'var(--sidebar-text)', opacity: 0.8 }}>
            Практикуйте диалог в этой ситуации. Говорите на выбранном языке.
          </p>
        </div>
      )}
    </div>
  );
}

function ScenarioModal({
  onSelect,
  onClose,
  onScenarioViewChange,
  onCopyToMineSuccess,
}: {
  onSelect: (s: RoleplayScenario) => void;
  onClose: () => void;
  onScenarioViewChange?: (view: 'catalog' | 'create' | 'my') => void;
  onCopyToMineSuccess?: (newScenarioId: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>('all');
  const [briefingScenario, setBriefingScenario] = useState<RoleplayScenario | null>(null);
  /** Свёрнутые/развёрнутые темы: Set themeId = развёрнута */
  const [expandedThemes, setExpandedThemes] = useState<Set<string>>(new Set());
  /** Id сценария, для которого выполняется «Сохранить в мои» */
  const [savingToMineId, setSavingToMineId] = useState<string | null>(null);
  /** Сообщение после успешного копирования в «Мои» */
  const [copySuccessMessage, setCopySuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (briefingScenario) setBriefingScenario(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, briefingScenario]);

  const query = searchQuery.trim().toLowerCase();
  const sections = useMemo(() => {
    return getRoleplayScenariosGroupedByTheme()
      .map(({ themeId, label, scenarios: list }) => ({
        themeId,
        label,
        scenarios: list.filter((s) => {
          const matchesSearch =
            !query ||
            s.title.toLowerCase().includes(query) ||
            (s.description && s.description.toLowerCase().includes(query)) ||
            (s.yourRoleRu?.toLowerCase().includes(query) || s.yourRole?.toLowerCase().includes(query)) ||
            label.toLowerCase().includes(query);
          const matchesDifficulty = difficultyFilter === 'all' || s.difficulty === difficultyFilter;
          return matchesSearch && matchesDifficulty;
        }),
      }))
      .filter((s) => s.scenarios.length > 0);
  }, [query, difficultyFilter]);

  const handleCardSelect = (scenario: RoleplayScenario) => {
    setBriefingScenario(scenario);
  };

  const handleStartDialog = (scenarioWithSettings: RoleplayScenario) => {
    if (briefingScenario) {
      onSelect(scenarioWithSettings);
      onClose();
    }
  };

  const handleSaveToMine = async (scenario: RoleplayScenario) => {
    if (!onCopyToMineSuccess || !onScenarioViewChange) return;
    setSavingToMineId(scenario.id);
    try {
      const level = (scenario.difficulty || 'medium') as UserScenarioLevel;
      const created = await createUserScenario({
        title: scenario.title,
        level,
        payload: scenarioToPayload(scenario),
      });
      setCopySuccessMessage('Сохранено в «Мои сценарии»');
      window.setTimeout(() => setCopySuccessMessage(null), 3000);
      window.setTimeout(() => {
        onScenarioViewChange('my');
        onCopyToMineSuccess(created.id);
      }, 1500);
    } catch {
      setCopySuccessMessage('Ошибка сохранения');
      window.setTimeout(() => setCopySuccessMessage(null), 3000);
    } finally {
      setSavingToMineId(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={briefingScenario ? 'Уточнение сценария' : 'Выбор сценария'}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: briefingScenario ? 900 : 960,
          maxHeight: briefingScenario ? '88vh' : '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 20,
          background: 'var(--sidebar-bg)',
          border: '1px solid var(--sidebar-border)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.04)',
        }}
      >
        {briefingScenario ? (
          <>
            <div
              style={{
                padding: '1rem 1.75rem',
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
            <BriefingView
              scenario={briefingScenario}
              onBack={() => setBriefingScenario(null)}
              onStart={handleStartDialog}
            />
          </>
        ) : (
          <>
            {copySuccessMessage && (
              <div
                role="status"
                style={{
                  padding: '0.75rem 1.25rem',
                  background: 'rgba(34, 197, 94, 0.12)',
                  borderBottom: '1px solid rgba(34, 197, 94, 0.3)',
                  color: 'var(--sidebar-text)',
                  fontSize: '0.9375rem',
                  fontWeight: 500,
                }}
              >
                {copySuccessMessage}
              </div>
            )}
            <div
              style={{
                padding: '1.5rem 1.75rem 1rem',
                borderBottom: '1px solid var(--sidebar-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, color: 'var(--sidebar-text)' }}>
                    Ролевые сценарии
                  </h2>
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.9375rem', color: 'var(--sidebar-text)', opacity: 0.7 }}>
                    Выберите тему и вариацию — ИИ будет подстраивать сложность речи под ваш уровень
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Закрыть"
                  style={{
                    padding: '0.5rem',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--sidebar-text)',
                    opacity: 0.7,
                    cursor: 'pointer',
                    borderRadius: 10,
                  }}
                >
                  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <line x1={18} y1={6} x2={6} y2={18} />
                    <line x1={6} y1={6} x2={18} y2={18} />
                  </svg>
                </button>
              </div>
              <label style={{ position: 'relative', display: 'block' }}>
                <input
                  type="search"
                  aria-label="Поиск сценария"
                  placeholder="Поиск по названию или теме..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoComplete="off"
                  className="roleplay-scenario-search"
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.875rem 0.625rem 2.5rem',
                    borderRadius: 12,
                    border: '1px solid var(--sidebar-border)',
                    background: 'var(--sidebar-hover)',
                    color: 'var(--sidebar-text)',
                    fontSize: '0.9375rem',
                    outline: 'none',
                    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                  }}
                  onKeyDown={(e) => e.key === 'Escape' && (setSearchQuery(''), e.currentTarget.blur())}
                />
                <svg
                  width={18}
                  height={18}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    position: 'absolute',
                    left: '0.875rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    opacity: 0.5,
                    pointerEvents: 'none',
                  }}
                >
                  <circle cx={11} cy={11} r={8} />
                  <line x1={21} y1={21} x2={16.65} y2={16.65} />
                </svg>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }} role="group" aria-label="Сложность">
                {DIFFICULTY_FILTER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDifficultyFilter(opt.value)}
                    style={{
                      padding: '0.4rem 0.75rem',
                      borderRadius: 10,
                      border: '1px solid var(--sidebar-border)',
                      background: difficultyFilter === opt.value ? 'var(--sidebar-active)' : 'transparent',
                      color: 'var(--sidebar-text)',
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                      opacity: difficultyFilter === opt.value ? 1 : 0.85,
                      transition: 'background 0.2s ease, border-color 0.2s ease, opacity 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (difficultyFilter !== opt.value) {
                        e.currentTarget.style.background = 'var(--sidebar-hover)';
                        e.currentTarget.style.opacity = '1';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (difficultyFilter !== opt.value) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.opacity = '0.85';
                      }
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div
              style={{
                overflowY: 'auto',
                padding: '1.5rem 1.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '2rem',
              }}
            >
              {sections.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.9375rem', color: 'var(--sidebar-text)', opacity: 0.7, textAlign: 'center' }}>
                  Ничего не найдено. Измените запрос.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {sections.map(({ themeId, label, scenarios: list }) => {
                    const isExpanded = expandedThemes.has(themeId);
                    return (
                      <section key={themeId} aria-labelledby={`theme-${themeId}`} style={{ borderRadius: 12, border: '1px solid var(--sidebar-border)', overflow: 'hidden', background: isExpanded ? 'var(--sidebar-hover)' : 'transparent' }}>
                        <button
                          type="button"
                          id={`theme-${themeId}`}
                          onClick={() => setExpandedThemes((prev) => {
                            const next = new Set(prev);
                            if (next.has(themeId)) next.delete(themeId);
                            else next.add(themeId);
                            return next;
                          })}
                          aria-expanded={isExpanded}
                          style={{
                            width: '100%',
                            padding: '1rem 1.25rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.75rem',
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--sidebar-text)',
                            fontSize: '1rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'background 0.2s ease',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sidebar-hover)'; }}
                          onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: 0.95 }}>
                            {THEME_ICONS[themeId] && <span style={{ display: 'flex', opacity: 0.9 }}>{THEME_ICONS[themeId]}</span>}
                            {label}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.8125rem', opacity: 0.6, lineHeight: 1 }}>{list.length} сценар.</span>
                            <svg
                              width={18}
                              height={18}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              style={{
                                flexShrink: 0,
                                opacity: 0.7,
                                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                                transition: 'transform 0.2s ease',
                              }}
                              aria-hidden
                            >
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </span>
                        </button>
                        {isExpanded && (
                          <div
                            style={{
                              padding: '0 1.25rem 1.25rem',
                              borderTop: '1px solid var(--sidebar-border)',
                            }}
                          >
                            <ul
                              style={{
                                listStyle: 'none',
                                margin: '1rem 0 0',
                                padding: 0,
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                                gap: '1rem',
                              }}
                            >
                              {list.map((scenario) => (
                                <li key={scenario.id}>
                                  <ScenarioCard
                                    scenario={scenario}
                                    onSelect={() => handleCardSelect(scenario)}
                                    onSaveToMine={onScenarioViewChange && onCopyToMineSuccess ? handleSaveToMine : undefined}
                                    savingToMineId={savingToMineId}
                                  />
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
