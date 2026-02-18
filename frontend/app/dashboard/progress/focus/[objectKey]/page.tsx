'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getRoleplayScenarioById } from '@/lib/roleplay';
import { getDebateStepsByDifficulty, normalizeDebateTopic } from '@/lib/debate';
import { getCriteriaLabel, type AssessmentFeedback, type CriteriaScores } from '@/lib/speaking-assessment';
import { FocusHero } from '@/components/progress/focus/FocusHero';
import { FocusCriteria } from '@/components/progress/focus/FocusCriteria';
import { FocusAttemptSelector } from '@/components/progress/focus/FocusAttemptSelector';
import { FocusProgressChecklist } from '@/components/progress/focus/FocusProgressChecklist';
import { FocusFeedbackPanel } from '@/components/progress/focus/FocusFeedbackPanel';
import { FocusTranscript } from '@/components/progress/focus/FocusTranscript';
import styles from '@/components/progress/focus/focus.module.css';

type PeriodValue = '7d' | '30d' | '90d' | 'all';
type ModeValue = 'roleplay' | 'debate';
type ViewValue = 'system' | 'personal';
type CriterionKey = keyof CriteriaScores;

type AssessmentRow = {
  id: string;
  scenario_id: string | null;
  overall_score: number | null;
  criteria_scores: CriteriaScores | null;
  feedback: AssessmentFeedback | null;
  user_messages: string[] | null;
  agent_session_id: string | null;
  created_at: string;
};

type FocusAttempt = {
  attemptId: string;
  completedAt: string;
  overallScore: number | null;
  criteriaScores: CriteriaScores | null;
  steps: Array<{ id: string; title: string; completed: boolean }>;
  stepCompletionPct: number | null;
  goals: Array<{ goal_id: string; goal_label?: string; achieved: boolean }>;
  strengths: string[];
  improvements: string[];
  coachComment: string | null;
  debateSessionId: string | null;
  agentSessionId: string | null;
  fallbackUserMessages: string[];
};

type FocusModel = {
  mode: ModeValue;
  title: string;
  subtitle: string | null;
  attempts: FocusAttempt[];
  avgScore: number | null;
  bestScore: number | null;
  avgStepPct: number | null;
};

function isPeriodValue(value: string | null): value is PeriodValue {
  return value === '7d' || value === '30d' || value === '90d' || value === 'all';
}
function isModeValue(value: string | null): value is ModeValue {
  return value === 'roleplay' || value === 'debate';
}
function isViewValue(value: string | null): value is ViewValue {
  return value === 'system' || value === 'personal';
}
function getPeriodStart(period: PeriodValue): Date | null {
  if (period === 'all') return null;
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const start = new Date();
  start.setDate(start.getDate() - days);
  return start;
}
function parseMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function topicKey(value: string): string {
  return normalizeDebateTopic(value).toLowerCase();
}
function nearestAssessment(completedAt: string, candidates: AssessmentRow[]): AssessmentRow | null {
  const target = parseMs(completedAt);
  if (target == null) return null;
  let best: AssessmentRow | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const row of candidates) {
    const ms = parseMs(row.created_at);
    if (ms == null) continue;
    const diff = Math.abs(ms - target);
    if (diff <= 48 * 60 * 60 * 1000 && diff < bestDiff) {
      bestDiff = diff;
      best = row;
    }
  }
  return best;
}
function getObjectKey(raw: string | string[] | undefined): string {
  return Array.isArray(raw) ? raw[0] ?? '' : raw ?? '';
}

