'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { buildAgentAuthHeaders } from '@/lib/agent-request';
import { useLearningLanguage } from '@/context/LearningLanguageContext';

export type RecognitionBucket = 'due' | 'learning' | 'new' | 'mastered';
export type SpeakMark = 'said' | 'waiting' | 'hinted' | 'missed' | 'silent';

export type ProgressWordRow = {
  key: string;
  headword: string;
  listTitle: string;
  recognition: RecognitionBucket;
  speak: SpeakMark;
  everSaid: boolean;
  gloss: string;
};

export type ProgressModuleCard = {
  id: string;
  title: string;
  kind: string;
  wordCount: number;
  stats: { new: number; learning: number; due: number; mastered: number };
  saidInLast: number;
  lastMeta: string;
  weak: string[];
  coveragePct: number;
  sessions7: number;
  sessions30: number;
  hintFree: number;
  practiceHref: string;
  continueHref: string | null;
  continueLabel: string;
  repickHref: string | null;
};

export type ProgressWordsModel = {
  state: 'loading' | 'ready' | 'error';
  wordsReady: boolean;
  due: number;
  learning: number;
  fresh: number;
  mastered: number;
  total: number;
  said: number;
  words: ProgressWordRow[];
  modules: ProgressModuleCard[];
};

const EMPTY: ProgressWordsModel = {
  state: 'loading',
  wordsReady: false,
  due: 0,
  learning: 0,
  fresh: 0,
  mastered: 0,
  total: 0,
  said: 0,
  words: [],
  modules: [],
};

type FunnelStats = { new?: number; learning?: number; due?: number; mastered?: number; word_count?: number };

type ApiModule = {
  id: string;
  title?: string;
  bound_kind?: string | null;
  bound_ref?: string | null;
  bound_label?: string | null;
  stats?: FunnelStats;
  coverage_pct?: number;
  sessions_7d?: number;
  sessions_30d?: number;
  hint_free_assessed?: number;
  weak_words?: Array<{ headword?: string }>;
  recent_sessions?: Array<{
    status?: string;
    created_at?: string;
    used_count?: number;
  }>;
};

type ApiWord = {
  vocabulary_id?: string;
  headword?: string;
  gloss_ru?: string | null;
  status?: string;
  speech?: string;
  sense_ids?: string[];
};

type RecentItem = {
  created_at?: string;
  targets?: Array<{ sense_id?: string; status?: string }>;
};

