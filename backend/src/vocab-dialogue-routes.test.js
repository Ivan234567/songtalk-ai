import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  assertChatPracticeRequest,
  assertRoleplayPracticeRequest,
  buildRoleplayPracticeInstruction,
  buildChatPracticeInstruction,
  buildChatPracticeHintInstruction,
  classifyPracticeHint,
  createDialogueSessionHandler,
  createSenseCatalogHandler,
  fallbackPracticeReply,
  replyContainsTarget,
  nextPracticeHintIndex,
  DialogueRouteError,
} from './vocab-dialogue-routes.js'

const USER_ID = 'user-real'
const AGENT_ID = '11111111-1111-4111-8111-111111111111'
const SENSE_A = '22222222-2222-4222-8222-222222222222'
const SENSE_B = '33333333-3333-4333-8333-333333333333'
const FOREIGN = '55555555-5555-4555-8555-555555555555'

function getBearerToken(req) {
  const raw = req.headers?.authorization || ''
  const [type, token] = raw.split(' ')
  if (type?.toLowerCase() !== 'bearer' || !token) return null
  return token
}

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    headersSent: false,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
  }
}

function authedReq(body = {}) {
  return {
    headers: { authorization: 'Bearer good-token' },
    body,
  }
}

function createSupabase(route) {
  const calls = []
  const supabase = {
    calls,
    from(table) {
      const state = { table, filters: [], payload: null, op: 'select' }
      calls.push(state)
      let finished = null
      const finish = () => {
        if (!finished) finished = Promise.resolve(route(state))
        return finished
      }
      const query = {
        select(columns) {
          state.select = columns
          return query
        },
        insert(payload) {
          state.op = 'insert'
          state.payload = payload
          return query
        },
        delete() {
          state.op = 'delete'
          return query
        },
        eq(column, value) {
          state.filters.push(['eq', column, value])
          return query
        },
        in(column, value) {
          state.filters.push(['in', column, value])
          return query
        },
        order(column, options) {
          state.orders = state.orders || []
          state.orders.push({ column, options })
          return query
        },
        range(from, to) {
          state.range = [from, to]
          return finish()
        },
        maybeSingle() {
          return finish()
        },
        single() {
          return finish()
        },
        then(resolve, reject) {
          return finish().then(resolve, reject)
        },
      }
      return query
    },
  }
  return supabase
}

function filterMap(state) {
  const exact = {}
  let included = null
  for (const [op, column, value] of state.filters) {
    if (op === 'eq') exact[column] = value
    if (op === 'in') included = { column, value }
  }
  return { exact, included }
}

function createStore(extra = {}) {
  const store = {
    profile: { learning_language: 'en' },
    agent: {
      id: AGENT_ID,
      user_id: USER_ID,
      language: 'en',
      scenario_id: null,
    },
    senses: [
      { id: SENSE_A, user_id: USER_ID, language: 'en', headword: 'apple', gloss_ru: 'яблоко', context_text: 'an apple' },
      { id: SENSE_B, user_id: USER_ID, language: 'en', headword: 'river', gloss_ru: 'река', context_text: null },
    ],
    sessions: [],
    targets: [],
    failTargets: false,
    ...extra,
  }
  const supabase = createSupabase((state) => {
    const { exact, included } = filterMap(state)
    if (state.table === 'user_profiles') {
      return { data: store.profile, error: null }
    }
    if (state.table === 'agent_sessions') {
      const row = store.agent && store.agent.id === exact.id ? store.agent : null
      return { data: row, error: null }
    }
    if (state.table === 'vocab_senses' && state.op === 'select') {
      let rows = store.senses.filter((row) => row.user_id === exact.user_id && row.language === exact.language)
      if (included?.column === 'id') rows = rows.filter((row) => included.value.includes(row.id))
      return { data: rows, error: null }
    }
    if (state.table === 'vocab_dialogue_sessions' && state.op === 'insert') {
      const payload = state.payload
      if (store.sessions.some((row) => row.agent_session_id === payload.agent_session_id || (row.user_id === payload.user_id && row.request_id === payload.request_id))) {
        return { data: null, error: { code: '23505' } }
      }
      const row = { id: '44444444-4444-4444-8444-444444444444', ...payload }
      store.sessions.push(row)
      return { data: { id: row.id }, error: null }
    }
    if (state.table === 'vocab_dialogue_sessions' && state.op === 'delete') {
      store.sessions = store.sessions.filter((row) => row.id !== exact.id || row.user_id !== exact.user_id)
      store.targets = store.targets.filter((row) => row.dialogue_session_id !== exact.id)
      return { data: null, error: null }
    }
    if (state.table === 'vocab_dialogue_sessions' && state.op === 'select') {
      const row = store.sessions.find((item) => {
        if (exact.id && item.id !== exact.id) return false
        if (exact.request_id && item.request_id !== exact.request_id) return false
        if (exact.agent_session_id && item.agent_session_id !== exact.agent_session_id) return false
        if (exact.user_id && item.user_id !== exact.user_id) return false
        return true
      }) || null
      return { data: row, error: null }
    }
    if (state.table === 'vocab_dialogue_targets' && state.op === 'insert') {
      if (store.failTargets) return { data: null, error: { code: 'XX000' } }
      store.targets.push(...state.payload)
      return { data: state.payload.map((row) => ({ ...row })), error: null }
    }
    if (state.table === 'vocab_dialogue_targets' && state.op === 'select') {
      const rows = store.targets.filter((row) => row.dialogue_session_id === exact.dialogue_session_id && row.user_id === exact.user_id)
      return { data: rows, error: null }
    }
    return { data: null, error: { code: 'unexpected', table: state.table, op: state.op } }
  })
  return { store, supabase }
}