function toFeedbackList(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function toOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function buildFallbackCoachingInsights(criteria: CriteriaScores | null): { strengths: string[]; improvements: string[] } {
  if (!criteria) {
    return {
      strengths: ['Недостаточно данных для оценки сильных сторон.'],
      improvements: ['Пройдите больше сессий, чтобы получить персональные рекомендации.'],
    };
  }

  const entries: Array<{ key: CriterionKey; score: number }> = [
    { key: 'fluency', score: criteria.fluency },
    { key: 'vocabulary_grammar', score: criteria.vocabulary_grammar },
    { key: 'pronunciation', score: criteria.pronunciation },
    { key: 'completeness', score: criteria.completeness },
    { key: 'dialogue_skills', score: criteria.dialogue_skills },
  ];

  const best = [...entries].sort((a, b) => b.score - a.score).slice(0, 2);
  const weakest = [...entries].sort((a, b) => a.score - b.score).slice(0, 2);

  return {
    strengths: best.map((item) => `${getCriteriaLabel(item.key)}: ${item.score.toFixed(1)}/10`),
    improvements: weakest.map((item) => `${getCriteriaLabel(item.key)}: ${item.score.toFixed(1)}/10`),
  };
}

export default function ProgressFocusPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawObjectKey = getObjectKey(params?.objectKey as string | string[] | undefined);
  const objectKey = useMemo(() => {
    try {
      return decodeURIComponent(rawObjectKey);
    } catch {
      return rawObjectKey;
    }
  }, [rawObjectKey]);
  const period = isPeriodValue(searchParams.get('period')) ? (searchParams.get('period') as PeriodValue) : '30d';
  const modeFromPath: ModeValue | null = objectKey.startsWith('rp:') ? 'roleplay' : objectKey.startsWith('db:') ? 'debate' : null;
  const modeForBack = isModeValue(searchParams.get('mode')) ? (searchParams.get('mode') as ModeValue) : modeFromPath ?? 'roleplay';
  const viewForBack = isViewValue(searchParams.get('view')) ? (searchParams.get('view') as ViewValue) : 'system';
  const trendForBack = searchParams.get('trend');
  const attemptFromQuery = searchParams.get('attempt');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<FocusModel | null>(null);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);

  const backHref = useMemo(() => {
    const next = new URLSearchParams();
    next.set('tab', 'progress');
    next.set('period', period);
    next.set('mode', modeForBack);
    next.set('view', viewForBack);
    if (trendForBack) next.set('trend', trendForBack);
    return `/dashboard?${next.toString()}`;
  }, [modeForBack, period, trendForBack, viewForBack]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!modeFromPath) {
        setError('Некорректный ключ объекта.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user?.id) throw new Error(userError?.message || 'Не удалось авторизоваться');
        const userId = userData.user.id;
        const periodStart = getPeriodStart(period);

        if (modeFromPath === 'roleplay') {
          const scenarioId = objectKey.slice(3);
          const [cRes, aRes] = await Promise.all([
            supabase
              .from('roleplay_completions')
              .select('id, scenario_id, scenario_title, scenario_level, completed_at, feedback, completed_step_ids')
              .eq('user_id', userId)
              .eq('scenario_id', scenarioId)
              .order('completed_at', { ascending: false })
              .limit(500),
            supabase
              .from('speaking_assessments')
              .select('id, scenario_id, overall_score, criteria_scores, feedback, user_messages, agent_session_id, created_at')
              .eq('user_id', userId)
              .eq('scenario_id', scenarioId)
              .order('created_at', { ascending: false })
              .limit(500),
          ]);
          if (cRes.error) throw new Error(cRes.error.message);
          if (aRes.error) throw new Error(aRes.error.message);
          const scenario = getRoleplayScenarioById(scenarioId);
          const assessments = (aRes.data ?? []) as AssessmentRow[];
          const rows = (cRes.data ?? [])
            .filter((r: any) => (periodStart ? new Date(r.completed_at) >= periodStart : true))
            .map((r: any) => ({ ...r, completed_step_ids: Array.isArray(r.completed_step_ids) ? r.completed_step_ids : [] }));
          const attempts: FocusAttempt[] = rows.map((row: any) => {
            const assessment = nearestAssessment(row.completed_at, assessments);
            const done = row.completed_step_ids as string[];
            const defs = (scenario?.steps ?? []).map((s) => ({ id: s.id, title: s.titleRu || s.titleEn || s.id }));
            const steps = defs.length > 0 ? defs.map((s) => ({ ...s, completed: done.includes(s.id) })) : done.map((id) => ({ id, title: id, completed: true }));
            const goals = Array.isArray(assessment?.feedback?.goal_attainment)
              ? assessment!.feedback!.goal_attainment!.map((g) => ({ goal_id: g.goal_id, goal_label: g.goal_label, achieved: Boolean(g.achieved) }))
              : [];
            const strengths = toFeedbackList(assessment?.feedback?.strengths);
            const improvements = toFeedbackList(assessment?.feedback?.improvements);
            return {
              attemptId: row.id,
              completedAt: row.completed_at,
              overallScore: typeof assessment?.overall_score === 'number' ? assessment.overall_score : null,
              criteriaScores: assessment?.criteria_scores ?? null,
              steps,
              stepCompletionPct: defs.length > 0 ? Math.round((done.length / defs.length) * 100) : null,
              goals,
              strengths,
              improvements,
              coachComment: toOptionalText(assessment?.feedback?.summary) || toOptionalText(row.feedback),
              debateSessionId: null,
              agentSessionId: assessment?.agent_session_id ?? null,
              fallbackUserMessages: Array.isArray(assessment?.user_messages) ? assessment!.user_messages! : [],
            };
          });
          const scores = attempts.map((a) => a.overallScore).filter((v): v is number => typeof v === 'number');
          const stepPcts = attempts.map((a) => a.stepCompletionPct).filter((v): v is number => typeof v === 'number');
          if (!cancelled) {
            setModel({
              mode: 'roleplay',
              title: scenario?.title || rows[0]?.scenario_title || scenarioId,
              subtitle: scenario?.level || rows[0]?.scenario_level || null,
              attempts,
              avgScore: scores.length ? round1(scores.reduce((s, v) => s + v, 0) / scores.length) : null,
              bestScore: scores.length ? Math.max(...scores) : null,
              avgStepPct: stepPcts.length ? Math.round(stepPcts.reduce((s, v) => s + v, 0) / stepPcts.length) : null,
            });
          }
        } else {
          const key = objectKey.slice(3);
          const cRes = await supabase
            .from('debate_completions')
            .select('id, topic, topic_ru, topic_normalized, difficulty, completed_step_ids, feedback, assessment_id, debate_session_id, completed_at')
            .eq('user_id', userId)
            .order('completed_at', { ascending: false })
            .limit(500);
          if (cRes.error) throw new Error(cRes.error.message);
          const rows = (cRes.data ?? [])
            .map((r: any) => ({ ...r, completed_step_ids: Array.isArray(r.completed_step_ids) ? r.completed_step_ids : [] }))
            .filter((r: any) => topicKey((r.topic_normalized || r.topic_ru || r.topic) as string) === key)
            .filter((r: any) => (periodStart ? new Date(r.completed_at) >= periodStart : true));
          const ids = Array.from(new Set(rows.map((r: any) => r.assessment_id).filter((id: any) => Boolean(id))));
          let assessmentById = new Map<string, AssessmentRow>();
          if (ids.length > 0) {
            const aRes = await supabase
              .from('speaking_assessments')
              .select('id, scenario_id, overall_score, criteria_scores, feedback, user_messages, agent_session_id, created_at')
              .eq('user_id', userId)
              .in('id', ids)
              .order('created_at', { ascending: false })
              .limit(500);
            if (!aRes.error) {
              assessmentById = new Map(((aRes.data ?? []) as AssessmentRow[]).map((a) => [a.id, a]));
            }
          }
          const attempts: FocusAttempt[] = rows.map((row: any) => {
            const assessment = row.assessment_id ? assessmentById.get(row.assessment_id) ?? null : null;
            const defs = getDebateStepsByDifficulty(row.difficulty ?? 'medium').map((s) => ({ id: s.id, title: s.titleRu || s.titleEn || s.id }));
            const done = row.completed_step_ids as string[];
            const goals = Array.isArray(assessment?.feedback?.goal_attainment)
              ? assessment!.feedback!.goal_attainment!.map((g) => ({ goal_id: g.goal_id, goal_label: g.goal_label, achieved: Boolean(g.achieved) }))
              : [];
            const strengths = toFeedbackList(assessment?.feedback?.strengths);
            const improvements = toFeedbackList(assessment?.feedback?.improvements);
            return {
              attemptId: row.id,
              completedAt: row.completed_at,
              overallScore: typeof assessment?.overall_score === 'number' ? assessment.overall_score : null,
              criteriaScores: assessment?.criteria_scores ?? null,
              steps: defs.map((s) => ({ ...s, completed: done.includes(s.id) })),
              stepCompletionPct: defs.length > 0 ? Math.round((done.length / defs.length) * 100) : null,
              goals,
              strengths,
              improvements,
              coachComment: toOptionalText(row.feedback) || toOptionalText(assessment?.feedback?.summary),
              debateSessionId: row.debate_session_id ?? null,
              agentSessionId: null,
              fallbackUserMessages: [],
            };
          });
          const scores = attempts.map((a) => a.overallScore).filter((v): v is number => typeof v === 'number');
          const stepPcts = attempts.map((a) => a.stepCompletionPct).filter((v): v is number => typeof v === 'number');
          if (!cancelled) {
            setModel({
              mode: 'debate',
              title: rows[0]?.topic_ru || rows[0]?.topic || key,
              subtitle: rows[0]?.difficulty ? `Сложность: ${rows[0].difficulty}` : 'Дебаты',
              attempts,
              avgScore: scores.length ? round1(scores.reduce((s, v) => s + v, 0) / scores.length) : null,
              bestScore: scores.length ? Math.max(...scores) : null,
              avgStepPct: stepPcts.length ? Math.round(stepPcts.reduce((s, v) => s + v, 0) / stepPcts.length) : null,
            });
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Не удалось загрузить данные');
          setModel(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [modeFromPath, objectKey, period]);

  useEffect(() => {
    if (!model) {
      setSelectedAttemptId(null);
      return;
    }
    if (attemptFromQuery && model.attempts.some((a) => a.attemptId === attemptFromQuery)) {
      setSelectedAttemptId(attemptFromQuery);
      return;
    }
    setSelectedAttemptId(model.attempts[0]?.attemptId ?? null);
  }, [attemptFromQuery, model]);

  useEffect(() => {
    if (!selectedAttemptId) return;
    if (searchParams.get('attempt') === selectedAttemptId) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set('attempt', selectedAttemptId);
    router.replace(`/dashboard/progress/focus/${encodeURIComponent(objectKey)}?${next.toString()}`, { scroll: false });
  }, [objectKey, router, searchParams, selectedAttemptId]);

  const selectedAttempt = useMemo(() => {
    if (!model) return null;
    return model.attempts.find((a) => a.attemptId === selectedAttemptId) ?? model.attempts[0] ?? null;
  }, [model, selectedAttemptId]);

  const selectedAttemptMeta = useMemo(() => {
    if (!model || !selectedAttempt) return null;
    const index = model.attempts.findIndex((attempt) => attempt.attemptId === selectedAttempt.attemptId);
    const number = index >= 0 ? model.attempts.length - index : null;
    return {
      number,
      dateLabel: new Date(selectedAttempt.completedAt).toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
  }, [model, selectedAttempt]);

  const selectedAttemptFeedback = useMemo(() => {
    if (!selectedAttempt) {
      return {
        strengths: [] as string[],
        improvements: [] as string[],
        comment: 'Выберите попытку, чтобы увидеть обратную связь.',
      };
    }

    const fallback = buildFallbackCoachingInsights(selectedAttempt.criteriaScores);
    const strengths = selectedAttempt.strengths.length > 0 ? selectedAttempt.strengths : fallback.strengths;
    const improvements = selectedAttempt.improvements.length > 0 ? selectedAttempt.improvements : fallback.improvements;
    const comment = selectedAttempt.coachComment
      || (selectedAttempt.overallScore != null
        ? `Общий балл: ${selectedAttempt.overallScore.toFixed(1)} из 10. Продолжайте практиковаться и улучшать навыки.`
        : 'Оценка по этой попытке не доступна.');

    return { strengths, improvements, comment };
  }, [selectedAttempt]);

  const criteriaStats = useMemo(() => {
    if (!model) return [] as Array<{ key: CriterionKey; label: string; current: number | null; avg: number | null }>;
    const keys: CriterionKey[] = ['fluency', 'vocabulary_grammar', 'pronunciation', 'completeness', 'dialogue_skills'];
    return keys.map((key) => {
      const vals = model.attempts.map((a) => a.criteriaScores?.[key]).filter((v): v is number => typeof v === 'number');
      return {
        key,
        label: getCriteriaLabel(key),
        current: typeof selectedAttempt?.criteriaScores?.[key] === 'number' ? selectedAttempt.criteriaScores[key] : null,
        avg: vals.length ? round1(vals.reduce((s, v) => s + v, 0) / vals.length) : null,
      };
    });
  }, [model, selectedAttempt]);

  const performanceHighlights = useMemo(() => {
    if (!model) {
      return {
        selectedScore: null as number | null,
        scorePct: 0,
        goalSummary: '—',
      };
    }

    const selectedScore = selectedAttempt?.overallScore ?? null;
    const goalsDone = selectedAttempt ? selectedAttempt.goals.filter((goal) => goal.achieved).length : 0;
    const goalsTotal = selectedAttempt?.goals.length ?? 0;
    const scorePct = Math.max(0, Math.min(100, ((selectedScore ?? 0) / 10) * 100));

    return {
      selectedScore,
      scorePct,
      goalSummary: goalsTotal > 0 ? `${goalsDone}/${goalsTotal}` : '—',
    };
  }, [model, selectedAttempt]);

  const focusCriteria = useMemo(
    () =>
      criteriaStats.map((c) => ({
        key: c.key,
        label: c.label,
        value: c.current ?? c.avg ?? 0,
      })),
    [criteriaStats]
  );

  if (loading) return <div style={{ minHeight: '100vh', background: 'var(--bg)' }} />;
  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text-primary)', padding: '1.4rem 1.6rem' }}>
        <button type="button" onClick={() => router.push(backHref)} className={styles.btn}>
          Вернуться к прогрессу
        </button>
        <p style={{ marginTop: 10 }}>Не удалось загрузить данные: {error}</p>
      </div>
    );
  }
  if (!model || model.attempts.length === 0) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text-primary)', padding: '1.4rem 1.6rem' }}>
        <button type="button" onClick={() => router.push(backHref)} className={styles.btn}>
          Вернуться к прогрессу
        </button>
        <p style={{ marginTop: 10 }}>Нет данных попыток по этому объекту.</p>
      </div>
    );
  }

  const goalsDone = selectedAttempt ? selectedAttempt.goals.filter((g) => g.achieved).length : 0;
  const goalsTotal = selectedAttempt?.goals.length ?? 0;

  return (
    <div className={styles.focusPage}>
      <FocusHero
        title={model.title}
        subtitle={model.subtitle}
        mode={model.mode}
        backHref={backHref}
        score={selectedAttempt?.overallScore ?? null}
        attemptNumber={selectedAttemptMeta?.number ?? null}
        dateLabel={selectedAttemptMeta?.dateLabel ?? '—'}
        stepCompletionPct={selectedAttempt?.stepCompletionPct ?? null}
        goalsDone={goalsDone}
        goalsTotal={goalsTotal}
        bestScore={model.bestScore}
      />

      <FocusCriteria criteria={focusCriteria} />

      <FocusAttemptSelector
        attempts={model.attempts}
        selectedAttemptId={selectedAttempt?.attemptId ?? null}
        onSelect={setSelectedAttemptId}
      />

      <FocusProgressChecklist 
        steps={selectedAttempt?.steps ?? []} 
        goals={selectedAttempt?.goals ?? []} 
      />

      <FocusFeedbackPanel
        strengths={selectedAttemptFeedback.strengths}
        improvements={selectedAttemptFeedback.improvements}
        comment={selectedAttemptFeedback.comment}
      />

      {selectedAttempt && model && (
        <FocusTranscript
          mode={model.mode}
          agentSessionId={selectedAttempt.agentSessionId}
          debateSessionId={selectedAttempt.debateSessionId}
          fallbackUserMessages={selectedAttempt.fallbackUserMessages}
        />
      )}
    </div>
  );
}