function getApiUrl() {
  const url = process.env.NEXT_PUBLIC_API_URL || '';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function asBucket(value: unknown): RecognitionBucket {
  if (value === 'due' || value === 'learning' || value === 'mastered') return value;
  return 'new';
}

function kindLabel(kind: string | null | undefined) {
  if (kind === 'chat') return 'Свободный диалог';
  if (kind === 'debate') return 'Дебат';
  if (kind === 'scenario') return 'Сцена';
  return 'Список';
}

function practiceHref(mod: ApiModule) {
  if (mod.bound_kind === 'scenario' && mod.bound_ref) {
    return `/dashboard?tab=agent&from=vocab&list=${mod.id}&target=rp:${mod.bound_ref}`;
  }
  if (mod.bound_kind === 'debate') {
    return `/dashboard?tab=agent&from=vocab&list=${mod.id}&mode=debate`;
  }
  if (mod.bound_kind === 'chat') {
    return `/dashboard?tab=agent&from=vocab&list=${mod.id}&mode=chat`;
  }
  return `/dashboard?tab=dictionary&list=${mod.id}`;
}

function continueMeta(mod: ApiModule) {
  const href = practiceHref(mod);
  if (mod.bound_kind === 'scenario' && mod.bound_ref) {
    return { href, label: 'Продолжить сцену' };
  }
  if (mod.bound_kind === 'debate') return { href, label: 'Продолжить дебат' };
  if (mod.bound_kind === 'chat') return { href, label: 'Продолжить диалог' };
  return { href: null, label: 'Открыть список' };
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function sessionStatus(status: string | undefined) {
  if (status === 'assessed') return 'Оценено';
  if (status === 'abandoned') return 'Вышли';
  return 'В процессе';
}

function mapLatest(status: string | undefined): SpeakMark | null {
  if (status === 'used') return 'said';
  if (status === 'waiting') return 'waiting';
  if (status === 'hinted') return 'hinted';
  if (status === 'missed' || status === 'unused') return 'missed';
  return null;
}

function resolveSpeak(speech: string | undefined, latest: string | undefined) {
  const fromLatest = mapLatest(latest);
  const fromCard = speech === 'said' || speech === 'repeated';
  const everSaid = fromCard || fromLatest === 'said';
  let speak: SpeakMark = 'silent';
  if (fromLatest) speak = fromLatest;
  else if (fromCard) speak = 'said';
  return { speak, everSaid };
}

function sumStats(items: ApiModule[]) {
  return items.reduce(
    (sum, item) => ({
      due: sum.due + (item.stats?.due || 0),
      learning: sum.learning + (item.stats?.learning || 0),
      fresh: sum.fresh + (item.stats?.new || 0),
      mastered: sum.mastered + (item.stats?.mastered || 0),
      total: sum.total + (item.stats?.word_count || (item.stats?.due || 0) + (item.stats?.learning || 0) + (item.stats?.new || 0) + (item.stats?.mastered || 0)),
    }),
    { due: 0, learning: 0, fresh: 0, mastered: 0, total: 0 },
  );
}

function toModule(mod: ApiModule): ProgressModuleCard {
  const last = mod.recent_sessions?.[0];
  const cont = continueMeta(mod);
  const base = practiceHref(mod);
  const wordCount = mod.stats?.word_count
    || ((mod.stats?.due || 0) + (mod.stats?.learning || 0) + (mod.stats?.new || 0) + (mod.stats?.mastered || 0));
  return {
    id: mod.id,
    title: mod.bound_label || mod.title || 'Список',
    kind: kindLabel(mod.bound_kind),
    wordCount,
    stats: {
      new: mod.stats?.new || 0,
      learning: mod.stats?.learning || 0,
      due: mod.stats?.due || 0,
      mastered: mod.stats?.mastered || 0,
    },
    saidInLast: last?.used_count || 0,
    lastMeta: last
      ? `${kindLabel(mod.bound_kind)} · ${sessionStatus(last.status)} · ${formatWhen(last.created_at)}`
      : 'Уроков со словами ещё не было',
    weak: (mod.weak_words || []).map((word) => word.headword || '').filter(Boolean).slice(0, 5),
    coveragePct: mod.coverage_pct || 0,
    sessions7: mod.sessions_7d || 0,
    sessions30: mod.sessions_30d || 0,
    hintFree: mod.hint_free_assessed || 0,
    practiceHref: base,
    continueHref: cont.href,
    continueLabel: cont.label,
    repickHref: mod.id ? `${base}${base.includes('?') ? '&' : '?'}repick=1` : null,
  };
}

export function useProgressWords(): ProgressWordsModel {
  const { learningLanguage } = useLearningLanguage();
  const [model, setModel] = useState<ProgressWordsModel>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    setModel(EMPTY);
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || '';
      if (!token) {
        if (!cancelled) setModel({ ...EMPTY, state: 'error' });
        return;
      }
      const headers = buildAgentAuthHeaders(token, learningLanguage);
      try {
        const modulesResp = await fetch(`${getApiUrl()}/api/vocabulary/lists/course-modules`, { headers });
        const modulesJson = await modulesResp.json().catch(() => ({}));
        if (!modulesResp.ok || !Array.isArray(modulesJson?.items)) throw new Error('modules');
        const modules = modulesJson.items as ApiModule[];
        const totals = sumStats(modules);
        if (!cancelled) {
          setModel({
            state: 'ready',
            wordsReady: false,
            ...totals,
            said: 0,
            words: [],
            modules: modules.map(toModule),
          });
        }
        const [lists, recentResp] = await Promise.all([
          Promise.all(modules.map(async (mod) => {
            const resp = await fetch(`${getApiUrl()}/api/vocabulary/lists/${mod.id}`, { headers });
            const json = await resp.json().catch(() => ({}));
            if (!resp.ok || !Array.isArray(json?.words)) return { mod, words: [] as ApiWord[] };
            return { mod, words: json.words as ApiWord[] };
          })),
          fetch(`${getApiUrl()}/api/vocabulary/srs/dialogue/recent?limit=12`, { headers }),
        ]);
        const recentJson = await recentResp.json().catch(() => ({}));
        const recent = Array.isArray(recentJson?.items) ? recentJson.items as RecentItem[] : [];
        const latestBySense = new Map<string, string>();
        [...recent]
          .sort((a, b) => Date.parse(b.created_at || '') - Date.parse(a.created_at || ''))
          .forEach((item) => {
            for (const target of item.targets || []) {
              if (!target.sense_id || !target.status || latestBySense.has(target.sense_id)) continue;
              latestBySense.set(target.sense_id, target.status);
            }
          });
        const words: ProgressWordRow[] = [];
        const saidHeads = new Set<string>();
        for (const entry of lists) {
          const listTitle = entry.mod.title || entry.mod.bound_label || 'Список';
          for (const word of entry.words) {
            const headword = typeof word.headword === 'string' ? word.headword.trim() : '';
            if (!headword) continue;
            const senses = Array.isArray(word.sense_ids) ? word.sense_ids : [];
            const latest = senses.map((id) => latestBySense.get(id)).find(Boolean);
            const spoken = resolveSpeak(word.speech, latest);
            if (spoken.everSaid) saidHeads.add(headword.toLowerCase());
            words.push({
              key: `${entry.mod.id}:${word.vocabulary_id || headword}`,
              headword,
              listTitle,
              recognition: asBucket(word.status),
              speak: spoken.speak,
              everSaid: spoken.everSaid,
              gloss: typeof word.gloss_ru === 'string' ? word.gloss_ru : '',
            });
          }
        }
        if (!cancelled) {
          setModel({
            state: 'ready',
            wordsReady: true,
            ...totals,
            said: saidHeads.size,
            words,
            modules: modules.map(toModule),
          });
        }
      } catch {
        if (!cancelled) setModel({ ...EMPTY, state: 'error' });
      }
    })();
    return () => { cancelled = true; };
  }, [learningLanguage]);

  return model;
}
