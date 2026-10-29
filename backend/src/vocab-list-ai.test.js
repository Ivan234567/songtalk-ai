import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createResolveListEntries,
  createGenerateBoundListEntries,
  validateBoundListDraft,
  cleanEntry,
  parseGeneratedList,
} from './vocab-list-ai.js'

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

test('QC отбрасывает мусор: латиница в gloss, дубли, placeholder', () => {
  const draft = validateBoundListDraft([
    { word: 'rent', gloss: 'аренда' },
    { word: 'rent', gloss: 'повтор' },
    { word: 'apple', gloss: 'apple' },
    { word: 'word0', gloss: 'перевод0' },
    { word: 'lease', gloss: 'договор аренды' },
    { word: 'landlord', gloss: 'арендодатель' },
    { word: 'deposit', gloss: 'залог' },
    { word: 'utilities', gloss: 'коммунальные услуги' },
    { word: 'tenant', gloss: 'арендатор' },
    { word: 'contract', gloss: 'контракт' },
    { word: 'keys', gloss: 'ключи' },
  ], {
    language: 'en',
    mode: 'roleplay',
    themeText: 'rent apartment landlord lease deposit',
    min: 6,
    max: 12,
  })
  assert.equal(draft.ok, true)
  assert.ok(draft.items.every((item) => item.word !== 'word0'))
  assert.ok(draft.items.every((item) => item.word !== 'apple'))
  assert.ok(draft.theme_ratio >= 0.4)
})

test('QC ролевой сцены не бракует слова кофейни без дословного совпадения', () => {
  const words = [
    ['latte', 'латте'],
    ['espresso', 'эспрессо'],
    ['cappuccino', 'капучино'],
    ['milk', 'молоко'],
    ['sugar', 'сахар'],
    ['cup', 'чашка'],
    ['size', 'размер'],
    ['order', 'заказ'],
  ]
  const draft = validateBoundListDraft(
    words.map(([word, gloss]) => ({ word, gloss })),
    {
      language: 'en',
      mode: 'roleplay',
      themeText: 'Кофейня. Закажите напиток.',
      steps: ['Назвать напиток', 'Уточнить размер'],
      min: 6,
      max: 8,
    },
  )
  assert.equal(draft.ok, true)
  assert.equal(draft.items.length, 8)
})

test('QC дебата не гоняет второй запрос из-за дословного совпадения', () => {
  const draft = validateBoundListDraft([
    { word: 'banana', gloss: 'банан' },
    { word: 'guitar', gloss: 'гитара' },
    { word: 'soccer', gloss: 'футбол' },
    { word: 'pencil', gloss: 'карандаш' },
    { word: 'window', gloss: 'окно' },
    { word: 'ticket', gloss: 'билет' },
    { word: 'river', gloss: 'река' },
    { word: 'camera', gloss: 'камера' },
  ], {
    language: 'en',
    mode: 'debate',
    themeText: 'climate policy carbon emissions debate parliament',
    min: 6,
  })
  assert.equal(draft.ok, true)
  assert.equal(draft.items.length, 8)
})

test('неполный JSON всё равно отдаёт уже готовые слова', () => {
  const parsed = parseGeneratedList('{"title":"Салон","items":[{"word":"haircut","gloss":"стрижка"},{"word":"appointment","gloss":"запись"')
  assert.equal(parsed.items.length, 2)
  assert.equal(parsed.items[0].word, 'haircut')
})

test('список сцены принимается, если слов хватает не на каждый шаг', () => {
  const words = ['scissors', 'comb', 'shampoo', 'towel', 'mirror', 'chair'].map((word, index) => ({
    word,
    gloss: ['ножницы', 'расчёска', 'шампунь', 'полотенце', 'зеркало', 'кресло'][index],
  }))
  const draft = validateBoundListDraft(words, {
    language: 'en',
    mode: 'roleplay',
    themeText: 'Салон. Запись на стрижку.',
    steps: ['Выбрать мастера', 'Назвать время', 'Уточнить цену', 'Подтвердить запись'],
    min: 6,
    max: 20,
  })
  assert.equal(draft.ok, true)
  assert.equal(draft.items.length, 6)
})

test('cleanEntry требует кириллический gloss', () => {
  assert.equal(cleanEntry({ word: 'rent', gloss: 'lease fee' }, 'en'), null)
  assert.equal(cleanEntry({ word: 'rent', gloss: 'аренда' }, 'en')?.word, 'rent')
  assert.equal(cleanEntry({ word: '房间', gloss: 'комната', pinyin: 'fang2jian1' }, 'zh')?.word, '房间')
})

