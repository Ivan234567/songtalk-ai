'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { CriteriaScores, AssessmentFeedback } from '@/lib/speaking-assessment';

export type CompletionRow = {
  id: string;
  scenario_id: string;
  scenario_title: string | null;
  scenario_level: string | null;
  completed_at: string;
  feedback: string | null;
  useful_phrase_en: string | null;
  useful_phrase_ru: string | null;
  completed_step_ids?: string[] | null;
};

export type AssessmentRow = {
  id: string;
  scenario_id: string | null;
  overall_score: number | null;
  criteria_scores: CriteriaScores | null;
  feedback: AssessmentFeedback | null;
  user_messages: string[] | null;
  agent_session_id: string | null;
  created_at: string;
};

export type DebateCompletionRow = {
  id: string;
  topic: string;
  topic_ru: string | null;
  user_position: 'for' | 'against';
  ai_position: 'for' | 'against';
  difficulty: 'easy' | 'medium' | 'hard' | null;
  completed_step_ids: string[] | null;
  step_schema_version?: string | null;
  micro_goals?: Array<{ goal_id: string; goal_label: string }> | null;
  feedback_json?: unknown;
  feedback: string | null;
  useful_phrase_en: string | null;
  useful_phrase_ru: string | null;
  assessment_id: string | null;
  debate_session_id: string | null;
  completed_at: string;
};

export type UserVocabularyMiniRow = {
  mastery_level: number | null;
  times_practiced: number | null;
  next_review_at: string | null;
};

export type VocabularyProgressMiniRow = {
  last_review_score: number | null;
};

export type ProgressData = {
  completions: CompletionRow[];
  assessments: AssessmentRow[];
  debateCompletions: DebateCompletionRow[];
  debateAssessments: AssessmentRow[];
  dueWordsNow: number;
  vocabularyRows: UserVocabularyMiniRow[];
  vocabularyProgressRows: VocabularyProgressMiniRow[];
};

