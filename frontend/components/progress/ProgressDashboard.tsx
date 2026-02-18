'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCriteriaLabel } from '@/lib/speaking-assessment';
import type { CriteriaScores } from '@/lib/speaking-assessment';
import { isUserScenarioId } from '@/lib/user-scenarios';
import { useProgressData } from './hooks/useProgressData';
import { useProgressFilters, getBucketKeyByDate, normalizeDebateTopicKey } from './hooks/useProgressFilters';
import { ProgressHero } from './ProgressHero';
import { ProgressFilters } from './ProgressFilters';
import { KpiCards } from './KpiCards';
import { CriteriaOverview } from './CriteriaOverview';
import { RecentSessions, type RecentSessionRow } from './RecentSessions';
import { RecommendedScenarios, type RecommendRow } from './RecommendedScenarios';
import type { CompletionRow, AssessmentRow, DebateCompletionRow } from './hooks/useProgressData';
import styles from './progress.module.css';

function parseMsSafe(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function resolveDebateAssessmentForCompletion(
  completion: DebateCompletionRow,
  assessments: AssessmentRow[]
): AssessmentRow | undefined {
  if (completion.assessment_id) {
    const byId = assessments.find((row) => row.id === completion.assessment_id);
    if (byId) return byId;
  }

  if (completion.debate_session_id) {
    const bySession = assessments.find((row) => row.agent_session_id === completion.debate_session_id);
    if (bySession) return bySession;
  }

  const targetMs = parseMsSafe(completion.completed_at);
  if (targetMs == null) return undefined;
  let best: AssessmentRow | undefined;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const row of assessments) {
    const ms = parseMsSafe(row.created_at);
    if (ms == null) continue;
    const diff = Math.abs(ms - targetMs);
    if (diff <= 48 * 60 * 60 * 1000 && diff < bestDiff) {
      best = row;
      bestDiff = diff;
    }
  }
  return best;
}

function findNearestAssessmentByTime(
  completedAt: string,
  candidates: AssessmentRow[],
  maxDiffMs = 48 * 60 * 60 * 1000
): AssessmentRow | null {
  const targetMs = parseMsSafe(completedAt);
  if (targetMs == null || candidates.length === 0) return null;
  let best: AssessmentRow | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const row of candidates) {
    const ms = parseMsSafe(row.created_at);
    if (ms == null) continue;
    const diff = Math.abs(ms - targetMs);
    if (diff <= maxDiffMs && diff < bestDiff) {
      best = row;
      bestDiff = diff;
    }
  }
  return best;
}