test('генерация списка под сцену возвращает title и items', async () => {
  const generate = createGenerateBoundListEntries({
    billableChatCreate: async () => ({
      ok: true,
      result: {
        text: JSON.stringify({
          title: 'К аренде квартиры',
          items: [
            { word: 'rent', gloss: 'аренда', phonetic: '/rent/' },
            { word: 'lease', gloss: 'договор аренды', phonetic: '/liːs/' },
            { word: 'landlord', gloss: 'арендодатель', phonetic: '/ˈlænd.lɔːd/' },
            { word: 'deposit', gloss: 'залог', phonetic: '/dɪˈpɒz.ɪt/' },
            { word: 'tenant', gloss: 'арендатор', phonetic: '/ˈten.ənt/' },
            { word: 'utilities', gloss: 'коммунальные услуги', phonetic: '/juːˈtɪl.ə.tiz/' },
            { word: 'contract', gloss: 'контракт', phonetic: '/ˈkɒn.trækt/' },
            { word: 'keys', gloss: 'ключи', phonetic: '/kiːz/' },
          ],
        }),
      },
    }),
  })
  const result = await generate({
    userId: 'user',
    language: 'en',
    mode: 'roleplay',
    title: 'Apartment rental',
    goal: 'Rent a flat',
    themeText: 'rent apartment landlord lease deposit tenant',
    level: 'A2',
    count: 8,
  })
  assert.equal(result.title, 'К аренде квартиры')
  assert.ok(result.items.length >= 6)
  assert.equal(result.items[0].word, 'rent')
})

test('дебатная генерация отдаёт слова темы, даже если их меньше двадцати', async () => {
  let system = ''
  let user = ''
  const generate = createGenerateBoundListEntries({
    billableChatCreate: async (_userId, _id, payload) => {
      system = payload?.messages?.[0]?.content || ''
      user = payload?.messages?.[1]?.content || ''
      return {
        ok: true,
        result: {
          text: JSON.stringify({
            title: 'К теме фастфуда',
            items: [
              { word: 'fast food', gloss: 'фастфуд' },
              { word: 'obesity', gloss: 'ожирение' },
              { word: 'ban', gloss: 'запрет' },
              { word: 'health', gloss: 'здоровье' },
            ],
          }),
        },
      }
    },
  })
  const result = await generate({
    userId: 'user',
    language: 'en',
    mode: 'debate',
    topic: 'Fast food should be banned',
    title: 'Фастфуд должен быть запрещен',
    themeText: 'Fast food should be banned · Фастфуд должен быть запрещен · for',
  })
  assert.equal(result.items.length, 4)
  assert.equal(result.items[0].word, 'fast food')
  assert.match(user, /Fast food should be banned/)
  assert.match(system, /DEBATE/)
  assert.doesNotMatch(system, /Steps list/)
})

test('дебатная генерация отклоняет слишком короткий ответ одним вызовом', async () => {
  let calls = 0
  const generate = createGenerateBoundListEntries({
    billableChatCreate: async () => {
      calls += 1
      return {
        ok: true,
        result: { text: JSON.stringify({ title: 'x', items: [{ word: 'a', gloss: 'б' }] }) },
      }
    },
  })
  await assert.rejects(
    () => generate({ userId: 'user', language: 'en', mode: 'debate', topic: 'Climate' }),
    (err) => err?.status === 422,
  )
  assert.equal(calls, 1)
})

test('ZH не использует debate-режим внутри генератора', async () => {
  let seenMode = ''
  const generate = createGenerateBoundListEntries({
    billableChatCreate: async (_userId, _id, payload) => {
      seenMode = payload?.metadata?.mode || ''
      return {
        ok: true,
        result: {
          text: JSON.stringify({
            title: 'К разговору',
            items: [
              { word: '天气', gloss: 'погода', pinyin: 'tian1qi4' },
              { word: '环境', gloss: 'окружающая среда', pinyin: 'huan2jing4' },
              { word: '气候', gloss: 'климат', pinyin: 'qi4hou4' },
              { word: '污染', gloss: 'загрязнение', pinyin: 'wu1ran3' },
              { word: '保护', gloss: 'защищать', pinyin: 'bao3hu4' },
              { word: '能源', gloss: 'энергия', pinyin: 'neng2yuan2' },
              { word: '空气', gloss: 'воздух', pinyin: 'kong1qi4' },
              { word: '回收', gloss: 'переработка', pinyin: 'hui2shou1' },
            ],
          }),
        },
      }
    },
  })
  const result = await generate({
    userId: 'user',
    language: 'zh',
    mode: 'debate',
    count: 8,
  })
  assert.equal(seenMode, 'roleplay')
  assert.ok(result.items.length >= 6)
})
