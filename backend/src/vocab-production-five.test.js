import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  PRODUCTION_FIVE_LIMIT,
  classifyProductionBucket,
  createProductionFiveHandler,
  selectProductionFive,
} from './vocab-production-five.js'
import { RECOGNITION_DUE_LIMIT } from './vocab-srs-routes.js'

const NOW = new Date('2026-06-01T12:00:00.000Z')
const LIST_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = 'user-real'

function sense(id, patch = {}) {
  return {
    senseId: id,
    headword: patch.headword || id,
    glossRu: patch.glossRu === undefined ? 'значение' : patch.glossRu,
    position: patch.position ?? 0,
    createdAt: patch.createdAt || '2026-05-01T00:00:00.000Z',
    dueAt: patch.dueAt ?? null,
    lastReviewedAt: patch.lastReviewedAt ?? null,
  }
}

function ids(result) {
  assert.equal(result.error, undefined)
  return result.items.map((item) => item.sense_id)
}

test('сначала слова, которым пора, потом новые', () => {
  const result = selectProductionFive([
    sense('new-word', { position: 0, lastReviewedAt: null, dueAt: '2026-05-01T00:00:00.000Z' }),
    sense('overdue', {
      position: 4,
      lastReviewedAt: '2026-05-20T00:00:00.000Z',
      dueAt: '2026-05-28T00:00:00.000Z',
    }),
  ], [], NOW)
  assert.deepEqual(ids(result), ['overdue', 'new-word'])
  assert.equal(result.items[0].bucket, 'due')
  assert.equal(result.items[0].moves_schedule, true)
  assert.equal(result.items[1].bucket, 'new')
  assert.equal(result.items[1].moves_schedule, true)
})

