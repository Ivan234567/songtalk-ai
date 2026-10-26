import test from 'node:test'
import assert from 'node:assert/strict'
import { applySm2Review, createInitialSm2State, SM2_DEFAULT_EASE, SM2_MIN_EASE } from './srs.js'

const NOW = new Date('2026-01-15T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

function dueAfter(days) {
  return new Date(NOW.getTime() + days * DAY_MS).toISOString()
}

function review(state, quality) {
  return applySm2Review(state, quality, NOW)
}

test('новая карточка сразу доступна и не имеет интервала', () => {
  const state = createInitialSm2State(NOW)
  assert.equal(state.easeFactor, SM2_DEFAULT_EASE)
  assert.equal(state.intervalDays, 0)
  assert.equal(state.repetitions, 0)
  assert.equal(state.dueAt.toISOString(), NOW.toISOString())
})

test('качество 5: первый успешный повтор даёт 1 день и повышает ease', () => {
  const next = review(createInitialSm2State(NOW), 5)
  assert.equal(next.intervalDays, 1)
  assert.equal(next.repetitions, 1)
  assert.equal(next.easeFactor, 2.6)
  assert.equal(next.dueAt.toISOString(), dueAfter(1))
})

test('качество 5: второй успешный повтор даёт 6 дней', () => {
  const first = review(createInitialSm2State(NOW), 5)
  const second = review(first, 5)
  assert.equal(second.intervalDays, 6)
  assert.equal(second.repetitions, 2)
  assert.equal(second.easeFactor, 2.7)
  assert.equal(second.dueAt.toISOString(), dueAfter(6))
})

test('третий успешный повтор умножает прежний интервал на прежний ease', () => {
  const first = review(createInitialSm2State(NOW), 5)
  const second = review(first, 5)
  const third = review(second, 5)
  assert.equal(third.intervalDays, 16)
  assert.equal(third.repetitions, 3)
  assert.equal(third.easeFactor, 2.8)
  assert.equal(third.dueAt.toISOString(), dueAfter(16))
})

test('качество 4 засчитывает повтор и оставляет ease прежним', () => {
  const next = review(createInitialSm2State(NOW), 4)
  assert.equal(next.intervalDays, 1)
  assert.equal(next.repetitions, 1)
  assert.equal(next.easeFactor, 2.5)
  assert.equal(next.dueAt.toISOString(), dueAfter(1))
})

test('качество 3 засчитывает повтор и снижает ease на 0.14', () => {
  const next = review(createInitialSm2State(NOW), 3)
  assert.equal(next.intervalDays, 1)
  assert.equal(next.repetitions, 1)
  assert.equal(next.easeFactor, 2.36)
  assert.equal(next.dueAt.toISOString(), dueAfter(1))
})

test('качество 1 сбрасывает серию и снижает ease на 0.54', () => {
  const next = review(createInitialSm2State(NOW), 1)
  assert.equal(next.intervalDays, 1)
  assert.equal(next.repetitions, 0)
  assert.equal(next.easeFactor, 1.96)
  assert.equal(next.dueAt.toISOString(), dueAfter(1))
})

test('неудача после успехов возвращает карточку к первому успешному шагу', () => {
  const first = review(createInitialSm2State(NOW), 5)
  const second = review(first, 5)
  const failed = review(second, 1)
  assert.equal(failed.intervalDays, 1)
  assert.equal(failed.repetitions, 0)
  assert.equal(failed.easeFactor, 2.16)
  assert.equal(failed.dueAt.toISOString(), dueAfter(1))

  const again = review(failed, 5)
  assert.equal(again.intervalDays, 1)
  assert.equal(again.repetitions, 1)
  assert.equal(again.easeFactor, 2.26)
  assert.equal(again.dueAt.toISOString(), dueAfter(1))
})

test('повторные неудачи держат интервал в 1 день и упираются в пол ease', () => {
  let state = createInitialSm2State(NOW)
  state = review(state, 1)
  assert.equal(state.easeFactor, 1.96)
  state = review(state, 1)
  assert.equal(state.easeFactor, 1.42)
  state = review(state, 1)
  assert.equal(state.easeFactor, SM2_MIN_EASE)
  assert.equal(state.intervalDays, 1)
  assert.equal(state.repetitions, 0)

  const stillFloor = review(state, 1)
  assert.equal(stillFloor.easeFactor, SM2_MIN_EASE)
  assert.equal(stillFloor.intervalDays, 1)
  assert.equal(stillFloor.repetitions, 0)
  assert.equal(stillFloor.dueAt.toISOString(), dueAfter(1))
})

test('ease не опускается ниже 1.3 даже если формула даёт меньше', () => {
  const atFloor = review({ easeFactor: SM2_MIN_EASE, intervalDays: 4, repetitions: 3 }, 1)
  assert.equal(atFloor.easeFactor, SM2_MIN_EASE)
  assert.equal(atFloor.repetitions, 0)
  assert.equal(atFloor.intervalDays, 1)

  const hardSuccess = review({ easeFactor: SM2_MIN_EASE, intervalDays: 1, repetitions: 0 }, 3)
  assert.equal(hardSuccess.easeFactor, SM2_MIN_EASE)
  assert.equal(hardSuccess.repetitions, 1)
  assert.equal(hardSuccess.intervalDays, 1)
})

test('один и тот же вход даёт один и тот же срок', () => {
  const state = createInitialSm2State(NOW)
  const left = applySm2Review(state, 5, NOW)
  const right = applySm2Review(state, 5, NOW)
  assert.deepEqual(left, right)
  assert.equal(state.repetitions, 0)
  assert.equal(state.dueAt.toISOString(), NOW.toISOString())
})
