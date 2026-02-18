# Progress Dashboard Data Contract v1

## Stage
- `Stage 3` (data contracts + aggregations)

## Scope
- Covers all widgets defined in `docs/progress-dashboard-wireframes-v1.md`.
- Uses existing data model only.
- No new scoring logic.

## Global Filter Contract

## Filter Input
- `period`: `7d | 30d | 90d | all`
- `mode`: `all | roleplay | debate`
- `content_type`: `all | system | personal`
- `level`: optional
  - roleplay: `A1|A2|B1|B2|C1|easy|medium|hard`
  - debate: `easy|medium|hard`

## Filter Semantics
- `period` applies by event timestamp:
  - roleplay: `roleplay_completions.completed_at`
  - debate: `debate_completions.completed_at`
  - speaking assessments: `speaking_assessments.created_at`
  - vocabulary due-now uses current time comparison (`next_review_at <= now`)
- `mode`:
  - roleplay widgets use roleplay sources
  - debate widgets use debate sources
  - all mode merges both where meaningful
- `content_type`:
  - roleplay: `isUserScenarioId(scenario_id)` split
  - debate: system if topic exists in catalog; else personal
- `level`:
  - roleplay filter by `scenario_level` where present
  - debate filter by `difficulty`

## Time Bucketing
- `7d`, `30d`: bucket by day
- `90d`, `all`: bucket by week (ISO week)

## Canonical Domain Models

## SessionCompletion
- `id: string`
- `mode: 'roleplay' | 'debate'`
- `title: string`
- `is_system: boolean`
- `level_or_difficulty: string | null`
- `completed_at: string`
- `completed_step_ids: string[]`
- `assessment_id: string | null`

## SessionAssessment
- `id: string`
- `mode: 'roleplay' | 'debate' | 'unknown'`
- `overall_score: number | null`
- `criteria_scores: { fluency, vocabulary_grammar, pronunciation, completeness, dialogue_skills } | null`
- `feedback: object | null`
- `goal_attainment: GoalAttainmentItem[]`
- `created_at: string`

## VocabularyItem
- `word: string`
- `mastery_level: number | null`
- `next_review_at: string | null`
- `times_practiced: number | null`
- `review_count: number | null`
- `last_review_score: number | null`

## Source Queries (Primary)

1. Roleplay completions
- Table: `roleplay_completions`
- Fields:
  - `id, scenario_id, scenario_title, scenario_level, completed_at, feedback, useful_phrase_en, useful_phrase_ru, completed_step_ids`

2. Debate completions
- Table: `debate_completions`
- Fields:
  - `id, topic, topic_ru, difficulty, completed_at, completed_step_ids, micro_goals, feedback_json, assessment_id, debate_session_id`
- Legacy fallback:
  - if table unavailable, use `debate_sessions` (existing behavior in `ProgressTab`)

3. Speaking assessments
- Table: `speaking_assessments`
- Fields:
  - `id, scenario_id, overall_score, criteria_scores, feedback, created_at, format, agent_session_id, user_messages`

4. Vocabulary user data
- Table: `user_vocabulary`
- Fields:
  - `id, word, mastery_level, next_review_at, times_practiced, difficulty_level, last_reviewed_at`

5. Vocabulary progress
- Table: `vocabulary_progress`
- Fields:
  - `word, review_count, last_review_score, consecutive_correct, consecutive_incorrect, next_review_at`

6. Lazy detail fetch (only on drill-down open)
- `agent_sessions.messages`
- `debate_sessions.messages`
- `debate_sessions.feedback`

## Optional Source (Fallback/Optimization)
- `/api/vocabulary/list` and returned `stats` may be reused if direct table policy/grants are inconsistent.

## Assessment-to-Mode Mapping Rules

1. Debate assessment linkage (primary)
- If `debate_completions.assessment_id` points to assessment -> mode is debate.

2. Debate assessment linkage (secondary)
- If `speaking_assessments.format = 'debate'` and no explicit completion link -> treat as debate standalone assessment.

3. Roleplay assessment
- Assessment with non-null `scenario_id` not already linked to debate completion.

4. Unknown
- If no reliable mapping, exclude from mode-specific charts and keep for raw audit only.

## Widget Contracts

## W1: KPI Avg Score
- Inputs:
  - filtered assessments with numeric `overall_score`
- Transform:
  - arithmetic mean
  - rounded to 1 decimal
- Delta:
  - compare current period mean vs previous period mean of equal length
- Empty:
  - `null` -> show `—`

## W2: KPI Sessions Count
- Inputs:
  - filtered completions (`roleplay_completions`, `debate_completions`)
- Transform:
  - count rows

## W3: KPI Goal Attainment Rate
- Inputs:
  - filtered assessments feedback `goal_attainment[]`
