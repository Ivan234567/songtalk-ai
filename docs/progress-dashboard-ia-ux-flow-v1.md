# Progress Dashboard IA + UX Flow v1

## Stage
- `Stage 1` (information architecture and user flows)

## Input Constraints
- Reuse existing scoring and progress system.
- No new evaluation logic.
- Build UX around current entities:
  - `speaking_assessments`
  - `roleplay_completions`
  - `debate_completions`
  - `user_vocabulary` + `vocabulary_progress`

## UX Objective
- Turn the current "history-like progress list" into a real dashboard.
- Help user answer 3 questions quickly:
  - "How am I doing now?"
  - "What exactly is weak?"
  - "What should I do next?"

## Core User Jobs
1. See current level in 5 seconds.
2. Detect weakest speaking criterion and open evidence sessions.
3. Track trends over time, not only latest result.
4. Understand step/goal completion quality (not only score).
5. See vocabulary readiness (mastery + due reviews).

## IA Model (3 Levels)
1. `Overview` (snapshot, high signal)
2. `Analytics` (trends, distributions, weak zones)
3. `Details` (session-level drill-down with dialogue and feedback)

## Page Structure (Desktop)
1. Sticky Header Filters
  - period: `7d | 30d | 90d | all`
  - mode: `all | roleplay | debate`
  - content: `all | system | personal`
  - level/difficulty (contextual)
2. Row A: Overview Cards
  - avg overall score
  - sessions count
  - goal attainment rate
  - steps completion rate
  - words due now
3. Row B: Main Analytics (2 columns)
  - left: overall score trend (line)
  - right: criteria profile (radar)
4. Row C: Secondary Analytics (2 columns)
  - left: activity heatmap
  - right: vocabulary mastery distribution
5. Row D: Execution Quality
  - steps chart (roleplay/debate completion by step id)
  - micro-goals / goal attainment board
6. Row E: Session Timeline
  - recent sessions list/table with quick actions:
    - open assessment
    - open dialog
    - open steps map

## Mobile Structure
1. Filters (horizontal chips, sticky).
2. KPI cards (horizontal scroll).
3. Trend chart.
4. Radar chart.
5. Activity heatmap.
6. Vocabulary block.
7. Steps and goals.
8. Recent sessions.

## Global Filter Behavior
1. All widgets share one filter state.
2. Any filter change updates all widgets in one pass.
3. Level filter appears only when relevant:
  - roleplay: scenario level
  - debate: difficulty
4. If filter yields empty result:
  - show focused empty state with "reset filters" action.

## Drill-down Interaction Model
1. Chart point click -> open Session Detail panel.
2. Session row click -> same Session Detail panel.
3. Session Detail tabs:
  - assessment
  - feedback
  - dialog
  - steps/goals
4. Keep user context:
  - filters stay unchanged
  - return scroll position preserved

## Session Detail Content
1. Header:
  - session title/topic
  - mode
  - date/time
  - score badge
2. Assessment tab:
  - overall score
  - criteria bars
  - summary/strengths/improvements
3. Feedback tab:
  - roleplay short feedback or debate SBI blocks
  - next-try phrase
4. Dialog tab:
  - user/assistant messages
5. Steps/Goals tab:
  - completed_step_ids map
  - goal attainment / micro-goals (if available)

## UX Decisions to Stabilize
1. Use one primary detail pattern:
  - desktop: right side panel
  - mobile: bottom sheet/fullscreen sheet
2. Keep modal count minimal.
3. Reduce action duplication in cards/lists.
4. Prefer readable defaults over dense analyst layout.

## Visual Hierarchy Rules
1. KPI row must be first visual anchor.
2. Trend and radar are primary analytical surfaces.
3. Execution quality blocks are secondary.
4. Session timeline is tertiary but always accessible.

## State Design
1. `loading`:
  - skeleton cards + skeleton charts.
2. `empty`:
  - explanation by filter scope + CTA.
3. `error`:
  - concise message + retry.
4. `partial data`:
  - per-widget fallback, not whole-page failure.

## Accessibility Rules
1. Keyboard navigation for filters, charts focus points, session list.
2. Clear aria labels for all interactive chart points and icons.
3. Color is not the sole carrier of meaning (labels + values required).
4. Minimum contrast for cards/charts/tooltips.

## Microcopy Rules
1. Short, concrete labels.
2. Avoid jargon-only wording.
3. "What to do next" text should be action-oriented.
4. Keep language consistent with existing app locale behavior.

## Interaction Flows

### Flow A: 5-second status check
1. User opens Progress Dashboard.
2. Sees KPI cards + trend direction.
3. Understands current performance and activity immediately.

### Flow B: Weak-skill diagnosis
1. User checks radar and finds weakest criterion.
2. Clicks criterion or low-scoring trend point.
3. Opens session detail and reads evidence in feedback/dialog.

### Flow C: Execution quality check
1. User opens steps chart.
2. Sees which steps fail most often.
3. Opens affected sessions and reviews steps map.

### Flow D: Vocabulary readiness
1. User checks due words and mastery distribution.
2. Understands backlog pressure and practice readiness.

## Component Map (Implementation-Oriented)
1. `ProgressDashboardShell`
2. `ProgressGlobalFilters`
3. `ProgressOverviewCards`
4. `ProgressTrendChart`
5. `ProgressCriteriaRadar`
6. `ProgressActivityHeatmap`
7. `ProgressVocabularyPanel`
8. `ProgressStepsQualityPanel`
9. `ProgressSessionTimeline`
10. `ProgressSessionDetailPanel`

## Analytics Events (Optional but Recommended)
1. `progress_filter_changed`
2. `progress_widget_opened`
3. `progress_session_opened`
4. `progress_detail_tab_changed`

## Stage 1 Exit Criteria
1. IA blocks and order are frozen.
2. Drill-down pattern is selected.
3. Global filter behavior is frozen.
4. Desktop and mobile section order is frozen.
5. Ready to move to wireframes without data ambiguity.

