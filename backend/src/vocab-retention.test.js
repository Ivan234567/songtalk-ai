import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyDialogueTargets } from './vocab-dialogue-assessment.js'
import { readRetentionAnchor, readSenseSpeech } from './vocab-speech-progress.js'
import { chooseNextAction, introRunAfterAccept } from './vocab-next-action.js'
import {
  longestWaitingDue,
  openRetentionTargets,
  planRetentionSession,
  practiceTargetFields,
  readSenseRetention,
  retentionIntervalDays,
} from './vocab-retention.js'

const SENSE = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const T = '2026-11-02T15:30:00.000Z'
const PLUS_6 = '2026-11-08T15:30:00.000Z'
const PLUS_7 = '2026-11-09T15:30:00.000Z'
const PLUS_8 = '2026-11-10T15:30:00.000Z'
const PLUS_25 = '2026-11-27T15:30:00.000Z'
const PLUS_29 = '2026-12-01T15:30:00.000Z'
const PLUS_30 = '2026-12-02T15:30:00.000Z'
const PLUS_34 = '2026-12-06T15:30:00.000Z'

function anchorEvents() {
  return [
    {
      sense_id: SENSE,
      source: 'dialogue',
      card_type: 'production',
      verdict: 'produced',
      dialogue_session_id: 'session-a',
      evidence_text: 'we should negotiate',
      due_before: '2026-10-20T10:00:00.000Z',
      due_after: '2026-10-21T10:00:00.000Z',
      created_at: '2026-10-20T10:00:00.000Z',
    },
    {
      sense_id: SENSE,
      source: 'dialogue',
      card_type: 'production',
      verdict: 'produced',
      dialogue_session_id: 'session-b',
      evidence_text: 'let us negotiate',
      due_before: '2026-11-01T15:30:00.000Z',
      due_after: '2026-11-07T15:30:00.000Z',
      created_at: T,
    },
  ]
}

function diagnosis(patch = {}) {
  return {
    sense_id: SENSE,
    source: 'dialogue',
    card_type: 'production',
    verdict: 'produced',
    dialogue_session_id: 'session-check',
    evidence_text: 'we can negotiate',
    retention_days: 7,
    due_before: '2026-11-07T15:30:00.000Z',
    due_after: '2026-11-07T15:30:00.000Z',
    created_at: PLUS_8,
    ...patch,
  }
}

function windowOf(plan, days) {
  return plan.windows.find((row) => row.days === days)
}

test('диагностика недоступна до T+7', () => {
  const plan = readSenseRetention(anchorEvents(), new Map(), new Date(PLUS_6))
  assert.equal(windowOf(plan, 7).state, 'waiting')
  assert.equal(plan.next, null)
  assert.equal(openRetentionTargets([{ senseId: SENSE, events: anchorEvents() }], new Date(PLUS_6)).length, 0)
})

test('диагностика доступна после T+7', () => {
  const plan = readSenseRetention(anchorEvents(), new Map(), new Date(PLUS_7))
  assert.equal(windowOf(plan, 7).state, 'available')
  assert.equal(windowOf(plan, 30).state, 'waiting')
  assert.equal(plan.next.days, 7)
})

test('окно T+30 недоступно до своей даты', () => {
  const plan = readSenseRetention(anchorEvents(), new Map(), new Date(PLUS_29))
  assert.equal(windowOf(plan, 30).state, 'waiting')
  assert.equal(plan.next.days, 7)
})

test('при двух открытых окнах сначала выбирается T+7', () => {
  const events = anchorEvents()
  const chosen = openRetentionTargets([
    { senseId: SENSE, events },
    { senseId: OTHER, events: events.map((row) => ({ ...row, sense_id: OTHER, created_at: row.created_at === T ? '2026-10-01T15:30:00.000Z' : row.created_at })) },
  ], new Date(PLUS_34))
  assert.ok(chosen.every((row) => row.days === 7))
  assert.equal(chosen[0].senseId, OTHER)
})

test('подтверждённое T+7 больше не предлагается', () => {
  const plan = readSenseRetention(
    [...anchorEvents(), diagnosis({ created_at: PLUS_8 })],
    new Map(),
    new Date(PLUS_25),
  )
  assert.equal(windowOf(plan, 7).state, 'confirmed')
  assert.equal(plan.next, null)
  assert.equal(openRetentionTargets([{ senseId: SENSE, events: [...anchorEvents(), diagnosis()] }], new Date(PLUS_25)).length, 0)
})

