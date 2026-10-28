import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listStarterPacks, findStarterPack, STARTER_PACKS, demoListOrder } from './vocab-starter-packs.js'
import {
  registerVocabListsRoutes,
  classifyRecognitionState,
  parseListBindingInput,
  listBindingPatch,
  inferThemeKeys,
} from './vocab-lists-routes.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

test('статусы recognition: первый Знаю = учу, устойчивый интервал = освоено', () => {
  const now = new Date('2026-10-27T12:00:00.000Z')
  assert.equal(classifyRecognitionState(null, now), 'new')
  assert.equal(classifyRecognitionState({
    last_reviewed_at: null,
    interval_days: 0,
    repetitions: 0,
    due_at: now.toISOString(),
  }, now), 'new')
  // Первый успешный ответ SM-2: reps=1, interval=1 → ещё учит.
  assert.equal(classifyRecognitionState({
    last_reviewed_at: now.toISOString(),
    interval_days: 1,
    repetitions: 1,
    due_at: '2026-10-28T12:00:00.000Z',
  }, now), 'learning')
  // Второй успех: interval=6, reps=2 → освоено.
  assert.equal(classifyRecognitionState({
    last_reviewed_at: now.toISOString(),
    interval_days: 6,
    repetitions: 2,
    due_at: '2026-11-02T12:00:00.000Z',
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
    interval_days: 6,
    repetitions: 2,
    due_at: '2026-10-27T11:00:00.000Z',
  }, now), 'due')
})

test('listen из списка не подмешивает карточки не due', () => {
  const source = readFileSync(join(root, 'backend/src/vocab-lists-routes.js'), 'utf8')
  assert.match(source, /Только новые и due/)
  assert.doesNotMatch(source, /\[\.\.\.dueFirst, \.\.\.rest\]/)
})

test('ensureDemoLists не создаёт удалённые system-наборы заново', () => {
  const source = readFileSync(join(root, 'backend/src/vocab-lists-routes.js'), 'utf8')
  const fnStart = source.indexOf('async function ensureDemoLists')
  const fnEnd = source.indexOf('export function createStarterPackHandler', fnStart)
  const body = source.slice(fnStart, fnEnd)
  assert.match(body, /if \(!existing\?\.id\) continue/)
  assert.doesNotMatch(body, /\.insert\(\{\s*user_id: userId,\s*language,\s*title: pack\.title/)
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
    ['POST', '/api/vocabulary/lists/generate-for-context'],
    ['GET', '/api/vocabulary/lists/course-modules'],
    ['POST', '/api/vocabulary/lists/starter'],
    ['PATCH', '/api/vocabulary/lists/:id'],
    ['DELETE', '/api/vocabulary/lists/:id'],
    ['GET', '/api/vocabulary/lists/:id'],
    ['POST', '/api/vocabulary/lists/:id/regenerate'],
    ['POST', '/api/vocabulary/lists/:id/session-picks'],
    ['GET', '/api/vocabulary/lists/:id/words/:vocabularyId'],
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

test('привязка списка: parse + patch + миграция scene binding', () => {
  assert.deepEqual(parseListBindingInput({}), { present: false })
  assert.deepEqual(parseListBindingInput({ bound_kind: null }), {
    present: true,
    clear: true,
    bound_kind: null,
    bound_ref: null,
    bound_origin: null,
    bound_label: null,
  })
  const bound = parseListBindingInput({
    binding: {
      kind: 'scenario',
      ref: 'apartment-rental',
      origin: 'system',
      label: 'Аренда квартиры',
    },
  })
  assert.equal(bound.present, true)
  assert.equal(bound.clear, false)
  assert.equal(bound.bound_kind, 'scenario')
  assert.equal(bound.bound_ref, 'apartment-rental')
  assert.deepEqual(listBindingPatch(bound), {
    bound_kind: 'scenario',
    bound_ref: 'apartment-rental',
    bound_origin: 'system',
    bound_label: 'Аренда квартиры',
  })
  assert.throws(
    () => parseListBindingInput({ bound_kind: 'scenario' }),
    (err) => err?.status === 400,
  )

  const sql = readFileSync(join(root, 'supabase/migrations/20261028120000_vocab_lists_scene_binding.sql'), 'utf8')
  assert.match(sql, /bound_kind/)
  assert.match(sql, /bound_ref/)
  assert.match(sql, /'ai'/)
  assert.match(sql, /idx_vocab_lists_bound/)
})

test('библиотека фильтрует и отдаёт привязку', () => {
  const source = readFileSync(join(root, 'backend/src/vocab-lists-routes.js'), 'utf8')
  assert.match(source, /bound_kind/)
  assert.match(source, /parseListBindingInput/)
  assert.match(source, /LIST_ROW_FIELDS/)
  assert.match(source, /req\.query\?\.bound_ref/)
  assert.match(source, /reuse_bound/)
  assert.match(source, /theme_keys/)
  assert.match(source, /generate-for-context/)
  assert.match(source, /session-picks/)
  assert.match(source, /\/regenerate/)
})

test('inferThemeKeys достаёт темы из подписи сцены', () => {
  const keys = inferThemeKeys('Аренда квартиры', 'apartment rental landlord')
  assert.ok(keys.includes('home'))
  assert.deepEqual(inferThemeKeys(''), [])
})

test('миграция theme_keys для списков', () => {
  const sql = readFileSync(join(root, 'supabase/migrations/20261028140000_vocab_lists_theme_keys.sql'), 'utf8')
  assert.match(sql, /theme_keys/)
  assert.match(sql, /GIN/)
})
