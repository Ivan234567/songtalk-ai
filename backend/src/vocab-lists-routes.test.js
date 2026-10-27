import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listStarterPacks, findStarterPack } from './vocab-starter-packs.js'
import { registerVocabListsRoutes } from './vocab-lists-routes.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

test('стартовые наборы английского содержат числа и приветствия', () => {
  const packs = listStarterPacks('en')
  assert.equal(packs.length, 4)
  assert.ok(packs.some((pack) => pack.key === 'numbers' && pack.word_count === 21))
  assert.ok(findStarterPack('greetings', 'en'))
  assert.equal(findStarterPack('numbers', 'zh'), null)
})

test('маршруты библиотеки списков зарегистрированы', () => {
  const routes = []
  const app = {
    get(path) { routes.push(['GET', path]) },
    post(path) { routes.push(['POST', path]) },
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
    ['GET', '/api/vocabulary/lists/:id'],
    ['GET', '/api/vocabulary/lists/:id/listen'],
  ])
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
