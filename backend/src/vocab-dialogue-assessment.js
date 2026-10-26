/**
 * Разбор речи свободного чата.
 * Вердикт produced принимается только с цитатой из серверной реплики пользователя.
 * Карточка узнавания не читается и не обновляется.
 */
import { applySm2Review } from './srs.js'
import { replyContainsTarget, sameLemma, DialogueRouteError } from './vocab-dialogue-routes.js'

const MOVING = new Set(['produced', 'wrong_sense'])

export function latestUserText(messages) {
  if (!Array.isArray(messages)) return ''
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'user' && typeof message.content === 'string' && message.content.trim()) {
      return message.content.trim()
    }
  }
  return ''
}

export function evidenceQuote(text, headword) {
  const raw = typeof text === 'string' ? text.trim() : ''
  const word = typeof headword === 'string' ? headword.trim() : ''
  if (!raw || !word) return ''
  const lower = raw.toLowerCase()
  let at = raw.indexOf(word)
  if (at < 0) at = lower.indexOf(word.toLowerCase())
  if (at < 0 && !/[\u3400-\u9fff]/.test(word)) {
    const tokens = raw.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || []
    for (const token of tokens) {
      if (!sameLemma(word, token)) continue
      at = lower.indexOf(token.toLowerCase())
      break
    }
  }
  if (at < 0) return ''
  const marks = ['.', '!', '?', '\n', '。', '！', '？']
  let start = 0
  for (const mark of marks) {
    const found = raw.lastIndexOf(mark, at)
    if (found >= start) start = found + 1
  }
  let end = raw.length
  for (const mark of marks) {
    const found = raw.indexOf(mark, at + word.length)
    if (found >= 0 && found < end) end = found + 1
  }
  const quote = raw.slice(start, end).trim()
  if (!quote || !raw.includes(quote) || !replyContainsTarget(quote, [{ headword: word }])) return ''
  return quote
}

export function classifyDialogueTargets({ targets, turns, hints }) {
  const orderedTurns = (Array.isArray(turns) ? turns : [])
    .filter((turn) => turn && (turn.role === 'user' || turn.role === 'assistant') && typeof turn.content === 'string')
    .slice()
    .sort((a, b) => a.turn_index - b.turn_index || (a.role === 'user' ? -1 : 1))
  const hintRows = Array.isArray(hints) ? hints : []
  return targets.map((target) => {
    const word = target.headword
    const userTurn = orderedTurns.find((turn) => turn.role === 'user' && replyContainsTarget(turn.content, [{ headword: word }]))
    if (!userTurn) {
      return { sense_id: target.sense_id, verdict: 'unused', evidence_text: null, needsSense: false }
    }
    const quote = evidenceQuote(userTurn.content, word)
    const echoed = orderedTurns.some((turn) => (
      turn.role === 'assistant'
      && turn.turn_index < userTurn.turn_index
      && replyContainsTarget(turn.content, [{ headword: word }])
    ))
    if (echoed) {
      return { sense_id: target.sense_id, verdict: 'echoed', evidence_text: quote || null, needsSense: false }
    }
    const hinted = hintRows.some((hint) => (
      Number.isInteger(hint.turn_index)
      && hint.turn_index <= userTurn.turn_index
      && replyContainsTarget(hint.hint_text, [{ headword: word }])
    ))
    if (hinted) {
      return { sense_id: target.sense_id, verdict: 'hinted', evidence_text: quote || null, needsSense: false }
    }
    if (!quote) {
      return { sense_id: target.sense_id, verdict: 'mentioned', evidence_text: null, needsSense: false }
    }
    return { sense_id: target.sense_id, verdict: 'produced', evidence_text: quote, needsSense: true }
  })
}

export function applyJudgeVerdicts(classified, judged) {
  const byId = new Map((Array.isArray(judged) ? judged : []).map((item) => [item?.sense_id, item?.verdict]))
  return classified.map((item) => {
    if (!item.needsSense) return { ...item, needsSense: false }
    const verdict = byId.get(item.sense_id)
    if (verdict !== 'produced' && verdict !== 'wrong_sense' && verdict !== 'mentioned') {
      throw new DialogueRouteError(502, 'Practice assessment did not confirm the meaning')
    }
    if (verdict === 'produced' && !item.evidence_text) {
      throw new DialogueRouteError(502, 'Practice assessment did not confirm the meaning')
    }
    return { ...item, verdict, needsSense: false }
  })
}

