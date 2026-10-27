import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  applyJudgeVerdicts,
  buildAssessmentItems,
  buildPracticeProgressItems,
  classifyDialogueTargets,
  createDialogueAssessmentHandler,
  evidenceQuote,
  latestUserText,
  remainingPracticeTargets,
} from './vocab-dialogue-assessment.js'
import { DialogueRouteError } from './vocab-dialogue-routes.js'

const USER_ID = 'user-real'
const DIALOGUE_ID = '44444444-4444-4444-8444-444444444444'
const SENSE_A = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-06-01T12:00:00.000Z')

function quoteOf(text) {
  const quote = evidenceQuote(text, 'apple')
  assert.equal(text.includes(quote), true)
  assert.match(quote, /apple/i)
  return quote
}

test('цитата берётся из реплики пользователя и содержит слово', () => {
  const text = 'Hello. I ate an apple today!'
  const quote = quoteOf(text)
  assert.match(quote, /apple/)
  assert.equal(latestUserText([{ role: 'assistant', content: 'Hi' }, { role: 'user', content: '  I ate an apple  ' }]), 'I ate an apple')
  const inflected = evidenceQuote('I was running yesterday.', 'run')
  assert.match(inflected, /running/i)
  const reverse = evidenceQuote('I run every day.', 'running')
  assert.match(reverse, /\brun\b/i)
})

test('live-прогресс отмечает produced как used и оставляет unused в anti-spoil', () => {
  const targets = [
    { sense_id: SENSE_A, headword: 'apple', gloss_ru: 'яблоко' },
    { sense_id: '33333333-3333-4333-8333-333333333333', headword: 'run', gloss_ru: 'бежать' },
  ]
  const classified = classifyDialogueTargets({
    targets,
    turns: [
      { turn_index: 0, role: 'user', content: 'I ate an apple' },
      { turn_index: 0, role: 'assistant', content: 'Nice' },
    ],
    hints: [],
  })
  const items = buildPracticeProgressItems(targets, classified)
  assert.equal(items[0].status, 'used')
  assert.equal(items[1].status, 'waiting')
  const remaining = remainingPracticeTargets(targets, items)
  assert.equal(remaining.length, 1)
  assert.equal(remaining[0].headword, 'run')
})

test('эхо, подсказка, молчание и самостоятельное слово различаются по серверным репликам', () => {
  const targets = [{ sense_id: SENSE_A, headword: 'apple', gloss_ru: 'яблоко' }]
  assert.equal(classifyDialogueTargets({ targets, turns: [], hints: [] })[0].verdict, 'unused')
  const echoed = classifyDialogueTargets({
    targets,
    turns: [
      { turn_index: 0, role: 'user', content: 'hello' },
      { turn_index: 0, role: 'assistant', content: 'Have an apple' },
      { turn_index: 1, role: 'user', content: 'I want an apple' },
      { turn_index: 1, role: 'assistant', content: 'Nice' },
    ],
    hints: [],
  })[0]
  assert.equal(echoed.verdict, 'echoed')
  const hinted = classifyDialogueTargets({
    targets,
    turns: [
      { turn_index: 0, role: 'user', content: 'I want an apple' },
      { turn_index: 0, role: 'assistant', content: 'Go on' },
    ],
    hints: [{ turn_index: 0, hint_text: 'Речь про apple' }],
  })[0]
  assert.equal(hinted.verdict, 'hinted')
  const own = classifyDialogueTargets({
    targets,
    turns: [
      { turn_index: 0, role: 'user', content: 'I ate an apple' },
      { turn_index: 0, role: 'assistant', content: 'apple is tasty' },
    ],
    hints: [],
  })[0]
  assert.equal(own.needsSense, true)
  assert.equal(own.verdict, 'produced')
  assert.equal(own.evidence_text.includes('apple'), true)
})

