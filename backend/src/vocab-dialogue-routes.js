/**
 * Выбор значений и учебная сессия свободного чата.
 * Карточки SRS и журнал повторений этот модуль не читает и не пишет.
 * Сессия и цели пишутся двумя запросами: если цели не вставились, сессия удаляется
 * и клиент не получает успешный запуск. Это не одна транзакция Postgres.
 */
import { ensureUserVocabularySenses } from './vocab-sense-sync.js'
import { classifyRecognitionState } from './vocab-lists-routes.js'
import { classifySenseMilestone, MILESTONE_LABELS } from './vocab-session-picks.js'

export const DIALOGUE_TARGET_LIMIT = 5
export const DIALOGUE_REQUEST_ID_MAX = 200
export const SENSE_PAGE_SIZE = 1000

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const LEVEL_RE = /^(A1|A2|B1|B2|C1|easy|medium|hard|HSK[1-6])$/

export class DialogueRouteError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'DialogueRouteError'
    this.status = status
  }
}

export function assertChatPracticeRequest({ dialogueSessionId, stepCount, annotate }) {
  const id = typeof dialogueSessionId === 'string' ? dialogueSessionId.trim() : ''
  if (!id || annotate) return false
  if (Number(stepCount) > 0) {
    throw new DialogueRouteError(409, 'Practice targets belong to free chat only')
  }
  return true
}

export function assertRoleplayPracticeRequest({ dialogueSessionId, annotate }) {
  const id = typeof dialogueSessionId === 'string' ? dialogueSessionId.trim() : ''
  if (!id || annotate) return false
  return true
}

export function assertDebatePracticeRequest({ dialogueSessionId, annotate }) {
  const id = typeof dialogueSessionId === 'string' ? dialogueSessionId.trim() : ''
  if (!id || annotate) return false
  return true
}

export function normalizePracticeMode(raw) {
  if (raw === 'roleplay' || raw === 'debate') return raw
  if (raw == null || raw === 'chat') return 'chat'
  return ''
}

function practiceTargetLines(targets) {
  return targets.map((target, index) => (
    `${index + 1}. headword: ${JSON.stringify(target.headword)} meaning: ${JSON.stringify(target.gloss_ru)}`
  ))
}

function practiceHintTargetLines(targets) {
  return targets.map((target, index) => (
    `${index + 1}. say this word: ${JSON.stringify(target.headword)} meaning: ${JSON.stringify(target.gloss_ru)}`
  ))
}

function sceneContextLines(scene) {
  if (!scene || typeof scene !== 'object') return []
  const lines = []
  if (scene.title) lines.push(`Scene title: ${JSON.stringify(scene.title)}`)
  if (scene.setting) lines.push(`Place: ${JSON.stringify(scene.setting)}`)
  if (scene.goal) lines.push(`Scene goal: ${JSON.stringify(scene.goal)}`)
  if (scene.topic) lines.push(`Debate topic: ${JSON.stringify(scene.topic)}`)
  if (scene.userPosition) lines.push(`Learner position: ${JSON.stringify(scene.userPosition)}`)
  if (scene.currentStep) lines.push(`Current step: ${JSON.stringify(scene.currentStep)}`)
  if (scene.currentStepEn) lines.push(`Current step in the reply language: ${JSON.stringify(scene.currentStepEn)}`)
  if (scene.stepAction) lines.push(`Expected learner action: ${JSON.stringify(scene.stepAction)}`)
  return lines
}

