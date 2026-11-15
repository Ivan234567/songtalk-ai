import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseNextAction, createNextActionHandler } from './vocab-next-action.js'
import { readIntroRun, writeIntroRun } from '../../frontend/lib/next-intro-run.js'

const NOW = new Date('2026-11-11T12:00:00.000Z')
const PAST = '2026-11-01T12:00:00.000Z'
const FUTURE = '2026-12-01T12:00:00.000Z'
const LIST = 'list-main'
const USER_ID = 'user-real'

function lists(extra) {
  return extra || [{ id: LIST, title: 'Основной' }]
}

function sense(id, patch = {}) {
  return {
    senseId: id,
    headword: patch.headword || id,
    gloss: patch.gloss || `значение ${id}`,
    createdAt: patch.createdAt || '2026-10-01T00:00:00.000Z',
    listIds: patch.listIds || [LIST],
    positions: patch.positions || { [LIST]: 1 },
    production: patch.production === undefined ? null : patch.production,
    recognition: patch.recognition === undefined ? null : patch.recognition,
    events: patch.events || [],
  }
}

function dueCard(at = PAST) {
  return { dueAt: at, lastReviewedAt: '2026-10-20T00:00:00.000Z' }
}

function earlyCard() {
  return { dueAt: FUTURE, lastReviewedAt: '2026-10-20T00:00:00.000Z' }
}

function wrong(senseId, at) {
  return {
    sense_id: senseId,
    source: 'dialogue',
    card_type: 'production',
    verdict: 'wrong_sense',
    dialogue_session_id: 'session-wrong',
    evidence_text: 'не то значение',
    created_at: at,
  }
}

function produced(senseId, at) {
  return {
    sense_id: senseId,
    source: 'dialogue',
    card_type: 'production',
    verdict: 'produced',
    dialogue_session_id: 'session-said',
    evidence_text: 'правильное употребление',
    due_before: PAST,
    due_after: FUTURE,
    created_at: at,
  }
}

function recognition(senseId, verdict, at = PAST) {
  return {
    sense_id: senseId,
    source: 'daily_review',
    card_type: 'recognition',
    verdict,
    dialogue_session_id: null,
    evidence_text: null,
    created_at: at,
  }
}

function choose(rows, introRun = 0, listRows) {
  return chooseNextAction({ senses: rows, lists: lists(listRows), introRun, now: NOW })
}

function ids(result) {
  return result.senses.map((item) => item.sense_id)
}

test('актуальный wrong_sense выбирает восстановление значения', () => {
  const result = choose([
    sense('borrow', { events: [wrong('borrow', '2026-11-10T10:00:00.000Z')] }),
    sense('lend', { createdAt: '2026-10-02T00:00:00.000Z' }),
  ])
  assert.equal(result.action, 'repair')
  assert.equal(result.title, 'Восстановить значение')
  assert.equal(result.reason, 'Ты недавно путал значение этого слова. Давай восстановим его в разговоре.')
  assert.equal(ids(result).includes('borrow'), true)
  assert.equal(result.count, result.senses.length)
  assert.ok(result.count >= 2 && result.count <= 5)
})

test('более поздний produced снимает восстановление', () => {
  const result = choose([
    sense('borrow', {
      production: earlyCard(),
      events: [
        wrong('borrow', '2026-11-01T10:00:00.000Z'),
        produced('borrow', '2026-11-08T10:00:00.000Z'),
      ],
    }),
    sense('lend', { production: earlyCard() }),
  ])
  assert.notEqual(result.action, 'repair')
  assert.equal(result.action, 'free')
})

test('просроченные карточки говорения выбирают целевую практику', () => {
  const result = choose([
    sense('late', { production: dueCard('2026-11-02T00:00:00.000Z') }),
    sense('later', { production: dueCard('2026-11-09T00:00:00.000Z') }),
  ])
  assert.equal(result.action, 'due_speech')
  assert.equal(result.reason, 'Наступил срок повторного использования слов в речи.')
  assert.deepEqual(ids(result), ['late', 'later'])
})

test('хорошее узнавание без самостоятельного употребления ведёт к говорению', () => {
  const result = choose([
    sense('apple', { events: [recognition('apple', 'good')] }),
    sense('pear', { events: [recognition('pear', 'easy')] }),
  ])
  assert.equal(result.action, 'recognized_speech')
  assert.equal(result.reason, 'Ты уже узнаёшь эти слова, теперь пора научиться самостоятельно их использовать.')
  assert.deepEqual(ids(result).sort(), ['apple', 'pear'])
})