function handlers(supabase, ensureSenses) {
  const resolveUserId = async (req) => (getBearerToken(req) === 'good-token' ? USER_ID : null)
  return {
    catalog: createSenseCatalogHandler({
      supabase,
      resolveUserId,
      getBearerToken,
      safeSupabaseCall: async (fn) => fn(),
      ensureSenses: ensureSenses || (async () => ({ vocabularyRows: 0, drafts: 0, created: 0 })),
    }),
    dialogue: createDialogueSessionHandler({
      supabase,
      resolveUserId,
      getBearerToken,
      safeSupabaseCall: async (fn) => fn(),
    }),
  }
}

test('запрос без учебной сессии не подключает практику, сценарий отклоняется', () => {
  assert.equal(assertChatPracticeRequest({ dialogueSessionId: '', stepCount: 0, annotate: false }), false)
  assert.equal(assertChatPracticeRequest({ dialogueSessionId: 'session', stepCount: 0, annotate: true }), false)
  assert.equal(assertChatPracticeRequest({ dialogueSessionId: 'session', stepCount: 0, annotate: false }), true)
  assert.throws(
    () => assertChatPracticeRequest({ dialogueSessionId: 'session', stepCount: 2, annotate: false }),
    (err) => err instanceof DialogueRouteError && err.status === 409,
  )
  assert.equal(assertRoleplayPracticeRequest({ dialogueSessionId: '', annotate: false }), false)
  assert.equal(assertRoleplayPracticeRequest({ dialogueSessionId: 'session', annotate: false }), true)
  assert.equal(assertRoleplayPracticeRequest({ dialogueSessionId: 'session', annotate: true }), false)
})

test('инструкция чата содержит форму из базы и запрещает произнести её', () => {
  const text = buildChatPracticeInstruction([{ headword: 'apple', gloss_ru: 'яблоко' }])
  assert.match(text, /apple/)
  assert.match(text, /яблоко/)
  assert.match(text, /Do not say/)
  const hint = buildChatPracticeHintInstruction([{ headword: 'apple', gloss_ru: 'яблоко' }])
  assert.match(hint, /Russian only/)
  assert.match(hint, /forbidden word/)
  const roleplay = buildRoleplayPracticeInstruction([{ headword: 'apple', gloss_ru: 'яблоко' }])
  assert.match(roleplay, /roleplay/)
  assert.match(roleplay, /Do not say/)
  assert.match(roleplay, /scenario steps/)
})

test('ответ с целевым словом заменяется одной безопасной репликой', () => {
  const targets = [{ headword: 'apple' }]
  assert.equal(replyContainsTarget('I ate an apple', targets), true)
  assert.equal(replyContainsTarget('I was running', [{ headword: 'run' }]), true)
  assert.equal(replyContainsTarget('I run every day', [{ headword: 'running' }]), true)
  assert.equal(replyContainsTarget('I ran home', [{ headword: 'run' }]), true)
  assert.equal(replyContainsTarget('a postcard', [{ headword: 'car' }]), false)
  assert.equal(replyContainsTarget('我在跑步', [{ headword: '跑' }]), true)
  assert.equal(nextPracticeHintIndex(null), 0)
  assert.equal(nextPracticeHintIndex(3), 4)
  const fallback = fallbackPracticeReply('en', targets)
  assert.equal(replyContainsTarget(fallback, targets), false)
  assert.equal(classifyPracticeHint('Скажи apple сейчас', targets).ok, false)
  assert.equal(classifyPracticeHint('Say the fruit', targets).ok, false)
  assert.equal(classifyPracticeHint('Опиши фрукт, который едят осенью', targets).ok, true)
})