/** Поднять в начало target, чьё значение лучше стыкуется со сценой/шагом. */
export function orderPracticeTargetsForScene(targets, sceneText = '') {
  const list = Array.isArray(targets) ? targets.slice() : []
  if (list.length < 2) return list
  const hay = String(sceneText || '').toLowerCase()
  if (!hay.trim()) return list
  const scored = list.map((target, index) => {
    const gloss = String(target?.gloss_ru || '').toLowerCase()
    const head = String(target?.headword || '').toLowerCase()
    let score = 0
    for (const token of gloss.split(/[\s,.;:!?/()«»"'-]+/).filter((t) => t.length >= 3)) {
      if (hay.includes(token)) score += 3
    }
    if (head && hay.includes(head)) score += 1
    return { target, index, score }
  })
  scored.sort((a, b) => b.score - a.score || a.index - b.index)
  return scored.map((row) => row.target)
}

export function buildDebatePracticeInstruction(targets, scene = null) {
  const ordered = orderPracticeTargetsForScene(targets, [scene?.topic, scene?.userPosition, scene?.currentStep].filter(Boolean).join(' '))
  const focus = ordered[0]
  const lines = practiceTargetLines(ordered)
  return [
    'Hidden vocabulary practice is ACTIVE inside this debate — weave meanings into THIS topic, not a side drill.',
    'Each reply must push the learner to use one unused target meaning in their own argument.',
    focus
      ? `This turn focus meaning (do not say the headword): ${JSON.stringify(focus.gloss_ru)}.`
      : 'Create pressure for the next unused meaning.',
    'Ask a pointed question or raise a counterpoint where that meaning is the natural precise word for THIS debate.',
    'Never say, spell, translate, or hint the letter shape of any unused headword. Do not say the headword aloud.',
    'Do not list targets. Keep debate roles, positions, and tone.',
    'Advance the argument every turn — never stall with a generic filler.',
    ...sceneContextLines(scene),
    'Targets still unused:',
    ...lines,
  ].join('\n')
}

export function buildRoleplayPracticeInstruction(targets, scene = null) {
  const wordStep = String(scene?.wordStep || '').trim()
  const currentStep = String(scene?.currentStep || '').trim()
  const sameStep = !wordStep || !currentStep || wordStep.toLowerCase() === currentStep.toLowerCase()
    || wordStep.toLowerCase().includes(currentStep.toLowerCase())
    || currentStep.toLowerCase().includes(wordStep.toLowerCase())
  const ordered = sameStep
    ? orderPracticeTargetsForScene(targets, [currentStep, scene?.stepAction].filter(Boolean).join(' '))
    : []
  const focus = ordered[0]
  const lines = practiceTargetLines(ordered)
  const linesOut = [
    'Hidden vocabulary practice is ACTIVE inside this roleplay.',
    'You stay IN CHARACTER as the other person in THIS scene (dispatcher, clerk, host). You are not a teacher and not a coach.',
    'Every reply is one short in-world turn that moves the current scenario step.',
    'Never leave the scene. Forbidden: "what would you do next", "what did you try", "what changed", "what would make this easier", "and then", lesson recap, or any meta question about the exercise.',
  ]
  if (!sameStep) {
    linesOut.push('The hidden words belong to an earlier step. Ignore them. Play only the current step. Do not start a side quest for leftover words.')
  } else if (focus) {
    linesOut.push('Create an in-world need for one unused target meaning that completes THIS step, without naming the hidden word.')
    linesOut.push(`This turn focus meaning (do not say the headword): ${JSON.stringify(focus.gloss_ru)}.`)
    linesOut.push('Never say, spell, translate, or leak any unused headword before the learner uses it.')
    linesOut.push('Do not list targets. Keep persona, place, and the current step.')
    if (wordStep) linesOut.push(`These words serve only this step: ${JSON.stringify(wordStep)}.`)
  } else {
    linesOut.push('No hidden word fits this step. Play the current step in character and do not invent a vocabulary task.')
  }
  return [
    ...linesOut,
    ...sceneContextLines(scene),
    ...(lines.length ? ['Targets still unused:', ...lines] : []),
  ].join('\n')
}

export function buildChatPracticeInstruction(targets) {
  const focus = targets[0]
  const lines = practiceTargetLines(targets)
  return [
    'Hidden vocabulary practice is ACTIVE in this free conversation.',
    'Each reply must build a natural situation where the learner needs one unused target meaning.',
    focus
      ? `This turn focus meaning (do not say the headword): ${JSON.stringify(focus.gloss_ru)}.`
      : 'Steer toward the next unused meaning.',
    'Ask a specific question or set a mini-task that makes that meaning useful in their next answer.',
    'Never say, spell, translate, or leak any unused headword before the learner uses it. Do not say the headword aloud.',
    'Do not list targets. Keep level, tone, and persona.',
    'Move the conversation forward every turn with new detail — never repeat the same vague prompt.',
    'Targets still unused:',
    ...lines,
  ].join('\n')
}

export function buildDebatePracticeHintInstruction(targets, scene = null) {
  const ordered = orderPracticeTargetsForScene(targets, [scene?.topic, scene?.currentStep].filter(Boolean).join(' '))
  const focus = ordered[0]
  const lines = practiceHintTargetLines(ordered)
  return [
    'Write ONE example reply the learner can say next in the debate.',
    'Use the same language as the opponent, usually English.',
    focus
      ? `If it fits the opponent's last point, include this word naturally: ${JSON.stringify(focus.headword)} (${JSON.stringify(focus.gloss_ru)}).`
      : 'No practice word is waiting.',
    'If the word does not fit, or there is no word, ignore vocabulary and answer from the latest point and the current step.',
    'Output only that sentence. No labels.',
    ...sceneContextLines(scene),
    ...(lines.length ? ['Words still to say:', ...lines] : []),
  ].join('\n')
}

export function buildRoleplayPracticeHintInstruction(targets, scene = null) {
  const ordered = orderPracticeTargetsForScene(
    targets,
    [scene?.title, scene?.goal, scene?.currentStep, scene?.stepAction].filter(Boolean).join(' '),
  )
  const focus = ordered[0]
  const lines = practiceHintTargetLines(ordered)
  return [
    'Write ONE example reply the learner can say aloud in this roleplay.',
    'Use the same language as the other person, usually English.',
    focus
      ? `If it fits the other person's last line and the current step, include this word naturally: ${JSON.stringify(focus.headword)} (${JSON.stringify(focus.gloss_ru)}).`
      : 'No practice word is waiting.',
    'If the word does not fit, or there is no word, ignore vocabulary and answer from the latest line and the current step.',
    'Output only that sentence. No labels.',
    ...sceneContextLines(scene),
    ...(lines.length ? ['Words still to say:', ...lines] : []),
  ].join('\n')
}

export function buildChatPracticeHintInstruction(targets) {
  const focus = targets[0]
  const lines = practiceHintTargetLines(targets)
  return [
    'Write ONE example reply the learner can say next.',
    'Use the same language as the assistant, usually English.',
    focus
      ? `If it fits the latest message, include this word naturally: ${JSON.stringify(focus.headword)} (${JSON.stringify(focus.gloss_ru)}).`
      : 'No practice word is waiting.',
    'If the word does not fit, or there is no word, ignore vocabulary and answer from the latest message.',
    'Output only that sentence. No labels.',
    ...(lines.length ? ['Words still to say:', ...lines] : []),
  ].join('\n')
}

const IRREGULAR_LEMMA = {
  ran: 'run', running: 'run', runs: 'run',
  went: 'go', gone: 'go', goes: 'go', going: 'go',
  was: 'be', were: 'be', been: 'be', is: 'be', are: 'be', am: 'be',
  had: 'have', has: 'have', having: 'have',
  did: 'do', does: 'do', done: 'do', doing: 'do',
  said: 'say', says: 'say', saying: 'say',
  saw: 'see', seen: 'see', sees: 'see', seeing: 'see',
  came: 'come', comes: 'come', coming: 'come',
  took: 'take', taken: 'take', takes: 'take', taking: 'take',
  made: 'make', makes: 'make', making: 'make',
  got: 'get', gotten: 'get', gets: 'get', getting: 'get',
  knew: 'know', known: 'know', knows: 'know', knowing: 'know',
  thought: 'think', thinks: 'think', thinking: 'think',
  ate: 'eat', eaten: 'eat', eats: 'eat', eating: 'eat',
}

export function latinLemma(token) {
  let word = String(token || '').toLowerCase().replace(/'s$/, '')
  if (!word) return ''
  if (IRREGULAR_LEMMA[word]) return IRREGULAR_LEMMA[word]
  if (word.length >= 5 && word.endsWith('ies')) return word.slice(0, -3) + 'y'
  if (word.length >= 5 && word.endsWith('ied')) return word.slice(0, -3) + 'y'
  if (word.length >= 5 && word.endsWith('ing')) {
    let stem = word.slice(0, -3)
    if (stem.length >= 4 && stem.at(-1) === stem.at(-2) && /[^aeiou]/.test(stem.at(-1))) stem = stem.slice(0, -1)
    return stem
  }
  if (word.length >= 4 && word.endsWith('ed')) {
    let stem = word.slice(0, -2)
    if (stem.length >= 4 && stem.at(-1) === stem.at(-2) && /[^aeiou]/.test(stem.at(-1))) stem = stem.slice(0, -1)
    if (stem.endsWith('i')) stem = stem.slice(0, -1) + 'y'
    return stem
  }
  if (word.length >= 4 && /(s|x|z|ch|sh|o)es$/.test(word)) return word.slice(0, -2)
  if (word.length >= 4 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

export function sameLemma(headword, token) {
  const a = latinLemma(headword)
  const b = latinLemma(token)
  if (!a || !b) return false
  if (a === b) return true
  const ing = String(headword).toLowerCase().endsWith('ing') || String(token).toLowerCase().endsWith('ing')
  return ing && a.length >= 3 && (a + 'e' === b || b + 'e' === a)
}

export function replyContainsTarget(text, targets) {
  const raw = typeof text === 'string' ? text : ''
  if (!raw) return false
  const tokens = raw.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || []
  return targets.some((target) => {
    const word = typeof target?.headword === 'string' ? target.headword.trim() : ''
    if (!word) return false
    if (/[\u3400-\u9fff]/.test(word)) return raw.includes(word)
    const folded = word.toLowerCase()
    return tokens.some((token) => sameLemma(folded, token))
  })
}

export function nextPracticeHintIndex(maxTurnIndex) {
  return Number.isInteger(maxTurnIndex) && maxTurnIndex >= 0 ? maxTurnIndex + 1 : 0
}

function sceneLineForLanguage(value, language) {
  const text = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 180)
  if (!text) return ''
  if (language === 'zh') return /[\u3400-\u9fff]/.test(text) ? text : ''
  if (/[а-яё]/i.test(text)) return ''
  return text
}

function practiceFallbackLines(language, mode, scene) {
  const step = sceneLineForLanguage(scene?.stepAction || scene?.currentStepEn, language)
  const topic = sceneLineForLanguage(scene?.topic, language)
  if (language === 'zh') {
    if (mode === 'roleplay') {
      return [
        step ? `好，我记下了。下一项：${step}` : '',
        '好，我记下了。下一项是什么？',
        '明白。请把下一项告诉我。',
        '收到。我确认一下，还差哪一项？',
      ].filter(Boolean)
    }
    if (mode === 'debate') {
      return [
        step ? `就这个点继续：${step}` : '',
        topic ? `我还没被说服。请针对「${topic}」回答。` : '',
        '继续说下一点。我还没被说服。',
        '直接回答这一点。',
      ].filter(Boolean)
    }
    return [
      '好，再说具体一点。',
      '我听懂了。再给我一个细节。',
      '继续。说一件具体的事就够了。',
    ]
  }
  if (mode === 'roleplay') {
    const action = step ? step.charAt(0).toLowerCase() + step.slice(1) : ''
    return [
      action ? `Thanks, I have that. Next: ${action}` : '',
      'Thanks, I noted that. What should I write down next?',
      'Okay. Tell me the next detail and I will confirm it.',
      'Right. I am ready for the next part of this request.',
      'Got it. Give me the next detail.',
    ].filter(Boolean)
  }
  if (mode === 'debate') {
    return [
      step ? `Stay on this. ${step}` : '',
      topic ? `I am not convinced yet. Answer on ${topic}.` : '',
      'Make the next point. I am still not convinced.',
      'Answer that directly. One clear argument.',
      'Push the point. What is your next argument?',
    ].filter(Boolean)
  }
  return [
    'Okay. Say a bit more about that.',
    'Tell me one more concrete detail.',
    'I follow. Give me the next detail.',
    'Go on. One specific thing is enough.',
  ]
}

export function stripSentencesWithTargets(text, targets) {
  const raw = String(text || '').trim()
  if (!raw || !replyContainsTarget(raw, targets)) return raw
  const parts = raw.split(/(?<=[.!?。！？])\s+/)
  return parts
    .map((part) => part.trim())
    .filter((part) => part && !replyContainsTarget(part, targets))
    .join(' ')
    .trim()
}

export function repairPracticeReply(text, targets, options = {}) {
  const mode = options.mode === 'roleplay' || options.mode === 'debate' ? options.mode : 'chat'
  const language = options.language === 'zh' ? 'zh' : 'en'
  const stripped = stripSentencesWithTargets(text, targets)
  const usable = Boolean(stripped) && stripped.length >= 12 && !replyContainsTarget(stripped, targets)
  const asks = /[?？]/.test(stripped)
  if (usable && (mode === 'chat' || asks)) return stripped
  const fallback = fallbackPracticeReply(language, targets, {
    ...options,
    mode,
    avoid: [stripped, ...(Array.isArray(options.avoid) ? options.avoid : [])].filter(Boolean),
  })
  if (usable) return `${stripped} ${fallback}`.trim()
  return fallback
}

export function fallbackPracticeReply(language, targets, { seed = '', avoid = [], mode = 'chat', scene = null } = {}) {
  const resolvedMode = mode === 'roleplay' || mode === 'debate' ? mode : 'chat'
  const options = practiceFallbackLines(language === 'zh' ? 'zh' : 'en', resolvedMode, scene)
  const blocked = new Set(
    (Array.isArray(avoid) ? avoid : [])
      .map((line) => (typeof line === 'string' ? line.trim() : ''))
      .filter(Boolean),
  )
  const safe = options.filter((line) => !replyContainsTarget(line, targets) && !blocked.has(line))
  const pool = safe.length > 0 ? safe : options.filter((line) => !replyContainsTarget(line, targets))
  if (!pool.length) return language === 'zh' ? '再说一点。' : 'Tell me more.'
  const sceneLine = pool.find((line) => /^(Thanks, I have that\. Next:|Stay on this\.|I am not convinced yet\.|好，我记下了。下一项：|就这个点继续：|我还没被说服。)/.test(line))
  if (sceneLine) return sceneLine
  let hash = 0
  const key = `${seed}|${pool.join('|')}`
  for (let i = 0; i < key.length; i += 1) hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0
  return pool[Math.abs(hash) % pool.length]
}

export function classifyPracticeHint(hint) {
  const text = typeof hint === 'string' ? hint.trim() : ''
  if (!text) return { ok: false, status: 422, error: 'Подсказка не сохранена' }
  return { ok: true, hint: text }
}

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value)
}

async function callSupabase(safeSupabaseCall, fn) {
  try {
    return await safeSupabaseCall(fn, { timeoutMs: 15000, maxRetries: 1 })
  } catch {
    throw new DialogueRouteError(500, 'Failed to read practice data')
  }
}

async function requireUser(req, res, { getBearerToken, resolveUserId }) {
  const token = getBearerToken(req)
  if (!token) {
    res.status(401).json({ error: 'Missing Authorization Bearer token' })
    return null
  }
  let userId
  try {
    userId = await resolveUserId(req)
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
    return null
  }
  if (typeof userId !== 'string' || userId.trim() === '' || userId !== userId.trim()) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return null
  }
  return userId
}

async function loadLearningLanguage({ supabase, safeSupabaseCall, userId }) {
  const result = await callSupabase(
    safeSupabaseCall,
    () => supabase
      .from('user_profiles')
      .select('learning_language')
      .eq('user_id', userId)
      .maybeSingle(),
  )
  if (!result || typeof result !== 'object' || result.error) {
    throw new DialogueRouteError(500, 'Failed to resolve learning language')
  }
  const value = result.data?.learning_language
  if (value == null || value === '') return 'en'
  if (value === 'en' || value === 'zh') return value
  throw new DialogueRouteError(500, 'Failed to resolve learning language')
}

function sameSenseOrder(targets, senseIds) {
  if (targets.length !== senseIds.length) return false
  const ordered = targets.slice().sort((a, b) => a.position - b.position)
  return ordered.every((target, index) => target.sense_id === senseIds[index])
}

async function loadTargets(deps, dialogueSessionId, userId) {
  const result = await callSupabase(
    deps.safeSupabaseCall,
    () => deps.supabase
      .from('vocab_dialogue_targets')
      .select('sense_id, position, headword, gloss_ru, user_id, dialogue_session_id')
      .eq('dialogue_session_id', dialogueSessionId)
      .eq('user_id', userId)
      .order('position', { ascending: true }),
  )
  if (!result || result.error || !Array.isArray(result.data)) {
    throw new DialogueRouteError(500, 'Failed to read practice targets')
  }
  return result.data
    .filter((row) => row && row.user_id === userId && row.dialogue_session_id === dialogueSessionId)
    .map((row) => ({
      sense_id: row.sense_id,
      position: row.position,
      headword: typeof row.headword === 'string' ? row.headword.trim() : '',
      gloss_ru: typeof row.gloss_ru === 'string' ? row.gloss_ru.trim() : '',
    }))
    .filter((row) => row.headword && row.gloss_ru)
}

export async function loadActiveChatPractice({
  supabase,
  safeSupabaseCall = (fn) => fn(),
  userId,
  language,
  dialogueSessionId,
  agentSessionId,
  expectedMode = 'chat',
}) {
  if (expectedMode !== 'chat' && expectedMode !== 'roleplay' && expectedMode !== 'debate') {
    throw new DialogueRouteError(400, 'Practice mode is invalid')
  }
  if (!isUuid(dialogueSessionId) || !isUuid(agentSessionId)) {
    throw new DialogueRouteError(400, 'Practice session is invalid')
  }
  if (language !== 'en' && language !== 'zh') {
    throw new DialogueRouteError(500, 'Failed to resolve learning language')
  }
  const deps = { supabase, safeSupabaseCall }
  const sessionResult = await callSupabase(
    safeSupabaseCall,
    () => supabase
      .from('vocab_dialogue_sessions')
      .select('id, user_id, language, agent_session_id, mode, status')
      .eq('id', dialogueSessionId)
      .maybeSingle(),
  )
  if (!sessionResult || sessionResult.error) {
    throw new DialogueRouteError(500, 'Failed to read practice session')
  }
  const session = sessionResult.data
  if (!session || session.user_id !== userId) {
    throw new DialogueRouteError(404, 'Practice session was not found')
  }
  if (session.language !== language || session.mode !== expectedMode || session.status !== 'active' || session.agent_session_id !== agentSessionId) {
    throw new DialogueRouteError(409, expectedMode === 'roleplay'
      ? 'Practice session does not belong to this roleplay'
      : expectedMode === 'debate'
        ? 'Practice session does not belong to this debate'
        : 'Practice session does not belong to this free chat')
  }
  const agentResult = await callSupabase(
    safeSupabaseCall,
    () => supabase
      .from('agent_sessions')
      .select('id, user_id, language, scenario_id')
      .eq('id', agentSessionId)
      .maybeSingle(),
  )
  if (!agentResult || agentResult.error) {
    throw new DialogueRouteError(500, 'Failed to read practice session')
  }
  const agent = agentResult.data
  if (!agent || agent.user_id !== userId) {
    throw new DialogueRouteError(404, 'Practice session was not found')
  }
  const scenarioId = typeof agent.scenario_id === 'string' ? agent.scenario_id.trim() : ''
  // roleplay требует scenario_id; chat и debate — без него
  const scenarioOk = expectedMode === 'roleplay' ? Boolean(scenarioId) : !scenarioId
  if (agent.language !== language || !scenarioOk) {
    throw new DialogueRouteError(409, expectedMode === 'roleplay'
      ? 'Practice session does not belong to this roleplay'
      : expectedMode === 'debate'
        ? 'Practice session does not belong to this debate'
        : 'Practice session does not belong to this free chat')
  }
  const targets = await loadTargets(deps, dialogueSessionId, userId)
  if (targets.length < 1 || targets.length > DIALOGUE_TARGET_LIMIT) {
    throw new DialogueRouteError(500, 'Failed to read practice targets')
  }
  return { dialogueSessionId, agentSessionId, targets }
}

export async function loadChatPracticeHint(args) {
  const practice = await loadActiveChatPractice(args)
  const latest = await callSupabase(
    args.safeSupabaseCall || ((fn) => fn()),
    () => args.supabase
      .from('vocab_dialogue_turns')
      .select('turn_index, dialogue_session_id, user_id')
      .eq('dialogue_session_id', practice.dialogueSessionId)
      .eq('user_id', args.userId)
      .order('turn_index', { ascending: false })
      .limit(1)
      .maybeSingle(),
  )
  if (!latest || latest.error) throw new DialogueRouteError(500, 'Failed to read practice hint')
  const storedIndex = latest.data && latest.data.user_id === args.userId ? latest.data.turn_index : null
  const turnIndex = nextPracticeHintIndex(storedIndex)
  const existing = await callSupabase(
    args.safeSupabaseCall || ((fn) => fn()),
    () => args.supabase
      .from('vocab_dialogue_hints')
      .select('hint_text, dialogue_session_id, user_id, turn_index')
      .eq('dialogue_session_id', practice.dialogueSessionId)
      .eq('user_id', args.userId)
      .eq('turn_index', turnIndex)
      .maybeSingle(),
  )
  if (!existing || existing.error) {
    throw new DialogueRouteError(500, 'Failed to read practice hint')
  }
  const row = existing.data
  const existingHint = row && row.user_id === args.userId && row.dialogue_session_id === practice.dialogueSessionId
    ? String(row.hint_text || '').trim()
    : ''
  return { ...practice, turnIndex, existingHint: existingHint || null }
}

export async function saveDialogueHint({
  supabase,
  safeSupabaseCall = (fn) => fn(),
  userId,
  dialogueSessionId,
  turnIndex,
  hintText,
}) {
  const inserted = await callSupabase(
    safeSupabaseCall,
    () => supabase
      .from('vocab_dialogue_hints')
      .insert({
        dialogue_session_id: dialogueSessionId,
        user_id: userId,
        turn_index: turnIndex,
        hint_text: hintText,
      })
      .select('hint_text')
      .single(),
  )
  if (inserted && !inserted.error) {
    const saved = typeof inserted.data?.hint_text === 'string' ? inserted.data.hint_text.trim() : ''
    if (!saved) throw new DialogueRouteError(500, 'Failed to save practice hint')
    return { hint: saved }
  }
  if (inserted?.error?.code === '23505') {
    const reread = await callSupabase(
      safeSupabaseCall,
      () => supabase
        .from('vocab_dialogue_hints')
        .select('hint_text, user_id, dialogue_session_id')
        .eq('dialogue_session_id', dialogueSessionId)
        .eq('user_id', userId)
        .eq('turn_index', turnIndex)
        .maybeSingle(),
    )
    const text = reread?.data?.user_id === userId ? String(reread.data.hint_text || '').trim() : ''
    if (text) return { hint: text }
  }
  throw new DialogueRouteError(500, 'Failed to save practice hint')
}

function parseSenseIds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > DIALOGUE_TARGET_LIMIT) {
    throw new DialogueRouteError(400, 'Choose from one to five senses')
  }
  const ids = value.map((item) => (typeof item === 'string' ? item.trim() : ''))
  if (ids.some((id) => !isUuid(id))) {
    throw new DialogueRouteError(400, 'Practice senses are invalid')
  }
  if (new Set(ids).size !== ids.length) {
    throw new DialogueRouteError(400, 'Practice senses must be unique')
  }
  return ids
}

