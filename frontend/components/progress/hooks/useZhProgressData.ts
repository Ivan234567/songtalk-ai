'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { ZhAssessmentFeedback, ZhCriteriaScores } from '@/lib/zh-speaking-assessment';
import {
  zhChecklistCoveragePct,
  zhVoiceTaskTypeLabel,
  type ZhChecklistItemStatus,
  type ZhVoiceTaskType,
  type ZhVoiceTaskVerdict,
} from '@/lib/zh-voice-tasks';

export type ZhCompletionRow = {
  id: string;
  scenario_id: string;
  scenario_title: string | null;
  scenario_level: string | null;
  completed_at: string;
  feedback: string | null;
  useful_phrase_en: string | null;
  useful_phrase_ru: string | null;
  completed_step_ids?: string[] | null;
  source: 'user' | 'system';
};

export type ZhAssessmentRow = {
  id: string;
  scenario_id: string | null;
  overall_score: number | null;
  criteria_scores: ZhCriteriaScores | null;
  feedback: ZhAssessmentFeedback | null;
  user_messages: string[] | null;
  agent_session_id: string | null;
  created_at: string;
};

export type ZhVoiceAttemptRow = {
  id: string;
  task_id: string | null;
  title: string;
  type: ZhVoiceTaskType | null;
  hsk_level: number | null;
  source: 'user' | 'system';
  created_at: string;
  verdict: ZhVoiceTaskVerdict | null;
  coveragePct: number | null;
  checklist: Array<{ id: string; status: ZhChecklistItemStatus; note_ru?: string; label_ru?: string }>;
  transcript: string | null;
  feedback: string | null;
  duration_sec: number | null;
};

export type ZhProgressData = {
  completions: ZhCompletionRow[];
  assessments: ZhAssessmentRow[];
  voiceAttempts: ZhVoiceAttemptRow[];
};

function parseChecklistResult(raw: unknown): {
  verdict: ZhVoiceTaskVerdict | null;
  checklist: ZhVoiceAttemptRow['checklist'];
  coveragePct: number | null;
} {
  if (!raw || typeof raw !== 'object') {
    return { verdict: null, checklist: [], coveragePct: null };
  }
  const rec = raw as Record<string, unknown>;
  const verdict =
    rec.verdict === 'done' || rec.verdict === 'almost' || rec.verdict === 'missed' ? rec.verdict : null;
  const checklist = Array.isArray(rec.checklist)
    ? rec.checklist
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item) => ({
          id: typeof item.id === 'string' ? item.id : '',
          status: (item.status === 'done' || item.status === 'almost' || item.status === 'missed'
            ? item.status
            : 'missed') as ZhChecklistItemStatus,
          note_ru: typeof item.note_ru === 'string' ? item.note_ru : undefined,
          label_ru: typeof item.label_ru === 'string' ? item.label_ru : undefined,
        }))
        .filter((item) => item.id)
    : [];
  return {
    verdict,
    checklist,
    coveragePct: zhChecklistCoveragePct(checklist),
  };
}

