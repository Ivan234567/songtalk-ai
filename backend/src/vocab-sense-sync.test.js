import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSenseDrafts } from './vocab-senses.js'
import {
  ensureUserVocabularySenses,
  SENSE_INSERT_BATCH_SIZE,
  VOCABULARY_PAGE_SIZE,
} from './vocab-sense-sync.js'

function word(id, translations, extra = {}) {
  return {
    id,
    user_id: 'user-1',
    language: 'en',
    word: 'book',
    translations,
    part_of_speech: 'noun',
    contexts: [{ text: 'a book' }],
    ...extra,
  }
}

function createMock(options = {}) {
  const pages = options.pages || [[]]
  const calls = {
    from: [],
    filters: [],
    orders: [],
    ranges: [],
    upserts: [],
  }
  function supabaseFrom(table) {
    calls.from.push(table)
    const state = { table, filters: [] }
    const query = {
      select() {
        return query
      },
      eq(column, value) {
        state.filters.push([column, value])
        calls.filters.push({ table, column, value })
        return query
      },
      order(column, orderOptions) {
        calls.orders.push({ table, column, orderOptions })
        return query
      },
      range(from, to) {
        calls.ranges.push({ table, from, to })
        if (options.failRead) {
          return Promise.resolve({ data: null, error: { message: 'read failed' } })
        }
        const pageIndex = Math.floor(from / VOCABULARY_PAGE_SIZE)
        const page = pages[pageIndex] || []
        return Promise.resolve({ data: page, error: null })
      },
      upsert(rows, upsertOptions) {
        calls.upserts.push({ table, rows, upsertOptions })
        const result = options.failUpsert
          ? { data: null, error: { message: 'insert failed' } }
          : {
            data: (options.createdIds || rows.map((_, index) => ({ id: `sense-${calls.upserts.length}-${index}` }))),
            error: null,
          }
        return {
          select() {
            return Promise.resolve(result)
          },
        }
      },
    }
    return query
  }

  return { supabase: { from: supabaseFrom }, calls }
}

test('без userId или language база не читается', async () => {
  const { supabase, calls } = createMock()
  await assert.rejects(
    () => ensureUserVocabularySenses({ supabase, userId: '', language: 'en' }),
    /userId is required/,
  )
  await assert.rejects(
    () => ensureUserVocabularySenses({ supabase, userId: 'user-1', language: 'fr' }),
    /language must be en or zh/,
  )
  await assert.rejects(
    () => ensureUserVocabularySenses({ supabase: {}, userId: 'user-1', language: 'en' }),
    /supabase client is required/,
  )
  assert.equal(calls.from.length, 0)
})

test('словарь читается только по userId и language', async () => {
  const { supabase, calls } = createMock({ pages: [[]] })
  const result = await ensureUserVocabularySenses({ supabase, userId: 'user-1', language: 'zh' })
  assert.deepEqual(result, { vocabularyRows: 0, drafts: 0, created: 0 })
  assert.deepEqual(
    calls.filters.filter((item) => item.table === 'user_vocabulary'),
    [
      { table: 'user_vocabulary', column: 'user_id', value: 'user-1' },
      { table: 'user_vocabulary', column: 'language', value: 'zh' },
    ],
  )
  assert.deepEqual(calls.orders, [{
    table: 'user_vocabulary',
    column: 'id',
    orderOptions: { ascending: true },
  }])
})

test('два перевода одного слова готовятся через buildSenseDrafts и вставляются одним пакетом', async () => {
  const row = word('vocab-1', [
    { translation: 'книга', source: 'ai' },
    { translation: 'бронировать', source: 'manual' },
  ])
  const { supabase, calls } = createMock({ pages: [[row]] })
  const result = await ensureUserVocabularySenses({ supabase, userId: 'user-1', language: 'en' })
  assert.equal(calls.upserts.length, 1)
  assert.deepEqual(calls.upserts[0].rows, buildSenseDrafts(row))
  assert.equal(calls.upserts[0].rows.length, 2)
  assert.deepEqual(result, { vocabularyRows: 1, drafts: 2, created: 2 })
})

test('конфликт по vocabulary_id и sense_key игнорирует уже существующие строки', async () => {
  const row = word('vocab-1', ['книга'])
  const { supabase, calls } = createMock({ pages: [[row]] })
  await ensureUserVocabularySenses({ supabase, userId: 'user-1', language: 'en' })
  await ensureUserVocabularySenses({ supabase, userId: 'user-1', language: 'en' })
  assert.equal(calls.upserts.length, 2)
  for (const upsert of calls.upserts) {
    assert.equal(upsert.table, 'vocab_senses')
    assert.deepEqual(upsert.upsertOptions, {
      onConflict: 'vocabulary_id,sense_key',
      ignoreDuplicates: true,
    })
    assert.equal(Object.hasOwn(upsert.rows[0], 'ease_factor'), false)
    assert.equal(Object.hasOwn(upsert.rows[0], 'card_type'), false)
  }
  assert.equal(calls.from.includes('vocab_srs_states'), false)
  assert.equal(calls.from.includes('vocabulary_progress'), false)
})