async function findDialogueBy(deps, column, value, userId) {
  let query = deps.supabase
    .from('vocab_dialogue_sessions')
    .select('id, user_id, language, agent_session_id, mode, status, request_id')
    .eq(column, value)
  if (column !== 'id') query = query.eq('user_id', userId)
  const result = await callSupabase(deps.safeSupabaseCall, () => query.maybeSingle())
  if (!result || result.error) throw new DialogueRouteError(500, 'Failed to read practice session')
  return result.data && result.data.user_id === userId ? result.data : null
}

async function deleteDialogueSession(deps, dialogueSessionId, userId) {
  const result = await callSupabase(
    deps.safeSupabaseCall,
    () => deps.supabase
      .from('vocab_dialogue_sessions')
      .delete()
      .eq('id', dialogueSessionId)
      .eq('user_id', userId),
  )
  if (!result || result.error) {
    throw new DialogueRouteError(500, 'Failed to start practice session')
  }
}

function publicTargets(rows) {
  return rows
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((row) => ({
      sense_id: row.sense_id,
      position: row.position,
      headword: row.headword,
      gloss_ru: row.gloss_ru,
    }))
}

async function reuseOrReject(deps, existing, { userId, language, agentSessionId, senseIds, mode }) {
  if (!existing) return null
  if (
    existing.user_id !== userId
    || existing.language !== language
    || existing.mode !== mode
    || existing.status !== 'active'
    || existing.agent_session_id !== agentSessionId
  ) {
    throw new DialogueRouteError(409, mode === 'roleplay'
      ? 'Practice session does not belong to this roleplay'
      : mode === 'debate'
        ? 'Practice session does not belong to this debate'
        : 'Practice session does not belong to this free chat')
  }
  const targets = await loadTargets(deps, existing.id, userId)
  if (!sameSenseOrder(targets, senseIds)) {
    throw new DialogueRouteError(409, 'Practice session already has different words')
  }
  return {
    dialogue_session_id: existing.id,
    agent_session_id: agentSessionId,
    status: 'active',
    mode: existing.mode,
    targets: publicTargets(targets),
  }
}

