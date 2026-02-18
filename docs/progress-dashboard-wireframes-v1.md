# Progress Focus Screen Plan v3

## Status
- Track switched from side panel to dedicated focus page.
- Current stage: `Stage 5` completed (comparator + timeline markers + dialog drilldown + polish).
- Rule: before each next stage, ask user approval.
- Next gate: ask user approval before `Stage 6` implementation.

## Goal
- Build a dedicated analytics screen for one selected object (scenario or debate).
- Keep dashboard as overview entry point.
- Provide dense but readable interactive tools for deep progress analysis.

## Entry and Navigation Flow

### Primary Entry
1. User opens dashboard `/dashboard/progress`.
2. User selects object in `Object Explorer` or clicks `Р Р°Р·Р±РѕСЂ` in timeline.
3. App navigates to focus route:
   - `/dashboard/progress/focus/[objectKey]?period=30d&mode=roleplay&view=system`

### Direct Attempt Entry
1. If user clicked from a concrete attempt:
   - add `attempt=<attemptId>` query.
2. Focus page opens with that attempt selected by default.

### Back Navigation
1. Top-left action: `РќР°Р·Р°Рґ Рє РґР°С€Р±РѕСЂРґСѓ`.
2. Return must restore:
   - period/mode/view filters
   - scroll position in dashboard
   - selected trend bucket (if present)

### URL Contract
```txt
/dashboard/progress/focus/[objectKey]
  ?period=7d|30d|90d|all
  &mode=roleplay|debate
  &view=system|personal
  &attempt=<attemptId>
  &from=progress
```

## Screen Information Architecture (Focus Page)

### A. Header Strip
- Left:
  - Back to dashboard.
  - Object title.
  - Meta chips: type, level/difficulty, attempts.
- Right:
  - Quick actions: `Open Dialog`, `Open Assessment`, `Open Steps`, `Start New Attempt`.

### B. Summary Band
- KPI cards:
  - Current score.
  - Average score.
  - Best score.
  - Step completion.
- Delta indicators:
  - vs previous attempt.
  - vs object average.

### C. Interactive Analytics Grid
1. `Score Trend` (line chart, attempts over time).
2. `Criteria Breakdown` (radar + comparison bars).
3. `Criteria Heatmap` (criteria x attempts matrix).
4. `Step Matrix` (step completion per attempt).
5. `Goal Grid` (goal attainment per attempt, deep only).
6. `Attempt Comparator` (A/B compare two attempts).

### D. Operational Drilldown
1. `Session Timeline` with event markers.
2. `Dialogue Drilldown` with focus anchors.
3. `Actionable Guidance` block:
  - weakest criterion now
  - best next step
  - one concrete recommendation for next run

## Instrument Definitions

### 1) Score Trend
- X axis: attempts (or dates).
- Y axis: overall score 0..10.
- Interactions:
  - click point -> select attempt globally.
  - drag range (desktop) -> filter visible attempts.
  - tooltip: date, score, step completion.

### 2) Criteria Breakdown
- Radar: selected attempt criteria.
- Bars: selected vs average vs best.
- Toggle:
  - `absolute` values.
  - `delta` to average.

### 3) Criteria Heatmap
- Rows: criteria.
- Columns: attempts.
- Cell color: score intensity.
- Interactions:
  - click cell -> select attempt and pin criterion.

### 4) Step Matrix
- Rows: scenario/debate steps.
- Columns: attempts.
- Cell states: completed/missed/not-applicable.
- Interactions:
  - click step row -> filter attempts where step missed.

### 5) Goal Grid (deep only)
- Rows: goals from assessment goal_attainment.
- Columns: attempts.
- Cell states: achieved/not achieved/no data.
- Side panel inside block:
  - evidence
  - suggestion
  - quick "what to improve next"

### 6) Attempt Comparator
- Select `Attempt A` and `Attempt B`.
- Show:
  - score delta
  - criteria deltas
  - steps delta
  - goals delta

