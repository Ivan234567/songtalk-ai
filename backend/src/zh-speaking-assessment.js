/**
 * Промпты китайской оценки диалога и короткого коучинга после сценария.
 * Не ставить баллы за тоны и произношение по транскрипту STT.
 * Шаги сценария — единственный чеклист; цель карточки не добавляет скрытых требований.
 */

export const ZH_CRITERIA_KEYS = [
  'task_completion',
  'vocabulary',
  'grammar',
  'interaction',
  'connected_speech',
]

const INVENTED_ORIGIN_RE =
  /происхожден|откуда (человек|собеседник|она|он)|hometown|where (?:are|is) (?:you|he|she) from/i
const MISSING_STEPS_RE =
  /не выполнил|не все (ожидаемые )?шаги|ожидаемые шаги|пропустил шаг|не хватило шаг|не спросил|не задал/i

export function normalizeZhScenarioSteps(steps) {
  if (!Array.isArray(steps)) return []
  const out = []
  steps.forEach((s, i) => {
    if (!s) return
    if (typeof s === 'string') {
      const label = s.trim()
      if (label) out.push({ id: `step-${i}`, label })
      return
    }
    const id = typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `step-${i}`
    const label = (
      s.titleRu ||
      s.title_ru ||
      s.titleEn ||
      s.title_en ||
      s.title ||
      s.expectedUserAction ||
      s.expected_user_action ||
      id
    )
      .toString()
      .trim()
    if (label) out.push({ id, label })
  })
  return out
}

export function getZhStepProgress(steps, completedIds) {
  const list = normalizeZhScenarioSteps(steps)
  const doneSet = new Set(
    (Array.isArray(completedIds) ? completedIds : []).filter((id) => typeof id === 'string' && id.trim()),
  )
  const done = list.filter((s) => doneSet.has(s.id))
  const open = list.filter((s) => !doneSet.has(s.id))
  return {
    list,
    done,
    open,
    doneLabels: done.map((s) => s.label),
    openLabels: open.map((s) => s.label),
    allDone: list.length > 0 && open.length === 0,
    hasChecklist: list.length > 0,
  }
}

/** Балл «цель и шаги» только по трекеру. null — чеклиста нет, балл оставляет модель. */
export function scoreZhTaskCompletion(steps, completedIds) {
  const progress = getZhStepProgress(steps, completedIds)
  if (!progress.hasChecklist) return null
  const ratio = progress.done.length / progress.list.length
  if (ratio >= 1) return 10
  if (ratio <= 0) return 2
  return Math.max(3, Math.min(9, Math.round(ratio * 10)))
}

export function buildZhGoalAttainment(steps, completedIds) {
  const progress = getZhStepProgress(steps, completedIds)
  return progress.list.map((s) => ({
    goal_id: s.id,
    goal_label: s.label,
    achieved: progress.done.some((d) => d.id === s.id),
    evidence: '',
    suggestion: '',
  }))
}

export function buildZhStepFactBlock(steps, completedIds) {
  const progress = getZhStepProgress(steps, completedIds)
  if (!progress.hasChecklist) {
    return (
      'There is no plot checklist for this scene. Do not invent required learner steps. ' +
      'Do not require asking about origin/hometown/происхождение unless the learner was clearly trying to do that themselves.'
    )
  }
  return [
    'PLOT CHECKLIST — ground truth from the lesson tracker. This is the ONLY list of required learner steps.',
    'DONE: ' + (progress.doneLabels.join('; ') || 'none'),
    'NOT DONE: ' + (progress.openLabels.join('; ') || 'none'),
    progress.allDone
      ? 'All checklist steps are complete. You MUST NOT say they missed a step. You MUST NOT mention origin/hometown/происхождение unless that wording is already in DONE above.'
      : `The only missing steps are: ${progress.openLabels.join('; ')}. Do not invent any others.`,
    'Any scene "Goal" or description is BACKGROUND flavour, not extra required actions.',
  ].join('\n')
}

function splitRuSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function mentionsOrigin(text) {
  return INVENTED_ORIGIN_RE.test(text || '')
}

function originIsOnChecklist(labels) {
  return (labels || []).some((l) => INVENTED_ORIGIN_RE.test(l) || /откуда|родом/i.test(l))
}

function keepFeedbackLine(text, { allDone, allowOrigin }) {
  const value = String(text || '').trim()
  if (!value) return false
  if (allDone && MISSING_STEPS_RE.test(value)) return false
  if (!allowOrigin && mentionsOrigin(value)) return false
  return true
}

export function sanitizeZhTaskFeedback(feedback, steps, completedIds) {
  const progress = getZhStepProgress(steps, completedIds)
  const allowOrigin = originIsOnChecklist(progress.list.map((s) => s.label))
  const src = feedback && typeof feedback === 'object' ? feedback : {}
  const strengths = (Array.isArray(src.strengths) ? src.strengths : [])
    .map((s) => String(s || '').trim())
    .filter((s) => keepFeedbackLine(s, { allDone: progress.allDone, allowOrigin }))
  const improvements = (Array.isArray(src.improvements) ? src.improvements : [])
    .map((s) => String(s || '').trim())
    .filter((s) => keepFeedbackLine(s, { allDone: progress.allDone, allowOrigin }))
  let summary = splitRuSentences(src.summary)
    .filter((s) => keepFeedbackLine(s, { allDone: progress.allDone, allowOrigin }))
    .join(' ')
  if (!summary && progress.allDone) {
    summary = `Все шаги сценария выполнены: ${progress.doneLabels.join(', ')}.`
  } else if (!summary && progress.openLabels.length) {
    summary = `Не выполнены шаги: ${progress.openLabels.join(', ')}.`
  } else if (!summary) {
    summary = typeof src.summary === 'string' ? src.summary.trim() : ''
  }
  return {
    strengths,
    improvements,
    summary,
    useful_phrase_zh: typeof src.useful_phrase_zh === 'string' ? src.useful_phrase_zh : '',
    useful_phrase_pinyin: typeof src.useful_phrase_pinyin === 'string' ? src.useful_phrase_pinyin : '',
    useful_phrase_ru: typeof src.useful_phrase_ru === 'string' ? src.useful_phrase_ru : '',
  }
}

