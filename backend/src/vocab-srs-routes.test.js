import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  createRecognitionDueHandler,
  createRecognitionReviewHandler,
  registerVocabSrsDueRoute,
  RECOGNITION_DUE_LIMIT,
  DUE_STATE_PAGE_SIZE,
  REVIEW_REQUEST_ID_MAX,
} from './vocab-srs-routes.js'
import { applySm2Review } from './srs.js'

const NOW = new Date('2026-06-01T12:00:00.000Z')
const USER_ID = 'user-real'

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

function createSupabase(options = {}) {
  const calls = []
  const supabase = {
    calls,
    from(table) {
      const call = { table, eq: [], lte: [], order: null, range: null, in: null }
      calls.push(call)
      const query = {
        select(columns) {
          call.select = columns
          return query
        },
        eq(column, value) {
          call.eq.push([column, value])
          return query
        },
        lte(column, value) {
          call.lte.push([column, value])
          return query
        },
        order(column, options) {
          call.order = { column, options }
          return query
        },
        in(column, values) {
          call.in = [column, values]
          return Promise.resolve(options.senses ? options.senses(call) : { data: [], error: null })
        },
        range(from, to) {
          call.range = [from, to]
          return Promise.resolve(options.states ? options.states(call) : { data: [], error: null })
        },
        maybeSingle() {
          return Promise.resolve(options.profile ? options.profile(call) : { data: { learning_language: 'en' }, error: null })
        },
      }
      return query
    },
  }
  return supabase
}

function createHandler(options = {}) {
  const events = []
  const supabase = options.supabase || createSupabase(options)
  const ensureSenses = options.ensureSenses || (async (args) => {
    events.push({ type: 'ensure', args })
    return { vocabularyRows: 0, drafts: 0, created: 0 }
  })
  const resolveUserId = options.resolveUserId || (async (req) => {
    events.push({ type: 'resolve', queryUserId: req.query?.user_id ?? null })
    return getBearerToken(req) === 'good-token' ? USER_ID : null
  })
  const handler = createRecognitionDueHandler({
    supabase,
    resolveUserId,
    getBearerToken,
    safeSupabaseCall: async (fn) => fn(),
    ensureSenses,
    now: () => NOW,
  })
  return { handler, supabase, events, ensureSenses }
}

function authedReq(extra = {}) {
  return {
    headers: { authorization: 'Bearer good-token' },
    query: {},
    body: {},
    ...extra,
  }
}

function sense(id, extra = {}) {
  return {
    id,
    user_id: USER_ID,
    language: 'en',
    headword: extra.headword || id,
    gloss_ru: extra.gloss_ru ?? 'перевод',
    part_of_speech: extra.part_of_speech ?? 'noun',
    context_text: extra.context_text ?? 'in context',
    ...extra,
  }
}

const SRS_STATE_COLUMNS = [
  'id',
  'sense_id',
  'user_id',
  'card_type',
  'ease_factor',
  'interval_days',
  'repetitions',
  'lapses',
  'due_at',
  'last_reviewed_at',
  'created_at',
  'updated_at',
]

const SENSE_COLUMNS = [
  'id',
  'user_id',
  'vocabulary_id',
  'language',
  'headword',
  'gloss_ru',
  'part_of_speech',
  'context_text',
  'sense_key',
  'created_at',
  'updated_at',
]

function selectedColumns(select) {
  return String(select).split(',').map((column) => column.trim()).filter(Boolean)
}

function state(senseId, dueAt, extra = {}) {
  return {
    sense_id: senseId,
    due_at: dueAt,
    card_type: 'recognition',
    user_id: USER_ID,
    ease_factor: 2.5,
    repetitions: 3,
    lapses: 1,
    interval_days: 6,
    ...extra,
  }
}

test('неавторизованный запрос не получает очередь', async () => {
  const { handler, supabase, events } = createHandler()
  const res = mockRes()
  await handler({ headers: {}, query: {}, body: {} }, res)
  assert.equal(res.statusCode, 401)
  assert.equal(res.body.error, 'Missing Authorization Bearer token')
  assert.equal(res.body.items, undefined)
  assert.equal(supabase.calls.length, 0)
  assert.equal(events.length, 0)

  const invalid = mockRes()
  await handler({ headers: { authorization: 'Bearer bad-token' }, query: { user_id: USER_ID }, body: {} }, invalid)
  assert.equal(invalid.statusCode, 401)
  assert.equal(invalid.body.error, 'Invalid or expired token')
  assert.equal(invalid.body.items, undefined)
  assert.equal(supabase.calls.length, 0)
})

