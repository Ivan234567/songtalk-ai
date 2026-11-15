import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const sql = fs.readFileSync(
  new URL('../../supabase/migrations/20261111180000_transfer_diagnosis.sql', import.meta.url),
  'utf8',
)
const retentionSql = fs.readFileSync(
  new URL('../../supabase/migrations/20261111170000_retention_diagnosis.sql', import.meta.url),
  'utf8',
)
const speech = fs.readFileSync(new URL('./vocab-speech-progress.js', import.meta.url), 'utf8')

function body(name) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  assert.notEqual(start, -1, name)
  const next = sql.indexOf('CREATE OR REPLACE FUNCTION public.', start + 10)
  return sql.slice(start, next === -1 ? sql.length : next)
}

test('миграция переноса не трогает применённый файл удержания и не выполняется как DO-блок', () => {
  assert.match(retentionSql, /mode IN \('chat', 'roleplay', 'debate', 'retention'\)/)
  assert.equal(retentionSql.includes('is_transfer'), false)
  assert.equal(sql.includes('DO $$'), false)
  assert.equal(sql.includes('DO $'), false)
  assert.match(sql, /DROP CONSTRAINT IF EXISTS vocab_dialogue_sessions_mode_check/)
  assert.match(sql, /ADD CONSTRAINT vocab_dialogue_sessions_mode_check/)
  assert.match(sql, /mode IN \('chat', 'roleplay', 'debate', 'retention', 'transfer'\)/)
  assert.equal(sql.includes('DISABLE ROW LEVEL SECURITY'), false)
  assert.equal(sql.includes('CREATE POLICY'), false)
  assert.equal(sql.includes('SECURITY DEFINER'), false)
  assert.equal(sql.includes('INSERT INTO public.vocab_srs_states'), false)
  assert.equal(sql.includes('DROP TRIGGER IF EXISTS vocab_review_events_append_only_trigger'), false)
})

test('baseline — ровно одно обучение и одно удержание, NULL не блокирует весь смысл', () => {
  const records = body('vocab_transfer_baseline_records')
  const valid = body('vocab_transfer_baseline_valid')
  assert.equal(records.includes('IS NOT TRUE'), false)
  assert.equal(records.includes('jsonb_agg'), false)
  assert.match(records, /session\.status = 'assessed'/)
  assert.equal(records.match(/session\.status = 'assessed'/g).length, 2)
  assert.match(records, /JOIN public\.vocab_review_events AS event/)
  assert.match(records, /event\.retention_days IS NULL/)
  assert.match(records, /event\.is_transfer IS FALSE/)
  assert.match(records, /event\.source = 'dialogue'/)
  assert.match(records, /event\.card_type = 'production'/)
  assert.match(records, /ORDER BY session\.created_at, session\.id, event\.created_at, event\.id/)
  assert.equal(records.match(/LIMIT 1/g).length, 2)
  assert.match(records, /FULL JOIN/)
  assert.match(records, /jsonb_build_array/)
  const learningFirst = records.indexOf("'source', 'learning'")
  const retentionSecond = records.indexOf("'source', 'retention'")
  assert.ok(learningFirst > 0 && learningFirst < retentionSecond)
  assert.match(records, /event\.verdict = 'produced'/)
  assert.match(records, /event\.quality = 5/)
  assert.match(records, /event\.ease_before = event\.ease_after/)
  assert.match(records, /event\.due_before IS NOT DISTINCT FROM event\.due_after/)
  assert.match(records, /vocab_text_contains_headword/)
  assert.match(records, /turn\.role = 'user'/)
  assert.match(records, /INTERVAL '24 hours'/)
  assert.match(records, /vocab_situation_valid\(session\.situation\)/)
  assert.match(valid, /jsonb_array_length\(p_baseline\) IS DISTINCT FROM 2/)
  assert.equal(valid.includes('> 20'), false)
  assert.match(valid, /p_baseline->0->>'source' IS DISTINCT FROM 'learning'/)
  assert.match(valid, /p_baseline->1->>'source' IS DISTINCT FROM 'retention'/)
  assert.match(valid, /jsonb_typeof\(p_baseline\) IS DISTINCT FROM 'array' THEN FALSE/)
})

