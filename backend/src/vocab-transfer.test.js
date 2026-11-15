import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LEARNING_SITUATION,
  RETENTION_SITUATION,
  TRANSFER_SITUATIONS,
  baselineValid,
  canConfirmTransfer,
  clientSuppliedTransfer,
  isNovel,
  planTransferSituation,
  situationsDiffer,
} from './vocab-transfer.js'
import { readRetentionAnchor, readSenseSpeech } from './vocab-speech-progress.js'
import { practiceTargetFields } from './vocab-retention.js'
import {
  applyJudgeVerdicts,
  applyOpportunityVerdicts,
  buildAssessmentItems,
  classifyDialogueTargets,
} from './vocab-dialogue-assessment.js'
import { chooseNextAction, introRunAfterAccept } from './vocab-next-action.js'
import { buildTransferPracticeInstruction, createDialogueSessionHandler } from './vocab-dialogue-routes.js'

const SENSE = '11111111-1111-4111-8111-111111111111'
const BASELINE = [
  { source: 'learning', situation: LEARNING_SITUATION },
  { source: 'retention', situation: RETENTION_SITUATION },
]
const SITUATION = TRANSFER_SITUATIONS[0]
const QUOTE = 'Could you clarify the deadline?'
const NOW = new Date('2026-11-12T12:00:00.000Z')

function target(patch = {}) {
  return {
    sense_id: SENSE,
    headword: 'clarify',
    gloss_ru: 'уточнить',
    is_transfer: true,
    ...patch,
  }
}

function confirm(patch = {}) {
  return canConfirmTransfer({
    retentionConfirmed: true,
    situation: SITUATION,
    baseline: BASELINE,
    verdict: 'produced',
    quality: 5,
    evidence: QUOTE,
    userTurn: QUOTE,
    headword: 'clarify',
    ...patch,
  })
}

function produced(patch = {}) {
  return {
    sense_id: SENSE,
    source: 'dialogue',
    card_type: 'production',
    verdict: 'produced',
    dialogue_session_id: 'session-a',
    evidence_text: 'we should negotiate',
    due_before: '2026-10-28T10:00:00.000Z',
    due_after: '2026-10-29T10:00:00.000Z',
    created_at: '2026-10-28T10:00:00.000Z',
    ...patch,
  }
}

test('самостоятельное produced в новой ситуации можно подтвердить', () => {
  const row = classifyDialogueTargets({
    targets: [target()],
    turns: [
      { turn_index: 0, role: 'assistant', content: 'The date in the letter is hard to read.' },
      { turn_index: 1, role: 'user', content: QUOTE },
    ],
    hints: [],
  })[0]
  assert.equal(row.verdict, 'produced')
  assert.equal(row.evidence_text.includes('clarify'), true)
  assert.equal(confirm({ evidence: row.evidence_text, userTurn: QUOTE }), true)
  assert.equal(isNovel(SITUATION, BASELINE), true)
})

test('без подтверждённого удержания перенос не подтверждается', () => {
  assert.equal(confirm({ retentionConfirmed: false }), false)
  assert.equal(baselineValid([BASELINE[0]]), false)
  assert.equal(planTransferSituation([BASELINE[0]]).error, 'not_ready')
})

test('смена имён при той же ситуации не делает её новой', () => {
  const renamed = {
    ...LEARNING_SITUATION,
    roles: [...LEARNING_SITUATION.roles],
  }
  assert.equal(situationsDiffer(renamed, LEARNING_SITUATION), false)
  assert.equal(isNovel(renamed, BASELINE), false)
  assert.equal(confirm({ situation: renamed }), false)
})

test('то же коммуникативное намерение не считается переносом', () => {
  const restaged = {
    ...LEARNING_SITUATION,
    location: 'street',
    channel: 'phone',
  }
  assert.equal(situationsDiffer(restaged, LEARNING_SITUATION), false)
  assert.equal(isNovel(restaged, BASELINE), false)
  assert.equal(confirm({ situation: restaged }), false)
})

