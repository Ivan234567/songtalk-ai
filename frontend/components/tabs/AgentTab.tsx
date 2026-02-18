'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { buildMessagesForAgentChat, type RoleplayScenario } from '@/lib/roleplay';
import { RoleplayModeUI } from '@/components/roleplay/RoleplayModeUI';
import { PersonalScenariosUI } from '@/components/roleplay/PersonalScenariosUI';
import type { SpeakingAssessmentResult, CriteriaScores, GoalAttainmentItem } from '@/lib/speaking-assessment';
import { getCriteriaLabel } from '@/lib/speaking-assessment';
import { TranslatorPanel } from '@/components/TranslatorPanel';
import { DebateSetupUI } from '@/components/debate/DebateSetupUI';
import {
  buildDebateSystemPrompt,
  getDebateMicroGoalsByDifficulty,
  getDebateStepsByDifficulty,
  normalizeDebateTopic,
  type DebateSettings,
  type DebateMicroGoalId,
  type DebateTopicMeta,
  type DebateWhoStarts,
} from '@/lib/debate';
import { DEBATE_TOPICS, getTopicById } from '@/lib/debate-topics';

// Цель дебата (статический текст)
const DEBATE_GOAL_RU = `Дебат успешно завершен, когда:
• Обе стороны представили свои основные аргументы (минимум 2-3 обмена репликами)
• Вы защитили свою позицию хотя бы одним четким аргументом
• Произошел естественный обмен мнениями`;

const TTS_VOICE_OPTIONS: Array<{ value: 'onyx' | 'nova' | 'ballad'; label: string }> = [
  { value: 'onyx', label: 'Мужской (Onyx)' },
  { value: 'ballad', label: 'Ballad (попробовать)' },
  { value: 'nova', label: 'Женский (Nova)' },
];

const FREESTYLE_HINT_MODE_LABELS: Record<FreestyleHintMode, string> = {
  natural: 'Естественно',
  simpler: 'Проще',
  more_native: 'Более нативно',
  polite_rewrite: 'Вежливый вариант',
  no_profanity: 'Без мата',
};


function getApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function getBackendToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('backend_jwt');
}

type AgentState = 'idle' | 'listening' | 'thinking' | 'speaking';

type Message = { role: 'user' | 'assistant'; content: string };
type SbiBlock = {
  situation: string;
  behavior: string;
  impact: string;
};
type FreestyleSlangMode = 'off' | 'light' | 'heavy';
type FreestyleProfanityIntensity = 'light' | 'medium' | 'hard';
type FreestyleHintMode = 'natural' | 'simpler' | 'more_native' | 'polite_rewrite' | 'no_profanity';

type Session = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  scenario_id?: string | null;
  scenario_title?: string | null;
  /** Для сценариев с шагами: какие шаги отмечены выполненными в этой сессии */
  completed_step_ids?: string[];
};

const MAX_SESSIONS = 50;

function trimTitle(text: string, maxLen: number = 42): string {
  const t = text.trim();
  if (t.length <= maxLen) return t || 'Новый разговор';
  return t.slice(0, maxLen).trim() + '…';
}

function formatSessionDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function AgentTab() {
  const [state, setState] = useState<AgentState>('idle');
  const [subtitlesVisible, setSubtitlesVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<RoleplayScenario | null>(null);
  const [agentMode, setAgentMode] = useState<'chat' | 'roleplay' | 'debate'>('chat');
  const [scenarioModalOpen, setScenarioModalOpen] = useState(false);
  const [scenarioView, setScenarioView] = useState<'catalog' | 'create' | 'my'>('catalog');
  const [debateView, setDebateView] = useState<'catalog' | 'create' | 'my'>('catalog');
  /** Id сценария, только что скопированного из каталога в «Мои» — для подсветки в списке */
  const [highlightedUserScenarioId, setHighlightedUserScenarioId] = useState<string | null>(null);
  const [translatorOpen, setTranslatorOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [aiChatMessages, setAiChatMessages] = useState<Message[]>([]);
  const [aiChatInput, setAiChatInput] = useState('');
  const [aiChatLoading, setAiChatLoading] = useState(false);
  const [aiChatLoadLoading, setAiChatLoadLoading] = useState(false);
  /** Текущий чат: id сессии в БД или null = новый чат */
  const [aiChatCurrentId, setAiChatCurrentId] = useState<string | null>(null);
  /** Список чатов для боковой панели истории */
  const [aiChatSessionsList, setAiChatSessionsList] = useState<Array<{ id: string; title: string; updated_at: string }>>([]);
  const [aiChatSessionsListLoading, setAiChatSessionsListLoading] = useState(false);
  const [aiChatHistoryPanelOpen, setAiChatHistoryPanelOpen] = useState(false);
  const [aiChatDeletingId, setAiChatDeletingId] = useState<string | null>(null);
  /** Позиция и размер окна чата с ИИ: перетаскивание и ресайз */
  const [aiChatPosition, setAiChatPosition] = useState<{ x: number; y: number } | null>(null);
  const [aiChatSize, setAiChatSize] = useState<{ width: number; height: number } | null>(null);
  const aiChatDragStartRef = useRef<{ x: number; y: number; startX: number; startY: number; boxW: number; boxH: number } | null>(null);
  const aiChatResizeStartRef = useRef<{ x: number; y: number; startW: number; startH: number; handle: 'e' | 's' | 'se' } | null>(null);
  const aiChatSizeRef = useRef<{ width: number; height: number } | null>(null);
  const aiChatPositionRef = useRef<{ x: number; y: number } | null>(null);
  const [ttsVoice, setTtsVoice] = useState<'onyx' | 'nova' | 'ballad'>('onyx');
  /** В ролевом режиме: пользователь нажал «Отметить цель выполненной» — показываем экран «Цель достигнута». */
  const [goalReached, setGoalReached] = useState(false);
  const [assessmentResult, setAssessmentResult] = useState<SpeakingAssessmentResult | null>(null);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [assessmentLoadSavedLoading, setAssessmentLoadSavedLoading] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [roleplayFeedback, setRoleplayFeedback] = useState<string | null>(null);
  const [roleplayUsefulPhrase, setRoleplayUsefulPhrase] = useState<string | null>(null);
  const [roleplayUsefulPhraseRu, setRoleplayUsefulPhraseRu] = useState<string | null>(null);
  const [roleplayStyleNote, setRoleplayStyleNote] = useState<string | null>(null);
  const [roleplayRewriteNeutral, setRoleplayRewriteNeutral] = useState<string | null>(null);
  const [roleplayFeedbackLoading, setRoleplayFeedbackLoading] = useState(false);
  const [roleplayFeedbackError, setRoleplayFeedbackError] = useState<string | null>(null);
  /** Выполненные шаги сценария (отмечает ИИ после каждого ответа). */
  const [roleplayCompletedStepIds, setRoleplayCompletedStepIds] = useState<string[]>([]);
  /** Сайдбар Roleplays справа: развёрнут/свёрнут */
  const [roleplaySidebarOpen, setRoleplaySidebarOpen] = useState(true);
  /** Секции внутри сайдбара: Задание, Цель */
  const [roleplaySidebarStepsOpen, setRoleplaySidebarStepsOpen] = useState(true);
  const [roleplaySidebarGoalOpen, setRoleplaySidebarGoalOpen] = useState(true);
  /** Сайдбар Дебаты справа: развёрнут/свёрнут */
  const [debateSidebarOpen, setDebateSidebarOpen] = useState(true);
  /** Секции внутри сайдбара дебатов: Задание, Цель */
  const [debateSidebarStepsOpen, setDebateSidebarStepsOpen] = useState(true);
  const [debateSidebarGoalOpen, setDebateSidebarGoalOpen] = useState(true);
  /** Подсказка ответа от ИИ по запросу (для roleplay и debate) */
  const [replyHintLoading, setReplyHintLoading] = useState(false);
  const [replyHintText, setReplyHintText] = useState<string | null>(null);
  const [freestyleHintMode, setFreestyleHintMode] = useState<FreestyleHintMode>('natural');
  const [freestyleSettingsOpen, setFreestyleSettingsOpen] = useState(false);
  const [freestyleSlangMode, setFreestyleSlangMode] = useState<FreestyleSlangMode>('off');
  const [freestyleAllowProfanity, setFreestyleAllowProfanity] = useState(false);
  const [freestyleAiMayUseProfanity, setFreestyleAiMayUseProfanity] = useState(false);
  const [freestyleProfanityIntensity, setFreestyleProfanityIntensity] = useState<FreestyleProfanityIntensity>('light');
  const [freestyleToneFormality, setFreestyleToneFormality] = useState(50);
  const [freestyleToneDirectness, setFreestyleToneDirectness] = useState(50);
  /** Состояния для режима дебатов */
  const [debateTopic, setDebateTopic] = useState<string | null>(null);
  const [debateTopicSource, setDebateTopicSource] = useState<'catalog' | 'custom'>('catalog');
  const [debateTopicOriginal, setDebateTopicOriginal] = useState<string | null>(null);
  const [debateTopicNormalized, setDebateTopicNormalized] = useState<string | null>(null);
  const [debateTopicLanguage, setDebateTopicLanguage] = useState<'ru' | 'en' | 'unknown'>('unknown');
  const [debateTopicValidationStatus, setDebateTopicValidationStatus] = useState<'valid' | 'warning' | 'rejected'>('valid');
  const [debateUserPosition, setDebateUserPosition] = useState<'for' | 'against' | null>(null);
  const [debateAIPosition, setDebateAIPosition] = useState<'for' | 'against' | null>(null);
  const [debateDifficulty, setDebateDifficulty] = useState<'easy' | 'medium' | 'hard' | null>(null);
  const [debateMicroGoals, setDebateMicroGoals] = useState<DebateMicroGoalId[]>([]);
  const [debateWhoStarts, setDebateWhoStarts] = useState<DebateWhoStarts>('ai');
  const [debateSettings, setDebateSettings] = useState<DebateSettings>({
    slangMode: 'off',
    allowProfanity: false,
    aiMayUseProfanity: false,
    profanityIntensity: 'light',
  });
  const [debateStarted, setDebateStarted] = useState(false);
  const [debateSetupOpen, setDebateSetupOpen] = useState(false);
  const debateStepsForCurrentDifficulty = useMemo(
    () => getDebateStepsByDifficulty(debateDifficulty ?? 'medium'),
    [debateDifficulty]
  );
  const [debateCurrentSessionId, setDebateCurrentSessionId] = useState<string | null>(null);
  const [debateCompletionId, setDebateCompletionId] = useState<string | null>(null);
  const [debateCompleted, setDebateCompleted] = useState(false);
  const [debateFeedback, setDebateFeedback] = useState<string | null>(null);
  const [debateStrengthSbi, setDebateStrengthSbi] = useState<SbiBlock | null>(null);
  const [debateImprovementSbi, setDebateImprovementSbi] = useState<SbiBlock | null>(null);
  const [debateAnalysisOpen, setDebateAnalysisOpen] = useState(false);
  const [debateStrengthOpen, setDebateStrengthOpen] = useState(false);
  const [debateGrowthOpen, setDebateGrowthOpen] = useState(false);
  const [debateUsefulPhrase, setDebateUsefulPhrase] = useState<string | null>(null);
  const [debateUsefulPhraseRu, setDebateUsefulPhraseRu] = useState<string | null>(null);
  const [debateFeedbackLoading, setDebateFeedbackLoading] = useState(false);
  const [debateFeedbackError, setDebateFeedbackError] = useState<string | null>(null);
  /** Выполненные шаги дебата (отмечает ИИ после каждого ответа) */
  const [debateCompletedStepIds, setDebateCompletedStepIds] = useState<string[]>([]);
  const roleplaySettingsPayload = useMemo(
    () =>
      selectedScenario
        ? {
            slang_mode: selectedScenario.slangMode ?? 'off',
            allow_profanity: Boolean(selectedScenario.allowProfanity),
            ai_may_use_profanity: Boolean(selectedScenario.aiMayUseProfanity),
            profanity_intensity: selectedScenario.profanityIntensity ?? 'light',
          }
        : undefined,
    [selectedScenario]
  );
  const freestyleSettingsPayload = useMemo(
    () => ({
      slang_mode: freestyleSlangMode,
      allow_profanity: Boolean(freestyleAllowProfanity),
      ai_may_use_profanity: Boolean(freestyleAllowProfanity) && Boolean(freestyleAiMayUseProfanity),
      profanity_intensity: freestyleProfanityIntensity,
    }),
    [freestyleSlangMode, freestyleAllowProfanity, freestyleAiMayUseProfanity, freestyleProfanityIntensity]
  );
  const freestyleContextPayload = useMemo(
    () => ({
      tone_formality: freestyleToneFormality,
      tone_directness: freestyleToneDirectness,
    }),
    [freestyleToneFormality, freestyleToneDirectness]
  );
  const freestyleSettingsSummary = useMemo(
    () =>
      `Сленг: ${freestyleSlangMode} / 18+: ${freestyleAllowProfanity ? 'on' : 'off'} / Формальность: ${Math.round(freestyleToneFormality / 10)}/10`,
    [freestyleSlangMode, freestyleAllowProfanity, freestyleToneFormality]
  );
  const debateSettingsPayload = useMemo(
    () => ({
      slang_mode: debateSettings.slangMode ?? 'off',
      allow_profanity: Boolean(debateSettings.allowProfanity),
      ai_may_use_profanity: Boolean(debateSettings.allowProfanity) && Boolean(debateSettings.aiMayUseProfanity),
      profanity_intensity: debateSettings.profanityIntensity ?? 'light',
    }),
    [debateSettings]
  );
  const messagesRef = useRef<Message[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number>(0);
  const cancelRequestedRef = useRef(false);
  const historyScrollRef = useRef<HTMLDivElement>(null);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [ttsLevel, setTtsLevel] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const listeningRef = useRef(false);
  const rafIdRef = useRef<number>(0);
  const ttsRafIdRef = useRef<number>(0);
  const ttsAudioContextRef = useRef<AudioContext | null>(null);
  const speakingRef = useRef(false);

  useEffect(() => {
    return () => {
      listeningRef.current = false;
      speakingRef.current = false;
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (ttsRafIdRef.current) cancelAnimationFrame(ttsRafIdRef.current);
      audioContextRef.current?.close().catch(() => { });
      ttsAudioContextRef.current?.close().catch(() => { });
      audioContextRef.current = null;
      ttsAudioContextRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (mediaRecorderRef.current?.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      mediaRecorderRef.current = null;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadToken() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (mounted && sessionData.session?.user?.id) setUserId(sessionData.session.user.id);
        let t = getBackendToken();
        if (!t && sessionData.session?.access_token) {
          const resp = await fetch(`${getApiUrl()}/api/auth/exchange-supabase-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ supabase_token: sessionData.session.access_token }),
          });
          if (resp.ok) {
            const json = await resp.json().catch(() => ({}));
            if (json?.token) {
              window.localStorage.setItem('backend_jwt', json.token);
              t = json.token;
            }
          }
        }
        if (mounted) setToken(t);
      } catch {
        if (mounted) setError('Не удалось получить токен');
      } finally {
        if (mounted) setTokenLoading(false);
      }
    }

    loadToken();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!selectedScenario) setRoleplayCompletedStepIds([]);
  }, [selectedScenario?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedVoice = window.localStorage.getItem('agent_tts_voice');
    if (savedVoice && TTS_VOICE_OPTIONS.some((opt) => opt.value === savedVoice)) {
      setTtsVoice(savedVoice as 'onyx' | 'nova' | 'ballad');
    } else {
      setTtsVoice('onyx');
      window.localStorage.setItem('agent_tts_voice', 'onyx');
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('agent_tts_voice', ttsVoice);
  }, [ttsVoice]);


  const loadAiChatSessionsList = useCallback(() => {
    if (!userId) return;
    setAiChatSessionsListLoading(true);
    supabase
      .from('ai_chat_sessions')
      .select('id, title, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        setAiChatSessionsListLoading(false);
        if (error) {
          setAiChatSessionsList([]);
          return;
        }
        setAiChatSessionsList(
          (data || []).map((row) => ({
            id: row.id,
            title: row.title || 'Чат',
            updated_at: row.updated_at || '',
          }))
        );
      });
  }, [userId]);

  const loadAiChatSession = useCallback(
    (sessionId: string) => {
      if (!userId) return;
      setAiChatLoadLoading(true);
      setAiChatCurrentId(sessionId);
      supabase
        .from('ai_chat_sessions')
        .select('messages, title')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single()
        .then(({ data, error }) => {
          setAiChatLoadLoading(false);
          if (error || !data) {
            setAiChatMessages([]);
            return;
          }
          const msgs = data.messages && Array.isArray(data.messages) ? (data.messages as Message[]) : [];
          setAiChatMessages(msgs);
        });
    },
    [userId]
  );

  const startNewAiChat = useCallback(() => {
    setAiChatCurrentId(null);
    setAiChatMessages([]);
    setAiChatHistoryPanelOpen(false);
  }, []);

  const deleteAiChatSession = useCallback(
    async (sessionId: string) => {
      if (!userId) return;
      setAiChatDeletingId(sessionId);
      await supabase.from('ai_chat_sessions').delete().eq('id', sessionId).eq('user_id', userId);
      setAiChatSessionsList((prev) => prev.filter((s) => s.id !== sessionId));
      if (aiChatCurrentId === sessionId) {
        setAiChatCurrentId(null);
        setAiChatMessages([]);
      }
      setAiChatDeletingId((id) => (id === sessionId ? null : id));
    },
    [userId, aiChatCurrentId]
  );

  useEffect(() => {
    if (!aiChatOpen || !userId) return;
    loadAiChatSessionsList();
    setAiChatCurrentId(null);
    setAiChatMessages([]);
    setAiChatHistoryPanelOpen(false);
  }, [aiChatOpen, userId, loadAiChatSessionsList]);

  useEffect(() => {
    if (!aiChatOpen || typeof window === 'undefined') return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const defaultW = Math.min(900, W - 48);
    const defaultH = Math.min(640, H - 48);
    const newPos = { x: (W - defaultW) / 2, y: (H - defaultH) / 2 };
    const newSize = { width: defaultW, height: defaultH };
    setAiChatPosition((prev) => prev ?? newPos);
    setAiChatSize((prev) => prev ?? newSize);
    aiChatPositionRef.current = aiChatPosition ?? newPos;
    aiChatSizeRef.current = aiChatSize ?? newSize;
  }, [aiChatOpen]);

  useEffect(() => {
    aiChatSizeRef.current = aiChatSize;
    aiChatPositionRef.current = aiChatPosition;
  }, [aiChatSize, aiChatPosition]);


  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onMove = (e: MouseEvent) => {
      const drag = aiChatDragStartRef.current;
      const resize = aiChatResizeStartRef.current;
      if (drag) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        const W = window.innerWidth;
        const H = window.innerHeight;
        const nx = Math.max(0, Math.min(drag.startX + dx, W - drag.boxW));
        const ny = Math.max(0, Math.min(drag.startY + dy, H - drag.boxH));
        setAiChatPosition({ x: nx, y: ny });
      } else if (resize) {
        const dx = e.clientX - resize.x;
        const dy = e.clientY - resize.y;
        const minW = 320;
        const minH = 280;
        let nw = resize.startW;
        let nh = resize.startH;
        if (resize.handle === 'e' || resize.handle === 'se') nw = Math.max(minW, resize.startW + dx);
        if (resize.handle === 's' || resize.handle === 'se') nh = Math.max(minH, resize.startH + dy);
        setAiChatSize({ width: nw, height: nh });
      }
    };
    const onUp = () => {
      aiChatDragStartRef.current = null;
      aiChatResizeStartRef.current = null;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    setSessionsLoading(true);
    supabase
      .from('agent_sessions')
      .select('id, title, messages, created_at, scenario_id, scenario_title, completed_step_ids')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(MAX_SESSIONS)
      .then(({ data, error }) => {
        if (!mounted) return;
        setSessionsLoading(false);
        if (error) return;
        const list: Session[] = (data || []).map((row) => ({
          id: row.id,
          title: row.title,
          messages: (row.messages as Message[]) || [],
          createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
          scenario_id: row.scenario_id ?? undefined,
          scenario_title: row.scenario_title ?? undefined,
          completed_step_ids: Array.isArray(row.completed_step_ids) ? row.completed_step_ids : [],
        }));
        setSessions(list);
      });
    return () => {
      mounted = false;
    };
  }, [userId]);

  useEffect(() => {
    if (state !== 'listening') {
      setRecordingElapsedMs(0);
      return;
    }
    const interval = setInterval(() => {
      if (recordingStartedAtRef.current) {
        setRecordingElapsedMs(Math.min(Date.now() - recordingStartedAtRef.current, 60000));
      }
    }, 100);
    return () => clearInterval(interval);
  }, [state]);

  const runVoiceTurn = useCallback(
    async (userText: string) => {
      if (!userText.trim() || !token) return;

      setState('thinking');
      setError(null);
      const history: Message[] = [...messagesRef.current, { role: 'user', content: userText }];
      setMessages((prev) => [...prev, { role: 'user', content: userText }]);
      setReplyHintText(null);

      let fullReply = '';

      try {
        const resp = await fetch(`${getApiUrl()}/api/agent/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            messages:
              agentMode === 'debate' && debateTopic && debateUserPosition && debateAIPosition
                ? [
                    {
                      role: 'system',
                      content: buildDebateSystemPrompt(
                        debateTopicNormalized ?? debateTopic,
                        debateUserPosition,
                        debateAIPosition,
                        debateDifficulty || undefined,
                        debateMicroGoals,
                        debateWhoStarts,
                        debateSettings
                      ),
                    },
                    ...history,
                  ]
                : buildMessagesForAgentChat(history, agentMode === 'roleplay' ? selectedScenario : null),
            max_tokens: 1500,
            scenario_steps:
              agentMode === 'roleplay' && selectedScenario?.steps?.length
                ? selectedScenario.steps.map((s) => ({
                    id: s.id,
                    titleRu: s.titleRu ?? (s as Record<string, unknown>).title_ru as string | undefined,
                    titleEn: s.titleEn ?? (s as Record<string, unknown>).title_en as string | undefined,
                  }))
                : agentMode === 'debate'
                  ? debateStepsForCurrentDifficulty.map((s) => ({
                      id: s.id,
                      titleRu: s.titleRu,
                      titleEn: s.titleEn,
                      completionCriteria: s.completionCriteria,
                    }))
                  : undefined,
            roleplay_settings:
              agentMode === 'roleplay'
                ? roleplaySettingsPayload
                : agentMode === 'debate'
                  ? debateSettingsPayload
                  : agentMode === 'chat'
                    ? freestyleSettingsPayload
                    : undefined,
            freestyle_context: agentMode === 'chat' ? freestyleContextPayload : undefined,
          }),
        });

        if (!resp.ok || !resp.body) {
          const j = await resp.json().catch(() => ({}));
          setError(j?.error || `Ошибка ${resp.status}`);
          setState('idle');
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let lastCompletedStepIds: string[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line);
              if (data.type === 'chunk' && typeof data.delta === 'string') {
                fullReply += data.delta;
              } else if (data.type === 'steps' && Array.isArray(data.completedStepIds)) {
                lastCompletedStepIds = data.completedStepIds;
                if (agentMode === 'roleplay') {
                  setRoleplayCompletedStepIds(data.completedStepIds);
                } else if (agentMode === 'debate') {
                  setDebateCompletedStepIds(data.completedStepIds);
                }
              } else if (data.type === 'done') {
                break;
              } else if (data.type === 'error') {
                setError(data.message || 'Ошибка');
                setState('idle');
                return;
              }
            } catch {
              /* ignore */
            }
          }
        }

        const newMessages: Message[] = [...history, { role: 'assistant', content: fullReply }];
        setMessages((prev) => [...prev, { role: 'assistant', content: fullReply }]);
        setReplyHintText(null);

        if (userId) {
          if (agentMode === 'debate' && debateTopic && debateUserPosition && debateAIPosition) {
            // Сохраняем сессию дебата
            const debateTitle = debateTopic.length > 50 ? debateTopic.slice(0, 50) + '…' : debateTopic;
            if (debateCurrentSessionId) {
              await supabase
                .from('debate_sessions')
                .update({
                  messages: newMessages,
                  completed_step_ids: lastCompletedStepIds.length > 0 ? lastCompletedStepIds : undefined,
                  difficulty: debateDifficulty || undefined,
                  topic_source: debateTopicSource,
                  topic_original: debateTopicOriginal ?? debateTopic,
                  topic_normalized: debateTopicNormalized ?? debateTopic,
                  topic_language: debateTopicLanguage,
                  topic_validation_status: debateTopicValidationStatus,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', debateCurrentSessionId)
                .eq('user_id', userId);
            } else {
              const { data, error } = await supabase
                .from('debate_sessions')
                .insert({
                  user_id: userId,
                  topic: debateTopic,
                  user_position: debateUserPosition,
                  ai_position: debateAIPosition,
                  difficulty: debateDifficulty || undefined,
                  topic_source: debateTopicSource,
                  topic_original: debateTopicOriginal ?? debateTopic,
                  topic_normalized: debateTopicNormalized ?? debateTopic,
                  topic_language: debateTopicLanguage,
                  topic_validation_status: debateTopicValidationStatus,
                  messages: newMessages,
                })
                .select('id, topic, user_position, ai_position, messages, created_at, updated_at')
                .single();
              if (data && !error) {
                setDebateCurrentSessionId(data.id);
              }
            }
          } else {
            // Сохраняем обычную сессию агента
            const firstUser = newMessages.find((m) => m.role === 'user');
            const title = firstUser ? trimTitle(firstUser.content) : `Разговор ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
            const scenarioPayload =
              agentMode === 'roleplay' && selectedScenario
                ? { scenario_id: selectedScenario.id, scenario_title: selectedScenario.title }
                : {};
            const stepsPayload =
              agentMode === 'roleplay' && selectedScenario?.steps?.length
                ? { completed_step_ids: lastCompletedStepIds }
                : {};
            if (currentSessionId) {
              await supabase
                .from('agent_sessions')
                .update({ title, messages: newMessages, ...scenarioPayload, ...stepsPayload })
                .eq('id', currentSessionId)
                .eq('user_id', userId);
              setSessions((prev) =>
                prev.map((s) =>
                  s.id === currentSessionId
                    ? { ...s, title, messages: newMessages, ...scenarioPayload, ...stepsPayload }
                    : s
                )
              );
            } else {
              const { data, error } = await supabase
                .from('agent_sessions')
                .insert({
                  user_id: userId,
                  title,
                  messages: newMessages,
                  ...scenarioPayload,
                  ...stepsPayload,
                })
                .select('id, title, messages, created_at, scenario_id, scenario_title, completed_step_ids')
              .single();
              if (!error && data) {
                const newSession: Session = {
                  id: data.id,
                  title: data.title,
                  messages: (data.messages as Message[]) || [],
                  createdAt: data.created_at ? new Date(data.created_at).getTime() : Date.now(),
                  scenario_id: data.scenario_id ?? undefined,
                  scenario_title: data.scenario_title ?? undefined,
                  completed_step_ids: Array.isArray(data.completed_step_ids) ? data.completed_step_ids : [],
                };
                setCurrentSessionId(data.id);
                setSessions((prev) => [newSession, ...prev.slice(0, MAX_SESSIONS - 1)]);
              }
            }
          }
        }

        if (!fullReply.trim()) {
          setState('idle');
          return;
        }

        setState('speaking');
        const ttsResp = await fetch(`${getApiUrl()}/api/agent/tts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ text: fullReply.trim(), voice: ttsVoice }),
        });

        if (!ttsResp.ok) {
          setError('Ошибка озвучки');
          setState('idle');
          return;
        }

        const blob = await ttsResp.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        speakingRef.current = true;
        setTtsLevel(0);

        const cleanupTtsAnalyser = () => {
          speakingRef.current = false;
          if (ttsRafIdRef.current) cancelAnimationFrame(ttsRafIdRef.current);
          ttsRafIdRef.current = 0;
          ttsAudioContextRef.current?.close().catch(() => { });
          ttsAudioContextRef.current = null;
          setTtsLevel(0);
        };

        audio.onended = () => {
          cleanupTtsAnalyser();
          URL.revokeObjectURL(url);
          setState('idle');
        };
        audio.onerror = () => {
          cleanupTtsAnalyser();
          URL.revokeObjectURL(url);
          setState('idle');
        };
        await audio.play();

        const TtsContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (TtsContextClass) {
          const ctx = new TtsContextClass();
          const source = ctx.createMediaElementSource(audio);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.7;
          source.connect(analyser);
          source.connect(ctx.destination);
          ttsAudioContextRef.current = ctx;
          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          const tick = () => {
            if (!speakingRef.current) return;
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;
            const normalized = Math.min(1, avg / 80);
            setTtsLevel((prev) => prev * 0.65 + normalized * 0.35);
            ttsRafIdRef.current = requestAnimationFrame(tick);
          };
          ttsRafIdRef.current = requestAnimationFrame(tick);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка сети');
        setState('idle');
      }
    },
    [
      token,
      userId,
      currentSessionId,
      selectedScenario,
      agentMode,
      ttsVoice,
      debateTopic,
      debateTopicSource,
      debateTopicOriginal,
      debateTopicNormalized,
      debateTopicLanguage,
      debateTopicValidationStatus,
      debateUserPosition,
      debateAIPosition,
      debateDifficulty,
      debateMicroGoals,
      debateStepsForCurrentDifficulty,
      debateWhoStarts,
      debateSettings,
      debateCurrentSessionId,
      roleplaySettingsPayload,
      debateSettingsPayload,
      freestyleSettingsPayload,
      freestyleContextPayload,
    ]
  );

  /** Генерация первой реплики ИИ при старте дебата */
  const requestDebateFirstMessage = useCallback(
    async (
      topic: string,
      userPosition: 'for' | 'against',
      aiPosition: 'for' | 'against',
      difficulty?: 'easy' | 'medium' | 'hard',
      microGoalIds: DebateMicroGoalId[] = [],
      topicMeta?: DebateTopicMeta,
      whoStarts: DebateWhoStarts = 'ai',
      settings?: DebateSettings
    ) => {
      if (!token) return;
      setMessages([]);
      setDebateCurrentSessionId(null);
      setError(null);
      setState('thinking');

      let fullReply = '';

      try {
        const resp = await fetch(`${getApiUrl()}/api/agent/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            messages: [
              {
                role: 'system',
                content: buildDebateSystemPrompt(normalizeDebateTopic(topic), userPosition, aiPosition, difficulty, microGoalIds, whoStarts, settings),
              },
              {
                role: 'user',
                content: 'The debate is starting now. Open the conversation naturally.',
              },
            ],
            max_tokens: 1500,
            roleplay_settings: settings
              ? {
                  slang_mode: settings.slangMode ?? 'off',
                  allow_profanity: Boolean(settings.allowProfanity),
                  ai_may_use_profanity: Boolean(settings.allowProfanity) && Boolean(settings.aiMayUseProfanity),
                  profanity_intensity: settings.profanityIntensity ?? 'light',
                }
              : undefined,
          }),
        });

        if (!resp.ok || !resp.body) {
          const j = await resp.json().catch(() => ({}));
          setError(j?.error || `Ошибка ${resp.status}`);
          setState('idle');
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line);
              if (data.type === 'chunk' && typeof data.delta === 'string') {
                fullReply += data.delta;
                setMessages([{ role: 'assistant', content: fullReply }]);
              } else if (data.type === 'done') {
                break;
              } else if (data.type === 'error') {
                setError(data.message || 'Ошибка');
                setState('idle');
                return;
              }
            } catch {
              // Игнорируем некорректные JSON строки
            }
          }
        }

        if (!fullReply.trim()) {
          setError('Пустой ответ от ИИ');
          setState('idle');
          return;
        }

        const assistantMessage: Message = { role: 'assistant', content: fullReply.trim() };
        setMessages([assistantMessage]);

        // Сохраняем сессию в БД
        if (userId) {
          const debateTitle = topic.length > 50 ? topic.slice(0, 50) + '…' : topic;
          const { data, error: dbError } = await supabase
            .from('debate_sessions')
            .insert({
              user_id: userId,
              topic: topic,
              user_position: userPosition,
              ai_position: aiPosition,
              difficulty: difficulty || undefined,
              topic_source: topicMeta?.source ?? 'catalog',
              topic_original: topicMeta?.original ?? topic,
              topic_normalized: topicMeta?.normalized ?? topic,
              topic_language: topicMeta?.language ?? 'unknown',
              topic_validation_status: topicMeta?.validationStatus ?? 'valid',
              messages: [assistantMessage],
            })
            .select('id, topic, user_position, ai_position, messages, created_at')
            .single();

          if (!dbError && data) {
            const newSession: Session = {
              id: data.id,
              title: debateTitle,
              messages: (data.messages as Message[]) || [],
              createdAt: data.created_at ? new Date(data.created_at).getTime() : Date.now(),
            };
            setDebateCurrentSessionId(data.id);
            setSessions((prev) => [newSession, ...prev.slice(0, MAX_SESSIONS - 1)]);
          }
        }

        // Озвучиваем первую реплику
        setState('speaking');
        const ttsResp = await fetch(`${getApiUrl()}/api/agent/tts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ text: fullReply.trim(), voice: ttsVoice }),
        });

        if (!ttsResp.ok) {
          setError('Ошибка озвучки');
          setState('idle');
          return;
        }

        const blob = await ttsResp.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        speakingRef.current = true;
        setTtsLevel(0);

        const cleanupTtsAnalyser = () => {
          speakingRef.current = false;
          if (ttsRafIdRef.current) cancelAnimationFrame(ttsRafIdRef.current);
          ttsRafIdRef.current = 0;
          ttsAudioContextRef.current?.close().catch(() => {});
          ttsAudioContextRef.current = null;
          setTtsLevel(0);
        };

        audio.onended = () => {
          cleanupTtsAnalyser();
          URL.revokeObjectURL(url);
          setState('idle');
        };

        audio.onerror = () => {
          cleanupTtsAnalyser();
          URL.revokeObjectURL(url);
          setState('idle');
        };

        await audio.play();

        const TtsContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (TtsContextClass) {
          const ctx = new TtsContextClass();
          const source = ctx.createMediaElementSource(audio);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.7;
          source.connect(analyser);
          source.connect(ctx.destination);
          ttsAudioContextRef.current = ctx;
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            if (!speakingRef.current) return;
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const normalized = Math.min(1, (sum / dataArray.length) / 80);
            setTtsLevel((prev) => prev * 0.65 + normalized * 0.35);
            ttsRafIdRef.current = requestAnimationFrame(tick);
          };
          ttsRafIdRef.current = requestAnimationFrame(tick);
        }
      } catch (err) {
        console.error('[requestDebateFirstMessage] error:', err);
        setError(err instanceof Error ? err.message : 'Ошибка генерации первой реплики');
        setState('idle');
      }
    },
    [token, userId, ttsVoice]
  );

  // Обработчик смены режима - сброс дебата при переходе в другой режим
  const handleModeChange = useCallback(
    (mode: 'chat' | 'roleplay' | 'debate') => {
      setAgentMode(mode);
      if (mode === 'chat') {
        setFreestyleSettingsOpen(false);
        setSelectedScenario(null);
        setDebateStarted(false);
        setDebateCompleted(false);
        setDebateTopic(null);
        setDebateTopicSource('catalog');
        setDebateTopicOriginal(null);
        setDebateTopicNormalized(null);
        setDebateTopicLanguage('unknown');
        setDebateTopicValidationStatus('valid');
        setDebateUserPosition(null);
        setDebateAIPosition(null);
        setDebateDifficulty(null);
        setDebateMicroGoals([]);
        setDebateSettings({ slangMode: 'off', allowProfanity: false, aiMayUseProfanity: false, profanityIntensity: 'light' });
        setDebateCurrentSessionId(null);
        setDebateSetupOpen(false);
        setDebateFeedback(null);
        setDebateStrengthSbi(null);
        setDebateImprovementSbi(null);
        setDebateAnalysisOpen(false);
        setDebateStrengthOpen(false);
        setDebateGrowthOpen(false);
        setDebateUsefulPhrase(null);
        setDebateUsefulPhraseRu(null);
        setDebateFeedbackError(null);
        setDebateCompletedStepIds([]);
        setDebateCompletionId(null);
      } else if (mode === 'roleplay') {
        setDebateStarted(false);
        setDebateCompleted(false);
        setDebateTopic(null);
        setDebateTopicSource('catalog');
        setDebateTopicOriginal(null);
        setDebateTopicNormalized(null);
        setDebateTopicLanguage('unknown');
        setDebateTopicValidationStatus('valid');
        setDebateUserPosition(null);
        setDebateAIPosition(null);
        setDebateDifficulty(null);
        setDebateMicroGoals([]);
        setDebateSettings({ slangMode: 'off', allowProfanity: false, aiMayUseProfanity: false, profanityIntensity: 'light' });
        setDebateCurrentSessionId(null);
        setDebateSetupOpen(false);
        setDebateFeedback(null);
        setDebateStrengthSbi(null);
        setDebateImprovementSbi(null);
        setDebateAnalysisOpen(false);
        setDebateStrengthOpen(false);
        setDebateGrowthOpen(false);
        setDebateUsefulPhrase(null);
        setDebateUsefulPhraseRu(null);
        setDebateFeedbackError(null);
        setDebateCompletedStepIds([]);
        setDebateCompletionId(null);
      } else if (mode === 'debate') {
        setSelectedScenario(null);
        // Модал открывается через dropdown, не автоматически
      }
    },
    [debateStarted]
  );

  const runAiChat = useCallback(async () => {
    const text = aiChatInput.trim();
    if (!text || !token || aiChatLoading) return;
    const userMessage: Message = { role: 'user', content: text };
    setAiChatMessages((prev) => [...prev, userMessage]);
    setAiChatInput('');
    setAiChatLoading(true);
    let fullReply = '';
    try {
      const history = [...aiChatMessages, userMessage];
      const resp = await fetch(`${getApiUrl()}/api/agent/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: history,
          max_tokens: 1500,
        }),
      });
      if (!resp.ok || !resp.body) {
        const j = await resp.json().catch(() => ({}));
        setAiChatMessages((prev) => prev.slice(0, -1));
        setAiChatInput(text);
        setAiChatLoading(false);
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.type === 'chunk' && typeof data.delta === 'string') fullReply += data.delta;
            else if (data.type === 'done') break;
            else if (data.type === 'error') {
              setAiChatMessages((prev) => prev.slice(0, -1));
              setAiChatInput(text);
              setAiChatLoading(false);
              return;
            }
          } catch {
            /* ignore */
          }
        }
      }
      const newMessages: Message[] = [...aiChatMessages, userMessage, { role: 'assistant', content: fullReply.trim() }];
      setAiChatMessages(newMessages);
      if (userId) {
        const title = text.length > 80 ? `${text.slice(0, 77)}…` : text;
        const payload = { messages: newMessages, updated_at: new Date().toISOString() };
        if (aiChatCurrentId) {
          supabase
            .from('ai_chat_sessions')
            .update({ ...payload, ...(aiChatMessages.length === 0 && { title }) })
            .eq('id', aiChatCurrentId)
            .eq('user_id', userId)
            .then(() => { })
            .catch(() => { });
          if (aiChatMessages.length === 0) {
            setAiChatSessionsList((prev) =>
              prev.map((s) => (s.id === aiChatCurrentId ? { ...s, title, updated_at: payload.updated_at } : s))
            );
          } else {
            setAiChatSessionsList((prev) =>
              prev.map((s) => (s.id === aiChatCurrentId ? { ...s, updated_at: payload.updated_at } : s))
            );
          }
        } else {
          supabase
            .from('ai_chat_sessions')
            .insert({ user_id: userId, title, messages: newMessages, updated_at: payload.updated_at })
            .select('id, title, updated_at')
            .single()
            .then(({ data }) => {
              if (data) {
                setAiChatCurrentId(data.id);
                setAiChatSessionsList((prev) => [{ id: data.id, title: data.title || title, updated_at: data.updated_at || '' }, ...prev]);
              }
            })
            .catch(() => { });
        }
      }
    } catch (e) {
      setAiChatMessages((prev) => prev.slice(0, -1));
      setAiChatInput(text);
    } finally {
      setAiChatLoading(false);
    }
  }, [token, userId, aiChatMessages, aiChatInput, aiChatLoading, aiChatCurrentId]);


  /** При выборе сценария: если есть characterOpening — показываем его и озвучиваем; иначе пользователь начинает первым. */
  const requestScenarioFirstMessage = useCallback(
    async (scenario: RoleplayScenario) => {
      if (!token) return;
      setMessages([]);
      setCurrentSessionId(null);
      setError(null);
      const openingLine = scenario.characterOpening?.trim();
      if (openingLine) {
        const assistantMessage: Message = { role: 'assistant', content: openingLine };
        setMessages([assistantMessage]);
        if (userId) {
          const title = scenario.title;
          const scenarioPayload = { scenario_id: scenario.id, scenario_title: scenario.title };
          const { data, error } = await supabase
            .from('agent_sessions')
            .insert({
              user_id: userId,
              title,
              messages: [assistantMessage],
              ...scenarioPayload,
            })
            .select('id, title, messages, created_at, scenario_id, scenario_title')
            .single();
          if (!error && data) {
            const newSession: Session = {
              id: data.id,
              title: data.title,
              messages: (data.messages as Message[]) || [],
              createdAt: data.created_at ? new Date(data.created_at).getTime() : Date.now(),
              scenario_id: data.scenario_id ?? undefined,
              scenario_title: data.scenario_title ?? undefined,
            };
            setCurrentSessionId(data.id);
            setSessions((prev) => [newSession, ...prev.slice(0, MAX_SESSIONS - 1)]);
          }
        }
        setState('speaking');
        const ttsResp = await fetch(`${getApiUrl()}/api/agent/tts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ text: openingLine, voice: ttsVoice }),
        });
        if (!ttsResp.ok) {
          setError('Ошибка озвучки');
          setState('idle');
          return;
        }
        const blob = await ttsResp.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        speakingRef.current = true;
        setTtsLevel(0);
        const cleanupTtsAnalyser = () => {
          speakingRef.current = false;
          if (ttsRafIdRef.current) cancelAnimationFrame(ttsRafIdRef.current);
          ttsRafIdRef.current = 0;
          ttsAudioContextRef.current?.close().catch(() => { });
          ttsAudioContextRef.current = null;
          setTtsLevel(0);
        };
        audio.onended = () => {
          cleanupTtsAnalyser();
          URL.revokeObjectURL(url);
          setState('idle');
        };
        audio.onerror = () => {
          cleanupTtsAnalyser();
          URL.revokeObjectURL(url);
          setState('idle');
        };
        await audio.play();
        const TtsContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (TtsContextClass) {
          const ctx = new TtsContextClass();
          const source = ctx.createMediaElementSource(audio);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.7;
          source.connect(analyser);
          source.connect(ctx.destination);
          ttsAudioContextRef.current = ctx;
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            if (!speakingRef.current) return;
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const normalized = Math.min(1, (sum / dataArray.length) / 80);
            setTtsLevel((prev) => prev * 0.65 + normalized * 0.35);
            ttsRafIdRef.current = requestAnimationFrame(tick);
          };
          ttsRafIdRef.current = requestAnimationFrame(tick);
        }
        return;
      }
      // Нет жёсткой первой реплики — пользователь начинает диалог первым
      setState('idle');
    },
    [token, userId, ttsVoice]
  );

  // Обработчик начала дебата
  const handleStartDebate = useCallback(
    (
      topic: string,
      userPosition: 'for' | 'against',
      difficulty?: 'easy' | 'medium' | 'hard',
      microGoalIds: DebateMicroGoalId[] = [],
      topicMeta?: DebateTopicMeta,
      whoStarts?: DebateWhoStarts,
      startDebateSettings?: DebateSettings
    ) => {
      const normalizedTopic = normalizeDebateTopic(topicMeta?.normalized ?? topic);
      setDebateTopic(normalizedTopic);
      setDebateTopicSource(topicMeta?.source ?? 'catalog');
      setDebateTopicOriginal(topicMeta?.original ?? topic);
      setDebateTopicNormalized(normalizedTopic);
      setDebateTopicLanguage(topicMeta?.language ?? 'unknown');
      setDebateTopicValidationStatus(topicMeta?.validationStatus ?? 'valid');
      setDebateUserPosition(userPosition);
      setDebateAIPosition(userPosition === 'for' ? 'against' : 'for');
      setDebateDifficulty(difficulty || 'medium');
      setDebateMicroGoals(microGoalIds);
      setDebateWhoStarts(whoStarts || 'ai');
      setDebateSettings({
        slangMode: startDebateSettings?.slangMode ?? 'off',
        allowProfanity: Boolean(startDebateSettings?.allowProfanity),
        aiMayUseProfanity: Boolean(startDebateSettings?.allowProfanity) && Boolean(startDebateSettings?.aiMayUseProfanity),
        profanityIntensity: startDebateSettings?.profanityIntensity ?? 'light',
      });
      setDebateStarted(true);
      setDebateSetupOpen(false);
      setMessages([]);
      setDebateCurrentSessionId(null);
      setDebateCompletionId(null);
      setDebateCompletedStepIds([]);
      setDebateFeedback(null);
      setDebateStrengthSbi(null);
      setDebateImprovementSbi(null);
      setDebateAnalysisOpen(false);
      setDebateStrengthOpen(false);
      setDebateGrowthOpen(false);
      setDebateUsefulPhrase(null);
      setDebateUsefulPhraseRu(null);
      setDebateFeedbackError(null);
    },
    []
  );

  // Автоматически запрашиваем первую реплику ИИ при старте дебата (только если ИИ начинает)
  const debateFirstMessageRequestedRef = useRef(false);
  useEffect(() => {
    if (
      debateStarted &&
      debateWhoStarts === 'ai' &&
      debateTopic &&
      debateUserPosition &&
      debateAIPosition &&
      messages.length === 0 &&
      token &&
      state === 'idle' &&
      !debateFirstMessageRequestedRef.current
    ) {
      debateFirstMessageRequestedRef.current = true;
      requestDebateFirstMessage(
        debateTopic,
        debateUserPosition,
        debateAIPosition,
        debateDifficulty || undefined,
        debateMicroGoals,
        {
          source: debateTopicSource,
          original: debateTopicOriginal ?? debateTopic,
          normalized: debateTopicNormalized ?? debateTopic,
          language: debateTopicLanguage,
          validationStatus: debateTopicValidationStatus,
        },
        debateWhoStarts,
        debateSettings
      );
    }
    // Сбрасываем флаг при сбросе дебата
    if (!debateStarted) {
      debateFirstMessageRequestedRef.current = false;
    }
  }, [
    debateStarted,
    debateWhoStarts,
    debateTopic,
    debateUserPosition,
    debateAIPosition,
    debateDifficulty,
    debateMicroGoals,
    debateTopicSource,
    debateTopicOriginal,
    debateTopicNormalized,
    debateTopicLanguage,
    debateTopicValidationStatus,
    debateSettings,
    messages.length,
    token,
    state,
    requestDebateFirstMessage,
  ]);

  const handleSelectScenario = useCallback(
    (scenario: RoleplayScenario) => {
      setGoalReached(false);
      setAssessmentResult(null);
      setAssessmentError(null);
      setRoleplayFeedback(null);
      setRoleplayUsefulPhrase(null);
      setRoleplayUsefulPhraseRu(null);
      setRoleplayStyleNote(null);
      setRoleplayRewriteNeutral(null);
      setRoleplayFeedbackError(null);
      setSelectedScenario(scenario);
      requestScenarioFirstMessage(scenario);
    },
    [requestScenarioFirstMessage]
  );

  const handleGoalReachedRestart = useCallback(() => {
    if (!selectedScenario) return;
    setGoalReached(false);
    setAssessmentResult(null);
    setAssessmentError(null);
    setRoleplayFeedback(null);
    setRoleplayUsefulPhrase(null);
    setRoleplayUsefulPhraseRu(null);
    setRoleplayStyleNote(null);
    setRoleplayRewriteNeutral(null);
    setRoleplayFeedbackError(null);
    setMessages([]);
    setCurrentSessionId(null);
    requestScenarioFirstMessage(selectedScenario);
  }, [selectedScenario, requestScenarioFirstMessage]);

  const handleGoalReachedOtherScenario = useCallback(() => {
    setGoalReached(false);
    setSelectedScenario(null);
    setRoleplayFeedback(null);
    setRoleplayUsefulPhrase(null);
    setRoleplayUsefulPhraseRu(null);
    setRoleplayStyleNote(null);
    setRoleplayRewriteNeutral(null);
    setRoleplayFeedbackError(null);
    setMessages([]);
    setCurrentSessionId(null);
    setScenarioModalOpen(true);
  }, []);

  /** Сброс (выход) из диалога досрочно — во всех режимах */
  const handleExitDialogue = useCallback(() => {
    setMessages([]);
    setCurrentSessionId(null);
    setSelectedSessionId(null);
    setError(null);
    setGoalReached(false);
    setRoleplayFeedback(null);
    setRoleplayUsefulPhrase(null);
    setRoleplayUsefulPhraseRu(null);
    setRoleplayStyleNote(null);
    setRoleplayRewriteNeutral(null);
    setRoleplayFeedbackError(null);
    setAssessmentResult(null);
    setAssessmentError(null);
    setRoleplayCompletedStepIds([]);
    setSelectedScenario(null);
    setReplyHintText(null);
    // Сброс состояний дебата
    setDebateCompleted(false);
    setDebateFeedback(null);
    setDebateStrengthSbi(null);
    setDebateImprovementSbi(null);
    setDebateAnalysisOpen(false);
    setDebateStrengthOpen(false);
    setDebateGrowthOpen(false);
    setDebateUsefulPhrase(null);
    setDebateUsefulPhraseRu(null);
    setDebateFeedbackError(null);
    setDebateCompletedStepIds([]);
    setDebateCompleted(false);
    setDebateStarted(false);
    setDebateTopic(null);
    setDebateTopicSource('catalog');
    setDebateTopicOriginal(null);
    setDebateTopicNormalized(null);
    setDebateTopicLanguage('unknown');
    setDebateTopicValidationStatus('valid');
    setDebateUserPosition(null);
    setDebateAIPosition(null);
    setDebateDifficulty(null);
    setDebateMicroGoals([]);
    setDebateSettings({ slangMode: 'off', allowProfanity: false, aiMayUseProfanity: false, profanityIntensity: 'light' });
    setDebateCurrentSessionId(null);
    setDebateCompletionId(null);
  }, []);

  const requestRoleplayFeedback = useCallback(async () => {
    if (!token || !selectedScenario) return;
    if (messages.filter((m) => m.role === 'user').length === 0) return;
    setRoleplayFeedbackLoading(true);
    setRoleplayFeedbackError(null);
    try {
      const resp = await fetch(`${getApiUrl()}/api/agent/roleplay-feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages,
          scenario_id: selectedScenario.id,
          scenario_title: selectedScenario.title,
          goal: selectedScenario.goal ?? undefined,
          goal_ru: selectedScenario.goalRu ?? undefined,
          roleplay_settings: roleplaySettingsPayload,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setRoleplayFeedbackError(data?.error || `Ошибка ${resp.status}`);
        return;
      }
      const feedbackText = typeof data?.feedback === 'string' ? data.feedback : '';
      const usefulPhrase = typeof data?.useful_phrase === 'string' && data.useful_phrase.trim() ? data.useful_phrase.trim() : null;
      const usefulPhraseRu = typeof data?.useful_phrase_ru === 'string' && data.useful_phrase_ru.trim() ? data.useful_phrase_ru.trim() : null;
      const styleNote = typeof data?.style_note === 'string' && data.style_note.trim() ? data.style_note.trim() : null;
      const rewriteNeutral = typeof data?.rewrite_neutral === 'string' && data.rewrite_neutral.trim() ? data.rewrite_neutral.trim() : null;
      setRoleplayFeedback(feedbackText || null);
      setRoleplayUsefulPhrase(usefulPhrase);
      setRoleplayUsefulPhraseRu(usefulPhraseRu);
      setRoleplayStyleNote(styleNote);
      setRoleplayRewriteNeutral(rewriteNeutral);
      if (userId && selectedScenario && feedbackText) {
        const { data: latest } = await supabase
          .from('roleplay_completions')
          .select('id')
          .eq('user_id', userId)
          .eq('scenario_id', selectedScenario.id)
          .order('completed_at', { ascending: false })
          .limit(1)
          .single();
        if (latest?.id) {
          await supabase
            .from('roleplay_completions')
            .update({
              feedback: feedbackText,
              useful_phrase_en: usefulPhrase ?? null,
              useful_phrase_ru: usefulPhraseRu ?? null,
            })
            .eq('id', latest.id);
        }
      }
    } catch (e) {
      setRoleplayFeedbackError(e instanceof Error ? e.message : 'Ошибка сети');
    } finally {
      setRoleplayFeedbackLoading(false);
    }
  }, [token, userId, selectedScenario, messages, roleplaySettingsPayload]);

  useEffect(() => {
    if (!goalReached || agentMode !== 'roleplay' || !selectedScenario) return;
    if (roleplayFeedback || roleplayFeedbackLoading || roleplayFeedbackError) return;
    requestRoleplayFeedback();
  }, [goalReached, agentMode, selectedScenario, roleplayFeedback, roleplayFeedbackLoading, roleplayFeedbackError, requestRoleplayFeedback]);

  const requestDebateFeedback = useCallback(async () => {
    if (!token || !debateTopic || !debateUserPosition || !debateAIPosition) return;
    if (messages.filter((m) => m.role === 'user').length === 0) return;
    setDebateFeedbackLoading(true);
    setDebateFeedbackError(null);
    try {
      const resp = await fetch(`${getApiUrl()}/api/agent/debate-feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages,
          topic: debateTopic,
          user_position: debateUserPosition,
          ai_position: debateAIPosition,
          roleplay_settings: debateSettingsPayload,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setDebateFeedbackError(data?.error || `Ошибка ${resp.status}`);
        return;
      }
      const feedbackText =
        typeof data?.feedback_short_ru === 'string' && data.feedback_short_ru.trim()
          ? data.feedback_short_ru.trim()
          : typeof data?.feedback === 'string'
            ? data.feedback.trim()
            : '';
      const usefulPhrase =
        typeof data?.next_try_phrase_en === 'string' && data.next_try_phrase_en.trim()
          ? data.next_try_phrase_en.trim()
          : typeof data?.useful_phrase === 'string' && data.useful_phrase.trim()
            ? data.useful_phrase.trim()
            : null;
      const usefulPhraseRu =
        typeof data?.next_try_phrase_ru === 'string' && data.next_try_phrase_ru.trim()
          ? data.next_try_phrase_ru.trim()
          : typeof data?.useful_phrase_ru === 'string' && data.useful_phrase_ru.trim()
            ? data.useful_phrase_ru.trim()
            : null;
      const parseSbi = (raw: unknown): SbiBlock | null => {
        if (!raw || typeof raw !== 'object') return null;
        const situation = typeof (raw as any).situation === 'string' ? (raw as any).situation.trim() : '';
        const behavior = typeof (raw as any).behavior === 'string' ? (raw as any).behavior.trim() : '';
        const impact = typeof (raw as any).impact === 'string' ? (raw as any).impact.trim() : '';
        if (!situation && !behavior && !impact) return null;
        return { situation, behavior, impact };
      };
      const strengthSbi = parseSbi(data?.strength_sbi);
      const improvementSbi = parseSbi(data?.improvement_sbi);
      setDebateFeedback(feedbackText || null);
      setDebateStrengthSbi(strengthSbi);
      setDebateImprovementSbi(improvementSbi);
      setDebateUsefulPhrase(usefulPhrase);
      setDebateUsefulPhraseRu(usefulPhraseRu);
      // Сохраняем фидбек в БД (если сессия существует)
      if (userId && debateCurrentSessionId && feedbackText) {
        await supabase
          .from('debate_sessions')
          .update({
            feedback: {
              feedback: feedbackText,
              feedback_short_ru: feedbackText,
              strength_sbi: strengthSbi,
              improvement_sbi: improvementSbi,
              next_try_phrase_en: usefulPhrase,
              next_try_phrase_ru: usefulPhraseRu,
              useful_phrase: usefulPhrase,
              useful_phrase_ru: usefulPhraseRu,
            },
          })
          .eq('id', debateCurrentSessionId);
      }
      // Обновляем фидбек в debate_completions
      if (userId && feedbackText) {
        if (debateCompletionId) {
          await supabase
            .from('debate_completions')
            .update({
              feedback: feedbackText,
              useful_phrase_en: usefulPhrase,
              useful_phrase_ru: usefulPhraseRu,
              feedback_json: {
                feedback_short_ru: feedbackText,
                strength_sbi: strengthSbi,
                improvement_sbi: improvementSbi,
                next_try_phrase_en: usefulPhrase,
                next_try_phrase_ru: usefulPhraseRu,
              },
            })
            .eq('id', debateCompletionId)
            .eq('user_id', userId);
        } else if (debateCurrentSessionId) {
          // Fallback: обновим последнюю completion, привязанную к текущей сессии
          await supabase
            .from('debate_completions')
            .update({
              feedback: feedbackText,
              useful_phrase_en: usefulPhrase,
              useful_phrase_ru: usefulPhraseRu,
              feedback_json: {
                feedback_short_ru: feedbackText,
                strength_sbi: strengthSbi,
                improvement_sbi: improvementSbi,
                next_try_phrase_en: usefulPhrase,
                next_try_phrase_ru: usefulPhraseRu,
              },
            })
            .eq('user_id', userId)
            .eq('debate_session_id', debateCurrentSessionId);
        }
      }
    } catch (e) {
      setDebateFeedbackError(e instanceof Error ? e.message : 'Ошибка сети');
    } finally {
      setDebateFeedbackLoading(false);
    }
  }, [token, userId, debateTopic, debateUserPosition, debateAIPosition, messages, debateCurrentSessionId, debateCompletionId, debateSettingsPayload]);

  // Сохранение завершения дебата в debate_completions
  const saveDebateCompletion = useCallback(async () => {
    if (!userId || !debateTopic || !debateUserPosition || !debateAIPosition) return;
    if (debateCompletionId) return debateCompletionId;
    
    // Находим topicRu для системных тем
    const topicData = DEBATE_TOPICS.find((dt) => dt.topic === debateTopic || dt.topicRu === debateTopic);
    const topicRu = topicData?.topicRu || null;
    
    const completionData: {
      user_id: string;
      topic: string;
      topic_ru?: string | null;
      topic_source?: 'catalog' | 'custom';
      topic_original?: string | null;
      topic_normalized?: string | null;
      topic_language?: 'ru' | 'en' | 'unknown';
      topic_validation_status?: 'valid' | 'warning' | 'rejected';
      user_position: 'for' | 'against';
      ai_position: 'for' | 'against';
      difficulty?: 'easy' | 'medium' | 'hard' | null;
      completed_step_ids?: string[] | null;
      debate_session_id?: string | null;
      step_schema_version?: string;
      micro_goals?: Array<{ goal_id: string; goal_label: string }> | null;
    } = {
      user_id: userId,
      topic: debateTopic,
      topic_ru: topicRu,
      topic_source: debateTopicSource,
      topic_original: debateTopicOriginal ?? debateTopic,
      topic_normalized: debateTopicNormalized ?? debateTopic,
      topic_language: debateTopicLanguage,
      topic_validation_status: debateTopicValidationStatus,
      user_position: debateUserPosition,
      ai_position: debateAIPosition,
      difficulty: debateDifficulty || null,
      completed_step_ids: debateCompletedStepIds.length > 0 ? debateCompletedStepIds : null,
      debate_session_id: debateCurrentSessionId || null,
      step_schema_version: 'v2',
      micro_goals:
        debateMicroGoals.length > 0
          ? debateMicroGoals.map((id) => {
              const goal = getDebateMicroGoalsByDifficulty(debateDifficulty ?? 'medium').find((g) => g.id === id);
              return { goal_id: id, goal_label: goal?.labelEn ?? id };
            })
          : null,
    };

    try {
      const { data, error } = await supabase
        .from('debate_completions')
        .insert(completionData)
        .select('id')
        .single();
      
      if (error) {
        console.error('Error saving debate completion:', error);
      } else {
        // Сохраняем ID завершения для последующего обновления фидбека и оценки
        setDebateCompletionId(data?.id || null);
        return data?.id;
      }
    } catch (err) {
      console.error('Error saving debate completion:', err);
    }
    return null;
  }, [
    userId,
    debateTopic,
    debateTopicSource,
    debateTopicOriginal,
    debateTopicNormalized,
    debateTopicLanguage,
    debateTopicValidationStatus,
    debateUserPosition,
    debateAIPosition,
    debateDifficulty,
    debateMicroGoals,
    debateCompletedStepIds,
    debateCurrentSessionId,
    debateCompletionId,
  ]);

  // Автоматически запрашиваем фидбек при завершении дебата
  useEffect(() => {
    if (!debateCompleted || agentMode !== 'debate') return;
    if (debateFeedback || debateFeedbackLoading || debateFeedbackError) return;
    
    // Сохраняем завершение дебата перед запросом фидбека
    saveDebateCompletion().then(() => {
      requestDebateFeedback();
    });
  }, [debateCompleted, agentMode, debateFeedback, debateFeedbackLoading, debateFeedbackError, requestDebateFeedback, saveDebateCompletion]);

  const requestAssessment = useCallback(async () => {
    if (!token || !userId) return;
    const userMessages = messages.filter((m) => m.role === 'user');
    if (userMessages.length === 0) return;
    let completionIdForUpdate: string | null = debateCompletionId;
    if (agentMode === 'debate' && !completionIdForUpdate) {
      const savedCompletionId = await saveDebateCompletion();
      completionIdForUpdate = savedCompletionId ?? null;
    }
    setAssessmentLoading(true);
    setAssessmentError(null);
    setAssessmentResult(null);
    try {
      const resp = await fetch(`${getApiUrl()}/api/agent/assess-speaking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages,
          scenario_id: agentMode === 'debate' ? null : selectedScenario?.id ?? null,
          scenario_title: agentMode === 'debate' ? null : selectedScenario?.title ?? null,
          format: agentMode === 'debate' ? 'debate' : 'dialogue',
          agent_session_id: agentMode === 'debate' ? debateCurrentSessionId ?? null : currentSessionId ?? null,
          goal: agentMode === 'debate' ? undefined : selectedScenario?.goal ?? undefined,
          steps: agentMode === 'debate' ? debateStepsForCurrentDifficulty : selectedScenario?.steps ?? undefined,
          topic: agentMode === 'debate' ? debateTopic ?? undefined : undefined,
          user_position: agentMode === 'debate' ? debateUserPosition ?? undefined : undefined,
          roleplay_settings:
            agentMode === 'roleplay'
              ? roleplaySettingsPayload
              : agentMode === 'debate'
                ? debateSettingsPayload
                : undefined,
          micro_goals:
            agentMode === 'debate'
              ? debateMicroGoals.map((id) => {
                  const goal = getDebateMicroGoalsByDifficulty(debateDifficulty ?? 'medium').find((g) => g.id === id);
                  return { goal_id: id, goal_label: goal?.labelEn ?? id };
                })
              : undefined,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setAssessmentError(data?.error || `Ошибка ${resp.status}`);
        return;
      }
      const result = data as SpeakingAssessmentResult;
      setAssessmentResult(result);
      const { data: assessmentData, error: assessmentError } = await supabase
        .from('speaking_assessments')
        .insert({
          user_id: userId,
          // Для дебатов привязка оценки хранится в debate_completions.assessment_id.
          // speaking_assessments.agent_session_id связан с agent_sessions и не подходит для debate_sessions.
          agent_session_id: agentMode === 'debate' ? null : currentSessionId ?? null,
          scenario_id: result.scenario_id ?? null,
          scenario_title: result.scenario_title ?? null,
          format: result.format,
          criteria_scores: result.criteria_scores,
          overall_score: result.overall_score,
          feedback: result.feedback,
          user_messages: result.user_messages,
        })
        .select('id')
        .single();
      if (assessmentError) {
        setAssessmentError(assessmentError.message);
        return;
      }
      // Сохраняем assessment_id в debate_sessions и debate_completions, если это дебат
      if (agentMode === 'debate' && assessmentData?.id) {
        if (debateCurrentSessionId) {
          await supabase
            .from('debate_sessions')
            .update({ assessment_id: assessmentData.id })
            .eq('id', debateCurrentSessionId);
        }
        if (userId) {
          if (completionIdForUpdate) {
            await supabase
              .from('debate_completions')
              .update({ assessment_id: assessmentData.id })
              .eq('id', completionIdForUpdate)
              .eq('user_id', userId);
          } else if (debateCurrentSessionId) {
            // Fallback: обновим completion по связи с сессией
            await supabase
              .from('debate_completions')
              .update({ assessment_id: assessmentData.id })
              .eq('user_id', userId)
              .eq('debate_session_id', debateCurrentSessionId);
          }
        }
      }
    } catch (e) {
      setAssessmentError(e instanceof Error ? e.message : 'Ошибка сети');
    } finally {
      setAssessmentLoading(false);
    }
  }, [token, userId, messages, selectedScenario, currentSessionId, agentMode, debateTopic, debateUserPosition, debateCurrentSessionId, debateCompletionId, saveDebateCompletion, debateMicroGoals, debateDifficulty, debateStepsForCurrentDifficulty, roleplaySettingsPayload, debateSettingsPayload]);

  const requestReplyHint = useCallback(async () => {
    if (!token || messages.length === 0) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant?.content?.trim()) return;
    const historyPayload = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }))
      .filter((m) => typeof m.content === 'string' && m.content.trim().length > 0)
      .slice(-10);
    setReplyHintLoading(true);
    setReplyHintText(null);
    try {
      let bodyPayload: Record<string, unknown> | null = null;
      if (agentMode === 'roleplay') {
        if (!selectedScenario) return;
        const stepsPayload = selectedScenario.steps?.length
          ? {
              steps: selectedScenario.steps.map((s) => ({
                id: s.id,
                titleRu: s.titleRu ?? (s as Record<string, unknown>).title_ru,
                titleEn: s.titleEn ?? (s as Record<string, unknown>).title_en,
              })),
              completed_step_ids: roleplayCompletedStepIds,
            }
          : {};
        bodyPayload = {
          mode: 'roleplay',
          last_assistant_message: lastAssistant.content.trim(),
          history: historyPayload,
          goal: selectedScenario.goal ?? undefined,
          goal_ru: selectedScenario.goalRu ?? undefined,
          level: (selectedScenario as { level?: string }).level ?? 'B1',
          roleplay_settings: roleplaySettingsPayload,
          ...stepsPayload,
        };
      } else if (agentMode === 'debate') {
        if (!debateStarted || !debateTopic || !debateUserPosition || !debateAIPosition) return;
        bodyPayload = {
          mode: 'debate',
          last_assistant_message: lastAssistant.content.trim(),
          history: historyPayload,
          goal_ru: DEBATE_GOAL_RU,
          level: debateDifficulty ?? 'medium',
          topic: debateTopic,
          user_position: debateUserPosition,
          ai_position: debateAIPosition,
          roleplay_settings: debateSettingsPayload,
          steps: debateStepsForCurrentDifficulty.map((s) => ({
            id: s.id,
            titleRu: s.titleRu,
            titleEn: s.titleEn,
          })),
          completed_step_ids: debateCompletedStepIds,
        };
      } else if (agentMode === 'chat') {
        bodyPayload = {
          mode: 'chat',
          last_assistant_message: lastAssistant.content.trim(),
          history: historyPayload,
          level: 'B1',
          roleplay_settings: freestyleSettingsPayload,
          freestyle_context: freestyleContextPayload,
          hint_mode: freestyleHintMode,
        };
      } else {
        return;
      }
      const resp = await fetch(`${getApiUrl()}/api/agent/reply-hint`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(bodyPayload),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setReplyHintText(typeof data?.error === 'string' ? data.error : 'Не удалось загрузить подсказку');
        return;
      }
      setReplyHintText(typeof data?.hint === 'string' ? data.hint.trim() : '');
    } catch (e) {
      setReplyHintText(e instanceof Error ? e.message : 'Ошибка сети');
    } finally {
      setReplyHintLoading(false);
    }
  }, [
    token,
    messages,
    agentMode,
    selectedScenario,
    roleplayCompletedStepIds,
    debateStarted,
    debateTopic,
    debateUserPosition,
    debateAIPosition,
    debateDifficulty,
    debateStepsForCurrentDifficulty,
    debateCompletedStepIds,
    freestyleSettingsPayload,
    freestyleContextPayload,
    freestyleHintMode,
    roleplaySettingsPayload,
    debateSettingsPayload,
  ]);

  const applyFreestylePreset = useCallback((preset: 'neutral' | 'light_slang' | 'heavy_slang' | 'adult_user' | 'adult_dual') => {
    if (preset === 'neutral') {
      setFreestyleSlangMode('off');
      setFreestyleAllowProfanity(false);
      setFreestyleAiMayUseProfanity(false);
      setFreestyleProfanityIntensity('light');
      setFreestyleToneFormality(50);
      setFreestyleToneDirectness(50);
      return;
    }
    if (preset === 'light_slang') {
      setFreestyleSlangMode('light');
      setFreestyleAllowProfanity(false);
      setFreestyleAiMayUseProfanity(false);
      setFreestyleProfanityIntensity('light');
      setFreestyleToneFormality(35);
      setFreestyleToneDirectness(50);
      return;
    }
    if (preset === 'heavy_slang') {
      setFreestyleSlangMode('heavy');
      setFreestyleAllowProfanity(false);
      setFreestyleAiMayUseProfanity(false);
      setFreestyleProfanityIntensity('light');
      setFreestyleToneFormality(25);
      setFreestyleToneDirectness(60);
      return;
    }
    if (preset === 'adult_user') {
      setFreestyleSlangMode('light');
      setFreestyleAllowProfanity(true);
      setFreestyleAiMayUseProfanity(false);
      setFreestyleProfanityIntensity('medium');
      setFreestyleToneFormality(40);
      setFreestyleToneDirectness(65);
      return;
    }
    setFreestyleSlangMode('heavy');
    setFreestyleAllowProfanity(true);
    setFreestyleAiMayUseProfanity(true);
    setFreestyleProfanityIntensity('medium');
    setFreestyleToneFormality(30);
    setFreestyleToneDirectness(75);
  }, []);

  const clearAssessment = useCallback(() => {
    setAssessmentResult(null);
    setAssessmentError(null);
  }, []);

  const loadSavedAssessment = useCallback(async (sessionId: string) => {
    setAssessmentError(null);
    setAssessmentLoadSavedLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from('speaking_assessments')
        .select('*')
        .eq('agent_session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error || !rows?.length) {
        setAssessmentError('Для этого диалога оценка не сохранялась.');
        return;
      }
      const row = rows[0] as {
        criteria_scores: import('@/lib/speaking-assessment').CriteriaScores;
        overall_score: number | null;
        feedback: import('@/lib/speaking-assessment').AssessmentFeedback;
        user_messages: string[];
        format: import('@/lib/speaking-assessment').AssessmentFormat;
        scenario_id?: string | null;
        scenario_title?: string | null;
        agent_session_id?: string | null;
      };
      const result: SpeakingAssessmentResult = {
        criteria_scores: row.criteria_scores,
        overall_score: row.overall_score ?? 0,
        feedback: row.feedback ?? {},
        user_messages: row.user_messages ?? [],
        format: row.format,
        scenario_id: row.scenario_id ?? null,
        scenario_title: row.scenario_title ?? null,
        agent_session_id: row.agent_session_id ?? null,
      };
      setAssessmentResult(result);
    } catch {
      setAssessmentError('Не удалось загрузить оценку.');
    } finally {
      setAssessmentLoadSavedLoading(false);
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (state !== 'idle' && state !== 'listening') return;
    if (!token) return;
    cancelRequestedRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      setVolumeLevel(0);
      listeningRef.current = true;

      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);
        audioContextRef.current = ctx;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (!listeningRef.current) {
            ctx.close().catch(() => { });
            return;
          }
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const avg = sum / dataArray.length;
          const normalized = Math.min(1, avg / 100);
          setVolumeLevel((prev) => prev * 0.6 + normalized * 0.4);
          rafIdRef.current = requestAnimationFrame(tick);
        };
        rafIdRef.current = requestAnimationFrame(tick);
      }

      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        mediaRecorderRef.current = null;
        listeningRef.current = false;
        if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
        audioContextRef.current?.close().catch(() => { });
        audioContextRef.current = null;
        setVolumeLevel(0);
        if (cancelRequestedRef.current) {
          cancelRequestedRef.current = false;
          setState('idle');
          return;
        }
        const duration = recordingStartedAtRef.current
          ? Date.now() - recordingStartedAtRef.current
          : 0;
        const blob = new Blob(chunksRef.current, { type: mime });
        chunksRef.current = [];
        if (blob.size === 0) {
          setState('idle');
          return;
        }
        setError(null);
        setState('thinking');
        try {
          const fd = new FormData();
          fd.append('audio', blob, 'recording.webm');
          const resp = await fetch(`${getApiUrl()}/api/agent/stt`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
          });
          const data = await resp.json().catch(() => ({}));
          if (resp.ok && data?.text) {
            await runVoiceTurn(data.text);
          } else if (!resp.ok) {
            setError(data?.error || `Ошибка распознавания (${resp.status})`);
            setState('idle');
          } else {
            setState('idle');
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Ошибка STT');
          setState('idle');
        }
      };
      recordingStartedAtRef.current = Date.now();
      mr.start();
      setState('listening');
    } catch {
      setError('Нет доступа к микрофону');
    }
  }, [token, state, runVoiceTurn]);

  const stopRecording = useCallback(() => {
    if (state !== 'listening' || !mediaRecorderRef.current) return;
    listeningRef.current = false;
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = 0;
    audioContextRef.current?.close().catch(() => { });
    audioContextRef.current = null;
    setVolumeLevel(0);
    if (mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, [state]);

  const cancelRecording = useCallback(() => {
    if (state !== 'listening' || !mediaRecorderRef.current) return;
    cancelRequestedRef.current = true;
    listeningRef.current = false;
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = 0;
    audioContextRef.current?.close().catch(() => { });
    audioContextRef.current = null;
    setVolumeLevel(0);
    setState('idle');
    if (mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, [state]);

  const handleRecordClick = useCallback(
    () => {
      if (state === 'idle') startRecording();
      else if (state === 'listening') stopRecording();
    },
    [state, startRecording, stopRecording]
  );

  const selectSession = useCallback((id: string) => {
    setSelectedSessionId(id);
    setHistoryOpen(false);
  }, []);

  const deleteSession = useCallback(
    async (id: string) => {
      if (!userId || deletingId) return;
      setDeletingId(id);
      const { error } = await supabase.from('agent_sessions').delete().eq('id', id).eq('user_id', userId);
      setDeletingId(null);
      if (error) return;
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (selectedSessionId === id) setSelectedSessionId(null);
      if (currentSessionId === id) {
        setCurrentSessionId(null);
        setMessages([]);
        setSubtitlesVisible(false);
      }
    },
    [userId, selectedSessionId, currentSessionId]
  );

  const selectedSession = selectedSessionId ? sessions.find((s) => s.id === selectedSessionId) : null;
  const conversationMessages = selectedSession ? selectedSession.messages : messages;
  /** Для карты шагов: при просмотре сессии из истории берём сохранённые completed_step_ids, иначе — текущий state */
  const roleplayStepsCompletedIds =
    selectedSession && selectedSession.scenario_id === selectedScenario?.id && Array.isArray(selectedSession.completed_step_ids)
      ? selectedSession.completed_step_ids
      : roleplayCompletedStepIds;

  if (tokenLoading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 380,
          gap: '1.5rem',
          background: 'radial-gradient(ellipse 80% 50% at 50% 40%, rgba(99, 102, 241, 0.06), transparent 60%)',
          borderRadius: 24,
        }}
      >
        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(139, 92, 246, 0.2))',
            animation: 'agent-orb-breathe 2s ease-in-out infinite',
          }}
        />
        <p style={{ margin: 0, fontSize: '0.9375rem', color: 'var(--sidebar-text)', opacity: 0.8 }}>
          Подключение…
        </p>
      </div>
    );
  }

  if (!token) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 380,
          gap: '1.25rem',
          padding: '2rem',
          background: 'radial-gradient(ellipse 80% 50% at 50% 40%, rgba(99, 102, 241, 0.05), transparent 60%)',
          borderRadius: 24,
          border: '1px dashed var(--sidebar-border)',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: 'var(--sidebar-hover)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--sidebar-text)',
            opacity: 0.7,
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </svg>
        </div>
        <p style={{ margin: 0, fontSize: '1rem', color: 'var(--sidebar-text)', opacity: 0.9, textAlign: 'center' }}>
          Войдите в аккаунт, чтобы говорить с агентом
        </p>
      </div>
    );
  }

  const isUserStartsDebateEmpty = agentMode === 'debate' && debateStarted && debateWhoStarts === 'user' && messages.length === 0 && state === 'idle';
  const statusText =
    state === 'listening'
      ? 'Говорите… Нажмите ещё раз — отправить'
      : state === 'thinking'
        ? 'Думаю…'
        : state === 'speaking'
          ? 'Говорю…'
          : isUserStartsDebateEmpty
            ? 'Ваша очередь — начните дебат!'
            : 'Нажмите, чтобы начать запись';

  const speakingGlow = 0.22 + ttsLevel * 0.12;
  const speakingBlur = 18 + ttsLevel * 8;
  const orbShadow =
    state === 'listening'
      ? '0 0 0 4px rgba(99, 102, 241, 0.35), 0 0 70px 24px rgba(99, 102, 241, 0.3)'
      : state === 'thinking'
        ? '0 0 50px 16px rgba(139, 92, 246, 0.25), 0 0 0 2px rgba(139, 92, 246, 0.2)'
        : state === 'speaking'
          ? `0 0 ${speakingBlur}px ${Math.round(speakingBlur * 0.6)}px rgba(34, 197, 94, ${speakingGlow}), 0 0 0 2px rgba(34, 197, 94, ${0.15 + ttsLevel * 0.08})`
          : '0 0 40px 0 rgba(99, 102, 241, 0.12), 0 24px 56px -16px rgba(0, 0, 0, 0.4)';

  const orbGradient =
    state === 'listening'
      ? 'radial-gradient(120% 120% at 35% 25%, rgba(165, 180, 252, 0.95), rgba(99, 102, 241, 0.9) 45%, rgba(79, 70, 229, 0.85))'
      : state === 'thinking'
        ? 'radial-gradient(120% 120% at 35% 25%, rgba(196, 181, 253, 0.9), rgba(139, 92, 246, 0.85) 45%, rgba(124, 58, 237, 0.8))'
        : state === 'speaking'
          ? 'radial-gradient(120% 120% at 35% 25%, rgba(134, 239, 172, 0.85), rgba(34, 197, 94, 0.8) 45%, rgba(22, 163, 74, 0.75))'
          : 'radial-gradient(120% 120% at 35% 25%, rgba(203, 213, 225, 0.5), rgba(148, 163, 184, 0.35) 50%, rgba(100, 116, 139, 0.4))';

  return (
    <div style={{ display: 'flex', width: '100%', flex: 1, minHeight: 0, gap: 0 }}>
      {/* Боковая панель истории */}
      <aside
        style={{
          width: historyOpen ? 280 : 0,
          minWidth: historyOpen ? 280 : 0,
          overflow: 'hidden',
          borderRight: historyOpen ? '1px solid var(--sidebar-border)' : 'none',
          background: 'var(--sidebar-hover)',
          borderRadius: '12px 0 0 12px',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.25s ease, min-width 0.25s ease',
        }}
      >
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--sidebar-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--sidebar-text)' }}>История</span>
          <button
            type="button"
            onClick={() => setHistoryOpen(false)}
            aria-label="Закрыть историю"
            style={{
              padding: '0.35rem',
              border: 'none',
              borderRadius: 8,
              background: 'transparent',
              color: 'var(--sidebar-text)',
              cursor: 'pointer',
              opacity: 0.8,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 0.75rem 1rem' }}>
          {sessionsLoading ? (
            <p style={{ fontSize: '0.8125rem', color: 'var(--sidebar-text)', opacity: 0.7, margin: '1rem 0' }}>Загрузка…</p>
          ) : (
            <>
              {sessions.map((s) => (
                <div
                  key={s.id}
                  style={{
                    width: '100%',
                    marginBottom: 4,
                    borderRadius: 10,
                    background: selectedSessionId === s.id ? 'var(--sidebar-active)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => selectSession(s.id)}
                    style={{
                      flex: 1,
                      padding: '0.65rem 0.75rem',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--sidebar-text)',
                      fontSize: '0.8125rem',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      minWidth: 0,
                    }}
                  >
                    <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
                    <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{formatSessionDate(s.createdAt)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                    disabled={deletingId === s.id}
                    aria-label="Удалить разговор"
                    title="Удалить"
                    style={{
                      flexShrink: 0,
                      padding: '0.4rem',
                      marginRight: 4,
                      border: 'none',
                      borderRadius: 8,
                      background: 'transparent',
                      color: 'var(--sidebar-text)',
                      opacity: deletingId === s.id ? 0.5 : 0.6,
                      cursor: deletingId === s.id ? 'default' : 'pointer',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                  </button>
                </div>
              ))}
              {sessions.length === 0 && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--sidebar-text)', opacity: 0.6, margin: '1rem 0' }}>Пока пусто</p>
              )}
            </>
          )}
        </div>
      </aside>
      {/* Боковая панель истории диалога */}
      <aside
        style={{
          width: subtitlesVisible ? 320 : 0,
          minWidth: subtitlesVisible ? 320 : 0,
          overflow: 'hidden',
          borderRight: subtitlesVisible ? '1px solid var(--sidebar-border)' : 'none',
          background: 'var(--sidebar-hover)',
          borderRadius: historyOpen ? 0 : '12px 0 0 12px',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.25s ease, min-width 0.25s ease',
        }}
      >
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--sidebar-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--sidebar-text)' }}>История диалога</span>
          <button
            type="button"
            onClick={() => setSubtitlesVisible(false)}
            aria-label="Закрыть историю диалога"
            style={{
              padding: '0.35rem',
              border: 'none',
              borderRadius: 8,
              background: 'transparent',
              color: 'var(--sidebar-text)',
              cursor: 'pointer',
              opacity: 0.8,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 0.75rem 1rem' }}>
          {conversationMessages.length === 0 ? (
            <p style={{ fontSize: '0.8125rem', color: 'var(--sidebar-text)', opacity: 0.6, margin: '1rem 0' }}>Пока пусто</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {conversationMessages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '88%',
                    padding: '0.75rem 1rem',
                    borderRadius: 14,
                    background: m.role === 'user' ? 'var(--sidebar-active)' : 'var(--sidebar-bg)',
                    border: '1px solid var(--sidebar-border)',
                    fontSize: '0.875rem',
                    lineHeight: 1.45,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: 'var(--sidebar-text)',
                  }}
                >
                  {m.content}
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: selectedSession ? 'flex-start' : 'center',
          padding: '2.5rem 1.5rem',
          overflowY: 'auto',
          background: 'radial-gradient(ellipse 100% 70% at 50% 30%, rgba(99, 102, 241, 0.08), transparent 55%), radial-gradient(ellipse 80% 40% at 50% 80%, rgba(139, 92, 246, 0.04), transparent 50%)',
          borderRadius: historyOpen || subtitlesVisible ? '0 28px 28px 0' : 28,
          border: '1px solid var(--sidebar-border)',
        }}
      >
        {!historyOpen && (
          <>
            <div
              style={{
                position: 'absolute',
                top: '1.25rem',
                left: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '0.5rem',
              }}
            >
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                aria-label="Открыть историю"
                title="История разговоров"
                className="agent-toolbar-btn"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 8v4l3 3" /><circle cx="12" cy="12" r="10" />
                </svg>
                <span>История</span>
              </button>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSubtitlesVisible((v) => !v)}
                  aria-expanded={subtitlesVisible}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1.125rem',
                    borderRadius: 999,
                    border: '1px solid var(--sidebar-border)',
                    background: subtitlesVisible ? 'var(--sidebar-active)' : 'var(--sidebar-hover)',
                    color: 'var(--sidebar-text)',
                    fontSize: '0.8125rem',
                    opacity: 0.9,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '1';
                    e.currentTarget.style.background = 'var(--sidebar-active)';
                  }}
                  onMouseLeave={(e) => {
                    if (!subtitlesVisible) e.currentTarget.style.background = 'var(--sidebar-hover)';
                    e.currentTarget.style.opacity = '0.9';
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  {subtitlesVisible ? 'Скрыть субтитры' : 'Показать субтитры'}
                </button>
              )}
            </div>
            <div
              style={{
                position: 'absolute',
                top: '1.25rem',
                right: '2.5rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '0.75rem',
                maxWidth: 'calc(100% - 2.5rem)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setTranslatorOpen(true)}
                  aria-label="Открыть переводчик"
                  title="Переводчик"
                  className="agent-toolbar-btn"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 5h12" />
                    <path d="M9 3v2" />
                    <path d="M4 12h6" />
                    <path d="M13 16l4 4 4-4" />
                    <path d="M13 20h8" />
                    <path d="M5 5c1.5 3.5 4 6 7 7" />
                    <path d="M12 5c-1.5 3.5-4 6-7 7" />
                  </svg>
                  <span>Переводчик</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAiChatOpen(true)}
                  aria-label="Чат с ИИ"
                  title="Чат с ИИ"
                  className="agent-toolbar-btn"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span>ИИ</span>
                </button>
                <RoleplayModeUI
                  placement="bar"
                  mode={agentMode}
                  onModeChange={handleModeChange}
                  selectedScenario={selectedScenario}
                  onSelectScenario={handleSelectScenario}
                  onClearScenario={() => setSelectedScenario(null)}
                  scenarioModalOpen={scenarioModalOpen}
                  onScenarioModalOpenChange={setScenarioModalOpen}
                  scenarioView={scenarioView}
                  onScenarioViewChange={setScenarioView}
                  onCopyToMineSuccess={(id) => {
                    setScenarioView('my');
                    setHighlightedUserScenarioId(id);
                  }}
                  debateSetupOpen={debateSetupOpen}
                  onDebateSetupOpenChange={setDebateSetupOpen}
                  debateView={debateView}
                  onDebateViewChange={setDebateView}
                />
                {scenarioModalOpen && (scenarioView === 'create' || scenarioView === 'my') && (
                  <PersonalScenariosUI
                    initialView={scenarioView}
                    highlightedScenarioId={highlightedUserScenarioId}
                    onSelectScenario={(s) => {
                      setSelectedScenario(s);
                      setScenarioModalOpen(false);
                      setHighlightedUserScenarioId(null);
                    }}
                    onClose={() => {
                      setScenarioModalOpen(false);
                      setHighlightedUserScenarioId(null);
                    }}
                  />
                )}
              </div>
              {agentMode === 'chat' && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    width: 'min(360px, 100%)',
                    alignSelf: 'flex-end',
                    padding: '0.7rem',
                    borderRadius: 12,
                    border: '1px solid var(--sidebar-border)',
                    background: 'var(--sidebar-hover)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setFreestyleSettingsOpen((v) => !v)}
                    aria-expanded={freestyleSettingsOpen}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--sidebar-text)',
                      padding: 0,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.8 }}>
                        Настройки фристайла
                      </span>
                      <span style={{ fontSize: '0.75rem', opacity: 0.72, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {freestyleSettingsSummary}
                      </span>
                    </div>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ transform: freestyleSettingsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', flexShrink: 0, opacity: 0.85 }}
                      aria-hidden
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateRows: freestyleSettingsOpen ? '1fr' : '0fr',
                      transition: 'grid-template-rows 0.24s ease',
                    }}
                  >
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '0.65rem', paddingTop: '0.65rem', borderTop: '1px solid var(--sidebar-border)' }}>
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                          {([
                            { id: 'neutral', label: 'Нейтрально' },
                            { id: 'light_slang', label: 'Легкий сленг' },
                            { id: 'heavy_slang', label: 'Активный сленг' },
                            { id: 'adult_user', label: '18+ (только пользователь)' },
                            { id: 'adult_dual', label: '18+ (оба)' },
                          ] as const).map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => applyFreestylePreset(preset.id)}
                              style={{
                                border: '1px solid var(--sidebar-border)',
                                background: 'var(--sidebar-bg)',
                                color: 'var(--sidebar-text)',
                                borderRadius: 999,
                                padding: '0.24rem 0.6rem',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--sidebar-text)' }}>
                            <span>Сленг</span>
                            <select
                              value={freestyleSlangMode}
                              onChange={(e) => setFreestyleSlangMode(e.target.value as FreestyleSlangMode)}
                              style={{ borderRadius: 8, border: '1px solid var(--sidebar-border)', background: 'var(--sidebar-bg)', color: 'var(--sidebar-text)', padding: '0.2rem 0.45rem', fontSize: '0.8rem' }}
                            >
                              <option value="off">off</option>
                              <option value="light">light</option>
                              <option value="heavy">heavy</option>
                            </select>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--sidebar-text)' }}>
                            <input
                              type="checkbox"
                              checked={freestyleAllowProfanity}
                              onChange={(e) => {
                                const next = e.target.checked;
                                setFreestyleAllowProfanity(next);
                                if (!next) setFreestyleAiMayUseProfanity(false);
                              }}
                            />
                            18+ включен
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--sidebar-text)', opacity: freestyleAllowProfanity ? 1 : 0.6 }}>
                            <input
                              type="checkbox"
                              checked={freestyleAiMayUseProfanity}
                              disabled={!freestyleAllowProfanity}
                              onChange={(e) => setFreestyleAiMayUseProfanity(e.target.checked)}
                            />
                            ИИ может использовать 18+
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--sidebar-text)', opacity: freestyleAllowProfanity ? 1 : 0.6 }}>
                            <span>Интенсивность</span>
                            <select
                              value={freestyleProfanityIntensity}
                              disabled={!freestyleAllowProfanity}
                              onChange={(e) => setFreestyleProfanityIntensity(e.target.value as FreestyleProfanityIntensity)}
                              style={{ borderRadius: 8, border: '1px solid var(--sidebar-border)', background: 'var(--sidebar-bg)', color: 'var(--sidebar-text)', padding: '0.2rem 0.45rem', fontSize: '0.8rem' }}
                            >
                              <option value="light">light</option>
                              <option value="medium">medium</option>
                              <option value="hard">hard</option>
                            </select>
                          </label>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--sidebar-text)' }}>
                            <span style={{ minWidth: 58, opacity: 0.85 }}>Формальность</span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              value={freestyleToneFormality}
                              onChange={(e) => setFreestyleToneFormality(Number(e.target.value))}
                              style={{ flex: 1 }}
                            />
                            <span style={{ width: 28, textAlign: 'right', opacity: 0.7 }}>{Math.round(freestyleToneFormality / 10)}</span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--sidebar-text)' }}>
                            <span style={{ minWidth: 58, opacity: 0.85 }}>Прямота</span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              value={freestyleToneDirectness}
                              onChange={(e) => setFreestyleToneDirectness(Number(e.target.value))}
                              style={{ flex: 1 }}
                            />
                            <span style={{ width: 28, textAlign: 'right', opacity: 0.7 }}>{Math.round(freestyleToneDirectness / 10)}</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {agentMode === 'roleplay' && selectedScenario && (
                <div
                  style={{
                    width: 280,
                    flexShrink: 0,
                    borderRadius: 12,
                    border: '1px solid var(--sidebar-border)',
                    background: 'var(--sidebar-hover)',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setRoleplaySidebarOpen((v) => !v)}
                    aria-expanded={roleplaySidebarOpen}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                      padding: '0.625rem 0.875rem',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--sidebar-text)',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <span>Задание и подсказки</span>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      style={{ transform: roleplaySidebarOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}
                      aria-hidden
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {roleplaySidebarOpen && (
                    <div style={{ padding: '0 0.875rem 0.875rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '60vh', overflowY: 'auto' }}>
                      {selectedScenario.steps && selectedScenario.steps.length > 0 && (
                        <section style={{ border: '1px solid var(--sidebar-border)', borderRadius: 10, padding: '0.75rem', background: 'var(--sidebar-bg)' }}>
                          <button
                            type="button"
                            onClick={() => setRoleplaySidebarStepsOpen((v) => !v)}
                            aria-expanded={roleplaySidebarStepsOpen}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--sidebar-text)',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                              cursor: 'pointer',
                              padding: 0,
                              marginBottom: roleplaySidebarStepsOpen ? '0.5rem' : 0,
                            }}
                          >
                            Задание
                            <span style={{ opacity: 0.7 }}>{roleplaySidebarStepsOpen ? '▼' : '▶'}</span>
                          </button>
                          {roleplaySidebarStepsOpen &&
                            (selectedScenario.steps as { id: string; order: number; titleRu: string }[])
                              .slice()
                              .sort((a, b) => a.order - b.order)
                              .map((step) => {
                                const done = roleplayStepsCompletedIds.includes(step.id);
                                return (
                                  <div
                                    key={step.id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.5rem',
                                      fontSize: '0.875rem',
                                      lineHeight: 1.4,
                                      color: 'var(--sidebar-text)',
                                      opacity: done ? 0.85 : 1,
                                      marginTop: '0.35rem',
                                    }}
                                  >
                                    {done ? (
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" style={{ flexShrink: 0 }} aria-hidden>
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                    ) : (
                                      <span style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid var(--sidebar-border)', flexShrink: 0 }} aria-hidden />
                                    )}
                                    <span>{step.titleRu}</span>
                                  </div>
                                );
                              })}
                          {(() => {
                            const steps = selectedScenario.steps as { id: string }[] | undefined;
                            const allStepsDone = !steps || steps.length === 0 || steps.every((s) => roleplayStepsCompletedIds.includes(s.id));
                            const canMarkGoal = !selectedSessionId && allStepsDone;
                            if (!canMarkGoal) return null;
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  setGoalReached(true);
                                  if (userId && selectedScenario) {
                                    const payload: { user_id: string; scenario_id: string; scenario_title: string | null; scenario_level?: string | null; completed_step_ids?: string[] } = {
                                      user_id: userId,
                                      scenario_id: selectedScenario.id,
                                      scenario_title: selectedScenario.title ?? null,
                                      scenario_level: (selectedScenario as { level?: string }).level ?? null,
                                    };
                                    if (selectedScenario.steps?.length) {
                                      payload.completed_step_ids = roleplayCompletedStepIds;
                                    }
                                    supabase
                                      .from('roleplay_completions')
                                      .insert(payload)
                                      .then(() => {})
                                      .catch(() => {});
                                  }
                                }}
                                style={{
                                  marginTop: '0.75rem',
                                  width: '100%',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '0.5rem',
                                  padding: '0.5rem 0.75rem',
                                  borderRadius: 8,
                                  border: '1px solid rgba(34, 197, 94, 0.4)',
                                  background: 'rgba(34, 197, 94, 0.12)',
                                  color: 'rgba(34, 197, 94, 0.95)',
                                  fontSize: '0.8125rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                Цель достигнута
                              </button>
                            );
                          })()}
                        </section>
                      )}
                      {(!selectedScenario.steps || selectedScenario.steps.length === 0) && !selectedSessionId && (
                        <section style={{ border: '1px solid var(--sidebar-border)', borderRadius: 10, padding: '0.75rem', background: 'var(--sidebar-bg)' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--sidebar-text)', opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Задание
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setGoalReached(true);
                              if (userId && selectedScenario) {
                                supabase
                                  .from('roleplay_completions')
                                  .insert({
                                    user_id: userId,
                                    scenario_id: selectedScenario.id,
                                    scenario_title: selectedScenario.title ?? null,
                                    scenario_level: (selectedScenario as { level?: string }).level ?? null,
                                  })
                                  .then(() => {})
                                  .catch(() => {});
                              }
                            }}
                            style={{
                              marginTop: '0.5rem',
                              width: '100%',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.5rem',
                              padding: '0.5rem 0.75rem',
                              borderRadius: 8,
                              border: '1px solid rgba(34, 197, 94, 0.4)',
                              background: 'rgba(34, 197, 94, 0.12)',
                              color: 'rgba(34, 197, 94, 0.95)',
                              fontSize: '0.8125rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Цель достигнута
                          </button>
                        </section>
                      )}
                      {(selectedScenario.goalRu || selectedScenario.goal) && (
                        <section style={{ border: '1px solid rgba(34, 197, 94, 0.5)', borderRadius: 10, padding: '0.75rem', background: 'rgba(34, 197, 94, 0.06)' }}>
                          <button
                            type="button"
                            onClick={() => setRoleplaySidebarGoalOpen((v) => !v)}
                            aria-expanded={roleplaySidebarGoalOpen}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--sidebar-text)',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                              cursor: 'pointer',
                              padding: 0,
                              marginBottom: roleplaySidebarGoalOpen ? '0.5rem' : 0,
                            }}
                          >
                            Цель задания
                            <span style={{ opacity: 0.7 }}>{roleplaySidebarGoalOpen ? '▼' : '▶'}</span>
                          </button>
                          {roleplaySidebarGoalOpen && (
                            <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.45, color: 'var(--sidebar-text)', opacity: 0.95 }}>
                              {selectedScenario.goalRu ?? selectedScenario.goal}
                            </p>
                          )}
                        </section>
                      )}
                      {messages.length > 0 && messages[messages.length - 1]?.role === 'assistant' && (
                        <section style={{ border: '1px solid rgba(251, 191, 36, 0.4)', borderRadius: 10, padding: '0.75rem', background: 'rgba(251, 191, 36, 0.06)' }}>
                          <button
                            type="button"
                            onClick={requestReplyHint}
                            disabled={replyHintLoading}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.5rem',
                              border: 'none',
                              padding: '0.5rem 0.75rem',
                              borderRadius: 8,
                              background: replyHintLoading ? 'rgba(251, 191, 36, 0.1)' : 'rgba(251, 191, 36, 0.12)',
                              color: 'rgba(251, 191, 36, 0.98)',
                              fontSize: '0.8125rem',
                              fontWeight: 600,
                              cursor: replyHintLoading ? 'default' : 'pointer',
                              opacity: replyHintLoading ? 0.8 : 1,
                            }}
                            title="Получить подсказку ответа от ИИ под ваш уровень"
                          >
                            {replyHintLoading ? (
                              <>
                                <span style={{ animation: 'agent-dots 1.2s ease-in-out infinite' }}>·</span>
                                <span style={{ animation: 'agent-dots 1.2s ease-in-out infinite', animationDelay: '150ms' }}>·</span>
                                <span style={{ animation: 'agent-dots 1.2s ease-in-out infinite', animationDelay: '300ms' }}>·</span>
                              </>
                            ) : (
                              <>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <circle cx="12" cy="12" r="10" />
                                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                                  <line x1="12" y1="17" x2="12.01" y2="17" />
                                </svg>
                                Подсказка ответа
                              </>
                            )}
                          </button>
                          {(replyHintLoading || replyHintText !== null) && (
                            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(251, 191, 36, 0.2)' }}>
                              {replyHintLoading ? (
                                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--sidebar-text)', opacity: 0.8 }}>
                                  ИИ подбирает естественную фразу…
                                </p>
                              ) : replyHintText !== null && replyHintText !== '' ? (
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                                  <p style={{ margin: 0, fontSize: '0.8125rem', lineHeight: 1.5, color: 'var(--sidebar-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}>
                                    {replyHintText}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => setReplyHintText(null)}
                                    aria-label="Скрыть подсказку"
                                    style={{
                                      padding: '0.2rem',
                                      border: 'none',
                                      background: 'transparent',
                                      color: 'var(--sidebar-text)',
                                      opacity: 0.6,
                                      cursor: 'pointer',
                                      borderRadius: 4,
                                      fontSize: '1rem',
                                      lineHeight: 1,
                                      flexShrink: 0,
                                    }}
                                  >
                                    ×
                                  </button>
                                </div>
                              ) : replyHintText !== null ? (
                                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--sidebar-text)', opacity: 0.7 }}>
                                  Не удалось загрузить. Попробуйте ещё раз.
                                </p>
                              ) : null}
                            </div>
                          )}
                        </section>
                      )}
                    </div>
                  )}
                </div>
              )}
              {agentMode === 'debate' && debateStarted && debateTopic && (
                <div
                  style={{
                    width: 280,
                    flexShrink: 0,
                    borderRadius: 12,
                    border: '1px solid var(--sidebar-border)',
                    background: 'var(--sidebar-hover)',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setDebateSidebarOpen((v) => !v)}
                    aria-expanded={debateSidebarOpen}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                      padding: '0.625rem 0.875rem',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--sidebar-text)',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <span>Задание и подсказки</span>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      style={{ transform: debateSidebarOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}
                      aria-hidden
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {debateSidebarOpen && (
                    <div style={{ padding: '0 0.875rem 0.875rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '60vh', overflowY: 'auto' }}>
                      {debateStepsForCurrentDifficulty.length > 0 && (
                        <section style={{ border: '1px solid var(--sidebar-border)', borderRadius: 10, padding: '0.75rem', background: 'var(--sidebar-bg)' }}>
                          <button
                            type="button"
                            onClick={() => setDebateSidebarStepsOpen((v) => !v)}
                            aria-expanded={debateSidebarStepsOpen}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--sidebar-text)',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                              cursor: 'pointer',
                              padding: 0,
                              marginBottom: debateSidebarStepsOpen ? '0.5rem' : 0,
                            }}
                          >
                            Задание
                            <span style={{ opacity: 0.7 }}>{debateSidebarStepsOpen ? '▼' : '▶'}</span>
                          </button>
                          {debateSidebarStepsOpen &&
                            debateStepsForCurrentDifficulty.slice()
                              .sort((a, b) => a.order - b.order)
                              .map((step) => {
                                const done = debateCompletedStepIds.includes(step.id);
                                return (
                                  <div
                                    key={step.id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.5rem',
                                      fontSize: '0.875rem',
                                      lineHeight: 1.4,
                                      color: 'var(--sidebar-text)',
                                      opacity: done ? 0.85 : 1,
                                      marginTop: '0.35rem',
                                    }}
                                  >
                                    {done ? (
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" style={{ flexShrink: 0 }} aria-hidden>
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                    ) : (
                                      <span style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid var(--sidebar-border)', flexShrink: 0 }} aria-hidden />
                                    )}
                                    <span>{step.titleRu}</span>
                                  </div>
                                );
                              })}
                        </section>
                      )}
                      {DEBATE_GOAL_RU && (
                        <section style={{ border: '1px solid rgba(34, 197, 94, 0.5)', borderRadius: 10, padding: '0.75rem', background: 'rgba(34, 197, 94, 0.06)' }}>
                          <button
                            type="button"
                            onClick={() => setDebateSidebarGoalOpen((v) => !v)}
                            aria-expanded={debateSidebarGoalOpen}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--sidebar-text)',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                              cursor: 'pointer',
                              padding: 0,
                              marginBottom: debateSidebarGoalOpen ? '0.5rem' : 0,
                            }}
                          >
                            Цель задания
                            <span style={{ opacity: 0.7 }}>{debateSidebarGoalOpen ? '▼' : '▶'}</span>
                          </button>
                          {debateSidebarGoalOpen && (
                            <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.45, color: 'var(--sidebar-text)', opacity: 0.95, whiteSpace: 'pre-line' }}>
                              {DEBATE_GOAL_RU}
                            </p>
                          )}
                        </section>
                      )}
                      {messages.length > 0 && messages[messages.length - 1]?.role === 'assistant' && (
                        <section style={{ border: '1px solid rgba(251, 191, 36, 0.4)', borderRadius: 10, padding: '0.75rem', background: 'rgba(251, 191, 36, 0.06)' }}>
                          <button
                            type="button"
                            onClick={requestReplyHint}
                            disabled={replyHintLoading}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.5rem',
                              border: 'none',
                              padding: '0.5rem 0.75rem',
                              borderRadius: 8,
                              background: replyHintLoading ? 'rgba(251, 191, 36, 0.1)' : 'rgba(251, 191, 36, 0.12)',
                              color: 'rgba(251, 191, 36, 0.98)',
                              fontSize: '0.8125rem',
                              fontWeight: 600,
                              cursor: replyHintLoading ? 'default' : 'pointer',
                              opacity: replyHintLoading ? 0.8 : 1,
                            }}
                            title="Получить подсказку ответа от ИИ под ваш уровень"
                          >
                            {replyHintLoading ? (
                              <>
                                <span style={{ animation: 'agent-dots 1.2s ease-in-out infinite' }}>·</span>
                                <span style={{ animation: 'agent-dots 1.2s ease-in-out infinite', animationDelay: '150ms' }}>·</span>
                                <span style={{ animation: 'agent-dots 1.2s ease-in-out infinite', animationDelay: '300ms' }}>·</span>
                              </>
                            ) : (
                              <>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <circle cx="12" cy="12" r="10" />
                                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                                  <line x1="12" y1="17" x2="12.01" y2="17" />
                                </svg>
                                Подсказка ответа
                              </>
                            )}
                          </button>
                          {(replyHintLoading || replyHintText !== null) && (
                            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(251, 191, 36, 0.2)' }}>
                              {replyHintLoading ? (
                                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--sidebar-text)', opacity: 0.8 }}>
                                  ИИ подбирает естественную фразу…
                                </p>
                              ) : replyHintText !== null && replyHintText !== '' ? (
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                                  <p style={{ margin: 0, fontSize: '0.8125rem', lineHeight: 1.5, color: 'var(--sidebar-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}>
                                    {replyHintText}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => setReplyHintText(null)}
                                    aria-label="Скрыть подсказку"
                                    style={{
                                      padding: '0.2rem',
                                      border: 'none',
                                      background: 'transparent',
                                      color: 'var(--sidebar-text)',
                                      opacity: 0.6,
                                      cursor: 'pointer',
                                      borderRadius: 4,
                                      fontSize: '1rem',
                                      lineHeight: 1,
                                      flexShrink: 0,
                                    }}
                                  >
                                    ×
                                  </button>
                                </div>
                              ) : replyHintText !== null ? (
                                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--sidebar-text)', opacity: 0.7 }}>
                                  Не удалось загрузить. Попробуйте ещё раз.
                                </p>
                              ) : null}
                            </div>
                          )}
                        </section>
                      )}
                      {!debateCompleted && (
                        (() => {
                          const allStepsDone =
                            debateStepsForCurrentDifficulty.length === 0 ||
                            debateStepsForCurrentDifficulty.every((s) => debateCompletedStepIds.includes(s.id));
                          if (!allStepsDone) return null;
                          return (
                        <button
                          type="button"
                          onClick={() => setDebateCompleted(true)}
                          style={{
                            marginTop: '0.75rem',
                            width: '100%',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            padding: '0.5rem 0.75rem',
                            borderRadius: 8,
                            border: '1px solid rgba(34, 197, 94, 0.4)',
                            background: 'rgba(34, 197, 94, 0.12)',
                            color: 'rgba(34, 197, 94, 0.95)',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Цель достигнута
                        </button>
                          );
                        })()
                      )}
                    </div>
                  )}
                </div>
              )}
              {messages.filter((m) => m.role === 'user').length > 0 && (
                <>
                  {messages[messages.length - 1]?.role === 'assistant' && (
                    <>
                      {agentMode === 'chat' && (
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.55rem', borderRadius: 10, border: '1px solid var(--sidebar-border)', background: 'var(--sidebar-hover)', color: 'var(--sidebar-text)', fontSize: '0.75rem' }}>
                          <span style={{ opacity: 0.8 }}>Режим подсказки</span>
                          <select
                            value={freestyleHintMode}
                            onChange={(e) => setFreestyleHintMode(e.target.value as FreestyleHintMode)}
                            style={{ borderRadius: 8, border: '1px solid var(--sidebar-border)', background: 'var(--sidebar-bg)', color: 'var(--sidebar-text)', padding: '0.18rem 0.4rem', fontSize: '0.75rem' }}
                          >
                            {Object.entries(FREESTYLE_HINT_MODE_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                        </label>
                      )}
                      {agentMode === 'chat' && (
                        <button
                          type="button"
                          onClick={requestReplyHint}
                          disabled={replyHintLoading}
                          className="agent-toolbar-btn"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            padding: '0.5rem 0.875rem',
                            borderRadius: 10,
                            border: '1px solid rgba(251, 191, 36, 0.35)',
                            background: 'rgba(251, 191, 36, 0.12)',
                            color: 'rgba(251, 191, 36, 0.98)',
                            fontSize: '0.8125rem',
                            fontWeight: 500,
                            cursor: replyHintLoading ? 'default' : 'pointer',
                            opacity: replyHintLoading ? 0.7 : 1,
                          }}
                          title="Подсказка ответа по текущему стилю"
                        >
                          {replyHintLoading ? (
                            <>
                              <span style={{ animation: 'agent-dots 1.2s ease-in-out infinite' }}>·</span>
                              <span style={{ animation: 'agent-dots 1.2s ease-in-out infinite', animationDelay: '150ms' }}>·</span>
                              <span style={{ animation: 'agent-dots 1.2s ease-in-out infinite', animationDelay: '300ms' }}>·</span>
                            </>
                          ) : (
                            <>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                              </svg>
                              Подсказка ответа
                            </>
                          )}
                        </button>
                      )}
                    </>
                  )}
                  {agentMode !== 'chat' && (
                    <>
                      <button
                        type="button"
                        onClick={requestAssessment}
                        disabled={assessmentLoading}
                        className="agent-toolbar-btn"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          padding: '0.5rem 0.875rem',
                          borderRadius: 10,
                          border: '1px solid rgba(99, 102, 241, 0.35)',
                          background: 'rgba(99, 102, 241, 0.12)',
                          color: 'rgba(99, 102, 241, 0.95)',
                          fontSize: '0.8125rem',
                          fontWeight: 500,
                          cursor: assessmentLoading ? 'default' : 'pointer',
                          opacity: assessmentLoading ? 0.7 : 1,
                        }}
                      >
                        {assessmentLoading ? (
                          <>
                            <span style={{ animation: 'agent-dots 1.2s ease-in-out infinite' }}>·</span>
                            <span style={{ animation: 'agent-dots 1.2s ease-in-out infinite', animationDelay: '150ms' }}>·</span>
                            <span style={{ animation: 'agent-dots 1.2s ease-in-out infinite', animationDelay: '300ms' }}>·</span>
                          </>
                        ) : (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                            Оценить речь
                          </>
                        )}
                      </button>
                      {currentSessionId && (
                        <button
                          type="button"
                          onClick={() => loadSavedAssessment(currentSessionId)}
                          disabled={assessmentLoadSavedLoading}
                          className="agent-toolbar-btn"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            padding: '0.5rem 0.875rem',
                            borderRadius: 10,
                            border: '1px solid var(--sidebar-border)',
                            background: 'var(--sidebar-hover)',
                            color: 'var(--sidebar-text)',
                            fontSize: '0.8125rem',
                            fontWeight: 500,
                            cursor: assessmentLoadSavedLoading ? 'default' : 'pointer',
                            opacity: assessmentLoadSavedLoading ? 0.7 : 1,
                          }}
                        >
                          {assessmentLoadSavedLoading ? (
                            <>
                              <span style={{ animation: 'agent-dots 1.2s ease-in-out infinite' }}>·</span>
                              <span style={{ animation: 'agent-dots 1.2s ease-in-out infinite', animationDelay: '150ms' }}>·</span>
                              <span style={{ animation: 'agent-dots 1.2s ease-in-out infinite', animationDelay: '300ms' }}>·</span>
                            </>
                          ) : (
                            'Посмотреть оценку'
                          )}
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
              {agentMode === 'chat' && (replyHintLoading || replyHintText !== null) && (
                <div
                  style={{
                    marginTop: '0.6rem',
                    maxWidth: 520,
                    padding: '0.7rem 0.85rem',
                    borderRadius: 12,
                    border: '1px solid rgba(251, 191, 36, 0.35)',
                    background: 'rgba(251, 191, 36, 0.08)',
                    alignSelf: 'flex-end',
                  }}
                >
                  {replyHintLoading ? (
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--sidebar-text)', opacity: 0.85 }}>
                      ИИ подбирает подсказку под выбранный стиль…
                    </p>
                  ) : replyHintText ? (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                      <p style={{ margin: 0, fontSize: '0.8125rem', lineHeight: 1.45, color: 'var(--sidebar-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}>
                        {replyHintText}
                      </p>
                      <button
                        type="button"
                        onClick={() => setReplyHintText(null)}
                        style={{ border: 'none', background: 'transparent', color: 'var(--sidebar-text)', opacity: 0.65, cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}
                        aria-label="Скрыть подсказку"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--sidebar-text)', opacity: 0.7 }}>
                      Не удалось загрузить. Попробуйте еще раз.
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
        {error && (
          <div
            style={{
              position: 'absolute',
              top: '1.25rem',
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '0.75rem 1.5rem',
              borderRadius: 14,
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#fca5a5',
              fontSize: '0.875rem',
              maxWidth: '90%',
              boxShadow: '0 4px 20px rgba(239, 68, 68, 0.15)',
            }}
          >
            {error}
          </div>
        )}

        {selectedSession ? (
          <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button
              type="button"
              onClick={() => setSelectedSessionId(null)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                borderRadius: 12,
                border: '1px solid var(--sidebar-border)',
                background: 'var(--sidebar-hover)',
                color: 'var(--sidebar-text)',
                fontSize: '0.875rem',
                cursor: 'pointer',
                alignSelf: 'flex-start',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              Текущий разговор
            </button>
            <p style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600, color: 'var(--sidebar-text)', opacity: 0.9 }}>{selectedSession.title}</p>
            {selectedSession.scenario_title && (
              <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--sidebar-text)', opacity: 0.75 }}>
                Сценарий: {selectedSession.scenario_title}
              </p>
            )}
            <button
              type="button"
              onClick={() => loadSavedAssessment(selectedSession.id)}
              disabled={assessmentLoadSavedLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 1rem',
                borderRadius: 10,
                border: '1px solid rgba(99, 102, 241, 0.35)',
                background: 'rgba(99, 102, 241, 0.12)',
                color: 'rgba(99, 102, 241, 0.95)',
                fontSize: '0.8125rem',
                fontWeight: 500,
                cursor: assessmentLoadSavedLoading ? 'default' : 'pointer',
                opacity: assessmentLoadSavedLoading ? 0.7 : 1,
                alignSelf: 'flex-start',
              }}
            >
              {assessmentLoadSavedLoading ? (
                <>
                  <span style={{ animation: 'agent-dots 1.2s ease-in-out infinite' }}>·</span>
                  <span style={{ animation: 'agent-dots 1.2s ease-in-out infinite', animationDelay: '150ms' }}>·</span>
                  <span style={{ animation: 'agent-dots 1.2s ease-in-out infinite', animationDelay: '300ms' }}>·</span>
                </>
              ) : (
                'Посмотреть оценку'
              )}
            </button>
            <div
              ref={historyScrollRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                padding: '0.5rem 0',
                maxHeight: 360,
              }}
            >
              {selectedSession.messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '88%',
                    padding: '0.75rem 1rem',
                    borderRadius: 16,
                    background: m.role === 'user' ? 'var(--sidebar-active)' : 'var(--sidebar-hover)',
                    border: '1px solid var(--sidebar-border)',
                    fontSize: '0.9375rem',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: 'var(--sidebar-text)',
                  }}
                >
                  {m.content}
                </div>
              ))}
            </div>
          </div>
        ) : goalReached && agentMode === 'roleplay' && selectedScenario ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1.75rem',
              padding: '2rem',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.25), rgba(22, 163, 74, 0.2))',
                border: '2px solid rgba(34, 197, 94, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(34, 197, 94, 0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--sidebar-text)' }}>
              Цель достигнута
            </h2>
            {selectedScenario.goalRu && (
              <p style={{ margin: 0, fontSize: '0.9375rem', color: 'var(--sidebar-text)', opacity: 0.8, maxWidth: 360 }}>
                {selectedScenario.goalRu}
              </p>
            )}
            {roleplayFeedbackLoading && (
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--sidebar-text)', opacity: 0.7, maxWidth: 420 }}>
                Готовим короткий фидбек по диалогу…
              </p>
            )}
            {roleplayFeedback && (
              <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--sidebar-text)', opacity: 0.85, maxWidth: 460 }}>
                {roleplayFeedback}
              </p>
            )}
            {(roleplayUsefulPhrase || roleplayUsefulPhraseRu) && (
              <div
                style={{
                  margin: 0,
                  padding: '0.75rem 1rem',
                  borderRadius: 10,
                  background: 'rgba(34, 197, 94, 0.08)',
                  border: '1px solid rgba(34, 197, 94, 0.25)',
                  maxWidth: 460,
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sidebar-text)', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Запомни на будущее
                </span>
                {roleplayUsefulPhrase && (
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.9375rem', color: 'var(--sidebar-text)', fontStyle: 'italic', lineHeight: 1.4 }}>
                    «{roleplayUsefulPhrase}»
                  </p>
                )}
                {roleplayUsefulPhraseRu && (
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--sidebar-text)', opacity: 0.9, lineHeight: 1.4 }}>
                    — {roleplayUsefulPhraseRu}
                  </p>
                )}
              </div>
            )}
            {roleplayStyleNote && (
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--sidebar-text)', opacity: 0.85, maxWidth: 460 }}>
                <strong>Нюанс стиля:</strong> {roleplayStyleNote}
              </p>
            )}
            {roleplayRewriteNeutral && (
              <div
                style={{
                  margin: 0,
                  padding: '0.75rem 1rem',
                  borderRadius: 10,
                  background: 'rgba(103, 199, 163, 0.16)',
                  border: '1px solid rgba(79, 168, 134, 0.35)',
                  maxWidth: 460,
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sidebar-text)', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Нейтральный вариант
                </span>
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.9375rem', color: 'var(--sidebar-text)', lineHeight: 1.4 }}>
                  {roleplayRewriteNeutral}
                </p>
              </div>
            )}
            {roleplayFeedbackError && !roleplayFeedback && (
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--sidebar-text)', opacity: 0.6, maxWidth: 420 }}>
                Не удалось получить короткий фидбек — можно попробовать оценку речи.
              </p>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={handleGoalReachedRestart}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: 12,
                  border: 'none',
                  background: 'rgba(34, 197, 94, 0.9)',
                  color: '#fff',
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(34, 197, 94, 0.3)',
                }}
              >
                Повторить этот сценарий
              </button>
              <button
                type="button"
                onClick={handleGoalReachedOtherScenario}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: 12,
                  border: '1px solid var(--sidebar-border)',
                  background: 'var(--sidebar-active)',
                  color: 'var(--sidebar-text)',
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Другой сценарий
              </button>
              <button
                type="button"
                onClick={requestAssessment}
                disabled={assessmentLoading || messages.filter((m) => m.role === 'user').length === 0}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: 12,
                  border: '1px solid rgba(99, 102, 241, 0.5)',
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: 'rgba(99, 102, 241, 0.95)',
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  cursor: assessmentLoading ? 'default' : 'pointer',
                  opacity: assessmentLoading ? 0.7 : 1,
                }}
              >
                {assessmentLoading ? 'Оценка…' : 'Оценить речь'}
              </button>
            </div>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--sidebar-text)', opacity: 0.6 }}>
              Для полной обратной связи рекомендуем «Оценить речь».
            </p>
          </div>
        ) : debateCompleted && agentMode === 'debate' && debateTopic ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1.75rem',
              padding: '2rem',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(79, 70, 229, 0.2))',
                border: '2px solid rgba(99, 102, 241, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(99, 102, 241, 0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--sidebar-text)' }}>
              Дебат завершен
            </h2>
            <p style={{ margin: 0, fontSize: '0.9375rem', color: 'var(--sidebar-text)', opacity: 0.8, maxWidth: 360 }}>
              {debateTopic}
            </p>
            {debateFeedbackLoading && (
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--sidebar-text)', opacity: 0.7, maxWidth: 420 }}>
                Готовим короткий фидбек по дебату…
              </p>
            )}
            {debateFeedback && (
              <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--sidebar-text)', opacity: 0.85, maxWidth: 460 }}>
                {debateFeedback}
              </p>
            )}
            {(debateStrengthSbi || debateImprovementSbi) && (
              <div
                style={{
                  width: '100%',
                  maxWidth: 640,
                  border: '1px solid var(--sidebar-border)',
                  borderRadius: 12,
                  background: 'var(--sidebar-hover)',
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => setDebateAnalysisOpen((v) => !v)}
                  aria-expanded={debateAnalysisOpen}
                  style={{
                    width: '100%',
                    padding: '0.75rem 0.9rem',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--sidebar-text)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    textAlign: 'left',
                  }}
                >
                  <span>Подробный разбор ({[debateStrengthSbi, debateImprovementSbi].filter(Boolean).length} пункта)</span>
                  <span style={{ opacity: 0.7 }}>{debateAnalysisOpen ? '▲' : '▼'}</span>
                </button>
                {debateAnalysisOpen && (
                  <div style={{ borderTop: '1px solid var(--sidebar-border)', display: 'flex', flexDirection: 'column' }}>
                    {debateStrengthSbi && (
                      <div style={{ borderBottom: debateImprovementSbi ? '1px solid var(--sidebar-border)' : 'none' }}>
                        <button
                          type="button"
                          onClick={() => setDebateStrengthOpen((v) => !v)}
                          aria-expanded={debateStrengthOpen}
                          style={{
                            width: '100%',
                            padding: '0.7rem 0.9rem',
                            border: 'none',
                            background: 'rgba(34, 197, 94, 0.08)',
                            color: 'var(--sidebar-text)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            fontSize: '0.8125rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            textAlign: 'left',
                          }}
                        >
                          <span style={{ color: 'rgba(34, 197, 94, 0.95)' }}>Сильная сторона</span>
                          <span style={{ opacity: 0.7 }}>{debateStrengthOpen ? '▲' : '▼'}</span>
                        </button>
                        {debateStrengthOpen && (
                          <div style={{ padding: '0.7rem 0.9rem', textAlign: 'left' }}>
                            {debateStrengthSbi.situation && <p style={{ margin: '0 0 0.25rem', fontSize: '0.85rem', color: 'var(--sidebar-text)', opacity: 0.9 }}><strong>Ситуация:</strong> {debateStrengthSbi.situation}</p>}
                            {debateStrengthSbi.behavior && <p style={{ margin: '0 0 0.25rem', fontSize: '0.85rem', color: 'var(--sidebar-text)', opacity: 0.9 }}><strong>Действие:</strong> {debateStrengthSbi.behavior}</p>}
                            {debateStrengthSbi.impact && <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--sidebar-text)', opacity: 0.9 }}><strong>Эффект:</strong> {debateStrengthSbi.impact}</p>}
                          </div>
                        )}
                      </div>
                    )}
                    {debateImprovementSbi && (
                      <div>
                        <button
                          type="button"
                          onClick={() => setDebateGrowthOpen((v) => !v)}
                          aria-expanded={debateGrowthOpen}
                          style={{
                            width: '100%',
                            padding: '0.7rem 0.9rem',
                            border: 'none',
                            background: 'rgba(245, 158, 11, 0.08)',
                            color: 'var(--sidebar-text)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            fontSize: '0.8125rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            textAlign: 'left',
                          }}
                        >
                          <span style={{ color: 'rgba(245, 158, 11, 0.95)' }}>Зона роста</span>
                          <span style={{ opacity: 0.7 }}>{debateGrowthOpen ? '▲' : '▼'}</span>
                        </button>
                        {debateGrowthOpen && (
                          <div style={{ padding: '0.7rem 0.9rem', textAlign: 'left' }}>
                            {debateImprovementSbi.situation && <p style={{ margin: '0 0 0.25rem', fontSize: '0.85rem', color: 'var(--sidebar-text)', opacity: 0.9 }}><strong>Ситуация:</strong> {debateImprovementSbi.situation}</p>}
                            {debateImprovementSbi.behavior && <p style={{ margin: '0 0 0.25rem', fontSize: '0.85rem', color: 'var(--sidebar-text)', opacity: 0.9 }}><strong>Действие:</strong> {debateImprovementSbi.behavior}</p>}
                            {debateImprovementSbi.impact && <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--sidebar-text)', opacity: 0.9 }}><strong>Эффект:</strong> {debateImprovementSbi.impact}</p>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {(debateUsefulPhrase || debateUsefulPhraseRu) && (
              <div
                style={{
                  margin: 0,
                  padding: '0.75rem 1rem',
                  borderRadius: 10,
                  background: 'rgba(99, 102, 241, 0.08)',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                  maxWidth: 460,
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sidebar-text)', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Запомни на будущее
                </span>
                {debateUsefulPhrase && (
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.9375rem', color: 'var(--sidebar-text)', fontStyle: 'italic', lineHeight: 1.4 }}>
                    «{debateUsefulPhrase}»
                  </p>
                )}
                {debateUsefulPhraseRu && (
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--sidebar-text)', opacity: 0.9, lineHeight: 1.4 }}>
                    — {debateUsefulPhraseRu}
                  </p>
                )}
              </div>
            )}
            {debateFeedbackError && !debateFeedback && (
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--sidebar-text)', opacity: 0.6, maxWidth: 420 }}>
                Не удалось получить короткий фидбек — можно попробовать оценку речи.
              </p>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  setDebateCompleted(false);
                  setDebateStarted(false);
                  setDebateTopic(null);
                  setDebateTopicSource('catalog');
                  setDebateTopicOriginal(null);
                  setDebateTopicNormalized(null);
                  setDebateTopicLanguage('unknown');
                  setDebateTopicValidationStatus('valid');
                  setDebateUserPosition(null);
                  setDebateAIPosition(null);
                  setDebateDifficulty(null);
                  setDebateMicroGoals([]);
                  setDebateSettings({ slangMode: 'off', allowProfanity: false, aiMayUseProfanity: false, profanityIntensity: 'light' });
                  setMessages([]);
                  setDebateCurrentSessionId(null);
                  setDebateCompletionId(null);
                  setDebateFeedback(null);
                  setDebateStrengthSbi(null);
                  setDebateImprovementSbi(null);
                  setDebateUsefulPhrase(null);
                  setDebateUsefulPhraseRu(null);
                  setDebateFeedbackError(null);
                  setDebateCompletedStepIds([]);
                  setDebateView('catalog');
                  setDebateSetupOpen(true);
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: 12,
                  border: 'none',
                  background: 'rgba(99, 102, 241, 0.9)',
                  color: '#fff',
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(99, 102, 241, 0.3)',
                }}
              >
                Новый дебат
              </button>
              <button
                type="button"
                onClick={requestAssessment}
                disabled={assessmentLoading || messages.filter((m) => m.role === 'user').length === 0}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: 12,
                  border: '1px solid rgba(99, 102, 241, 0.5)',
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: 'rgba(99, 102, 241, 0.95)',
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  cursor: assessmentLoading ? 'default' : 'pointer',
                  opacity: assessmentLoading ? 0.7 : 1,
                }}
              >
                {assessmentLoading ? 'Оценка…' : 'Оценить речь'}
              </button>
            </div>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--sidebar-text)', opacity: 0.6 }}>
              Для полной обратной связи рекомендуем «Оценить речь».
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2.25rem',
            }}
          >
            <div style={{ position: 'relative', width: 200, height: 200 }}>
              {/* Декоративное кольцо за орбом */}
              <div
                style={{
                  position: 'absolute',
                  inset: -20,
                  borderRadius: '50%',
                  border: '1px solid var(--sidebar-border)',
                  opacity: 0.4,
                  pointerEvents: 'none',
                }}
              />
              {/* Визуализация голоса — концентрические кольца по уровню громкости */}
              {state === 'listening' && (
                <>
                  {[0, 1, 2].map((i) => {
                    const base = 14 + i * 12;
                    const scale = 1 + volumeLevel * (0.1 + i * 0.05);
                    const opacity = (0.4 - i * 0.1) * (0.5 + volumeLevel * 0.5);
                    return (
                      <span
                        key={i}
                        style={{
                          position: 'absolute',
                          left: '50%',
                          top: '50%',
                          width: 200 + base * 2,
                          height: 200 + base * 2,
                          borderRadius: '50%',
                          border: `2px solid rgba(99, 102, 241, ${opacity})`,
                          transform: `translate(-50%, -50%) scale(${scale})`,
                          pointerEvents: 'none',
                          transition: 'transform 0.06s ease-out, border-color 0.06s ease-out',
                        }}
                      />
                    );
                  })}
                </>
              )}
              <button
                type="button"
                aria-label={statusText}
                onClick={handleRecordClick}
                disabled={state === 'thinking' || state === 'speaking'}
                style={{
                  width: 200,
                  height: 200,
                  borderRadius: '50%',
                  border: 'none',
                  cursor: state === 'idle' || state === 'listening' ? 'pointer' : 'default',
                  padding: 0,
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: orbShadow,
                  background: orbGradient,
                  animation: state === 'idle' ? 'agent-orb-breathe 3s ease-in-out infinite' : 'none',
                  transition: state === 'speaking' ? 'box-shadow 0.06s ease-out, transform 0.06s ease-out' : 'box-shadow 0.4s ease, transform 0.25s ease',
                  transform:
                    state === 'listening'
                      ? 'scale(1.06)'
                      : state === 'speaking'
                        ? `scale(${1 + ttsLevel * 0.04})`
                        : 'scale(1)',
                }}
              >
                {/* Блик на сфере */}
                <span
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle at 32% 28%, rgba(255,255,255,0.35), transparent 45%)',
                    pointerEvents: 'none',
                  }}
                />
                {state === 'listening' && (
                  <span
                    style={{
                      position: 'absolute',
                      inset: -12,
                      borderRadius: '50%',
                      border: '3px solid rgba(99, 102, 241, 0.45)',
                      animation: 'agent-orb-pulse 1.2s ease-in-out infinite',
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </button>
            </div>

            {state === 'listening' && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.75rem',
                  width: '100%',
                  maxWidth: 260,
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: 4,
                    borderRadius: 2,
                    background: 'var(--sidebar-hover)',
                    border: '1px solid var(--sidebar-border)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, (recordingElapsedMs / 60000) * 100)}%`,
                      borderRadius: 2,
                      background: 'rgba(99, 102, 241, 0.7)',
                      transition: 'width 0.1s ease-out',
                    }}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.8125rem',
                    color: 'var(--sidebar-text)',
                    opacity: 0.9,
                  }}
                >
                  <span>
                    {recordingElapsedMs < 1000
                      ? `${(recordingElapsedMs / 1000).toFixed(1).replace('.', ',')} с`
                      : `${Math.floor(recordingElapsedMs / 1000)} с`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); cancelRecording(); }}
                  style={{
                    padding: '0.5rem 1.25rem',
                    borderRadius: 12,
                    border: '1px solid var(--sidebar-border)',
                    background: 'var(--sidebar-hover)',
                    color: 'var(--sidebar-text)',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Отмена
                </button>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1.25rem',
                borderRadius: 999,
                background: 'var(--sidebar-hover)',
                border: '1px solid var(--sidebar-border)',
              }}
            >
              {state === 'thinking' ? (
                <>
                  <span style={{ fontSize: '1.25rem', lineHeight: 1, color: 'var(--sidebar-text)', animation: 'agent-dots 1.2s ease-in-out infinite', animationDelay: '0ms' }}>·</span>
                  <span style={{ fontSize: '1.25rem', lineHeight: 1, color: 'var(--sidebar-text)', animation: 'agent-dots 1.2s ease-in-out infinite', animationDelay: '150ms' }}>·</span>
                  <span style={{ fontSize: '1.25rem', lineHeight: 1, color: 'var(--sidebar-text)', animation: 'agent-dots 1.2s ease-in-out infinite', animationDelay: '300ms' }}>·</span>
                </>
              ) : (
                <span
                  style={{
                    margin: 0,
                    fontSize: '0.9375rem',
                    fontWeight: 500,
                    color: 'var(--sidebar-text)',
                    opacity: state === 'idle' ? 0.85 : 1,
                  }}
                >
                  {statusText}
                </span>
              )}
            </div>

            {(messages.length > 0 || selectedScenario || selectedSessionId) && (
              <button
                type="button"
                onClick={handleExitDialogue}
                aria-label="Выйти из диалога"
                title="Выйти из диалога (сбросить)"
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: 12,
                  border: '1px solid rgba(239, 68, 68, 0.5)',
                  background: 'rgba(239, 68, 68, 0.2)',
                  color: '#fca5a5',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Выйти из диалога
              </button>
            )}

            {messages.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.875rem',
                  width: '100%',
                  maxWidth: 520,
                }}
              >
                {assessmentError && (
                  <div
                    style={{
                      padding: '0.75rem 1rem',
                      borderRadius: 12,
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      color: '#fca5a5',
                      fontSize: '0.8125rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                    }}
                  >
                    <span>{assessmentError}</span>
                    <button
                      type="button"
                      onClick={clearAssessment}
                      style={{
                        padding: '0.25rem',
                        border: 'none',
                        background: 'transparent',
                        color: 'inherit',
                        cursor: 'pointer',
                        opacity: 0.8,
                      }}
                      aria-label="Закрыть"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {assessmentResult && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="assessment-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            background: 'var(--sidebar-bg)',
            display: 'flex',
            flexDirection: 'column',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              padding: '2rem 2.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexShrink: 0, marginBottom: '1.5rem' }}>
              <h2 id="assessment-modal-title" style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--sidebar-text)' }}>
                Оценка речи
              </h2>
              <button
                type="button"
                onClick={clearAssessment}
                style={{
                  padding: '0.5rem 0.75rem',
                  border: 'none',
                  borderRadius: 12,
                  background: 'var(--sidebar-hover)',
                  color: 'var(--sidebar-text)',
                  cursor: 'pointer',
                  fontSize: '1.25rem',
                  lineHeight: 1,
                  fontWeight: 600,
                }}
                aria-label="Закрыть"
              >
                Закрыть
              </button>
            </div>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem',
                paddingRight: '1rem',
                scrollbarGutter: 'stable',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '1.25rem 1.5rem',
                  borderRadius: 14,
                  background: 'var(--sidebar-active)',
                  border: '1px solid var(--sidebar-border)',
                }}
              >
                <span style={{ fontSize: '3rem', fontWeight: 700, color: 'rgba(99, 102, 241, 0.95)' }}>
                  {assessmentResult.overall_score.toFixed(1)}
                </span>
                <span style={{ fontSize: '1.125rem', color: 'var(--sidebar-text)', opacity: 0.8 }}>из 10</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {(Object.keys(assessmentResult.criteria_scores) as (keyof CriteriaScores)[]).map((key) => {
                  const score = assessmentResult.criteria_scores[key];
                  if (typeof score !== 'number') return null;
                  const pct = (score / 10) * 100;
                  return (
                    <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem' }}>
                        <span style={{ color: 'var(--sidebar-text)', opacity: 0.9 }}>{getCriteriaLabel(key)}</span>
                        <span style={{ fontWeight: 600, color: 'var(--sidebar-text)' }}>{score}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: 'var(--sidebar-border)', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${pct}%`,
                            borderRadius: 3,
                            background: 'linear-gradient(90deg, rgba(99, 102, 241, 0.6), rgba(124, 58, 237, 0.8))',
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {assessmentResult.feedback?.summary && (
                <p style={{ margin: 0, fontSize: '1.0625rem', color: 'var(--sidebar-text)', opacity: 0.9, lineHeight: 1.55 }}>
                  {assessmentResult.feedback.summary}
                </p>
              )}
              {assessmentResult.feedback?.goal_attainment && assessmentResult.feedback.goal_attainment.length > 0 && (
                <div>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'rgba(99, 102, 241, 0.95)', textTransform: 'uppercase' }}>
                    Достижение микро-целей
                  </span>
                  <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {(assessmentResult.feedback.goal_attainment as GoalAttainmentItem[]).map((item, idx) => (
                      <div
                        key={`${item.goal_id || 'goal'}-${idx}`}
                        style={{
                          padding: '0.6rem 0.75rem',
                          borderRadius: 10,
                          border: `1px solid ${item.achieved ? 'rgba(34, 197, 94, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
                          background: item.achieved ? 'rgba(34, 197, 94, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--sidebar-text)' }}>
                            {item.goal_label || item.goal_id}
                          </span>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: item.achieved ? 'rgba(34, 197, 94, 0.95)' : 'rgba(245, 158, 11, 0.95)' }}>
                            {item.achieved ? 'Достигнуто' : 'В работе'}
                          </span>
                        </div>
                        {item.evidence && (
                          <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'var(--sidebar-text)', opacity: 0.9 }}>
                            <strong>Подтверждение:</strong> {item.evidence}
                          </p>
                        )}
                        {item.suggestion && (
                          <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--sidebar-text)', opacity: 0.9 }}>
                            <strong>Совет:</strong> {item.suggestion}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {assessmentResult.feedback?.strengths && assessmentResult.feedback.strengths.length > 0 && (
                <div>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'rgba(34, 197, 94, 0.9)', textTransform: 'uppercase' }}>
                    Сильные стороны
                  </span>
                  <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.5rem', fontSize: '1rem', color: 'var(--sidebar-text)', opacity: 0.9, lineHeight: 1.55 }}>
                    {assessmentResult.feedback.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {assessmentResult.feedback?.improvements && assessmentResult.feedback.improvements.length > 0 && (
                <div>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'rgba(251, 191, 36, 0.9)', textTransform: 'uppercase' }}>
                    Над чем поработать
                  </span>
                  <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.5rem', fontSize: '1rem', color: 'var(--sidebar-text)', opacity: 0.9, lineHeight: 1.55 }}>
                    {assessmentResult.feedback.improvements.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {translatorOpen && (
        <TranslatorPanel
          onClose={() => setTranslatorOpen(false)}
          token={token}
          userId={userId}
          getApiUrl={getApiUrl}
        />
      )}
      {debateSetupOpen && agentMode === 'debate' && (
        <DebateSetupUI
          userId={userId}
          view={debateView}
          onStart={handleStartDebate}
          onClose={() => {
            if (!debateStarted) {
              setAgentMode('chat');
            }
            setDebateSetupOpen(false);
          }}
        />
      )}
      {aiChatOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            pointerEvents: 'none',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              left: aiChatPosition?.x ?? 0,
              top: aiChatPosition?.y ?? 0,
              width: aiChatSize?.width ?? 900,
              height: aiChatSize?.height ?? 640,
              minWidth: 320,
              minHeight: 280,
              maxWidth: '100vw',
              maxHeight: '100vh',
              borderRadius: 16,
              border: '1px solid var(--sidebar-border)',
              background: 'var(--sidebar-bg)',
              color: 'var(--sidebar-text)',
              boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
              display: 'flex',
              flexDirection: 'row',
              overflow: 'hidden',
              pointerEvents: 'auto',
            }}
          >
            {/* Боковая панель истории (как в ChatGPT) */}
            {aiChatHistoryPanelOpen && (
              <div
                style={{
                  width: 260,
                  flexShrink: 0,
                  borderRight: '1px solid var(--sidebar-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--sidebar-border)', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, opacity: 0.9 }}>История чатов</span>
                </div>
                <button
                  type="button"
                  onClick={startNewAiChat}
                  style={{
                    margin: '0.5rem 0.75rem',
                    padding: '0.5rem 0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    border: '1px dashed var(--sidebar-border)',
                    background: 'transparent',
                    color: 'var(--sidebar-text)',
                    borderRadius: 8,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Новый чат
                </button>
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 0.5rem 0.5rem' }}>
                  {aiChatSessionsListLoading ? (
                    <p style={{ margin: '0.5rem 0.75rem', fontSize: '0.8125rem', opacity: 0.7 }}>Загрузка…</p>
                  ) : aiChatSessionsList.length === 0 ? (
                    <p style={{ margin: '0.5rem 0.75rem', fontSize: '0.8125rem', opacity: 0.6 }}>Нет сохранённых чатов</p>
                  ) : (
                    aiChatSessionsList.map((s) => (
                      <div
                        key={s.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => loadAiChatSession(s.id)}
                        onKeyDown={(e) => e.key === 'Enter' && loadAiChatSession(s.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.5rem 0.75rem',
                          marginBottom: 2,
                          borderRadius: 8,
                          background: aiChatCurrentId === s.id ? 'var(--sidebar-hover)' : 'transparent',
                          cursor: 'pointer',
                          border: 'none',
                          width: '100%',
                          textAlign: 'left',
                          color: 'var(--sidebar-text)',
                        }}
                      >
                        <span style={{ flex: 1, fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.title}>
                          {s.title}
                        </span>
                        <button
                          type="button"
                          aria-label="Удалить чат"
                          title="Удалить чат"
                          disabled={aiChatDeletingId === s.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteAiChatSession(s.id);
                          }}
                          style={{
                            flexShrink: 0,
                            padding: '0.25rem',
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--sidebar-text)',
                            opacity: 0.6,
                            cursor: aiChatDeletingId === s.id ? 'default' : 'pointer',
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
              <div
                onMouseDown={(e) => {
                  if ((e.target as HTMLElement).closest('button')) return;
                  e.preventDefault();
                  const pos = aiChatPositionRef.current;
                  const sz = aiChatSizeRef.current;
                  if (pos && sz) {
                    aiChatDragStartRef.current = { x: e.clientX, y: e.clientY, startX: pos.x, startY: pos.y, boxW: sz.width, boxH: sz.height };
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  padding: '1rem 1.25rem',
                  borderBottom: '1px solid var(--sidebar-border)',
                  flexShrink: 0,
                  cursor: 'move',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setAiChatHistoryPanelOpen((v) => !v); }}
                    aria-label={aiChatHistoryPanelOpen ? 'Скрыть историю' : 'История чатов'}
                    title={aiChatHistoryPanelOpen ? 'Скрыть историю' : 'История чатов'}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 36,
                      height: 36,
                      border: '1px solid var(--sidebar-border)',
                      background: aiChatHistoryPanelOpen ? 'var(--sidebar-hover)' : 'transparent',
                      color: 'var(--sidebar-text)',
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <span style={{ fontWeight: 600, fontSize: '1rem' }}>Чат с ИИ</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAiChatOpen(false)}
                  aria-label="Скрыть"
                  title="Скрыть окно чата"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--sidebar-text)',
                    cursor: 'pointer',
                    opacity: 0.7,
                    padding: '0.35rem',
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
              <div
                style={{
                  flex: 1,
                  minHeight: 200,
                  maxHeight: 440,
                  overflowY: 'auto',
                  padding: '1rem 1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                {aiChatLoadLoading ? (
                  <p style={{ margin: 0, fontSize: '0.875rem', opacity: 0.7 }}>Загрузка чата…</p>
                ) : aiChatMessages.length === 0 && !aiChatLoading ? (
                  <p style={{ margin: 0, fontSize: '0.875rem', opacity: 0.7 }}>
                    Напишите сообщение — ИИ ответит. Можно задать вопрос по языку, грамматике или попросить помочь с формулировкой.
                  </p>
                ) : (
                  <>
                    {aiChatMessages.map((msg, i) => (
                      <div
                        key={i}
                        style={{
                          alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                          maxWidth: '90%',
                          padding: '0.6rem 0.9rem',
                          borderRadius: 12,
                          background: msg.role === 'user' ? 'rgba(99, 102, 241, 0.18)' : 'var(--sidebar-hover)',
                          border: `1px solid ${msg.role === 'user' ? 'rgba(99, 102, 241, 0.35)' : 'var(--sidebar-border)'}`,
                        }}
                      >
                        <span style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, opacity: 0.8, marginBottom: '0.25rem' }}>
                          {msg.role === 'user' ? 'Вы' : 'ИИ'}
                        </span>
                        <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {msg.content}
                        </p>
                      </div>
                    ))}
                    {aiChatLoading && (
                      <div
                        style={{
                          alignSelf: 'flex-start',
                          maxWidth: '90%',
                          padding: '0.6rem 0.9rem',
                          borderRadius: 12,
                          background: 'var(--sidebar-hover)',
                          border: '1px solid var(--sidebar-border)',
                        }}
                      >
                        <span style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, opacity: 0.8, marginBottom: '0.25rem' }}>ИИ</span>
                        <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 2 }}>
                          <span>ИИ печатает</span>
                          <span style={{ display: 'inline-flex', gap: 2 }}>
                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor', opacity: 0.6, animation: 'aiChatDot 0.6s ease-in-out 0s infinite alternate' }} />
                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor', opacity: 0.6, animation: 'aiChatDot 0.6s ease-in-out 0.2s infinite alternate' }} />
                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor', opacity: 0.6, animation: 'aiChatDot 0.6s ease-in-out 0.4s infinite alternate' }} />
                          </span>
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--sidebar-border)', display: 'flex', flexDirection: 'column', gap: '0.5rem', flexShrink: 0 }}>
                <textarea
                  placeholder="Напишите сообщение…"
                  value={aiChatInput}
                  onChange={(e) => setAiChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (!e.shiftKey && e.key === 'Enter') {
                      e.preventDefault();
                      runAiChat();
                    }
                  }}
                  rows={2}
                  style={{
                    width: '100%',
                    resize: 'none',
                    padding: '0.65rem 0.85rem',
                    borderRadius: 10,
                    border: '1px solid var(--sidebar-border)',
                    background: 'var(--sidebar-hover)',
                    color: 'var(--sidebar-text)',
                    fontSize: '0.9rem',
                    lineHeight: 1.5,
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Enter — отправить, Shift+Enter — новая строка</span>
                  <button
                    type="button"
                    onClick={runAiChat}
                    disabled={aiChatLoading || !aiChatInput.trim()}
                    style={{
                      '--accent': '#7ad7a7',
                      '--accent-strong': '#58c18f',
                      '--accent-soft': 'rgba(122, 215, 167, 0.16)',
                      padding: '0.5rem 1rem',
                      borderRadius: 10,
                      border: '1px solid var(--accent-strong)',
                      background: 'var(--accent-soft)',
                      color: 'var(--accent-strong)',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      cursor: aiChatLoading || !aiChatInput.trim() ? 'default' : 'pointer',
                      opacity: aiChatLoading || !aiChatInput.trim() ? 0.6 : 1,
                    }}
                  >
                    {aiChatLoading ? 'Отправка…' : 'Отправить'}
                  </button>
                </div>
              </div>
            </div>
            {/* Ручки ресайза по краям всего окна */}
            <div
              role="presentation"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const sz = aiChatSizeRef.current;
                if (sz) aiChatResizeStartRef.current = { x: e.clientX, y: e.clientY, startW: sz.width, startH: sz.height, handle: 'e' };
              }}
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: 8,
                height: '100%',
                cursor: 'ew-resize',
                zIndex: 10,
              }}
            />
            <div
              role="presentation"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const sz = aiChatSizeRef.current;
                if (sz) aiChatResizeStartRef.current = { x: e.clientX, y: e.clientY, startW: sz.width, startH: sz.height, handle: 's' };
              }}
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                width: '100%',
                height: 8,
                cursor: 'ns-resize',
                zIndex: 10,
              }}
            />
            <div
              role="presentation"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const sz = aiChatSizeRef.current;
                if (sz) aiChatResizeStartRef.current = { x: e.clientX, y: e.clientY, startW: sz.width, startH: sz.height, handle: 'se' };
              }}
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 16,
                height: 16,
                cursor: 'nwse-resize',
                zIndex: 10,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