- Transform:
  - denominator: total goal items across assessments where array exists
  - numerator: items with `achieved === true`
  - rate = numerator / denominator
- Empty:
  - if denominator `0`, show `N/A`

## W4: KPI Steps Completion Rate
- Inputs:
  - filtered completions + expected steps count
- Expected steps count:
  - roleplay system scenarios: from local scenario definitions
  - roleplay personal scenarios: from scenario payload if available; otherwise excluded
  - debate: from `getDebateStepsByDifficulty(difficulty)`
- Transform:
  - per session rate = completed_steps / expected_steps
  - global rate = mean of per-session rates (sessions with expected_steps > 0)
- Empty:
  - no eligible sessions -> `N/A`

## W5: KPI Words Due Now
- Inputs:
  - `user_vocabulary.next_review_at`
- Transform:
  - count where `next_review_at != null && next_review_at <= now`

## W6: Overall Trend Line
- Inputs:
  - filtered assessments with `overall_score`
- Transform:
  - bucket by day/week per time-bucket rule
  - y = average score per bucket
  - include `count` per point for tooltip
- Drill-down:
  - click point -> open session list for that bucket

## W7: Criteria Radar
- Inputs:
  - filtered assessments with `criteria_scores`
- Transform:
  - average each of 5 criteria
  - keep fixed axis order:
    - fluency
    - vocabulary_grammar
    - pronunciation
    - completeness
    - dialogue_skills

## W8: Activity Heatmap
- Inputs:
  - filtered completions
- Transform:
  - count completions per calendar day
  - intensity by quantiles or max-normalized scale
- Optional extension:
  - overlay vocabulary reviews count (phase 2+)

## W9: Vocabulary Mastery Panel
- Inputs:
  - user vocabulary items
- Transform:
  - distribution by `mastery_level` 1..5
  - due-now count
  - avg `last_review_score` from joined progress rows where present

## W10: Steps Quality Chart
- Inputs:
  - filtered completions + step catalogs
- Transform:
  - for each step id:
    - attempts = sessions where this step was expected
    - done = sessions where `completed_step_ids` contains step id
    - completion_rate = done / attempts
- Output:
  - sorted by step order, show worst-first toggle

## W11: Goals Board
- Inputs:
  - assessments `goal_attainment`
  - debate `micro_goals` and `feedback_json` (when available)
- Transform:
  - achieved/missed counts
  - top missed goal labels
  - attach evidence/suggestion when present
- Rule:
  - if only micro-goal selection exists without attainment evidence, show as "configured goals", not "failed"

## W12: Session Timeline
- Inputs:
  - merged filtered completions (roleplay + debate)
- Transform:
  - sort by completion time desc
  - join assessment summary where linked
- Row output:
  - datetime
  - mode
  - title/topic
  - score (if available)
  - step progress badge
  - actions

## Join Rules

1. Roleplay completion -> assessment
- Match by `scenario_id` and nearest prior/equal `created_at` when multiple exist.
- Current behavior uses latest by `scenario_id`; keep this as v1 baseline.

2. Debate completion -> assessment
- Direct join by `assessment_id` (authoritative).

3. Vocabulary join
- Join `user_vocabulary.word` to `vocabulary_progress.word` for same user.

## Data Quality Rules

1. Score bounds
- clamp criteria and overall display values to `[1,10]` only for rendering safety.

2. Malformed arrays
- if `completed_step_ids`, `goal_attainment`, `micro_goals` are non-array -> treat as empty.

3. Missing labels
- fallback labels:
  - scenario title -> `scenario_id`
  - debate topic_ru -> `topic`

4. Duplicates
- use completion `id` as unique row key.

## Performance Contract

1. Initial load target
- max 5 primary queries in parallel.

2. Row limits
- start with `limit 500` for completions and assessments (current behavior).
- if needed, introduce period-based query slicing in stage 7.

3. Lazy heavy data
- do not fetch full dialogs in initial load.
- fetch dialogs only when detail panel opens.

## Derived Selectors API (Frontend)

1. `selectOverviewKpis(state, filters) -> OverviewKpis`
2. `selectScoreTrend(state, filters) -> TrendSeries[]`
3. `selectCriteriaRadar(state, filters) -> RadarModel`
4. `selectActivityHeatmap(state, filters) -> HeatmapCell[]`
5. `selectVocabularySummary(state, filters) -> VocabularySummary`
6. `selectStepsQuality(state, filters) -> StepQualityRow[]`
7. `selectGoalsBoard(state, filters) -> GoalsSummary`
8. `selectSessionTimeline(state, filters) -> SessionTimelineRow[]`

## Stage 3 Exit Criteria
- Every widget has:
  - explicit source fields
  - explicit transform formula
  - explicit empty/error behavior
- Join/mapping rules are frozen.
- Ready for `Stage 4` UI shell implementation.

