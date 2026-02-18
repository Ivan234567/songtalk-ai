'use client';

import { useCallback, useMemo, useState } from 'react';
import { isUserScenarioId } from '@/lib/user-scenarios';
import { DEBATE_TOPICS } from '@/lib/debate-topics';
import type { CriteriaScores } from '@/lib/speaking-assessment';
import type { CompletionRow, AssessmentRow, DebateCompletionRow } from './useProgressData';

export type PeriodFilterValue = '7d' | '30d' | '90d' | 'all';
export type ProgressModeValue = 'roleplay' | 'debate';
export type ProgressViewValue = 'system' | 'personal';

export const PERIOD_FILTER_OPTIONS: { value: PeriodFilterValue; label: string }[] = [
  { value: '7d', label: '7 дней' },
  { value: '30d', label: '30 дней' },
  { value: '90d', label: '90 дней' },
  { value: 'all', label: 'За всё время' },
];

export function getPeriodStart(period: PeriodFilterValue): Date | null {
  if (period === 'all') return null;
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const start = new Date();
  start.setDate(start.getDate() - days);
  return start;
}

export function getBucketKeyByDate(dateIso: string, bucketByWeek: boolean): string {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return '';
  if (bucketByWeek) {
    const mondayShift = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - mondayShift);
  }
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

export function normalizeDebateTopicKey(value: string): string {
  return value.trim().toLowerCase();
}

function parseMsSafe(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function useProgressFilters(
  completions: CompletionRow[],
  assessments: AssessmentRow[],
  debateCompletions: DebateCompletionRow[],
  debateAssessments: AssessmentRow[]
) {
  const [periodFilter, setPeriodFilter] = useState<PeriodFilterValue>('30d');
  const [mode, setMode] = useState<ProgressModeValue>('roleplay');
  const [progressView, setProgressView] = useState<ProgressViewValue>('system');

  const periodStart = useMemo(() => getPeriodStart(periodFilter), [periodFilter]);

  const periodFilteredCompletions = useMemo(() => {
    if (!periodStart) return completions;
    return completions.filter((row) => new Date(row.completed_at) >= periodStart);
  }, [completions, periodStart]);

  const periodFilteredAssessments = useMemo(() => {
    if (!periodStart) return assessments;
    return assessments.filter((row) => new Date(row.created_at) >= periodStart);
  }, [assessments, periodStart]);

  const periodFilteredDebateCompletions = useMemo(() => {
    if (!periodStart) return debateCompletions;
    return debateCompletions.filter((row) => new Date(row.completed_at) >= periodStart);
  }, [debateCompletions, periodStart]);

  const periodFilteredDebateAssessments = useMemo(() => {
    const ids = new Set(
      periodFilteredDebateCompletions
        .map((row) => row.assessment_id)
        .filter((id): id is string => Boolean(id))
    );
    if (ids.size === 0) return [];
    return debateAssessments.filter((row) => ids.has(row.id));
  }, [periodFilteredDebateCompletions, debateAssessments]);

  const isSystemDebate = useMemo(
    () => (topic: string, topicRu?: string | null) =>
      DEBATE_TOPICS.some(
        (dt) =>
          dt.topic === topic ||
          dt.topicRu === topic ||
          (typeof topicRu === 'string' && (dt.topic === topicRu || dt.topicRu === topicRu))
      ),
    []
  );

  const scopedRoleplayCompletions = useMemo(() => {
    return progressView === 'system'
      ? periodFilteredCompletions.filter((row) => !isUserScenarioId(row.scenario_id))
      : periodFilteredCompletions.filter((row) => isUserScenarioId(row.scenario_id));
  }, [periodFilteredCompletions, progressView]);

  const scopedDebateCompletions = useMemo(() => {
    return progressView === 'system'
      ? periodFilteredDebateCompletions.filter((row) => isSystemDebate(row.topic, row.topic_ru))
      : periodFilteredDebateCompletions.filter((row) => !isSystemDebate(row.topic, row.topic_ru));
  }, [periodFilteredDebateCompletions, progressView, isSystemDebate]);

  const scopedAssessments = useMemo(() => {
    if (mode === 'roleplay') {
      const scenarioIds = new Set(scopedRoleplayCompletions.map((row) => row.scenario_id));
      return periodFilteredAssessments.filter((row) => row.scenario_id && scenarioIds.has(row.scenario_id));
    }
    const matched = new Map<string, AssessmentRow>();
    for (const completion of scopedDebateCompletions) {
      let resolved: AssessmentRow | undefined;

      if (completion.assessment_id) {
        resolved = periodFilteredDebateAssessments.find((row) => row.id === completion.assessment_id);
      }

      if (!resolved && completion.debate_session_id) {
        resolved = periodFilteredDebateAssessments.find(
          (row) => row.agent_session_id === completion.debate_session_id
        );
      }

      if (!resolved) {
        const targetMs = parseMsSafe(completion.completed_at);
        if (targetMs != null) {
          let best: AssessmentRow | undefined;
          let bestDiff = Number.POSITIVE_INFINITY;
          for (const row of periodFilteredDebateAssessments) {
            const ms = parseMsSafe(row.created_at);
            if (ms == null) continue;
            const diff = Math.abs(ms - targetMs);
            if (diff <= 48 * 60 * 60 * 1000 && diff < bestDiff) {
              best = row;
              bestDiff = diff;
            }
          }
          resolved = best;
        }
      }

      if (resolved) matched.set(resolved.id, resolved);
    }

    return Array.from(matched.values());
  }, [mode, scopedRoleplayCompletions, scopedDebateCompletions, periodFilteredAssessments, periodFilteredDebateAssessments]);

  const overviewSessions = mode === 'roleplay' ? scopedRoleplayCompletions : scopedDebateCompletions;

  const resetFilters = useCallback(() => {
    setPeriodFilter('30d');
    setMode('roleplay');
    setProgressView('system');
  }, []);

  return {
    periodFilter,
    setPeriodFilter,
    mode,
    setMode,
    progressView,
    setProgressView,
    periodStart,
    periodFilteredCompletions,
    periodFilteredAssessments,
    periodFilteredDebateCompletions,
    periodFilteredDebateAssessments,
    scopedRoleplayCompletions,
    scopedDebateCompletions,
    scopedAssessments,
    overviewSessions,
    isSystemDebate,
    resetFilters,
  };
}