export function createSenseCatalogHandler({
  supabase,
  resolveUserId,
  getBearerToken,
  safeSupabaseCall = (fn) => fn(),
  ensureSenses = ensureUserVocabularySenses,
}) {
  return async function senseCatalogHandler(req, res) {
    const userId = await requireUser(req, res, { getBearerToken, resolveUserId })
    if (!userId) return
    let language
    try {
      language = await loadLearningLanguage({ supabase, safeSupabaseCall, userId })
      await ensureSenses({ supabase, userId, language })
    } catch (err) {
      console.error('[api/vocabulary/srs/senses] failed to prepare senses')
      const status = err instanceof DialogueRouteError ? err.status : 500
      res.status(status).json({ error: 'Failed to prepare vocabulary senses' })
      return
    }

    const items = []
    const seen = new Set()
    let from = 0
    try {
      for (;;) {
        const result = await callSupabase(
          safeSupabaseCall,
          () => supabase
            .from('vocab_senses')
            .select('id, user_id, language, headword, gloss_ru')
            .eq('user_id', userId)
            .eq('language', language)
            .order('headword', { ascending: true })
            .order('id', { ascending: true })
            .range(from, from + SENSE_PAGE_SIZE - 1),
        )
        if (!result || result.error || !Array.isArray(result.data)) {
          throw new DialogueRouteError(500, 'Failed to read vocabulary senses')
        }
        if (result.data.length === 0) break
        for (const row of result.data) {
          if (!row || row.user_id !== userId || row.language !== language) continue
          const headword = typeof row.headword === 'string' ? row.headword.trim() : ''
          const gloss = typeof row.gloss_ru === 'string' ? row.gloss_ru.trim() : ''
          if (!headword || !gloss) continue
          const key = `${headword}\n${gloss}`
          if (seen.has(key)) continue
          seen.add(key)
          items.push({ sense_id: row.id, headword, gloss_ru: gloss })
        }
        if (result.data.length < SENSE_PAGE_SIZE) break
        from += SENSE_PAGE_SIZE
      }
    } catch {
      console.error('[api/vocabulary/srs/senses] failed to read senses')
      res.status(500).json({ error: 'Failed to read vocabulary senses' })
      return
    }

    res.status(200).json({ items, count: items.length })
  }
}

