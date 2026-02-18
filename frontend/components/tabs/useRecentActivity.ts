'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type ActivityItem = {
  dateKey: string;
  dateLabel: string;
  items: ActivityEntry[];
};

export type ActivityEntry = {
  type: 'agent' | 'roleplay' | 'debate' | 'karaoke' | 'dictionary';
  label: string;
  tab: 'agent' | 'dictionary' | 'karaoke' | 'progress';
};

function getDateLabel(dateKey: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const dayBefore = new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10);
  if (dateKey === today) return 'Сегодня';
  if (dateKey === yesterday) return 'Вчера';
  if (dateKey === dayBefore) return 'Позавчера';
  const d = new Date(dateKey + 'T12:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function useRecentActivity() {
  const [userId, setUserId] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadActivities = useCallback(async (uid: string) => {
    const since = new Date();
    since.setDate(since.getDate() - 14);
    const sinceIso = since.toISOString();

    const [
      agentRes,
      roleplayRes,
      debateRes,
      videosRes,
      vocabRes,
      idiomsRes,
      phrasalRes,
    ] = await Promise.all([
      supabase
        .from('agent_sessions')
        .select('messages, created_at')
        .eq('user_id', uid)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('roleplay_completions')
        .select('completed_at, scenario_title')
        .eq('user_id', uid)
        .gte('completed_at', sinceIso)
        .order('completed_at', { ascending: false })
        .limit(50),
      supabase
        .from('debate_completions')
        .select('completed_at, topic, topic_ru')
        .eq('user_id', uid)
        .gte('completed_at', sinceIso)
        .order('completed_at', { ascending: false })
        .limit(50),
      supabase
        .from('user_videos')
        .select('created_at, title')
        .eq('user_id', uid)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('user_vocabulary')
        .select('created_at')
        .eq('user_id', uid)
        .gte('created_at', sinceIso)
        .limit(200),
      supabase
        .from('user_idioms')
        .select('created_at')
        .eq('user_id', uid)
        .gte('created_at', sinceIso)
        .limit(200),
      supabase
        .from('user_phrasal_verbs')
        .select('created_at')
        .eq('user_id', uid)
        .gte('created_at', sinceIso)
        .limit(200),
    ]);

    const byDate = new Map<string, ActivityEntry[]>();

    const add = (dateKey: string, entry: ActivityEntry) => {
      if (!byDate.has(dateKey)) byDate.set(dateKey, []);
      byDate.get(dateKey)!.push(entry);
    };

    const agentMinutesByDate = new Map<string, number>();
    for (const row of agentRes.data ?? []) {
      const createdAt = (row as { created_at?: string }).created_at;
      if (!createdAt) continue;
      const dateKey = new Date(createdAt).toISOString().slice(0, 10);
      const messages = Array.isArray((row as { messages?: unknown[] }).messages)
        ? (row as { messages: { role?: string }[] }).messages
        : [];
      const userCount = messages.filter((m) => m?.role === 'user').length;
      const minutes = Math.round((userCount * 45) / 60);
      if (minutes > 0) {
        agentMinutesByDate.set(dateKey, (agentMinutesByDate.get(dateKey) ?? 0) + minutes);
      }
    }
    for (const [dateKey, totalMinutes] of agentMinutesByDate) {
      add(dateKey, {
        type: 'agent',
        label: `${totalMinutes} мин с собеседником`,
        tab: 'agent',
      });
    }

    for (const row of roleplayRes.data ?? []) {
      const completedAt = (row as { completed_at: string }).completed_at;
      const title = (row as { scenario_title?: string }).scenario_title;
      const dateKey = new Date(completedAt).toISOString().slice(0, 10);
      add(dateKey, {
        type: 'roleplay',
        label: title ? `Сценарий: ${title}` : 'Ролевой диалог',
        tab: 'progress',
      });
    }

    for (const row of debateRes.data ?? []) {
      const completedAt = (row as { completed_at: string }).completed_at;
      const topicRu = (row as { topic_ru?: string }).topic_ru;
      const topic = (row as { topic: string }).topic;
      const dateKey = new Date(completedAt).toISOString().slice(0, 10);
      add(dateKey, {
        type: 'debate',
        label: topicRu ? `Дебаты: ${topicRu}` : `Дебаты: ${topic}`,
        tab: 'progress',
      });
    }

    for (const row of videosRes.data ?? []) {
      const createdAt = (row as { created_at: string }).created_at;
      const title = (row as { title?: string }).title;
      const dateKey = new Date(createdAt).toISOString().slice(0, 10);
      add(dateKey, {
        type: 'karaoke',
        label: title ? `Караоке: ${title}` : 'Песня добавлена',
        tab: 'karaoke',
      });
    }

    const vocabByDate = new Map<string, number>();
    for (const row of vocabRes.data ?? []) {
      const createdAt = (row as { created_at?: string }).created_at;
      if (!createdAt) continue;
      const dateKey = new Date(createdAt).toISOString().slice(0, 10);
      vocabByDate.set(dateKey, (vocabByDate.get(dateKey) ?? 0) + 1);
    }
    for (const row of idiomsRes.data ?? []) {
      const createdAt = (row as { created_at?: string }).created_at;
      if (!createdAt) continue;
      const dateKey = new Date(createdAt).toISOString().slice(0, 10);
      vocabByDate.set(dateKey, (vocabByDate.get(dateKey) ?? 0) + 1);
    }
    for (const row of phrasalRes.data ?? []) {
      const createdAt = (row as { created_at?: string }).created_at;
      if (!createdAt) continue;
      const dateKey = new Date(createdAt).toISOString().slice(0, 10);
      vocabByDate.set(dateKey, (vocabByDate.get(dateKey) ?? 0) + 1);
    }
    for (const [dateKey, count] of vocabByDate) {
      if (count > 0) {
        const n = count;
        const wordForm = n === 1 ? 'новое' : 'новых';
        add(dateKey, {
          type: 'dictionary',
          label: `${n} ${wordForm} в словарь`,
          tab: 'dictionary',
        });
      }
    }

    const sortedDates = Array.from(byDate.keys()).sort().reverse();
    const list: ActivityItem[] = sortedDates.slice(0, 7).map((dateKey) => ({
      dateKey,
      dateLabel: getDateLabel(dateKey),
      items: byDate.get(dateKey) ?? [],
    }));

    setActivities(list);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (!isMounted) return;
        if (userError) {
          setError(userError.message);
          setUserId(null);
          setLoading(false);
          return;
        }
        const uid = userData.user?.id ?? null;
        setUserId(uid);
        if (!uid) {
          setLoading(false);
          return;
        }
        await loadActivities(uid);
      } catch (e: unknown) {
        if (!isMounted) return;
        setError((e as Error)?.message || 'Не удалось загрузить активность');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [loadActivities]);

  const retry = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      await loadActivities(userId);
    } catch (e: unknown) {
      setError((e as Error)?.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [userId, loadActivities]);

  return { activities, loading, error, retry };
}