test('подтверждение переноса одно на смысл, независимо от ситуации', () => {
  const confirm = body('vocab_transfer_can_confirm')
  const prior = confirm.slice(confirm.lastIndexOf('NOT EXISTS'))
  assert.match(prior, /prior\.transfer_confirmed IS TRUE/)
  assert.match(prior, /prior\.user_id = p_user_id/)
  assert.match(prior, /prior\.sense_id = p_sense_id/)
  assert.equal(prior.includes('vocab_situation_same'), false)
  assert.match(sql, /vocab_review_events_transfer_confirmed_once/)
  assert.match(sql, /WHERE transfer_confirmed/)
})

test('после события заморожены поля события, сессии и цели, кроме завершения сессии', () => {
  const event = body('vocab_guard_transfer_event')
  for (const column of [
    'id', 'user_id', 'sense_id', 'dialogue_session_id', 'source', 'card_type',
    'quality', 'verdict', 'evidence_text', 'hint_used', 'client_request_id',
    'created_at', 'retention_days', 'is_transfer', 'situation', 'baseline_situations',
    'novelty_ok', 'transfer_confirmed', 'ease_before', 'ease_after', 'interval_before',
    'interval_after', 'repetitions_before', 'repetitions_after', 'lapses_before',
    'lapses_after', 'due_before', 'due_after',
  ]) {
    assert.match(event, new RegExp(`OLD\\.${column} IS DISTINCT FROM NEW\\.${column}`))
  }
  assert.match(event, /IF TG_OP = 'UPDATE' THEN/)
  const session = body('vocab_guard_transfer_session')
  assert.match(session, /OLD\.mode IS DISTINCT FROM NEW\.mode/)
  assert.match(session, /OLD\.user_id IS DISTINCT FROM NEW\.user_id/)
  assert.match(session, /OLD\.situation IS DISTINCT FROM NEW\.situation/)
  assert.match(session, /OLD\.created_at IS DISTINCT FROM NEW\.created_at/)
  assert.match(session, /OLD\.status IS DISTINCT FROM NEW\.status/)
  assert.match(session, /event\.dialogue_session_id IS DISTINCT FROM OLD\.id/)
  assert.equal(session.includes('OLD.assessed_at'), false)
  const target = body('vocab_guard_transfer_target')
  for (const column of [
    'user_id', 'sense_id', 'is_transfer', 'baseline_situations', 'novelty_ok',
    'moves_schedule', 'retention_days', 'headword', 'dialogue_session_id',
  ]) {
    assert.match(target, new RegExp(`OLD\\.${column} IS DISTINCT FROM NEW\\.${column}`))
  }
  assert.match(sql, /vocab_review_events__transfer_guard/)
})