export function useProgressData() {
  const [userId, setUserId] = useState<string | null>(null);
  const [data, setData] = useState<ProgressData>({
    completions: [],
    assessments: [],
    debateCompletions: [],
    debateAssessments: [],
    dueWordsNow: 0,
    vocabularyRows: [],
    vocabularyProgressRows: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (uid: string) => {
    const nowIso = new Date().toISOString();
    const [
      completionsRes,
      assessmentsRes,
      debateSessionsRes,
      debateAssessmentsRes,
      dueWordsRes,
      vocabularyRes,
      vocabularyProgressRes,
    ] = await Promise.all([
      supabase
        .from('roleplay_completions')
        .select('id, scenario_id, scenario_title, scenario_level, completed_at, feedback, useful_phrase_en, useful_phrase_ru, completed_step_ids')
        .eq('user_id', uid)
        .order('completed_at', { ascending: false })
        .limit(500),
      supabase
        .from('speaking_assessments')
        .select('id, scenario_id, overall_score, criteria_scores, feedback, user_messages, agent_session_id, created_at')
        .eq('user_id', uid)
        .not('scenario_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('debate_completions')
        .select('id, topic, topic_ru, user_position, ai_position, difficulty, completed_step_ids, step_schema_version, micro_goals, feedback_json, feedback, useful_phrase_en, useful_phrase_ru, assessment_id, debate_session_id, completed_at')
        .eq('user_id', uid)
        .order('completed_at', { ascending: false })
        .limit(500),
      supabase
        .from('speaking_assessments')
        .select('id, scenario_id, overall_score, criteria_scores, feedback, user_messages, agent_session_id, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('user_vocabulary')
        .select('id', { head: true, count: 'exact' })
        .eq('user_id', uid)
        .not('next_review_at', 'is', null)
        .lte('next_review_at', nowIso),
      supabase
        .from('user_vocabulary')
        .select('mastery_level, times_practiced, next_review_at')
        .eq('user_id', uid)
        .limit(5000),
      supabase
        .from('vocabulary_progress')
        .select('last_review_score')
        .eq('user_id', uid)
        .not('last_review_score', 'is', null)
        .limit(5000),
    ]);

    if (completionsRes.error) {
      setError(completionsRes.error.message);
      setData((prev) => ({ ...prev, completions: [] }));
    } else {
      const rows = (completionsRes.data ?? []).map((row: Record<string, unknown>) => ({
        ...row,
        completed_step_ids: Array.isArray(row.completed_step_ids) ? row.completed_step_ids : null,
      }));
      setData((prev) => ({ ...prev, completions: rows as CompletionRow[] }));
    }

    if (assessmentsRes.error) {
      setData((prev) => ({ ...prev, assessments: [] }));
    } else {
      setData((prev) => ({ ...prev, assessments: (assessmentsRes.data ?? []) as AssessmentRow[] }));
    }

    let debateRows: DebateCompletionRow[] = [];
    if (debateSessionsRes.error) {
      const fallbackRes = await supabase
        .from('debate_sessions')
        .select('id, topic, user_position, ai_position, difficulty, completed_step_ids, feedback, assessment_id, created_at')
        .eq('user_id', uid)
        .not('feedback', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500);
      if (fallbackRes.error) {
        setData((prev) => ({ ...prev, debateCompletions: [] }));
      } else {
        debateRows = (fallbackRes.data ?? []).map((row: Record<string, unknown>) => ({
          id: row.id,
          topic: row.topic,
          topic_ru: null,
          user_position: row.user_position,
          ai_position: row.ai_position,
          difficulty: row.difficulty ?? null,
          completed_step_ids: Array.isArray(row.completed_step_ids) ? row.completed_step_ids : null,
          feedback: typeof (row.feedback as Record<string, unknown>)?.feedback === 'string' ? (row.feedback as Record<string, unknown>).feedback : null,
          useful_phrase_en: typeof (row.feedback as Record<string, unknown>)?.useful_phrase === 'string' ? (row.feedback as Record<string, unknown>).useful_phrase : null,
          useful_phrase_ru: typeof (row.feedback as Record<string, unknown>)?.useful_phrase_ru === 'string' ? (row.feedback as Record<string, unknown>).useful_phrase_ru : null,
          assessment_id: row.assessment_id ?? null,
          debate_session_id: row.id,
          completed_at: row.created_at,
        })) as DebateCompletionRow[];
        setData((prev) => ({ ...prev, debateCompletions: debateRows }));
      }
    } else {
      debateRows = (debateSessionsRes.data ?? []).map((row: Record<string, unknown>) => ({
        ...row,
        completed_step_ids: Array.isArray(row.completed_step_ids) ? row.completed_step_ids : null,
      })) as DebateCompletionRow[];
      setData((prev) => ({ ...prev, debateCompletions: debateRows }));
    }

    if (debateAssessmentsRes.error) {
      setData((prev) => ({ ...prev, debateAssessments: [] }));
    } else {
      const debateAssessmentIds = new Set(
        debateRows.filter((d) => d.assessment_id).map((d) => d.assessment_id as string)
      );
      const filtered = (debateAssessmentsRes.data ?? []).filter((a: { id: string }) =>
        debateAssessmentIds.has(a.id)
      );
      setData((prev) => ({ ...prev, debateAssessments: filtered as AssessmentRow[] }));
    }

    if (dueWordsRes.error) {
      setData((prev) => ({ ...prev, dueWordsNow: 0 }));
    } else {
      setData((prev) => ({ ...prev, dueWordsNow: dueWordsRes.count ?? 0 }));
    }

    if (vocabularyRes.error) {
      setData((prev) => ({ ...prev, vocabularyRows: [] }));
    } else {
      setData((prev) => ({ ...prev, vocabularyRows: (vocabularyRes.data ?? []) as UserVocabularyMiniRow[] }));
    }

    if (vocabularyProgressRes.error) {
      setData((prev) => ({ ...prev, vocabularyProgressRows: [] }));
    } else {
      setData((prev) => ({ ...prev, vocabularyProgressRows: (vocabularyProgressRes.data ?? []) as VocabularyProgressMiniRow[] }));
    }
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
        const message = typeof (e as Error)?.message === 'string' ? (e as Error).message : '';
        if ((e as Error)?.name === 'AbortError' || /aborted/i.test(message)) {
          return;
        }
        setError(message || 'Не удалось загрузить прогресс');
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

  return { userId, data, loading, error, loadData, retry };
}