export function createDialogueSessionHandler({
  supabase,
  resolveUserId,
  getBearerToken,
  safeSupabaseCall = (fn) => fn(),
}) {
  return async function dialogueSessionHandler(req, res) {
    const userId = await requireUser(req, res, { getBearerToken, resolveUserId })
    if (!userId) return
    const deps = { supabase, safeSupabaseCall }
    try {
      const agentSessionId = req.body?.agent_session_id
      const requestId = typeof req.body?.request_id === 'string' ? req.body.request_id.trim() : ''
      const levelSnapshot = typeof req.body?.level_snapshot === 'string' ? req.body.level_snapshot.trim() : ''
      const mode = normalizePracticeMode(req.body?.mode)
      if (!mode) throw new DialogueRouteError(400, 'Practice mode is invalid')
      if (!isUuid(agentSessionId)) throw new DialogueRouteError(400, 'Chat session is invalid')
      if (!requestId || requestId.length > DIALOGUE_REQUEST_ID_MAX) {
        throw new DialogueRouteError(400, 'Practice request is invalid')
      }
      if (!LEVEL_RE.test(levelSnapshot)) throw new DialogueRouteError(400, 'Practice level is invalid')
      const senseIds = parseSenseIds(req.body?.sense_ids)
      const language = await loadLearningLanguage({ supabase, safeSupabaseCall, userId })
      const rawListId = typeof req.body?.list_id === 'string' ? req.body.list_id.trim() : ''
      let listId = null
      if (rawListId) {
        if (!isUuid(rawListId)) throw new DialogueRouteError(400, 'Practice list is invalid')
        const listResult = await callSupabase(
          safeSupabaseCall,
          () => supabase
            .from('vocab_lists')
            .select('id')
            .eq('id', rawListId)
            .eq('user_id', userId)
            .eq('language', language)
            .maybeSingle(),
        )
        if (!listResult || listResult.error) throw new DialogueRouteError(500, 'Failed to read practice list')
        if (!listResult.data?.id) throw new DialogueRouteError(404, 'Practice list was not found')
        listId = listResult.data.id
      }

      const agentResult = await callSupabase(
        safeSupabaseCall,
        () => supabase
          .from('agent_sessions')
          .select('id, user_id, language, scenario_id')
          .eq('id', agentSessionId)
          .maybeSingle(),
      )
      if (!agentResult || agentResult.error) throw new DialogueRouteError(500, 'Failed to read chat session')
      const agent = agentResult.data
      if (!agent || agent.user_id !== userId) throw new DialogueRouteError(404, 'Chat session was not found')
      const scenarioId = typeof agent.scenario_id === 'string' ? agent.scenario_id.trim() : ''
      const scenarioOk = mode === 'roleplay' ? Boolean(scenarioId) : !scenarioId
      if (agent.language !== language || !scenarioOk) {
        throw new DialogueRouteError(409, mode === 'roleplay'
          ? 'Practice session does not belong to this roleplay'
          : mode === 'debate'
            ? 'Practice session does not belong to this debate'
            : 'Practice session does not belong to this free chat')
      }

      const byRequest = await findDialogueBy(deps, 'request_id', requestId, userId)
      const reusedRequest = await reuseOrReject(deps, byRequest, { userId, language, agentSessionId, senseIds, mode })
      if (reusedRequest) {
        res.status(200).json(reusedRequest)
        return
      }
      const byAgent = await findDialogueBy(deps, 'agent_session_id', agentSessionId, userId)
      const reusedAgent = await reuseOrReject(deps, byAgent, { userId, language, agentSessionId, senseIds, mode })
      if (reusedAgent) {
        res.status(200).json(reusedAgent)
        return
      }

      const senseResult = await callSupabase(
        safeSupabaseCall,
        () => supabase
          .from('vocab_senses')
          .select('id, user_id, language, headword, gloss_ru, context_text')
          .in('id', senseIds)
          .eq('user_id', userId)
          .eq('language', language),
      )
      if (!senseResult || senseResult.error || !Array.isArray(senseResult.data)) {
        throw new DialogueRouteError(500, 'Failed to read vocabulary senses')
      }
      const byId = new Map(senseResult.data.filter((row) => row && row.user_id === userId && row.language === language).map((row) => [row.id, row]))
      if (byId.size !== senseIds.length) throw new DialogueRouteError(404, 'Practice senses were not found')
      const snapshots = senseIds.map((id) => byId.get(id))
      if (snapshots.some((row) => !row?.headword?.trim() || !row?.gloss_ru?.trim())) {
        throw new DialogueRouteError(404, 'Practice senses were not found')
      }

      const inserted = await callSupabase(
        safeSupabaseCall,
        () => supabase
          .from('vocab_dialogue_sessions')
          .insert({
            user_id: userId,
            language,
            agent_session_id: agentSessionId,
            mode,
            status: 'active',
            level_snapshot: levelSnapshot,
            request_id: requestId,
            ...(listId ? { list_id: listId } : {}),
          })
          .select('id, list_id')
          .single(),
      )
      if (inserted?.error?.code === '23505') {
        const winner = await findDialogueBy(deps, 'agent_session_id', agentSessionId, userId)
          || await findDialogueBy(deps, 'request_id', requestId, userId)
        const reused = await reuseOrReject(deps, winner, { userId, language, agentSessionId, senseIds, mode })
        if (reused) {
          res.status(200).json(reused)
          return
        }
        throw new DialogueRouteError(409, 'Practice session already has different words')
      }
      if (!inserted || inserted.error || !inserted.data?.id) {
        throw new DialogueRouteError(500, 'Failed to start practice session')
      }
      const dialogueSessionId = inserted.data.id
      const targetRows = snapshots.map((row, index) => ({
        dialogue_session_id: dialogueSessionId,
        user_id: userId,
        sense_id: row.id,
        position: index + 1,
        headword: row.headword.trim(),
        gloss_ru: row.gloss_ru.trim(),
        context_text: typeof row.context_text === 'string' && row.context_text.trim() ? row.context_text : null,
      }))
      const targetsInserted = await callSupabase(
        safeSupabaseCall,
        () => supabase.from('vocab_dialogue_targets').insert(targetRows).select('sense_id, position, headword, gloss_ru'),
      )
      if (!targetsInserted || targetsInserted.error || !Array.isArray(targetsInserted.data) || targetsInserted.data.length !== senseIds.length) {
        await deleteDialogueSession(deps, dialogueSessionId, userId)
        throw new DialogueRouteError(500, 'Failed to start practice session')
      }
      res.status(200).json({
        dialogue_session_id: dialogueSessionId,
        agent_session_id: agentSessionId,
        list_id: inserted.data.list_id || listId || null,
        status: 'active',
        mode,
        targets: publicTargets(targetsInserted.data),
      })
    } catch (err) {
      if (res.headersSent) return
      const status = err instanceof DialogueRouteError ? err.status : 500
      if (status === 500) console.error('[api/vocabulary/srs/dialogue] failed to start practice session')
      res.status(status).json({
        error: err instanceof DialogueRouteError ? err.message : 'Failed to start practice session',
      })
    }
  }
}