test('ошибка судьи не становится самостоятельным употреблением, немое слово не двигает срок', () => {
  assert.throws(
    () => applyJudgeVerdicts([{ sense_id: SENSE_A, verdict: 'produced', evidence_text: 'apple', needsSense: true }], []),
    (err) => err instanceof DialogueRouteError && err.status === 502,
  )
  const items = buildAssessmentItems({
    classified: [{ sense_id: SENSE_A, verdict: 'unused', evidence_text: null, needsSense: false }],
    states: new Map([[SENSE_A, {
      card_type: 'production',
      ease_factor: 2.5,
      interval_days: 0,
      repetitions: 0,
      lapses: 0,
      due_at: '2026-06-01T00:00:00+00:00',
    }]]),
    now: NOW,
  })
  assert.equal(items[0].quality, 0)
  assert.equal(items[0].next_interval_days, 0)
  assert.equal(items[0].next_due_at, '2026-06-01T00:00:00+00:00')
  const produced = buildAssessmentItems({
    classified: [{ sense_id: SENSE_A, verdict: 'produced', evidence_text: 'I ate an apple', needsSense: false }],
    states: new Map([[SENSE_A, {
      card_type: 'production',
      ease_factor: 2.5,
      interval_days: 0,
      repetitions: 0,
      lapses: 0,
      due_at: '2026-06-01T00:00:00+00:00',
    }]]),
    now: NOW,
  })
  assert.equal(produced[0].quality, 5)
  assert.equal(produced[0].next_interval_days, 1)
})

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    headersSent: false,
    status(code) { this.statusCode = code; return this },
    json(payload) { this.body = payload; return this },
  }
}

test('разбор не вызывает судью для несказанного слова и пишет только карточку речи', async () => {
  const calls = []
  let judged = false
  const supabase = {
    from(table) {
      calls.push(table)
      const query = {
        select() { return query },
        eq() { return query },
        in() { return query },
        order() { return query },
        maybeSingle() { return Promise.resolve(this.result()) },
        then(resolve, reject) { return Promise.resolve(this.result()).then(resolve, reject) },
        result() {
          if (table === 'user_profiles') return { data: { learning_language: 'en' }, error: null }
          if (table === 'vocab_dialogue_sessions') {
            return { data: { id: DIALOGUE_ID, user_id: USER_ID, language: 'en', mode: 'chat', status: 'active' }, error: null }
          }
          if (table === 'vocab_dialogue_targets') {
            return { data: [{ sense_id: SENSE_A, position: 1, headword: 'apple', gloss_ru: 'яблоко', user_id: USER_ID }], error: null }
          }
          if (table === 'vocab_dialogue_turns') return { data: [], error: null }
          if (table === 'vocab_dialogue_hints') return { data: [], error: null }
          if (table === 'vocab_srs_states') {
            return { data: [{
              sense_id: SENSE_A,
              user_id: USER_ID,
              card_type: 'production',
              ease_factor: 2.5,
              interval_days: 0,
              repetitions: 0,
              lapses: 0,
              due_at: '2026-06-01T00:00:00+00:00',
            }], error: null }
          }
          return { data: null, error: { message: table } }
        },
      }
      return query
    },
    rpc(name, args) {
      calls.push(name)
      assert.equal(name, 'commit_vocab_dialogue_assessment')
      assert.equal(args.p_items[0].verdict, 'unused')
      assert.equal(args.p_items[0].card_type, undefined)
      return Promise.resolve({
        data: { status: 'applied', items: [{ sense_id: SENSE_A, verdict: 'unused', interval_days: 0 }] },
        error: null,
      })
    },
  }
  const handler = createDialogueAssessmentHandler({
    supabase,
    resolveUserId: async () => USER_ID,
    getBearerToken: () => 'token',
    now: () => NOW,
    judgeSenses: async () => { judged = true; return [] },
  })
  const res = mockRes()
  await handler({
    headers: { authorization: 'Bearer token' },
    body: { dialogue_session_id: DIALOGUE_ID, request_id: 'assess-1' },
  }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.items[0].verdict, 'unused')
  assert.equal(judged, false)
  assert.equal(calls.includes('commit_vocab_srs_review'), false)
  assert.equal(calls.includes('vocab_srs_states'), true)
})