test('после наступления T+30 предлагается только незакрытое окно', () => {
  const events = [...anchorEvents(), diagnosis({ created_at: PLUS_8 })]
  const plan = readSenseRetention(events, new Map(), new Date(PLUS_30))
  assert.equal(plan.next.days, 30)
  const chosen = openRetentionTargets([{ senseId: SENSE, events }], new Date(PLUS_30))
  assert.deepEqual(chosen.map((row) => row.days), [30])
})

test('успех при двух открытых окнах подтверждает оба одной записью', () => {
  const events = [...anchorEvents(), diagnosis({ retention_days: 7, created_at: PLUS_34 })]
  const plan = readSenseRetention(events, new Map(), new Date(PLUS_34))
  assert.equal(windowOf(plan, 7).state, 'confirmed')
  assert.equal(windowOf(plan, 30).state, 'confirmed')
  assert.equal(events.filter((row) => row.retention_days != null).length, 1)
  assert.equal(windowOf(plan, 7).checked_at, PLUS_34)
  assert.equal(windowOf(plan, 30).checked_at, PLUS_34)
})

test('produced с цитатой подтверждает удержание', () => {
  const plan = readSenseRetention([...anchorEvents(), diagnosis()], new Map(), new Date(PLUS_8))
  assert.equal(windowOf(plan, 7).state, 'confirmed')
  assert.equal(windowOf(plan, 7).interval_days, 8)
})

test('produced без цитаты не подтверждает удержание', () => {
  const plan = readSenseRetention(
    [...anchorEvents(), diagnosis({ evidence_text: '   ' })],
    new Map(),
    new Date(PLUS_8),
  )
  assert.equal(windowOf(plan, 7).state, 'unconfirmed')
})

for (const verdict of ['wrong_sense', 'unused', 'hinted', 'echoed', 'mentioned']) {
  test(`${verdict} не подтверждает удержание`, () => {
    const plan = readSenseRetention(
      [...anchorEvents(), diagnosis({ verdict, evidence_text: verdict === 'unused' ? null : 'negotiate' })],
      new Map(),
      new Date(PLUS_8),
    )
    assert.equal(windowOf(plan, 7).state, 'unconfirmed')
    assert.equal(windowOf(plan, 7).interval_days, null)
  })
}

test('no_opportunity не подтверждает и не закрывает окно', () => {
  const plan = readSenseRetention(
    [...anchorEvents(), diagnosis({ verdict: 'no_opportunity', evidence_text: null })],
    new Map(),
    new Date(PLUS_8),
  )
  assert.equal(windowOf(plan, 7).state, 'unconfirmed')
  assert.equal(plan.next.days, 7)
})

test('слово пользователя засчитывается, даже если AI сказал его первым', () => {
  const rows = classifyDialogueTargets({
    targets: [{ sense_id: SENSE, headword: 'negotiate', gloss_ru: 'договариваться', retention_days: 7 }],
    turns: [
      { turn_index: 0, role: 'assistant', content: 'Shall we negotiate the price?' },
      { turn_index: 1, role: 'user', content: 'Yes, we can negotiate.' },
    ],
    hints: [],
  })
  assert.equal(rows[0].verdict, 'produced')
  assert.equal(rows[0].needsSense, true)
})

test('перевод в реплике AI до ответа не отменяет слово пользователя', () => {
  const rows = classifyDialogueTargets({
    targets: [{ sense_id: SENSE, headword: 'negotiate', gloss_ru: 'договариваться', retention_days: 7 }],
    turns: [
      { turn_index: 0, role: 'assistant', content: 'Попробуй сказать договариваться.' },
      { turn_index: 1, role: 'user', content: 'We should negotiate.' },
    ],
    hints: [],
  })
  assert.equal(rows[0].verdict, 'produced')
  assert.equal(rows[0].needsSense, true)
})

test('ошибка T+30 не отменяет подтверждение T+7', () => {
  const events = [
    ...anchorEvents(),
    diagnosis({ created_at: PLUS_8 }),
    diagnosis({
      verdict: 'wrong_sense',
      retention_days: 30,
      dialogue_session_id: 'session-later',
      evidence_text: 'negotiate',
      created_at: PLUS_34,
    }),
  ]
  const plan = readSenseRetention(events, new Map(), new Date(PLUS_34))
  assert.equal(windowOf(plan, 7).state, 'confirmed')
  assert.equal(windowOf(plan, 30).state, 'unconfirmed')
})