test('элементы RPC совпадают с целями как множество, повтор assessed не перепроверяет их', () => {
  const commit = body('commit_vocab_dialogue_assessment')
  const replayAt = commit.indexOf("'status', 'replayed'")
  const duplicateAt = commit.indexOf('HAVING pg_catalog.count(*) > 1')
  const writeAt = commit.indexOf('INSERT INTO public.vocab_review_events')
  assert.ok(replayAt > 0 && replayAt < duplicateAt && duplicateAt < writeAt)
  assert.match(commit, /sense id is invalid/)
  assert.match(commit, /jsonb_typeof\(item\.value->'sense_id'\) IS DISTINCT FROM 'string'/)
  assert.match(commit, /target\.sense_id = \(item\.value->>'sense_id'\)::uuid/)
  assert.match(commit, /'status', 'conflict'/)
  assert.equal(sql.match(/CREATE OR REPLACE FUNCTION public\.commit_vocab_dialogue_assessment/g).length, 1)
  assert.match(commit, /SECURITY INVOKER/)
  assert.match(commit, /SET search_path = ''/)
  assert.match(commit, /p_user_id UUID/)
  assert.match(commit, /p_items JSONB/)
  assert.match(commit, /pg_advisory_xact_lock/)
  assert.match(commit, /v_request_id \|\| ':' \|\| v_sense_id::text/)
  assert.match(commit, /client cannot assign diagnosis fields/)
  assert.equal(commit.match(/v_session\.mode IS DISTINCT FROM 'transfer'/g).length, 2)
  assert.match(commit, /v_verdict = 'produced' AND v_quality = 5/)
  assert.match(commit, /v_verdict = 'wrong_sense' AND v_quality = 1/)
  assert.match(commit, /v_verdict IN \('hinted', 'mentioned', 'unused', 'echoed', 'no_opportunity'\) AND v_quality = 0/)
  assert.match(commit, /IF v_moving THEN/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.commit_vocab_dialogue_assessment\(UUID, UUID, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, JSONB\) TO service_role/)
})

test('подтверждения одного смысла сериализуются, id сессии заморожен, обучение не берёт no_opportunity', () => {
  assert.equal(sql.includes('\\'), false)
  assert.match(sql, /!~\*/)
  assert.match(sql, /SELECT \*/)
  assert.match(sql, /NEW\.mode = 'transfer'/)
  const commit = body('commit_vocab_dialogue_assessment')
  const sessionLock = commit.indexOf("hashtext(p_dialogue_session_id::text)")
  const senseLock = commit.indexOf("hashtext('vocab-transfer:' || p_user_id::text)")
  const rowLock = commit.indexOf('FOR UPDATE;', senseLock)
  assert.ok(sessionLock > 0 && sessionLock < senseLock && senseLock < rowLock)
  assert.match(commit, /ORDER BY target\.sense_id/)
  const records = body('vocab_transfer_baseline_records')
  const learning = records.slice(0, records.indexOf('FULL JOIN'))
  assert.match(learning, /event\.verdict IN \('produced', 'wrong_sense', 'hinted', 'echoed', 'mentioned'\)/)
  assert.equal(learning.includes('no_opportunity'), false)
  assert.equal(learning.includes("'unused'"), false)
  const producedGate = learning.slice(learning.indexOf('event.verdict IS DISTINCT FROM \'produced\''))
  assert.match(producedGate, /event\.evidence_text IS NOT NULL/)
  assert.match(producedGate, /char_length\(pg_catalog\.btrim\(event\.evidence_text\)\) > 0/)
  assert.match(producedGate, /vocab_text_contains_headword\(event\.evidence_text, target\.headword\) IS TRUE/)
  assert.match(producedGate, /turn\.dialogue_session_id = event\.dialogue_session_id/)
  assert.match(producedGate, /turn\.user_id = event\.user_id/)
  assert.match(producedGate, /turn\.role = 'user'/)
  assert.match(producedGate, /strpos\(turn\.content, pg_catalog\.btrim\(event\.evidence_text\)\) > 0/)
  assert.equal(learning.includes("'wrong_sense'"), true)
  assert.ok(learning.indexOf("'wrong_sense'") < learning.indexOf('event.verdict IS DISTINCT FROM \'produced\''))
  const session = body('vocab_guard_transfer_session')
  assert.match(session, /OLD\.id IS DISTINCT FROM NEW\.id/)
  assert.match(session, /event\.dialogue_session_id = OLD\.id/)
  assert.match(session, /item\.value->>'source' = 'learning'/)
  assert.match(session, /item\.value->>'source' = 'retention'/)
  const confirm = body('vocab_transfer_can_confirm')
  for (const piece of [
    "p_source = 'dialogue'",
    "p_card_type = 'production'",
    "p_verdict = 'produced'",
    'p_quality = 5',
    'vocab_situation_valid(p_situation)',
    'vocab_transfer_baseline_valid(p_baseline)',
    'vocab_transfer_is_novel',
    'vocab_retention_confirmed',
    'vocab_text_contains_headword',
    "turn.role = 'user'",
    'prior.transfer_confirmed IS TRUE',
  ]) {
    assert.ok(confirm.includes(piece), piece)
  }
  const event = body('vocab_guard_transfer_event')
  assert.match(event, /NEW\.source IS DISTINCT FROM 'dialogue'/)
  assert.match(event, /NEW\.card_type IS DISTINCT FROM 'production'/)
  assert.match(event, /NEW\.quality IS DISTINCT FROM 5/)
  assert.match(event, /NEW\.transfer_confirmed := FALSE/)
  assert.match(event, /vocab-transfer:/)
  assert.match(sql, /vocab_review_events_transfer_confirmed_once/)
  assert.match(commit, /IF v_moving THEN/)
  assert.equal(commit.match(/v_session\.mode IS DISTINCT FROM 'transfer'/g).length, 2)
})

