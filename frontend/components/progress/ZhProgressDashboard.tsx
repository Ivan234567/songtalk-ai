'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ZH_CRITERIA_KEYS, getZhCriteriaLabel, type ZhCriteriaKey } from '@/lib/zh-speaking-assessment';
import { zhVoiceTaskVerdictLabel } from '@/lib/zh-voice-tasks';
import { useZhProgressData, type ZhAssessmentRow } from './hooks/useZhProgressData';
import {
  getPeriodStart,
  getBucketKeyByDate,
  type PeriodFilterValue,
  type ProgressModeValue,
  type ProgressViewValue,
} from './hooks/useProgressFilters';
import { ProgressHero } from './ProgressHero';
import { ProgressFilters } from './ProgressFilters';
import { KpiCards } from './KpiCards';
import { CriteriaOverview } from './CriteriaOverview';
import { RecentSessions, type RecentSessionRow } from './RecentSessions';
import { RecommendedScenarios, type RecommendRow } from './RecommendedScenarios';
import styles from './progress.module.css';

function parseMsSafe(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function findNearestAssessmentByTime(
  completedAt: string,
  candidates: ZhAssessmentRow[],
  maxDiffMs = 48 * 60 * 60 * 1000
): ZhAssessmentRow | null {
  const targetMs = parseMsSafe(completedAt);
  if (targetMs == null || candidates.length === 0) return null;
  let best: ZhAssessmentRow | null = null;
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

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

export function ZhProgressDashboard() {
  const router = useRouter();
  const { data, loading, error, retry } = useZhProgressData();
  const [periodFilter, setPeriodFilter] = useState<PeriodFilterValue>('30d');
  const [mode, setMode] = useState<ProgressModeValue>('roleplay');
  const [progressView, setProgressView] = useState<ProgressViewValue>('system');
  const [selectedTrendKey, setSelectedTrendKey] = useState<string | null>(null);
  const [selectedCriterionKey, setSelectedCriterionKey] = useState<ZhCriteriaKey | null>(null);

  const periodStart = useMemo(() => getPeriodStart(periodFilter), [periodFilter]);

  const periodCompletions = useMemo(() => {
    if (!periodStart) return data.completions;
    return data.completions.filter((row) => new Date(row.completed_at) >= periodStart);
  }, [data.completions, periodStart]);

  const periodVoice = useMemo(() => {
    if (!periodStart) return data.voiceAttempts;
    return data.voiceAttempts.filter((row) => new Date(row.created_at) >= periodStart);
  }, [data.voiceAttempts, periodStart]);

  const scopedCompletions = useMemo(
    () => periodCompletions.filter((row) => (progressView === 'system' ? row.source === 'system' : row.source === 'user')),
    [periodCompletions, progressView]
  );

  const scopedVoice = useMemo(
    () => periodVoice.filter((row) => (progressView === 'system' ? row.source === 'system' : row.source === 'user')),
    [periodVoice, progressView]
  );

  const assessmentsByScenario = useMemo(() => {
    const map = new Map<string, ZhAssessmentRow[]>();
    for (const row of data.assessments) {
      if (!row.scenario_id) continue;
      if (!map.has(row.scenario_id)) map.set(row.scenario_id, []);
      map.get(row.scenario_id)!.push(row);
    }
    return map;
  }, [data.assessments]);

  const assessmentByCompletionId = useMemo(() => {
    const map = new Map<string, ZhAssessmentRow | null>();
    for (const completion of scopedCompletions) {
      const candidates = assessmentsByScenario.get(completion.scenario_id) ?? [];
      map.set(completion.id, findNearestAssessmentByTime(completion.completed_at, candidates));
    }
    return map;
  }, [scopedCompletions, assessmentsByScenario]);

  const scopedAssessments = useMemo(() => {
    const rows: ZhAssessmentRow[] = [];
    for (const completion of scopedCompletions) {
      const assessment = assessmentByCompletionId.get(completion.id);
      if (assessment) rows.push(assessment);
    }
    return rows;
  }, [scopedCompletions, assessmentByCompletionId]);

  const overviewAvgScore = useMemo(
    () => avg(scopedAssessments.map((row) => row.overall_score).filter((v): v is number => typeof v === 'number')),
    [scopedAssessments]
  );

  const voiceDoneRate = useMemo(() => {
    if (scopedVoice.length === 0) return null;
    const done = scopedVoice.filter((row) => row.verdict === 'done').length;
    return Math.round((done / scopedVoice.length) * 100);
  }, [scopedVoice]);

  const voiceCoverageAvg = useMemo(
    () => avg(scopedVoice.map((row) => row.coveragePct).filter((v): v is number => typeof v === 'number')),
    [scopedVoice]
  );

  const trendPoints = useMemo(() => {
    const bucketByWeek = periodFilter === '90d' || periodFilter === 'all';
    const buckets = new Map<string, { ts: number; label: string; sum: number; count: number }>();
    const source =
      mode === 'voice'
        ? scopedVoice
            .filter((row) => typeof row.coveragePct === 'number')
            .map((row) => ({ created_at: row.created_at, value: (row.coveragePct as number) / 10 }))
        : scopedAssessments
            .filter((row) => typeof row.overall_score === 'number')
            .map((row) => ({ created_at: row.created_at, value: row.overall_score as number }));

    for (const row of source) {
      const dt = new Date(row.created_at);
      if (Number.isNaN(dt.getTime())) continue;
      const key = getBucketKeyByDate(row.created_at, bucketByWeek);
      if (!key) continue;
      const label = dt.toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' });
      const existing = buckets.get(key);
      if (existing) {
        existing.sum += row.value;
        existing.count += 1;
      } else {
        buckets.set(key, { ts: new Date(key).getTime(), label, sum: row.value, count: 1 });
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
  }, [mode, periodFilter, scopedAssessments, scopedVoice]);

  const streakDays = useMemo(() => {
    const allDates = new Set<string>();
    for (const row of data.completions) {
      allDates.add(new Date(row.completed_at).toISOString().slice(0, 10));
    }
    for (const row of data.voiceAttempts) {
      allDates.add(new Date(row.created_at).toISOString().slice(0, 10));
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
  }, [data.completions, data.voiceAttempts]);

  const bestScore = useMemo(() => {
    if (mode === 'voice') {
      const values = scopedVoice.map((row) => row.coveragePct).filter((v): v is number => typeof v === 'number');
      return values.length ? Math.max(...values) / 10 : null;
    }
    const scores = scopedAssessments.map((row) => row.overall_score).filter((v): v is number => typeof v === 'number');
    return scores.length ? Math.max(...scores) : null;
  }, [mode, scopedAssessments, scopedVoice]);

  const criteriaOverview = useMemo(() => {
    const sorted = [...scopedAssessments].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const mid = Math.floor(sorted.length / 2);
    return ZH_CRITERIA_KEYS.map((key) => {
      const vals = sorted
        .map((row) => row.criteria_scores?.[key])
        .filter((v): v is number => typeof v === 'number');
      const samples = vals.length;
      const mean = samples > 0 ? vals.reduce((a, b) => a + b, 0) / samples : 0;
      const prevVals = sorted
        .slice(0, mid)
        .map((row) => row.criteria_scores?.[key])
        .filter((v): v is number => typeof v === 'number');
      const nextVals = sorted
        .slice(mid)
        .map((row) => row.criteria_scores?.[key])
        .filter((v): v is number => typeof v === 'number');
      const prevAvg = prevVals.length ? prevVals.reduce((a, b) => a + b, 0) / prevVals.length : 0;
      const nextAvg = nextVals.length ? nextVals.reduce((a, b) => a + b, 0) / nextVals.length : 0;
      return {
        key,
        label: getZhCriteriaLabel(key),
        value: Math.round(mean * 10) / 10,
        min: samples ? Math.round(Math.min(...vals) * 10) / 10 : null,
        max: samples ? Math.round(Math.max(...vals) * 10) / 10 : null,
        samples,
        delta: nextVals.length && prevVals.length ? Math.round((nextAvg - prevAvg) * 10) / 10 : 0,
      };
    });
  }, [scopedAssessments]);

  const weakestCriterionKey = useMemo(() => {
    const valid = criteriaOverview.filter((item) => item.value > 0);
    if (valid.length === 0) return null;
    return valid.reduce((min, cur) => (cur.value < min.value ? cur : min)).key as ZhCriteriaKey;
  }, [criteriaOverview]);

  const recentSessions = useMemo((): RecentSessionRow[] => {
    if (mode === 'voice') {
      return scopedVoice
        .map((row) => ({
          id: row.id,
          rowMode: 'voice' as const,
          title: row.hsk_level ? `${row.title} · HSK ${row.hsk_level}` : row.title,
          completedAt: row.created_at,
          score: row.coveragePct,
          scoreScale: 100 as const,
          scoreLabel: row.verdict ? zhVoiceTaskVerdictLabel(row.verdict) : undefined,
          objectKey: row.task_id ? `vt:${row.task_id}` : `vt:${row.id}`,
          completionId: row.id,
        }))
        .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
    }
    return scopedCompletions
      .map((row) => {
        const assessment = assessmentByCompletionId.get(row.id);
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
  }, [mode, scopedCompletions, scopedVoice, assessmentByCompletionId]);

  const activeCriterionKey = selectedCriterionKey ?? weakestCriterionKey;

  const coachFocusRows = useMemo((): RecommendRow[] => {
    if (mode === 'voice') {
      return scopedVoice
        .filter((row) => row.verdict === 'missed' || row.verdict === 'almost')
        .map((row) => ({
          id: row.id,
          rowMode: 'voice' as const,
          title: row.title,
          completedAt: row.created_at,
          score: row.coveragePct,
          criterionScore: row.coveragePct ?? 0,
          objectKey: row.task_id ? `vt:${row.task_id}` : `vt:${row.id}`,
          completionId: row.id,
          reasonText:
            row.verdict === 'missed'
              ? 'Чеклист почти не закрыт. Повторите ту же минутке с опорой на эталон.'
              : 'Часть пунктов закрыта частично. Повторите, чтобы довести до «сделано».',
          priority: (row.verdict === 'missed' ? 'high' : 'medium') as RecommendRow['priority'],
        }))
        .sort((a, b) => a.criterionScore - b.criterionScore)
        .slice(0, 8);
    }
    if (!activeCriterionKey) return [];
    return recentSessions
      .map((row) => {
        const assessment = assessmentByCompletionId.get(row.completionId);
        const criterionScore = assessment?.criteria_scores?.[activeCriterionKey] ?? null;
        return {
          ...row,
          rowMode: 'roleplay' as const,
          criterionScore: criterionScore ?? 0,
          reasonText:
            (criterionScore ?? 0) <= 4.5
              ? 'Критерий заметно проседает. Повторение даст максимальный прирост.'
              : (criterionScore ?? 0) <= 6.5
                ? 'Критерий ниже целевого уровня. Нужна закрепляющая практика.'
                : 'Полезно повторить для стабилизации навыка.',
          priority:
            (criterionScore ?? 0) <= 4.5 ? 'high' : (criterionScore ?? 0) <= 6.5 ? 'medium' : 'low',
        } as RecommendRow;
      })
      .filter((row) => row.criterionScore > 0)
      .sort((a, b) => a.criterionScore - b.criterionScore)
      .slice(0, 8);
  }, [mode, scopedVoice, activeCriterionKey, recentSessions, assessmentByCompletionId]);

  const sessionsCount = mode === 'voice' ? scopedVoice.length : scopedCompletions.length;
  const hasNoData = sessionsCount === 0;
  const heroAvg =
    mode === 'voice' ? (voiceCoverageAvg != null ? Math.round(voiceCoverageAvg) / 10 : null) : overviewAvgScore;

  const openFocusForObject = (objectKey: string, attemptId?: string) => {
    const params = new URLSearchParams();
    params.set('tab', 'progress');
    params.set('period', periodFilter);
    params.set('mode', mode);
    params.set('view', progressView);
    if (attemptId) params.set('attempt', attemptId);
    router.push(`/dashboard/progress/focus/${encodeURIComponent(objectKey)}?${params.toString()}`);
  };

  const resetFilters = () => {
    setPeriodFilter('30d');
    setMode('roleplay');
    setProgressView('system');
    setSelectedCriterionKey(null);
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
        onModeChange={(next) => setMode(next === 'debate' ? 'roleplay' : next)}
        progressView={progressView}
        onProgressViewChange={setProgressView}
        roleplayCount={periodCompletions.filter((row) => (progressView === 'system' ? row.source === 'system' : row.source === 'user')).length}
        voiceCount={periodVoice.filter((row) => (progressView === 'system' ? row.source === 'system' : row.source === 'user')).length}
        systemCount={
          mode === 'voice'
            ? periodVoice.filter((row) => row.source === 'system').length
            : periodCompletions.filter((row) => row.source === 'system').length
        }
        personalCount={
          mode === 'voice'
            ? periodVoice.filter((row) => row.source === 'user').length
            : periodCompletions.filter((row) => row.source === 'user').length
        }
        availableModes={['roleplay', 'voice']}
        roleplayLabel="Сценарии"
        voiceLabel="Минутки"
      />

      {hasNoData && (
        <section className={styles.emptyState}>
          <h3 className={styles.emptyTitle}>Нет данных для выбранных фильтров</h3>
          <p className={styles.emptyDescription}>
            Пройдите ситуативный диалог или голосовую минутку — прогресс появится здесь.
          </p>
          <button type="button" onClick={resetFilters} className={styles.btn} style={{ marginTop: '0.65rem' }}>
            Сбросить фильтры
          </button>
        </section>
      )}

      <ProgressHero
        periodFilter={periodFilter}
        avgScore={heroAvg}
        sessionsCount={sessionsCount}
        trendPoints={trendPoints}
        selectedTrendKey={selectedTrendKey}
        onTrendPointClick={setSelectedTrendKey}
        weakestCriterionLabel={
          mode === 'voice'
            ? voiceDoneRate != null
              ? `сделано ${voiceDoneRate}%`
              : null
            : activeCriterionKey
              ? getZhCriteriaLabel(activeCriterionKey)
              : null
        }
        streakDays={streakDays}
      />

      <KpiCards
        avgScore={mode === 'voice' ? (voiceCoverageAvg != null ? voiceCoverageAvg / 10 : null) : overviewAvgScore}
        sessionsCount={sessionsCount}
        bestScore={bestScore}
        avgScoreSparkline={trendPoints.map((p) => p.value)}
        sessionsSparkline={trendPoints.map((p) => p.count)}
        avgScoreDelta={null}
        sessionsDelta={null}
      />

      {mode === 'roleplay' && (
        <CriteriaOverview
          criteria={criteriaOverview}
          selectedCriterionKey={selectedCriterionKey}
          onCriterionSelect={(key) => setSelectedCriterionKey((key as ZhCriteriaKey) || null)}
        />
      )}

      {mode === 'voice' && (
        <section className={styles.card}>
          <h3 className={styles.sectionTitle}>Покрытие чеклиста</h3>
          <p className={styles.sectionHint} style={{ marginTop: '0.5rem' }}>
            Голосовые минутки оцениваются по смыслу пунктов, без баллов за произношение.
            {voiceDoneRate != null ? ` Сделано полностью: ${voiceDoneRate}%.` : ''}
            {voiceCoverageAvg != null ? ` Среднее покрытие: ${Math.round(voiceCoverageAvg)}%.` : ''}
          </p>
        </section>
      )}

      <RecentSessions sessions={recentSessions} limit={5} onOpenFocus={openFocusForObject} />

      <RecommendedScenarios
        weakestCriterionKey={mode === 'voice' ? 'coverage' : activeCriterionKey}
        rows={coachFocusRows}
        onOpenFocus={openFocusForObject}
        onStartPractice={(objectKey) => router.push(`/dashboard?tab=agent&from=progress&target=${encodeURIComponent(objectKey)}`)}
        criterionLabelPrefix={mode === 'voice' ? 'Фокус минуток' : selectedCriterionKey ? 'Фокус-критерий' : 'Слабый критерий'}
        criterionLabel={mode === 'voice' ? 'покрытие чеклиста' : activeCriterionKey ? getZhCriteriaLabel(activeCriterionKey) : undefined}
      />
    </div>
  );
}