export function buildAssessmentItems({ classified, states, now }) {
  return classified.map((item) => {
    const state = states.get(item.sense_id)
    if (!state || state.card_type !== 'production') {
      throw new DialogueRouteError(404, 'Practice card was not found')
    }
    const quality = item.verdict === 'produced' ? 5 : item.verdict === 'wrong_sense' ? 1 : 0
    const moving = MOVING.has(item.verdict)
    const next = moving
      ? applySm2Review({
        easeFactor: Number(state.ease_factor),
        intervalDays: state.interval_days,
        repetitions: state.repetitions,
      }, quality, now)
      : null
    return {
      sense_id: item.sense_id,
      verdict: item.verdict,
      quality,
      evidence_text: item.evidence_text,
      expected_ease: state.ease_factor,
      expected_interval_days: state.interval_days,
      expected_repetitions: state.repetitions,
      expected_lapses: state.lapses,
      expected_due_at: state.due_at,
      next_ease: moving ? next.easeFactor : state.ease_factor,
      next_interval_days: moving ? next.intervalDays : state.interval_days,
      next_repetitions: moving ? next.repetitions : state.repetitions,
      next_due_at: moving ? next.dueAt.toISOString() : state.due_at,
    }
  })
}

async function readRows(safeSupabaseCall, fn) {
  try {
    const result = await safeSupabaseCall(fn, { timeoutMs: 15000, maxRetries: 1 })
    if (!result || result.error) throw new DialogueRouteError(500, 'Failed to read practice assessment')
    return result.data
  } catch (err) {
    if (err instanceof DialogueRouteError) throw err
    throw new DialogueRouteError(500, 'Failed to read practice assessment')
  }
}

export async function recordChatPracticeExchange({
  supabase,
  safeSupabaseCall = (fn) => fn(),
  userId,
  language,
  dialogueSessionId,
  userText,
  assistantText,
}) {
  let lastError = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await readRows(
        safeSupabaseCall,
        () => supabase.rpc('append_vocab_dialogue_exchange', {
          p_user_id: userId,
          p_dialogue_session_id: dialogueSessionId,
          p_language: language,
          p_user_text: userText,
          p_assistant_text: assistantText,
        }),
      )
      if (result && (result.status === 'recorded' || result.status === 'replayed')) return result
      lastError = new DialogueRouteError(500, 'Failed to store practice exchange')
    } catch (err) {
      lastError = err
    }
  }
  throw lastError || new DialogueRouteError(500, 'Failed to store practice exchange')
}

