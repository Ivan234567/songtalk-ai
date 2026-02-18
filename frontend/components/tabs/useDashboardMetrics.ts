'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type DashboardMetrics = {
  conversationMinutes: number;
  todayMinutes: number;
  weekMinutes: number;
  dictionaryCount: number;
  wordsCount: number;
  idiomsCount: number;
  phrasalVerbsCount: number;
  karaokeCount: number;
  streakDays: number;
};

export function useDashboardMetrics() {
  const [userId, setUserId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    conversationMinutes: 0,
    todayMinutes: 0,
    weekMinutes: 0,
    dictionaryCount: 0,
    wordsCount: 0,
    idiomsCount: 0,
    phrasalVerbsCount: 0,
    karaokeCount: 0,
    streakDays: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(async (uid: string) => {
    const [
      agentSessionsRes,
      vocabularyRes,
      idiomsRes,
      phrasalVerbsRes,
      videosRes,
      roleplayRes,
      debateRes,
    ] = await Promise.all([
      supabase
        .from('agent_sessions')
        .select('messages, created_at')
        .eq('user_id', uid),
      supabase
        .from('user_vocabulary')
        .select('id', { head: true, count: 'exact' })
        .eq('user_id', uid),
      supabase
        .from('user_idioms')
        .select('id', { head: true, count: 'exact' })
        .eq('user_id', uid),
      supabase
        .from('user_phrasal_verbs')
        .select('id', { head: true, count: 'exact' })
        .eq('user_id', uid),
      supabase
        .from('user_videos')
        .select('id', { head: true, count: 'exact' })
        .eq('user_id', uid),
      supabase
        .from('roleplay_completions')
        .select('completed_at')
        .eq('user_id', uid)
        .order('completed_at', { ascending: false })
        .limit(500),
      supabase
        .from('debate_completions')
        .select('completed_at')
        .eq('user_id', uid)
        .order('completed_at', { ascending: false })
        .limit(500),
    ]);

    const minutesByDate = new Map<string, number>();
    let conversationMinutes = 0;
    if (!agentSessionsRes.error && agentSessionsRes.data) {
      for (const row of agentSessionsRes.data) {
        const messages = Array.isArray(row.messages) ? row.messages : [];
        const userCount = messages.filter((m: { role?: string }) => m?.role === 'user').length;
        const mins = Math.round((userCount * 45) / 60);
        conversationMinutes += mins;
        const createdAt = (row as { created_at?: string }).created_at;
        if (createdAt && mins > 0) {
          const dateKey = new Date(createdAt).toISOString().slice(0, 10);
          minutesByDate.set(dateKey, (minutesByDate.get(dateKey) ?? 0) + mins);
        }
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const todayMinutes = minutesByDate.get(today) ?? 0;
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);
    let weekMinutes = 0;
    for (const [dateKey, mins] of minutesByDate) {
      const d = new Date(dateKey + 'T12:00:00');
      if (d >= weekStart) weekMinutes += mins;
    }

    const vocabularyCount = !vocabularyRes.error ? (vocabularyRes.count ?? 0) : 0;
    const idiomsCount = !idiomsRes.error ? (idiomsRes.count ?? 0) : 0;
    const phrasalVerbsCount = !phrasalVerbsRes.error ? (phrasalVerbsRes.count ?? 0) : 0;
    const dictionaryCount = vocabularyCount + idiomsCount + phrasalVerbsCount;
    const karaokeCount = !videosRes.error ? (videosRes.count ?? 0) : 0;

    const allDates = new Set<string>();
    for (const r of roleplayRes.data ?? []) {
      const d = new Date((r as { completed_at: string }).completed_at).toISOString().slice(0, 10);
      allDates.add(d);
    }
    for (const r of debateRes.data ?? []) {
      const d = new Date((r as { completed_at: string }).completed_at).toISOString().slice(0, 10);
      allDates.add(d);
    }
    if (!agentSessionsRes.error && agentSessionsRes.data) {
      for (const r of agentSessionsRes.data) {
        const createdAt = (r as { created_at?: string }).created_at;
        if (createdAt) {
          allDates.add(new Date(createdAt).toISOString().slice(0, 10));
        }
      }
    }

    let streakDays = 0;
    if (allDates.has(today)) {
      const d = new Date();
      for (let i = 0; i < 365; i++) {
        const key = d.toISOString().slice(0, 10);
        if (!allDates.has(key)) break;
        streakDays++;
        d.setDate(d.getDate() - 1);
      }
    }

    setMetrics({
      conversationMinutes,
      todayMinutes,
      weekMinutes,
      dictionaryCount,
      wordsCount: vocabularyCount,
      idiomsCount,
      phrasalVerbsCount,
      karaokeCount,
      streakDays,
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (!isMounted) return;
        if (userError || !userData.user?.id) {
          setUserId(null);
          setLoading(false);
          return;
        }
        const uid = userData.user.id;
        setUserId(uid);
        await loadMetrics(uid);
      } catch (e: unknown) {
        if (!isMounted) return;
        const message = typeof (e as Error)?.message === 'string' ? (e as Error).message : '';
        setError(message || 'Не удалось загрузить метрики');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [loadMetrics]);

  const retry = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      await loadMetrics(userId);
    } catch (e: unknown) {
      setError((e as Error)?.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [userId, loadMetrics]);

  return { metrics, loading, error, retry };
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} мин`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}