export function createRecentDialogueSessionsHandler({
  supabase,
  resolveUserId,
  getBearerToken,
  safeSupabaseCall = (fn) => fn(),
  classifyTargets,
  buildCourseItems,
}) {
  return async function recentDialogueSessionsHandler(req, res) {
    const userId = await requireUser(req, res, { getBearerToken, resolveUserId })
    if (!userId) return
    try {
      const language = await loadLearningLanguage({ supabase, safeSupabaseCall, userId })
      const limitRaw = Number(req.query?.limit)
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(20, Math.floor(limitRaw))) : 8
      const sessionsResult = await callSupabase(
        safeSupabaseCall,
        () => supabase
          .from('vocab_dialogue_sessions')
          .select('id, mode, status, list_id, level_snapshot, agent_session_id, created_at, assessed_at')
          .eq('user_id', userId)
          .eq('language', language)
          .order('created_at', { ascending: false })
          .limit(limit),
      )
      if (!sessionsResult || sessionsResult.error) {
        throw new DialogueRouteError(500, 'Failed to load practice sessions')
      }
      const sessions = Array.isArray(sessionsResult.data) ? sessionsResult.data : []
      const sessionIds = sessions.map((row) => row.id).filter(Boolean)
      const listIds = [...new Set(sessions.map((row) => row.list_id).filter(Boolean))]

      let targetsBySession = new Map()
      if (sessionIds.length) {
        const targetsResult = await callSupabase(
          safeSupabaseCall,
          () => supabase
            .from('vocab_dialogue_targets')
            .select('dialogue_session_id, sense_id, position, headword, gloss_ru')
            .eq('user_id', userId)
            .in('dialogue_session_id', sessionIds)
            .order('position', { ascending: true }),
        )
        if (targetsResult && !targetsResult.error && Array.isArray(targetsResult.data)) {
          targetsBySession = targetsResult.data.reduce((map, row) => {
            const key = row.dialogue_session_id
            if (!map.has(key)) map.set(key, [])
            map.get(key).push({
              sense_id: row.sense_id,
              position: row.position,
              headword: row.headword,
              gloss_ru: row.gloss_ru,
            })
            return map
          }, new Map())
        }
      }

      let turnsBySession = new Map()
      let hintsBySession = new Map()
      if (sessionIds.length) {
        const [turnsResult, hintsResult] = await Promise.all([
          callSupabase(
            safeSupabaseCall,
            () => supabase
              .from('vocab_dialogue_turns')
              .select('dialogue_session_id, turn_index, role, content')
              .eq('user_id', userId)
              .in('dialogue_session_id', sessionIds)
              .order('turn_index', { ascending: true }),
          ),
          callSupabase(
            safeSupabaseCall,
            () => supabase
              .from('vocab_dialogue_hints')
              .select('dialogue_session_id, turn_index, hint_text')
              .eq('user_id', userId)
              .in('dialogue_session_id', sessionIds),
          ),
        ])
        if (turnsResult && !turnsResult.error && Array.isArray(turnsResult.data)) {
          turnsBySession = turnsResult.data.reduce((map, row) => {
            if (!map.has(row.dialogue_session_id)) map.set(row.dialogue_session_id, [])
            map.get(row.dialogue_session_id).push(row)
            return map
          }, new Map())
        }
        if (hintsResult && !hintsResult.error && Array.isArray(hintsResult.data)) {
          hintsBySession = hintsResult.data.reduce((map, row) => {
            if (!map.has(row.dialogue_session_id)) map.set(row.dialogue_session_id, [])
            map.get(row.dialogue_session_id).push(row)
            return map
          }, new Map())
        }
      }

      let listsById = new Map()
      if (listIds.length) {
        const listsResult = await callSupabase(
          safeSupabaseCall,
          () => supabase
            .from('vocab_lists')
            .select('id, title, bound_kind, bound_ref, bound_label')
            .eq('user_id', userId)
            .in('id', listIds),
        )
        if (listsResult && !listsResult.error && Array.isArray(listsResult.data)) {
          listsById = new Map(listsResult.data.map((row) => [row.id, row]))
        }
      }

      const classify = typeof classifyTargets === 'function' ? classifyTargets : null
      const toCourse = typeof buildCourseItems === 'function' ? buildCourseItems : null

      res.status(200).json({
        items: sessions.map((session) => {
          const list = session.list_id ? listsById.get(session.list_id) : null
          const targets = targetsBySession.get(session.id) || []
          let courseTargets = targets.map((target) => ({
            ...target,
            status: session.status === 'active' ? 'waiting' : 'missed',
            verdict: 'unused',
          }))
          if (classify && toCourse && targets.length) {
            const classified = classify({
              targets,
              turns: turnsBySession.get(session.id) || [],
              hints: hintsBySession.get(session.id) || [],
            })
            courseTargets = toCourse(targets, classified, session.status)
          }
          const usedCount = courseTargets.filter((item) => item.status === 'used').length
          const hintedCount = courseTargets.filter((item) => item.status === 'hinted').length
          const missedCount = courseTargets.filter((item) => item.status === 'missed').length
          return {
            id: session.id,
            mode: session.mode,
            status: session.status,
            level_snapshot: session.level_snapshot,
            agent_session_id: session.agent_session_id,
            created_at: session.created_at,
            assessed_at: session.assessed_at,
            list_id: session.list_id || null,
            list_title: list?.title || null,
            bound_kind: list?.bound_kind || null,
            bound_ref: list?.bound_ref || null,
            bound_label: list?.bound_label || null,
            targets: courseTargets,
            target_count: courseTargets.length,
            used_count: usedCount,
            hinted_count: hintedCount,
            missed_count: missedCount,
          }
        }),
      })
    } catch (err) {
      if (res.headersSent) return
      const status = err instanceof DialogueRouteError ? err.status : 500
      if (status === 500) console.error('[api/vocabulary/srs/dialogue/recent] failed')
      res.status(status).json({
        error: err instanceof DialogueRouteError ? err.message : 'Failed to load practice sessions',
      })
    }
  }
}