test('wrong_sense не подтверждает перенос', () => {
  const judged = applyJudgeVerdicts(
    classifyDialogueTargets({
      targets: [target()],
      turns: [{ turn_index: 0, role: 'user', content: QUOTE }],
      hints: [],
    }),
    [{ sense_id: SENSE, verdict: 'wrong_sense' }],
  )
  assert.equal(judged[0].verdict, 'wrong_sense')
  assert.equal(confirm({ verdict: 'wrong_sense', quality: 1, evidence: judged[0].evidence_text }), false)
})

test('hinted не подтверждает перенос', () => {
  const row = classifyDialogueTargets({
    targets: [target()],
    turns: [{ turn_index: 1, role: 'user', content: QUOTE }],
    hints: [{ turn_index: 1, hint_text: 'Try to clarify it.' }],
  })[0]
  assert.equal(row.verdict, 'hinted')
  assert.equal(confirm({ verdict: 'hinted', quality: 0 }), false)
})

test('mentioned не подтверждает перенос', () => {
  const row = classifyDialogueTargets({
    targets: [target({ headword: 'in' })],
    turns: [{ turn_index: 0, role: 'user', content: 'I am inside. I am in the shop.' }],
    hints: [],
  })[0]
  assert.equal(row.verdict, 'mentioned')
  assert.equal(row.evidence_text, null)
  assert.equal(confirm({ verdict: 'mentioned', quality: 0, evidence: '', headword: 'in' }), false)
})

test('unused не подтверждает перенос', () => {
  const row = applyOpportunityVerdicts(
    classifyDialogueTargets({
      targets: [target()],
      turns: [{ turn_index: 0, role: 'user', content: 'The letter is hard to read.' }],
      hints: [],
    }),
    [{ sense_id: SENSE, opportunity: true }],
  )[0]
  assert.equal(row.verdict, 'unused')
  assert.equal(confirm({ verdict: 'unused', quality: 0, evidence: '' }), false)
})

test('echoed не подтверждает перенос', () => {
  const row = classifyDialogueTargets({
    targets: [target()],
    turns: [
      { turn_index: 0, role: 'assistant', content: 'Please clarify the date.' },
      { turn_index: 1, role: 'user', content: QUOTE },
    ],
    hints: [],
  })[0]
  assert.equal(row.verdict, 'echoed')
  assert.equal(confirm({
    verdict: 'echoed',
    quality: 0,
    assistantBefore: ['Please clarify the date.'],
  }), false)
})

test('no_opportunity не подтверждает перенос', () => {
  const row = applyOpportunityVerdicts(
    classifyDialogueTargets({
      targets: [target()],
      turns: [{ turn_index: 0, role: 'assistant', content: 'Hello.' }],
      hints: [],
    }),
    [],
  )[0]
  assert.equal(row.verdict, 'no_opportunity')
  assert.equal(confirm({ verdict: 'no_opportunity', quality: 0, evidence: '', userTurn: '' }), false)
})

test('без реплики пользователя перенос не производится', () => {
  const row = classifyDialogueTargets({
    targets: [target()],
    turns: [{ turn_index: 0, role: 'assistant', content: 'The date is unclear.' }],
    hints: [],
  })[0]
  assert.equal(row.verdict, 'unused')
  assert.equal(confirm({ evidence: QUOTE, userTurn: '' }), false)
})

test('пустая или чужая цитата не доказывает produced', () => {
  assert.equal(confirm({ evidence: '   ' }), false)
  assert.equal(confirm({ evidence: 'Could you clarify the deadline?', userTurn: 'Something else.' }), false)
})

test('слово, сказанное AI раньше пользователя, не подтверждает перенос', () => {
  assert.equal(confirm({ assistantBefore: ['Please clarify this.'] }), false)
  assert.equal(confirm({ hintsBefore: ['clarify'] }), false)
})

