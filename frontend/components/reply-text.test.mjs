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

test('английский промпт не съедает реплику, которая стоит после него', () => {
  const raw = [
    'CUSTOM REMINDER: stay in the roleplay.',
    'Sure, oat milk is fine.',
    '««TRANSLATION»»Хорошо, овсяное молоко подойдёт.',
  ].join('\n')
  assert.equal(extractCleanEnglishText(raw), 'Sure, oat milk is fine.')
  assert.equal(extractEnglishTranslation(raw), 'Хорошо, овсяное молоко подойдёт.')
})
