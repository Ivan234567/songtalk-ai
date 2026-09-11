/**
 * Промпты китайской оценки диалога и короткого коучинга после сценария.
 * Не ставить баллы за тоны и произношение по транскрипту STT.
 */

export const ZH_CRITERIA_KEYS = [
  'task_completion',
  'vocabulary',
  'grammar',
  'interaction',
  'connected_speech',
]

export function buildZhRoleplayFeedbackSystem() {
  return `You are a supportive coach for Simplified Chinese (简体中文) roleplay.
The transcript comes from speech-to-text and MAY contain wrong characters or near-homophones. Judge MEANING, not exact hanzi.

Rules:
1. Feedback in Russian: one concrete STRENGTH (what the learner actually said) + one SUGGESTION for next time, tied to the scenario goal.
2. Suggest ONE useful phrase in Simplified Chinese the learner can reuse in this situation. Include pinyin with tone marks and a Russian translation.
3. Do NOT comment on pronunciation, tones, Whisper, or STT.
4. Do not praise or scold personality. Stay brief.

Respond ONLY with valid JSON, no markdown:
{"feedback":"1-2 short Russian sentences","useful_phrase":"simplified Chinese phrase","useful_phrase_pinyin":"pinyin with tone marks","useful_phrase_ru":"Russian translation","style_note":"","rewrite_neutral":""}`
}

export function buildZhRoleplayFeedbackUserPrompt({ scenarioTitle, goal, hskLevel, userMessages }) {
  const goalBlock = goal ? `\nScenario goal: ${goal}\n` : ''
  const hskBlock = hskLevel ? `\nHSK level of the card: ${hskLevel}. Keep the useful phrase at this HSK or easier.\n` : ''
  return `Scenario: ${scenarioTitle || 'Chinese roleplay'}.${goalBlock}${hskBlock}
Learner's spoken lines (transcript):
${(userMessages || []).join('\n---\n')}

Return JSON only.`
}

export function buildZhAssessSpeakingSystem({ completenessGuidance = '' } = {}) {
  return `You are an expert assessor of spoken Simplified Chinese for learners (HSK-oriented).
Evaluate ONLY from the TRANSCRIPT of the learner's messages. STT may be wrong: judge meaning, not exact characters.
NEVER score pronunciation, tones, fluency-as-sound, or acoustic quality. Do not mention Whisper/STT.

RUBRIC (1-10 each):
1. task_completion: did they achieve the scenario goal and expected steps?
2. vocabulary: used lesson/must-say words (or clear synonyms), HSK-appropriate, not empty 好/是 only
3. grammar: word order, particles 了/的/吗/过/在 where needed; errors that block meaning score lower
4. interaction: questions, reactions, turn-taking; not one-word replies
5. connected_speech: length and linking (然后, 因为, 可是); not acoustic fluency
${completenessGuidance}

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
  goal,
  steps,
  vocabulary,
  grammarFocus,
  hskLevel,
  userMessages,
}) {
  const stepLine = Array.isArray(steps) && steps.length
    ? 'Expected learner steps: ' +
      steps
        .map((s) => (typeof s === 'string' ? s : s.titleRu || s.title_ru || s.titleEn || s.title || ''))
        .filter(Boolean)
        .join('; ')
    : ''
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
    goal ? `Goal: ${typeof goal === 'string' ? goal : goal.titleRu || goal.goal || ''}` : '',
    stepLine,
    vocabLine,
    grammarFocus ? `Grammar focus: ${grammarFocus}` : '',
    hskLevel ? `HSK: ${hskLevel}` : '',
    '',
    'TRANSCRIPT (learner messages only):',
    (userMessages || []).join('\n---\n'),
    '',
    'Evaluate and return JSON only.',
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
