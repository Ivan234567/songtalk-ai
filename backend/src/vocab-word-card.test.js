import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildWordCardPayload,
  lexiconNeedsEnrichment,
  normalizeWordLexicon,
} from './vocab-word-card.js'

test('normalizeWordLexicon собирает несколько значений и примеры с переводом', () => {
  const lexicon = normalizeWordLexicon({
    word: 'Bank',
    phonetic: '/bæŋk/',
    part_of_speech: 'существительное',
    difficulty_level: 'A2',
    senses: [
      {
        gloss: 'банк',
        definition: 'финансовое учреждение',
        examples: [{ text: 'I went to the bank.', translation: 'Я пошёл в банк.' }],
      },
      { gloss: 'берег', part_of_speech: 'существительное', examples: ['river bank'] },
    ],
  }, 'en')
  assert.equal(lexicon.word, 'bank')
  assert.equal(lexicon.senses.length, 2)
  assert.equal(lexicon.senses[0].gloss, 'банк')
  assert.equal(lexicon.senses[0].definition, 'финансовое учреждение')
  assert.equal(lexicon.senses[0].examples[0].translation, 'Я пошёл в банк.')
  assert.equal(lexicon.senses[1].gloss, 'берег')
  assert.equal(lexicon.examples[0].text, 'I went to the bank.')
})

test('normalizeWordLexicon сохраняет seed gloss если ИИ его пропустил', () => {
  const lexicon = normalizeWordLexicon({
    word: 'set',
    senses: [{ gloss: 'набор', examples: [{ text: 'a set of tools', translation: 'набор инструментов' }] }],
  }, 'en', { gloss: 'устанавливать' })
  assert.equal(lexicon.senses[0].gloss, 'устанавливать')
  assert.equal(lexicon.senses[1].gloss, 'набор')
})

test('lexiconNeedsEnrichment: нужна доработка без примеров', () => {
  assert.equal(lexiconNeedsEnrichment({
    definitions: [{ translation: 'комната' }],
    example_sentences: [],
  }, { translations: ['комната'] }), true)
  assert.equal(lexiconNeedsEnrichment({
    definitions: [{ translation: 'банк' }, { translation: 'берег' }],
    example_sentences: ['I went to the bank.'],
  }, { translations: ['банк', 'берег'] }), false)
})

test('buildWordCardPayload отдаёт значения с примерами', () => {
  const card = buildWordCardPayload({
    vocabulary: { id: 'v1', word: 'bank', part_of_speech: 'noun', pinyin: null, difficulty_level: 'A2' },
    senses: [
      { id: 's1', gloss_ru: 'банк', part_of_speech: 'существительное' },
      { id: 's2', gloss_ru: 'берег', part_of_speech: 'существительное' },
    ],
    cache: {
      phonetic_transcription: '/bæŋk/',
      difficulty_level: 'A2',
      definitions: [
        { translation: 'банк', definition: 'финансовое учреждение', examples: [{ text: 'I went to the bank.', translation: 'Я пошёл в банк.' }] },
        { translation: 'берег', examples: [{ text: 'river bank' }] },
      ],
      example_sentences: [{ text: 'I went to the bank.', translation: 'Я пошёл в банк.' }],
    },
    lexicon: null,
  })
  assert.equal(card.headword, 'bank')
  assert.equal(card.senses.length, 2)
  assert.equal(card.senses[0].examples[0].text, 'I went to the bank.')
  assert.equal(card.senses[0].definition, 'финансовое учреждение')
  assert.equal(card.phonetic, '/bæŋk/')
  assert.equal(card.difficulty_level, 'A2')
})