test('список отдаёт свои значения языка и не режется десяткой очереди', async () => {
  const senses = Array.from({ length: 11 }, (_, index) => ({
    id: `66666666-6666-4666-8666-${String(index).padStart(12, '0')}`,
    user_id: USER_ID,
    language: 'en',
    headword: `word${index}`,
    gloss_ru: `перевод${index}`,
    context_text: null,
  }))
  senses.push({
    id: FOREIGN,
    user_id: 'other-user',
    language: 'en',
    headword: 'secret',
    gloss_ru: 'чужое',
    context_text: null,
  })
  senses.push({
    id: '77777777-7777-4777-8777-777777777777',
    user_id: USER_ID,
    language: 'zh',
    headword: '水',
    gloss_ru: 'вода',
    context_text: null,
  })
  senses.push({
    id: '88888888-8888-4888-8888-888888888888',
    user_id: USER_ID,
    language: 'en',
    headword: 'blank',
    gloss_ru: '   ',
    context_text: null,
  })
  senses.push({ ...senses[0], id: '99999999-9999-4999-8999-999999999999' })
  const ensured = []
  const { supabase } = createStore({ senses })
  const { catalog } = handlers(supabase, async (args) => {
    ensured.push(args)
    return { vocabularyRows: 1, drafts: 1, created: 0 }
  })
  const res = mockRes()
  await catalog(authedReq(), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.count, 11)
  assert.equal(res.body.items.length, 11)
  assert.equal(ensured.length, 1)
  assert.equal(ensured[0].language, 'en')
  assert.equal(ensured[0].userId, USER_ID)
  assert.equal(supabase.calls.some((call) => call.table === 'vocab_srs_states'), false)
  assert.equal(res.body.items.some((item) => item.headword === 'secret' || item.headword === '水' || item.headword === 'blank'), false)
})

test('цели берутся из значений базы, повтор не создаёт вторую сессию', async () => {
  const { store, supabase } = createStore()
  const { dialogue } = handlers(supabase)
  const body = {
    agent_session_id: AGENT_ID,
    sense_ids: [SENSE_A, SENSE_B],
    request_id: 'request-1',
    level_snapshot: 'B1',
    gloss_ru: 'HACK',
    headword: 'HACK',
  }
  const first = mockRes()
  await dialogue(authedReq(body), first)
  assert.equal(first.statusCode, 200)
  assert.equal(first.body.targets[0].headword, 'apple')
  assert.equal(first.body.targets[0].gloss_ru, 'яблоко')
  assert.equal(first.body.mode, 'chat')
  assert.equal(store.sessions.length, 1)
  assert.equal(store.targets[0].headword, 'apple')
  assert.equal(store.sessions[0].mode, 'chat')
  const second = mockRes()
  await dialogue(authedReq(body), second)
  assert.equal(second.statusCode, 200)
  assert.equal(second.body.dialogue_session_id, first.body.dialogue_session_id)
  assert.equal(store.sessions.length, 1)
  assert.equal(store.targets.length, 2)
  assert.equal(supabase.calls.some((call) => call.table === 'vocab_srs_states' || call.table === 'vocab_review_events'), false)
})