test('автоматически не больше пяти, лишние новые не входят', () => {
  const rows = Array.from({ length: 6 }, (_, index) => sense(`due-${index}`, {
    position: index,
    lastReviewedAt: '2026-05-01T00:00:00.000Z',
    dueAt: `2026-05-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
  }))
  rows.push(sense('fresh', { position: 0, lastReviewedAt: null }))
  const result = selectProductionFive(rows, [], NOW)
  assert.equal(result.items.length, PRODUCTION_FIVE_LIMIT)
  assert.deepEqual(ids(result), ['due-0', 'due-1', 'due-2', 'due-3', 'due-4'])
})

test('одно и то же значение из двух рядов попадает один раз', () => {
  const shared = sense('nevertheless', {
    headword: 'nevertheless',
    glossRu: 'тем не менее',
    position: 3,
    lastReviewedAt: '2026-05-01T00:00:00.000Z',
    dueAt: '2026-05-20T00:00:00.000Z',
  })
  const result = selectProductionFive([
    shared,
    { ...shared, position: 1 },
    sense('other', { position: 2, lastReviewedAt: null }),
  ], [], NOW)
  assert.deepEqual(ids(result), ['nevertheless', 'other'])
  assert.equal(result.items.filter((item) => item.sense_id === 'nevertheless').length, 1)
})

test('ручной выбор раньше срока не двигает график', () => {
  const result = selectProductionFive([
    sense('nevertheless', {
      headword: 'nevertheless',
      lastReviewedAt: '2026-05-20T00:00:00.000Z',
      dueAt: '2026-06-09T00:00:00.000Z',
    }),
    sense('due-word', {
      lastReviewedAt: '2026-05-01T00:00:00.000Z',
      dueAt: '2026-05-30T00:00:00.000Z',
    }),
  ], ['nevertheless'], NOW)
  assert.equal(result.items[0].bucket, 'early')
  assert.equal(result.items[0].moves_schedule, false)
  assert.equal(result.items[1].sense_id, 'due-word')
  assert.equal(result.items[1].moves_schedule, true)
})

test('новое слово в ручном наборе начинает цикл', () => {
  const result = selectProductionFive([
    sense('fresh', { headword: 'refund', lastReviewedAt: null, dueAt: '2026-06-01T00:00:00.000Z' }),
  ], ['fresh'], NOW)
  assert.equal(result.items[0].bucket, 'new')
  assert.equal(result.items[0].moves_schedule, true)
})

test('пустые места ручного набора добираются сроком, затем новыми', () => {
  const manual = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const result = selectProductionFive([
    sense(manual, {
      lastReviewedAt: '2026-05-01T00:00:00.000Z',
      dueAt: '2026-07-01T00:00:00.000Z',
      position: 9,
    }),
    sense('due-late', {
      position: 2,
      lastReviewedAt: '2026-05-01T00:00:00.000Z',
      dueAt: '2026-05-31T00:00:00.000Z',
    }),
    sense('due-early', {
      position: 8,
      lastReviewedAt: '2026-05-01T00:00:00.000Z',
      dueAt: '2026-05-10T00:00:00.000Z',
    }),
    sense('fresh', { position: 1, lastReviewedAt: null }),
    sense('waiting', {
      position: 0,
      lastReviewedAt: '2026-05-01T00:00:00.000Z',
      dueAt: '2026-06-20T00:00:00.000Z',
    }),
  ], [manual], NOW)
  assert.deepEqual(ids(result), [manual, 'due-early', 'due-late', 'fresh'])
  assert.equal(result.items.some((item) => item.sense_id === 'waiting'), false)
})

test('слово без перевода и будущее слово сами не входят', () => {
  const result = selectProductionFive([
    sense('blank', { glossRu: '   ' }),
    sense('later', {
      lastReviewedAt: '2026-05-01T00:00:00.000Z',
      dueAt: '2026-06-08T00:00:00.000Z',
    }),
  ], [], NOW)
  assert.deepEqual(result.items, [])
  assert.equal(classifyProductionBucket({
    lastReviewedAt: '2026-05-01T00:00:00.000Z',
    dueAt: '2026-06-08T00:00:00.000Z',
  }, NOW), 'early')
})

test('чужое значение в ручном наборе не подменяется', () => {
  const result = selectProductionFive([
    sense('mine', { lastReviewedAt: null }),
  ], ['other-list'], NOW)
  assert.equal(result.error, 'missing')
  assert.equal(result.senseId, 'other-list')
})

test('старая очередь узнавания остаётся на десяти recognition', () => {
  const recognition = fs.readFileSync(new URL('./vocab-srs-routes.js', import.meta.url), 'utf8')
  const production = fs.readFileSync(new URL('./vocab-production-five.js', import.meta.url), 'utf8')
  assert.equal(RECOGNITION_DUE_LIMIT, 10)
  assert.match(recognition, /card_type', 'recognition'/)
  assert.match(production, /card_type', 'production'/)
  assert.doesNotMatch(production, /\.(insert|update|upsert|rpc)\(/)
})

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

function createSupabase(store) {
  const writes = []
  function from(table) {
    const filters = { eq: {}, in: null }
    const query = {
      select() { return query },
      eq(column, value) {
        filters.eq[column] = value
        return query
      },
      in(column, values) {
        filters.in = [column, values]
        return query
      },
      order() { return query },
      insert(payload) {
        writes.push({ op: 'insert', table, payload })
        return Promise.resolve({ data: null, error: null })
      },
      update(payload) {
        writes.push({ op: 'update', table, payload })
        return query
      },
      upsert(payload) {
        writes.push({ op: 'upsert', table, payload })
        return query
      },
      maybeSingle() {
        return Promise.resolve(read(table, filters, true))
      },
      then(onOk, onErr) {
        return Promise.resolve(read(table, filters, false)).then(onOk, onErr)
      },
    }
    return query
  }
  function read(table, filters, single) {
    const rows = (store[table] || []).filter((row) => {
      for (const [column, value] of Object.entries(filters.eq)) {
        if (row[column] !== value) return false
      }
      if (filters.in) {
        const [column, values] = filters.in
        if (!values.includes(row[column])) return false
      }
      return true
    })
    if (single) return { data: rows[0] || null, error: null }
    return { data: rows, error: null }
  }
  return { from, writes }
}

function handlerFor(store, extras = {}) {
  const supabase = createSupabase(store)
  const handler = createProductionFiveHandler({
    supabase,
    resolveUserId: async () => extras.userId === undefined ? USER_ID : extras.userId,
    getBearerToken: (req) => {
      const raw = req.headers?.authorization || ''
      const [type, token] = raw.split(' ')
      return type?.toLowerCase() === 'bearer' && token ? token : null
    },
    ensureSenses: async () => ({ created: 0 }),
    now: () => NOW,
  })
  return { handler, supabase }
}

const SENSE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SENSE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

test('пустой свой список возвращает пустую пятёрку и ничего не пишет', async () => {
  const { handler, supabase } = handlerFor({
    user_profiles: [{ user_id: USER_ID, learning_language: 'en' }],
    vocab_lists: [{ id: LIST_ID, user_id: USER_ID, language: 'en' }],
    vocab_list_items: [],
  })
  const res = mockRes()
  await handler({
    headers: { authorization: 'Bearer token' },
    body: { list_id: LIST_ID },
  }, res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { list_id: LIST_ID, limit: 5, count: 0, items: [] })
  assert.deepEqual(supabase.writes, [])
})

test('чужой список не находится', async () => {
  const { handler } = handlerFor({
    user_profiles: [{ user_id: USER_ID, learning_language: 'en' }],
    vocab_lists: [{ id: LIST_ID, user_id: 'other', language: 'en' }],
  })
  const res = mockRes()
  await handler({
    headers: { authorization: 'Bearer token' },
    body: { list_id: LIST_ID },
  }, res)
  assert.equal(res.statusCode, 404)
  assert.equal(res.body.error, 'List not found')
})

test('маршрут собирает пятёрку говорения и отбрасывает смысл не из списка', async () => {
  const { handler, supabase } = handlerFor({
    user_profiles: [{ user_id: USER_ID, learning_language: 'en' }],
    vocab_lists: [{ id: LIST_ID, user_id: USER_ID, language: 'en' }],
    vocab_list_items: [
      { user_id: USER_ID, list_id: LIST_ID, vocabulary_id: 'vocab-a', position: 1, created_at: '2026-05-01T00:00:00.000Z' },
      { user_id: USER_ID, list_id: LIST_ID, vocabulary_id: 'vocab-b', position: 0, created_at: '2026-05-02T00:00:00.000Z' },
    ],
    vocab_senses: [
      {
        id: SENSE_A,
        user_id: USER_ID,
        language: 'en',
        vocabulary_id: 'vocab-a',
        headword: 'nevertheless',
        gloss_ru: 'тем не менее',
        created_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: SENSE_B,
        user_id: USER_ID,
        language: 'en',
        vocabulary_id: 'vocab-b',
        headword: 'refund',
        gloss_ru: 'возврат',
        created_at: '2026-05-02T00:00:00.000Z',
      },
    ],
    vocab_srs_states: [
      {
        sense_id: SENSE_A,
        user_id: USER_ID,
        card_type: 'production',
        due_at: '2026-05-20T00:00:00.000Z',
        last_reviewed_at: '2026-05-10T00:00:00.000Z',
      },
      {
        sense_id: SENSE_A,
        user_id: USER_ID,
        card_type: 'recognition',
        due_at: '2020-01-01T00:00:00.000Z',
        last_reviewed_at: '2020-01-01T00:00:00.000Z',
      },
      {
        sense_id: SENSE_B,
        user_id: USER_ID,
        card_type: 'production',
        due_at: '2026-05-02T00:00:00.000Z',
        last_reviewed_at: null,
      },
    ],
  })
  const ok = mockRes()
  await handler({
    headers: { authorization: 'Bearer token' },
    body: { list_id: LIST_ID },
  }, ok)
  assert.equal(ok.statusCode, 200)
  assert.deepEqual(ok.body.items.map((item) => item.headword), ['nevertheless', 'refund'])
  assert.equal(ok.body.items[0].bucket, 'due')
  assert.equal(ok.body.items[1].bucket, 'new')
  assert.deepEqual(supabase.writes, [])

  const missing = mockRes()
  await handler({
    headers: { authorization: 'Bearer token' },
    body: { list_id: LIST_ID, sense_ids: ['cccccccc-cccc-4ccc-8ccc-cccccccccccc'] },
  }, missing)
  assert.equal(missing.statusCode, 400)
  assert.equal(missing.body.error, 'Practice sense is not in this list')
})

test('без токена пятёрка не собирается', async () => {
  const { handler } = handlerFor({})
  const res = mockRes()
  await handler({ headers: {}, body: { list_id: LIST_ID } }, res)
  assert.equal(res.statusCode, 401)
})