test('пустой словарь и слово без перевода не вставляют пакет', async () => {
  const empty = createMock({ pages: [[]] })
  await ensureUserVocabularySenses({ supabase: empty.supabase, userId: 'user-1', language: 'en' })
  assert.equal(empty.calls.upserts.length, 0)

  const blank = createMock({ pages: [[word('vocab-1', ['  ', { translation: '' }])]] })
  const result = await ensureUserVocabularySenses({
    supabase: blank.supabase,
    userId: 'user-1',
    language: 'en',
  })
  assert.equal(blank.calls.upserts.length, 0)
  assert.deepEqual(result, { vocabularyRows: 1, drafts: 0, created: 0 })
})

test('ошибка чтения останавливает синхронизацию до вставки', async () => {
  const { supabase, calls } = createMock({
    pages: [[word('vocab-1', ['книга'])]],
    failRead: true,
  })
  await assert.rejects(
    () => ensureUserVocabularySenses({ supabase, userId: 'user-1', language: 'en' }),
    /Failed to read user vocabulary/,
  )
  assert.equal(calls.upserts.length, 0)
})

test('ошибка вставки не считается успехом', async () => {
  const { supabase } = createMock({
    pages: [[word('vocab-1', ['книга'])]],
    failUpsert: true,
  })
  await assert.rejects(
    () => ensureUserVocabularySenses({ supabase, userId: 'user-1', language: 'en' }),
    /Failed to insert vocabulary senses/,
  )
})

test('успешная вставка считает только строки из ответа', async () => {
  const row = word('vocab-1', ['книга', 'бронь'])
  const { supabase } = createMock({
    pages: [[row]],
    createdIds: [{ id: 'only-new' }],
  })
  const result = await ensureUserVocabularySenses({ supabase, userId: 'user-1', language: 'en' })
  assert.equal(result.drafts, 2)
  assert.equal(result.created, 1)
})

test('страницы словаря читаются по id без пропуска и повтора', async () => {
  const first = Array.from({ length: VOCABULARY_PAGE_SIZE }, (_, index) => (
    word(`vocab-${String(index).padStart(4, '0')}`, ['книга'])
  ))
  const second = [word('vocab-last', ['бронь'])]
  const { supabase, calls } = createMock({ pages: [first, second] })
  const result = await ensureUserVocabularySenses({ supabase, userId: 'user-1', language: 'en' })
  assert.deepEqual(calls.ranges, [
    { table: 'user_vocabulary', from: 0, to: VOCABULARY_PAGE_SIZE - 1 },
    { table: 'user_vocabulary', from: VOCABULARY_PAGE_SIZE, to: VOCABULARY_PAGE_SIZE * 2 - 1 },
  ])
  const ids = calls.upserts.flatMap((upsert) => upsert.rows.map((row) => row.vocabulary_id))
  assert.equal(ids.length, VOCABULARY_PAGE_SIZE + 1)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(ids[0], 'vocab-0000')
  assert.equal(ids.at(-1), 'vocab-last')
  assert.equal(result.vocabularyRows, VOCABULARY_PAGE_SIZE + 1)
  assert.equal(result.drafts, VOCABULARY_PAGE_SIZE + 1)
  assert.ok(calls.upserts.every((upsert) => upsert.rows.length <= SENSE_INSERT_BATCH_SIZE))
})

test('чужой владелец или язык не вставляется', async () => {
  const foreignUser = createMock({
    pages: [[word('vocab-1', ['книга'], { user_id: 'user-2' })]],
  })
  await assert.rejects(
    () => ensureUserVocabularySenses({ supabase: foreignUser.supabase, userId: 'user-1', language: 'en' }),
    /does not match userId or language/,
  )
  assert.equal(foreignUser.calls.upserts.length, 0)

  const foreignLanguage = createMock({
    pages: [[word('vocab-1', ['книга'], { language: 'zh' })]],
  })
  await assert.rejects(
    () => ensureUserVocabularySenses({
      supabase: foreignLanguage.supabase,
      userId: 'user-1',
      language: 'en',
    }),
    /does not match userId or language/,
  )
  assert.equal(foreignLanguage.calls.upserts.length, 0)
})