### 7) Session Timeline
- Vertical timeline with markers:
  - best score
  - first full-step completion
  - biggest score drop
- Click marker -> jump attempt selection.

### 8) Dialogue Drilldown
- Message stream for selected attempt.
- Highlights:
  - weak criterion moments
  - goal evidence excerpts
  - quick jump anchors from other charts.

## Cross-Widget Interaction Contract
1. Attempt selection is global state for focus page.
2. Any widget can update selected attempt.
3. When selected attempt changes:
  - summary band updates
  - radar updates
  - step/goal/dialog blocks update
4. Comparator state is independent and does not override global selected attempt.

## Adaptive Layout

### Desktop (`>=1280`)
- 12-column grid.
- Hero + summary full width.
- Analytics in 2-column panels.
- Comparator and dialog sections span full width.

### Tablet (`768-1279`)
- 8-column grid.
- One large chart per row.
- Comparator becomes collapsible card.

### Mobile (`<768`)
- Single column.
- Sticky top controls:
  - attempt selector
  - chart selector tabs
- Heatmap and matrix become horizontally scrollable blocks with fixed row labels.

## States
- Loading:
  - page skeleton sections.
- Empty:
  - no attempts for selected object.
- Partial:
  - attempts exist, but no assessments/goals for some attempts.
- Error:
  - inline retry per block + full page retry.

## Accessibility Requirements
- All charts have textual fallback summaries.
- Keyboard navigation for attempt points/cells.
- `aria-live="polite"` for attempt change summaries.
- Focus trap only in modal actions, not on full page.

## Stage 2 Data Contracts (Completed)

### 2.1 Source Data Matrix

1. `roleplay_completions` (base attempts for roleplay):
   - `id`, `user_id`, `scenario_id`, `scenario_title`, `scenario_level`, `completed_at`
   - `completed_step_ids`, `feedback`, `useful_phrase_en`, `useful_phrase_ru`
2. `debate_completions` (base attempts for debate):
   - `id`, `user_id`, `topic`, `topic_ru`, `difficulty`, `user_position`, `ai_position`, `completed_at`
   - `completed_step_ids`, `step_schema_version`, `micro_goals`, `feedback_json`, `feedback`
   - `assessment_id`, `debate_session_id`
   - topic metadata: `topic_source`, `topic_original`, `topic_normalized`, `topic_language`, `topic_validation_status`
3. `speaking_assessments` (score and criteria payload):
   - `id`, `user_id`, `scenario_id`, `scenario_title`, `format`, `created_at`
   - `overall_score`, `criteria_scores`, `feedback`, `user_messages`, `agent_session_id`
4. `debate_sessions` (fallback and dialog source):
   - `id`, `user_id`, `topic`, `messages`, `created_at`, `updated_at`
   - `completed_step_ids`, `difficulty`, `feedback`, `assessment_id`
   - topic metadata: `topic_source`, `topic_original`, `topic_normalized`, `topic_language`, `topic_validation_status`
5. Local catalogs (object metadata and step schema):
   - Roleplay catalog: `frontend/data/roleplay-scenarios.json` via `frontend/lib/roleplay.ts`
   - Debate catalog: `frontend/lib/debate-topics.ts`, `frontend/lib/debate.ts` (steps by difficulty)
   - Personal catalogs: `user_roleplay_scenarios`, `user_debate_topics`

### 2.2 Canonical Models

