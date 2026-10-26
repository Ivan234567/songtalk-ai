/**
 * Выбор значений и учебная сессия свободного чата.
 * Карточки SRS и журнал повторений этот модуль не читает и не пишет.
 * Сессия и цели пишутся двумя запросами: если цели не вставились, сессия удаляется
 * и клиент не получает успешный запуск. Это не одна транзакция Postgres.
 */
import { ensureUserVocabularySenses } from './vocab-sense-sync.js'

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

export function buildRoleplayPracticeInstruction(targets) {
  const lines = targets.map((target, index) => (
    `${index + 1}. headword: ${JSON.stringify(target.headword)} meaning: ${JSON.stringify(target.gloss_ru)}`
  ))
  return [
    'Hidden practice for this roleplay only.',
    'The learner should recall each meaning and say the foreign word themselves.',
    'Do not say, spell, or translate the headword before the learner uses it.',
    'Do not list the headwords. Keep the scenario steps, goal, and persona.',
    'Scenario lesson words stay separate from these hidden targets.',
    'Targets:',
    ...lines,
  ].join('\n')
}

export function buildChatPracticeInstruction(targets) {
  const lines = targets.map((target, index) => (
    `${index + 1}. headword: ${JSON.stringify(target.headword)} meaning: ${JSON.stringify(target.gloss_ru)}`
  ))
  return [
    'Hidden practice for this free conversation only.',
    'The learner should recall each meaning and say the foreign word themselves.',
    'Do not say, spell, or translate the headword before the learner uses it.',
    'Do not list the headwords. Build a natural situation where that meaning is useful.',
    'Keep every other chat rule, persona, level, and tone.',
    'Targets:',
    ...lines,
  ].join('\n')
}

export function buildRoleplayPracticeHintInstruction(targets) {
  const lines = targets.map((target, index) => (
    `${index + 1}. meaning: ${JSON.stringify(target.gloss_ru)} forbidden word: ${JSON.stringify(target.headword)}`
  ))
  return [
    'The learner is practicing hidden words inside a roleplay.',
    'Write the hint in Russian only.',
    'Describe the situation or the meaning so they can recall the expression themselves.',
    'Do not write any forbidden word, its spelling, or a foreign-language example containing it.',
    'Do not output the suggested reply in the target language.',
    'Keep the hint useful for the current scenario step without naming the hidden word.',
    ...lines,
  ].join('\n')
}

export function buildChatPracticeHintInstruction(targets) {
  const lines = targets.map((target, index) => (
    `${index + 1}. meaning: ${JSON.stringify(target.gloss_ru)} forbidden word: ${JSON.stringify(target.headword)}`
  ))
  return [
    'The learner is practicing hidden words in free conversation.',
    'Write the hint in Russian only.',
    'Describe the situation or the meaning so they can recall the expression themselves.',
    'Do not write any forbidden word, its spelling, or a foreign-language example containing it.',
    'Do not output the suggested reply in the target language.',
    ...lines,
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

export function fallbackPracticeReply(language, targets) {
  const options = language === 'zh'
    ? ['后来呢？', '你觉得怎么样？', '再多说一点。', '嗯。']
    : ['What happened next?', 'How did that feel?', 'Tell me a bit more.', 'Go on.']
  return options.find((line) => !replyContainsTarget(line, targets)) || '…'
}

export function classifyPracticeHint(hint, targets) {
  const text = typeof hint === 'string' ? hint.trim() : ''
  if (!text || !/[А-Яа-яЁё]/.test(text) || replyContainsTarget(text, targets)) {
    return { ok: false, status: 422, error: 'Подсказка не сохранена' }
  }
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
  if (expectedMode !== 'chat' && expectedMode !== 'roleplay') {
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
  if (agent.language !== language || (expectedMode === 'chat' ? Boolean(scenarioId) : !scenarioId)) {
    throw new DialogueRouteError(409, expectedMode === 'roleplay'
      ? 'Practice session does not belong to this roleplay'
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
      const mode = req.body?.mode === 'roleplay' ? 'roleplay' : req.body?.mode == null || req.body?.mode === 'chat' ? 'chat' : ''
      if (mode !== 'chat' && mode !== 'roleplay') throw new DialogueRouteError(400, 'Practice mode is invalid')
      if (!isUuid(agentSessionId)) throw new DialogueRouteError(400, 'Chat session is invalid')
      if (!requestId || requestId.length > DIALOGUE_REQUEST_ID_MAX) {
        throw new DialogueRouteError(400, 'Practice request is invalid')
      }
      if (!LEVEL_RE.test(levelSnapshot)) throw new DialogueRouteError(400, 'Practice level is invalid')
      const senseIds = parseSenseIds(req.body?.sense_ids)
      const language = await loadLearningLanguage({ supabase, safeSupabaseCall, userId })

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
      if (agent.language !== language || (mode === 'chat' ? Boolean(scenarioId) : !scenarioId)) {
        throw new DialogueRouteError(409, mode === 'roleplay'
          ? 'Practice session does not belong to this roleplay'
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
          })
          .select('id')
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

export function registerVocabDialogueRoutes(app, deps) {
  const wrap = deps.asyncHandler || ((fn) => fn)
  app.get('/api/vocabulary/srs/senses', wrap(createSenseCatalogHandler(deps)))
  app.post('/api/vocabulary/srs/dialogue', wrap(createDialogueSessionHandler(deps)))
}