test('чужое значение, другой язык, сценарий и шестое слово отклоняются', async () => {
  const { supabase } = createStore()
  const { dialogue } = handlers(supabase)
  const six = mockRes()
  await dialogue(authedReq({
    agent_session_id: AGENT_ID,
    sense_ids: [SENSE_A, SENSE_B, SENSE_A, SENSE_B, SENSE_A, SENSE_B],
    request_id: 'too-many',
    level_snapshot: 'B1',
  }), six)
  assert.equal(six.statusCode, 400)

  const duplicate = mockRes()
  await dialogue(authedReq({
    agent_session_id: AGENT_ID,
    sense_ids: [SENSE_A, SENSE_A],
    request_id: 'dup',
    level_snapshot: 'B1',
  }), duplicate)
  assert.equal(duplicate.statusCode, 400)

  const missing = mockRes()
  await dialogue(authedReq({
    agent_session_id: AGENT_ID,
    sense_ids: [FOREIGN],
    request_id: 'foreign',
    level_snapshot: 'B1',
  }), missing)
  assert.equal(missing.statusCode, 404)

  const { supabase: foreignAgent } = createStore({
    agent: { id: AGENT_ID, user_id: 'other-user', language: 'en', scenario_id: null },
  })
  const foreign = mockRes()
  await handlers(foreignAgent).dialogue(authedReq({
    agent_session_id: AGENT_ID,
    sense_ids: [SENSE_A],
    request_id: 'foreign-agent',
    level_snapshot: 'B1',
  }), foreign)
  assert.equal(foreign.statusCode, 404)

  const { supabase: otherLanguage } = createStore({
    agent: { id: AGENT_ID, user_id: USER_ID, language: 'zh', scenario_id: null },
  })
  const language = mockRes()
  await handlers(otherLanguage).dialogue(authedReq({
    agent_session_id: AGENT_ID,
    sense_ids: [SENSE_A],
    request_id: 'lang',
    level_snapshot: 'B1',
  }), language)
  assert.equal(language.statusCode, 409)

  const { supabase: scenario } = createStore({
    agent: { id: AGENT_ID, user_id: USER_ID, language: 'en', scenario_id: 'cafe' },
  })
  const roleplay = mockRes()
  await handlers(scenario).dialogue(authedReq({
    agent_session_id: AGENT_ID,
    sense_ids: [SENSE_A],
    request_id: 'roleplay',
    level_snapshot: 'B1',
  }), roleplay)
  assert.equal(roleplay.statusCode, 409)

  const debate = mockRes()
  await dialogue(authedReq({
    agent_session_id: AGENT_ID,
    sense_ids: [SENSE_A],
    request_id: 'debate',
    level_snapshot: 'B1',
    mode: 'debate',
  }), debate)
  assert.equal(debate.statusCode, 400)
})

test('ролевой сценарий закрепляет слова только за сессией этого сценария', async () => {
  const { store, supabase } = createStore({
    agent: { id: AGENT_ID, user_id: USER_ID, language: 'en', scenario_id: 'cafe' },
  })
  const { dialogue } = handlers(supabase)
  const missingScenario = mockRes()
  const { supabase: freeChat } = createStore()
  await handlers(freeChat).dialogue(authedReq({
    agent_session_id: AGENT_ID,
    sense_ids: [SENSE_A],
    request_id: 'roleplay-without-scenario',
    level_snapshot: 'B1',
    mode: 'roleplay',
  }), missingScenario)
  assert.equal(missingScenario.statusCode, 409)

  const started = mockRes()
  await dialogue(authedReq({
    agent_session_id: AGENT_ID,
    sense_ids: [SENSE_A],
    request_id: 'roleplay-1',
    level_snapshot: 'B1',
    mode: 'roleplay',
  }), started)
  assert.equal(started.statusCode, 200)
  assert.equal(started.body.mode, 'roleplay')
  assert.equal(store.sessions[0].mode, 'roleplay')
  assert.equal(store.sessions[0].agent_session_id, AGENT_ID)
})

test('ошибка записи целей удаляет сессию и не сообщает об успехе', async () => {
  const { store, supabase } = createStore({ failTargets: true })
  const res = mockRes()
  await handlers(supabase).dialogue(authedReq({
    agent_session_id: AGENT_ID,
    sense_ids: [SENSE_A],
    request_id: 'fail',
    level_snapshot: 'A2',
  }), res)
  assert.equal(res.statusCode, 500)
  assert.equal(res.body.dialogue_session_id, undefined)
  assert.equal(store.sessions.length, 0)
  assert.equal(store.targets.length, 0)
  assert.equal(supabase.calls.some((call) => call.table === 'vocab_dialogue_sessions' && call.op === 'delete'), true)
})

test('модуль практики не трогает карточки SRS, чат вызывает проверку сессии', () => {
  const source = fs.readFileSync(new URL('./vocab-dialogue-routes.js', import.meta.url), 'utf8')
  const index = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /vocab_srs_states|vocab_review_events|commit_vocab_srs_review/)
  assert.match(index, /assertChatPracticeRequest\(/)
  assert.match(index, /assertRoleplayPracticeRequest\(/)
  assert.match(index, /expectedMode: practiceMode/)
  assert.match(index, /expectedMode: hintMode/)
  assert.match(index, /practice_store/)
  assert.doesNotMatch(index, /historyList\.filter\(\(message\) => message\.role === 'user'\)\.length/)
  assert.match(index, /loadActiveChatPractice\(/)
  assert.match(index, /replyContainsTarget\(fullReply, practiceTargets\)/)
  assert.match(index, /classifyPracticeHint\(/)
  assert.match(index, /saveDialogueHint\(/)
})
