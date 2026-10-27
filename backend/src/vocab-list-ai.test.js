import test from 'node:test'
import assert from 'node:assert/strict'
import { createResolveListEntries } from './vocab-list-ai.js'

test('разбор ввода возвращает английские слова и русский перевод', async () => {
  const resolve = createResolveListEntries({
    billableChatCreate: async () => ({
      ok: true,
      result: {
        text: JSON.stringify({
          items: [
            { word: 'room', gloss: 'комната', phonetic: '/ruːm/', part_of_speech: 'существительное' },
            { word: 'комната', gloss: 'room' },
          ],
        }),
      },
    }),
  })
  const items = await resolve({ text: 'комната, room', language: 'en', userId: 'user' })
  assert.equal(items.length, 1)
  assert.equal(items[0].word, 'room')
  assert.equal(items[0].gloss, 'комната')
  assert.equal(items[0].phonetic, '/ruːm/')
})