test('клиент не может сам установить transfer_confirmed', async () => {
  assert.equal(clientSuppliedTransfer({ transfer_confirmed: true }), true)
  assert.equal(clientSuppliedTransfer({ novelty_ok: true }), true)
  const items = buildAssessmentItems({
    classified: [{
      sense_id: SENSE,
      verdict: 'produced',
      evidence_text: QUOTE,
      transfer_confirmed: true,
      needsSense: false,
    }],
    states: new Map([[SENSE, {
      card_type: 'production',
      ease_factor: 2.5,
      interval_days: 6,
      repetitions: 2,
      lapses: 0,
      due_at: '2026-11-20T00:00:00.000Z',
    }]]),
    now: NOW,
    movesBySense: new Map([[SENSE, false]]),
  })
  assert.equal(Object.hasOwn(items[0], 'transfer_confirmed'), false)
  const handler = createDialogueSessionHandler({
    supabase: { from() { throw new Error('database must not be called') }, rpc() { throw new Error('database must not be called') } },
    resolveUserId: async () => 'user-1',
    getBearerToken: () => 'token',
  })
  const res = {
    statusCode: 0,
    body: null,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
  await handler({
    body: {
      mode: 'transfer',
      transfer_confirmed: true,
      agent_session_id: '22222222-2222-4222-8222-222222222222',
      request_id: 'transfer-client',
      level_snapshot: 'B1',
      sense_ids: [SENSE],
    },
  }, res)
  assert.equal(res.statusCode, 400)
  assert.equal(res.body.error, 'The transfer check is chosen by the server')
})

test('transfer не двигает SM-2 и не сдвигает якорь T', () => {
  const fields = practiceTargetFields({ mode: 'transfer', transferBaseline: BASELINE })
  assert.equal(fields.moves_schedule, false)
  assert.equal(fields.retention_days, null)
  assert.equal(fields.is_transfer, true)
  const state = {
    card_type: 'production',
    ease_factor: 2.5,
    interval_days: 6,
    repetitions: 2,
    lapses: 1,
    due_at: '2026-11-20T00:00:00.000Z',
  }
  const items = buildAssessmentItems({
    classified: [{ sense_id: SENSE, verdict: 'produced', evidence_text: QUOTE }],
    states: new Map([[SENSE, state]]),
    now: NOW,
    movesBySense: new Map([[SENSE, false]]),
  })
  assert.equal(items[0].quality, 5)
  assert.equal(items[0].next_ease, state.ease_factor)
  assert.equal(items[0].next_interval_days, state.interval_days)
  assert.equal(items[0].next_repetitions, state.repetitions)
  assert.equal(items[0].next_due_at, state.due_at)
  const first = produced()
  const second = produced({
    dialogue_session_id: 'session-b',
    created_at: '2026-11-02T10:00:00.000Z',
    due_before: '2026-11-02T10:00:00.000Z',
    due_after: '2026-11-08T10:00:00.000Z',
  })
  const anchor = readRetentionAnchor([first, second])
  const transferEvent = produced({
    dialogue_session_id: 'session-c',
    is_transfer: true,
    created_at: '2026-11-01T10:00:00.000Z',
    due_before: '2026-11-01T10:00:00.000Z',
    due_after: '2026-11-01T10:00:00.000Z',
    evidence_text: QUOTE,
  })
  assert.equal(readRetentionAnchor([first, transferEvent]), null)
  assert.equal(readRetentionAnchor([first, transferEvent, second]).anchored_at, anchor.anchored_at)
  assert.deepEqual(readSenseSpeech([first, second, transferEvent]), readSenseSpeech([first, second]))
})

test('очередь скрывает слово и не считает перенос вводным занятием', () => {
  const result = chooseNextAction({
    senses: [{ senseId: SENSE, headword: 'clarify', gloss: 'уточнить', events: [] }],
    lists: [],
    now: NOW,
    transferSenseIds: [SENSE],
  })
  assert.equal(result.action, 'transfer')
  assert.equal(result.senses[0].headword, '')
  assert.equal(result.senses[0].gloss_ru, '')
  assert.equal(result.intro_run_after, 0)
  assert.equal(introRunAfterAccept('transfer', 2), 0)
  const instruction = buildTransferPracticeInstruction(
    [{ headword: 'clarify', gloss_ru: 'уточнить' }],
    SITUATION,
  )
  assert.equal(instruction.includes('school'), true)
  assert.equal(instruction.includes('to clarify'), true)
  assert.equal(instruction.includes('Never say the target headword'), true)
})