test('again и hard не считаются хорошим узнаванием', () => {
  const result = choose([
    sense('apple', {
      production: earlyCard(),
      recognition: { dueAt: FUTURE, lastReviewedAt: PAST },
      events: [recognition('apple', 'again')],
    }),
    sense('pear', {
      production: earlyCard(),
      recognition: { dueAt: FUTURE, lastReviewedAt: PAST },
      events: [recognition('pear', 'hard')],
    }),
  ])
  assert.notEqual(result.action, 'recognized_speech')
  assert.equal(result.action, 'free')
})

test('новые смыслы предлагают знакомство', () => {
  const result = choose([
    sense('new-a', { createdAt: '2026-11-01T00:00:00.000Z' }),
    sense('new-b', { createdAt: '2026-11-02T00:00:00.000Z' }),
  ])
  assert.equal(result.action, 'new_speech')
  assert.equal(result.reason, 'Есть новые слова, которые ещё не проходили разговорную практику.')
  assert.equal(result.intro_run_after, 1)
})

test('просроченное узнавание — отдельное занятие, не разговорный набор', () => {
  const result = choose([
    sense('seen', {
      production: earlyCard(),
      recognition: dueCard('2026-11-03T00:00:00.000Z'),
      events: [produced('seen', '2026-10-01T00:00:00.000Z'), recognition('seen', 'again')],
    }),
    sense('known', {
      production: earlyCard(),
      recognition: dueCard('2026-11-01T00:00:00.000Z'),
      events: [produced('known', '2026-10-02T00:00:00.000Z')],
    }),
  ])
  assert.equal(result.action, 'recognition')
  assert.equal(result.reason, 'Пришло время повторить слова на узнавание.')
  assert.equal(result.list_id, null)
  assert.deepEqual(ids(result), ['known', 'seen'])
})

test('без обязательных действий остаётся свободная практика', () => {
  const result = choose([
    sense('calm', { production: earlyCard(), recognition: { dueAt: FUTURE, lastReviewedAt: PAST } }),
  ])
  assert.equal(result.action, 'free')
  assert.equal(result.reason, 'Сейчас нет обязательных повторений. Можно свободно поговорить.')
  assert.deepEqual(result.senses, [])
  assert.equal(result.intro_run_after, 0)
})

test('две вводные рекомендации, третья возвращает ожидающее узнавание', () => {
  const rows = [
    sense('fresh-a', { createdAt: '2026-11-01T00:00:00.000Z' }),
    sense('fresh-b', { createdAt: '2026-11-02T00:00:00.000Z' }),
    sense('overdue', {
      production: earlyCard(),
      recognition: dueCard(),
      events: [produced('overdue', '2026-10-01T00:00:00.000Z')],
    }),
  ]
  const first = choose(rows, 0)
  const second = choose(rows, first.intro_run_after)
  const third = choose(rows, second.intro_run_after)
  assert.equal(first.action, 'new_speech')
  assert.equal(second.action, 'new_speech')
  assert.equal(second.intro_run_after, 2)
  assert.equal(third.action, 'recognition')
  assert.deepEqual(ids(third), ['overdue'])
  assert.equal(third.intro_run_after, 0)
})

test('повтор того же счётчика не сбрасывает и не двигает рекомендацию', () => {
  const rows = [
    sense('fresh-a'),
    sense('fresh-b', { createdAt: '2026-10-02T00:00:00.000Z' }),
    sense('overdue', {
      production: earlyCard(),
      recognition: dueCard(),
      events: [produced('overdue', '2026-10-01T00:00:00.000Z')],
    }),
  ]
  const storage = memoryStorage()
  writeIntroRun(storage, USER_ID, 2)
  const again = memoryStorage(storage.dump())
  assert.equal(readIntroRun(again, USER_ID), 2)
  const first = choose(rows, readIntroRun(again, USER_ID))
  const second = choose(rows, readIntroRun(again, USER_ID))
  assert.equal(first.action, 'recognition')
  assert.deepEqual(first, second)
  writeIntroRun(again, 'other-user', 1)
  assert.equal(readIntroRun(again, USER_ID), 2)
})

