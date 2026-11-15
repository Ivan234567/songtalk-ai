'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEBATE_TOPICS, getSystemDebateTopics, type DebateTopic } from '@/lib/debate-topics';
import { supabase } from '@/lib/supabase';
import { getStoredBackendToken } from '@/lib/backend-jwt';
import {
  type DebateProfanityIntensity,
  type DebateSettings,
  getDebateMicroGoalsByDifficulty,
  normalizeDebateTopic,
  validateDebateTopic,
  type DebateDifficulty,
  type DebateMicroGoal,
  type DebateMicroGoalId,
  type DebatePosition,
  type DebateSlangMode,
  type DebateTopicMeta,
  type DebateWhoStarts,
} from '@/lib/debate';
import { DebateBriefingUI } from './DebateBriefingUI';
import { FieldAiButton, fieldFlashStyle } from '@/components/roleplay/FieldAiButton';
import {
  archiveUserDebateTopic,
  deleteUserDebateTopic,
  generateDebateTopic,
  listUserDebateTopics,
  saveUserDebateTopic,
  updateUserDebateTopic,
  type UserDebateTopic,
  type UserDebateTopicDifficulty,
} from '@/lib/user-debate-topics';
import { ensureAdultConfirmation } from '@/lib/adultConfirmation';
import { hasEnglishSystemCatalog, type LearningLanguage } from '@/lib/learning-language';
import { bindPracticeList } from '@/lib/practice-list-binding';
import createStyles from './debate-setup.module.css';

type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';

const CEFR_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];

const CEFR_INFO: Record<CefrLevel, { name: string; text: string; sample: string }> = {
  A1: { name: 'Начальный', text: 'Простые фразы: «мне нравится», «потому что». Один короткий аргумент.', sample: 'I like remote work. It is easy.' },
  A2: { name: 'Элементарный', text: 'Короткие предложения с because, but, so. Мнение и одна причина.', sample: 'I think remote work is good because I save time.' },
  B1: { name: 'Средний', text: 'Связная речь: мнение, причина, пример. Простые уступки.', sample: "I believe remote work is better, because you don't lose time on the way to the office." },
  B2: { name: 'Выше среднего', text: 'Развёрнутые аргументы, контраргументы и связки между идеями.', sample: 'Although the office helps teamwork, remote work gives people more freedom and focus.' },
  C1: { name: 'Продвинутый', text: 'Гибкая, точная речь. Нюансы, оговорки и сложные конструкции.', sample: 'While face-to-face contact has value, the productivity gains of remote work are hard to ignore.' },
};

const TOPIC_IDEAS = [
  'Remote work is better than office work',
  'School uniforms should be mandatory',
  'Social media does more harm than good',
];

function cefrToDifficulty(level: CefrLevel): DebateDifficulty {
  if (level === 'A1' || level === 'A2') return 'easy';
  if (level === 'C1') return 'hard';
  return 'medium';
}

const DEBATE_CEFR_MEMORY_KEY = 'speakeasy.debateCefr.v1';

function debateTopicMemoryKey(topic: string): string {
  return topic.trim().toLowerCase().replace(/\s+/g, ' ');
}

function recallDebateCefr(topic: string): CefrLevel | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DEBATE_CEFR_MEMORY_KEY);
    const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    const level = parsed?.[debateTopicMemoryKey(topic)];
    return level === 'A1' || level === 'A2' || level === 'B1' || level === 'B2' || level === 'C1' ? level : null;
  } catch {
    return null;
  }
}

function rememberDebateCefr(topic: string, level: CefrLevel) {
  if (typeof window === 'undefined') return;
  const key = debateTopicMemoryKey(topic);
  if (!key) return;
  try {
    const raw = window.localStorage.getItem(DEBATE_CEFR_MEMORY_KEY);
    const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    parsed[key] = level;
    window.localStorage.setItem(DEBATE_CEFR_MEMORY_KEY, JSON.stringify(parsed));
  } catch {
    // Память уровня не должна мешать старту дебата.
  }
}

function difficultyToCefr(level: DebateDifficulty): CefrLevel {
  if (level === 'easy') return 'A2';
  if (level === 'hard') return 'C1';
  return 'B1';
}

type DebateSetupUIProps = {
  learningLanguage: LearningLanguage;
  onStart: (
    topic: string,
    userPosition: DebatePosition,
    difficulty?: DebateDifficulty,
    microGoalIds?: DebateMicroGoalId[],
    topicMeta?: DebateTopicMeta,
    whoStarts?: DebateWhoStarts,
    debateSettings?: DebateSettings
  ) => void;
  onClose?: () => void;
  userId?: string | null;
  /** Внешний экран: 'catalog' | 'create' | 'my' — управляется через dropdown */
  view?: 'catalog' | 'create' | 'my';
  practiceWords?: import('@/components/agent/PracticeWordsInSheet').PracticeWordsSession | null;
  initialTopicId?: string | null;
  initialCustomTopic?: string | null;
};

type TopicView = 'list' | 'custom' | 'my';
type SetupStep = 'topic' | 'position';

const DIFFICULTY_FILTER_OPTIONS: { value: 'all' | 'easy' | 'medium' | 'hard'; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'easy', label: 'Легкие' },
  { value: 'medium', label: 'Средние' },
  { value: 'hard', label: 'Сложные' },
];

const CUSTOM_TOPIC_MIN_LEN = 10;
const CUSTOM_TOPIC_MAX_LEN = 180;

function getApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL || '';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function getBackendToken(): string | null {
  return getStoredBackendToken();
}

const CATEGORY_LABELS: Record<string, string> = {
  animals: 'Животные',
  education: 'Образование',
  entertainment: 'Развлечения',
  environment: 'Экология',
  health: 'Здоровье',
  lifestyle: 'Образ жизни',
  philosophy: 'Философия',
  politics: 'Политика',
  science: 'Наука',
  society: 'Общество',
  technology: 'Технологии',
  work: 'Работа',
};

const DIFFICULTY_BADGE: Record<'easy' | 'medium' | 'hard', { label: string; bg: string; color: string }> = {
  easy: { label: 'Легкая', bg: 'rgba(34, 197, 94, 0.15)', color: 'rgb(22, 163, 74)' },
  medium: { label: 'Средняя', bg: 'rgba(234, 179, 8, 0.15)', color: 'rgb(202, 138, 4)' },
  hard: { label: 'Сложная', bg: 'rgba(239, 68, 68, 0.12)', color: 'rgb(185, 28, 28)' },
};

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
  maxWidth: 980,
  maxHeight: '97vh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 20,
  background: 'var(--sidebar-bg)',
  border: '1px solid var(--sidebar-border)',
  boxShadow: '0 24px 48px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.04)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem 1rem',
  borderRadius: 12,
  border: '1px solid var(--sidebar-border)',
  background: 'var(--sidebar-hover)',
  color: 'var(--sidebar-text)',
  fontSize: '1rem',
  outline: 'none',
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
};

const btnPrimary: React.CSSProperties = {
  padding: '0.75rem 1.5rem',
  borderRadius: 12,
  border: '1px solid #46af7d',
  background: 'rgba(104, 201, 149, 0.16)',
  color: '#46af7d',
  fontSize: '1rem',
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 2px 8px rgba(70, 175, 125, 0.25)',
  transition: 'opacity 0.2s ease, transform 0.1s ease',
};