test('поздняя проверка показывает фактический интервал', () => {
  assert.equal(retentionIntervalDays(T, PLUS_8), 8)
  assert.equal(retentionIntervalDays(T, PLUS_25), 25)
  assert.equal(retentionIntervalDays(T, PLUS_34), 34)
  const plan = readSenseRetention(
    [...anchorEvents(), diagnosis({ created_at: PLUS_25, retention_days: 7 })],
    new Map(),
    new Date(PLUS_25),
  )
  assert.equal(windowOf(plan, 7).interval_days, 25)
  assert.notEqual(windowOf(plan, 7).interval_days, 7)
})

test('пропуск занятия не меняет состояние окна', () => {
  const before = readSenseRetention(anchorEvents(), new Map(), new Date(PLUS_8))
  const after = readSenseRetention(anchorEvents(), new Map(), new Date(PLUS_8))
  assert.equal(before.windows[0].state, 'available')
  assert.deepEqual(after.windows, before.windows)
})

test('чужой смысл нельзя включить в диагностику', () => {
  const planned = planRetentionSession(
    [SENSE, OTHER],
    [{ senseId: SENSE, events: anchorEvents() }],
    new Date(PLUS_8),
  )
  assert.equal(planned.error, 'not_found')
})

test('обычная цель не получает окно удержания', () => {
  assert.throws(
    () => practiceTargetFields({ mode: 'chat', retentionDays: 7, early: false }),
    /Ordinary practice/,
  )
  assert.deepEqual(practiceTargetFields({ mode: 'roleplay', retentionDays: null, early: true }), {
    retention_days: null,
    moves_schedule: false,
  })
})

test('диагностическая цель всегда без движения SM-2 и с окном', () => {
  assert.deepEqual(practiceTargetFields({ mode: 'retention', retentionDays: 30 }), {
    retention_days: 30,
    moves_schedule: false,
  })
  assert.throws(() => practiceTargetFields({ mode: 'retention', retentionDays: null }))
})

test('диагностическое produced не создаёт якорь и не двигает обычную речь', () => {
  const events = [...anchorEvents(), diagnosis({ created_at: PLUS_34 })]
  assert.equal(readRetentionAnchor(events, new Map()).anchored_at, T)
  assert.deepEqual(readSenseSpeech(events), readSenseSpeech(anchorEvents()))
})

test('смысл без якоря не попадает в диагностику', () => {
  const planned = planRetentionSession(
    [SENSE],
    [{ senseId: SENSE, events: [anchorEvents()[0]] }],
    new Date(PLUS_34),
  )
  assert.equal(planned.error, 'not_open')
})

test('после двух вводных дольше всего ждёт диагностика, а не узнавание', () => {
  const senses = [
    {
      senseId: SENSE,
      headword: 'negotiate',
      gloss: 'договариваться',
      createdAt: '2026-10-01T00:00:00.000Z',
      listIds: ['list-1'],
      production: { dueAt: '2026-12-01T00:00:00.000Z', lastReviewedAt: '2026-11-01T00:00:00.000Z' },
      recognition: null,
      events: anchorEvents(),
    },
    {
      senseId: OTHER,
      headword: 'fresh',
      gloss: 'новый',
      createdAt: '2026-11-01T00:00:00.000Z',
      listIds: ['list-1'],
      production: null,
      recognition: { dueAt: PLUS_8, lastReviewedAt: '2026-11-01T00:00:00.000Z' },
      events: [{
        sense_id: OTHER,
        source: 'daily_review',
        card_type: 'recognition',
        verdict: 'easy',
        created_at: '2026-11-01T00:00:00.000Z',
      }],
    },
  ]
  const lists = [{ id: 'list-1', title: 'Список' }]
  const action = chooseNextAction({ senses, lists, introRun: 2, now: new Date(PLUS_25) })
  assert.equal(action.action, 'retention')
  assert.equal(action.senses[0].sense_id, SENSE)
  assert.equal(action.senses[0].headword, '')
  assert.equal(introRunAfterAccept(action.action, 2), 0)
  assert.equal(longestWaitingDue(
    [{ dueAt: PLUS_7 }],
    [{ dueAt: PLUS_8 }],
  ), 'retention')
})