export function buildZhRoleplayFeedbackSystem() {
  return `You are a supportive coach for Simplified Chinese (简体中文) roleplay.
The transcript comes from speech-to-text and MAY contain wrong characters or near-homophones. Judge MEANING, not exact hanzi.

Rules:
1. Feedback in Russian: one concrete STRENGTH (what the learner actually said) + one SUGGESTION for next time.
2. Suggest ONE useful phrase in Simplified Chinese the learner can reuse in this situation. Include pinyin with tone marks and a Russian translation.
3. Do NOT comment on pronunciation, tones, Whisper, or STT.
4. Do not praise or scold personality. Stay brief.
5. The plot checklist in the user message is ground truth. Never say they missed a step that is marked DONE. Never invent extra steps (origin/hometown/происхождение) that are not on the checklist. If all steps are DONE, the suggestion must be about language, not about missing plot tasks.

Respond ONLY with valid JSON, no markdown:
{"feedback":"1-2 short Russian sentences","useful_phrase":"simplified Chinese phrase","useful_phrase_pinyin":"pinyin with tone marks","useful_phrase_ru":"Russian translation","style_note":"","rewrite_neutral":""}`
}

export function buildZhRoleplayFeedbackUserPrompt({ scenarioTitle, goal, hskLevel, userMessages, steps, completedStepIds }) {
  const hskBlock = hskLevel ? `\nHSK level of the card: ${hskLevel}. Keep the useful phrase at this HSK or easier.\n` : ''
  const stepBlock = '\n' + buildZhStepFactBlock(steps, completedStepIds) + '\n'
  return `Scenario: ${scenarioTitle || 'Chinese roleplay'}.${stepBlock}${hskBlock}
Learner's spoken lines (transcript):
${(userMessages || []).join('\n---\n')}

Return JSON only.`
}

export function buildZhAssessSpeakingSystem({ completenessGuidance = '' } = {}) {
  return `You are an expert assessor of spoken Simplified Chinese for learners (HSK-oriented).
Evaluate ONLY from the TRANSCRIPT of the learner's messages. STT may be wrong: judge meaning, not exact characters.
NEVER score pronunciation, tones, fluency-as-sound, or acoustic quality. Do not mention Whisper/STT.

RUBRIC (1-10 each):
1. task_completion: follow the PLOT CHECKLIST in the user message. The server will overwrite this score from the tracker; do not invent extra required steps.
2. vocabulary: used lesson/must-say words (or clear synonyms), HSK-appropriate, not empty 好/是 only
3. grammar: word order, particles 了/的/吗/过/在 where needed; errors that block meaning score lower
4. interaction: questions, reactions, turn-taking; not one-word replies
5. connected_speech: length and linking (然后, 因为, 可是); not acoustic fluency
${completenessGuidance}

In feedback.summary and feedback.improvements: never contradict the checklist. Never mention origin/hometown/происхождение unless that is listed as a checklist step.

Return ONLY valid JSON, no markdown:
{
  "criteria_scores": {
    "task_completion": 1-10,
    "vocabulary": 1-10,
    "grammar": 1-10,
    "interaction": 1-10,
    "connected_speech": 1-10
  },
  "overall_score": 1-10,
  "feedback": {
    "strengths": ["short Russian sentences"],
    "improvements": ["short Russian sentences"],
    "summary": "2-3 Russian sentences",
    "useful_phrase_zh": "one Simplified Chinese phrase",
    "useful_phrase_pinyin": "pinyin with tone marks",
    "useful_phrase_ru": "Russian"
  }
}`
}

export function buildZhAssessSpeakingUserPrompt({
  scenarioTitle,
  steps,
  completedStepIds,
  vocabulary,
  grammarFocus,
  hskLevel,
  userMessages,
}) {
  const vocabLine = Array.isArray(vocabulary) && vocabulary.length
    ? 'Lesson words (must_say first): ' +
      vocabulary
        .map((v) => {
          const hanzi = v.hanzi || v.word || ''
          const usage = v.usage ? ` [${v.usage}]` : ''
          return hanzi ? `${hanzi}${usage}` : ''
        })
        .filter(Boolean)
        .join(', ')
    : ''
  const parts = [
    scenarioTitle ? `Scenario: ${scenarioTitle}.` : 'Chinese situational dialogue.',
    buildZhStepFactBlock(steps, completedStepIds),
    vocabLine,
    grammarFocus ? `Grammar focus: ${grammarFocus}` : '',
    hskLevel ? `HSK: ${hskLevel}` : '',
    '',
    'TRANSCRIPT (learner messages only):',
    (userMessages || []).join('\n---\n'),
    '',
    'Evaluate and return JSON only. Do not add required steps that are not on the checklist.',
  ]
  return parts.filter((p) => p !== '').join('\n')
}

export function normalizeZhCriteriaScores(scores, clampScore) {
  const src = scores && typeof scores === 'object' ? scores : {}
  const out = {}
  for (const key of ZH_CRITERIA_KEYS) {
    out[key] = clampScore(src[key])
  }
  return out
}

export function applyZhTaskCompletionOverride(scores, steps, completedIds, clampScore) {
  const out = { ...scores }
  const locked = scoreZhTaskCompletion(steps, completedIds)
  if (locked != null) out.task_completion = clampScore(locked)
  return out
}
