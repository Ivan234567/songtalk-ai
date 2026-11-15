import test from 'node:test'
import assert from 'node:assert/strict'
import { readRetentionAnchor, readSenseSpeech, summarizeSenseSpeech } from './vocab-speech-progress.js'

const SENSE = 'sense-negotiate'
const SESSION_A = 'session-a'
const SESSION_B = 'session-b'

function produced(patch = {}) {
  return {
    sense_id: SENSE,
    source: 'dialogue',
    card_type: 'production',
    verdict: 'produced',
    dialogue_session_id: SESSION_A,
    evidence_text: 'we should negotiate',
    due_before: '2026-10-28T10:00:00.000Z',
    due_after: '2026-10-29T10:00:00.000Z',
    created_at: '2026-10-28T10:00:00.000Z',
    ...patch,
  }
}

function recognition(verdict = 'easy') {
  return {
    sense_id: 'sense-other',
    source: 'daily_review',
    card_type: 'recognition',
    verdict,
    dialogue_session_id: null,
    evidence_text: null,
    created_at: '2026-10-20T10:00:00.000Z',
  }
}

test('один produced с цитатой — Сказал сам', () => {
  const row = readSenseSpeech([produced()])
  assert.equal(row.speech, 'said')
  assert.equal(row.recognizes, false)
})

test('два produced в разных сессиях с правом двигать срок — Повторно использовал', () => {
  const row = readSenseSpeech([
    produced(),
    produced({
      dialogue_session_id: SESSION_B,
      created_at: '2026-10-29T10:00:00.000Z',
      due_before: '2026-10-29T10:00:00.000Z',
      due_after: '2026-11-04T10:00:00.000Z',
      evidence_text: 'I can negotiate the date',
    }),
  ])
  assert.equal(row.speech, 'repeated')
})

test('два produced в одной сессии не становятся повторным использованием', () => {
  const row = readSenseSpeech([
    produced({ created_at: '2026-10-28T10:00:00.000Z' }),
    produced({
      created_at: '2026-10-28T10:05:00.000Z',
      evidence_text: 'negotiate again',
      due_before: '2026-10-28T10:05:00.000Z',
      due_after: '2026-10-29T10:05:00.000Z',
    }),
  ])
  assert.equal(row.speech, 'said')
})

test('только узнавание easy — Узнаёт и не Сказал сам', () => {
  const row = readSenseSpeech([recognition('easy')])
  assert.equal(row.speech, 'none')
  assert.equal(row.recognizes, true)
})

test('узнавание и один produced остаются двумя независимыми чтениями', () => {
  const row = readSenseSpeech([
    recognition('good'),
    produced({ sense_id: 'sense-other' }),
  ])
  assert.equal(row.speech, 'said')
  assert.equal(row.recognizes, true)
})

test('produced без цитаты не доказательство речи', () => {
  const row = readSenseSpeech([
    produced({ evidence_text: '   ' }),
    produced({ evidence_text: null, dialogue_session_id: SESSION_B }),
  ])
  assert.equal(row.speech, 'none')
})

test('ранний produced не даёт повторного использования', () => {
  const moves = new Map([[`${SESSION_B}:${SENSE}`, false]])
  const row = readSenseSpeech([
    produced(),
    produced({
      dialogue_session_id: SESSION_B,
      created_at: '2026-10-29T10:00:00.000Z',
      due_before: '2026-11-03T10:00:00.000Z',
      due_after: '2026-11-03T10:00:00.000Z',
      evidence_text: 'negotiate early',
    }),
  ], moves)
  assert.equal(row.speech, 'said')
})

test('ранний produced с цитатой остаётся Сказал сам', () => {
  const moves = new Map([[`${SESSION_A}:${SENSE}`, false]])
  const row = readSenseSpeech([
    produced({
      due_before: '2026-10-28T10:00:00.000Z',
      due_after: '2026-10-28T10:00:00.000Z',
    }),
  ], moves)
  assert.equal(row.speech, 'said')
})

test('нет истории — речевой прогресс не возникает из статуса карточки', () => {
  const row = readSenseSpeech([], new Map())
  assert.deepEqual(row, { speech: 'none', recognizes: false })
  const summary = summarizeSenseSpeech(['sense-mastered'], new Map())
  assert.equal(summary.speech, 'none')
  assert.equal(summary.recognizes, false)
})

test('самооценка снова и трудно не называется Узнаёт', () => {
  assert.equal(readSenseSpeech([recognition('again')]).recognizes, false)
  assert.equal(readSenseSpeech([recognition('hard')]).recognizes, false)
})

const LATER = '2026-11-02T15:30:00.000Z'
const EARLIER = '2026-11-01T15:30:00.000Z'

function laterProduced(patch = {}) {
  return produced({
    dialogue_session_id: SESSION_B,
    created_at: LATER,
    due_before: LATER,
    due_after: '2026-11-08T15:30:00.000Z',
    evidence_text: 'I can negotiate the date',
    ...patch,
  })
}

test('одно подходящее produced не создаёт якорь', () => {
  assert.equal(readRetentionAnchor([produced()]), null)
})