```ts
type FocusMode = 'roleplay' | 'debate';
type FocusScope = 'system' | 'personal';

type FocusObjectModel = {
  objectKey: string; // rp:<scenarioId> | db:<topicNormalized>
  mode: FocusMode;
  scope: FocusScope;
  title: string;
  subtitle: string | null;
  levelOrDifficulty: string | null;
  stepSchemaVersion: string | null;
  attempts: FocusAttemptModel[];
  stats: {
    avgScore: number | null;
    bestScore: number | null;
    latestScore: number | null;
    avgStepCompletionPct: number | null;
    attemptsCount: number;
  };
};

type FocusAttemptModel = {
  attemptId: string;
  completedAt: string;
  assessmentId: string | null;
  overallScore: number | null;
  criteriaScores: Record<string, number> | null;
  steps: Array<{ id: string; title: string; completed: boolean }>;
  stepCompletionPct: number | null;
  goalAttainment: Array<{
    goal_id: string;
    goal_label?: string;
    achieved: boolean;
    evidence?: string;
    suggestion?: string;
  }>;
  feedbackShort: string | null;
  links: {
    scenarioId: string | null;
    debateSessionId: string | null;
    agentSessionId: string | null;
  };
};
```

### 2.3 Instrument DTOs

```ts
type ScoreTrendPoint = {
  attemptId: string;
  completedAt: string;
  bucketKey: string;
  score: number | null;
  stepCompletionPct: number | null;
};

type CriteriaHeatmapCell = {
  attemptId: string;
  criterionKey: string;
  value: number | null;
};

type StepMatrixRow = {
  stepId: string;
  stepTitle: string;
  values: Array<{ attemptId: string; state: 'done' | 'missed' | 'na' }>;
};

type GoalMatrixRow = {
  goalId: string;
  goalLabel: string;
  values: Array<{ attemptId: string; state: 'done' | 'missed' | 'no_data'; evidence?: string; suggestion?: string }>;
};

type ComparatorPayload = {
  attemptA: string;
  attemptB: string;
  scoreDelta: number | null;
  criteriaDelta: Record<string, number | null>;
  stepsDelta: { added: string[]; regressed: string[]; pctDelta: number | null };
  goalsDelta: { achievedDelta: number | null; totalDelta: number | null };
};

type TimelineEvent = {
  eventId: string;
  type: 'best_score' | 'first_full_steps' | 'biggest_drop';
  attemptId: string;
  value: string;
  createdAt: string;
};

type DialogAnchor = {
  anchorId: string;
  attemptId: string;
  criterionKey?: string;
  messageIndex?: number;
  snippet: string;
  source: 'goal_evidence' | 'criteria_feedback' | 'timeline_event';
};
```

### 2.4 Mapping Rules

1. Object identity:
   - roleplay: `objectKey = rp:<scenario_id>`
   - debate: `objectKey = db:<normalized_topic>`
   - `normalized_topic`: `topic_normalized` if present, else normalize(`topic_ru || topic`) by trim/lowercase/single-space
2. Roleplay attempt -> assessment linking:
   - candidate set: `speaking_assessments` where `scenario_id == completion.scenario_id`
   - choose nearest by absolute time diff between `completion.completed_at` and `assessment.created_at`
   - allowed window: `<= 48h`
   - tie-break: smaller diff first; if equal diff choose more recent `created_at`
3. Debate attempt -> assessment linking:
   - primary: `debate_completions.assessment_id`
   - secondary: `debate_sessions.assessment_id` (if completion has session id and primary missing)
   - fallback: nearest `speaking_assessments` with `format='debate'` in `<= 48h` window
4. Step schema resolution:
   - roleplay: scenario payload/catalog `steps[]`
   - debate: `getDebateStepsByDifficulty(difficulty)`; version tracked by `step_schema_version`
   - if schema missing but `completed_step_ids` exists, render synthetic rows by id
5. Goal source:
   - only from `assessment.feedback.goal_attainment`
   - if absent, deep goal widgets switch to `no_data` state (not shown in overview layer)
6. Dialogue source:
   - roleplay: `agent_sessions.messages` by `assessment.agent_session_id`, fallback to `assessment.user_messages`
   - debate: `debate_sessions.messages` by `debate_session_id`

### 2.5 Derived Metrics Formulas

1. Attempt score:
   - `attemptScore = assessment.overall_score` or `null`