test('пользователь берётся из проверенного токена, а не из user_id', async () => {
  const { handler, supabase } = createHandler({
    states: () => ({ data: [], error: null }),
  })
  const res = mockRes()
  await handler(authedReq({ query: { user_id: 'user-other' }, body: { user_id: 'user-body' } }), res)
  assert.equal(res.statusCode, 200)
  const profile = supabase.calls.find((call) => call.table === 'user_profiles')
  const states = supabase.calls.find((call) => call.table === 'vocab_srs_states')
  assert.deepEqual(profile.eq, [['user_id', USER_ID]])
  assert.ok(states.eq.some(([column, value]) => column === 'user_id' && value === USER_ID))
  assert.equal(JSON.stringify(supabase.calls).includes('user-other'), false)
  assert.equal(JSON.stringify(supabase.calls).includes('user-body'), false)
})

test('язык берётся из профиля и передаётся в синхронизацию', async () => {
  const seen = []
  const { handler, supabase } = createHandler({
    profile: () => ({ data: { learning_language: 'zh' }, error: null }),
    ensureSenses: async (args) => {
      seen.push(args)
    },
    states: () => ({ data: [], error: null }),
  })
  const res = mockRes()
  await handler(authedReq({ query: { language: 'en' }, body: { language: 'en' } }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(seen.length, 1)
  assert.equal(seen[0].userId, USER_ID)
  assert.equal(seen[0].language, 'zh')
  const states = supabase.calls.find((call) => call.table === 'vocab_srs_states')
  assert.ok(states)
  assert.equal(seen[0].supabase, supabase)
})

test('синхронизация вызывается до чтения очереди', async () => {
  const order = []
  const supabase = createSupabase({
    profile: () => {
      order.push('profile')
      return { data: { learning_language: 'en' }, error: null }
    },
    states: () => {
      order.push('states')
      return { data: [], error: null }
    },
  })
  const { handler } = createHandler({
    supabase,
    ensureSenses: async () => {
      order.push('ensure')
    },
  })
  const res = mockRes()
  await handler(authedReq(), res)
  assert.deepEqual(order, ['profile', 'ensure', 'states'])
})

test('ошибка синхронизации не маскируется успешным ответом', async () => {
  const logs = []
  const original = console.error
  console.error = (...args) => logs.push(args.join(' '))
  try {
    const { handler, supabase } = createHandler({
      ensureSenses: async () => {
        throw new Error('Failed to insert vocabulary senses gloss=книга token=good-token')
      },
      states: () => ({ data: [state('s1', NOW.toISOString())], error: null }),
    })
    const res = mockRes()
    await handler(authedReq(), res)
    assert.equal(res.statusCode, 500)
    assert.equal(res.body.error, 'Failed to prepare vocabulary senses')
    assert.equal(res.body.items, undefined)
    assert.equal(supabase.calls.some((call) => call.table === 'vocab_srs_states'), false)
    assert.equal(JSON.stringify(res.body).includes('книга'), false)
    assert.equal(logs.join(' ').includes('книга'), false)
    assert.equal(logs.join(' ').includes('good-token'), false)
  } finally {
    console.error = original
  }
})

test('запросы читают только колонки миграции и фильтруют владельца на vocab_srs_states.user_id', async () => {
  const { handler, supabase } = createHandler({
    states: () => ({ data: [state('s1', '2026-05-01T00:00:00.000Z')], error: null }),
    senses: () => ({ data: [sense('s1')], error: null }),
  })
  const res = mockRes()
  await handler(authedReq(), res)
  assert.equal(res.statusCode, 200)

  const statesCall = supabase.calls.find((call) => call.table === 'vocab_srs_states')
  const sensesCall = supabase.calls.find((call) => call.table === 'vocab_senses')
  const stateColumns = selectedColumns(statesCall.select)
  const senseColumns = selectedColumns(sensesCall.select)
  assert.deepEqual(stateColumns, ['sense_id', 'due_at', 'card_type', 'user_id'])
  assert.deepEqual(senseColumns, ['id', 'user_id', 'language', 'headword', 'gloss_ru', 'part_of_speech', 'context_text'])
  for (const column of stateColumns) assert.ok(SRS_STATE_COLUMNS.includes(column))
  for (const column of senseColumns) assert.ok(SENSE_COLUMNS.includes(column))
  for (const [column] of [...statesCall.eq, ...statesCall.lte, [statesCall.order.column]]) {
    assert.ok(SRS_STATE_COLUMNS.includes(column))
  }
  for (const [column] of sensesCall.eq) assert.ok(SENSE_COLUMNS.includes(column))
  assert.equal(sensesCall.in[0], 'id')
  assert.deepEqual(statesCall.eq, [['user_id', USER_ID], ['card_type', 'recognition']])
  assert.deepEqual(sensesCall.eq, [['user_id', USER_ID], ['language', 'en']])
})

test('в очередь попадают только просроченные recognition своего пользователя и языка', async () => {
  const dueEarly = '2026-05-01T00:00:00.000Z'
  const dueMid = '2026-05-20T00:00:00.000Z'
  const dueLate = '2026-05-30T00:00:00.000Z'
  const future = '2026-07-01T00:00:00.000Z'
  const rows = [
    state('future', future),
    state('production', dueEarly, { card_type: 'production' }),
    state('other-user', dueEarly, { user_id: 'user-other' }),
    state('blank', dueEarly),
    state('spaces', dueMid),
    state('other-lang', dueEarly),
    state('ok-late', dueLate),
    state('ok-early', dueMid),
  ]
  const senses = [
    sense('future'),
    sense('production'),
    sense('other-user', { user_id: 'user-other' }),
    sense('blank', { gloss_ru: '' }),
    sense('spaces', { gloss_ru: '   ' }),
    sense('other-lang', { language: 'zh', gloss_ru: 'чужой язык' }),
    sense('ok-late', { headword: 'late', gloss_ru: '  поздний  ' }),
    sense('ok-early', { headword: 'early', gloss_ru: 'ранний' }),
  ]
  const { handler, supabase } = createHandler({
    states: () => ({ data: rows, error: null }),
    senses: () => ({ data: senses, error: null }),
  })
  const res = mockRes()
  await handler(authedReq(), res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body.items.map((item) => item.sense_id), ['ok-early', 'ok-late'])
  assert.deepEqual(res.body.items.map((item) => item.gloss_ru), ['ранний', 'поздний'])
  const statesCall = supabase.calls.find((call) => call.table === 'vocab_srs_states')
  assert.ok(statesCall.eq.some(([column, value]) => column === 'card_type' && value === 'recognition'))
  assert.deepEqual(statesCall.lte, [['due_at', NOW.toISOString()]])
  assert.equal(statesCall.order.column, 'due_at')
  assert.equal(statesCall.order.options.ascending, true)
  const sensesCall = supabase.calls.find((call) => call.table === 'vocab_senses')
  assert.deepEqual(sensesCall.eq, [['user_id', USER_ID], ['language', 'en']])
})

test('лимит очереди не превышает 10 карточек', async () => {
  const rows = Array.from({ length: 12 }, (_, index) => {
    const day = String(index + 1).padStart(2, '0')
    return state(`s${index}`, `2026-05-${day}T00:00:00.000Z`)
  })
  const senses = rows.map((row) => sense(row.sense_id, { gloss_ru: row.sense_id }))
  const { handler } = createHandler({
    states: () => ({ data: rows, error: null }),
    senses: () => ({ data: senses, error: null }),
  })
  const res = mockRes()
  await handler(authedReq(), res)
  assert.equal(res.body.items.length, RECOGNITION_DUE_LIMIT)
  assert.equal(res.body.count, 10)
  assert.equal(res.body.limit, 10)
  assert.equal(res.body.items[0].sense_id, 's0')
  assert.equal(res.body.items[9].sense_id, 's9')
  assert.equal(res.body.items.some((item) => item.sense_id === 's10'), false)
})

test('пустая очередь — успешный ответ с пустым массивом', async () => {
  const { handler } = createHandler({
    profile: () => ({ data: null, error: null }),
    states: () => ({ data: [], error: null }),
  })
  const res = mockRes()
  await handler(authedReq(), res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { items: [], count: 0, limit: 10 })
})

test('ошибка чтения и некорректный ответ Supabase не становятся успехом', async () => {
  const logs = []
  const original = console.error
  console.error = (...args) => logs.push(args.join(' '))
  try {
    const readError = createHandler({
      states: () => ({ data: null, error: { message: 'relation missing token=good-token gloss=книга' } }),
    })
    const failed = mockRes()
    await readError.handler(authedReq(), failed)
    assert.equal(failed.statusCode, 500)
    assert.equal(failed.body.error, 'Failed to load review queue')
    assert.equal(JSON.stringify(failed.body).includes('книга'), false)
    assert.equal(JSON.stringify(failed.body).includes('good-token'), false)

    const invalid = createHandler({
      states: () => ({ data: { unexpected: true }, error: null }),
    })
    const bad = mockRes()
    await invalid.handler(authedReq(), bad)
    assert.equal(bad.statusCode, 500)
    assert.equal(bad.body.items, undefined)

    const senseError = createHandler({
      states: () => ({ data: [state('s1', '2026-05-01T00:00:00.000Z')], error: null }),
      senses: () => ({ data: null, error: { message: 'sense failure gloss=книга' } }),
    })
    const senseFailed = mockRes()
    await senseError.handler(authedReq(), senseFailed)
    assert.equal(senseFailed.statusCode, 500)
    assert.equal(JSON.stringify(senseFailed.body).includes('книга'), false)
    assert.equal(logs.join(' ').includes('книга'), false)
    assert.equal(logs.join(' ').includes('good-token'), false)
  } finally {
    console.error = original
  }
})

test('ошибка профиля и некорректный язык не запускают очередь', async () => {
  const original = console.error
  console.error = () => {}
  try {
    const profileError = createHandler({
      profile: () => ({ data: null, error: { message: 'profile down' } }),
    })
    const failed = mockRes()
    await profileError.handler(authedReq(), failed)
    assert.equal(failed.statusCode, 500)
    assert.equal(failed.body.error, 'Failed to resolve learning language')
    assert.equal(profileError.events.some((event) => event.type === 'ensure'), false)

    let ensured = false
    const invalidLanguage = createHandler({
      profile: () => ({ data: { learning_language: 'de' }, error: null }),
      ensureSenses: async () => {
        ensured = true
      },
    })
    const bad = mockRes()
    await invalidLanguage.handler(authedReq(), bad)
    assert.equal(bad.statusCode, 500)
    assert.equal(ensured, false)
  } finally {
    console.error = original
  }
})

test('ответ содержит поля карточки и не содержит служебные данные SRS', async () => {
  const { handler } = createHandler({
    states: () => ({ data: [state('s1', '2026-05-02T08:00:00.000Z')], error: null }),
    senses: () => ({
      data: [sense('s1', {
        headword: 'book',
        gloss_ru: ' книга ',
        part_of_speech: 'noun',
        context_text: 'read a book',
      })],
      error: null,
    }),
  })
  const res = mockRes()
  await handler(authedReq(), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.count, 1)
  assert.equal(res.body.limit, 10)
  assert.deepEqual(res.body.items, [{
    sense_id: 's1',
    headword: 'book',
    gloss_ru: 'книга',
    due_at: '2026-05-02T08:00:00.000Z',
    part_of_speech: 'noun',
    context_text: 'read a book',
  }])
  const serialized = JSON.stringify(res.body)
  for (const hidden of ['ease_factor', 'repetitions', 'lapses', 'interval_days', 'user_id']) {
    assert.equal(serialized.includes(hidden), false)
  }
})

test('после страницы без переводов читается следующая страница состояний', async () => {
  const blankStates = Array.from({ length: DUE_STATE_PAGE_SIZE }, (_, index) => state(`blank-${index}`, '2026-05-01T00:00:00.000Z'))
  const ready = state('ready', '2026-05-02T00:00:00.000Z')
  const ranges = []
  const { handler } = createHandler({
    states: (call) => {
      ranges.push(call.range[0])
      if (call.range[0] === 0) return { data: blankStates, error: null }
      return { data: [ready], error: null }
    },
    senses: (call) => {
      const ids = call.in[1]
      if (ids[0] === 'ready') return { data: [sense('ready', { gloss_ru: 'готово' })], error: null }
      return { data: ids.map((id) => sense(id, { gloss_ru: ' ' })), error: null }
    },
  })
  const res = mockRes()
  await handler(authedReq(), res)
  assert.deepEqual(ranges, [0, DUE_STATE_PAGE_SIZE])
  assert.deepEqual(res.body.items.map((item) => item.sense_id), ['ready'])
})

test('маршрут регистрируется как GET /api/vocabulary/srs/due', async () => {
  const routes = new Map()
  const app = {
    get(path, handler) {
      routes.set(`GET ${path}`, handler)
    },
    post(path, handler) {
      routes.set(`POST ${path}`, handler)
    },
  }
  registerVocabSrsDueRoute(app, {
    supabase: createSupabase({ states: () => ({ data: [], error: null }) }),
    resolveUserId: async () => USER_ID,
    getBearerToken,
    safeSupabaseCall: async (fn) => fn(),
    ensureSenses: async () => {},
    now: () => NOW,
    asyncHandler: (fn) => fn,
  })
  const handler = routes.get('GET /api/vocabulary/srs/due')
  assert.equal(typeof handler, 'function')
  assert.equal(typeof routes.get('POST /api/vocabulary/srs/review'), 'function')
  const res = mockRes()
  await handler(authedReq(), res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body.items, [])
})

const SENSE_ID = '11111111-1111-4111-8111-111111111111'
const DUE_RAW = '2026-05-01T00:00:00+00:00'

function reviewBody(extra = {}) {
  return {
    sense_id: SENSE_ID,
    rating: 'easy',
    client_request_id: 'req-1',
    ...extra,
  }
}

function recognitionState(extra = {}) {
  return {
    sense_id: SENSE_ID,
    user_id: USER_ID,
    card_type: 'recognition',
    ease_factor: '2.50',
    interval_days: 0,
    repetitions: 0,
    lapses: 0,
    due_at: DUE_RAW,
    ...extra,
  }
}

function createReviewSupabase(options = {}) {
  const calls = []
  const supabase = {
    calls,
    from(table) {
      const call = { table, op: 'select', eq: [], select: null }
      calls.push(call)
      const query = {
        select(columns) {
          call.select = columns
          return query
        },
        eq(column, value) {
          call.eq.push([column, value])
          return query
        },
        maybeSingle() {
          const provided = (value, fallback) => (typeof value === 'function' ? value() : (value === undefined ? fallback : value))
          if (table === 'user_profiles') {
            return Promise.resolve(provided(options.profile, { data: { learning_language: 'en' }, error: null }))
          }
          if (table === 'vocab_review_events') {
            return Promise.resolve(provided(options.event, { data: null, error: null }))
          }
          if (table === 'vocab_senses') {
            return Promise.resolve(provided(options.sense, {
              data: { id: SENSE_ID, user_id: USER_ID, language: 'en' },
              error: null,
            }))
          }
          if (table === 'vocab_srs_states') {
            return Promise.resolve(provided(options.state, { data: recognitionState(), error: null }))
          }
          return Promise.resolve({ data: null, error: { message: 'unexpected table' } })
        },
        insert(payload) {
          call.op = 'insert'
          call.payload = payload
          return Promise.resolve({ data: null, error: null })
        },
        update(payload) {
          call.op = 'update'
          call.payload = payload
          return Promise.resolve({ data: null, error: null })
        },
      }
      return query
    },
    rpc(name, args) {
      calls.push({ op: 'rpc', name, args })
      if (options.rpc) return Promise.resolve(options.rpc(name, args))
      return Promise.resolve({
        data: {
          status: 'applied',
          quality: 5,
          verdict: 'easy',
          due_at: '2026-06-02T12:00:00.000Z',
          interval_days: 1,
          repetitions: 1,
          replayed: false,
        },
        error: null,
      })
    },
  }
  return supabase
}

function createReviewHandler(options = {}) {
  const supabase = options.supabase || createReviewSupabase(options)
  let ensured = false
  const handler = createRecognitionReviewHandler({
    supabase,
    resolveUserId: options.resolveUserId || (async (req) => (
      getBearerToken(req) === 'good-token' ? USER_ID : null
    )),
    getBearerToken,
    safeSupabaseCall: async (fn) => fn(),
    ensureSenses: async () => {
      ensured = true
    },
    now: () => NOW,
  })
  return { handler, supabase, ensured: () => ensured }
}

function assertNoDirectWrites(supabase) {
  assert.equal(supabase.calls.some((call) => call.op === 'insert' || call.op === 'update'), false)
}

test('сохранение оценки отклоняет запрос без действительного токена', async () => {
  const { handler, supabase } = createReviewHandler()
  const missing = mockRes()
  await handler({ headers: {}, body: reviewBody() }, missing)
  assert.equal(missing.statusCode, 401)
  assert.equal(missing.body.error, 'Missing Authorization Bearer token')

  const invalid = mockRes()
  await handler({ headers: { authorization: 'Bearer bad-token' }, body: reviewBody({ user_id: USER_ID }) }, invalid)
  assert.equal(invalid.statusCode, 401)
  assert.equal(invalid.body.error, 'Invalid or expired token')
  assert.equal(supabase.calls.length, 0)
})

test('некорректные sense_id, rating и client_request_id не доходят до базы', async () => {
  const cases = [
    reviewBody({ sense_id: 'book' }),
    reviewBody({ rating: 'perfect' }),
    reviewBody({ rating: 5 }),
    reviewBody({ client_request_id: '   ' }),
    reviewBody({ client_request_id: 'x'.repeat(REVIEW_REQUEST_ID_MAX + 1) }),
    reviewBody({ client_request_id: 15 }),
  ]
  for (const body of cases) {
    const { handler, supabase } = createReviewHandler()
    const res = mockRes()
    await handler({ headers: { authorization: 'Bearer good-token' }, body }, res)
    assert.equal(res.statusCode, 400)
    assert.equal(supabase.calls.length, 0)
  }
})

test('оценка считается на сервере и RPC получает сырой срок карточки', async () => {
  const { handler, supabase } = createReviewHandler({
    profile: () => ({ data: { learning_language: 'zh' }, error: null }),
    sense: {
      data: { id: SENSE_ID, user_id: USER_ID, language: 'zh' },
      error: null,
    },
  })
  const res = mockRes()
  await handler({
    headers: { authorization: 'Bearer good-token' },
    query: { language: 'en', user_id: 'user-other' },
    body: reviewBody({
      rating: 'hard',
      client_request_id: '  req-hard  ',
      user_id: 'user-other',
      quality: 1,
      ease_factor: 9,
      due_at: '1999-01-01T00:00:00.000Z',
      lapses: 4,
    }),
  }, res)

  const rpcCall = supabase.calls.find((call) => call.op === 'rpc')
  const next = applySm2Review({ easeFactor: 2.5, intervalDays: 0, repetitions: 0 }, 3, NOW)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(Object.keys(rpcCall.args), [
    'p_user_id',
    'p_sense_id',
    'p_language',
    'p_client_request_id',
    'p_verdict',
    'p_quality',
    'p_reviewed_at',
    'p_expected_ease',
    'p_expected_interval_days',
    'p_expected_repetitions',
    'p_expected_lapses',
    'p_expected_due_at',
    'p_next_ease',
    'p_next_interval_days',
    'p_next_repetitions',
    'p_next_due_at',
  ])
  assert.equal(rpcCall.name, 'commit_vocab_srs_review')
  assert.equal(rpcCall.args.p_user_id, USER_ID)
  assert.equal(rpcCall.args.p_language, 'zh')
  assert.equal(rpcCall.args.p_client_request_id, 'req-hard')
  assert.equal(rpcCall.args.p_verdict, 'hard')
  assert.equal(rpcCall.args.p_quality, 3)
  assert.equal(rpcCall.args.p_reviewed_at, NOW.toISOString())
  assert.equal(rpcCall.args.p_expected_ease, '2.50')
  assert.equal(rpcCall.args.p_expected_due_at, DUE_RAW)
  assert.equal(rpcCall.args.p_expected_lapses, 0)
  assert.equal(rpcCall.args.p_next_ease, next.easeFactor)
  assert.equal(rpcCall.args.p_next_interval_days, next.intervalDays)
  assert.equal(rpcCall.args.p_next_repetitions, next.repetitions)
  assert.equal(rpcCall.args.p_next_due_at, next.dueAt.toISOString())
  assert.equal(JSON.stringify(rpcCall.args).includes('user-other'), false)
  const stateCall = supabase.calls.find((call) => call.table === 'vocab_srs_states')
  assert.deepEqual(stateCall.eq, [
    ['sense_id', SENSE_ID],
    ['user_id', USER_ID],
    ['card_type', 'recognition'],
  ])
  assert.equal(stateCall.select.includes('ease_factor'), true)
  assertNoDirectWrites(supabase)
})

test('каждая оценка превращается только в свою пару quality', async () => {
  const expected = { again: 1, hard: 3, good: 4, easy: 5 }
  for (const [rating, quality] of Object.entries(expected)) {
    const { handler, supabase } = createReviewHandler()
    const res = mockRes()
    await handler({
      headers: { authorization: 'Bearer good-token' },
      body: reviewBody({ rating, client_request_id: `req-${rating}` }),
    }, res)
    assert.equal(res.statusCode, 200)
    const rpcCall = supabase.calls.find((call) => call.op === 'rpc')
    assert.equal(rpcCall.args.p_verdict, rating)
    assert.equal(rpcCall.args.p_quality, quality)
  }
})

test('чужое значение и карточка production дают 404 без RPC', async () => {
  const missing = createReviewHandler({
    sense: { data: null, error: null },
  })
  const missingRes = mockRes()
  await missing.handler({ headers: { authorization: 'Bearer good-token' }, body: reviewBody() }, missingRes)
  assert.equal(missingRes.statusCode, 404)
  assert.equal(missing.supabase.calls.some((call) => call.op === 'rpc'), false)
  assert.equal(missing.supabase.calls.some((call) => call.table === 'vocab_srs_states'), false)

  const foreign = createReviewHandler({
    sense: { data: { id: SENSE_ID, user_id: 'user-other', language: 'en' }, error: null },
  })
  const foreignRes = mockRes()
  await foreign.handler({ headers: { authorization: 'Bearer good-token' }, body: reviewBody() }, foreignRes)
  assert.equal(foreignRes.statusCode, 404)
  assert.equal(foreign.supabase.calls.some((call) => call.op === 'rpc'), false)

  const production = createReviewHandler({
    state: { data: recognitionState({ card_type: 'production' }), error: null },
  })
  const productionRes = mockRes()
  await production.handler({ headers: { authorization: 'Bearer good-token' }, body: reviewBody() }, productionRes)
  assert.equal(productionRes.statusCode, 404)
  assert.equal(production.supabase.calls.some((call) => call.op === 'rpc'), false)
  assert.equal(production.supabase.calls.some((call) => call.op === 'update'), false)
})

test('applied и replayed возвращают поля клиента без служебных данных SM-2', async () => {
  const applied = createReviewHandler({
    rpc: () => ({
      data: {
        status: 'applied',
        quality: 5,
        verdict: 'easy',
        due_at: '2026-06-02T12:00:00.000Z',
        interval_days: 1,
        repetitions: 1,
        replayed: false,
        ease_factor: 2.6,
        lapses: 0,
        user_id: 'user-other',
      },
      error: null,
    }),
  })
  const appliedRes = mockRes()
  await applied.handler({ headers: { authorization: 'Bearer good-token' }, body: reviewBody() }, appliedRes)
  assert.equal(appliedRes.statusCode, 200)
  assert.deepEqual(appliedRes.body, {
    status: 'applied',
    sense_id: SENSE_ID,
    rating: 'easy',
    quality: 5,
    due_at: '2026-06-02T12:00:00.000Z',
    interval_days: 1,
    repetitions: 1,
    replayed: false,
  })

  const storedDue = '2026-08-01T00:00:00.000Z'
  const replayed = createReviewHandler({
    event: { data: { id: 'event-1' }, error: null },
    state: { data: recognitionState({ due_at: '2026-07-01T00:00:00.000Z' }), error: null },
    rpc: () => ({
      data: {
        status: 'replayed',
        quality: 5,
        verdict: 'easy',
        due_at: storedDue,
        interval_days: 6,
        repetitions: 2,
        replayed: true,
      },
      error: null,
    }),
  })
  const replayedRes = mockRes()
  await replayed.handler({ headers: { authorization: 'Bearer good-token' }, body: reviewBody() }, replayedRes)
  const localNext = applySm2Review({ easeFactor: 2.5, intervalDays: 0, repetitions: 0 }, 5, NOW)
  assert.equal(replayedRes.statusCode, 200)
  assert.equal(replayedRes.body.due_at, storedDue)
  assert.equal(replayedRes.body.interval_days, 6)
  assert.equal(replayedRes.body.repetitions, 2)
  assert.equal(replayedRes.body.replayed, true)
  assert.notEqual(replayedRes.body.due_at, localNext.dueAt.toISOString())
  assert.equal(replayed.supabase.calls.filter((call) => call.op === 'rpc').length, 1)
})

test('conflict и stale_state становятся 409, повтор SM-2 не запускается', async () => {
  const conflict = createReviewHandler({
    event: { data: { id: 'event-1' }, error: null },
    rpc: () => ({ data: { status: 'conflict' }, error: null }),
  })
  const conflictRes = mockRes()
  await conflict.handler({
    headers: { authorization: 'Bearer good-token' },
    body: reviewBody({ rating: 'again' }),
  }, conflictRes)
  assert.equal(conflictRes.statusCode, 409)
  assert.equal(conflictRes.body.status, 'conflict')
  const conflictRpc = conflict.supabase.calls.filter((call) => call.op === 'rpc')
  assert.equal(conflictRpc.length, 1)
  assert.equal(conflictRpc[0].args.p_verdict, 'again')
  assert.equal(conflictRpc[0].args.p_quality, 1)

  const stale = createReviewHandler({
    rpc: () => ({ data: { status: 'stale_state' }, error: null }),
  })
  const staleRes = mockRes()
  await stale.handler({ headers: { authorization: 'Bearer good-token' }, body: reviewBody() }, staleRes)
  assert.equal(staleRes.statusCode, 409)
  assert.equal(staleRes.body.status, 'stale_state')
  assert.equal(stale.supabase.calls.filter((call) => call.op === 'rpc').length, 1)
})

test('not_found из RPC и ошибки чтения не выглядят успехом', async () => {
  const logs = []
  const original = console.error
  console.error = (...args) => logs.push(args.join(' '))
  try {
    const missing = createReviewHandler({
      rpc: () => ({ data: { status: 'not_found' }, error: null }),
    })
    const missingRes = mockRes()
    await missing.handler({ headers: { authorization: 'Bearer good-token' }, body: reviewBody() }, missingRes)
    assert.equal(missingRes.statusCode, 404)

    const eventError = createReviewHandler({
      event: { data: null, error: { message: 'event down gloss=книга token=good-token' } },
      state: { data: recognitionState({ due_at: '2026-07-01T00:00:00.000Z' }), error: null },
    })
    const eventRes = mockRes()
    await eventError.handler({ headers: { authorization: 'Bearer good-token' }, body: reviewBody() }, eventRes)
    assert.equal(eventRes.statusCode, 500)
    assert.equal(eventError.supabase.calls.some((call) => call.op === 'rpc'), false)
    assert.equal(JSON.stringify(eventRes.body).includes('книга'), false)

    const stateError = createReviewHandler({
      state: { data: null, error: { message: 'state down gloss=книга' } },
    })
    const stateRes = mockRes()
    await stateError.handler({ headers: { authorization: 'Bearer good-token' }, body: reviewBody() }, stateRes)
    assert.equal(stateRes.statusCode, 500)
    assert.equal(stateError.supabase.calls.some((call) => call.op === 'rpc'), false)

    const rpcError = createReviewHandler({
      rpc: () => ({ data: null, error: { message: 'rpc failed token=good-token' } }),
    })
    const rpcRes = mockRes()
    await rpcError.handler({ headers: { authorization: 'Bearer good-token' }, body: reviewBody() }, rpcRes)
    assert.equal(rpcRes.statusCode, 500)
    assert.equal(rpcRes.body.status, undefined)
    assert.equal(JSON.stringify(rpcRes.body).includes('good-token'), false)
    assert.equal(logs.join(' ').includes('книга'), false)
    assert.equal(logs.join(' ').includes('good-token'), false)
  } finally {
    console.error = original
  }
})

test('новая оценка раньше срока отклоняется, а повтор ключа уходит в RPC', async () => {
  const early = createReviewHandler({
    state: { data: recognitionState({ due_at: '2026-07-01T00:00:00.000Z' }), error: null },
  })
  const earlyRes = mockRes()
  await early.handler({ headers: { authorization: 'Bearer good-token' }, body: reviewBody() }, earlyRes)
  assert.equal(earlyRes.statusCode, 409)
  assert.equal(earlyRes.body.error, 'Card is not due yet')
  assert.equal(early.supabase.calls.some((call) => call.op === 'rpc'), false)

  const repeat = createReviewHandler({
    event: { data: { id: 'event-1' }, error: null },
    state: { data: recognitionState({ due_at: '2026-07-01T00:00:00.000Z' }), error: null },
    rpc: () => ({
      data: {
        status: 'replayed',
        quality: 5,
        verdict: 'easy',
        due_at: '2026-07-02T00:00:00.000Z',
        interval_days: 1,
        repetitions: 1,
        replayed: true,
      },
      error: null,
    }),
  })
  const repeatRes = mockRes()
  await repeat.handler({ headers: { authorization: 'Bearer good-token' }, body: reviewBody() }, repeatRes)
  assert.equal(repeatRes.statusCode, 200)
  assert.equal(repeatRes.body.replayed, true)
  assert.equal(repeatRes.body.due_at, '2026-07-02T00:00:00.000Z')
  const eventCall = repeat.supabase.calls.find((call) => call.table === 'vocab_review_events')
  assert.equal(eventCall.select, 'id')
})

test('маршрут оценки не вставляет журнал и не обновляет состояние напрямую', async () => {
  const source = fs.readFileSync(new URL('./vocab-srs-routes.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\.(insert|update|upsert)\s*\(/)
  const { handler, supabase, ensured } = createReviewHandler()
  const res = mockRes()
  await handler({ headers: { authorization: 'Bearer good-token' }, body: reviewBody() }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(ensured(), false)
  assertNoDirectWrites(supabase)
})
