import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listStarterPacks, findStarterPack, STARTER_PACKS, demoListOrder } from './vocab-starter-packs.js'
import { registerVocabListsRoutes, classifyRecognitionState } from './vocab-lists-routes.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

test('после «Знаю» слово становится освоено, а не учу', () => {
  const now = new Date('2026-10-27T12:00:00.000Z')
  assert.equal(classifyRecognitionState(null, now), 'new')
  assert.equal(classifyRecognitionState({
    last_reviewed_at: null,
    interval_days: 0,
    repetitions: 0,
    due_at: now.toISOString(),
  }, now), 'new')
  // Первый успешный ответ SM-2: reps=1, interval=1, due завтра.
  assert.equal(classifyRecognitionState({
    last_reviewed_at: now.toISOString(),
    interval_days: 1,
    repetitions: 1,
    due_at: '2026-10-28T12:00:00.000Z',
  }, now), 'mastered')
  // «Не знаю» сбрасывает серию.
  assert.equal(classifyRecognitionState({
    last_reviewed_at: now.toISOString(),
    interval_days: 1,
    repetitions: 0,
    due_at: '2026-10-28T12:00:00.000Z',
  }, now), 'learning')
  // Когда срок подошёл — снова к повторению.
  assert.equal(classifyRecognitionState({
    last_reviewed_at: '2026-10-26T12:00:00.000Z',
    interval_days: 1,
    repetitions: 1,
    due_at: '2026-10-27T11:00:00.000Z',
  }, now), 'due')
})

test('пять демо-списков A1–A2 по 20 слов', () => {
  const packs = listStarterPacks('en')
  assert.equal(packs.length, 5)
  for (const pack of packs) {
    assert.equal(pack.word_count, 20)
    assert.ok(pack.level === 'A1' || pack.level === 'A2')
  }
  assert.ok(findStarterPack('intro', 'en'))
  assert.equal(findStarterPack('intro', 'zh'), null)
  assert.deepEqual(STARTER_PACKS.map((pack) => pack.key), ['intro', 'family', 'home', 'food', 'everyday'])
  assert.deepEqual(['intro', 'family', 'home', 'food', 'everyday'].map((key) => demoListOrder(key)), [0, 1, 2, 3, 4])
  for (const pack of STARTER_PACKS) {
    for (const word of pack.words) {
      assert.equal(typeof word.phonetic, 'string')
      assert.ok(word.phonetic.startsWith('/'))
      assert.ok(word.partOfSpeech)
    }
  }
  const eat = findStarterPack('food', 'en').words.find((word) => word.word === 'eat')
  const work = findStarterPack('everyday', 'en').words.find((word) => word.word === 'work')
  assert.equal(eat.partOfSpeech, 'глагол')
  assert.equal(work.partOfSpeech, 'существительное')
})

test('маршруты библиотеки списков зарегистрированы', () => {
  const routes = []
  const app = {
    get(path) { routes.push(['GET', path]) },
    post(path) { routes.push(['POST', path]) },
    patch(path) { routes.push(['PATCH', path]) },
    delete(path) { routes.push(['DELETE', path]) },
  }
  registerVocabListsRoutes(app, {
    supabase: {},
    resolveUserId: async () => 'user',
    getBearerToken: () => 'token',
    safeSupabaseCall: async (fn) => fn(),
    asyncHandler: (fn) => fn,
  })
  assert.deepEqual(routes, [
    ['GET', '/api/vocabulary/lists'],
    ['POST', '/api/vocabulary/lists'],
    ['POST', '/api/vocabulary/lists/starter'],
    ['PATCH', '/api/vocabulary/lists/:id'],
    ['DELETE', '/api/vocabulary/lists/:id'],
    ['GET', '/api/vocabulary/lists/:id'],
    ['POST', '/api/vocabulary/lists/:id/words/resolve'],
    ['POST', '/api/vocabulary/lists/:id/words/bulk'],
    ['POST', '/api/vocabulary/lists/:id/words'],
    ['DELETE', '/api/vocabulary/lists/:id/words/:vocabularyId'],
    ['GET', '/api/vocabulary/lists/:id/listen'],
  ])
})

test('библиотека создаёт системные списки и отдаёт транскрипцию', () => {
  const source = readFileSync(join(root, 'backend/src/vocab-lists-routes.js'), 'utf8')
  assert.match(source, /ensureDemoLists/)
  assert.match(source, /Списки ещё не включены в базе/)
  assert.match(source, /phonetic_transcription/)
  assert.match(source, /orderLibraryItems/)
})

test('миграция создаёт списки и не объявляет режимы отработки в словаре', () => {
  const sql = readFileSync(join(root, 'supabase/migrations/20261027090000_create_vocab_lists.sql'), 'utf8')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS vocab_lists/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS vocab_list_items/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS vocab_list_collections/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS vocab_list_tags/)
  assert.doesNotMatch(sql, /flashcard|matching|vocabchat/i)
  assert.match(sql, /Послушать\/Сказать сам/)
})