test('produced без цитаты не входит в learning baseline, wrong_sense без цитаты входит', () => {
  const records = body('vocab_transfer_baseline_records')
  const learning = records.slice(0, records.indexOf(') AS learning'))
  const retention = records.slice(records.indexOf('FULL JOIN'))
  const quoteAt = learning.indexOf('event.verdict IS DISTINCT FROM \'produced\'')
  assert.ok(quoteAt > learning.indexOf('event.verdict IN'))
  const quoteBranch = learning.slice(quoteAt, learning.indexOf('vocab_situation_valid(session.situation)'))
  assert.match(quoteBranch, /evidence_text IS NOT NULL/)
  assert.match(quoteBranch, /btrim\(event\.evidence_text\)/)
  assert.match(quoteBranch, /vocab_text_contains_headword\(event\.evidence_text, target\.headword\)/)
  assert.match(quoteBranch, /strpos\(turn\.content, pg_catalog\.btrim\(event\.evidence_text\)\)/)
  assert.match(quoteBranch, /turn\.role = 'user'/)
  assert.equal(quoteBranch.includes('wrong_sense'), false)
  assert.equal(learning.includes("'wrong_sense'"), true)
  assert.equal(retention.includes('event.verdict IS DISTINCT FROM \'produced\''), false)
})

test('якорь T требует headword в цитате и ту же цитату в реплике пользователя', () => {
  const anchor = body('vocab_retention_anchor_at')
  const speechAt = anchor.indexOf(') AS speech')
  const earlierAt = anchor.indexOf('AS earlier')
  assert.ok(speechAt > 0 && earlierAt > speechAt)
  const candidate = anchor.slice(speechAt, earlierAt)
  assert.match(candidate, /target\.dialogue_session_id = speech\.dialogue_session_id/)
  assert.match(candidate, /target\.user_id = speech\.user_id/)
  assert.match(candidate, /target\.sense_id = speech\.sense_id/)
  assert.match(candidate, /vocab_text_contains_headword\(speech\.evidence_text, target\.headword\) IS TRUE/)
  assert.match(candidate, /turn\.dialogue_session_id = speech\.dialogue_session_id/)
  assert.match(candidate, /turn\.user_id = speech\.user_id/)
  assert.match(candidate, /turn\.role = 'user'/)
  assert.match(candidate, /strpos\(turn\.content, pg_catalog\.btrim\(speech\.evidence_text\)\) > 0/)
  assert.match(candidate, /speech\.schedule_held IS FALSE/)
  assert.match(candidate, /speech\.due_before IS DISTINCT FROM speech\.due_after/)
  assert.equal(anchor.slice(earlierAt).includes('speech.evidence_text'), false)
  assert.match(anchor, /earlier\.dialogue_session_id IS DISTINCT FROM speech\.dialogue_session_id/)
  assert.match(anchor, /earlier\.retention_days IS NULL/)
  assert.match(anchor, /earlier\.is_transfer IS FALSE/)
  assert.match(anchor, /ORDER BY speech\.created_at/)
  assert.match(anchor, /LIMIT 1/)
  const confirmed = body('vocab_retention_confirmed')
  assert.equal(confirmed.includes('speech.evidence_text'), false)
})