test('два подходящих produced в одной сессии не создают якорь', () => {
  assert.equal(readRetentionAnchor([
    produced({ created_at: EARLIER }),
    produced({
      created_at: LATER,
      due_before: LATER,
      due_after: '2026-11-08T15:30:00.000Z',
      evidence_text: 'negotiate again',
    }),
  ]), null)
})

test('два подходящих produced в разных сессиях создают якорь', () => {
  const row = readRetentionAnchor([produced({ created_at: EARLIER }), laterProduced()])
  assert.equal(row.anchored_at, LATER)
})

test('более раннее событие не становится временем якоря', () => {
  const row = readRetentionAnchor([
    laterProduced(),
    produced({ created_at: EARLIER, dialogue_session_id: SESSION_A }),
  ])
  assert.equal(row.anchored_at, LATER)
  assert.notEqual(row.anchored_at, EARLIER)
})

test('второе produced без цитаты не создаёт якорь', () => {
  assert.equal(readRetentionAnchor([
    produced({ created_at: EARLIER }),
    laterProduced({ evidence_text: '   ' }),
  ]), null)
})

test('ранняя практика на втором produced не создаёт якорь', () => {
  const moves = new Map([[`${SESSION_B}:${SENSE}`, false]])
  assert.equal(readRetentionAnchor([
    produced({ created_at: EARLIER }),
    laterProduced({
      due_before: '2026-11-20T15:30:00.000Z',
      due_after: '2026-11-20T15:30:00.000Z',
    }),
  ], moves), null)
})

test('второе produced без права двигать срок не создаёт якорь', () => {
  assert.equal(readRetentionAnchor([
    produced({ created_at: EARLIER }),
    laterProduced({
      due_before: LATER,
      due_after: LATER,
    }),
  ]), null)
})

test('только recognition-события не создают якорь', () => {
  assert.equal(readRetentionAnchor([
    recognition('good'),
    recognition('easy'),
  ]), null)
})

test('один смысл в нескольких списках даёт один якорь', () => {
  const first = produced({ created_at: EARLIER })
  const second = laterProduced()
  const once = readRetentionAnchor([first, second])
  const joinedFromTwoLists = readRetentionAnchor([first, first, second, second])
  assert.deepEqual(once, joinedFromTwoLists)
  assert.equal(once.anchored_at, LATER)
})

test('повторное чтение не меняет время якоря', () => {
  const events = [produced({ created_at: EARLIER }), laterProduced()]
  const first = readRetentionAnchor(events)
  const second = readRetentionAnchor(events)
  const withLaterUse = readRetentionAnchor([
    ...events,
    laterProduced({
      dialogue_session_id: 'session-c',
      created_at: '2026-11-20T15:30:00.000Z',
      due_before: '2026-11-20T15:30:00.000Z',
      due_after: '2026-11-26T15:30:00.000Z',
      evidence_text: 'we negotiated again',
    }),
  ])
  assert.deepEqual(first, second)
  assert.equal(withLaterUse.anchored_at, first.anchored_at)
})

test('даты T+7 и T+30 отстоят на точные сутки по 24 часа', () => {
  const row = readRetentionAnchor([produced({ created_at: EARLIER }), laterProduced()])
  assert.equal(row.anchored_at, '2026-11-02T15:30:00.000Z')
  assert.equal(row.check_7_at, '2026-11-09T15:30:00.000Z')
  assert.equal(row.check_30_at, '2026-12-02T15:30:00.000Z')
  assert.equal(Date.parse(row.check_7_at) - Date.parse(row.anchored_at), 7 * 24 * 60 * 60 * 1000)
  assert.equal(Date.parse(row.check_30_at) - Date.parse(row.anchored_at), 30 * 24 * 60 * 60 * 1000)
})

test('диагностическое produced не становится якорем и не заменяет обычное употребление', () => {
  assert.equal(readRetentionAnchor([
    produced({ created_at: EARLIER, retention_days: 7 }),
    laterProduced({ retention_days: 30 }),
  ]), null)
  assert.equal(readRetentionAnchor([
    produced({ created_at: EARLIER }),
    laterProduced({ retention_days: 7 }),
  ]), null)
  const row = readRetentionAnchor([
    produced({ created_at: EARLIER }),
    laterProduced({ retention_days: 7 }),
    laterProduced({
      dialogue_session_id: 'session-c',
      created_at: '2026-11-20T15:30:00.000Z',
      due_before: '2026-11-20T15:30:00.000Z',
      due_after: '2026-11-26T15:30:00.000Z',
      evidence_text: 'we negotiated again',
    }),
  ])
  assert.equal(row.anchored_at, '2026-11-20T15:30:00.000Z')
})

test('расчёт плановых дат не меняет SM-2', () => {
  const state = {
    due_at: '2026-11-03T15:30:00.000Z',
    interval_days: 6,
    ease_factor: 2.5,
    repetitions: 2,
  }
  const events = [produced({ created_at: EARLIER }), laterProduced()]
  const beforeState = JSON.stringify(state)
  const beforeEvents = JSON.stringify(events)
  readRetentionAnchor(events)
  assert.equal(JSON.stringify(state), beforeState)
  assert.equal(JSON.stringify(events), beforeEvents)
})
