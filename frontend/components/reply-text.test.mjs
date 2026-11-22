import assert from 'node:assert/strict'
import test from 'node:test'
import {
  extractCleanChineseText,
  extractCleanEnglishText,
  extractEnglishTranslation,
  extractTranslation,
} from './ChineseRubyText.tsx'

const coffee = [
  'Almond milk costs more. Let\'s go: Is that OK?',
  '««TRANSLATION»»Миндальное молоко стоит дороже. Хорошо?»',
].join('\n')

test('английская реплика сохраняет фразу до Let\'s go и убирает хвостовую кавычку перевода', () => {
  assert.equal(extractCleanEnglishText(coffee), 'Almond milk costs more. Is that OK?')
  assert.equal(extractEnglishTranslation(coffee), 'Миндальное молоко стоит дороже. Хорошо?')
})

test('китайская очистка по-прежнему оставляет хвост после Let\'s go', () => {
  const raw = 'Your task: keep it HSK.\nLet\'s go: 你好！\n««TRANSLATION»»Привет!»'
  assert.equal(extractCleanChineseText(raw), '你好！')
  assert.equal(extractTranslation(raw), 'Привет!')
})

test('служебная заметка дебата не попадает в речь и не съедает живую фразу', () => {
  const onlyNote = [
    'Do not write notes.',
    'Output ONLY the two lines in this format. Never mention the translation line\'s existence. Never use Russian in the spoken lines. If the user\'s last message was in Russian, translate their line in your thinking without speaking it, and then write your English line.',
  ].join('\n')
  assert.equal(extractCleanEnglishText(onlyNote), '')
  const mixed = [
    'I think cooking at home is better. It is healthier.',
    '««TRANSLATION»»Домашняя еда полезнее.',
    'Do not write notes. Output ONLY the two lines in this format.',
  ].join('\n')
  assert.equal(extractCleanEnglishText(mixed), 'I think cooking at home is better. It is healthier.')
  assert.equal(extractEnglishTranslation(mixed), 'Домашняя еда полезнее.')
})

test('английский промпт не съедает реплику, которая стоит после него', () => {
  const raw = [
    'CUSTOM REMINDER: stay in the roleplay.',
    'Sure, oat milk is fine.',
    '««TRANSLATION»»Хорошо, овсяное молоко подойдёт.',
  ].join('\n')
  assert.equal(extractCleanEnglishText(raw), 'Sure, oat milk is fine.')
  assert.equal(extractEnglishTranslation(raw), 'Хорошо, овсяное молоко подойдёт.')
})