test('один смысл в двух списках не дублируется', () => {
  const result = choose([
    sense('shared', {
      listIds: ['list-a', 'list-b'],
      positions: { 'list-a': 1, 'list-b': 1 },
      production: dueCard(),
    }),
    sense('only-a', { listIds: ['list-a'], production: dueCard('2026-11-05T00:00:00.000Z') }),
  ], 0, [
    { id: 'list-a', title: 'A' },
    { id: 'list-b', title: 'B' },
  ])
  assert.equal(ids(result).filter((id) => id === 'shared').length, 1)
})

test('карточка узнавания не попадает в набор говорения', () => {
  const result = choose([
    sense('say', { production: dueCard() }),
    sense('talk', { production: dueCard('2026-11-08T00:00:00.000Z') }),
    sense('recognize-only', {
      production: earlyCard(),
      recognition: dueCard(),
      events: [recognition('recognize-only', 'good')],
    }),
  ])
  assert.equal(result.action, 'due_speech')
  assert.equal(ids(result).includes('recognize-only'), false)
})

test('будущая карточка не добавляется в просроченный набор', () => {
  const result = choose([
    sense('due', { production: dueCard() }),
    sense('waiting', { production: earlyCard() }),
    sense('fresh', { createdAt: '2026-11-03T00:00:00.000Z' }),
  ])
  assert.equal(result.action, 'due_speech')
  assert.deepEqual(ids(result), ['due', 'fresh'])
})

test('выбор рекомендации ничего не пишет в SM-2', async () => {
  const state = {
    sense_id: 'sense-1',
    card_type: 'production',
    due_at: FUTURE,
    last_reviewed_at: PAST,
    ease_factor: 2.5,
    interval_days: 6,
    repetitions: 2,
  }
  const before = JSON.stringify(state)
  const { handler, supabase } = createHandler({
    user_profiles: { data: { learning_language: 'en' }, error: null },
    vocab_senses: { data: [{ id: 'sense-1', vocabulary_id: 'word-1', headword: 'calm', gloss_ru: 'спокойный', created_at: PAST }], error: null },
    vocab_lists: { data: [{ id: 'list-1', title: 'Основной' }], error: null },
    vocab_list_items: { data: [{ list_id: 'list-1', vocabulary_id: 'word-1', position: 1 }], error: null },
    vocab_srs_states: { data: [state], error: null },
    vocab_review_events: { data: [], error: null },
  })
  const res = mockRes()
  await handler({ headers: { authorization: 'Bearer good-token' }, query: { intro_run: '0' } }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.action, 'free')
  assert.equal(JSON.stringify(state), before)
  assert.equal(supabase.writes.length, 0)
  assert.equal(supabase.calls.every((call) => call.ops.every((op) => op[0] === 'select' || op[0] === 'eq' || op[0] === 'maybeSingle')), true)
})

function memoryStorage(initial = {}) {
  const data = { ...initial }
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null
    },
    setItem(key, value) {
      data[key] = String(value)
    },
    removeItem(key) {
      delete data[key]
    },
    dump() {
      return { ...data }
    },
  }
}

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

function createHandler(tables) {
  const supabase = {
    calls: [],
    writes: [],
    from(table) {
      const call = { table, ops: [] }
      supabase.calls.push(call)
      const query = {
        select(columns) {
          call.ops.push(['select', columns])
          return query
        },
        eq(column, value) {
          call.ops.push(['eq', column, value])
          return query
        },
        maybeSingle() {
          call.ops.push(['maybeSingle'])
          return Promise.resolve(tables[table] || { data: null, error: null })
        },
        update() {
          supabase.writes.push('update')
          return Promise.resolve({ error: null })
        },
        insert() {
          supabase.writes.push('insert')
          return Promise.resolve({ error: null })
        },
        upsert() {
          supabase.writes.push('upsert')
          return Promise.resolve({ error: null })
        },
        delete() {
          supabase.writes.push('delete')
          return Promise.resolve({ error: null })
        },
        then(resolve, reject) {
          return Promise.resolve(tables[table] || { data: [], error: null }).then(resolve, reject)
        },
      }
      return query
    },
    rpc() {
      supabase.writes.push('rpc')
      return Promise.resolve({ error: null })
    },
  }
  const handler = createNextActionHandler({
    supabase,
    resolveUserId: async () => USER_ID,
    getBearerToken,
    safeSupabaseCall: async (fn) => fn(),
    now: () => NOW,
  })
  return { handler, supabase }
}
