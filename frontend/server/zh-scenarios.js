/**
 * CRUD китайских сценариев: /api/zh-scenarios
 * Генерация ИИ — этап 3.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const STARTERS = ['ai', 'user']
const FORMALITIES = ['ni', 'nin', 'mixed']
const SLANG_MODES = ['off', 'light']
const STATUSES = ['draft', 'ready']
const SOURCES = ['user', 'system', 'all']

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

function asStarter(value, fallback = 'ai') {
  return STARTERS.includes(value) ? value : fallback
}

function asFormality(value, fallback = 'nin') {
  return FORMALITIES.includes(value) ? value : fallback
}

function asSlang(value, fallback = 'off') {
  return SLANG_MODES.includes(value) ? value : fallback
}

function asStatus(value, fallback = 'draft') {
  return STATUSES.includes(value) ? value : fallback
}

function normalizeKeywords(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((k) => (typeof k === 'string' ? k.trim() : ''))
    .filter(Boolean)
    .slice(0, 8)
}

function normalizeSteps(raw) {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 8).map((step, index) => {
    const s = step && typeof step === 'object' ? step : {}
    const title = asTrimmed(s.title_ru || s.titleRu, 200) || `Шаг ${index + 1}`
    const action = asTrimmed(s.expected_user_action || s.expectedUserAction, 500) || title
    return {
      id: asTrimmed(s.id, 80) || `step-${index + 1}`,
      order: Number.isInteger(s.order) ? s.order : index + 1,
      title_ru: title,
      expected_user_action: action,
      ai_context: asTrimmed(s.ai_context || s.aiContext, 1000) || undefined,
      keywords: normalizeKeywords(s.keywords),
      example_zh: asTrimmed(s.example_zh || s.exampleZh, 300) || undefined,
    }
  })
}

const PERSONALITIES = ['warm', 'patient', 'hurried', 'chatty', 'strict', 'professional']
const VOCAB_USAGES = ['must_say', 'model']

function asPersonality(value, fallback = 'warm') {
  return PERSONALITIES.includes(value) ? value : fallback
}

function asVocabUsage(value, fallback = 'model') {
  return VOCAB_USAGES.includes(value) ? value : fallback
}

function normalizeVocab(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .slice(0, 40)
    .map((item, index) => {
      const v = item && typeof item === 'object' ? item : {}
      const hanzi = asTrimmed(v.hanzi, 50)
      if (!hanzi) return null
      return {
        hanzi,
        pinyin: asTrimmed(v.pinyin, 80),
        translation_ru: asTrimmed(v.translation_ru || v.translationRu, 120),
        hsk_level: asHsk(v.hsk_level ?? v.hskLevel) ?? undefined,
        usage: asVocabUsage(v.usage),
        sort_order: Number.isInteger(v.sort_order) ? v.sort_order : index,
      }
    })
    .filter(Boolean)
}

function normalizeGoals(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((g) => asTrimmed(g, 200)).filter(Boolean).slice(0, 6)
}

function buildPayload(input = {}, columns = {}) {
  const src = input && typeof input === 'object' ? input : {}
  const textbookIn = src.textbook && typeof src.textbook === 'object' ? src.textbook : {}
  const steps = normalizeSteps(src.steps)
  const vocabulary = normalizeVocab(src.vocabulary)
  const goals = normalizeGoals(src.goals)
  const starter = asStarter(src.starter ?? columns.starter)
  const formality = asFormality(src.formality ?? columns.formality)
  const slangMode = asSlang(src.slang_mode ?? src.slangMode ?? columns.slang_mode)

  return {
    language: 'zh',
    description: asTrimmed(src.description || columns.description, 500) || undefined,
    goals,
    textbook: {
      title: asTrimmed(textbookIn.title ?? columns.textbook_title, 200) || undefined,
      lesson_no: asTrimmed(textbookIn.lesson_no ?? textbookIn.lessonNo ?? columns.lesson_no, 80) || undefined,
    },
    starter,
    formality,
    slang_mode: slangMode,
    user_role: asTrimmed(src.user_role || src.userRole || src.your_role, 120) || undefined,
    ai_role: asTrimmed(src.ai_role || src.aiRole, 120) || undefined,
    ai_personality: asPersonality(src.ai_personality || src.aiPersonality),
    ai_personality_note: asTrimmed(src.ai_personality_note || src.aiPersonalityNote, 240) || undefined,
    grammar_focus: asTrimmed(src.grammar_focus || src.grammarFocus, 200) || undefined,
    setting_ru: asTrimmed(src.setting_ru || src.settingRu, 300) || undefined,
    scenario_text_ru: asTrimmed(src.scenario_text_ru || src.scenarioTextRu, 500) || undefined,
    character_opening: asTrimmed(src.character_opening || src.characterOpening, 300) || undefined,
    suggested_first_line: asTrimmed(src.suggested_first_line || src.suggestedFirstLine, 300) || undefined,
    suggested_first_line_pinyin:
      asTrimmed(src.suggested_first_line_pinyin || src.suggestedFirstLinePinyin, 300) || undefined,
    max_score_tips_ru: asTrimmed(src.max_score_tips_ru || src.maxScoreTipsRu, 800) || undefined,
    steps,
    vocabulary,
  }
}

function inferStatus(title, payload, explicit) {
  if (explicit && STATUSES.includes(explicit)) return explicit
  const hasGoal = Array.isArray(payload.goals) && payload.goals.length > 0
  const hasStep = Array.isArray(payload.steps) && payload.steps.some((s) => s.expected_user_action)
  return title && hasGoal && hasStep ? 'ready' : 'draft'
}

function toApiScenario(row, extras = {}) {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
  const steps = extras.steps || payload.steps || []
  const vocabulary = extras.vocabulary || payload.vocabulary || []
  const textbookTitle = row.textbook_title || payload.textbook?.title
  const lessonNo = row.lesson_no || payload.textbook?.lesson_no
  return {
    id: row.id,
    source: row.source,
    language: 'zh',
    status: row.status,
    archived: Boolean(row.archived),
    title: row.title,
    description: row.description || payload.description || '',
    goals: Array.isArray(payload.goals) ? payload.goals : [],
    hsk_level: row.hsk_level ?? null,
    textbook: {
      title: textbookTitle || undefined,
      lesson_no: lessonNo || undefined,
    },
    starter: row.starter,
    formality: row.formality,
    slang_mode: row.slang_mode,
    user_role: payload.user_role,
    ai_role: payload.ai_role,
    ai_personality: asPersonality(payload.ai_personality),
    ai_personality_note: payload.ai_personality_note,
    grammar_focus: payload.grammar_focus || '',
    setting_ru: payload.setting_ru,
    scenario_text_ru: payload.scenario_text_ru,
    character_opening: payload.character_opening,
    suggested_first_line: payload.suggested_first_line,
    suggested_first_line_pinyin: payload.suggested_first_line_pinyin,
    max_score_tips_ru: payload.max_score_tips_ru,
    steps,
    vocabulary,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completions_count: extras.completions_count ?? 0,
    last_completed_at: extras.last_completed_at ?? null,
  }
}

function stepsFromPayload(payload) {
  return (payload.steps || []).map((s, i) => ({
    sort_order: i + 1,
    title_ru: s.title_ru,
    expected_user_action: s.expected_user_action,
    ai_context: s.ai_context || null,
    keywords: s.keywords || [],
    example_zh: s.example_zh || null,
  }))
}

function vocabFromPayload(payload) {
  return (payload.vocabulary || []).map((v, i) => ({
    hanzi: v.hanzi,
    pinyin: v.pinyin || '',
    translation_ru: v.translation_ru || '',
    hsk_level: v.hsk_level ?? null,
    usage: asVocabUsage(v.usage),
    sort_order: i,
  }))
}

async function attachCompletionStats(supabase, userId, list) {
  const ids = list.map((s) => s.id).filter(Boolean)
  if (!ids.length) return list
  const { data: completions } = await supabase
    .from('roleplay_completions')
    .select('scenario_id, completed_at')
    .eq('user_id', userId)
    .in('scenario_id', ids)
  const byScenario = {}
  for (const c of completions || []) {
    const id = c.scenario_id
    if (!byScenario[id]) byScenario[id] = { count: 0, lastCompletedAt: null }
    byScenario[id].count += 1
    const at = c.completed_at ? new Date(c.completed_at).toISOString() : null
    if (at && (!byScenario[id].lastCompletedAt || at > byScenario[id].lastCompletedAt)) {
      byScenario[id].lastCompletedAt = at
    }
  }
  for (const s of list) {
    const stats = byScenario[s.id]
    s.completions_count = stats ? stats.count : 0
    s.last_completed_at = stats?.lastCompletedAt ?? null
  }
  return list
}

async function replaceChildren(supabase, safeSupabaseCall, scenarioId, payload) {
  const { error: delStepsErr } = await safeSupabaseCall(
    () => supabase.from('zh_scenario_steps').delete().eq('scenario_id', scenarioId),
    { timeoutMs: 10000, maxRetries: 2 }
  )
  if (delStepsErr) throw delStepsErr
  const { error: delVocabErr } = await safeSupabaseCall(
    () => supabase.from('zh_scenario_vocab').delete().eq('scenario_id', scenarioId),
    { timeoutMs: 10000, maxRetries: 2 }
  )
  if (delVocabErr) throw delVocabErr

  const steps = stepsFromPayload(payload)
  if (steps.length) {
    const { error } = await safeSupabaseCall(
      () => supabase.from('zh_scenario_steps').insert(steps.map((s) => ({ ...s, scenario_id: scenarioId }))),
      { timeoutMs: 15000, maxRetries: 2 }
    )
    if (error) throw error
  }
  const vocab = vocabFromPayload(payload)
  if (vocab.length) {
    const { error } = await safeSupabaseCall(
      () => supabase.from('zh_scenario_vocab').insert(vocab.map((v) => ({ ...v, scenario_id: scenarioId }))),
      { timeoutMs: 15000, maxRetries: 2 }
    )
    if (error) throw error
  }
}

function columnsFromBody(body, payload) {
  return {
    title: asTrimmed(body.title ?? payload.title, 200) || 'Новый сценарий',
    description: asTrimmed(body.description ?? payload.description, 500) || null,
    hsk_level: asHsk(body.hsk_level ?? body.hskLevel ?? payload.hsk_level),
    textbook_title: payload.textbook?.title || asTrimmed(body.textbook_title, 200) || null,
    lesson_no: payload.textbook?.lesson_no || asTrimmed(body.lesson_no, 80) || null,
    starter: asStarter(body.starter ?? payload.starter),
    formality: asFormality(body.formality ?? payload.formality),
    slang_mode: asSlang(body.slang_mode ?? body.slangMode ?? payload.slang_mode),
  }
}

function parseLlmJson(raw) {
  let s = String(raw || '').trim()
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start >= 0 && end > start) s = s.slice(start, end + 1)
  return JSON.parse(s)
}

function inferStarterFromIntent({ starter, textbookTitle, lessonNo, prompt, userRole }) {
  if (starter === 'ai' || starter === 'user') return starter
  const blob = `${prompt || ''} ${userRole || ''}`.toLowerCase()
  if (/звон|позвон|спросить дорог|как пройти|как проехать|call |ask for direction/.test(blob)) return 'user'
  if (textbookTitle || lessonNo) return 'ai'
  return 'ai'
}

function inferFormality(formality, hsk) {
  if (formality === 'ni' || formality === 'nin' || formality === 'mixed') return formality
  if (hsk && hsk <= 3) return 'nin'
  return 'mixed'
}

const ZH_GENERATE_SYSTEM = `You are an expert designer of Simplified Chinese (简体中文) roleplay scenarios for Russian-speaking learners (HSK 1–6).
The AI plays one character; the learner plays the other. Output ONE complete scenario.

Output ONLY valid JSON, no markdown, no code fence. Schema:
{
  "title": "short title in Russian",
  "description": "one sentence in Russian",
  "goals": ["Russian goal 1", "Russian goal 2"],
  "hsk_level": 1,
  "textbook": { "title": "optional", "lesson_no": "optional" },
  "starter": "ai" | "user",
  "formality": "ni" | "nin" | "mixed",
  "slang_mode": "off" | "light",
  "user_role": "learner's role in Russian",
  "ai_role": "AI character role in Russian",
  "ai_personality": "warm" | "patient" | "hurried" | "chatty" | "strict" | "professional",
  "ai_personality_note": "optional extra trait in Russian, short",
  "grammar_focus": "one grammar point, Russian + Chinese, e.g. 了 для завершённого действия",
  "setting_ru": "place in Russian",
  "scenario_text_ru": "situation in Russian",
  "character_opening": "AI first line in Simplified Chinese",
  "suggested_first_line": "learner first-line example in Simplified Chinese",
  "suggested_first_line_pinyin": "pinyin with tone marks",
  "max_score_tips_ru": "short tips in Russian: how to score well in this scene",
  "steps": [
    {
      "id": "step1",
      "order": 1,
      "title_ru": "checkpoint in Russian",
      "expected_user_action": "what the learner should do, Russian",
      "ai_context": "short cue for the AI on this step, Russian",
      "keywords": ["汉字", "pinyin"],
      "example_zh": "example learner phrase in Chinese"
    }
  ],
  "vocabulary": [
    { "hanzi": "衣服", "pinyin": "yīfu", "translation_ru": "одежда", "hsk_level": 1, "usage": "must_say" }
  ]
}

Rules:
- Dialogue content (character_opening, suggested_first_line, example_zh, hanzi) MUST be Simplified Chinese. No English in those fields.
- UI strings (title, description, goals, roles, setting, steps title_ru / expected_user_action / ai_context, grammar_focus, max_score_tips_ru) in Russian.
- 2–6 steps. Each step is one learner action.
- keywords: 2–6 items, hanzi and/or pinyin; hints for scoring, not a rigid whitelist.
- vocabulary: 4–12 words at or below the given HSK. Pinyin WITH tone marks.
- usage "must_say": 3–6 core lesson words the LEARNER must produce. usage "model": words YOU (the AI character) should say. Mark both; do not mark everything must_say.
- Always include BOTH character_opening and suggested_first_line so who-starts can be switched later.
- suggested_first_line must use 1–2 must_say vocabulary items and stay at the given HSK.
- Pick ai_personality that fits the AI role (shop assistant hurried, doctor patient, classmate chatty, official professional).
- If textbook/goal implies a grammar point, set grammar_focus. Otherwise infer one clear focus or leave a short empty-safe phrase.
- If textbook/lesson is given, prefer starter "ai" (the other person greets, like a textbook dialogue), unless the learner is clearly the initiator (phone call, asking for directions).
- If the user did not specify a role, choose a natural learner role and a complementary AI role.
- Playable in 2–4 minutes. No profanity. No English spoken lines.`

const ZH_GENERATE_PART_SYSTEM = `You update ONE part of an existing Simplified Chinese roleplay scenario for Russian-speaking learners (HSK 1–6).
Output ONLY valid JSON, no markdown, no code fence.
Keep the same HSK, situation, and roles. Do not rewrite parts you were not asked to change.
Dialogue Chinese fields: Simplified Chinese only. UI strings: Russian.
Pinyin must include tone marks.`

export function registerZhScenarioRoutes(app, {
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
    'id, user_id, source, title, description, hsk_level, textbook_title, lesson_no, starter, formality, slang_mode, archived, status, payload, created_at, updated_at'

  app.post('/api/zh-scenarios/generate', async (req, res) => {
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
    const prompt = asTrimmed(body.prompt, 2000)
    const textbookTitle = asTrimmed(body.textbook_title || body.textbookTitle, 200)
    const lessonNo = asTrimmed(body.lesson_no || body.lessonNo, 80)
    const goal = asTrimmed(body.goal, 400)
    const roleMode = body.role_mode === 'user' ? 'user' : 'ai'
    const userRole = roleMode === 'user' ? asTrimmed(body.user_role || body.userRole, 120) : ''
    const hsk = asHsk(body.hsk_level ?? body.hskLevel) || 3
    const starterReq = ['auto', 'ai', 'user'].includes(body.starter) ? body.starter : 'auto'
    const formalityReq = ['auto', 'ni', 'nin', 'mixed'].includes(body.formality) ? body.formality : 'auto'

    if (!prompt && !(textbookTitle && (goal || lessonNo))) {
      return res.status(400).json({
        error: 'Опишите ситуацию или укажите учебник и что отрабатывать',
      })
    }

    const starterHint = inferStarterFromIntent({
      starter: starterReq,
      textbookTitle,
      lessonNo,
      prompt,
      userRole,
    })
    const formalityHint = inferFormality(formalityReq, hsk)

    const parts = []
    if (prompt) parts.push(`Learner request (Russian): ${prompt}`)
    if (textbookTitle) parts.push(`Textbook: ${textbookTitle}`)
    if (lessonNo) parts.push(`Lesson: ${lessonNo}`)
    if (goal) parts.push(`Practice goal: ${goal}`)
    parts.push(`HSK level: ${hsk}`)
    if (roleMode === 'user' && userRole) {
      parts.push(`Learner role (must use this): ${userRole}`)
    } else {
      parts.push('Learner role: not specified — choose a natural role for the learner and a complementary AI role.')
    }
    parts.push(`Who starts (hint): ${starterHint}. Still output both character_opening and suggested_first_line.`)
    parts.push(`Formality: ${formalityHint}`)
    parts.push('Hard forbidden themes: sexual content involving minors, extremism, violent crime instructions, doxxing, real-world threats.')
    const userPrompt = `${parts.join('\n')}\n\nGenerate the scenario JSON now.`

    async function runOnce() {
      return llm.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: ZH_GENERATE_SYSTEM },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 2500,
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
          console.error('[api/zh-scenarios/generate] Invalid JSON:', raw.slice(0, 400))
          return res.status(422).json({ error: 'Не удалось разобрать ответ ИИ, попробуйте ещё раз' })
        }
      }

      const payload = buildPayload(
        {
          ...parsed,
          starter: asStarter(parsed.starter, starterHint),
          formality: asFormality(parsed.formality, formalityHint),
          slang_mode: asSlang(parsed.slang_mode, 'off'),
          textbook: {
            title: parsed.textbook?.title || textbookTitle,
            lesson_no: parsed.textbook?.lesson_no || lessonNo,
          },
          user_role: roleMode === 'user' && userRole ? userRole : parsed.user_role,
        },
        {
          starter: starterHint,
          formality: formalityHint,
          slang_mode: 'off',
          textbook_title: textbookTitle,
          lesson_no: lessonNo,
        }
      )

      if (!payload.goals.length && goal) payload.goals = [goal]
      if (!payload.goals.length && prompt) payload.goals = [asTrimmed(prompt, 200)]
      if (!payload.steps.length) {
        payload.steps = [{
          id: 'goal',
          order: 1,
          title_ru: 'Достичь цели',
          expected_user_action: payload.goals[0] || 'Достичь цели диалога',
          keywords: [],
        }]
      }

      const title = asTrimmed(parsed.title, 200) || 'Новый сценарий'
      const hskOut = asHsk(parsed.hsk_level) || hsk

      const usage = completion?.usage
      if (usage && typeof deductBalance === 'function' && typeof getCost === 'function') {
        const costRub = getCost(model, usage)
        if (costRub > 0) {
          await deductBalance(supabase, userId, costRub, model, { zh_scenario_generate: true })
        }
      }

      res.json({
        title,
        hsk_level: hskOut,
        payload: {
          ...payload,
          hsk_level: hskOut,
        },
      })
    } catch (err) {
      console.error('[api/zh-scenarios/generate] error:', err?.message)
      res.status(500).json({ error: err?.message || 'Scenario generation failed' })
    }
  })

  app.post('/api/zh-scenarios/generate-part', async (req, res) => {
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
    if (!['vocabulary', 'steps', 'openings'].includes(part)) {
      return res.status(400).json({ error: 'part должен быть vocabulary, steps или openings' })
    }
    const src = body.scenario && typeof body.scenario === 'object' ? body.scenario : {}
    const payload = buildPayload(src, src)
    const title = asTrimmed(src.title, 200) || 'Сценарий'
    const hsk = asHsk(src.hsk_level ?? src.hskLevel ?? payload.hsk_level) || 3
    const note = asTrimmed(body.note, 400)

    const snapshot = {
      title,
      description: payload.description,
      goals: payload.goals,
      hsk_level: hsk,
      textbook: payload.textbook,
      starter: payload.starter,
      formality: payload.formality,
      user_role: payload.user_role,
      ai_role: payload.ai_role,
      ai_personality: payload.ai_personality,
      grammar_focus: payload.grammar_focus,
      setting_ru: payload.setting_ru,
      scenario_text_ru: payload.scenario_text_ru,
      character_opening: payload.character_opening,
      suggested_first_line: payload.suggested_first_line,
      suggested_first_line_pinyin: payload.suggested_first_line_pinyin,
      steps: payload.steps,
      vocabulary: payload.vocabulary,
    }

    let want = ''
    if (part === 'vocabulary') {
      want =
        'Regenerate ONLY vocabulary (4–12 items). JSON: {"vocabulary":[{"hanzi":"","pinyin":"","translation_ru":"","hsk_level":1,"usage":"must_say"}]}. ' +
        'Mark 3–6 core lesson words usage=must_say; the rest usage=model. Stay at or below the HSK.'
    } else if (part === 'steps') {
      want =
        'Regenerate ONLY steps (2–6). JSON: {"steps":[{"id":"step1","order":1,"title_ru":"","expected_user_action":"","ai_context":"","keywords":[],"example_zh":""}]}. ' +
        'Each step is one learner action. Keep the same scene.'
    } else {
      want =
        'Regenerate ONLY opening lines. JSON: {"character_opening":"","suggested_first_line":"","suggested_first_line_pinyin":""}. ' +
        'Both lines Simplified Chinese. suggested_first_line must use 1–2 must_say words if vocabulary exists. Pinyin with tone marks.'
    }

    const userPrompt = [
      `Current scenario JSON:\n${JSON.stringify(snapshot)}`,
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
          { role: 'system', content: ZH_GENERATE_PART_SYSTEM },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1800,
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
        const vocabulary = normalizeVocab(parsed.vocabulary)
        if (!vocabulary.length) {
          return res.status(422).json({ error: 'ИИ не вернул словарь, попробуйте ещё раз' })
        }
        patch = { vocabulary }
      } else if (part === 'steps') {
        const steps = normalizeSteps(parsed.steps)
        if (!steps.length) {
          return res.status(422).json({ error: 'ИИ не вернул шаги, попробуйте ещё раз' })
        }
        patch = { steps }
      } else {
        const character_opening = asTrimmed(parsed.character_opening, 300)
        const suggested_first_line = asTrimmed(parsed.suggested_first_line, 300)
        const suggested_first_line_pinyin = asTrimmed(parsed.suggested_first_line_pinyin, 300)
        if (!character_opening && !suggested_first_line) {
          return res.status(422).json({ error: 'ИИ не вернул первые фразы, попробуйте ещё раз' })
        }
        patch = { character_opening, suggested_first_line, suggested_first_line_pinyin }
      }

      const usage = completion?.usage
      if (usage && typeof deductBalance === 'function' && typeof getCost === 'function') {
        const costRub = getCost(model, usage)
        if (costRub > 0) {
          await deductBalance(supabase, userId, costRub, model, { zh_scenario_generate_part: true, part })
        }
      }

      res.json({ part, patch })
    } catch (err) {
      console.error('[api/zh-scenarios/generate-part] error:', err?.message)
      res.status(500).json({ error: err?.message || 'Part generation failed' })
    }
  })

  app.get('/api/zh-scenarios', async (req, res) => {
    const userId = requireAuth(req, res)
    if (!userId) return

    const archivedParam = req.query.archived
    let archivedFilter = null
    if (archivedParam === 'true') archivedFilter = true
    else if (archivedParam === 'false') archivedFilter = false

    const sourceParam = SOURCES.includes(req.query.source) ? req.query.source : 'all'
    const hsk = asHsk(req.query.hsk)
    const q = asTrimmed(req.query.q, 120).toLowerCase()
    const textbook = asTrimmed(req.query.textbook, 200)
    const sort = req.query.sort === 'last_used' ? 'last_used' : 'updated'

    try {
      let query = supabase.from('zh_scenarios').select(selectCols)
      if (sourceParam === 'user') {
        query = query.eq('user_id', userId).eq('source', 'user')
      } else if (sourceParam === 'system') {
        query = query.eq('source', 'system')
      } else {
        query = query.or(`and(source.eq.user,user_id.eq.${userId}),source.eq.system`)
      }
      if (archivedFilter !== null) query = query.eq('archived', archivedFilter)
      if (hsk) query = query.eq('hsk_level', hsk)
      if (textbook) query = query.ilike('textbook_title', `%${textbook}%`)
      query = query.order('updated_at', { ascending: false })

      const { data, error } = await safeSupabaseCall(() => query, { timeoutMs: 15000, maxRetries: 2 })
      if (error) {
        console.error('[api/zh-scenarios] list error:', error.message)
        return res.status(500).json({ error: error.message || 'Failed to list scenarios' })
      }

      let list = (data || []).map((row) => toApiScenario(row))
      if (q) {
        list = list.filter((s) => {
          const hay = `${s.title} ${s.textbook?.title || ''} ${s.description || ''}`.toLowerCase()
          return hay.includes(q)
        })
      }
      await attachCompletionStats(supabase, userId, list)
      if (sort === 'last_used') {
        list.sort((a, b) => {
          const aAt = a.last_completed_at || a.updated_at || a.created_at || ''
          const bAt = b.last_completed_at || b.updated_at || b.created_at || ''
          return String(bAt).localeCompare(String(aAt))
        })
      }
      res.json({ scenarios: list })
    } catch (err) {
      console.error('[api/zh-scenarios] error:', err?.message)
      res.status(500).json({ error: err?.message || 'Failed to list scenarios' })
    }
  })

  app.get('/api/zh-scenarios/:id', async (req, res) => {
    const userId = requireAuth(req, res)
    if (!userId) return
    const { id } = req.params
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid scenario id' })

    try {
      const { data, error } = await safeSupabaseCall(
        () => supabase.from('zh_scenarios').select(selectCols).eq('id', id).maybeSingle(),
        { timeoutMs: 10000, maxRetries: 2 }
      )
      if (error) return res.status(500).json({ error: error.message || 'Failed to get scenario' })
      if (!data) return res.status(404).json({ error: 'Scenario not found' })
      if (data.source === 'user' && data.user_id !== userId) {
        return res.status(404).json({ error: 'Scenario not found' })
      }

      const [{ data: steps }, { data: vocab }] = await Promise.all([
        supabase.from('zh_scenario_steps').select('*').eq('scenario_id', id).order('sort_order'),
        supabase.from('zh_scenario_vocab').select('*').eq('scenario_id', id).order('sort_order'),
      ])

      const mappedSteps = (steps || []).map((s) => ({
        id: s.id,
        order: s.sort_order,
        title_ru: s.title_ru,
        expected_user_action: s.expected_user_action,
        ai_context: s.ai_context || undefined,
        keywords: s.keywords || [],
        example_zh: s.example_zh || undefined,
      }))
      const mappedVocab = (vocab || []).map((v) => ({
        hanzi: v.hanzi,
        pinyin: v.pinyin,
        translation_ru: v.translation_ru,
        hsk_level: v.hsk_level ?? undefined,
        usage: asVocabUsage(v.usage),
      }))

      const scenario = toApiScenario(data, { steps: mappedSteps, vocabulary: mappedVocab })
      await attachCompletionStats(supabase, userId, [scenario])
      res.json(scenario)
    } catch (err) {
      console.error('[api/zh-scenarios/:id] error:', err?.message)
      res.status(500).json({ error: err?.message || 'Failed to get scenario' })
    }
  })

  app.post('/api/zh-scenarios', async (req, res) => {
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
            .from('zh_scenarios')
            .insert({
              user_id: userId,
              source: 'user',
              title,
              description: cols.description,
              hsk_level: cols.hsk_level,
              textbook_title: cols.textbook_title,
              lesson_no: cols.lesson_no,
              starter: cols.starter,
              formality: cols.formality,
              slang_mode: cols.slang_mode,
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
        console.error('[api/zh-scenarios] insert error:', error.message)
        return res.status(500).json({ error: error.message || 'Failed to create scenario' })
      }
      await replaceChildren(supabase, safeSupabaseCall, data.id, payload)
      res.status(201).json(toApiScenario(data, { steps: payload.steps, vocabulary: payload.vocabulary }))
    } catch (err) {
      console.error('[api/zh-scenarios] error:', err?.message)
      res.status(500).json({ error: err?.message || 'Failed to create scenario' })
    }
  })

  app.patch('/api/zh-scenarios/:id', async (req, res) => {
    const userId = requireAuth(req, res)
    if (!userId) return
    const { id } = req.params
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid scenario id' })

    const body = req.body || {}

    try {
      const { data: existing, error: getErr } = await safeSupabaseCall(
        () =>
          supabase
            .from('zh_scenarios')
            .select(selectCols)
            .eq('id', id)
            .eq('user_id', userId)
            .eq('source', 'user')
            .maybeSingle(),
        { timeoutMs: 10000, maxRetries: 2 }
      )
      if (getErr) return res.status(500).json({ error: getErr.message || 'Failed to update scenario' })
      if (!existing) return res.status(404).json({ error: 'Scenario not found' })

      const mergedInput = {
        ...(existing.payload || {}),
        ...(body.payload && typeof body.payload === 'object' ? body.payload : {}),
        ...body,
      }
      const payload = buildPayload(mergedInput, {
        starter: body.starter ?? existing.starter,
        formality: body.formality ?? existing.formality,
        slang_mode: body.slang_mode ?? existing.slang_mode,
        textbook_title: body.textbook_title ?? existing.textbook_title,
        lesson_no: body.lesson_no ?? existing.lesson_no,
      })
      if (typeof body.description === 'string') payload.description = asTrimmed(body.description, 500)
      else if (typeof existing.description === 'string') payload.description = existing.description

      const updates = { updated_at: new Date().toISOString() }
      if (typeof body.title === 'string' && body.title.trim()) updates.title = asTrimmed(body.title, 200)
      if (typeof body.description === 'string') updates.description = asTrimmed(body.description, 500) || null
      if (body.hsk_level !== undefined || body.hskLevel !== undefined) updates.hsk_level = asHsk(body.hsk_level ?? body.hskLevel)
      if (typeof body.textbook_title === 'string' || body.payload?.textbook) {
        updates.textbook_title = payload.textbook?.title || null
      }
      if (typeof body.lesson_no === 'string' || body.payload?.textbook) {
        updates.lesson_no = payload.textbook?.lesson_no || null
      }
      if (body.starter !== undefined) updates.starter = asStarter(body.starter, existing.starter)
      if (body.formality !== undefined) updates.formality = asFormality(body.formality, existing.formality)
      if (body.slang_mode !== undefined || body.slangMode !== undefined) {
        updates.slang_mode = asSlang(body.slang_mode ?? body.slangMode, existing.slang_mode)
      }
      if (typeof body.archived === 'boolean') updates.archived = body.archived
      if (body.payload !== undefined || body.steps !== undefined || body.vocabulary !== undefined || body.goals !== undefined || body.textbook !== undefined) {
        updates.payload = payload
        updates.starter = payload.starter
        updates.formality = payload.formality
        updates.slang_mode = payload.slang_mode
        updates.textbook_title = payload.textbook?.title || null
        updates.lesson_no = payload.textbook?.lesson_no || null
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
            .from('zh_scenarios')
            .update(updates)
            .eq('id', id)
            .eq('user_id', userId)
            .eq('source', 'user')
            .select(selectCols)
            .single(),
        { timeoutMs: 15000, maxRetries: 2 }
      )
      if (error) {
        if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Scenario not found' })
        return res.status(500).json({ error: error.message || 'Failed to update scenario' })
      }
      if (updates.payload) {
        await replaceChildren(supabase, safeSupabaseCall, id, payload)
      }
      res.json(toApiScenario(data, updates.payload ? { steps: payload.steps, vocabulary: payload.vocabulary } : undefined))
    } catch (err) {
      console.error('[api/zh-scenarios PATCH] error:', err?.message)
      res.status(500).json({ error: err?.message || 'Failed to update scenario' })
    }
  })

  app.delete('/api/zh-scenarios/:id', async (req, res) => {
    const userId = requireAuth(req, res)
    if (!userId) return
    const { id } = req.params
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid scenario id' })

    try {
      const { data, error } = await safeSupabaseCall(
        () =>
          supabase
            .from('zh_scenarios')
            .delete()
            .eq('id', id)
            .eq('user_id', userId)
            .eq('source', 'user')
            .select('id')
            .maybeSingle(),
        { timeoutMs: 15000, maxRetries: 2 }
      )
      if (error) return res.status(500).json({ error: error.message || 'Failed to delete scenario' })
      if (!data) return res.status(404).json({ error: 'Scenario not found' })
      res.status(204).send()
    } catch (err) {
      console.error('[api/zh-scenarios DELETE] error:', err?.message)
      res.status(500).json({ error: err?.message || 'Failed to delete scenario' })
    }
  })

  app.post('/api/zh-scenarios/:id/duplicate', async (req, res) => {
    const userId = requireAuth(req, res)
    if (!userId) return
    const { id } = req.params
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid scenario id' })

    try {
      const { data: existing, error: getErr } = await safeSupabaseCall(
        () => supabase.from('zh_scenarios').select(selectCols).eq('id', id).maybeSingle(),
        { timeoutMs: 10000, maxRetries: 2 }
      )
      if (getErr) return res.status(500).json({ error: getErr.message || 'Failed to duplicate' })
      if (!existing) return res.status(404).json({ error: 'Scenario not found' })
      if (existing.source === 'user' && existing.user_id !== userId) {
        return res.status(404).json({ error: 'Scenario not found' })
      }

      const payload = existing.payload && typeof existing.payload === 'object' ? existing.payload : {}
      const [{ data: steps }, { data: vocab }] = await Promise.all([
        supabase.from('zh_scenario_steps').select('*').eq('scenario_id', id).order('sort_order'),
        supabase.from('zh_scenario_vocab').select('*').eq('scenario_id', id).order('sort_order'),
      ])
      const mappedSteps = (steps || []).map((s, i) => ({
        id: `step-${i + 1}`,
        order: i + 1,
        title_ru: s.title_ru,
        expected_user_action: s.expected_user_action,
        ai_context: s.ai_context || undefined,
        keywords: s.keywords || [],
        example_zh: s.example_zh || undefined,
      }))
      const mappedVocab = (vocab || []).map((v) => ({
        hanzi: v.hanzi,
        pinyin: v.pinyin,
        translation_ru: v.translation_ru,
        hsk_level: v.hsk_level ?? undefined,
        usage: asVocabUsage(v.usage),
      }))
      const copyPayload = buildPayload({
        ...payload,
        steps: mappedSteps.length ? mappedSteps : payload.steps,
        vocabulary: mappedVocab.length ? mappedVocab : payload.vocabulary,
      }, existing)

      const title = `${asTrimmed(existing.title, 180)} (копия)`.slice(0, 200)
      const now = new Date().toISOString()
      const { data, error } = await safeSupabaseCall(
        () =>
          supabase
            .from('zh_scenarios')
            .insert({
              user_id: userId,
              source: 'user',
              title,
              description: existing.description,
              hsk_level: existing.hsk_level,
              textbook_title: existing.textbook_title,
              lesson_no: existing.lesson_no,
              starter: existing.starter,
              formality: existing.formality,
              slang_mode: existing.slang_mode,
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
      await replaceChildren(supabase, safeSupabaseCall, data.id, copyPayload)
      res.status(201).json(toApiScenario(data, { steps: copyPayload.steps, vocabulary: copyPayload.vocabulary }))
    } catch (err) {
      console.error('[api/zh-scenarios duplicate] error:', err?.message)
      res.status(500).json({ error: err?.message || 'Failed to duplicate' })
    }
  })

  app.post('/api/zh-scenarios/:id/add-vocab', async (req, res) => {
    const userId = requireAuth(req, res)
    if (!userId) return
    const { id } = req.params
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid scenario id' })

    try {
      const { data: existing, error: getErr } = await safeSupabaseCall(
        () => supabase.from('zh_scenarios').select('id, user_id, source, payload').eq('id', id).maybeSingle(),
        { timeoutMs: 10000, maxRetries: 2 }
      )
      if (getErr) return res.status(500).json({ error: getErr.message || 'Failed to add vocabulary' })
      if (!existing) return res.status(404).json({ error: 'Scenario not found' })
      if (existing.source === 'user' && existing.user_id !== userId) {
        return res.status(404).json({ error: 'Scenario not found' })
      }

      const { data: vocabRows } = await supabase
        .from('zh_scenario_vocab')
        .select('hanzi, pinyin, translation_ru, hsk_level')
        .eq('scenario_id', id)
        .order('sort_order')

      let items = vocabRows && vocabRows.length
        ? vocabRows
        : normalizeVocab(existing.payload?.vocabulary)
      const requested = Array.isArray(req.body?.hanzi)
        ? req.body.hanzi.map((h) => String(h).trim()).filter(Boolean)
        : null
      if (requested) {
        const set = new Set(requested)
        items = items.filter((v) => set.has(v.hanzi))
      }
      if (!items.length) {
        return res.json({ added: 0, skipped: 0 })
      }

      const { data: existingWords } = await supabase
        .from('user_vocabulary')
        .select('word')
        .eq('user_id', userId)
        .eq('language', 'zh')
        .in('word', items.map((v) => v.hanzi))
      const have = new Set((existingWords || []).map((w) => w.word))
      const toInsert = items.filter((v) => v.hanzi && !have.has(v.hanzi))
      if (toInsert.length) {
        const { error: insErr } = await safeSupabaseCall(
          () =>
            supabase.from('user_vocabulary').insert(
              toInsert.map((v) => ({
                user_id: userId,
                word: v.hanzi,
                language: 'zh',
                pinyin: v.pinyin || null,
                hsk_level: v.hsk_level ?? null,
                translations: v.translation_ru ? [{ translation: v.translation_ru, source: 'scenario' }] : [],
                mastery_level: 1,
                times_seen: 1,
              }))
            ),
          { timeoutMs: 15000, maxRetries: 2 }
        )
        if (insErr) return res.status(500).json({ error: insErr.message || 'Failed to add vocabulary' })
      }
      res.json({ added: toInsert.length, skipped: items.length - toInsert.length })
    } catch (err) {
      console.error('[api/zh-scenarios add-vocab] error:', err?.message)
      res.status(500).json({ error: err?.message || 'Failed to add vocabulary' })
    }
  })
}