export function createSenseCourseHandler({
  supabase,
  resolveUserId,
  getBearerToken,
  safeSupabaseCall = (fn) => fn(),
  classifyTargets,
  buildCourseItems,
  now = () => new Date(),
}) {
  return async function senseCourseHandler(req, res) {
    const userId = await requireUser(req, res, { getBearerToken, resolveUserId })
    if (!userId) return
    const senseId = typeof req.params?.senseId === 'string' ? req.params.senseId.trim() : ''
    if (!isUuid(senseId)) {
      res.status(400).json({ error: 'Invalid sense id' })
      return
    }
    try {
      const language = await loadLearningLanguage({ supabase, safeSupabaseCall, userId })
      const senseResult = await callSupabase(
        safeSupabaseCall,
        () => supabase
          .from('vocab_senses')
          .select('id, vocabulary_id, headword, gloss_ru')
          .eq('user_id', userId)
          .eq('id', senseId)
          .maybeSingle(),
      )
      if (!senseResult || senseResult.error) throw new DialogueRouteError(500, 'Failed to load sense')
      if (!senseResult.data?.id) {
        res.status(404).json({ error: 'Значение не найдено' })
        return
      }
      const sense = senseResult.data

      const statesResult = await callSupabase(
        safeSupabaseCall,
        () => supabase
          .from('vocab_srs_states')
          .select('card_type, due_at, interval_days, repetitions, last_reviewed_at, updated_at')
          .eq('user_id', userId)
          .eq('sense_id', senseId),
      )
      if (!statesResult || statesResult.error) throw new DialogueRouteError(500, 'Failed to load SRS')
      const states = Array.isArray(statesResult.data) ? statesResult.data : []
      const recognition = states.find((row) => row.card_type === 'recognition') || null
      const production = states.find((row) => row.card_type === 'production') || null

      const recognitionStatus = classifyRecognitionState(recognition, now())

      const targetsResult = await callSupabase(
        safeSupabaseCall,
        () => supabase
          .from('vocab_dialogue_targets')
          .select('dialogue_session_id, sense_id, headword, gloss_ru, position')
          .eq('user_id', userId)
          .eq('sense_id', senseId)
          .order('dialogue_session_id', { ascending: false })
          .limit(40),
      )
      if (!targetsResult || targetsResult.error) throw new DialogueRouteError(500, 'Failed to load practice history')
      const targetRows = Array.isArray(targetsResult.data) ? targetsResult.data : []
      const sessionIds = [...new Set(targetRows.map((row) => row.dialogue_session_id).filter(Boolean))]

      let sessions = []
      if (sessionIds.length) {
        const sessionsResult = await callSupabase(
          safeSupabaseCall,
          () => supabase
            .from('vocab_dialogue_sessions')
            .select('id, mode, status, list_id, created_at, assessed_at, language')
            .eq('user_id', userId)
            .eq('language', language)
            .in('id', sessionIds)
            .order('created_at', { ascending: false })
            .limit(20),
        )
        if (!sessionsResult || sessionsResult.error) throw new DialogueRouteError(500, 'Failed to load sessions')
        sessions = Array.isArray(sessionsResult.data) ? sessionsResult.data : []
      }

      const listIds = [...new Set(sessions.map((row) => row.list_id).filter(Boolean))]
      let listsById = new Map()
      if (listIds.length) {
        const listsResult = await callSupabase(
          safeSupabaseCall,
          () => supabase
            .from('vocab_lists')
            .select('id, title, bound_kind, bound_ref, bound_label')
            .eq('user_id', userId)
            .in('id', listIds),
        )
        if (listsResult && !listsResult.error && Array.isArray(listsResult.data)) {
          listsById = new Map(listsResult.data.map((row) => [row.id, row]))
        }
      }

      let turnsBySession = new Map()
      let hintsBySession = new Map()
      let allTargetsBySession = new Map()
      if (sessions.length) {
        const ids = sessions.map((row) => row.id)
        const [turnsResult, hintsResult, allTargetsResult] = await Promise.all([
          callSupabase(
            safeSupabaseCall,
            () => supabase
              .from('vocab_dialogue_turns')
              .select('dialogue_session_id, turn_index, role, content')
              .eq('user_id', userId)
              .in('dialogue_session_id', ids),
          ),
          callSupabase(
            safeSupabaseCall,
            () => supabase
              .from('vocab_dialogue_hints')
              .select('dialogue_session_id, turn_index, hint_text')
              .eq('user_id', userId)
              .in('dialogue_session_id', ids),
          ),
          callSupabase(
            safeSupabaseCall,
            () => supabase
              .from('vocab_dialogue_targets')
              .select('dialogue_session_id, sense_id, headword, gloss_ru')
              .eq('user_id', userId)
              .in('dialogue_session_id', ids),
          ),
        ])
        if (turnsResult && !turnsResult.error) {
          turnsBySession = (turnsResult.data || []).reduce((map, row) => {
            if (!map.has(row.dialogue_session_id)) map.set(row.dialogue_session_id, [])
            map.get(row.dialogue_session_id).push(row)
            return map
          }, new Map())
        }
        if (hintsResult && !hintsResult.error) {
          hintsBySession = (hintsResult.data || []).reduce((map, row) => {
            if (!map.has(row.dialogue_session_id)) map.set(row.dialogue_session_id, [])
            map.get(row.dialogue_session_id).push(row)
            return map
          }, new Map())
        }
        if (allTargetsResult && !allTargetsResult.error) {
          allTargetsBySession = (allTargetsResult.data || []).reduce((map, row) => {
            if (!map.has(row.dialogue_session_id)) map.set(row.dialogue_session_id, [])
            map.get(row.dialogue_session_id).push(row)
            return map
          }, new Map())
        }
      }

      const classify = typeof classifyTargets === 'function' ? classifyTargets : null
      const toCourse = typeof buildCourseItems === 'function' ? buildCourseItems : null
      let producedCount = 0
      const timeline = []
      for (const session of sessions) {
        const sessionTargets = allTargetsBySession.get(session.id) || []
        let courseItems = sessionTargets.map((target) => ({
          sense_id: target.sense_id,
          status: session.status === 'active' ? 'waiting' : 'missed',
          verdict: 'unused',
        }))
        if (classify && toCourse && sessionTargets.length) {
          courseItems = toCourse(
            sessionTargets,
            classify({
              targets: sessionTargets,
              turns: turnsBySession.get(session.id) || [],
              hints: hintsBySession.get(session.id) || [],
            }),
            session.status,
          )
        }
        const self = courseItems.find((item) => item.sense_id === senseId)
        const status = self?.status || (session.status === 'active' ? 'waiting' : 'missed')
        if (status === 'used') producedCount += 1
        const list = session.list_id ? listsById.get(session.list_id) : null
        timeline.push({
          dialogue_session_id: session.id,
          mode: session.mode,
          status: session.status,
          word_status: status,
          verdict: self?.verdict || 'unused',
          created_at: session.created_at,
          assessed_at: session.assessed_at,
          list_id: session.list_id || null,
          list_title: list?.title || null,
          bound_kind: list?.bound_kind || null,
          bound_ref: list?.bound_ref || null,
          bound_label: list?.bound_label || null,
          source: 'session',
        })
      }

      const milestone = classifySenseMilestone({
        status: recognitionStatus,
        producedCount,
        sessionAppearances: timeline.length,
      })

      const lastCardAt = recognition?.last_reviewed_at || production?.last_reviewed_at || null
      const lastSessionAt = timeline[0]?.created_at || null
      let last_move_source = null
      if (lastCardAt || lastSessionAt) {
        const cardTs = lastCardAt ? Date.parse(lastCardAt) : 0
        const sessionTs = lastSessionAt ? Date.parse(lastSessionAt) : 0
        last_move_source = sessionTs >= cardTs ? 'session' : 'card'
      }

      res.status(200).json({
        sense_id: sense.id,
        headword: sense.headword,
        gloss_ru: sense.gloss_ru,
        recognition_status: recognitionStatus,
        recognition,
        production,
        milestone,
        milestone_label: MILESTONE_LABELS[milestone] || milestone,
        produced_count: producedCount,
        session_count: timeline.length,
        last_move_source,
        timeline,
      })
    } catch (err) {
      if (res.headersSent) return
      const status = err instanceof DialogueRouteError ? err.status : 500
      if (status === 500) console.error('[api/vocabulary/srs/senses/:senseId/course] failed', err?.message || err)
      res.status(status).json({
        error: err instanceof DialogueRouteError ? err.message : 'Failed to load word course',
      })
    }
  }
}