const btnSecondary: React.CSSProperties = {
  padding: '0.7rem 1.25rem',
  borderRadius: 12,
  border: '1px solid var(--sidebar-border)',
  background: 'transparent',
  color: 'var(--sidebar-text)',
  fontSize: '0.9375rem',
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

const SLANG_OPTIONS: Array<{ value: DebateSlangMode; label: string }> = [
  { value: 'off', label: 'Нейтральный стиль (без сленга)' },
  { value: 'light', label: 'Легкий сленг' },
  { value: 'heavy', label: 'Активный сленг' },
];

const PROFANITY_OPTIONS: Array<{ value: DebateProfanityIntensity; label: string }> = [
  { value: 'light', label: 'Мягко' },
  { value: 'medium', label: 'Средне' },
  { value: 'hard', label: 'Жестко' },
];

export function DebateSetupUI({
  learningLanguage,
  onStart,
  onClose,
  userId,
  view: externalView,
  practiceWords = null,
  initialTopicId = null,
  initialCustomTopic = null,
}: DebateSetupUIProps) {
  const showSystemCatalog = hasEnglishSystemCatalog(learningLanguage);
  const [setupStep, setSetupStep] = useState<SetupStep>('topic');
  const mapExternalView = (v?: 'catalog' | 'create' | 'my'): TopicView => {
    if (v === 'catalog') return showSystemCatalog ? 'list' : 'custom';
    if (v === 'create') return 'custom';
    if (v === 'my') return 'my';
    return showSystemCatalog ? 'list' : 'custom';
  };
  const [topicView, setTopicView] = useState<TopicView>(() => mapExternalView(externalView));
  const [selectedTopic, setSelectedTopic] = useState<DebateTopic | null>(null);
  const [customTopic, setCustomTopic] = useState('');
  const [customDifficulty, setCustomDifficulty] = useState<DebateDifficulty>('medium');
  const [cefr, setCefr] = useState<CefrLevel>('B1');
  const [topicPrepareError, setTopicPrepareError] = useState<string | null>(null);
  const [topicPreparing, setTopicPreparing] = useState(false);
  const [topicAiBusy, setTopicAiBusy] = useState<'create' | 'edit' | null>(null);
  const [topicAiError, setTopicAiError] = useState<string | null>(null);
  const [topicAiWhere, setTopicAiWhere] = useState<'create' | 'edit' | null>(null);
  const [topicFlash, setTopicFlash] = useState<'create' | 'edit' | null>(null);
  const [myTopics, setMyTopics] = useState<UserDebateTopic[]>([]);
  const [myTopicsLoading, setMyTopicsLoading] = useState(false);
  const [myTopicsError, setMyTopicsError] = useState<string | null>(null);
  const [selectedMyTopicId, setSelectedMyTopicId] = useState<string | null>(null);
  const [topicSaving, setTopicSaving] = useState(false);
  const [topicDeletingId, setTopicDeletingId] = useState<string | null>(null);
  const [userPosition, setUserPosition] = useState<DebatePosition | null>(null);
  const [difficultyFilter, setDifficultyFilter] = useState<'all' | 'easy' | 'medium' | 'hard'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(Array.from(new Set(DEBATE_TOPICS.map((t) => t.category))))
  );
  const [selectedMicroGoalIds, setSelectedMicroGoalIds] = useState<DebateMicroGoalId[]>([]);
  const [whoStarts, setWhoStarts] = useState<DebateWhoStarts>('ai');
  const [debateSlangMode, setDebateSlangMode] = useState<DebateSlangMode>('off');
  const [debateAllowProfanity, setDebateAllowProfanity] = useState(false);
  const [debateAiMayUseProfanity, setDebateAiMayUseProfanity] = useState(false);
  const [debateProfanityIntensity, setDebateProfanityIntensity] = useState<DebateProfanityIntensity>('light');
  const [showBriefing, setShowBriefing] = useState(false);

  useEffect(() => {
    if (initialCustomTopic) {
      setCustomTopic(initialCustomTopic);
      setTopicView('custom');
      return;
    }
    if (!initialTopicId) return;
    const found = DEBATE_TOPICS.find((topic) => topic.id === initialTopicId);
    if (!found) return;
    setSelectedTopic(found);
    setTopicView('list');
    setShowBriefing(true);
  }, [initialCustomTopic, initialTopicId]);

  // «Мои темы» enhanced state
  const [mySearchQuery, setMySearchQuery] = useState('');
  const [mySortBy, setMySortBy] = useState<'last_used' | 'updated'>('last_used');
  const [myCardMenuOpenId, setMyCardMenuOpenId] = useState<string | null>(null);
  /** Статистика завершений по topic_normalized: { count, last_completed_at } */
  const [myCompletionStats, setMyCompletionStats] = useState<Map<string, { count: number; lastAt: string | null }>>(new Map());
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    topic: string;
    difficulty: UserDebateTopicDifficulty;
    user_position: DebatePosition | null;
    micro_goal_ids: DebateMicroGoalId[];
    who_starts: DebateWhoStarts;
    slang_mode: DebateSlangMode;
    allow_profanity: boolean;
    ai_may_use_profanity: boolean;
    profanity_intensity: DebateProfanityIntensity;
  } | null>(null);
  const [editingSaving, setEditingSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  // «Добавить в мои темы» из каталога
  /** Набор topic_key пользовательских тем (active + archived) для определения «уже добавлена» */
  const [myTopicKeysAll, setMyTopicKeysAll] = useState<Set<string>>(new Set());
  const [addingCatalogTopicId, setAddingCatalogTopicId] = useState<string | null>(null);
  /** ID каталожных тем, только что добавленных в этой сессии (для визуального feedback) */
  const [justAddedCatalogIds, setJustAddedCatalogIds] = useState<Set<string>>(new Set());

  // Синхронизация topicView с внешним view при его изменении
  useEffect(() => {
    if (externalView) {
      const mapped = mapExternalView(externalView);
      setTopicView(mapped);
      setSetupStep('topic');
    }
  }, [externalView, showSystemCatalog]);

  useEffect(() => {
    if (!showSystemCatalog && topicView === 'list') {
      setTopicView('custom');
    }
  }, [showSystemCatalog, topicView]);

  const filteredTopics = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return getSystemDebateTopics(learningLanguage).filter((topic) => {
      if (difficultyFilter !== 'all' && topic.difficulty !== difficultyFilter) return false;
      if (!q) return true;
      const categoryLabel = CATEGORY_LABELS[topic.category] ?? topic.category;
      return (
        topic.topic.toLowerCase().includes(q) ||
        topic.topicRu.toLowerCase().includes(q) ||
        topic.category.toLowerCase().includes(q) ||
        categoryLabel.toLowerCase().includes(q)
      );
    });
  }, [difficultyFilter, searchQuery, learningLanguage]);

  const sections = useMemo(() => {
    const grouped = new Map<string, DebateTopic[]>();
    filteredTopics.forEach((topic) => {
      const list = grouped.get(topic.category) ?? [];
      list.push(topic);
      grouped.set(topic.category, list);
    });
    return Array.from(grouped.entries())
      .map(([category, topics]) => ({
        category,
        label: CATEGORY_LABELS[category] ?? category,
        topics,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  }, [filteredTopics]);

  const selectedMyTopic = useMemo(
    () => myTopics.find((item) => item.id === selectedMyTopicId) ?? null,
    [myTopics, selectedMyTopicId]
  );

  const activeTopicText = useMemo(() => {
    if (topicView === 'list') return selectedTopic?.topic ?? '';
    if (topicView === 'my') return selectedMyTopic?.topic ?? '';
    return normalizeDebateTopic(customTopic);
  }, [topicView, selectedTopic, selectedMyTopic, customTopic]);

  const customTopicValidation = useMemo(() => validateDebateTopic(customTopic), [customTopic]);

  const hasTopic = useMemo(() => {
    if (topicView === 'custom') return customTopicValidation.status !== 'rejected';
    return activeTopicText.length > 0;
  }, [topicView, customTopicValidation.status, activeTopicText]);

  const selectedDifficulty = useMemo<DebateDifficulty>(
    () => {
      if (topicView === 'list' && selectedTopic) return selectedTopic.difficulty;
      if (topicView === 'my' && selectedMyTopic?.difficulty) return selectedMyTopic.difficulty;
      return customDifficulty;
    },
    [topicView, selectedTopic, selectedMyTopic, customDifficulty]
  );
  const debateSettingsForStart = useMemo<DebateSettings>(
    () => ({
      slangMode: debateSlangMode,
      allowProfanity: debateAllowProfanity,
      aiMayUseProfanity: debateAllowProfanity ? debateAiMayUseProfanity : false,
      profanityIntensity: debateProfanityIntensity,
    }),
    [debateSlangMode, debateAllowProfanity, debateAiMayUseProfanity, debateProfanityIntensity]
  );
  const availableMicroGoals = useMemo<DebateMicroGoal[]>(
    () => getDebateMicroGoalsByDifficulty(selectedDifficulty),
    [selectedDifficulty]
  );
  const availableMicroGoalIds = useMemo(
    () => new Set(availableMicroGoals.map((g) => g.id)),
    [availableMicroGoals]
  );

  useEffect(() => {
    setSelectedMicroGoalIds((prev) => prev.filter((id) => availableMicroGoalIds.has(id)).slice(0, 2));
  }, [availableMicroGoalIds]);

  /** При выборе темы из «Мои темы» подставляем сохранённые настройки */
  useEffect(() => {
    if (topicView !== 'my' || !selectedMyTopic) return;
    const diff = selectedMyTopic.difficulty ?? 'medium';
    setCustomDifficulty(diff);
    setCefr(recallDebateCefr(selectedMyTopic.topic) || difficultyToCefr(diff));
    setUserPosition(selectedMyTopic.user_position ?? null);
    setWhoStarts(selectedMyTopic.who_starts ?? 'ai');
    setDebateSlangMode(selectedMyTopic.slang_mode ?? 'off');
    setDebateAllowProfanity(Boolean(selectedMyTopic.allow_profanity));
    setDebateAiMayUseProfanity(Boolean(selectedMyTopic.allow_profanity) && Boolean(selectedMyTopic.ai_may_use_profanity));
    setDebateProfanityIntensity(selectedMyTopic.profanity_intensity ?? 'light');
    const ids = (selectedMyTopic.micro_goal_ids ?? []) as DebateMicroGoalId[];
    const allowedIds = new Set(getDebateMicroGoalsByDifficulty(diff).map((g) => g.id));
    const allowed = ids.filter((id) => allowedIds.has(id)).slice(0, 2);
    setSelectedMicroGoalIds(allowed);
  }, [topicView, selectedMyTopicId, selectedMyTopic]);

  const canMoveToPosition = hasTopic;
  const canOpenBriefing = hasTopic && userPosition !== null && selectedMicroGoalIds.length > 0;

  const selectedTopicTitle = useMemo(() => {
    if (topicView === 'list' && selectedTopic) return selectedTopic.topicRu;
    if (topicView === 'my' && selectedMyTopic) return selectedMyTopic.topic;
    return normalizeDebateTopic(customTopic);
  }, [topicView, selectedTopic, selectedMyTopic, customTopic]);

  const selectedTopicSubtitle = useMemo(() => {
    if (topicView === 'list' && selectedTopic) return selectedTopic.topic;
    return null;
  }, [topicView, selectedTopic]);

  const loadMyTopics = useCallback(async () => {
    if (!userId) {
      setMyTopics([]);
      setSelectedMyTopicId(null);
      return;
    }

    setMyTopicsLoading(true);
    setMyTopicsError(null);
    try {
      const list = await listUserDebateTopics(userId, { archived: showArchived });
      setMyTopics(list);
      setSelectedMyTopicId((prev) => (prev && list.some((item) => item.id === prev) ? prev : (list[0]?.id ?? null)));
    } catch (err) {
      console.error('Failed to load user debate topics:', err);
      setMyTopicsError('Не удалось загрузить ваши темы');
    } finally {
      setMyTopicsLoading(false);
    }
  }, [userId, showArchived]);

  /** Загружаем все topic_key пользователя (active + archived) для детекта «уже добавлена» в каталоге */
  const loadMyTopicKeysAll = useCallback(async () => {
    if (!userId) { setMyTopicKeysAll(new Set()); return; }
    try {
      const { data } = await supabase
        .from('user_debate_topics')
        .select('topic_key')
        .eq('user_id', userId);
      const keys = new Set<string>();
      if (data) {
        for (const row of data) {
          if (typeof row.topic_key === 'string') keys.add(row.topic_key);
        }
      }
      setMyTopicKeysAll(keys);
    } catch { /* ignore */ }
  }, [userId]);

  /** Загружаем статистику завершений по всем personal-темам пользователя */
  const loadMyCompletionStats = useCallback(async () => {
    if (!userId) { setMyCompletionStats(new Map()); return; }
    try {
      const { data } = await supabase
        .from('debate_completions')
        .select('topic, completed_at')
        .eq('user_id', userId)
        .eq('topic_source', 'custom')
        .order('completed_at', { ascending: false })
        .limit(1000);
      const map = new Map<string, { count: number; lastAt: string | null }>();
      if (data) {
        for (const row of data) {
          const key = (row.topic as string).trim().toLowerCase().replace(/\s+/g, ' ');
          const existing = map.get(key);
          if (existing) { existing.count += 1; }
          else { map.set(key, { count: 1, lastAt: row.completed_at as string }); }
        }
      }
      setMyCompletionStats(map);
    } catch { /* ignore */ }
  }, [userId]);

  useEffect(() => {
    loadMyTopics();
    loadMyCompletionStats();
    loadMyTopicKeysAll();
  }, [loadMyTopics, loadMyCompletionStats, loadMyTopicKeysAll]);

  /** Поиск и сортировка «Мои темы» */
  const filteredMyTopics = useMemo(() => {
    const q = mySearchQuery.trim().toLowerCase();
    let list = [...myTopics];
    if (q) list = list.filter((t) => t.topic.toLowerCase().includes(q));
    const getKey = (t: UserDebateTopic) => t.topic.trim().toLowerCase().replace(/\s+/g, ' ');
    if (mySortBy === 'last_used') {
      list.sort((a, b) => {
        const aStats = myCompletionStats.get(getKey(a));
        const bStats = myCompletionStats.get(getKey(b));
        const aAt = aStats?.lastAt || a.updated_at || a.created_at || '';
        const bAt = bStats?.lastAt || b.updated_at || b.created_at || '';
        return bAt.localeCompare(aAt);
      });
    } else {
      list.sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''));
    }
    return list;
  }, [myTopics, mySearchQuery, mySortBy, myCompletionStats]);

  /** Закрытие меню карточки при клике вне */
  const menuWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!myCardMenuOpenId) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) setMyCardMenuOpenId(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [myCardMenuOpenId]);

  /** Открыть модалку редактирования темы */
  const startEditTopic = useCallback((item: UserDebateTopic) => {
    setEditingTopicId(item.id);
    const goalIds = (item.micro_goal_ids ?? []) as DebateMicroGoalId[];
    setEditDraft({
      topic: item.topic,
      difficulty: item.difficulty ?? 'medium',
      user_position: item.user_position ?? null,
      micro_goal_ids: goalIds,
      who_starts: item.who_starts ?? 'ai',
      slang_mode: item.slang_mode ?? 'off',
      allow_profanity: Boolean(item.allow_profanity),
      ai_may_use_profanity: Boolean(item.allow_profanity) && Boolean(item.ai_may_use_profanity),
      profanity_intensity: item.profanity_intensity ?? 'light',
    });
    setMyCardMenuOpenId(null);
  }, []);

  /** Сохранение отредактированной темы */
  const handleSaveEditTopic = useCallback(async () => {
    if (!editingTopicId || !editDraft || !editDraft.topic.trim() || !userId) return;
    setEditingSaving(true);
    try {
      await updateUserDebateTopic(userId, editingTopicId, {
        topic: editDraft.topic.trim(),
        difficulty: editDraft.difficulty,
        user_position: editDraft.user_position,
        micro_goal_ids: editDraft.micro_goal_ids,
        who_starts: editDraft.who_starts,
        slang_mode: editDraft.slang_mode,
        allow_profanity: editDraft.allow_profanity,
        ai_may_use_profanity: editDraft.allow_profanity ? editDraft.ai_may_use_profanity : false,
        profanity_intensity: editDraft.profanity_intensity,
      });
      setEditingTopicId(null);
      setEditDraft(null);
      await loadMyTopics();
    } catch (err) {
      console.error('Failed to edit debate topic:', err);
    } finally {
      setEditingSaving(false);
    }
  }, [editingTopicId, editDraft, userId, loadMyTopics]);

  /** Проверяем, добавлена ли каталожная тема в пользовательские */
  const isCatalogTopicSaved = useCallback(
    (catalogTopic: DebateTopic): boolean => {
      const key = catalogTopic.topic.trim().toLowerCase().replace(/\s+/g, ' ');
      return myTopicKeysAll.has(key);
    },
    [myTopicKeysAll]
  );

  /** Добавить каталожную тему в «Мои темы» */
  const handleAddCatalogToMy = useCallback(async (catalogTopic: DebateTopic) => {
    if (!userId) return;
    setAddingCatalogTopicId(catalogTopic.id);
    try {
      await saveUserDebateTopic(userId, catalogTopic.topic, {
        difficulty: catalogTopic.difficulty,
        slang_mode: 'off',
        allow_profanity: false,
        ai_may_use_profanity: false,
        profanity_intensity: 'light',
      });
      // Обновляем набор topic_key
      const key = catalogTopic.topic.trim().toLowerCase().replace(/\s+/g, ' ');
      setMyTopicKeysAll((prev) => new Set(prev).add(key));
      setJustAddedCatalogIds((prev) => new Set(prev).add(catalogTopic.id));
      // Обновляем список «Мои темы» (на случай если пользователь переключится туда)
      await loadMyTopics();
    } catch (err) {
      console.error('Failed to add catalog topic to my topics:', err);
    } finally {
      setAddingCatalogTopicId(null);
    }
  }, [userId, loadMyTopics]);

  /** Архивировать / восстановить тему */
  const handleArchiveTopic = useCallback(async (topicId: string, archive: boolean) => {
    if (!userId) return;
    setArchivingId(topicId);
    try {
      await archiveUserDebateTopic(userId, topicId, archive);
      await loadMyTopics();
    } catch (err) {
      console.error('Failed to archive/restore debate topic:', err);
    } finally {
      setArchivingId(null);
    }
  }, [userId, loadMyTopics]);

  const prepareDebateTopic = useCallback(
    async (
      topicRaw: string,
      difficultyMode: DebateDifficulty
    ): Promise<{
      normalizedTopic: string;
      language: 'ru' | 'en' | 'unknown';
      status: 'valid' | 'warning' | 'rejected';
      warnings: string[];
      errors: string[];
    }> => {
      const fallback = validateDebateTopic(topicRaw);
      const token = getBackendToken();
      if (!token) {
        return {
          normalizedTopic: fallback.normalized,
          language: fallback.language,
          status: fallback.status,
          warnings: fallback.warnings,
          errors: fallback.errors,
        };
      }

      try {
        const resp = await fetch(`${getApiUrl()}/api/agent/debate-topic-prepare`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            topic_raw: topicRaw,
            locale: 'ru',
            difficulty_mode: difficultyMode,
          }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(typeof data?.error === 'string' ? data.error : `Ошибка ${resp.status}`);
        }
        const normalizedTopic =
          typeof data?.normalized_topic === 'string' && data.normalized_topic.trim()
            ? data.normalized_topic.trim()
            : fallback.normalized;
        const language =
          data?.detected_language === 'ru' || data?.detected_language === 'en' ? data.detected_language : 'unknown';
        const status =
          data?.status === 'rejected' || data?.status === 'warning' || data?.status === 'valid'
            ? data.status
            : fallback.status;
        const warnings = Array.isArray(data?.warnings) ? data.warnings.filter((w: unknown) => typeof w === 'string') : fallback.warnings;
        const errors = Array.isArray(data?.errors) ? data.errors.filter((e: unknown) => typeof e === 'string') : fallback.errors;
        return { normalizedTopic, language, status, warnings, errors };
      } catch (err) {
        console.error('Failed to prepare debate topic:', err);
        return {
          normalizedTopic: fallback.normalized,
          language: fallback.language,
          status: fallback.status,
          warnings: fallback.warnings,
          errors: fallback.errors,
        };
      }
    },
    []
  );

  const handleTopicAi = async (target: 'create' | 'edit') => {
    const current = target === 'create' ? customTopic : (editDraft?.topic ?? '');
    const difficulty = target === 'create' ? customDifficulty : (editDraft?.difficulty ?? 'medium');
    setTopicAiBusy(target);
    setTopicAiWhere(target);
    setTopicAiError(null);
    try {
      const trimmed = current.trim();
      const result = await generateDebateTopic({
        difficulty,
        seed: trimmed || undefined,
        avoid: trimmed || undefined,
      });
      if (target === 'create') {
        setCustomTopic(result.text);
        setTopicPrepareError(null);
      } else {
        setEditDraft((d) => (d ? { ...d, topic: result.text } : d));
      }
      setTopicFlash(target);
      window.setTimeout(() => setTopicFlash((cur) => (cur === target ? null : cur)), 1200);
    } catch (err) {
      setTopicAiError(err instanceof Error ? err.message : 'Не удалось придумать тему');
    } finally {
      setTopicAiBusy(null);
    }
  };

  const handleStart = () => {
    if (!canOpenBriefing) return;
    const topic = activeTopicText;
    if (!topic || !userPosition) return;
    setShowBriefing(true);
  };

  const handleBriefingStart = async () => {
    setTopicPrepareError(null);
    const topic = activeTopicText;
    if (!topic || !userPosition) return;
    if (topicView === 'custom' && customTopicValidation.status === 'rejected') return;
    if (debateSettingsForStart.allowProfanity) {
      const confirmed = await ensureAdultConfirmation('debate_start');
      if (!confirmed) return;
    }

    if ((topicView === 'custom' || topicView === 'my') && userId) {
      try {
        setTopicSaving(true);
        const saved = await saveUserDebateTopic(userId, topic, {
          difficulty: customDifficulty,
          user_position: userPosition,
          micro_goal_ids: selectedMicroGoalIds,
          who_starts: whoStarts,
          slang_mode: debateSettingsForStart.slangMode ?? 'off',
          allow_profanity: Boolean(debateSettingsForStart.allowProfanity),
          ai_may_use_profanity: Boolean(debateSettingsForStart.allowProfanity) && Boolean(debateSettingsForStart.aiMayUseProfanity),
          profanity_intensity: debateSettingsForStart.profanityIntensity ?? 'light',
        });
        if (saved) {
          await loadMyTopics();
          setSelectedMyTopicId(saved.id);
          if (practiceWords?.listId) {
            await bindPracticeList(practiceWords.listId, {
              kind: 'debate',
              ref: saved.id,
              origin: 'user',
              label: saved.topic || topic,
            }).catch(() => { /* тема уже в «Мои темы» */ });
          }
        }
      } catch (err) {
        console.error('Failed to save custom debate topic:', err);
      } finally {
        setTopicSaving(false);
      }
    }

    const source = topicView === 'list' ? 'catalog' : 'custom';
    setTopicPreparing(true);
    const catalogValidation = validateDebateTopic(topic);
    const prepared =
      source === 'catalog'
        ? {
            normalizedTopic: catalogValidation.normalized,
            language: catalogValidation.language,
            status: catalogValidation.status,
            warnings: catalogValidation.warnings,
            errors: catalogValidation.errors,
          }
        : await prepareDebateTopic(topic, customDifficulty);
    setTopicPreparing(false);

    if (prepared.status === 'rejected') {
      setTopicPrepareError(prepared.errors[0] || 'Тема отклонена. Измените формулировку.');
      return;
    }
    if (prepared.status === 'warning' && prepared.warnings[0]) {
      setTopicPrepareError(prepared.warnings[0]);
    }

    const rememberedCefr = topicView === 'my' ? recallDebateCefr(topic) : null;
    const chosenCefr = topicView === 'custom' ? cefr : rememberedCefr;
    if (topicView === 'custom' && chosenCefr) rememberDebateCefr(topic, chosenCefr);
    const topicMeta: DebateTopicMeta = {
      source,
      original: source === 'catalog' ? topic : customTopic,
      normalized: prepared.normalizedTopic,
      language: prepared.language,
      validationStatus: prepared.status,
      ...(chosenCefr ? { cefrLevel: chosenCefr } : {}),
    };
    const difficulty = source === 'catalog' ? selectedTopic?.difficulty ?? 'medium' : customDifficulty;
    onStart(topicMeta.normalized, userPosition, difficulty, selectedMicroGoalIds, topicMeta, whoStarts, debateSettingsForStart);
  };

  const handleBriefingBack = () => {
    setShowBriefing(false);
  };

  /** Переход из брифинга к конкретному шагу для редактирования */
  const handleBriefingEditStep = (step: 'topic' | 'position') => {
    setShowBriefing(false);
    setSetupStep(step);
  };

  const handlePrimaryAction = () => {
    if (setupStep === 'topic') {
      if (!canMoveToPosition) return;
      setSetupStep('position');
      return;
    }
    handleStart();
  };

  const toggleMicroGoal = (goalId: DebateMicroGoalId) => {
    setSelectedMicroGoalIds((prev) => {
      if (prev.includes(goalId)) return prev.filter((id) => id !== goalId);
      if (prev.length >= 2) return prev;
      return [...prev, goalId];
    });
  };

  /* ─── Edit topic modal (повторяет layout формы «Создать тему») ─── */
  const renderEditTopicModal = () => {
    if (!editingTopicId || !editDraft) return null;
    const topicValidation = validateDebateTopic(editDraft.topic);
    const canSave = editDraft.topic.trim().length > 0 && topicValidation.status !== 'rejected';
    return (
      <div
        style={modalOverlayStyle}
        onClick={() => { setEditingTopicId(null); setEditDraft(null); }}
      >
        <div
          style={{ ...modalPanelStyle, maxWidth: 'calc(100vw - 4rem)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--sidebar-border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--sidebar-text)', flex: 1 }}>
              Редактирование темы
            </h2>
            <button
              type="button"
              onClick={() => { setEditingTopicId(null); setEditDraft(null); }}
              aria-label="Закрыть"
              style={{ ...btnSecondary, padding: '0.4rem' }}
            >
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <line x1={18} y1={6} x2={6} y2={18} /><line x1={6} y1={6} x2={18} y2={18} />
              </svg>
            </button>
          </div>

          {/* Body — точная копия layout'а «Создать тему» */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <p style={{ margin: '0 0 0.75rem', fontSize: '1rem', color: 'var(--sidebar-text)', opacity: 0.85, lineHeight: 1.45, flexShrink: 0 }}>
              Измените тему на английском или русском. Выберите сложность, чтобы настроить уровень аргументов.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem 1.25rem', maxWidth: 900, alignContent: 'start' }}>
              {/* Topic section — full width */}
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={createSectionTitle}>Тема дебата</span>
                <label style={{ display: 'block' }}>
                  <span style={{ ...createLabelStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    Формулировка темы
                    <FieldAiButton
                      label={editDraft.topic.trim() ? 'Другая тема' : 'Придумать тему'}
                      busy={topicAiBusy === 'edit'}
                      disabled={topicAiBusy !== null}
                      onClick={() => handleTopicAi('edit')}
                    />
                  </span>
                  <textarea
                    value={editDraft.topic}
                    onChange={(e) => {
                      setEditDraft((d) => d ? { ...d, topic: e.target.value } : d);
                      if (topicAiWhere === 'edit') setTopicAiError(null);
                    }}
                    placeholder="Например: Remote work is better than office work"
                    rows={3}
                    style={{ ...inputStyle, ...fieldFlashStyle(topicFlash === 'edit'), resize: 'vertical', fontFamily: 'inherit', minHeight: 80 }}
                    autoFocus
                  />
                </label>
                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.8125rem',
                      color:
                        (topicAiWhere === 'edit' && topicAiError) || topicValidation.status === 'rejected'
                          ? 'rgb(239, 68, 68)'
                          : topicValidation.status === 'warning'
                            ? 'rgb(202, 138, 4)'
                            : 'var(--sidebar-text)',
                      opacity: topicValidation.status === 'valid' ? 0.72 : 0.95,
                    }}
                  >
                    {(topicAiWhere === 'edit' && topicAiError) ||
                      topicValidation.errors[0] ||
                      topicValidation.warnings[0] ||
                      `Рекомендуемая длина: ${CUSTOM_TOPIC_MIN_LEN}–${CUSTOM_TOPIC_MAX_LEN} символов.`}
                  </p>
                  <span style={{ fontSize: '0.75rem', color: 'var(--sidebar-text)', opacity: 0.7, flexShrink: 0 }}>
                    {normalizeDebateTopic(editDraft.topic).length}/{CUSTOM_TOPIC_MAX_LEN}
                  </span>
                </div>
              </div>

              {/* Difficulty section — left column */}
              <div>
                <span style={createSectionTitle}>Сложность</span>
                <label style={{ display: 'block' }}>
                  <span style={createLabelStyle}>Уровень аргументов</span>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {(['easy', 'medium', 'hard'] as const).map((level) => {
                      const availableIds = new Set(getDebateMicroGoalsByDifficulty(level).map((g) => g.id));
                      return (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setEditDraft((d) => {
                            if (!d) return d;
                            const filtered = d.micro_goal_ids.filter((id) => availableIds.has(id)).slice(0, 2);
                            return { ...d, difficulty: level, micro_goal_ids: filtered };
                          })}
                          style={{
                            ...btnSecondary,
                            padding: '0.5rem 0.85rem',
                            fontSize: '0.875rem',
                            background: editDraft.difficulty === level ? 'var(--sidebar-active)' : 'transparent',
                            borderColor: editDraft.difficulty === level ? 'rgba(99, 102, 241, 0.45)' : 'var(--sidebar-border)',
                            fontWeight: editDraft.difficulty === level ? 600 : 500,
                            transition: 'all 0.2s ease',
                          }}
                        >
                          {DIFFICULTY_BADGE[level].label}
                        </button>
                      );
                    })}
                  </div>
                </label>
              </div>

              {/* Tips section — right column */}
              <div>
                <span style={createSectionTitle}>Советы</span>
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: 12,
                    border: '1px solid var(--sidebar-border)',
                    background: 'var(--sidebar-hover)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'linear-gradient(180deg, rgba(245, 158, 11, 1), transparent)', opacity: 0.6, borderRadius: '12px 0 0 12px' }} aria-hidden />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 2 }}>
                    <span
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(245, 158, 11, 0.12)',
                        color: 'rgba(245, 158, 11, 1)',
                        flexShrink: 0,
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                    </span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--sidebar-text)', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Как написать тему
                    </span>
                  </div>
                  <p style={{ margin: 0, paddingLeft: 44, fontSize: '0.875rem', lineHeight: 1.5, color: 'var(--sidebar-text)', opacity: 0.9 }}>
                    Хорошая тема — утверждение, с которым можно согласиться или поспорить.
                  </p>
                  <p style={{ margin: 0, paddingLeft: 44, fontSize: '0.8125rem', lineHeight: 1.45, color: 'var(--sidebar-text)', opacity: 0.7, fontStyle: 'italic' }}>
                    «Social media does more harm than good to society»
                  </p>
                </div>
              </div>
            </div>

            {/* Настройки: выбранная тема, позиция, микро-цели, кто начинает */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem 1.25rem', maxWidth: 900, alignContent: 'start', marginTop: '0.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--sidebar-border)' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={createSectionTitle}>Выбранная тема</span>
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: 12,
                    border: '1px solid var(--sidebar-border)',
                    background: 'var(--sidebar-hover)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'linear-gradient(180deg, rgba(99, 102, 241, 1), transparent)', opacity: 0.6, borderRadius: '12px 0 0 12px' }} aria-hidden />
                  <span style={{ fontSize: '1.0625rem', fontWeight: 600, color: 'var(--sidebar-text)', paddingLeft: 4 }}>{editDraft.topic.trim() || '—'}</span>
                </div>
              </div>

              <div>
                <span style={createSectionTitle}>Ваша позиция</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
                  {([
                    { pos: 'for' as DebatePosition, label: 'За', icon: <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>, color: 'rgba(34, 197, 94, 1)', bg: 'rgba(34, 197, 94, 0.12)' },
                    { pos: 'against' as DebatePosition, label: 'Против', icon: <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1={18} y1={6} x2={6} y2={18} /><line x1={6} y1={6} x2={18} y2={18} /></svg>, color: 'rgba(239, 68, 68, 1)', bg: 'rgba(239, 68, 68, 0.1)' },
                  ]).map(({ pos, label, icon, color, bg }) => {
                    const isSelected = editDraft.user_position === pos;
                    return (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => setEditDraft((d) => d ? { ...d, user_position: pos } : d)}
                        style={{
                          width: '100%',
                          padding: '0.85rem 1rem',
                          borderRadius: 12,
                          border: isSelected ? `2px solid ${color}` : '2px solid var(--sidebar-border)',
                          background: isSelected ? bg : 'var(--sidebar-hover)',
                          color: 'var(--sidebar-text)',
                          fontSize: '1rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.65rem',
                        }}
                      >
                        <span style={{ width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isSelected ? bg : 'transparent', color: isSelected ? color : 'var(--sidebar-text)', opacity: isSelected ? 1 : 0.6, flexShrink: 0, transition: 'all 0.2s ease' }}>
                          {icon}
                        </span>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span style={createSectionTitle}>Языковые микро-цели</span>
                <label style={{ display: 'block' }}>
                  <span style={createLabelStyle}>Выберите 1-2 цели для фокуса</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {getDebateMicroGoalsByDifficulty(editDraft.difficulty).map((goal) => {
                      const selected = editDraft.micro_goal_ids.includes(goal.id);
                      const locked = !selected && editDraft.micro_goal_ids.length >= 2;
                      return (
                        <button
                          key={goal.id}
                          type="button"
                          onClick={() => {
                            setEditDraft((d) => {
                              if (!d) return d;
                              if (d.micro_goal_ids.includes(goal.id)) return { ...d, micro_goal_ids: d.micro_goal_ids.filter((id) => id !== goal.id) };
                              if (d.micro_goal_ids.length >= 2) return d;
                              return { ...d, micro_goal_ids: [...d.micro_goal_ids, goal.id] };
                            });
                          }}
                          disabled={locked}
                          title={goal.hintRu}
                          style={{
                            padding: '0.5rem 0.85rem',
                            borderRadius: 10,
                            border: selected ? '1px solid rgba(99, 102, 241, 0.55)' : '1px solid var(--sidebar-border)',
                            background: selected ? 'rgba(99, 102, 241, 0.15)' : 'var(--sidebar-hover)',
                            color: 'var(--sidebar-text)',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            cursor: locked ? 'default' : 'pointer',
                            opacity: locked ? 0.5 : 1,
                            transition: 'all 0.2s ease',
                          }}
                        >
                          {goal.labelRu}
                        </button>
                      );
                    })}
                  </div>
                </label>
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem', opacity: 0.7, color: 'var(--sidebar-text)' }}>
                  Выбрано: {editDraft.micro_goal_ids.length}/2
                </p>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <span style={createSectionTitle}>Кто начинает дебат</span>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                  {([
                    { value: 'ai' as DebateWhoStarts, label: 'ИИ начинает', hint: 'ИИ озвучит свою позицию первым — подходит для начинающих' },
                    { value: 'user' as DebateWhoStarts, label: 'Я начну', hint: 'Вы представите свои аргументы первыми — ближе к реальным дебатам' },
                  ]).map(({ value, label, hint }) => {
                    const isSelected = editDraft.who_starts === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setEditDraft((d) => d ? { ...d, who_starts: value } : d)}
                        style={{
                          flex: 1,
                          padding: '0.85rem 1rem',
                          borderRadius: 12,
                          border: isSelected ? '2px solid rgba(99, 102, 241, 0.55)' : '2px solid var(--sidebar-border)',
                          background: isSelected ? 'rgba(99, 102, 241, 0.1)' : 'var(--sidebar-hover)',
                          color: 'var(--sidebar-text)',
                          fontSize: '0.9375rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.35rem',
                          textAlign: 'left',
                        }}
                      >
                        <span>{label}</span>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 400, opacity: 0.65, lineHeight: 1.35 }}>{hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <span style={createSectionTitle}>Сленг и 18+ настройки (необязательно)</span>
                <div
                  style={{
                    marginTop: '0.25rem',
                    padding: '0.85rem 1rem',
                    borderRadius: 12,
                    border: '1px solid var(--sidebar-border)',
                    background: 'var(--sidebar-hover)',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.85rem 1rem',
                  }}
                >
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ ...createLabelStyle, marginBottom: 0, fontSize: '0.85rem' }}>Стиль сленга</span>
                    <select
                      className="roleplay-modern-select"
                      value={editDraft.slang_mode}
                      onChange={(e) => setEditDraft((d) => d ? { ...d, slang_mode: e.target.value as DebateSlangMode } : d)}
                      style={{ ...inputStyle, padding: '0.55rem 2rem 0.55rem 0.75rem', fontSize: '0.9375rem', borderRadius: 8, border: '1px solid rgba(148, 163, 184, 0.45)', background: 'rgba(148, 163, 184, 0.14)' }}
                    >
                      {SLANG_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ ...createLabelStyle, marginBottom: 0, fontSize: '0.85rem' }}>Интенсивность 18+</span>
                    <select
                      className="roleplay-modern-select"
                      value={editDraft.profanity_intensity}
                      onChange={(e) => setEditDraft((d) => d ? { ...d, profanity_intensity: e.target.value as DebateProfanityIntensity } : d)}
                      disabled={!editDraft.allow_profanity}
                      style={{ ...inputStyle, padding: '0.55rem 2rem 0.55rem 0.75rem', fontSize: '0.9375rem', borderRadius: 8, border: '1px solid rgba(148, 163, 184, 0.45)', background: 'rgba(148, 163, 184, 0.14)', opacity: editDraft.allow_profanity ? 1 : 0.6 }}
                    >
                      {PROFANITY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', color: 'var(--sidebar-text)' }}>
                    <input
                      type="checkbox"
                      checked={editDraft.allow_profanity}
                      onChange={async (e) => {
                        const next = e.target.checked;
                        if (next) {
                          const confirmed = await ensureAdultConfirmation('debate_topic_edit');
                          if (!confirmed) return;
                        }
                        setEditDraft((d) => {
                          if (!d) return d;
                          return { ...d, allow_profanity: next, ai_may_use_profanity: next ? d.ai_may_use_profanity : false };
                        });
                      }}
                    />
                    Разрешить нецензурную лексику (18+)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', color: 'var(--sidebar-text)', opacity: editDraft.allow_profanity ? 1 : 0.6 }}>
                    <input
                      type="checkbox"
                      checked={editDraft.ai_may_use_profanity}
                      disabled={!editDraft.allow_profanity}
                      onChange={(e) => setEditDraft((d) => d ? { ...d, ai_may_use_profanity: e.target.checked } : d)}
                    />
                    ИИ может использовать 18+ лексику
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--sidebar-border)', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => { setEditingTopicId(null); setEditDraft(null); }}
              style={btnSecondary}
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleSaveEditTopic}
              disabled={editingSaving || !canSave}
              style={{ ...btnPrimary, opacity: editingSaving || !canSave ? 0.5 : 1, cursor: editingSaving ? 'wait' : canSave ? 'pointer' : 'default' }}
            >
              {editingSaving ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (showBriefing && activeTopicText && userPosition) {
    const topic = activeTopicText;
    const aiPosition: DebatePosition = userPosition === 'for' ? 'against' : 'for';
    const isListTopic = topicView === 'list' && selectedTopic;
    return (
      <div style={modalOverlayStyle} onClick={onClose ? (e) => e.target === e.currentTarget && onClose() : undefined}>
        <div style={{ ...modalPanelStyle, maxWidth: 900 }} onClick={(e) => e.stopPropagation()}>
          <DebateBriefingUI
            topic={topic}
            topicRu={isListTopic ? selectedTopic.topicRu : undefined}
            userPosition={userPosition}
            aiPosition={aiPosition}
            difficulty={selectedDifficulty}
            microGoals={availableMicroGoals.filter((g) => selectedMicroGoalIds.includes(g.id))}
            whoStarts={whoStarts}
            debateSettings={debateSettingsForStart}
            onBack={handleBriefingBack}
            onStart={handleBriefingStart}
            onEditStep={handleBriefingEditStep}
            practiceWords={practiceWords}
            topicOrigin={topicView === 'my' || topicView === 'custom' ? 'user' : 'system'}
            topicId={topicView === 'list' ? selectedTopic?.id : topicView === 'my' ? selectedMyTopic?.id : null}
          />
        </div>
      </div>
    );
  }

  return (
    <>
    <div style={modalOverlayStyle} onClick={onClose ? (e) => e.target === e.currentTarget && onClose() : undefined}>
      <div
        className={createStyles.modal}
        style={topicView === 'list' && setupStep === 'topic' ? { maxWidth: 'calc(100vw - 4rem)' } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={createStyles.head}>
          {setupStep === 'position' && (
            <button type="button" className={createStyles.ib} onClick={() => setSetupStep('topic')} aria-label="Назад">
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </button>
          )}
          {topicView !== 'list' && (
            <div className={createStyles.tabs} role="tablist">
              <button type="button" role="tab" aria-selected={topicView === 'custom'} onClick={() => { setTopicView('custom'); setSetupStep('topic'); }}>Создать</button>
              <button type="button" role="tab" aria-selected={topicView === 'my'} onClick={() => { setTopicView('my'); setSetupStep('topic'); }}>Мои темы</button>
            </div>
          )}
          <h2 className={createStyles.title}>
            {topicView === 'list' ? 'Каталог дебатов' : topicView === 'custom' ? 'Новый дебат' : 'Мои темы'}
          </h2>
          {onClose && (
            <button type="button" className={createStyles.ib} onClick={onClose} aria-label="Закрыть">
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>

        <div className={createStyles.body}>
          <div className={createStyles.steps}>
            <button
              type="button"
              className={`${createStyles.step} ${setupStep === 'topic' ? createStyles.on : createStyles.past}`}
              onClick={setupStep === 'position' ? () => setSetupStep('topic') : undefined}
            >
              <span className={createStyles.n}>{setupStep === 'position' ? '✓' : '1'}</span>
              {topicView === 'list' ? 'Выберите тему' : topicView === 'my' ? 'Мои темы' : 'Опишите тему'}
            </button>
            <span className={`${createStyles.ln} ${setupStep === 'position' ? createStyles.done : ''}`} />
            <button type="button" className={`${createStyles.step} ${setupStep === 'position' ? createStyles.on : ''}`} disabled>
              <span className={createStyles.n}>2</span>
              Настройки
            </button>
          </div>

          {setupStep === 'topic' ? (
            <>
              {topicView === 'list' && showSystemCatalog ? (
                <>
                  <label style={{ position: 'relative', display: 'block' }}>
                    <input
                      type="search"
                      aria-label="Поиск темы дебата"
                      placeholder="Поиск по теме или категории..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      autoComplete="off"
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
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {sections.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '0.9375rem', color: 'var(--sidebar-text)', opacity: 0.7, textAlign: 'center', padding: '1.5rem 0' }}>
                      Ничего не найдено. Измените запрос или фильтр.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {sections.map(({ category, label, topics }) => {
                        const isExpanded = expandedCategories.has(category);
                        return (
                          <section
                            key={category}
                            aria-labelledby={`debate-category-${category}`}
                            style={{
                              borderRadius: 12,
                              border: '1px solid var(--sidebar-border)',
                              overflow: 'hidden',
                              background: isExpanded ? 'var(--sidebar-hover)' : 'transparent',
                            }}
                          >
                            <button
                              id={`debate-category-${category}`}
                              type="button"
                              onClick={() =>
                                setExpandedCategories((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(category)) next.delete(category);
                                  else next.add(category);
                                  return next;
                                })
                              }
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
                              }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: 0.95 }}>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    width: 8,
                                    height: 8,
                                    borderRadius: 999,
                                    background: 'rgba(99, 102, 241, 0.85)',
                                    flexShrink: 0,
                                  }}
                                />
                                {label}
                              </span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.8125rem', opacity: 0.6, lineHeight: 1 }}>{topics.length} тем</span>
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
                              <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '1px solid var(--sidebar-border)' }}>
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
                                  {topics.map((topic) => {
                                    const isSelected = selectedTopic?.id === topic.id;
                                    const alreadySaved = isCatalogTopicSaved(topic);
                                    const isAdding = addingCatalogTopicId === topic.id;
                                    const justAdded = justAddedCatalogIds.has(topic.id);
                                    return (
                                      <li key={topic.id}>
                                        <div
                                          style={{
                                            position: 'relative',
                                            borderRadius: 12,
                                            border: isSelected ? '1px solid rgba(99, 102, 241, 0.45)' : '1px solid var(--sidebar-border)',
                                            background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'var(--sidebar-bg)',
                                            overflow: 'hidden',
                                          }}
                                        >
                                        <button
                                          type="button"
                                          onClick={() => setSelectedTopic(topic)}
                                          style={{
                                            width: '100%',
                                            textAlign: 'left',
                                            padding: '1rem',
                                            border: 'none',
                                            borderRadius: 12,
                                            background: 'transparent',
                                            color: 'var(--sidebar-text)',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.5rem',
                                          }}
                                        >
                                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                                            <span
                                              style={{
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                padding: '0.22rem 0.5rem',
                                                borderRadius: 999,
                                                background: DIFFICULTY_BADGE[topic.difficulty].bg,
                                                color: DIFFICULTY_BADGE[topic.difficulty].color,
                                              }}
                                            >
                                              {DIFFICULTY_BADGE[topic.difficulty].label}
                                            </span>
                                            {isSelected && (
                                              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="20 6 9 17 4 12" />
                                              </svg>
                                            )}
                                          </div>
                                          <div style={{ fontSize: '0.95rem', fontWeight: 600, lineHeight: 1.35 }}>{topic.topicRu}</div>
                                          <div style={{ fontSize: '0.8125rem', opacity: 0.72, lineHeight: 1.35 }}>{topic.topic}</div>
                                        </button>
                                        {/* Кнопка «В мои темы» */}
                                        {userId && (
                                          <div style={{ padding: '0 1rem 0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
                                            <button
                                              type="button"
                                              disabled={alreadySaved || isAdding}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (!alreadySaved && !isAdding) handleAddCatalogToMy(topic);
                                              }}
                                              title={alreadySaved ? 'Уже в ваших темах' : 'Добавить в мои темы'}
                                              style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.35rem',
                                                padding: '0.35rem 0.7rem',
                                                borderRadius: 8,
                                                border: alreadySaved
                                                  ? '1px solid rgba(34, 197, 94, 0.3)'
                                                  : '1px solid var(--sidebar-border)',
                                                background: alreadySaved
                                                  ? 'rgba(34, 197, 94, 0.1)'
                                                  : justAdded
                                                    ? 'rgba(34, 197, 94, 0.1)'
                                                    : 'transparent',
                                                color: alreadySaved
                                                  ? 'rgb(22, 163, 74)'
                                                  : 'var(--sidebar-text)',
                                                fontSize: '0.75rem',
                                                fontWeight: 500,
                                                cursor: alreadySaved || isAdding ? 'default' : 'pointer',
                                                opacity: isAdding ? 0.6 : alreadySaved ? 0.85 : 1,
                                                transition: 'all 0.2s ease',
                                              }}
                                              onMouseEnter={(e) => {
                                                if (!alreadySaved && !isAdding) {
                                                  e.currentTarget.style.background = 'var(--sidebar-hover)';
                                                  e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)';
                                                }
                                              }}
                                              onMouseLeave={(e) => {
                                                if (!alreadySaved && !isAdding) {
                                                  e.currentTarget.style.background = justAdded ? 'rgba(34, 197, 94, 0.1)' : 'transparent';
                                                  e.currentTarget.style.borderColor = 'var(--sidebar-border)';
                                                }
                                              }}
                                            >
                                              {isAdding ? (
                                                <>
                                                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                                                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                                  </svg>
                                                  <span>Добавляю...</span>
                                                </>
                                              ) : alreadySaved ? (
                                                <>
                                                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="20 6 9 17 4 12" />
                                                  </svg>
                                                  <span>В моих темах</span>
                                                </>
                                              ) : (
                                                <>
                                                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                                    <line x1={12} y1={5} x2={12} y2={19} /><line x1={5} y1={12} x2={19} y2={12} />
                                                  </svg>
                                                  <span>В мои темы</span>
                                                </>
                                              )}
                                            </button>
                                          </div>
                                        )}
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            )}
                          </section>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : topicView === 'custom' || (topicView === 'list' && !showSystemCatalog) ? (
                <>
                  <p className={createStyles.lead}>
                    Сформулируйте тему на английском или русском и выберите уровень. По нему подберётся сложность аргументов.
                  </p>
                  <div className={createStyles.grid}>
                    <div>
                      <div className={createStyles.k}>
                        Тема дебата
                        <FieldAiButton
                          label={customTopic.trim() ? 'Другая тема' : 'Придумать тему'}
                          text={customTopic.trim() ? 'Другая тема' : 'Придумать'}
                          busy={topicAiBusy === 'create'}
                          disabled={topicAiBusy !== null}
                          onClick={() => handleTopicAi('create')}
                        />
                      </div>
                      <textarea
                        className={createStyles.area}
                        value={customTopic}
                        onChange={(e) => {
                          setCustomTopic(e.target.value);
                          setTopicPrepareError(null);
                          if (topicAiWhere === 'create') setTopicAiError(null);
                        }}
                        placeholder="Например: Remote work is better than office work"
                        rows={3}
                        style={fieldFlashStyle(topicFlash === 'create')}
                      />
                      <div className={createStyles.meta}>
                        <span>
                          {(topicAiWhere === 'create' && topicAiError) ||
                            customTopicValidation.errors[0] ||
                            customTopicValidation.warnings[0] ||
                            `От ${CUSTOM_TOPIC_MIN_LEN} до ${CUSTOM_TOPIC_MAX_LEN} символов`}
                        </span>
                        <b className={customTopicValidation.status === 'rejected' ? createStyles.bad : createStyles.ok}>
                          {normalizeDebateTopic(customTopic).length} / {CUSTOM_TOPIC_MAX_LEN}
                        </b>
                      </div>
                      <div className={createStyles.ideas}>
                        <span>Идеи</span>
                        {TOPIC_IDEAS.map((idea) => (
                          <button key={idea} type="button" className={createStyles.idea} onClick={() => { setCustomTopic(idea); setTopicPrepareError(null); }}>
                            {idea}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className={createStyles.tip}>
                      <b><i>?</i> Как написать тему</b>
                      <p>Хорошая тема — это утверждение, с которым можно согласиться или поспорить.</p>
                      <q>Social media does more harm than good to society</q>
                    </div>
                    <div className={`${createStyles.levelBlock} ${createStyles.full}`}>
                      <div className={createStyles.k}>Уровень языка</div>
                      <div className={createStyles.levels}>
                        {CEFR_LEVELS.map((level) => (
                          <button
                            key={level}
                            type="button"
                            aria-pressed={cefr === level}
                            onClick={() => { setCefr(level); setCustomDifficulty(cefrToDifficulty(level)); }}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                      <div className={createStyles.levelCopy}>
                        <strong>{cefr}</strong>
                        <em>{CEFR_INFO[cefr].name}</em>
                        <p>{CEFR_INFO[cefr].text}</p>
                        <q>{CEFR_INFO[cefr].sample}</q>
                      </div>
                    </div>
                  </div>
                  {topicPrepareError && (
                    <p style={{ margin: 0, padding: '0.75rem 1rem', borderRadius: 10, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', fontSize: '0.9375rem' }}>
                      {topicPrepareError}
                    </p>
                  )}
                </>
              ) : (
                <>
                  {!userId ? (
                    <p style={{ margin: 0, fontSize: '0.9375rem', color: 'var(--sidebar-text)', opacity: 0.75 }}>
                      Войдите в аккаунт, чтобы использовать «Мои темы».
                    </p>
                  ) : myTopicsLoading ? (
                    <p style={{ margin: 0, fontSize: '0.9375rem', color: 'var(--sidebar-text)', opacity: 0.75 }}>Загрузка тем...</p>
                  ) : myTopicsError ? (
                    <p style={{ margin: 0, fontSize: '0.9375rem', color: 'rgb(239, 68, 68)' }}>{myTopicsError}</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {/* Active / Archive toggle */}
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

                      {/* Search */}
                      <label style={{ position: 'relative', display: 'block' }}>
                        <input
                          type="search"
                          aria-label="Поиск по теме"
                          placeholder="Поиск по теме…"
                          value={mySearchQuery}
                          onChange={(e) => setMySearchQuery(e.target.value)}
                          autoComplete="off"
                          style={{ ...inputStyle, width: '100%', paddingLeft: '2.25rem' }}
                        />
                        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, pointerEvents: 'none' }}>
                          <circle cx={11} cy={11} r={8} /><path d="M21 21l-4.35-4.35" />
                        </svg>
                      </label>

                      {/* Sort + difficulty */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--sidebar-text)', opacity: 0.7 }}>Сортировка:</span>
                        {([
                          { key: 'last_used' as const, label: 'По использованию' },
                          { key: 'updated' as const, label: 'По обновлению' },
                        ]).map(({ key, label }) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setMySortBy(key)}
                            style={{
                              ...btnSecondary,
                              padding: '0.4rem 0.7rem',
                              fontSize: '0.8125rem',
                              background: mySortBy === key ? 'var(--sidebar-active)' : 'transparent',
                              color: 'var(--sidebar-text)',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = mySortBy === key ? 'var(--sidebar-active)' : 'var(--sidebar-hover)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = mySortBy === key ? 'var(--sidebar-active)' : 'transparent'; }}
                          >
                            {label}
                          </button>
                        ))}
                        <div style={{ width: 1, height: 20, background: 'var(--sidebar-border)', margin: '0 0.25rem' }} aria-hidden />
                        <span style={{ fontSize: '0.75rem', color: 'var(--sidebar-text)', opacity: 0.7 }}>Сложность:</span>
                        {(['easy', 'medium', 'hard'] as const).map((level) => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => setCustomDifficulty(level)}
                            style={{
                              ...btnSecondary,
                              padding: '0.4rem 0.7rem',
                              fontSize: '0.8125rem',
                              background: customDifficulty === level ? 'var(--sidebar-active)' : 'transparent',
                              borderColor: customDifficulty === level ? 'rgba(99, 102, 241, 0.45)' : 'var(--sidebar-border)',
                              fontWeight: customDifficulty === level ? 600 : 500,
                            }}
                          >
                            {DIFFICULTY_BADGE[level].label}
                          </button>
                        ))}
                      </div>

                      {/* Topics list */}
                      {myTopics.length === 0 ? (
                        <p style={{ margin: '1rem 0 0', fontSize: '0.9375rem', color: 'var(--sidebar-text)', opacity: 0.7 }}>
                          {showArchived ? 'В архиве пока ничего нет.' : 'У вас пока нет сохранённых тем. Создайте тему во вкладке «Создать» и начните дебат.'}
                        </p>
                      ) : filteredMyTopics.length === 0 ? (
                        <p style={{ margin: '1rem 0 0', fontSize: '0.9375rem', color: 'var(--sidebar-text)', opacity: 0.7 }}>
                          По запросу ничего не найдено. Измените поиск.
                        </p>
                      ) : (
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {filteredMyTopics.map((item) => {
                            const isSelected = selectedMyTopicId === item.id;
                            const isDeleting = topicDeletingId === item.id;
                            const isMenuOpen = myCardMenuOpenId === item.id;
                            const isEditing = editingTopicId === item.id;
                            const topicKey = item.topic.trim().toLowerCase().replace(/\s+/g, ' ');
                            const stats = myCompletionStats.get(topicKey);
                            const count = stats?.count ?? 0;
                            const lastAt = stats?.lastAt ? (() => { try { return new Date(stats.lastAt!).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return null; } })() : null;

                            return (
                              <li key={item.id}>
                                <div
                                  style={{
                                    padding: '0.75rem 1rem',
                                    borderRadius: 12,
                                    border: isSelected ? '2px solid rgba(99, 102, 241, 0.45)' : '1px solid var(--sidebar-border)',
                                    background: isSelected ? 'rgba(99, 102, 241, 0.08)' : 'var(--sidebar-hover)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  {/* Content */}
                                  <button
                                    type="button"
                                    onClick={() => { setSelectedMyTopicId(item.id); if (item.difficulty) setCustomDifficulty(item.difficulty); }}
                                    style={{ border: 'none', background: 'transparent', color: 'var(--sidebar-text)', cursor: 'pointer', textAlign: 'left', padding: 0, flex: 1, minWidth: 0 }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: 2 }}>
                                      {item.difficulty && (
                                        <span
                                          style={{
                                            fontSize: '0.6875rem',
                                            fontWeight: 600,
                                            padding: '0.15rem 0.4rem',
                                            borderRadius: 999,
                                            background: DIFFICULTY_BADGE[item.difficulty].bg,
                                            color: DIFFICULTY_BADGE[item.difficulty].color,
                                            flexShrink: 0,
                                          }}
                                        >
                                          {DIFFICULTY_BADGE[item.difficulty].label}
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ fontWeight: 600, fontSize: '0.9375rem', lineHeight: 1.35 }}>{item.topic}</div>
                                    {(count > 0 || lastAt) && (
                                      <div style={{ fontSize: '0.75rem', opacity: 0.55, marginTop: 4 }}>
                                        {count > 0 && <span>Завершён {count} {count === 1 ? 'раз' : count < 5 ? 'раза' : 'раз'}</span>}
                                        {count > 0 && lastAt && ' · '}
                                        {lastAt && <span>Последний раз: {lastAt}</span>}
                                      </div>
                                    )}
                                  </button>

                                  {/* Play button — only for active topics */}
                                  {!showArchived && (
                                    <button
                                      type="button"
                                      onClick={() => { setSelectedMyTopicId(item.id); if (item.difficulty) setCustomDifficulty(item.difficulty); setSetupStep('position'); }}
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
                                        flexShrink: 0,
                                      }}
                                    >
                                      Начать
                                    </button>
                                  )}

                                  {/* Actions menu */}
                                  <div ref={isMenuOpen ? menuWrapRef : undefined} style={{ position: 'relative', flexShrink: 0 }}>
                                    <button
                                      type="button"
                                      onClick={() => setMyCardMenuOpenId(isMenuOpen ? null : item.id)}
                                      aria-label="Действия"
                                      style={{ ...btnSecondary, padding: '0.4rem 0.5rem', minWidth: 32 }}
                                    >
                                      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                        <circle cx="12" cy="6" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="18" r="1.5" />
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
                                        {/* Edit */}
                                        <button
                                          type="button"
                                          role="menuitem"
                                          onClick={() => startEditTopic(item)}
                                          style={{
                                            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                                            padding: '0.5rem 0.75rem', border: 'none', borderRadius: 8,
                                            background: 'transparent', color: 'var(--sidebar-text)', fontSize: '0.9375rem',
                                            cursor: 'pointer', transition: 'background 0.15s ease',
                                          }}
                                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sidebar-hover)'; }}
                                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                        >
                                          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.85 }}>
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                          </svg>
                                          <span>Редактировать</span>
                                        </button>
                                        {/* Archive / Restore */}
                                        <button
                                          type="button"
                                          role="menuitem"
                                          disabled={archivingId === item.id}
                                          onClick={() => { handleArchiveTopic(item.id, !showArchived); setMyCardMenuOpenId(null); }}
                                          style={{
                                            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                                            padding: '0.5rem 0.75rem', border: 'none', borderRadius: 8,
                                            background: 'transparent', color: 'var(--sidebar-text)', fontSize: '0.9375rem',
                                            cursor: archivingId === item.id ? 'default' : 'pointer',
                                            opacity: archivingId === item.id ? 0.6 : 1,
                                            transition: 'background 0.15s ease',
                                          }}
                                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sidebar-hover)'; }}
                                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                        >
                                          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.85 }}>
                                            <rect width={20} height={5} x={2} y={3} rx={1} /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" />
                                          </svg>
                                          <span>{archivingId === item.id ? '…' : showArchived ? 'Восстановить' : 'В архив'}</span>
                                        </button>
                                        <div style={{ height: 1, background: 'var(--sidebar-border)', margin: '4px 0', opacity: 0.8 }} aria-hidden />
                                        {/* Delete */}
                                        <button
                                          type="button"
                                          role="menuitem"
                                          disabled={isDeleting}
                                          onClick={async () => {
                                            if (!userId) return;
                                            if (!confirm('Удалить тему без возможности восстановления?')) return;
                                            setMyCardMenuOpenId(null);
                                            try {
                                              setTopicDeletingId(item.id);
                                              await deleteUserDebateTopic(userId, item.id);
                                              await loadMyTopics();
                                            } catch (err) {
                                              console.error('Failed to delete user debate topic:', err);
                                            } finally {
                                              setTopicDeletingId(null);
                                            }
                                          }}
                                          style={{
                                            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                                            padding: '0.5rem 0.75rem', border: 'none', borderRadius: 8,
                                            background: 'transparent', color: 'var(--sidebar-text)', fontSize: '0.9375rem',
                                            cursor: isDeleting ? 'default' : 'pointer', opacity: isDeleting ? 0.6 : 1,
                                            transition: 'background 0.15s ease, color 0.15s ease',
                                          }}
                                          onMouseEnter={(e) => { if (!isDeleting) { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)'; e.currentTarget.style.color = 'rgb(220, 38, 38)'; } }}
                                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sidebar-text)'; }}
                                        >
                                          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.9 }}>
                                            <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1={10} y1={11} x2={10} y2={17} /><line x1={14} y1={11} x2={14} y2={17} />
                                          </svg>
                                          <span>{isDeleting ? '…' : 'Удалить'}</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Edit badge */}
                                {isEditing && (
                                  <div style={{ width: '100%', marginTop: '0.35rem', fontSize: '0.8125rem', color: 'rgba(99, 102, 241, 1)', opacity: 0.85 }}>
                                    Редактируется...
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}

                  {topicPrepareError && (
                    <p style={{ margin: '0.75rem 0 0', padding: '0.75rem 1rem', borderRadius: 10, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--sidebar-text)', fontSize: '0.9375rem', flexShrink: 0 }}>
                      {topicPrepareError}
                    </p>
                  )}
                </>
              )}
            </>
          ) : (
            <div className={createStyles.grid}>
              <div className={`${createStyles.topic} ${createStyles.full}`}>
                <q>{selectedTopicTitle || '—'}</q>
                <span className={createStyles.lvl}>{topicView === 'custom' ? `${cefr} · ${CEFR_INFO[cefr].name}` : DIFFICULTY_BADGE[selectedDifficulty].label}</span>
              </div>
              {selectedTopicSubtitle && <p className={`${createStyles.lead} ${createStyles.full}`} style={{ marginTop: -8 }}>{selectedTopicSubtitle}</p>}

              <div>
                <div className={createStyles.k}>Ваша позиция</div>
                <div className={createStyles.pos}>
                  <button type="button" className={userPosition === 'for' ? createStyles.forOn : ''} onClick={() => setUserPosition('for')}>
                    <span className={createStyles.mk}>✓</span>
                    За
                    <small>Вы защищаете тему</small>
                  </button>
                  <button type="button" className={userPosition === 'against' ? createStyles.againstOn : ''} onClick={() => setUserPosition('against')}>
                    <span className={createStyles.mk}>✕</span>
                    Против
                    <small>Вы оспариваете тему</small>
                  </button>
                </div>
              </div>

              <div>
                <div className={createStyles.k}>
                  Языковые цели
                  <span style={{ fontWeight: 500, color: 'var(--mut, #a29fb3)' }}>{selectedMicroGoalIds.length} из 2</span>
                </div>
                <div className={createStyles.goals}>
                  {availableMicroGoals.map((goal) => {
                    const selected = selectedMicroGoalIds.includes(goal.id);
                    const locked = !selected && selectedMicroGoalIds.length >= 2;
                    return (
                      <button key={goal.id} type="button" className={createStyles.goal} aria-pressed={selected} disabled={locked} onClick={() => toggleMicroGoal(goal.id)}>
                        <span className={createStyles.cb}>✓</span>
                        <span><b>{goal.labelRu}</b><small>{goal.hintRu}</small></span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={createStyles.full}>
                <div className={createStyles.k}>Кто начинает</div>
                <div className={createStyles.who}>
                  <button type="button" aria-pressed={whoStarts === 'ai'} onClick={() => setWhoStarts('ai')}>
                    <span className={createStyles.rd} />
                    <span><b>ИИ начинает</b><small>ИИ первым озвучит позицию. Хорошо для начала.</small></span>
                  </button>
                  <button type="button" aria-pressed={whoStarts === 'user'} onClick={() => setWhoStarts('user')}>
                    <span className={createStyles.rd} />
                    <span><b>Я начну</b><small>Вы говорите первым. Это ближе к реальным дебатам.</small></span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={createStyles.foot}>
          <span className={createStyles.hint}>
            {setupStep === 'topic'
              ? (canMoveToPosition ? '' : 'Введите тему: от 10 до 180 символов')
              : userPosition === null
                ? 'Выберите позицию'
                : selectedMicroGoalIds.length === 0
                  ? 'Выберите хотя бы одну цель'
                  : ''}
          </span>
          <div className={createStyles.actions}>
            {onClose && (
              <button type="button" className={createStyles.btn} onClick={onClose}>Отмена</button>
            )}
            <button
              type="button"
              className={`${createStyles.btn} ${createStyles.pri}`}
              onClick={handlePrimaryAction}
              disabled={topicSaving || topicPreparing || (setupStep === 'topic' ? !canMoveToPosition : !canOpenBriefing)}
            >
              {setupStep === 'topic'
                ? 'Далее — настройки'
                : topicSaving
                  ? 'Сохраняем тему...'
                  : topicPreparing
                    ? 'Подготавливаем тему...'
                    : 'Готово — к брифингу'}
              <span aria-hidden>→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    {renderEditTopicModal()}
    </>
  );
}
