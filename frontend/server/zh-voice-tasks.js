/**
 * CRUD, генерация и проверка китайских голосовых заданий: /api/zh-voice-tasks
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const TYPES = ['voicemail', 'explain', 'retell', 'picture']
const V1_TYPES = ['voicemail', 'explain', 'retell']
const GENERATE_PARTS = ['vocabulary', 'checklist', 'model_answer', 'stimulus']
const STATUSES = ['draft', 'ready']
const SOURCES = ['user', 'system', 'all']
const VERDICTS = ['done', 'almost', 'missed']
const MIN_SEC = 6
const MAX_SEC = 90

function isUuid(id) {
  return typeof id === 'string' && UUID_RE.test(id)
}

function asTrimmed(value, max = 2000) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function asHsk(value) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 6) return null
  return n
}

function asType(value, fallback = 'voicemail') {
  return TYPES.includes(value) ? value : fallback
}

function asV1Type(value, fallback = 'voicemail') {
  return V1_TYPES.includes(value) ? value : fallback
}

function parseLlmJson(raw) {
  let s = String(raw || '').trim()
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start >= 0 && end > start) s = s.slice(start, end + 1)
  return JSON.parse(s)
}

function inferTypeFromIntent(requested, prompt) {
  if (V1_TYPES.includes(requested)) return requested
  const blob = String(prompt || '').toLowerCase()
  if (/пересказ|новост|услыш|своими словам|retell|\bnews\b/.test(blob)) return 'retell'
  if (/болит|врач|потеря|слома|объясн|доктор|боль|жалоб|где болит/.test(blob)) return 'explain'
  return 'voicemail'
}

function asVerdict(value, fallback = 'almost') {
  return VERDICTS.includes(value) ? value : fallback
}

function overallFromChecklist(items) {
  if (!items.length) return 'missed'
  if (items.every((item) => item.status === 'done')) return 'done'
  if (items.every((item) => item.status === 'missed')) return 'missed'
  return 'almost'
}

function normalizeEvaluateChecklist(raw, sourceChecklist) {
  const byId = {}
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const row = item && typeof item === 'object' ? item : {}
      const id = asTrimmed(row.id, 80)
      if (!id) continue
      byId[id] = {
        status: asVerdict(row.status, 'missed'),
        note_ru: asTrimmed(row.note_ru || row.noteRu, 240),
      }
    }
  }
  return (sourceChecklist || []).map((item) => {
    const hit = byId[item.id]
    return {
      id: item.id,
      label_ru: item.label_ru,
      status: hit ? hit.status : 'missed',
      note_ru: hit?.note_ru || 'В записи этого не слышно',
    }
  })
}

function applyTypeLocks(payload, type) {
  const next = { ...payload, type: asV1Type(type, asV1Type(payload.type)) }
  if (next.type !== 'retell') {
    next.stimulus_zh = null
    next.stimulus_pinyin = null
    next.stimulus_ru = null
  }
  next.scene_ru = null
  return next
}

function playableError(payload, type) {
  if (!payload.instruction_ru) return 'ИИ не вернул формулировку задания'
  if (!Array.isArray(payload.checklist) || payload.checklist.length < 2) {
    return 'ИИ не вернул чеклист из 2–4 пунктов'
  }
  if (!payload.model_answer_zh) return 'ИИ не вернул эталон'
  if (type === 'retell' && !payload.stimulus_zh) return 'Для пересказа нужен стимул'
  return null
}

function defaultTimeTarget(hsk) {
  if (!hsk || hsk <= 2) return 25
  if (hsk === 3) return 35
  return 45
}

function asTimeTarget(value, hsk) {
  const n = Number(value)
  const fallback = defaultTimeTarget(hsk)
  if (!Number.isFinite(n)) return fallback
  return Math.min(MAX_SEC, Math.max(MIN_SEC, Math.round(n)))
}

function asNullable(value, max) {
  const s = asTrimmed(value, max)
  return s || null
}

function normalizeChecklist(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .slice(0, 8)
    .map((item, index) => {
      const row = item && typeof item === 'object' ? item : {}
      const label = asTrimmed(row.label_ru || row.labelRu, 200)
      if (!label) return null
      return {
        id: asTrimmed(row.id, 80) || `item-${index + 1}`,
        label_ru: label,
      }
    })
    .filter(Boolean)
}

function normalizeVocab(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .slice(0, 12)
    .map((item) => {
      const v = item && typeof item === 'object' ? item : {}
      const hanzi = asTrimmed(v.hanzi, 50)
      if (!hanzi) return null
      return {
        hanzi,
        pinyin: asTrimmed(v.pinyin, 80),
        translation_ru: asTrimmed(v.translation_ru || v.translationRu, 120),
        hsk_level: asHsk(v.hsk_level ?? v.hskLevel) ?? undefined,
      }
    })
    .filter(Boolean)
}

function buildPayload(input = {}, columns = {}) {
  const src = input && typeof input === 'object' ? input : {}
  const hsk = asHsk(src.hsk_level ?? src.hskLevel ?? columns.hsk_level)
  const type = asType(src.type ?? columns.type)
  const checklist = normalizeChecklist(src.checklist)
  const vocabulary = normalizeVocab(src.vocabulary)
  return {
    language: 'zh',
    type,
    description: asTrimmed(src.description || columns.description, 500) || undefined,
    hsk_level: hsk ?? undefined,
    time_target_sec: asTimeTarget(src.time_target_sec ?? src.timeTargetSec, hsk),
    situation_ru: asTrimmed(src.situation_ru || src.situationRu, 500) || undefined,
    instruction_ru: asTrimmed(src.instruction_ru || src.instructionRu, 800),
    checklist,
    vocabulary,
    stimulus_zh: asNullable(src.stimulus_zh || src.stimulusZh, 800),
    stimulus_pinyin: asNullable(src.stimulus_pinyin || src.stimulusPinyin, 800),
    stimulus_ru: asNullable(src.stimulus_ru || src.stimulusRu, 800),
    scene_ru: asNullable(src.scene_ru || src.sceneRu, 800),
    model_answer_zh: asTrimmed(src.model_answer_zh || src.modelAnswerZh, 800) || undefined,
    model_answer_pinyin: asTrimmed(src.model_answer_pinyin || src.modelAnswerPinyin, 800) || undefined,
    model_answer_ru: asTrimmed(src.model_answer_ru || src.modelAnswerRu, 800) || undefined,
  }
}

function inferStatus(title, payload, explicit) {
  if (explicit && STATUSES.includes(explicit)) return explicit
  const checklistOk = Array.isArray(payload.checklist) && payload.checklist.length >= 2
  const instructionOk = Boolean(payload.instruction_ru)
  const hskOk = Boolean(payload.hsk_level)
  return title && checklistOk && instructionOk && hskOk ? 'ready' : 'draft'
}

function toApiTask(row, extras = {}) {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
  const hsk = row.hsk_level ?? payload.hsk_level ?? null
  return {
    id: row.id,
    source: row.source,
    language: 'zh',
    status: row.status,
    archived: Boolean(row.archived),
    title: row.title,
    description: row.description || payload.description || '',
    type: asType(row.type || payload.type),
    hsk_level: hsk,
    time_target_sec: asTimeTarget(payload.time_target_sec, hsk),
    situation_ru: payload.situation_ru || '',
    instruction_ru: payload.instruction_ru || '',
    checklist: Array.isArray(payload.checklist) ? payload.checklist : [],
    vocabulary: Array.isArray(payload.vocabulary) ? payload.vocabulary : [],
    stimulus_zh: payload.stimulus_zh ?? null,
    stimulus_pinyin: payload.stimulus_pinyin ?? null,
    stimulus_ru: payload.stimulus_ru ?? null,
    scene_ru: payload.scene_ru ?? null,
    model_answer_zh: payload.model_answer_zh || '',
    model_answer_pinyin: payload.model_answer_pinyin || '',
    model_answer_ru: payload.model_answer_ru || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
    attempts_count: extras.attempts_count ?? 0,
    last_attempted_at: extras.last_attempted_at ?? null,
  }
}

function columnsFromBody(body, payload) {
  return {
    title: asTrimmed(body.title ?? payload.title, 200) || 'Новое задание',
    description: asTrimmed(body.description ?? payload.description, 500) || null,
    type: asType(body.type ?? payload.type),
    hsk_level: asHsk(body.hsk_level ?? body.hskLevel ?? payload.hsk_level),
  }
}

function payloadFieldsTouched(body) {
  return (
    body.payload !== undefined
    || body.checklist !== undefined
    || body.vocabulary !== undefined
    || body.instruction_ru !== undefined
    || body.instructionRu !== undefined
    || body.situation_ru !== undefined
    || body.time_target_sec !== undefined
    || body.stimulus_zh !== undefined
    || body.model_answer_zh !== undefined
    || body.scene_ru !== undefined
    || body.type !== undefined
  )
}

async function attachAttemptStats(supabase, userId, list) {
  const ids = list.map((t) => t.id).filter(Boolean)
  if (!ids.length) return list
  const { data: attempts } = await supabase
    .from('zh_voice_task_attempts')
    .select('task_id, created_at, status')
    .eq('user_id', userId)
    .in('task_id', ids)
    .eq('status', 'checked')
  const byTask = {}
  for (const a of attempts || []) {
    const id = a.task_id
    if (!id) continue
    if (!byTask[id]) byTask[id] = { count: 0, lastAttemptedAt: null }
    byTask[id].count += 1
    const at = a.created_at ? new Date(a.created_at).toISOString() : null
    if (at && (!byTask[id].lastAttemptedAt || at > byTask[id].lastAttemptedAt)) {
      byTask[id].lastAttemptedAt = at
    }
  }
  for (const t of list) {
    const stats = byTask[t.id]
    t.attempts_count = stats ? stats.count : 0
    t.last_attempted_at = stats?.lastAttemptedAt ?? null
  }
  return list
}

const ZH_VOICE_GENERATE_SYSTEM = `You design ONE-SHOT Simplified Chinese speaking tasks for Russian-speaking learners (HSK 1–6).
This is NOT a roleplay and NOT a dialogue. The learner records ONE voice message. Nobody answers.

Output ONLY valid JSON, no markdown, no code fence. Schema:
{
  "title": "short title in Russian",
  "description": "one sentence in Russian",
  "type": "voicemail" | "explain" | "retell",
  "hsk_level": 2,
  "time_target_sec": 25,
  "situation_ru": "situation in Russian",
  "instruction_ru": "what the learner must say, Russian, one short paragraph",
  "checklist": [
    { "id": "where", "label_ru": "Куда ехать" },
    { "id": "when", "label_ru": "Когда / не спешить" }
  ],
  "vocabulary": [
    { "hanzi": "机场", "pinyin": "jīchǎng", "translation_ru": "аэропорт", "hsk_level": 2 }
  ],
  "stimulus_zh": null,
  "stimulus_pinyin": null,
  "stimulus_ru": null,
  "model_answer_zh": "师傅，去机场，不着急。",
  "model_answer_pinyin": "shīfu, qù jīchǎng, bù zhāojí.",
  "model_answer_ru": "Шофёр, на аэропорт, не торопитесь."
}

Rules:
- Never include roles, steps, character_opening, who starts, ai_role, user_role, personality.
- If the learner described a dialogue, compress it into ONE voicemail or explanation.
- type must be voicemail, explain, or retell. Never picture.
- UI strings (title, description, situation_ru, instruction_ru, checklist.label_ru, translations, model_answer_ru, stimulus_ru) in Russian.
- Spoken Chinese fields: Simplified Chinese only. Pinyin WITH tone marks.
- checklist: 2–4 items. These are how the attempt will be judged.
- vocabulary: 4–8 words at or below the given HSK. Supports, not a rigid whitelist.
- model_answer: 1–4 short sentences at the same HSK. This is shown AFTER the attempt, never as a script to read.
- retell: stimulus_zh is 2–4 sentences the learner hears first, then retells in their own words. Include pinyin and Russian.
- voicemail / explain: stimulus_* MUST be null.
- time_target_sec: HSK 1–2 ≈ 20–30, HSK 3 ≈ 30–40, HSK 4+ ≈ 40–50. Never above 90.
- No profanity. No English in Chinese fields.`

const ZH_VOICE_GENERATE_PART_SYSTEM = `You update ONE part of an existing Simplified Chinese one-shot speaking task.
Output ONLY valid JSON, no markdown, no code fence.
Keep the same HSK, type, and situation. Do not rewrite parts you were not asked to change.
Chinese fields: Simplified Chinese only. UI strings: Russian. Pinyin with tone marks.
This is still NOT a dialogue: no roles, steps, or character lines.`

const ZH_VOICE_EVALUATE_SYSTEM = `You check ONE Simplified Chinese speaking attempt against a checklist.
The transcript comes from speech-to-text and MAY contain wrong characters, missing particles, or near-homophones. Judge MEANING, not exact hanzi match.

Output ONLY valid JSON, no markdown, no code fence:
{
  "verdict": "done" | "almost" | "missed",
  "checklist": [{ "id": "where", "status": "done" | "almost" | "missed", "note_ru": "one short Russian sentence" }],
  "strength_ru": "one short Russian sentence about what worked",
  "next_try_zh": "a better version the learner can say next time",
  "next_try_pinyin": "pinyin with tone marks",
  "next_try_ru": "Russian",
  "model_answer_zh": "...",
  "model_answer_pinyin": "...",
  "model_answer_ru": "..."
}

Rules:
- checklist MUST include every given id. Do not add new ids.
- done = the point is clearly covered in meaning.
- almost = partly covered or only implied.
- missed = not there.
- overall verdict: done if all items done; missed if all missed; otherwise almost.
- NEVER score pronunciation, tones, fluency, or give 1–10 numbers.
- Do not mention Whisper, STT, AI, or that this is an exam.
- model_answer: 1–4 short sentences at the given HSK. If the card already has a model answer, you may keep or lightly polish it, never make it harder than HSK.
- next_try: a natural reformulation at the same HSK.
- Notes in Russian. Spoken Chinese: Simplified only. Pinyin WITH tone marks.
- This is NOT a dialogue. Nobody replies to the learner.`

export function registerZhVoiceTaskRoutes(app, {
  supabase,
  safeSupabaseCall,
  getBearerToken,
  verifyBackendJwt,
  llm,
  model,
  getBalance,
  deductBalance,
  getCost,
  BALANCE_THRESHOLD_RUB,
}) {
  function requireAuth(req, res) {
    const rawToken = getBearerToken(req)
    if (!rawToken) {
      res.status(401).json({ error: 'Missing Authorization Bearer token' })
      return null
    }
    const decoded = verifyBackendJwt(rawToken)
    if (!decoded || !decoded.sub) {
      res.status(401).json({ error: 'Invalid or expired token' })
      return null
    }
    return decoded.sub
  }

  const selectCols =
    'id, user_id, source, title, description, type, hsk_level, archived, status, payload, created_at, updated_at'

  app.post('/api/zh-voice-tasks/generate', async (req, res) => {
    const userId = requireAuth(req, res)
    if (!userId) return
    if (!llm || !model) {
      return res.status(500).json({ error: 'Generation is not configured' })
    }

    if (typeof getBalance === 'function' && BALANCE_THRESHOLD_RUB != null) {
      const balance = await getBalance(supabase, userId)
      if (balance < BALANCE_THRESHOLD_RUB) {
        return res.status(402).json({ error: 'Пополните баланс' })
      }
    }

    const body = req.body || {}
    if (body.type === 'picture') {
      return res.status(400).json({ error: 'Тип «картинка» будет позже' })
    }
    const prompt = asTrimmed(body.prompt, 2000)
    const textbookTitle = asTrimmed(body.textbook_title || body.textbookTitle, 200)
    const lessonNo = asTrimmed(body.lesson_no || body.lessonNo, 80)
    const goal = asTrimmed(body.goal, 400)
    const hsk = asHsk(body.hsk_level ?? body.hskLevel) || 2
    const typeHint = inferTypeFromIntent(body.type, prompt)

    if (!prompt && !(textbookTitle && (goal || lessonNo))) {
      return res.status(400).json({
        error: 'Опишите задание или укажите учебник и что отработать',
      })
    }

    const parts = []
    if (prompt) parts.push(`Learner request (Russian): ${prompt}`)
    if (textbookTitle) parts.push(`Textbook: ${textbookTitle}`)
    if (lessonNo) parts.push(`Lesson: ${lessonNo}`)
    if (goal) parts.push(`Practice goal: ${goal}`)
    parts.push(`HSK level: ${hsk}`)
    parts.push(`Task type (mandatory): ${typeHint}`)
    parts.push('If the request sounds like a dialogue, compress it into one voice message. Nobody replies.')
    parts.push('Hard forbidden themes: sexual content involving minors, extremism, violent crime instructions, doxxing, real-world threats.')
    const userPrompt = `${parts.join('\n')}\n\nGenerate the speaking-task JSON now.`

    async function runOnce() {
      return llm.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: ZH_VOICE_GENERATE_SYSTEM },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1800,
        temperature: 0.4,
      })
    }

    try {
      let completion = await runOnce()
      let raw = completion.choices?.[0]?.message?.content?.trim() || ''
      let parsed
      try {
        parsed = parseLlmJson(raw)
      } catch {
        completion = await runOnce()
        raw = completion.choices?.[0]?.message?.content?.trim() || ''
        try {
          parsed = parseLlmJson(raw)
        } catch {
          console.error('[api/zh-voice-tasks/generate] Invalid JSON:', raw.slice(0, 400))
          return res.status(422).json({ error: 'Не удалось разобрать ответ ИИ, попробуйте ещё раз' })
        }
      }

      let payload = applyTypeLocks(
        buildPayload(
          {
            ...parsed,
            type: typeHint,
            hsk_level: asHsk(parsed.hsk_level) || hsk,
          },
          { type: typeHint, hsk_level: hsk }
        ),
        typeHint
      )
      if (payload.checklist.length > 4) payload.checklist = payload.checklist.slice(0, 4)
      if (payload.vocabulary.length > 8) payload.vocabulary = payload.vocabulary.slice(0, 8)

      const errMsg = playableError(payload, payload.type)
      if (errMsg) {
        return res.status(422).json({ error: `${errMsg}, попробуйте ещё раз` })
      }

      const title = asTrimmed(parsed.title, 200) || 'Новое задание'
      const hskOut = asHsk(parsed.hsk_level) || hsk

      const usage = completion?.usage
      if (usage && typeof deductBalance === 'function' && typeof getCost === 'function') {
        const costRub = getCost(model, usage)
        if (costRub > 0) {
          await deductBalance(supabase, userId, costRub, model, { zh_voice_task_generate: true })
        }
      }

      res.json({
        title,
        type: payload.type,
        hsk_level: hskOut,
        payload: {
          ...payload,
          hsk_level: hskOut,
        },
      })
    } catch (err) {
      console.error('[api/zh-voice-tasks/generate] error:', err?.message)
      res.status(500).json({ error: err?.message || 'Task generation failed' })
    }
  })

  app.post('/api/zh-voice-tasks/generate-part', async (req, res) => {
    const userId = requireAuth(req, res)
    if (!userId) return
    if (!llm || !model) {
      return res.status(500).json({ error: 'Generation is not configured' })
    }

    if (typeof getBalance === 'function' && BALANCE_THRESHOLD_RUB != null) {
      const balance = await getBalance(supabase, userId)
      if (balance < BALANCE_THRESHOLD_RUB) {
        return res.status(402).json({ error: 'Пополните баланс' })
      }
    }

    const body = req.body || {}
    const part = body.part
    if (!GENERATE_PARTS.includes(part)) {
      return res.status(400).json({ error: 'part должен быть vocabulary, checklist, model_answer или stimulus' })
    }
    const src = body.task && typeof body.task === 'object' ? body.task : {}
    const type = asV1Type(src.type)
    if (part === 'stimulus' && type !== 'retell') {
      return res.status(400).json({ error: 'Стимул только для пересказа' })
    }
    const payload = applyTypeLocks(buildPayload(src, src), type)
    const title = asTrimmed(src.title, 200) || 'Задание'
    const hsk = asHsk(src.hsk_level ?? src.hskLevel ?? payload.hsk_level) || 2
    const note = asTrimmed(body.note, 400)

    const snapshot = {
      title,
      description: payload.description,
      type: payload.type,
      hsk_level: hsk,
      time_target_sec: payload.time_target_sec,
      situation_ru: payload.situation_ru,
      instruction_ru: payload.instruction_ru,
      checklist: payload.checklist,
      vocabulary: payload.vocabulary,
      stimulus_zh: payload.stimulus_zh,
      stimulus_pinyin: payload.stimulus_pinyin,
      stimulus_ru: payload.stimulus_ru,
      model_answer_zh: payload.model_answer_zh,
      model_answer_pinyin: payload.model_answer_pinyin,
      model_answer_ru: payload.model_answer_ru,
    }

    let want = ''
    if (part === 'vocabulary') {
      want =
        'Regenerate ONLY vocabulary (4–8 items). JSON: {"vocabulary":[{"hanzi":"","pinyin":"","translation_ru":"","hsk_level":1}]}. ' +
        'Stay at or below the HSK. Pinyin with tone marks.'
    } else if (part === 'checklist') {
      want =
        'Regenerate ONLY checklist (2–4 items). JSON: {"checklist":[{"id":"item-1","label_ru":""}]}. ' +
        'Each item is one thing the learner must cover in a single utterance. Russian labels.'
    } else if (part === 'model_answer') {
      want =
        'Regenerate ONLY the model answer. JSON: {"model_answer_zh":"","model_answer_pinyin":"","model_answer_ru":""}. ' +
        '1–4 short sentences at this HSK. Simplified Chinese + pinyin with tones + Russian.'
    } else {
      want =
        'Regenerate ONLY the retell stimulus. JSON: {"stimulus_zh":"","stimulus_pinyin":"","stimulus_ru":""}. ' +
        '2–4 sentences the learner hears before speaking. Same HSK. Not the model answer.'
    }

    const userPrompt = [
      `Current task JSON:\n${JSON.stringify(snapshot)}`,
      want,
      note ? `Extra instruction from the author: ${note}` : '',
      'Generate the JSON now.',
    ]
      .filter(Boolean)
      .join('\n\n')

    async function runOnce() {
      return llm.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: ZH_VOICE_GENERATE_PART_SYSTEM },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1200,
        temperature: 0.45,
      })
    }

    try {
      let completion = await runOnce()
      let raw = completion.choices?.[0]?.message?.content?.trim() || ''
      let parsed
      try {
        parsed = parseLlmJson(raw)
      } catch {
        completion = await runOnce()
        raw = completion.choices?.[0]?.message?.content?.trim() || ''
        parsed = parseLlmJson(raw)
      }

      let patch = {}
      if (part === 'vocabulary') {
        const vocabulary = normalizeVocab(parsed.vocabulary).slice(0, 8)
        if (vocabulary.length < 2) {
          return res.status(422).json({ error: 'ИИ не вернул словарь, попробуйте ещё раз' })
        }
        patch = { vocabulary }
      } else if (part === 'checklist') {
        const checklist = normalizeChecklist(parsed.checklist).slice(0, 4)
        if (checklist.length < 2) {
          return res.status(422).json({ error: 'ИИ не вернул чеклист, попробуйте ещё раз' })
        }
        patch = { checklist }
      } else if (part === 'model_answer') {
        const model_answer_zh = asTrimmed(parsed.model_answer_zh, 800)
        const model_answer_pinyin = asTrimmed(parsed.model_answer_pinyin, 800)
        const model_answer_ru = asTrimmed(parsed.model_answer_ru, 800)
        if (!model_answer_zh) {
          return res.status(422).json({ error: 'ИИ не вернул эталон, попробуйте ещё раз' })
        }
        patch = { model_answer_zh, model_answer_pinyin, model_answer_ru }
      } else {
        const stimulus_zh = asTrimmed(parsed.stimulus_zh, 800)
        const stimulus_pinyin = asTrimmed(parsed.stimulus_pinyin, 800)
        const stimulus_ru = asTrimmed(parsed.stimulus_ru, 800)
        if (!stimulus_zh) {
          return res.status(422).json({ error: 'ИИ не вернул стимул, попробуйте ещё раз' })
        }
        patch = { stimulus_zh, stimulus_pinyin, stimulus_ru }
      }

      const usage = completion?.usage
      if (usage && typeof deductBalance === 'function' && typeof getCost === 'function') {
        const costRub = getCost(model, usage)
        if (costRub > 0) {
          await deductBalance(supabase, userId, costRub, model, { zh_voice_task_generate_part: true, part })
        }
      }

      res.json({ part, patch })
    } catch (err) {
      console.error('[api/zh-voice-tasks/generate-part] error:', err?.message)
      res.status(500).json({ error: err?.message || 'Part generation failed' })
    }
  })

  app.post('/api/zh-voice-tasks/evaluate', async (req, res) => {
    const userId = requireAuth(req, res)
    if (!userId) return
    if (!llm || !model) {
      return res.status(500).json({ error: 'Evaluation is not configured' })
    }

    if (typeof getBalance === 'function' && BALANCE_THRESHOLD_RUB != null) {
      const balance = await getBalance(supabase, userId)
      if (balance < BALANCE_THRESHOLD_RUB) {
        return res.status(402).json({ error: 'Пополните баланс' })
      }
    }

    const body = req.body || {}
    const transcript = asTrimmed(body.transcript, 4000)
    if (!transcript) {
      return res.status(400).json({ error: 'Нужен транскрипт попытки' })
    }
    const durationSec = Number.isFinite(Number(body.duration_sec))
      ? Math.max(0, Math.round(Number(body.duration_sec)))
      : 0
    const attemptId = isUuid(body.attempt_id) ? body.attempt_id : null
    const taskId = isUuid(body.task_id) ? body.task_id : null

    try {
      let card = null
      if (taskId) {
        const { data, error } = await safeSupabaseCall(
          () => supabase.from('zh_voice_tasks').select(selectCols).eq('id', taskId).maybeSingle(),
          { timeoutMs: 10000, maxRetries: 2 }
        )
        if (error) return res.status(500).json({ error: error.message || 'Failed to load task' })
        if (data && (data.source === 'system' || data.user_id === userId)) {
          card = toApiTask(data)
        }
      }

      const src = body.task && typeof body.task === 'object' ? body.task : null
      if (src) {
        const type = asV1Type(src.type || card?.type)
        const payload = applyTypeLocks(buildPayload(src, src), type)
        card = {
          ...(card || {}),
          title: asTrimmed(src.title, 200) || card?.title || 'Задание',
          type: payload.type,
          hsk_level: asHsk(src.hsk_level ?? src.hskLevel ?? payload.hsk_level) || card?.hsk_level || 2,
          instruction_ru: payload.instruction_ru || card?.instruction_ru || '',
          situation_ru: payload.situation_ru || card?.situation_ru || '',
          checklist: payload.checklist.length ? payload.checklist : (card?.checklist || []),
          vocabulary: payload.vocabulary.length ? payload.vocabulary : (card?.vocabulary || []),
          stimulus_zh: payload.stimulus_zh ?? card?.stimulus_zh ?? null,
          stimulus_pinyin: payload.stimulus_pinyin ?? card?.stimulus_pinyin ?? null,
          stimulus_ru: payload.stimulus_ru ?? card?.stimulus_ru ?? null,
          model_answer_zh: payload.model_answer_zh || card?.model_answer_zh || '',
          model_answer_pinyin: payload.model_answer_pinyin || card?.model_answer_pinyin || '',
          model_answer_ru: payload.model_answer_ru || card?.model_answer_ru || '',
        }
      }

      const checklist = Array.isArray(card?.checklist) ? card.checklist.filter((item) => item?.id && item?.label_ru) : []
      if (!card || checklist.length < 2) {
        return res.status(400).json({ error: 'Нужна карточка с чеклистом из 2–4 пунктов' })
      }

      const snapshot = {
        title: card.title,
        type: card.type,
        hsk_level: card.hsk_level || 2,
        situation_ru: card.situation_ru,
        instruction_ru: card.instruction_ru,
        checklist,
        vocabulary: card.vocabulary || [],
        stimulus_zh: card.stimulus_zh,
        stimulus_ru: card.stimulus_ru,
        model_answer_zh: card.model_answer_zh,
        model_answer_pinyin: card.model_answer_pinyin,
        model_answer_ru: card.model_answer_ru,
      }

      const userPrompt = [
        `Task JSON:\n${JSON.stringify(snapshot)}`,
        `Learner transcript (speech-to-text, may be noisy):\n${transcript}`,
        `Duration seconds: ${durationSec || 'unknown'}`,
        'Judge checklist coverage by meaning. Return the evaluation JSON now.',
      ].join('\n\n')

      async function runOnce() {
        return llm.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: ZH_VOICE_EVALUATE_SYSTEM },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 1200,
          temperature: 0.2,
        })
      }

      let completion = await runOnce()
      let raw = completion.choices?.[0]?.message?.content?.trim() || ''
      let parsed
      try {
        parsed = parseLlmJson(raw)
      } catch {
        completion = await runOnce()
        raw = completion.choices?.[0]?.message?.content?.trim() || ''
        try {
          parsed = parseLlmJson(raw)
        } catch {
          console.error('[api/zh-voice-tasks/evaluate] Invalid JSON:', raw.slice(0, 400))
          return res.status(422).json({ error: 'Не удалось разобрать проверку, попробуйте ещё раз' })
        }
      }

      const checklistResult = normalizeEvaluateChecklist(parsed.checklist, checklist)
      const verdict = overallFromChecklist(checklistResult)
      const result = {
        verdict,
        checklist: checklistResult,
        strength_ru: asTrimmed(parsed.strength_ru, 400) || 'Ты сказал задание целиком — это уже шаг.',
        next_try_zh: asTrimmed(parsed.next_try_zh, 800),
        next_try_pinyin: asTrimmed(parsed.next_try_pinyin, 800),
        next_try_ru: asTrimmed(parsed.next_try_ru, 800),
        model_answer_zh: asTrimmed(parsed.model_answer_zh, 800) || card.model_answer_zh || '',
        model_answer_pinyin: asTrimmed(parsed.model_answer_pinyin, 800) || card.model_answer_pinyin || '',
        model_answer_ru: asTrimmed(parsed.model_answer_ru, 800) || card.model_answer_ru || '',
      }

      const now = new Date().toISOString()
      const attemptPatch = {
        transcript,
        duration_sec: durationSec || null,
        checklist_result: result,
        feedback: result.strength_ru,
        model_answer_zh: result.model_answer_zh || null,
        status: 'checked',
        updated_at: now,
      }

      if (attemptId) {
        const { error: updateErr } = await supabase
          .from('zh_voice_task_attempts')
          .update(attemptPatch)
          .eq('id', attemptId)
          .eq('user_id', userId)
        if (updateErr) {
          console.error('[api/zh-voice-tasks/evaluate] attempt update:', updateErr.message)
        }
      } else if (taskId) {
        const { error: insertErr } = await supabase.from('zh_voice_task_attempts').insert({
          user_id: userId,
          task_id: taskId,
          hsk_level: card.hsk_level ?? null,
          ...attemptPatch,
          created_at: now,
        })
        if (insertErr) {
          console.error('[api/zh-voice-tasks/evaluate] attempt insert:', insertErr.message)
        }
      }

      const usage = completion?.usage
      if (usage && typeof deductBalance === 'function' && typeof getCost === 'function') {
        const costRub = getCost(model, usage)
        if (costRub > 0) {
          await deductBalance(supabase, userId, costRub, model, { zh_voice_task_evaluate: true })
        }
      }

      res.json(result)
    } catch (err) {
      console.error('[api/zh-voice-tasks/evaluate] error:', err?.message)
      res.status(500).json({ error: err?.message || 'Task evaluation failed' })
    }
  })

  app.get('/api/zh-voice-tasks', async (req, res) => {
    const userId = requireAuth(req, res)
    if (!userId) return

    const archivedParam = req.query.archived
    let archivedFilter = null
    if (archivedParam === 'true') archivedFilter = true
    else if (archivedParam === 'false') archivedFilter = false

    const sourceParam = SOURCES.includes(req.query.source) ? req.query.source : 'all'
    const hsk = asHsk(req.query.hsk)
    const type = TYPES.includes(req.query.type) ? req.query.type : null
    const q = asTrimmed(req.query.q, 120).toLowerCase()
    const sort = req.query.sort === 'last_used' ? 'last_used' : 'updated'

    try {
      let query = supabase.from('zh_voice_tasks').select(selectCols)
      if (sourceParam === 'user') {
        query = query.eq('user_id', userId).eq('source', 'user')
      } else if (sourceParam === 'system') {
        query = query.eq('source', 'system')
      } else {
        query = query.or(`and(source.eq.user,user_id.eq.${userId}),source.eq.system`)
      }
      if (archivedFilter !== null) query = query.eq('archived', archivedFilter)
      if (hsk) query = query.eq('hsk_level', hsk)
      if (type) query = query.eq('type', type)
      query = query.order('updated_at', { ascending: false })

      const { data, error } = await safeSupabaseCall(() => query, { timeoutMs: 15000, maxRetries: 2 })
      if (error) {
        console.error('[api/zh-voice-tasks] list error:', error.message)
        return res.status(500).json({ error: error.message || 'Failed to list tasks' })
      }

      let list = (data || []).map((row) => toApiTask(row))
      if (q) {
        list = list.filter((t) => {
          const hay = `${t.title} ${t.description || ''} ${t.situation_ru || ''} ${t.instruction_ru || ''}`.toLowerCase()
          return hay.includes(q)
        })
      }
      await attachAttemptStats(supabase, userId, list)
      if (sort === 'last_used') {
        list.sort((a, b) => {
          const aAt = a.last_attempted_at || a.updated_at || a.created_at || ''
          const bAt = b.last_attempted_at || b.updated_at || b.created_at || ''
          return String(bAt).localeCompare(String(aAt))
        })
      }
      res.json({ tasks: list })
    } catch (err) {
      console.error('[api/zh-voice-tasks] error:', err?.message)
      res.status(500).json({ error: err?.message || 'Failed to list tasks' })
    }
  })

  app.get('/api/zh-voice-tasks/:id', async (req, res) => {
    const userId = requireAuth(req, res)
    if (!userId) return
    const { id } = req.params
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid task id' })

    try {
      const { data, error } = await safeSupabaseCall(
        () => supabase.from('zh_voice_tasks').select(selectCols).eq('id', id).maybeSingle(),
        { timeoutMs: 10000, maxRetries: 2 }
      )
      if (error) return res.status(500).json({ error: error.message || 'Failed to get task' })
      if (!data) return res.status(404).json({ error: 'Task not found' })
      if (data.source === 'user' && data.user_id !== userId) {
        return res.status(404).json({ error: 'Task not found' })
      }
      const task = toApiTask(data)
      await attachAttemptStats(supabase, userId, [task])
      res.json(task)
    } catch (err) {
      console.error('[api/zh-voice-tasks/:id] error:', err?.message)
      res.status(500).json({ error: err?.message || 'Failed to get task' })
    }
  })

  app.post('/api/zh-voice-tasks', async (req, res) => {
    const userId = requireAuth(req, res)
    if (!userId) return

    const body = req.body || {}
    const payload = buildPayload(
      body.payload && typeof body.payload === 'object' ? { ...body, ...body.payload } : body,
      body
    )
    const cols = columnsFromBody(body, payload)
    const title = asTrimmed(body.title, 200)
    if (!title) {
      return res.status(400).json({ error: 'title is required' })
    }
    const status = inferStatus(title, payload, body.status)
    const now = new Date().toISOString()

    try {
      const { data, error } = await safeSupabaseCall(
        () =>
          supabase
            .from('zh_voice_tasks')
            .insert({
              user_id: userId,
              source: 'user',
              title,
              description: cols.description,
              type: cols.type,
              hsk_level: cols.hsk_level,
              archived: false,
              status,
              payload: { ...payload, description: cols.description || payload.description || '' },
              updated_at: now,
            })
            .select(selectCols)
            .single(),
        { timeoutMs: 15000, maxRetries: 2 }
      )
      if (error) {
        console.error('[api/zh-voice-tasks] insert error:', error.message)
        return res.status(500).json({ error: error.message || 'Failed to create task' })
      }
      res.status(201).json(toApiTask(data))
    } catch (err) {
      console.error('[api/zh-voice-tasks] error:', err?.message)
      res.status(500).json({ error: err?.message || 'Failed to create task' })
    }
  })

  app.patch('/api/zh-voice-tasks/:id', async (req, res) => {
    const userId = requireAuth(req, res)
    if (!userId) return
    const { id } = req.params
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid task id' })

    const body = req.body || {}

    try {
      const { data: existing, error: getErr } = await safeSupabaseCall(
        () =>
          supabase
            .from('zh_voice_tasks')
            .select(selectCols)
            .eq('id', id)
            .eq('user_id', userId)
            .eq('source', 'user')
            .maybeSingle(),
        { timeoutMs: 10000, maxRetries: 2 }
      )
      if (getErr) return res.status(500).json({ error: getErr.message || 'Failed to update task' })
      if (!existing) return res.status(404).json({ error: 'Task not found' })

      const mergedInput = {
        ...(existing.payload || {}),
        ...(body.payload && typeof body.payload === 'object' ? body.payload : {}),
        ...body,
      }
      const payload = buildPayload(mergedInput, {
        type: body.type ?? existing.type,
        hsk_level: body.hsk_level ?? body.hskLevel ?? existing.hsk_level,
        description: body.description ?? existing.description,
      })
      if (typeof body.description === 'string') payload.description = asTrimmed(body.description, 500)
      else if (typeof existing.description === 'string') payload.description = existing.description

      const updates = { updated_at: new Date().toISOString() }
      if (typeof body.title === 'string' && body.title.trim()) updates.title = asTrimmed(body.title, 200)
      if (typeof body.description === 'string') updates.description = asTrimmed(body.description, 500) || null
      if (body.hsk_level !== undefined || body.hskLevel !== undefined) {
        updates.hsk_level = asHsk(body.hsk_level ?? body.hskLevel)
      }
      if (body.type !== undefined) updates.type = asType(body.type, existing.type)
      if (typeof body.archived === 'boolean') updates.archived = body.archived

      if (payloadFieldsTouched(body)) {
        updates.payload = payload
        updates.type = payload.type
        if (payload.hsk_level !== undefined) updates.hsk_level = payload.hsk_level ?? null
      }

      const nextTitle = updates.title || existing.title
      const nextPayload = updates.payload || existing.payload
      if (body.status !== undefined || updates.payload) {
        updates.status = inferStatus(nextTitle, nextPayload, body.status)
      }

      if (Object.keys(updates).length <= 1) {
        return res.status(400).json({ error: 'No valid fields to update' })
      }

      const { data, error } = await safeSupabaseCall(
        () =>
          supabase
            .from('zh_voice_tasks')
            .update(updates)
            .eq('id', id)
            .eq('user_id', userId)
            .eq('source', 'user')
            .select(selectCols)
            .single(),
        { timeoutMs: 15000, maxRetries: 2 }
      )
      if (error) {
        if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Task not found' })
        return res.status(500).json({ error: error.message || 'Failed to update task' })
      }
      res.json(toApiTask(data))
    } catch (err) {
      console.error('[api/zh-voice-tasks PATCH] error:', err?.message)
      res.status(500).json({ error: err?.message || 'Failed to update task' })
    }
  })

  app.delete('/api/zh-voice-tasks/:id', async (req, res) => {
    const userId = requireAuth(req, res)
    if (!userId) return
    const { id } = req.params
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid task id' })

    try {
      const { data, error } = await safeSupabaseCall(
        () =>
          supabase
            .from('zh_voice_tasks')
            .delete()
            .eq('id', id)
            .eq('user_id', userId)
            .eq('source', 'user')
            .select('id')
            .maybeSingle(),
        { timeoutMs: 15000, maxRetries: 2 }
      )
      if (error) return res.status(500).json({ error: error.message || 'Failed to delete task' })
      if (!data) return res.status(404).json({ error: 'Task not found' })
      res.status(204).send()
    } catch (err) {
      console.error('[api/zh-voice-tasks DELETE] error:', err?.message)
      res.status(500).json({ error: err?.message || 'Failed to delete task' })
    }
  })

  app.post('/api/zh-voice-tasks/:id/duplicate', async (req, res) => {
    const userId = requireAuth(req, res)
    if (!userId) return
    const { id } = req.params
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid task id' })

    try {
      const { data: existing, error: getErr } = await safeSupabaseCall(
        () => supabase.from('zh_voice_tasks').select(selectCols).eq('id', id).maybeSingle(),
        { timeoutMs: 10000, maxRetries: 2 }
      )
      if (getErr) return res.status(500).json({ error: getErr.message || 'Failed to duplicate' })
      if (!existing) return res.status(404).json({ error: 'Task not found' })
      if (existing.source === 'user' && existing.user_id !== userId) {
        return res.status(404).json({ error: 'Task not found' })
      }

      const copyPayload = buildPayload(existing.payload || {}, existing)
      const title = `${asTrimmed(existing.title, 180)} (копия)`.slice(0, 200)
      const now = new Date().toISOString()
      const { data, error } = await safeSupabaseCall(
        () =>
          supabase
            .from('zh_voice_tasks')
            .insert({
              user_id: userId,
              source: 'user',
              title,
              description: existing.description,
              type: existing.type,
              hsk_level: existing.hsk_level,
              archived: false,
              status: existing.status === 'ready' ? 'ready' : inferStatus(title, copyPayload),
              payload: copyPayload,
              updated_at: now,
            })
            .select(selectCols)
            .single(),
        { timeoutMs: 15000, maxRetries: 2 }
      )
      if (error) return res.status(500).json({ error: error.message || 'Failed to duplicate' })
      res.status(201).json(toApiTask(data))
    } catch (err) {
      console.error('[api/zh-voice-tasks duplicate] error:', err?.message)
      res.status(500).json({ error: err?.message || 'Failed to duplicate' })
    }
  })
}
