'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { buildAgentAuthHeaders, buildAgentJsonHeaders } from '@/lib/agent-request';
import type { LearningLanguage } from '@/lib/learning-language';
import type { RoleplayScenario } from '@/lib/roleplay';
import { createUserScenario, generateUserScenario, isUserScenarioId, type UserScenarioLevel } from '@/lib/user-scenarios';
import type { ScenarioCreateSeed } from '@/components/roleplay/PersonalScenariosUI';
import { generateDebateTopic, saveUserDebateTopic } from '@/lib/user-debate-topics';
import { bindPracticeList } from '@/lib/practice-list-binding';
import { supabase } from '@/lib/supabase';
import {
  createZhScenario,
  draftFromGenerateResult,
  generateZhScenario,
  toZhWritePayload,
  zhScenarioToRoleplay,
  type ZhHskLevel,
  type ZhScenario,
} from '@/lib/zh-scenarios';
import { useListScope } from '@/components/dictionary/ListScopeSwitch';
import { loadPracticeMatches, type CloseScene } from '@/lib/practice-close-scenes';
import type { ChatPracticeSense } from './ChatPracticeWords';
import styles from './practice-today.module.css';

type TodaySense = ChatPracticeSense & {
  movesSchedule: boolean;
  bucket: 'due' | 'new' | 'early';
};

type VocabListCard = {
  id: string;
  title: string;
  word_count: number;
  system_key: string | null;
};

type StarterPackOffer = {
  key: string;
  title: string;
  word_count: number;
};

type LessonDraft = {
  kind: 'roleplay' | 'debate';
  title: string;
  place: string;
  goal: string;
  topic: string;
  level: UserScenarioLevel;
  payload: Record<string, unknown> | null;
  zh: ZhScenario | null;
  savedId?: string;
};

type PracticeTodayFiveProps = {
  apiUrl: string;
  token: string | null;
  learningLanguage: LearningLanguage;
  listId?: string | null;
  initialSenseIds?: string[];
  level?: string | null;
  onBeginScenario: (scenario: RoleplayScenario, senses: TodaySense[], listId: string) => void;
  onOpenSceneMenu?: (scenario: RoleplayScenario, senses: TodaySense[], listId: string) => void;
  onOpenScenarioDraft?: (seed: ScenarioCreateSeed, senses: TodaySense[], listId: string) => void;
  onBeginDebate: (topic: string, senses: TodaySense[], listId: string) => void;
  onBrowseScenes?: (senses: TodaySense[], listId: string) => void;
  onFreeChat: () => void;
  onFreeRoleplay?: () => void;
  onFreeDebate?: () => void;
  onChooserOpen?: (open: boolean) => void;
  initialMode?: 'words' | 'free';
  situationalOnly?: boolean;
};

function baseUrl(apiUrl: string) {
  return apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
}

function textOf(payload: Record<string, unknown> | null, key: string): string {
  const value = payload?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

function mapFiveItem(item: {
  sense_id?: unknown;
  headword?: unknown;
  gloss_ru?: unknown;
  moves_schedule?: unknown;
  bucket?: unknown;
}): TodaySense | null {
  const senseId = typeof item?.sense_id === 'string' ? item.sense_id : '';
  const headword = typeof item?.headword === 'string' ? item.headword.trim() : '';
  const glossRu = typeof item?.gloss_ru === 'string' ? item.gloss_ru.trim() : '';
  if (!senseId || !headword || !glossRu) return null;
  const bucket = item.bucket === 'due' || item.bucket === 'early' || item.bucket === 'new' ? item.bucket : 'new';
  return {
    senseId,
    headword,
    glossRu,
    movesSchedule: item.moves_schedule !== false,
    bucket,
  };
}

function bucketKind(word: TodaySense): 'due' | 'new' | 'early' {
  if (word.bucket === 'early' || word.movesSchedule === false) return 'early';
  if (word.bucket === 'due') return 'due';
  return 'new';
}

function bucketLabel(kind: 'due' | 'new' | 'early'): string {
  if (kind === 'due') return 'Пора сказать';
  if (kind === 'early') return 'Раньше срока';
  return 'Новое';
}

function cefrLevel(level?: string | null): UserScenarioLevel {
  const value = (level || '').toUpperCase();
  if (value === 'A1' || value === 'A2' || value === 'B1' || value === 'B2' || value === 'C1') return value;
  return 'B1';
}

function debateDifficulty(level?: string | null): 'easy' | 'medium' | 'hard' {
  const value = (level || '').toUpperCase();
  if (value === 'A1' || value === 'A2') return 'easy';
  if (value === 'C1' || value === 'C2') return 'hard';
  return 'medium';
}

function hskLevel(level?: string | null): ZhHskLevel {
  const value = Number(String(level || '').replace(/\D/g, ''));
  if (value >= 1 && value <= 6) return value as ZhHskLevel;
  return 3;
}

function wordBrief(words: TodaySense[]): string {
  return words.map((word) => `${word.headword} — ${word.glossRu}`).join('; ');
}

function lessonCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} слово`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} слова`;
  return `${count} слов`;
}

function listSizeLabel(count: number): string {
  return `${lessonCount(count)} в списке`;
}

function moreCloseLabel(count: number, situational: boolean): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const one = mod10 === 1 && mod100 !== 11;
  const few = mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14);
  if (situational) {
    if (one) return 'Ещё 1 близкий диалог';
    if (few) return `Ещё ${count} близких диалога`;
    return `Ещё ${count} близких диалогов`;
  }
  if (one) return 'Ещё 1 близкая сцена';
  if (few) return `Ещё ${count} близкие сцены`;
  return `Ещё ${count} близких сцен`;
}

function moreDebateLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const one = mod10 === 1 && mod100 !== 11;
  const few = mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14);
  if (one) return 'Ещё 1 близкая тема';
  if (few) return `Ещё ${count} близкие темы`;
  return `Ещё ${count} близких тем`;
}

export function PracticeTodayFive({
  apiUrl,
  token,
  learningLanguage,
  listId = null,
  initialSenseIds = [],
  level = null,
  onBeginScenario,
  onOpenSceneMenu,
  onOpenScenarioDraft,
  onBeginDebate,
  onBrowseScenes,
  onFreeChat,
  onFreeRoleplay,
  onFreeDebate,
  onChooserOpen,
  initialMode = 'words',
  situationalOnly = false,
}: PracticeTodayFiveProps) {
  const base = baseUrl(apiUrl);
  const [lists, setLists] = useState<VocabListCard[]>([]);
  const [starterPacks, setStarterPacks] = useState<StarterPackOffer[]>([]);
  const [addingPackKey, setAddingPackKey] = useState<string | null>(null);
  const [listsState, setListsState] = useState<'loading' | 'idle' | 'error'>('loading');
  const [listQuery, setListQuery] = useState('');
  const [listScope, setListScope] = useListScope();
  const [readyByList, setReadyByList] = useState<Record<string, number>>({});
  const [activeListId, setActiveListId] = useState<string | null>(listId);
  const [words, setWords] = useState<TodaySense[]>([]);
  const [wordsState, setWordsState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [wordsError, setWordsError] = useState<string | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [catalog, setCatalog] = useState<ChatPracticeSense[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [phase, setPhase] = useState<'lesson' | 'working' | 'ready'>('lesson');
  const [busyKind, setBusyKind] = useState<'roleplay' | 'debate' | null>(null);
  const [draft, setDraft] = useState<LessonDraft | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [closeScenes, setCloseScenes] = useState<CloseScene[]>([]);
  const [closeState, setCloseState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [mode, setMode] = useState<'words' | 'free'>(initialMode);
  const [format, setFormat] = useState<'scene' | 'debate'>('scene');
  const [sceneChoice, setSceneChoice] = useState('new');
  const [closeDebates, setCloseDebates] = useState<CloseScene[]>([]);
  const [debateCloseState, setDebateCloseState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [debateChoice, setDebateChoice] = useState('new');
  const [debateExpanded, setDebateExpanded] = useState(false);
  const [debateReload, setDebateReload] = useState(0);
  const choiceListRef = useRef<string | null>(null);
  const debateListRef = useRef<string | null>(null);
  const seedRef = useRef(initialSenseIds);
  seedRef.current = initialSenseIds;
  const loadTokenRef = useRef(0);

  const loadFive = useCallback(async (nextListId: string, senseIds: string[]) => {
    if (!token) return;
    const requestToken = loadTokenRef.current + 1;
    loadTokenRef.current = requestToken;
    setWordsState('loading');
    setWordsError(null);
    setSwapOpen(false);
    setPhase('lesson');
    setDraft(null);
    setGenError(null);
    choiceListRef.current = null;
    setSceneChoice('new');
    try {
      const resp = await fetch(`${base}/api/vocabulary/srs/production/five`, {
        method: 'POST',
        headers: buildAgentJsonHeaders(token, learningLanguage),
        body: JSON.stringify({
          list_id: nextListId,
          ...(senseIds.length > 0 ? { sense_ids: senseIds } : {}),
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (loadTokenRef.current !== requestToken) return;
      if (!resp.ok || !Array.isArray(data?.items)) {
        throw new Error(data?.error === 'Choose from two to five words'
          ? 'В диалоге от 2 до 5 слов'
          : 'Не удалось собрать слова на сегодня');
      }
      setActiveListId(nextListId);
      setWords(data.items.flatMap((item: Parameters<typeof mapFiveItem>[0]) => {
        const mapped = mapFiveItem(item);
        return mapped ? [mapped] : [];
      }));
      setWordsState('idle');
    } catch {
      if (loadTokenRef.current !== requestToken) return;
      setWords([]);
      setWordsState('error');
      setWordsError('Не удалось собрать слова на сегодня');
    }
  }, [base, learningLanguage, token]);

  useEffect(() => {
    if (!token) {
      setListsState('idle');
      return;
    }
    let cancelled = false;
    setListsState('loading');
    fetch(`${base}/api/vocabulary/lists`, {
      headers: buildAgentAuthHeaders(token, learningLanguage),
    })
      .then(async (resp) => {
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !Array.isArray(data?.items)) throw new Error('lists');
        const mapped = (data.items as VocabListCard[]).flatMap((item) => {
          const id = typeof item?.id === 'string' ? item.id : '';
          const title = typeof item?.title === 'string' ? item.title.trim() : '';
          if (!id || !title) return [];
          const systemKey = typeof item?.system_key === 'string' && item.system_key.trim()
            ? item.system_key
            : null;
          return [{ id, title, word_count: Number(item.word_count) || 0, system_key: systemKey }];
        });
        const offered = (Array.isArray(data?.starter_packs) ? data.starter_packs : []).flatMap((pack: {
          key?: unknown;
          title?: unknown;
          word_count?: unknown;
          in_library?: unknown;
        }) => {
          const key = typeof pack?.key === 'string' ? pack.key.trim() : '';
          const title = typeof pack?.title === 'string' ? pack.title.trim() : '';
          if (!key || !title || pack?.in_library === true) return [];
          return [{ key, title, word_count: Number(pack.word_count) || 0 }];
        });
        if (cancelled) return;
        setLists(mapped);
        setStarterPacks(offered.filter((pack) => !mapped.some((item) => item.system_key === pack.key)));
        setListsState('idle');
        if (listId && mapped.some((item) => item.id === listId)) {
          void loadFive(listId, seedRef.current);
        }
        const counts = await Promise.all(mapped.map(async (item) => {
          try {
            const readyResp = await fetch(`${base}/api/vocabulary/srs/production/five`, {
              method: 'POST',
              headers: buildAgentJsonHeaders(token, learningLanguage),
              body: JSON.stringify({ list_id: item.id }),
            });
            const readyData = await readyResp.json().catch(() => ({}));
            if (!readyResp.ok || typeof readyData?.count !== 'number') return [item.id, -1] as const;
            return [item.id, readyData.count] as const;
          } catch {
            return [item.id, -1] as const;
          }
        }));
        if (cancelled) return;
        setReadyByList(Object.fromEntries(counts.filter((entry) => entry[1] >= 0)));
      })
      .catch(() => {
        if (!cancelled) setListsState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [base, learningLanguage, listId, loadFive, token]);

  const seedKey = initialSenseIds.join(',');
  const appliedSeedRef = useRef('');
  useEffect(() => {
    if (!token || !listId || initialSenseIds.length < 2) return;
    const key = `${listId}|${seedKey}`;
    if (appliedSeedRef.current === key) return;
    appliedSeedRef.current = key;
    void loadFive(listId, initialSenseIds);
  }, [initialSenseIds, listId, loadFive, seedKey, token]);

  const openSwap = async () => {
    if (!token || !activeListId) return;
    setSwapOpen(true);
    setPhase('lesson');
    setDraft(null);
    setPicked(words.map((word) => word.senseId));
    try {
      const resp = await fetch(`${base}/api/vocabulary/lists/${encodeURIComponent(activeListId)}`, {
        headers: buildAgentAuthHeaders(token, learningLanguage),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !Array.isArray(data?.words)) throw new Error('words');
      const rows: ChatPracticeSense[] = [];
      const seen = new Set<string>();
      for (const word of data.words as Array<{ headword?: unknown; gloss_ru?: unknown; sense_ids?: unknown }>) {
        const headword = typeof word?.headword === 'string' ? word.headword.trim() : '';
        const glossRu = typeof word?.gloss_ru === 'string' ? word.gloss_ru.trim() : '';
        const ids = Array.isArray(word?.sense_ids) ? word.sense_ids : [];
        if (!headword || !glossRu) continue;
        for (const raw of ids) {
          const senseId = typeof raw === 'string' ? raw.trim() : '';
          if (!senseId || seen.has(senseId)) continue;
          seen.add(senseId);
          rows.push({ senseId, headword, glossRu });
        }
      }
      setCatalog(rows);
    } catch {
      setCatalog([]);
      setWordsError('Не удалось открыть слова списка');
    }
  };

  const togglePick = (senseId: string) => {
    setPicked((current) => {
      if (current.includes(senseId)) return current.filter((id) => id !== senseId);
      if (current.length >= 5) return current;
      return [...current, senseId];
    });
  };

  const activeList = lists.find((item) => item.id === activeListId) || null;

  const generate = async (kind: 'roleplay' | 'debate') => {
    if (!activeList || words.length < 2 || phase === 'working') return;
    if (kind === 'roleplay' && learningLanguage !== 'zh' && onOpenScenarioDraft && activeList) {
      onOpenScenarioDraft({
        level: cefrLevel(level),
        topic: activeList.title,
        goal: `Сказать самому: ${words.map((word) => word.glossRu).join(', ')}`,
        prompt: `Список «${activeList.title}». Бытовая сцена, где ученик сам говорит эти значения: ${wordBrief(words)}. Не просить вставить слово и не называть английские слова первым.`,
      }, words, activeList.id);
      return;
    }
    setPhase('working');
    setBusyKind(kind);
    setGenError(null);
    setDraft(null);
    try {
      if (kind === 'debate') {
        const result = await generateDebateTopic({
          difficulty: debateDifficulty(level),
          seed: `Список ученика «${activeList.title}». Тема спора, в котором естественно сказать значения: ${words.map((word) => word.glossRu).join(', ')}. Формулировка по-русски. Английские слова списка в теме не называть.`,
        });
        const userId = (await supabase.auth.getUser()).data.user?.id;
        if (!userId) throw new Error('Войдите, чтобы закрепить тему за списком');
        const saved = await saveUserDebateTopic(userId, result.text, { difficulty: debateDifficulty(level) });
        if (!saved?.id) throw new Error('Не удалось сохранить тему');
        await bindPracticeList(activeList.id, {
          kind: 'debate',
          ref: saved.id,
          origin: 'user',
          label: result.text,
        });
        setDebateChoice(saved.id);
        debateListRef.current = activeList.id;
        setDebateReload((value) => value + 1);
        setDraft({
          kind: 'debate',
          title: result.text,
          place: '',
          goal: 'Выберите сторону, затем скажите значения из списка, когда спор сам даст для этого повод.',
          topic: result.text,
          level: cefrLevel(level),
          payload: null,
          zh: null,
          savedId: saved.id,
        });
      } else if (learningLanguage === 'zh') {
        const result = await generateZhScenario({
          prompt: `Список ученика «${activeList.title}». Ситуативный диалог, где ученику самому нужно выразить: ${wordBrief(words)}. Не проси вставить слово и не оставляй пропуск.`,
          hsk_level: hskLevel(level),
          goal: 'Ученик сам говорит значения из своего списка, потому что ситуация этого требует.',
        });
        const scenario = draftFromGenerateResult(result);
        setDraft({
          kind: 'roleplay',
          title: scenario.title,
          place: scenario.setting_ru || '',
          goal: scenario.goals?.[0] || scenario.scenario_text_ru || '',
          topic: '',
          level: cefrLevel(level),
          payload: null,
          zh: scenario,
        });
      } else {
        const result = await generateUserScenario({
          prompt: `The learner chose their own list "${activeList.title}". Build one short everyday scene where the learner will naturally need to express these meanings themselves: ${wordBrief(words)}. Do not ask them to use, say, or insert a word. Do not make a fill-in-the-blank.`,
          level: cefrLevel(level),
          structured: {
            topic: activeList.title,
            goal: 'The learner expresses the meanings from their own list because the situation requires it.',
            slangMode: 'off',
            allowProfanity: false,
          },
        });
        setDraft({
          kind: 'roleplay',
          title: result.title,
          place: textOf(result.payload, 'settingRu'),
          goal: textOf(result.payload, 'goalRu') || textOf(result.payload, 'description'),
          topic: '',
          level: result.level,
          payload: result.payload,
          zh: null,
        });
      }
      setPhase('ready');
    } catch (err) {
      setPhase('lesson');
      setGenError(err instanceof Error ? err.message : 'Не удалось собрать занятие');
    } finally {
      setBusyKind(null);
    }
  };

  const begin = async () => {
    if (!activeList || !draft || starting) return;
    if (draft.kind === 'roleplay' && !draft.zh && onOpenScenarioDraft) {
      onOpenScenarioDraft({
        level: draft.level,
        topic: activeList.title,
        place: draft.place,
        role: '',
        goal: draft.goal,
        prompt: `Список «${activeList.title}». ${draft.goal}`,
        generated: {
          title: draft.title,
          level: draft.level,
          payload: draft.payload || {},
        },
      }, words, activeList.id);
      return;
    }
    setStarting(true);
    setGenError(null);
    try {
      if (draft.kind === 'debate') {
        onBeginDebate(draft.topic || draft.title, words, activeList.id);
        return;
      }
      if (draft.zh) {
        const saved = await createZhScenario(toZhWritePayload(draft.zh));
        const scenario = zhScenarioToRoleplay(saved);
        if (onOpenSceneMenu) {
          onOpenSceneMenu(scenario, words, activeList.id);
          return;
        }
        onBeginScenario(scenario, words, activeList.id);
        return;
      }
      const created = await createUserScenario({
        title: draft.title,
        level: draft.level,
        payload: draft.payload || {},
      });
      if (onOpenSceneMenu) {
        onOpenSceneMenu(created, words, activeList.id);
        return;
      }
      onBeginScenario(created, words, activeList.id);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Не удалось начать занятие');
    } finally {
      setStarting(false);
    }
  };

  const glossKey = words.map((word) => word.glossRu).join('|');
  const closeKey = `${activeListId || ''}|${glossKey}`;
  useEffect(() => {
    if (!token || !activeListId || words.length < 2) {
      setCloseScenes([]);
      setCloseState('idle');
      return;
    }
    let cancelled = false;
    setCloseScenes([]);
    setCloseState('loading');
    loadPracticeMatches({
      apiUrl,
      token,
      learningLanguage,
      mode: 'roleplay',
      listId: activeListId,
      glosses: glossKey.split('|').filter(Boolean),
    })
      .then((result) => {
        if (cancelled) return;
        const rows = [result.bound, ...result.matches].filter((row): row is CloseScene => Boolean(row?.scenario));
        setCloseScenes(rows);
        setCloseState('idle');
        if (choiceListRef.current !== activeListId) {
          setSceneChoice(rows[0]?.id || 'new');
          choiceListRef.current = activeListId;
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCloseScenes([]);
          setCloseState('error');
        }
      });
    return () => { cancelled = true; };
  }, [activeListId, apiUrl, closeKey, glossKey, learningLanguage, token, words.length]);

  useEffect(() => {
    if (situationalOnly || !token || !activeListId || words.length < 2) {
      setCloseDebates([]);
      setDebateCloseState('idle');
      return;
    }
    let cancelled = false;
    setCloseDebates([]);
    setDebateCloseState('loading');
    loadPracticeMatches({
      apiUrl,
      token,
      learningLanguage,
      mode: 'debate',
      listId: activeListId,
      glosses: glossKey.split('|').filter(Boolean),
    })
      .then((result) => {
        if (cancelled) return;
        const rows = [result.bound, ...result.matches].filter((row): row is CloseScene => Boolean(row?.debateTopic));
        setCloseDebates(rows);
        setDebateCloseState('idle');
        if (debateListRef.current !== activeListId) {
          setDebateChoice(rows[0]?.id || 'new');
          setDebateExpanded(false);
          debateListRef.current = activeListId;
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCloseDebates([]);
          setDebateCloseState('error');
        }
      });
    return () => { cancelled = true; };
  }, [activeListId, apiUrl, closeKey, debateReload, glossKey, learningLanguage, situationalOnly, token, words.length]);

  const readyScene = sceneChoice !== 'new'
    ? closeScenes.find((scene) => scene.id === sceneChoice) || null
    : null;
  const shownScenes = closeScenes.slice(0, 3);

  useEffect(() => {
    if (situationalOnly) setFormat('scene');
  }, [situationalOnly]);

  useEffect(() => {
    if (!swapOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSwapOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [swapOpen]);
  const startClose = (scene: CloseScene) => {
    if (!activeList || !scene.scenario || starting || phase === 'working') return;
    const scenario = scene.scenario;
    if (learningLanguage !== 'zh' && onOpenScenarioDraft) {
      const { id, ...rest } = scenario;
      const sceneLevel: UserScenarioLevel = scenario.difficulty === 'easy' || scenario.difficulty === 'medium' || scenario.difficulty === 'hard'
        ? scenario.difficulty
        : cefrLevel(level);
      onOpenScenarioDraft({
        level: sceneLevel,
        topic: scenario.title,
        place: scenario.settingRu || scenario.setting || '',
        role: scenario.yourRoleRu || scenario.yourRole || '',
        goal: scenario.goalRu || scenario.goal || '',
        prompt: scenario.scenarioTextRu || scenario.scenarioText || scenario.description || '',
        savedId: isUserScenarioId(scenario.id) ? scenario.id : null,
        generated: {
          title: scenario.title,
          level: sceneLevel,
          payload: {
            ...rest,
            ...(isUserScenarioId(id) ? {} : { catalogScenarioId: id }),
          },
        },
      }, words, activeList.id);
      return;
    }
    if (onOpenSceneMenu) {
      onOpenSceneMenu(scenario, words, activeList.id);
      return;
    }
    onBeginScenario(scenario, words, activeList.id);
  };

  const enough = words.length >= 2;
  const shownReady = readyScene && shownScenes.some((scene) => scene.id === readyScene.id) ? readyScene : null;
  const shownDebates = debateExpanded ? closeDebates : closeDebates.slice(0, 3);
  const selectedDebate = debateChoice !== 'new'
    ? closeDebates.find((topic) => topic.id === debateChoice) || null
    : null;
  const debateReady = format === 'debate' && phase === 'ready' && draft?.kind === 'debate';
  const freshDebate = debateReady && draft?.savedId && draft.savedId !== selectedDebate?.id ? draft : null;
  const generatedScene = format === 'scene' && phase === 'ready' && draft?.kind === 'roleplay';
  const goLabel = !activeList || words.length < 2
    ? 'Нужно минимум 2 слова'
    : phase === 'working'
      ? (format === 'debate' ? 'Собираю тему…' : 'Собираю…')
      : starting
        ? 'Открываю…'
        : format === 'debate'
          ? (selectedDebate?.title
            ? `К теме «${selectedDebate.title.length > 42 ? `${selectedDebate.title.slice(0, 40)}…` : selectedDebate.title}»`
            : freshDebate
              ? 'К теме'
              : 'Собрать тему с ИИ')
          : generatedScene
            ? (situationalOnly ? 'К диалогу' : 'К сцене')
            : shownReady
              ? (situationalOnly ? `К диалогу «${shownReady.title}»` : `К сцене «${shownReady.title}»`)
              : (situationalOnly ? 'Собрать диалог с ИИ' : 'Собрать сцену с ИИ');

  const chooseScene = (id: string) => {
    choiceListRef.current = activeListId;
    setSceneChoice(id);
    setPhase('lesson');
    setDraft(null);
  };

  const chooseDebate = (id: string) => {
    debateListRef.current = activeListId;
    setDebateChoice(id);
    if (id === 'new') {
      setDraft(null);
      setPhase('lesson');
    }
  };

  const go = () => {
    if (!enough || phase === 'working' || starting || !activeList) return;
    if (format === 'debate') {
      const topic = selectedDebate?.debateTopic || freshDebate?.topic || '';
      if (topic) {
        onBeginDebate(topic, words, activeList.id);
        return;
      }
      void generate('debate');
      return;
    }
    if (generatedScene) {
      void begin();
      return;
    }
    if (shownReady) {
      startClose(shownReady);
      return;
    }
    void generate('roleplay');
  };

  const needle = listQuery.trim().toLowerCase();
  const visibleLists = lists.filter((item) => !needle || item.title.toLowerCase().includes(needle));
  const ownLists = visibleLists.filter((item) => !item.system_key);
  const packLists = visibleLists.filter((item) => item.system_key);
  const savedPackKeys = new Set(lists.flatMap((item) => (item.system_key ? [item.system_key] : [])));
  const offeredPacks = starterPacks.filter((pack) => !savedPackKeys.has(pack.key) && (!needle || pack.title.toLowerCase().includes(needle)));
  const mineTotal = lists.filter((item) => !item.system_key).length;
  const packTotal = lists.filter((item) => item.system_key).length + starterPacks.filter((pack) => !savedPackKeys.has(pack.key)).length;

  const addStarterPack = async (key: string) => {
    if (!token || addingPackKey) return;
    setAddingPackKey(key);
    setWordsError(null);
    try {
      const resp = await fetch(`${base}/api/vocabulary/lists/starter`, {
        method: 'POST',
        headers: buildAgentJsonHeaders(token, learningLanguage),
        body: JSON.stringify({ key }),
      });
      const data = await resp.json().catch(() => ({}));
      const id = typeof data?.item?.id === 'string' ? data.item.id : '';
      if (!resp.ok || !id) throw new Error('starter');
      const offer = starterPacks.find((pack) => pack.key === key);
      const card: VocabListCard = {
        id,
        title: typeof data.item.title === 'string' && data.item.title.trim() ? data.item.title.trim() : (offer?.title || key),
        word_count: Number(data.item.word_count) || offer?.word_count || 0,
        system_key: key,
      };
      setLists((prev) => (prev.some((item) => item.id === id || item.system_key === key) ? prev : [...prev, card]));
      setStarterPacks((prev) => prev.filter((pack) => pack.key !== key));
      await loadFive(id, []);
    } catch {
      setWordsError('Не удалось добавить набор');
    } finally {
      setAddingPackKey(null);
    }
  };

  const listButton = (item: VocabListCard) => {
    const known = item.id in readyByList;
    const ready = known ? Math.min(5, Math.max(0, readyByList[item.id])) : 0;
    return (
      <button
        key={item.id}
        type="button"
        className={styles.li}
        aria-pressed={activeListId === item.id}
        onClick={() => void loadFive(item.id, [])}
      >
        <b>{item.title}</b>
        <small>{listSizeLabel(item.word_count)}</small>
        <span className={`${styles.due} ${ready > 0 ? styles.dueOk : ''}`}>
          <span>{known ? (ready > 0 ? `${ready} на сегодня` : 'нет на сегодня') : 'считаю…'}</span>
          <span className={styles.pips} aria-hidden="true">
            {[1, 2, 3, 4, 5].map((step) => (
              <i key={step} className={step <= ready ? styles.on : undefined} />
            ))}
          </span>
        </span>
      </button>
    );
  };

  return (
    <section className={styles.home} aria-label="Практика">
      <header className={styles.top}>
        {mode === 'words' && (
          <div>
            <h1>Практика</h1>
            <p>Слова из списка прокачиваются в диалоге. Выберите, что говорить и в каком формате.</p>
          </div>
        )}
        <div className={styles.seg} role="group" aria-label="Режим">
          <button type="button" aria-pressed={mode === 'words'} onClick={() => { setMode('words'); onChooserOpen?.(false); }}>
            Со словами <span className={styles.tag}>основной</span>
          </button>
          <button type="button" aria-pressed={mode === 'free'} onClick={() => { setMode('free'); onChooserOpen?.(true); }}>Без слов</button>
        </div>
      </header>

      {!token && <p className={styles.mut}>Войдите, чтобы собрать слова на сегодня.</p>}

      {token && mode === 'free' && (
        <section className={styles.modes} aria-label="Формат без слов">
          <div className={styles.modesHead}>
            <div>
              <h2>Как поговорить</h2>
              <p>Три формата без слов из списков. Прогресс по словам не изменится.</p>
            </div>
          </div>
          <div className={situationalOnly ? styles.modeGridTwo : styles.modeGrid}>
            <button type="button" className={styles.modeCard} onClick={onFreeChat}>
              <span className={styles.modeMark}><Icon name="c" /></span>
              <b>Свободный разговор</b>
              <span className={styles.modeText}>Любая тема. Собеседник просто поддерживает беседу и помогает формулировать.</span>
              <em>Без сцены и без темы спора</em>
            </button>
            <button type="button" className={styles.modeCard} onClick={() => onFreeRoleplay?.()}>
              <span className={styles.modeMark}><Icon name="sc" /></span>
              <b>{situationalOnly ? 'Диалог' : 'Ролевая сцена'}</b>
              <span className={styles.modeText}>{situationalOnly ? 'Ситуация: магазин, аптека, звонок. Собеседник играет свою роль.' : 'Ситуация вроде кафе, магазина или звонка. Собеседник играет свою роль, вы — свою.'}</span>
              <em>Дальше — выбор или своя сцена</em>
            </button>
            {!situationalOnly && (
              <button type="button" className={styles.modeCard} onClick={() => onFreeDebate?.()}>
                <span className={styles.modeMark}><Icon name="d" /></span>
                <b>Дебаты</b>
                <span className={styles.modeText}>Спор на тему. Вы выбираете сторону, собеседник аргументирует с другой.</span>
                <em>Дальше — выбор или своя тема</em>
              </button>
            )}
          </div>
        </section>
      )}

      {token && mode === 'words' && (
        <div className={styles.cols}>
          <section className={styles.pane} aria-label="Выбор списка">
            <div className={styles.sh}><span className={styles.n}>1</span>Список слов</div>
            <div className={styles.ctl}>
              <label className={styles.inp}>
                <Icon name="s" />
                <input
                  className={styles.field}
                  type="text"
                  value={listQuery}
                  placeholder="Найти список"
                  aria-label="Поиск списков"
                  onChange={(event) => setListQuery(event.target.value)}
                />
              </label>
              <div className={styles.pillSeg} role="group" aria-label="Показать">
                {([
                  ['all', 'Все', mineTotal + packTotal],
                  ['mine', 'Мои', mineTotal],
                  ['packs', 'Наборы', packTotal],
                ] as const).map(([id, label, count]) => (
                  <button key={id} type="button" aria-pressed={listScope === id} onClick={() => setListScope(id)}>
                    {label}<b>{count}</b>
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.lists}>
              {listsState === 'loading' && <p className={styles.mut}>Собираю списки…</p>}
              {listsState === 'error' && <p className={styles.mut}>Не удалось открыть списки.</p>}
              {listsState === 'idle' && needle && visibleLists.length === 0 && offeredPacks.length === 0 && <p className={styles.mut}>Такого списка нет.</p>}
              {listScope !== 'packs' && ownLists.length > 0 && (
                <>
                  <h3>Мои списки</h3>
                  {ownLists.map(listButton)}
                </>
              )}
              {listScope !== 'mine' && (packLists.length > 0 || offeredPacks.length > 0) && (
                <>
                  <h3>Готовые наборы</h3>
                  {packLists.map(listButton)}
                  {offeredPacks.map((pack) => (
                    <button
                      key={pack.key}
                      type="button"
                      className={styles.li}
                      disabled={addingPackKey !== null}
                      onClick={() => void addStarterPack(pack.key)}
                    >
                      <b>{pack.title}</b>
                      <small>{addingPackKey === pack.key ? 'Добавляю…' : listSizeLabel(pack.word_count)}</small>
                    </button>
                  ))}
                </>
              )}
              {listScope === 'packs' && packLists.length === 0 && offeredPacks.length === 0 && listsState === 'idle' && (
                <p className={styles.mut}>{needle ? 'В наборах такого нет.' : 'Готовых наборов пока нет.'}</p>
              )}
            </div>
          </section>

          <section className={styles.pane} aria-label="Занятие">
            <div className={styles.sec}>
              <div className={styles.sh}>
                <span className={styles.n}>2</span>
                Слова на сегодня{words.length ? ` · ${words.length}` : ''}
                {activeList && (
                  <span className={styles.act}>
                    <button type="button" className={styles.link} onClick={() => void openSwap()}>
                      {words.length ? 'Заменить' : 'Выбрать'}
                    </button>
                  </span>
                )}
              </div>
              {!activeList && (
                <div className={styles.warn}><b>Выберите список</b>Слева — свои списки и готовые наборы.</div>
              )}
              {activeList && wordsState === 'loading' && <p className={styles.mut}>Собираю слова…</p>}
              {wordsError && <p className={styles.err}>{wordsError}</p>}
              {activeList && wordsState !== 'loading' && words.length === 0 && (
                <div className={styles.warn}>
                  <b>На сегодня слов нет</b>
                  Выберите другой список или отберите слова вручную.
                </div>
              )}
              {words.length > 0 && (
                <>
                  <div className={styles.chips}>
                    {words.map((word) => {
                      const kind = bucketKind(word);
                      return (
                        <div key={word.senseId} className={styles.wd} style={{ ['--c' as string]: KIND_COLOR[kind] }}>
                          <b>{word.headword}</b>
                          <span>{word.glossRu}</span>
                          <em>{bucketLabel(kind)}</em>
                        </div>
                      );
                    })}
                  </div>
                  <p className={styles.hint}>
                    {enough
                      ? 'Собеседник слова не подскажет. Их нужно сказать самому.'
                      : 'Для занятия нужно минимум 2 слова. Добавьте ещё.'}
                  </p>
                </>
              )}
            </div>

            <div className={`${styles.sec} ${enough ? '' : styles.locked}`}>
              <div className={styles.sh}><span className={styles.n}>3</span>Формат</div>
              <div className={styles.fmt}>
                <button type="button" className={styles.f} aria-pressed={format === 'scene'} onClick={() => setFormat('scene')}>
                  <span className={styles.ic}><Icon name="sc" /></span>
                  <b>{situationalOnly ? 'Диалог' : 'Ролевая сцена'}</b>
                  <small>{situationalOnly ? 'Разговор в ситуации: магазин, аптека, звонок.' : 'Диалог в ситуации: магазин, аптека, звонок.'}</small>
                </button>
                {!situationalOnly && (
                  <button type="button" className={styles.f} aria-pressed={format === 'debate'} onClick={() => setFormat('debate')}>
                    <span className={styles.ic}><Icon name="d" /></span>
                    <b>Дебаты</b>
                    <small>Спор на тему. Нужно аргументировать.</small>
                  </button>
                )}
              </div>
              <div className={styles.sub}>
                {format === 'scene' ? (
                  <>
                    {closeState === 'loading' && <p className={styles.mut}>{situationalOnly ? 'Ищу близкий диалог…' : 'Ищу близкую сцену…'}</p>}
                    {closeState === 'error' && <p className={styles.mut}>Не удалось проверить готовые сцены. Можно собрать новую.</p>}
                    {shownScenes.map((scene) => (
                      <button
                        key={scene.id}
                        type="button"
                        className={styles.opt}
                        aria-pressed={sceneChoice === scene.id}
                        onClick={() => chooseScene(scene.id)}
                      >
                        <span className={styles.radio} />
                        <span>
                          <b>{scene.title}</b>
                          <small>
                            {scene.bound
                              ? (situationalOnly ? 'Список уже привязан к этому диалогу' : 'Список уже привязан к этой сцене')
                              : (scene.reason ? `Близко по теме: ${scene.reason}` : 'Близкая сцена под эти слова')}
                          </small>
                        </span>
                        {scene.bound && <span className={styles.chip}>Закреплена</span>}
                      </button>
                    ))}
                    {closeScenes.length > shownScenes.length && onBrowseScenes && activeList && (
                      <button type="button" className={styles.link} onClick={() => onBrowseScenes(words, activeList.id)}>
                        {moreCloseLabel(closeScenes.length - shownScenes.length, situationalOnly)}
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.opt}
                      aria-pressed={!shownReady && sceneChoice === 'new'}
                      onClick={() => chooseScene('new')}
                    >
                      <span className={styles.radio} />
                      <span>
                        <b>{situationalOnly ? 'Собрать новый диалог с помощью ИИ' : 'Собрать новую сцену с помощью ИИ'}</b>
                        <small>ИИ подберёт уровень, цель и шаги. Сцена закрепится за этим списком</small>
                      </span>
                      <span className={`${styles.chip} ${styles.chipAi}`}><Icon name="ai" />ИИ</span>
                    </button>
                  </>
                ) : (
                  <>
                    {debateCloseState === 'loading' && <p className={styles.mut}>Ищу близкую тему…</p>}
                    {debateCloseState === 'error' && <p className={styles.mut}>Не удалось проверить готовые темы. Можно собрать новую.</p>}
                    {debateCloseState === 'idle' && closeDebates.length === 0 && !freshDebate && (
                      <p className={styles.mut}>Готовой темы под эти слова нет.</p>
                    )}
                    {shownDebates.map((topic) => (
                      <button
                        key={topic.id}
                        type="button"
                        className={styles.opt}
                        aria-pressed={debateChoice === topic.id}
                        onClick={() => chooseDebate(topic.id)}
                      >
                        <span className={styles.radio} />
                        <span>
                          <b>{topic.title}</b>
                          <small>
                            {topic.bound
                              ? 'Эта тема закреплена за списком'
                              : (topic.reason ? `Близко по теме: ${topic.reason}` : 'Близкая тема под эти слова')}
                          </small>
                        </span>
                        {topic.bound && <span className={styles.chip}>Закреплена</span>}
                      </button>
                    ))}
                    {freshDebate && (
                      <button
                        type="button"
                        className={styles.opt}
                        aria-pressed={debateChoice === freshDebate.savedId}
                        onClick={() => freshDebate.savedId && chooseDebate(freshDebate.savedId)}
                      >
                        <span className={styles.radio} />
                        <span>
                          <b>{freshDebate.title}</b>
                          <small>Эта тема закреплена за списком</small>
                        </span>
                        <span className={styles.chip}>Закреплена</span>
                      </button>
                    )}
                    {!debateExpanded && closeDebates.length > 3 && (
                      <button type="button" className={styles.link} onClick={() => setDebateExpanded(true)}>
                        {moreDebateLabel(closeDebates.length - 3)}
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.opt}
                      aria-pressed={debateChoice === 'new' && !freshDebate}
                      onClick={() => chooseDebate('new')}
                    >
                      <span className={styles.radio} />
                      <span>
                        <b>Собрать новую тему с помощью ИИ</b>
                        <small>Новая тема закрепится за этим списком</small>
                      </span>
                      <span className={`${styles.chip} ${styles.chipAi}`}><Icon name="ai" />ИИ</span>
                    </button>
                    {(selectedDebate?.bound || freshDebate) && (
                      <button type="button" className={styles.link} disabled={phase === 'working'} onClick={() => void generate('debate')}>
                        Другая тема
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className={styles.cta}>
              <button type="button" className={styles.go} disabled={!enough || phase === 'working' || starting} onClick={go}>
                {goLabel}{enough && phase !== 'working' && !starting ? <Icon name="a" /> : null}
              </button>
              {genError && <p className={styles.err}>{genError}</p>}
            </div>
          </section>
        </div>
      )}

      {swapOpen && activeList && (
        <div className={styles.scrim} onClick={() => setSwapOpen(false)}>
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-label="Выбор слов"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.mh}>
              <h2>Какие слова сказать</h2>
              <p>Выберите от 2 до 5. Слова «Пора сказать» приоритетнее.</p>
            </div>
            <div className={styles.mb}>
              {catalog.length === 0 && <p className={styles.mut}>Открываю слова списка…</p>}
              {catalog.map((word) => {
                const on = picked.includes(word.senseId);
                const known = words.find((item) => item.senseId === word.senseId);
                const kind = known ? bucketKind(known) : null;
                return (
                  <button
                    key={word.senseId}
                    type="button"
                    className={styles.pk}
                    aria-pressed={on}
                    onClick={() => togglePick(word.senseId)}
                  >
                    <span className={styles.cb}><Icon name="t" /></span>
                    <b>{word.headword}</b>
                    <span className={styles.gloss}>{word.glossRu}</span>
                    {kind && <em style={{ ['--c' as string]: KIND_COLOR[kind] }}>{bucketLabel(kind)}</em>}
                  </button>
                );
              })}
            </div>
            <div className={styles.mf}>
              <span className={styles.cnt}>{picked.length} из 5</span>
              <button type="button" className={styles.btn} onClick={() => setSwapOpen(false)}>Отмена</button>
              <button
                type="button"
                className={`${styles.btn} ${styles.pri}`}
                disabled={picked.length < 2 || picked.length > 5}
                onClick={() => void loadFive(activeList.id, picked)}
              >
                Оставить
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const KIND_COLOR = { due: '#ff9b9b', new: '#7aa2ff', early: '#ffa14d' };

function Icon({ name }: { name: 's' | 't' | 'c' | 'sc' | 'd' | 'ai' | 'a' }) {
  const common = { className: styles.ico, viewBox: '0 0 24 24', 'aria-hidden': true as const };
  if (name === 's') return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>;
  if (name === 't') return <svg {...common}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
  if (name === 'c') return <svg {...common}><path d="M4 5h16v11H9l-5 4z" /></svg>;
  if (name === 'sc') return <svg {...common}><path d="M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 10a3 3 0 100-6 3 3 0 000 6M21 19v-1a4 4 0 00-3-3.9M15.5 4.2a3 3 0 010 5.6" /></svg>;
  if (name === 'd') return <svg {...common}><path d="M3 5h11v7H8l-3 3zM21 11h-9v7h5l3 3z" /></svg>;
  if (name === 'ai') return <svg {...common}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 16v4M17 18h4" /></svg>;
  return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}