2. Focus object score stats:
   - `avgScore = round1(mean(valid attemptScore))`
   - `bestScore = max(valid attemptScore)`
   - `latestScore = first attempt (desc by completedAt) with numeric score`
3. Step completion:
   - `stepCompletionPct = round((completedSteps / totalSteps) * 100)` if `totalSteps > 0`, else `null`
   - object level: `avgStepCompletionPct = round(mean(valid stepCompletionPct))`
4. Criteria aggregates (for each criterion key):
   - `current = selectedAttempt.criteria[key] ?? null`
   - `avg = round1(mean(all valid values))`
   - `min/max` over valid values
   - `deltaPrev = current - previousAttemptWithValue`
5. Goal attainment (deep layer only):
   - per attempt: `goalAchievedCount`, `goalTotalCount`
   - object level: `goalAchievedPct = round((sum achieved / sum total) * 100)` if `sum total > 0`
6. Comparator:
   - `scoreDelta = scoreB - scoreA`
   - `criteriaDelta[key] = criteriaB[key] - criteriaA[key]`
   - `stepsDelta.added = done(B) - done(A)`, `regressed = done(A) - done(B)`
   - `stepsDelta.pctDelta = stepPctB - stepPctA`
   - `goalsDelta.achievedDelta = achievedB - achievedA`
7. Timeline events:
   - `best_score`: attempt with max numeric score
   - `first_full_steps`: earliest attempt with `stepCompletionPct == 100`
   - `biggest_drop`: minimum delta between consecutive scored attempts by time

### 2.6 Fallback and Data Quality Rules

1. Missing assessment:
   - attempt remains visible in timeline/steps
   - score/criteria/goal cells show `no_data`
2. Missing or invalid `completed_step_ids`:
   - normalize to empty array
   - show hint `steps not tracked for this attempt`
3. Missing step schema:
   - build synthetic step rows from seen `completed_step_ids`
   - disable full-step milestone event
4. Missing dialog linkage:
   - roleplay fallback to `user_messages`
   - debate fallback to empty dialog state with explanation
5. Invalid JSON (`criteria_scores`, `feedback`, `feedback_json`, `micro_goals`):
   - soft parse with guard
   - on parse error, set field to `null` and log non-blocking warning
6. Date parsing failures:
   - exclude row from time-based charts
   - keep row in list and mark `timestamp_invalid`

### 2.7 Performance Constraints

1. Initial load:
   - one batched fetch per domain (`roleplay_completions`, `debate_completions`, `speaking_assessments`, optional `debate_sessions`)
   - hard cap `500` attempts per source for UI render pass
2. Transform layer:
   - all derived mappings/aggregates are memoized by filter tuple (`period`, `mode`, `view`, `objectKey`)
3. Lazy hydration:
   - dialog payloads fetched on demand when user opens dialog drilldown
4. Rendering:
   - matrices keep fixed row headers and horizontal scroll on mobile
   - comparator and drilldown blocks mount only when visible

## Stage Plan (Approval Gated)

### Stage 1 (this document)
- Deliver:
  - navigation flow
  - IA for dedicated focus screen
  - instrument set and interaction contract
- Exit:
  - approved by user

### Stage 2 (completed)
- Deliver:
  - data contracts per instrument
  - mapping and derived metrics formulas
- Exit:
  - ready for implementation without ambiguity

### Stage 3 (completed)
- Deliver:
  - route and page shell (`/dashboard/progress/focus/[objectKey]`)
  - dashboard -> focus navigation with preserved context
- Exit:
  - end-to-end navigation works

### Stage 4 (completed)
- Deliver:
  - core instruments: trend, criteria, step matrix, goal grid
- Exit:
  - deep analysis is usable for real objects

### Stage 5 (completed)
- Deliver:
  - comparator, timeline markers, dialog drilldown
  - interaction polish and performance tuning
- Exit:
  - production quality deep analytics screen

### Stage 6
- Deliver:
  - QA checklist
  - acceptance run and issue fix pass
- Exit:
  - release-ready