test('сбой судьи не сохраняет разбор', async () => {
  const calls = []
  const supabase = {
    from(table) {
      const query = {
        select() { return query },
        eq() { return query },
        in() { return query },
        order() { return query },
        maybeSingle() { return Promise.resolve(this.result()) },
        then(resolve, reject) { return Promise.resolve(this.result()).then(resolve, reject) },
        result() {
          if (table === 'user_profiles') return { data: { learning_language: 'en' }, error: null }
          if (table === 'vocab_dialogue_sessions') {
            return { data: { id: DIALOGUE_ID, user_id: USER_ID, language: 'en', mode: 'chat', status: 'active' }, error: null }
          }
          if (table === 'vocab_dialogue_targets') {
            return { data: [{ sense_id: SENSE_A, position: 1, headword: 'apple', gloss_ru: 'яблоко', user_id: USER_ID }], error: null }
          }
          if (table === 'vocab_dialogue_turns') {
            return { data: [
              { turn_index: 0, role: 'user', content: 'I ate an apple', user_id: USER_ID, dialogue_session_id: DIALOGUE_ID },
              { turn_index: 0, role: 'assistant', content: 'Nice', user_id: USER_ID, dialogue_session_id: DIALOGUE_ID },
            ], error: null }
          }
          if (table === 'vocab_dialogue_hints') return { data: [], error: null }
          return { data: null, error: null }
        },
      }
      return query
    },
    rpc(name) { calls.push(name); return Promise.resolve({ data: { status: 'applied', items: [] }, error: null }) },
  }
  const handler = createDialogueAssessmentHandler({
    supabase,
    resolveUserId: async () => USER_ID,
    getBearerToken: () => 'token',
    now: () => NOW,
    judgeSenses: async () => { throw new Error('bad json') },
  })
  const res = mockRes()
  await handler({
    headers: { authorization: 'Bearer token' },
    body: { dialogue_session_id: DIALOGUE_ID, request_id: 'assess-2' },
  }, res)
  assert.equal(res.statusCode, 502)
  assert.equal(calls.length, 0)
})

test('миграция разбора пишет только карточку речи и не квалифицирует COALESCE', () => {
  const sql = fs.readFileSync(new URL('../../supabase/migrations/20261026180000_create_vocab_dialogue_assessment.sql', import.meta.url), 'utf8')
  const index = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8')
  const assessment = fs.readFileSync(new URL('./vocab-dialogue-assessment.js', import.meta.url), 'utf8')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS vocab_dialogue_turns/)
  assert.match(sql, /append_vocab_dialogue_exchange/)
  assert.match(sql, /commit_vocab_dialogue_assessment/)
  assert.match(sql, /card_type = 'production'/)
  assert.match(sql, /'production'/)
  assert.doesNotMatch(sql, /card_type = 'recognition'/)
  assert.match(sql, /status = 'assessed'/)
  assert.match(sql, /SET search_path = ''/)
  assert.doesNotMatch(sql, /pg_catalog\.(nullif|coalesce)/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.commit_vocab_dialogue_assessment[\s\S]*TO service_role/)
  assert.match(index, /recordChatPracticeExchange\(/)
  assert.match(index, /createDialogueAssessmentHandler\(/)
  assert.match(assessment, /commit_vocab_dialogue_assessment/)
  assert.match(assessment, /session\.mode !== 'chat' && session\.mode !== 'roleplay' && session\.mode !== 'debate'/)
  assert.doesNotMatch(assessment, /card_type', 'recognition'|card_type = 'recognition'/)
  const roleplaySql = fs.readFileSync(new URL('../../supabase/migrations/20261026190000_allow_roleplay_dialogue_assessment.sql', import.meta.url), 'utf8')
  assert.equal(roleplaySql.match(/v_session\.mode NOT IN \('chat', 'roleplay'\)/g)?.length, 2)
  assert.doesNotMatch(roleplaySql, /mode IS DISTINCT FROM 'chat'/)
  assert.doesNotMatch(roleplaySql, /'debate'/)
  const formsSql = fs.readFileSync(new URL('../../supabase/migrations/20261026200000_match_vocab_word_forms.sql', import.meta.url), 'utf8')
  assert.match(formsSql, /vocab_text_contains_headword/)
  assert.match(formsSql, /vocab_latin_lemma/)
  assert.match(formsSql, /'ran', 'running', 'runs'/)
  assert.match(formsSql, /public\.vocab_text_contains_headword\(v_evidence, v_target\.headword\) IS NOT TRUE/)
  assert.doesNotMatch(formsSql, /pg_catalog\.(nullif|coalesce)/i)
  assert.match(formsSql, /GRANT EXECUTE ON FUNCTION public\.vocab_text_contains_headword\(TEXT, TEXT\) TO service_role/)
  const debateSql = fs.readFileSync(new URL('../../supabase/migrations/20261027180000_allow_debate_dialogue_assessment.sql', import.meta.url), 'utf8')
  assert.equal(debateSql.match(/v_session\.mode NOT IN \('chat', 'roleplay', 'debate'\)/g)?.length, 2)
  assert.match(debateSql, /append_vocab_dialogue_exchange/)
  assert.match(debateSql, /commit_vocab_dialogue_assessment/)
})