export function createDialogueProgressHandler({
  supabase,
  resolveUserId,
  getBearerToken,
  safeSupabaseCall = (fn) => fn(),
  loadProgress,
}) {
  if (typeof loadProgress !== 'function') {
    throw new Error('createDialogueProgressHandler requires loadProgress')
  }
  return async function dialogueProgressHandler(req, res) {
    const userId = await requireUser(req, res, { getBearerToken, resolveUserId })
    if (!userId) return
    try {
      const dialogueSessionId = typeof req.params?.id === 'string' ? req.params.id.trim() : ''
      const agentSessionId = typeof req.query?.agent_session_id === 'string'
        ? req.query.agent_session_id.trim()
        : ''
      const mode = normalizePracticeMode(req.query?.mode)
      if (!mode) throw new DialogueRouteError(400, 'Practice mode is invalid')
      const language = await loadLearningLanguage({ supabase, safeSupabaseCall, userId })
      const practice = await loadActiveChatPractice({
        supabase,
        safeSupabaseCall,
        userId,
        language,
        dialogueSessionId,
        agentSessionId,
        expectedMode: mode,
      })
      const snapshot = await loadProgress({
        supabase,
        safeSupabaseCall,
        userId,
        dialogueSessionId: practice.dialogueSessionId,
        targets: practice.targets,
      })
      res.status(200).json({
        dialogue_session_id: practice.dialogueSessionId,
        used_count: snapshot.used_count,
        total_count: snapshot.total_count,
        items: snapshot.items.map((item) => ({
          sense_id: item.sense_id,
          headword: item.headword,
          gloss_ru: item.gloss_ru,
          status: item.status,
          verdict: item.verdict,
        })),
      })
    } catch (err) {
      if (res.headersSent) return
      const status = err instanceof DialogueRouteError ? err.status : 500
      if (status === 500) console.error('[api/vocabulary/srs/dialogue/:id/progress] failed')
      res.status(status).json({
        error: err instanceof DialogueRouteError ? err.message : 'Failed to read practice progress',
      })
    }
  }
}

export function registerVocabDialogueRoutes(app, deps) {
  const wrap = deps.asyncHandler || ((fn) => fn)
  app.get('/api/vocabulary/srs/senses', wrap(createSenseCatalogHandler(deps)))
  // recent регистрируется в index.js с classify/buildCourse deps (до :id/progress)
  app.post('/api/vocabulary/srs/dialogue', wrap(createDialogueSessionHandler(deps)))
}
