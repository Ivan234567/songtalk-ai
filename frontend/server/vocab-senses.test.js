import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSenseDrafts } from './vocab-senses.js'

const base = {
  id: 'vocab-1',
  user_id: 'user-1',
  language: 'en',
  word: 'book',
  part_of_speech: 'noun',
  contexts: [{ video_id: 'video-1', text: 'I booked a table', timestamp: '2026-01-01T00:00:00.000Z' }],
}

test('два уникальных перевода дают два значения в порядке появления', () => {
  const drafts = buildSenseDrafts({
    ...base,
    translations: [
      { translation: 'книга', source: 'ai' },
      { translation: 'бронировать', source: 'manual' },
    ],
  })
  assert.deepEqual(drafts.map((draft) => draft.gloss_ru), ['книга', 'бронировать'])
  assert.deepEqual(drafts.map((draft) => draft.sense_key), ['книга', 'бронировать'])
  assert.equal(drafts[0].part_of_speech, 'noun')
  assert.equal(drafts[0].context_text, 'I booked a table')
  assert.equal(drafts[1].context_text, 'I booked a table')
})

test('повтор перевода, включая краевые пробелы, не создаёт второй черновик', () => {
  const drafts = buildSenseDrafts({
    ...base,
    translations: ['книга', { translation: ' книга ' }, { translation: 'книга', source: 'ai' }],
  })
  assert.equal(drafts.length, 1)
  assert.equal(drafts[0].gloss_ru, 'книга')
  assert.equal(drafts[0].sense_key, 'книга')
})

test('пустые строки и пробелы пропускаются', () => {
  const drafts = buildSenseDrafts({
    ...base,
    translations: ['', '   ', { translation: '  ' }, { translation: 'бронь' }, null],
  })
  assert.deepEqual(drafts.map((draft) => draft.gloss_ru), ['бронь'])
})

test('без переводов черновиков нет', () => {
  assert.deepEqual(buildSenseDrafts({ ...base, translations: [] }), [])
  assert.deepEqual(buildSenseDrafts({ ...base, translations: null }), [])
  assert.deepEqual(buildSenseDrafts({ ...base }), [])
})

test('строка и объект с translation читаются, прочие элементы пропускаются', () => {
  const drafts = buildSenseDrafts({
    ...base,
    translations: [
      'книга',
      { translation: 'резерв' },
      { translation: 'запись', source: 'ai' },
      { source: 'ai' },
      { translation: 12 },
      7,
    ],
  })
  assert.deepEqual(drafts.map((draft) => draft.gloss_ru), ['книга', 'резерв', 'запись'])
})

test('идентификаторы, язык и написание берутся из записи как есть', () => {
  const drafts = buildSenseDrafts({
    ...base,
    id: 'vocab-9',
    user_id: 'user-9',
    language: 'zh',
    word: '你好',
    translations: [{ translation: 'привет' }],
  })
  assert.equal(drafts.length, 1)
  assert.equal(drafts[0].vocabulary_id, 'vocab-9')
  assert.equal(drafts[0].user_id, 'user-9')
  assert.equal(drafts[0].language, 'zh')
  assert.equal(drafts[0].headword, '你好')
})

test('headword сохраняет регистр исходного word', () => {
  const drafts = buildSenseDrafts({
    ...base,
    word: 'Book',
    translations: ['книга'],
  })
  assert.equal(drafts[0].headword, 'Book')
})

test('sense_key равен переводу и укладывается в ограничение миграции', () => {
  const gloss = 'значение'
  const drafts = buildSenseDrafts({ ...base, translations: [`  ${gloss}  `] })
  assert.equal(drafts[0].sense_key, drafts[0].gloss_ru)
  assert.equal(drafts[0].sense_key, gloss)
  assert.ok(drafts[0].sense_key.trim().length >= 1)
  assert.ok(Array.from(drafts[0].sense_key).length <= 200)
})

test('разный регистр перевода не склеивается в одно значение', () => {
  const drafts = buildSenseDrafts({
    ...base,
    translations: ['Книга', 'книга'],
  })
  assert.deepEqual(drafts.map((draft) => draft.sense_key), ['Книга', 'книга'])
})

test('один и тот же вход даёт тот же порядок', () => {
  const row = { ...base, translations: [{ translation: 'книга' }, 'бронь'] }
  assert.deepEqual(buildSenseDrafts(row), buildSenseDrafts(row))
})

test('входная запись и вложенные массивы не меняются', () => {
  const row = {
    ...base,
    translations: [{ translation: ' книга ', source: 'ai' }],
    contexts: [{ text: ' I booked a table ' }],
  }
  const snapshot = structuredClone(row)
  Object.freeze(row)
  Object.freeze(row.translations)
  Object.freeze(row.translations[0])
  Object.freeze(row.contexts)
  Object.freeze(row.contexts[0])
  const drafts = buildSenseDrafts(row)
  assert.deepEqual(row, snapshot)
  assert.equal(drafts[0].gloss_ru, 'книга')
  assert.equal(drafts[0].context_text, ' I booked a table ')
})

test('неполная или чужая запись даёт пустой массив', () => {
  assert.deepEqual(buildSenseDrafts(null), [])
  assert.deepEqual(buildSenseDrafts(['book']), [])
  assert.deepEqual(buildSenseDrafts({ ...base, id: '   ', translations: ['книга'] }), [])
  assert.deepEqual(buildSenseDrafts({ ...base, user_id: '', translations: ['книга'] }), [])
  assert.deepEqual(buildSenseDrafts({ ...base, language: 'fr', translations: ['книга'] }), [])
  assert.deepEqual(buildSenseDrafts({ ...base, word: '   ', translations: ['книга'] }), [])
})

test('перевод длиннее 200 символов не становится ключом', () => {
  const longGloss = 'я'.repeat(201)
  const drafts = buildSenseDrafts({
    ...base,
    translations: [longGloss, 'короткий'],
  })
  assert.deepEqual(drafts.map((draft) => draft.gloss_ru), ['короткий'])
})