export function createDialogueAssessmentHandler({
  supabase,
  resolveUserId,
  getBearerToken,
  safeSupabaseCall = (fn) => fn(),
  now = () => new Date(),
  judgeSenses,
}) {
  return async function dialogueAssessmentHandler(req, res) {
    const token = getBearerToken(req)
    if (!token) {
      res.status(401).json({ error: 'Missing Authorization Bearer token' })
      return
    }
    let userId
    try {
      userId = await resolveUserId(req)
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' })
      return
    }
    if (typeof userId !== 'string' || !userId.trim()) {
      res.status(401).json({ error: 'Invalid or expired token' })
      return
    }
    try {
      const dialogueSessionId = typeof req.body?.dialogue_session_id === 'string' ? req.body.dialogue_session_id.trim() : ''
      const requestId = typeof req.body?.request_id === 'string' ? req.body.request_id.trim() : ''
      if (!dialogueSessionId || !requestId || requestId.length > 160) {
        throw new DialogueRouteError(400, 'Practice assessment is invalid')
      }
      const profile = await readRows(
        safeSupabaseCall,
        () => supabase.from('user_profiles').select('learning_language').eq('user_id', userId).maybeSingle(),
      )
      const language = profile?.learning_language === 'zh' ? 'zh' : profile?.learning_language == null || profile?.learning_language === '' ? 'en' : profile?.learning_language
      if (language !== 'en' && language !== 'zh') throw new DialogueRouteError(500, 'Failed to resolve learning language')

      const session = await readRows(
        safeSupabaseCall,
        () => supabase
          .from('vocab_dialogue_sessions')
          .select('id, user_id, language, mode, status')
          .eq('id', dialogueSessionId)
          .maybeSingle(),
      )
      if (!session || session.user_id !== userId) throw new DialogueRouteError(404, 'Practice session was not found')
      if (session.language !== language || (session.mode !== 'chat' && session.mode !== 'roleplay') || (session.status !== 'active' && session.status !== 'assessed')) {
        throw new DialogueRouteError(409, 'Practice session does not belong to this conversation')
      }

      const targetRows = await readRows(
        safeSupabaseCall,
        () => supabase
          .from('vocab_dialogue_targets')
          .select('sense_id, position, headword, gloss_ru, user_id')
          .eq('dialogue_session_id', dialogueSessionId)
          .eq('user_id', userId)
          .order('position', { ascending: true }),
      )
      const targets = (Array.isArray(targetRows) ? targetRows : [])
        .filter((row) => row && row.user_id === userId && row.headword && row.gloss_ru)
      const turns = await readRows(
        safeSupabaseCall,
        () => supabase
          .from('vocab_dialogue_turns')
          .select('turn_index, role, content, user_id, dialogue_session_id')
          .eq('dialogue_session_id', dialogueSessionId)
          .eq('user_id', userId)
          .order('turn_index', { ascending: true }),
      )
      const hints = await readRows(
        safeSupabaseCall,
        () => supabase
          .from('vocab_dialogue_hints')
          .select('turn_index, hint_text, user_id')
          .eq('dialogue_session_id', dialogueSessionId)
          .eq('user_id', userId),
      )
      if (targets.length < 1) throw new DialogueRouteError(409, 'Practice session does not belong to this conversation')
      const reviewedAt = now()
      let classified = classifyDialogueTargets({
        targets,
        turns: (Array.isArray(turns) ? turns : []).filter((row) => row.user_id === userId && row.dialogue_session_id === dialogueSessionId),
        hints: (Array.isArray(hints) ? hints : []).filter((row) => row.user_id === userId),
      })
      if (classified.some((item) => item.needsSense)) {
        if (typeof judgeSenses !== 'function') throw new DialogueRouteError(502, 'Practice assessment did not confirm the meaning')
        let judged
        try {
          judged = await judgeSenses({
            userId,
            items: classified.filter((item) => item.needsSense).map((item) => {
              const target = targets.find((row) => row.sense_id === item.sense_id)
              return {
                sense_id: item.sense_id,
                headword: target.headword,
                gloss_ru: target.gloss_ru,
                evidence_text: item.evidence_text,
              }
            }),
          })
        } catch (err) {
          if (err instanceof DialogueRouteError) throw err
          const status = err?.status === 402 ? 402 : 502
          throw new DialogueRouteError(status, status === 402 ? err.message : 'Practice assessment did not confirm the meaning')
        }
        classified = applyJudgeVerdicts(classified, judged)
      }
      const stateRows = await readRows(
        safeSupabaseCall,
        () => supabase
          .from('vocab_srs_states')
          .select('sense_id, user_id, card_type, ease_factor, interval_days, repetitions, lapses, due_at')
          .eq('user_id', userId)
          .eq('card_type', 'production')
          .in('sense_id', targets.map((target) => target.sense_id)),
      )
      const states = new Map((Array.isArray(stateRows) ? stateRows : [])
        .filter((row) => row && row.user_id === userId && row.card_type === 'production')
        .map((row) => [row.sense_id, row]))
      const items = buildAssessmentItems({ classified, states, now: reviewedAt })
      const committed = await readRows(
        safeSupabaseCall,
        () => supabase.rpc('commit_vocab_dialogue_assessment', {
          p_user_id: userId,
          p_dialogue_session_id: dialogueSessionId,
          p_language: language,
          p_client_request_id: requestId,
          p_reviewed_at: reviewedAt.toISOString(),
          p_items: items,
        }),
      )
      if (!committed || (committed.status !== 'applied' && committed.status !== 'replayed')) {
        const status = committed?.status === 'not_found' ? 404 : 409
        throw new DialogueRouteError(status, 'Practice assessment was not saved')
      }
      res.status(200).json({
        status: committed.status,
        dialogue_session_id: dialogueSessionId,
        replayed: committed.status === 'replayed',
        items: Array.isArray(committed.items) ? committed.items.map((item) => ({
          sense_id: item.sense_id,
          verdict: item.verdict,
          interval_days: item.interval_days,
        })) : [],
      })
    } catch (err) {
      if (res.headersSent) return
      const status = err instanceof DialogueRouteError ? err.status : 500
      if (status === 500) console.error('[api/vocabulary/srs/dialogue/assess] failed')
      res.status(status).json({
        error: err instanceof DialogueRouteError ? err.message : 'Failed to assess practice',
      })
    }
  }
}