export function useZhProgressData() {
  const [userId, setUserId] = useState<string | null>(null);
  const [data, setData] = useState<ZhProgressData>({
    completions: [],
    assessments: [],
    voiceAttempts: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (uid: string) => {
    const [completionsRes, assessmentsRes, attemptsRes, tasksRes] = await Promise.all([
      supabase
        .from('roleplay_completions')
        .select(
          'id, scenario_id, scenario_title, scenario_level, completed_at, feedback, useful_phrase_en, useful_phrase_ru, completed_step_ids'
        )
        .eq('user_id', uid)
        .eq('language', 'zh')
        .order('completed_at', { ascending: false })
        .limit(500),
      supabase
        .from('speaking_assessments')
        .select(
          'id, scenario_id, overall_score, criteria_scores, feedback, user_messages, agent_session_id, created_at'
        )
        .eq('user_id', uid)
        .eq('language', 'zh')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('zh_voice_task_attempts')
        .select('id, task_id, hsk_level, transcript, duration_sec, checklist_result, feedback, status, created_at')
        .eq('user_id', uid)
        .eq('status', 'checked')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase.from('zh_voice_tasks').select('id, source, title, type'),
    ]);

    if (completionsRes.error) {
      setError(completionsRes.error.message);
    } else {
      setError(null);
    }

    const completionScenarioIds = [
      ...new Set(
        (completionsRes.data ?? [])
          .map((row: Record<string, unknown>) => String(row.scenario_id ?? ''))
          .filter(Boolean),
      ),
    ];
    const scenariosRes =
      completionScenarioIds.length > 0
        ? await supabase.from('zh_scenarios').select('id, source, title').in('id', completionScenarioIds)
        : { data: [], error: null };

    const scenarioMeta = new Map<string, { source: 'user' | 'system'; title: string | null }>();
    for (const row of scenariosRes.data ?? []) {
      const source = row.source === 'system' ? 'system' : 'user';
      scenarioMeta.set(row.id, { source, title: typeof row.title === 'string' ? row.title : null });
    }

    const completions: ZhCompletionRow[] = (completionsRes.data ?? []).map((row: Record<string, unknown>) => {
      const scenarioId = String(row.scenario_id ?? '');
      const meta = scenarioMeta.get(scenarioId);
      return {
        id: String(row.id),
        scenario_id: scenarioId,
        scenario_title: (row.scenario_title as string | null) ?? meta?.title ?? null,
        scenario_level: (row.scenario_level as string | null) ?? null,
        completed_at: String(row.completed_at),
        feedback: (row.feedback as string | null) ?? null,
        useful_phrase_en: (row.useful_phrase_en as string | null) ?? null,
        useful_phrase_ru: (row.useful_phrase_ru as string | null) ?? null,
        completed_step_ids: Array.isArray(row.completed_step_ids) ? (row.completed_step_ids as string[]) : null,
        source: meta?.source ?? 'user',
      };
    });

    const taskMeta = new Map<string, { source: 'user' | 'system'; title: string; type: ZhVoiceTaskType | null }>();
    for (const row of tasksRes.data ?? []) {
      taskMeta.set(row.id, {
        source: row.source === 'system' ? 'system' : 'user',
        title: typeof row.title === 'string' && row.title.trim() ? row.title : 'Голосовая минутка',
        type: row.type as ZhVoiceTaskType | null,
      });
    }

    const voiceAttempts: ZhVoiceAttemptRow[] = (attemptsRes.data ?? []).map((row: Record<string, unknown>) => {
      const taskId = typeof row.task_id === 'string' ? row.task_id : null;
      const meta = taskId ? taskMeta.get(taskId) : undefined;
      const parsed = parseChecklistResult(row.checklist_result);
      return {
        id: String(row.id),
        task_id: taskId,
        title: meta?.title || zhVoiceTaskTypeLabel(meta?.type) || 'Голосовая минутка',
        type: meta?.type ?? null,
        hsk_level: typeof row.hsk_level === 'number' ? row.hsk_level : null,
        source: meta?.source ?? 'user',
        created_at: String(row.created_at),
        verdict: parsed.verdict,
        coveragePct: parsed.coveragePct,
        checklist: parsed.checklist,
        transcript: typeof row.transcript === 'string' ? row.transcript : null,
        feedback: typeof row.feedback === 'string' ? row.feedback : null,
        duration_sec: typeof row.duration_sec === 'number' ? row.duration_sec : null,
      };
    });

    setData({
      completions,
      assessments: (assessmentsRes.data ?? []) as ZhAssessmentRow[],
      voiceAttempts,
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
        await loadData(uid);
      } catch (e: unknown) {
        if (!isMounted) return;
        setError((e as Error)?.message || 'Не удалось загрузить прогресс');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [loadData]);

  const retry = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      await loadData(userId);
    } catch (e: unknown) {
      setError((e as Error)?.message || 'Повторная загрузка не удалась');
    } finally {
      setLoading(false);
    }
  }, [userId, loadData]);

  return { userId, data, loading, error, retry };
}