test('раннее produced без headword или без реплики не создаёт якорь и не заслоняет корректную пару', () => {
  const anchor = body('vocab_retention_anchor_at')
  const earlierAt = anchor.indexOf('FROM public.vocab_review_events AS earlier')
  const orderAt = anchor.indexOf('ORDER BY speech.created_at')
  assert.ok(earlierAt > 0 && orderAt > earlierAt)
  const earlier = anchor.slice(earlierAt, orderAt)
  assert.match(earlier, /earlier\.source = 'dialogue'/)
  assert.match(earlier, /earlier\.card_type = 'production'/)
  assert.match(earlier, /earlier\.verdict = 'produced'/)
  assert.match(earlier, /char_length\(pg_catalog\.btrim\(earlier\.evidence_text\)\) > 0/)
  assert.match(earlier, /earlier\.retention_days IS NULL/)
  assert.match(earlier, /earlier\.is_transfer IS FALSE/)
  assert.match(earlier, /earlier\.dialogue_session_id IS DISTINCT FROM speech\.dialogue_session_id/)
  assert.match(earlier, /earlier\.created_at < speech\.created_at/)
  assert.match(earlier, /target\.dialogue_session_id = earlier\.dialogue_session_id/)
  assert.match(earlier, /target\.user_id = earlier\.user_id/)
  assert.match(earlier, /target\.sense_id = earlier\.sense_id/)
  assert.match(earlier, /vocab_text_contains_headword\(earlier\.evidence_text, target\.headword\) IS TRUE/)
  assert.match(earlier, /turn\.dialogue_session_id = earlier\.dialogue_session_id/)
  assert.match(earlier, /turn\.user_id = earlier\.user_id/)
  assert.match(earlier, /turn\.role = 'user'/)
  assert.match(earlier, /strpos\(turn\.content, pg_catalog\.btrim\(earlier\.evidence_text\)\) > 0/)
  assert.equal(earlier.includes('IS NOT TRUE'), false)
  assert.equal(earlier.includes('NOT EXISTS'), false)
  assert.match(anchor, /ORDER BY speech\.created_at\s+LIMIT 1/)
  assert.match(anchor.slice(anchor.indexOf(') AS speech'), earlierAt), /vocab_text_contains_headword\(speech\.evidence_text, target\.headword\) IS TRUE/)
})

test('новизна требует другой контекст и другое намерение, клиент их не записывает', () => {
  const differ = body('vocab_situations_differ')
  assert.match(differ, /vocab_context_differs/)
  assert.match(differ, /p_left->>'intent' IS DISTINCT FROM p_right->>'intent'/)
  const valid = body('vocab_situation_valid')
  assert.match(valid, /jsonb_typeof\(p_situation\) IS DISTINCT FROM 'object' THEN FALSE/)
  assert.match(valid, /jsonb_typeof\(role\.value\) IS DISTINCT FROM 'string'/)
  const anchor = body('vocab_retention_anchor_at')
  assert.match(anchor, /event\.is_transfer IS FALSE/)
  assert.match(anchor, /earlier\.is_transfer IS FALSE/)
  assert.match(anchor, /event\.retention_days IS NULL/)
  assert.match(anchor, /earlier\.retention_days IS NULL/)
  const qualifiers = speech.slice(speech.indexOf('export function isQualifyingProduced'), speech.indexOf('export function producedHadScheduleRight'))
  assert.match(qualifiers, /!isTransferEvent\(event\)/)
})
