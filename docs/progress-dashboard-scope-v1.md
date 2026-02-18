# Progress Dashboard Scope v1

## Stage
- `Stage 0` (requirements freeze)

## Goal
- Convert current `ProgressTab` into a full product-grade progress dashboard.
- Use existing assessment and progress data only.
- Do not introduce new scoring methods or new evaluation logic.

## Product Constraints
- Keep current scoring system unchanged:
  - speaking criteria (`fluency`, `vocabulary_grammar`, `pronunciation`, `completeness`, `dialogue_skills`)
  - `overall_score`
  - `goal_attainment`
  - debate SBI feedback blocks
  - roleplay/debate completed steps
  - vocabulary mastery/review data
- v1 should work without mandatory backend schema changes.
- v1 should keep support for both system and personal content.

## Confirmed Data Sources
- `speaking_assessments`
  - `overall_score`, `criteria_scores`, `feedback`, `format`, `created_at`, `scenario_id`, `agent_session_id`
- `roleplay_completions`
  - `scenario_id`, `scenario_title`, `scenario_level`, `completed_at`, `completed_step_ids`, `feedback`, `useful_phrase_*`
- `debate_completions`
  - `topic`, `topic_ru`, `difficulty`, `completed_step_ids`, `micro_goals`, `feedback_json`, `assessment_id`, `completed_at`
- `vocabulary_progress` + `user_vocabulary`
  - `review_count`, `last_review_score`, `consecutive_correct`, `consecutive_incorrect`, `next_review_at`, `mastery_level`, `times_practiced`, `last_reviewed_at`

## In Scope (v1)
- Unified dashboard layout with 3 levels:
  - quick overview
  - trends and weaknesses
  - drill-down to session details
- Global filters:
  - period (`7d`, `30d`, `90d`, `all`)
  - mode (`roleplay`, `debate`, `all`)
  - content type (`system`, `personal`)
  - level/difficulty (where applicable)
- Visual blocks:
  - KPI cards
  - overall score trend chart
  - criteria radar chart
  - activity heatmap
  - step completion chart (roleplay/debate)
  - vocabulary mastery and due-review chart
- Drill-down UX:
  - click from chart point to session
  - open assessment, feedback, and dialog history
  - open steps status for selected completion
- Full states:
  - loading/skeleton
  - empty
  - error with retry
- Responsive behavior:
  - desktop and mobile-first ordering for cards/charts/details

## Out of Scope (v1)
- New evaluation metrics or new rubric criteria.
- Changes to AI prompts/evaluation prompts in backend.
- New gamification systems (XP, badges, leagues) as mandatory core.
- External BI/reporting export as part of initial release.

## UX Quality Bar (Definition of Done for v1)
- User can understand current level in under 5 seconds (overview row).
- User can identify weakest skill and open supporting sessions in 1-2 clicks.
- User can filter by period/mode and all widgets update consistently.
- No dead-end states (every empty state has a clear next action).
- Mobile version remains usable without horizontal overflow in core blocks.

## Delivery Stages (Gate-based)
- Stage 0: scope freeze (this document)
- Stage 1: IA + UX flow
- Stage 2: wireframes (desktop/mobile + states)
- Stage 3: data contracts and aggregations
- Stage 4: layout and filter shell in code
- Stage 5: charts and visual analytics
- Stage 6: drill-down interactions
- Stage 7: polish (a11y/perf/states/mobile)
- Stage 8: QA and release readiness

## Notes
- `vocabulary_progress.learning_status` has been removed in migrations; v1 should use current fields and avoid relying on this legacy column.