export function ProgressDashboard() {
  const router = useRouter();
  const { userId, data, loading, error, retry } = useProgressData();
  const {
    periodFilter,
    setPeriodFilter,
    mode,
    setMode,
    progressView,
    setProgressView,
    periodFilteredCompletions,
    periodFilteredDebateCompletions,
    periodFilteredDebateAssessments,
    scopedRoleplayCompletions,
    scopedDebateCompletions,
    scopedAssessments,
    overviewSessions,
    isSystemDebate,
    resetFilters,
  } = useProgressFilters(
    data.completions,
    data.assessments,
    data.debateCompletions,
    data.debateAssessments
  );

  const [selectedTrendKey, setSelectedTrendKey] = useState<string | null>(null);
  const [selectedCriterionKey, setSelectedCriterionKey] = useState<keyof CriteriaScores | null>(null);

  /* Badge counts for filter buttons */
  const filterBadgeCounts = useMemo(() => {
    // View badges: count per view for current mode + period (not filtered by view)
    const systemCount =
      mode === 'roleplay'
        ? periodFilteredCompletions.filter((r) => !isUserScenarioId(r.scenario_id)).length
        : periodFilteredDebateCompletions.filter((r) => isSystemDebate(r.topic, r.topic_ru)).length;
    const personalCount =
      mode === 'roleplay'
        ? periodFilteredCompletions.filter((r) => isUserScenarioId(r.scenario_id)).length
        : periodFilteredDebateCompletions.filter((r) => !isSystemDebate(r.topic, r.topic_ru)).length;

    return {
      roleplay: scopedRoleplayCompletions.length,
      debate: scopedDebateCompletions.length,
      system: systemCount,
      personal: personalCount,
    };
  }, [
    mode,
    periodFilteredCompletions,
    periodFilteredDebateCompletions,
    scopedRoleplayCompletions,
    scopedDebateCompletions,
    isSystemDebate,
  ]);

  const assessmentByScenario = useMemo(() => {
    const map = new Map<string, AssessmentRow>();
    const roleplayAssessmentsByScenario = new Map<string, AssessmentRow[]>();
    for (const row of data.assessments) {
      if (row.scenario_id && !map.has(row.scenario_id)) {
        map.set(row.scenario_id, row);
      }
      if (row.scenario_id) {
        if (!roleplayAssessmentsByScenario.has(row.scenario_id)) {
          roleplayAssessmentsByScenario.set(row.scenario_id, []);
        }
        roleplayAssessmentsByScenario.get(row.scenario_id)!.push(row);
      }
    }
    return map;
  }, [data.assessments]);

  const debateAssessmentById = useMemo(() => {
    const map = new Map<string, AssessmentRow>();
    for (const completion of periodFilteredDebateCompletions) {
      const assessment = resolveDebateAssessmentForCompletion(
        completion,
        periodFilteredDebateAssessments
      );
      if (assessment) map.set(completion.id, assessment);
    }
    return map;
  }, [periodFilteredDebateCompletions, periodFilteredDebateAssessments]);

  const roleplayAssessmentsByScenario = useMemo(() => {
    const map = new Map<string, AssessmentRow[]>();
    for (const row of data.assessments) {
      if (!row.scenario_id) continue;
      if (!map.has(row.scenario_id)) map.set(row.scenario_id, []);
      map.get(row.scenario_id)!.push(row);
    }
    for (const rows of map.values()) {
      rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return map;
  }, [data.assessments]);

  const roleplayAssessmentByCompletionId = useMemo(() => {
    const map = new Map<string, AssessmentRow | null>();
    for (const completion of scopedRoleplayCompletions) {
      const candidates = roleplayAssessmentsByScenario.get(completion.scenario_id) ?? [];
      map.set(completion.id, findNearestAssessmentByTime(completion.completed_at, candidates));
    }
    return map;
  }, [scopedRoleplayCompletions, roleplayAssessmentsByScenario]);

  const overviewAvgScore = useMemo(() => {
    const values = scopedAssessments
      .map((row) => row.overall_score)
      .filter((v): v is number => typeof v === 'number');
    if (values.length === 0) return null;
    return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  }, [scopedAssessments]);

  const trendPoints = useMemo(() => {
    const bucketByWeek = periodFilter === '90d' || periodFilter === 'all';
    const buckets = new Map<string, { ts: number; label: string; sum: number; count: number }>();

    for (const row of scopedAssessments) {
      if (typeof row.overall_score !== 'number') continue;
      const dt = new Date(row.created_at);
      if (Number.isNaN(dt.getTime())) continue;

      let bucketStart = new Date(dt);
      if (bucketByWeek) {
        const mondayShift = (bucketStart.getDay() + 6) % 7;
        bucketStart.setDate(bucketStart.getDate() - mondayShift);
      }
      bucketStart.setHours(0, 0, 0, 0);
      const key = bucketStart.toISOString().slice(0, 10);
      const label = bucketStart.toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' });

      const existing = buckets.get(key);
      if (existing) {
        existing.sum += row.overall_score;
        existing.count += 1;
      } else {
        buckets.set(key, { ts: bucketStart.getTime(), label, sum: row.overall_score, count: 1 });
      }
    }

    return Array.from(buckets.values())
      .sort((a, b) => a.ts - b.ts)
      .map((b) => ({
        key: new Date(b.ts).toISOString().slice(0, 10),
        value: Math.round((b.sum / b.count) * 10) / 10,
        label: b.label,
        count: b.count,
      }));
  }, [scopedAssessments, periodFilter]);

  /* Previous period for delta comparison */
  const prevPeriodAvgScore = useMemo(() => {
    if (periodFilter === 'all') return null;
    const days = periodFilter === '7d' ? 7 : periodFilter === '30d' ? 30 : 90;
    const now = new Date();
    const prevEnd = new Date(now);
    prevEnd.setDate(prevEnd.getDate() - days);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - days);

    const prevRoleplay = data.completions.filter((r) => {
      const d = new Date(r.completed_at);
      return d >= prevStart && d < prevEnd;
    });
    const prevDebate = data.debateCompletions.filter((r) => {
      const d = new Date(r.completed_at);
      return d >= prevStart && d < prevEnd;
    });

    const prevRoleplayFiltered =
      progressView === 'system'
        ? prevRoleplay.filter((r) => !isUserScenarioId(r.scenario_id))
        : prevRoleplay.filter((r) => isUserScenarioId(r.scenario_id));
    const prevDebateFiltered =
      progressView === 'system'
        ? prevDebate.filter((r) => isSystemDebate(r.topic, r.topic_ru))
        : prevDebate.filter((r) => !isSystemDebate(r.topic, r.topic_ru));

    const prevCompletions = mode === 'roleplay' ? prevRoleplayFiltered : prevDebateFiltered;

    if (mode === 'roleplay') {
      const scenarioIds = new Set(prevCompletions.map((r) => r.scenario_id));
      const prevAssessments = data.assessments.filter(
        (a) =>
          a.scenario_id &&
          scenarioIds.has(a.scenario_id) &&
          new Date(a.created_at) >= prevStart &&
          new Date(a.created_at) < prevEnd
      );
      const scores = prevAssessments
        .map((a) => a.overall_score)
        .filter((v): v is number => typeof v === 'number');
      if (scores.length === 0) return null;
      return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
    }

    const prevAssessments = prevDebateFiltered
      .map((row) => resolveDebateAssessmentForCompletion(row, data.debateAssessments))
      .filter((row): row is AssessmentRow => Boolean(row));
    const scores = prevAssessments
      .map((a) => a.overall_score)
      .filter((v): v is number => typeof v === 'number');
    if (scores.length === 0) return null;
    return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  }, [
    periodFilter,
    progressView,
    mode,
    data.completions,
    data.debateCompletions,
    data.assessments,
    data.debateAssessments,
    isSystemDebate,
  ]);

  const deltaVsPrevious = useMemo(() => {
    if (overviewAvgScore == null || prevPeriodAvgScore == null) return null;
    const diff = overviewAvgScore - prevPeriodAvgScore;
    if (Math.abs(diff) < 0.05) return null;
    const periodLabel = periodFilter === '7d' ? '7 дн.' : periodFilter === '30d' ? '30 дн.' : '90 дн.';
    return {
      value: diff,
      label: `vs предыдущие ${periodLabel}`,
      isPositive: diff > 0,
    };
  }, [overviewAvgScore, prevPeriodAvgScore, periodFilter]);

  /* Streak: consecutive days with practice */
  const streakDays = useMemo(() => {
    const allDates = new Set<string>();
    for (const r of data.completions) {
      const d = new Date(r.completed_at).toISOString().slice(0, 10);
      allDates.add(d);
    }
    for (const r of data.debateCompletions) {
      const d = new Date(r.completed_at).toISOString().slice(0, 10);
      allDates.add(d);
    }
    const today = new Date().toISOString().slice(0, 10);
    if (!allDates.has(today)) return 0;
    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 365; i++) {
      const key = d.toISOString().slice(0, 10);
      if (!allDates.has(key)) break;
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }, [data.completions, data.debateCompletions]);

  /* Best score for the period */
  const bestScore = useMemo(() => {
    const scores = scopedAssessments
      .map((r) => r.overall_score)
      .filter((v): v is number => typeof v === 'number');
    if (scores.length === 0) return null;
    return Math.max(...scores);
  }, [scopedAssessments]);

  /* Sparkline: avg score per bucket (reuse trendPoints values) */
  const avgScoreSparkline = useMemo(
    () => trendPoints.map((p) => p.value),
    [trendPoints]
  );

  /* Sparkline: session counts per bucket */
  const sessionsSparkline = useMemo(() => {
    const bucketByWeek = periodFilter === '90d' || periodFilter === 'all';
    const buckets = new Map<string, { ts: number; count: number }>();

    for (const session of overviewSessions) {
      const dt = new Date(session.completed_at);
      if (Number.isNaN(dt.getTime())) continue;
      const d = new Date(dt);
      if (bucketByWeek) {
        const shift = (d.getDay() + 6) % 7;
        d.setDate(d.getDate() - shift);
      }
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().slice(0, 10);
      const existing = buckets.get(key);
      if (existing) existing.count += 1;
      else buckets.set(key, { ts: d.getTime(), count: 1 });
    }

    return Array.from(buckets.values())
      .sort((a, b) => a.ts - b.ts)
      .map((b) => b.count);
  }, [overviewSessions, periodFilter]);

  /* Delta: sessions vs previous period */
  const sessionsDelta = useMemo(() => {
    if (periodFilter === 'all') return null;
    const days = periodFilter === '7d' ? 7 : periodFilter === '30d' ? 30 : 90;
    const now = new Date();
    const prevEnd = new Date(now);
    prevEnd.setDate(prevEnd.getDate() - days);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - days);

    const prevCount = (
      mode === 'roleplay'
        ? data.completions.filter((r) => {
            const d = new Date(r.completed_at);
            return d >= prevStart && d < prevEnd;
          })
        : data.debateCompletions.filter((r) => {
            const d = new Date(r.completed_at);
            return d >= prevStart && d < prevEnd;
          })
    ).length;

    if (prevCount === 0 && overviewSessions.length === 0) return null;
    const diff = overviewSessions.length - prevCount;
    if (diff === 0) return null;
    const periodLabel = periodFilter === '7d' ? '7 дн.' : periodFilter === '30d' ? '30 дн.' : '90 дн.';
    return { diff, label: `vs пред. ${periodLabel}` };
  }, [periodFilter, mode, data.completions, data.debateCompletions, overviewSessions]);

  /* Delta: avg score (reuse from hero) */
  const avgScoreDelta = useMemo(() => {
    if (overviewAvgScore == null || prevPeriodAvgScore == null) return null;
    const diff = overviewAvgScore - prevPeriodAvgScore;
    if (Math.abs(diff) < 0.05) return null;
    const periodLabel = periodFilter === '7d' ? '7 дн.' : periodFilter === '30d' ? '30 дн.' : '90 дн.';
    return { diff, label: `vs пред. ${periodLabel}` };
  }, [overviewAvgScore, prevPeriodAvgScore, periodFilter]);

  const criteriaOverview = useMemo(() => {
    const keys: (keyof CriteriaScores)[] = [
      'fluency',
      'vocabulary_grammar',
      'pronunciation',
      'completeness',
      'dialogue_skills',
    ];
    const sorted = [...scopedAssessments].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const mid = Math.floor(sorted.length / 2);

    return keys.map((key) => {
      const vals = sorted
        .map((r) => r.criteria_scores?.[key])
        .filter((v): v is number => typeof v === 'number');
      const samples = vals.length;
      const avg = samples > 0 ? vals.reduce((a, b) => a + b, 0) / samples : 0;
      const min = samples > 0 ? Math.min(...vals) : null;
      const max = samples > 0 ? Math.max(...vals) : null;

      const prevVals = sorted
        .slice(0, mid)
        .map((r) => r.criteria_scores?.[key])
        .filter((v): v is number => typeof v === 'number');
      const nextVals = sorted
        .slice(mid)
        .map((r) => r.criteria_scores?.[key])
        .filter((v): v is number => typeof v === 'number');
      const prevAvg = prevVals.length ? prevVals.reduce((a, b) => a + b, 0) / prevVals.length : 0;
      const nextAvg = nextVals.length ? nextVals.reduce((a, b) => a + b, 0) / nextVals.length : 0;
      const delta = nextVals.length && prevVals.length ? nextAvg - prevAvg : 0;

      return {
        key,
        label: getCriteriaLabel(key),
        value: Math.round(avg * 10) / 10,
        min: min != null ? Math.round(min * 10) / 10 : null,
        max: max != null ? Math.round(max * 10) / 10 : null,
        samples,
        delta: Math.round(delta * 10) / 10,
      };
    });
  }, [scopedAssessments]);

  const weakestCriterionKey = useMemo(() => {
    const valid = criteriaOverview.filter((item) => item.value > 0);
    if (valid.length === 0) return null;
    return valid.reduce((min, cur) => (cur.value < min.value ? cur : min)).key;
  }, [criteriaOverview]);

  const recentSessions = useMemo((): RecentSessionRow[] => {
    if (mode === 'roleplay') {
      return scopedRoleplayCompletions
        .map((row) => {
          const assessment = roleplayAssessmentByCompletionId.get(row.id);
          return {
            id: row.id,
            rowMode: 'roleplay' as const,
            title: row.scenario_title || row.scenario_id,
            completedAt: row.completed_at,
            score: typeof assessment?.overall_score === 'number' ? assessment.overall_score : null,
            objectKey: `rp:${row.scenario_id}`,
            completionId: row.id,
          };
        })
        .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
    }

    return scopedDebateCompletions
      .map((row) => {
        const assessment = debateAssessmentById.get(row.id);
        return {
          id: row.id,
          rowMode: 'debate' as const,
          title: row.topic_ru || row.topic,
          completedAt: row.completed_at,
          score: typeof assessment?.overall_score === 'number' ? assessment.overall_score : null,
          objectKey: `db:${normalizeDebateTopicKey(row.topic_ru || row.topic)}`,
          completionId: row.id,
        };
      })
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  }, [
    mode,
    scopedRoleplayCompletions,
    scopedDebateCompletions,
    roleplayAssessmentByCompletionId,
    debateAssessmentById,
  ]);

  const activeCriterionKey = selectedCriterionKey ?? weakestCriterionKey;

  const coachFocusRows = useMemo((): RecommendRow[] => {
    if (!activeCriterionKey) return [];

    const scoreHistoryByObject = new Map<string, number[]>();
    if (mode === 'roleplay') {
      for (const row of scopedRoleplayCompletions) {
        const assessment = roleplayAssessmentByCompletionId.get(row.id);
        const score = assessment?.overall_score;
        if (typeof score !== 'number') continue;
        const key = `rp:${row.scenario_id}`;
        if (!scoreHistoryByObject.has(key)) scoreHistoryByObject.set(key, []);
        scoreHistoryByObject.get(key)!.push(score);
      }
    } else {
      for (const row of scopedDebateCompletions) {
        const assessment = debateAssessmentById.get(row.id);
        const score = assessment?.overall_score;
        if (typeof score !== 'number') continue;
        const key = `db:${normalizeDebateTopicKey(row.topic_ru || row.topic)}`;
        if (!scoreHistoryByObject.has(key)) scoreHistoryByObject.set(key, []);
        scoreHistoryByObject.get(key)!.push(score);
      }
    }

    return recentSessions
      .map((row) => {
        let criterionScore: number | null = null;
        if (row.rowMode === 'roleplay') {
          const assessment = roleplayAssessmentByCompletionId.get(row.completionId);
          criterionScore = assessment?.criteria_scores?.[activeCriterionKey] ?? null;
        } else {
          const assessment = debateAssessmentById.get(row.completionId);
          criterionScore = assessment?.criteria_scores?.[activeCriterionKey] ?? null;
        }
        const history = scoreHistoryByObject.get(row.objectKey) ?? [];
        const first = history.length > 0 ? history[0] : null;
        const last = history.length > 0 ? history[history.length - 1] : null;
        const trendDelta = typeof first === 'number' && typeof last === 'number' ? last - first : 0;
        const reasonText =
          (criterionScore ?? 0) <= 4.5
            ? 'Критерий заметно проседает. Повторение даст максимальный прирост.'
            : (criterionScore ?? 0) <= 6.5
              ? 'Критерий ниже целевого уровня. Нужна закрепляющая практика.'
              : 'Полезно повторить для стабилизации навыка и роста уверенности.';
        const priority: RecommendRow['priority'] =
          (criterionScore ?? 0) <= 4.5 ? 'high' : (criterionScore ?? 0) <= 6.5 ? 'medium' : 'low';

        return {
          ...row,
          criterionScore: criterionScore ?? 0,
          attemptsCount: history.length,
          scoreHistory: history,
          reasonText:
            history.length >= 2
              ? `${reasonText} Тренд: ${trendDelta >= 0 ? '+' : ''}${trendDelta.toFixed(1)} за период.`
              : reasonText,
          priority,
        };
      })
      .filter((row) => typeof row.criterionScore === 'number' && row.criterionScore > 0)
      .sort((a, b) => a.criterionScore - b.criterionScore)
      .slice(0, 8);
  }, [
    recentSessions,
    activeCriterionKey,
    mode,
    scopedRoleplayCompletions,
    scopedDebateCompletions,
    roleplayAssessmentByCompletionId,
    debateAssessmentById,
  ]);

  const criterionScopedRecentSessions = useMemo(() => {
    if (!activeCriterionKey) return recentSessions;
    return recentSessions
      .map((row) => {
        let criterionScore: number | null = null;
        if (row.rowMode === 'roleplay') {
          const assessment = roleplayAssessmentByCompletionId.get(row.completionId);
          criterionScore = assessment?.criteria_scores?.[activeCriterionKey] ?? null;
        } else {
          const assessment = debateAssessmentById.get(row.completionId);
          criterionScore = assessment?.criteria_scores?.[activeCriterionKey] ?? null;
        }
        return { row, criterionScore };
      })
      .filter((item) => typeof item.criterionScore === 'number' && item.criterionScore > 0)
      .sort((a, b) => {
        if ((a.criterionScore ?? 0) !== (b.criterionScore ?? 0)) {
          return (a.criterionScore ?? 0) - (b.criterionScore ?? 0);
        }
        return new Date(b.row.completedAt).getTime() - new Date(a.row.completedAt).getTime();
      })
      .map((item) => item.row);
  }, [activeCriterionKey, recentSessions, roleplayAssessmentByCompletionId, debateAssessmentById]);

  const hasNoData = overviewSessions.length === 0 && scopedAssessments.length === 0;

  const openFocusForObject = (objectKey: string, attemptId?: string) => {
    const params = new URLSearchParams();
    params.set('tab', 'progress');
    params.set('period', periodFilter);
    params.set('mode', mode);
    params.set('view', progressView);
    if (attemptId) params.set('attempt', attemptId);
    router.push(`/dashboard/progress/focus/${encodeURIComponent(objectKey)}?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className={styles.dashboard}>
        <div className={styles.filters} style={{ opacity: 0.7 }} />
        <div className={styles.kpiGrid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.kpiCard} style={{ opacity: 0.6 }} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.emptyState} style={{ borderColor: 'rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.08)' }}>
        <p className={styles.emptyTitle} style={{ color: 'var(--text-primary)' }}>Не удалось загрузить прогресс</p>
        <p className={styles.emptyDescription} style={{ marginTop: '0.5rem' }}>{error}</p>
        <button type="button" onClick={retry} className={styles.btn} style={{ marginTop: '0.75rem' }}>
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      <ProgressFilters
        periodFilter={periodFilter}
        onPeriodChange={setPeriodFilter}
        mode={mode}
        onModeChange={setMode}
        progressView={progressView}
        onProgressViewChange={setProgressView}
        roleplayCount={filterBadgeCounts.roleplay}
        debateCount={filterBadgeCounts.debate}
        systemCount={filterBadgeCounts.system}
        personalCount={filterBadgeCounts.personal}
      />

      {hasNoData && (
        <section className={styles.emptyState}>
          <h3 className={styles.emptyTitle}>Нет данных для выбранных фильтров</h3>
          <p className={styles.emptyDescription}>
            Попробуйте другой период/режим или сбросьте фильтры.
          </p>
          <button type="button" onClick={resetFilters} className={styles.btn} style={{ marginTop: '0.65rem' }}>
            Сбросить фильтры
          </button>
        </section>
      )}

      <ProgressHero
        periodFilter={periodFilter}
        avgScore={overviewAvgScore}
        sessionsCount={overviewSessions.length}
        trendPoints={trendPoints}
        selectedTrendKey={selectedTrendKey}
        onTrendPointClick={setSelectedTrendKey}
        weakestCriterionLabel={weakestCriterionKey ? getCriteriaLabel(weakestCriterionKey) : null}
        deltaVsPrevious={deltaVsPrevious}
        streakDays={streakDays}
      />

      <KpiCards
        avgScore={overviewAvgScore}
        sessionsCount={overviewSessions.length}
        bestScore={bestScore}
        avgScoreSparkline={avgScoreSparkline}
        sessionsSparkline={sessionsSparkline}
        avgScoreDelta={avgScoreDelta}
        sessionsDelta={sessionsDelta}
      />

      <CriteriaOverview
        criteria={criteriaOverview}
        selectedCriterionKey={selectedCriterionKey}
        onCriterionSelect={setSelectedCriterionKey}
      />

      <RecentSessions
        sessions={criterionScopedRecentSessions}
        limit={5}
        onOpenFocus={openFocusForObject}
      />

      <RecommendedScenarios
        weakestCriterionKey={activeCriterionKey}
        rows={coachFocusRows}
        onOpenFocus={openFocusForObject}
        onStartPractice={(objectKey) => router.push(`/dashboard?tab=agent&from=progress&target=${encodeURIComponent(objectKey)}`)}
        criterionLabelPrefix={selectedCriterionKey ? 'Фокус-критерий' : 'Слабый критерий'}
      />
    </div>
  );
}
