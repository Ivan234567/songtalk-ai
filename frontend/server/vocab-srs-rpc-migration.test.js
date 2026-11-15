import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const rpcSql = fs.readFileSync(
  new URL('../../supabase/migrations/20261026170000_create_vocab_srs_review_rpc.sql', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n')
const cycleSql = fs.readFileSync(
  new URL('../../supabase/migrations/20261026120000_create_vocab_learning_cycle.sql', import.meta.url),
  'utf8',
)
const routesSql = fs.readFileSync(new URL('./vocab-srs-routes.js', import.meta.url), 'utf8')

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.ok(start >= 0, startMarker)
  assert.ok(end > start, endMarker)
  return source.slice(start, end)
}

test('функция commit_vocab_srs_review объявлена отдельно от учебной миграции', () => {
  assert.match(rpcSql, /CREATE OR REPLACE FUNCTION public\.commit_vocab_srs_review\(/)
  assert.match(rpcSql, /RETURNS JSONB/)
  assert.match(rpcSql, /SECURITY INVOKER/)
  assert.match(rpcSql, /SET search_path = ''/)
  assert.doesNotMatch(rpcSql, /SET search_path = public/)
  assert.match(
    rpcSql,
    /v_request_id := NULLIF\(\s*pg_catalog\.btrim\(COALESCE\(p_client_request_id, ''\)\),\s*''\s*\);/
  )
  assert.doesNotMatch(rpcSql, /pg_catalog\.(nullif|coalesce)\s*\(/i)
  assert.doesNotMatch(rpcSql, /SECURITY DEFINER/)
  assert.doesNotMatch(cycleSql, /commit_vocab_srs_review/)
  assert.match(routesSql, /supabase\.rpc\('commit_vocab_srs_review'/)
  assert.doesNotMatch(routesSql, /\.(insert|update|upsert)\s*\(/)
  assert.doesNotMatch(rpcSql, /\b(ALTER|DROP|CREATE)\s+TABLE\b/i)
  assert.doesNotMatch(rpcSql, /\b(COMMIT|ROLLBACK)\b/)
  assert.doesNotMatch(rpcSql, /card_type\s*=\s*'production'/)
  assert.doesNotMatch(rpcSql, /UPDATE\s+public\.vocab_srs_states[\s\S]*production/)
  assert.doesNotMatch(rpcSql, /interval_days \*|ease_factor \*|round\(/i)
})

test('повторный ключ блокируется, а журнал ищется по владельцу и client_request_id', () => {
  const lockAt = rpcSql.indexOf('pg_advisory_xact_lock')
  const senseAt = rpcSql.indexOf('FROM public.vocab_senses')
  const eventAt = rpcSql.indexOf('FROM public.vocab_review_events')
  const cardAt = rpcSql.indexOf("card_type = 'recognition'\n  FOR UPDATE")
  assert.ok(lockAt > 0)
  assert.ok(senseAt > lockAt)
  assert.ok(eventAt > senseAt)
  assert.ok(cardAt > eventAt)
  assert.match(
    rpcSql,
    /pg_catalog\.pg_advisory_xact_lock\(\s*pg_catalog\.hashtext\(p_user_id::text\),\s*pg_catalog\.hashtext\(v_request_id\)\s*\)/
  )
  assert.match(rpcSql, /WHERE user_id = p_user_id\s+AND client_request_id = v_request_id/)
})

test('владелец и язык проверяются до ветви replayed', () => {
  const shareAt = rpcSql.indexOf('FOR SHARE')
  const ownerAt = rpcSql.indexOf('v_sense.user_id IS DISTINCT FROM p_user_id')
  const languageAt = rpcSql.indexOf('v_sense.language IS DISTINCT FROM p_language')
  const notFoundAt = rpcSql.indexOf("'status', 'not_found'")
  const replayedAt = rpcSql.indexOf("'status', 'replayed'")
  assert.ok(shareAt > rpcSql.indexOf('pg_advisory_xact_lock'))
  assert.ok(ownerAt > shareAt && ownerAt < replayedAt)
  assert.ok(languageAt > shareAt && languageAt < replayedAt)
  assert.ok(notFoundAt < replayedAt)
  const beforeReplay = rpcSql.slice(shareAt, replayedAt)
  assert.match(beforeReplay, /'status', 'not_found'/)
  assert.doesNotMatch(beforeReplay, /INSERT INTO public\.vocab_review_events/)
  assert.doesNotMatch(beforeReplay, /UPDATE public\.vocab_srs_states/)
})

test('NULL в verdict и quality отклоняется до проверки пары', () => {
  const nullAt = rpcSql.indexOf('p_verdict IS NULL OR p_quality IS NULL')
  const pairAt = rpcSql.indexOf("p_verdict = 'again' AND p_quality = 1")
  assert.ok(nullAt > 0)
  assert.ok(pairAt > nullAt)
  const rejection = rpcSql.slice(nullAt, pairAt)
  assert.match(rejection, /ERRCODE = '22023'/)
  assert.doesNotMatch(rejection, /INSERT INTO public\.vocab_review_events/)
})

test('replayed и conflict возвращаются из журнала и не доходят до записи', () => {
  const beforeWrite = sliceBetween(rpcSql, 'IF v_event.sense_id = p_sense_id', 'INSERT INTO public.vocab_review_events')
  assert.match(beforeWrite, /'status', 'replayed'/)
  assert.match(beforeWrite, /v_event\.due_after/)
  assert.match(beforeWrite, /v_event\.interval_after/)
  assert.match(beforeWrite, /v_event\.repetitions_after/)
  assert.match(beforeWrite, /'replayed', true/)
  assert.match(beforeWrite, /v_event\.sense_id = p_sense_id/)
  assert.match(beforeWrite, /v_event\.card_type = 'recognition'/)
  assert.match(beforeWrite, /v_event\.quality = p_quality/)
  assert.match(beforeWrite, /v_event\.verdict = p_verdict/)
  assert.match(beforeWrite, /'status', 'conflict'/)
  assert.doesNotMatch(beforeWrite, /INSERT INTO public\.vocab_review_events/)
  assert.doesNotMatch(beforeWrite, /UPDATE public\.vocab_srs_states/)
})

test('устаревший снимок не создаёт событие и не обновляет карточку', () => {
  const decision = sliceBetween(rpcSql, 'FOR UPDATE;', 'INSERT INTO public.vocab_review_events')
  assert.match(decision, /v_state\.ease_factor IS DISTINCT FROM p_expected_ease/)
  assert.match(decision, /v_state\.interval_days IS DISTINCT FROM p_expected_interval_days/)
  assert.match(decision, /v_state\.repetitions IS DISTINCT FROM p_expected_repetitions/)
  assert.match(decision, /v_state\.lapses IS DISTINCT FROM p_expected_lapses/)
  assert.match(decision, /v_state\.due_at IS DISTINCT FROM p_expected_due_at/)
  assert.match(decision, /'status', 'stale_state'/)
  assert.doesNotMatch(decision, /UPDATE public\.vocab_srs_states/)
})

test('актуальная оценка пишет daily_review и обновляет одну карточку recognition', () => {
  assert.match(rpcSql, /p_quality < 3 THEN\s+v_lapses_after := v_state\.lapses \+ 1/s)
  assert.match(rpcSql, /v_lapses_after := v_state\.lapses/)
  assert.match(rpcSql, /INSERT INTO public\.vocab_review_events/)
  assert.match(rpcSql, /'recognition'/)
  assert.match(rpcSql, /'daily_review'/)
  assert.match(rpcSql, /ease_before/)
  assert.match(rpcSql, /ease_after/)
  assert.match(rpcSql, /lapses_before/)
  assert.match(rpcSql, /lapses_after/)
  assert.match(rpcSql, /due_before/)
  assert.match(rpcSql, /due_after/)
  assert.match(rpcSql, /dialogue_session_id/)
  const update = sliceBetween(rpcSql, 'UPDATE public.vocab_srs_states', 'GET DIAGNOSTICS')
  assert.match(update, /card_type = 'recognition'/)
  assert.match(update, /ease_factor = p_next_ease/)
  assert.match(update, /interval_days = p_next_interval_days/)
  assert.match(update, /repetitions = p_next_repetitions/)
  assert.match(update, /lapses = v_lapses_after/)
  assert.match(update, /due_at = p_next_due_at/)
  assert.match(update, /last_reviewed_at = p_reviewed_at/)
  assert.match(update, /user_id = p_user_id/)
  assert.doesNotMatch(update, /updated_at/)
  assert.match(rpcSql, /GET DIAGNOSTICS v_updated = ROW_COUNT/)
  assert.match(rpcSql, /IF v_updated <> 1 THEN/)
  assert.match(rpcSql, /RAISE EXCEPTION 'commit_vocab_srs_review recognition update affected % rows'/)
  assert.match(rpcSql, /'status', 'applied'/)
  assert.match(rpcSql, /'replayed', false/)
})

test('владелец, язык и пары вердикта проверяются по схеме дневного повторения', () => {
  assert.match(rpcSql, /v_sense\.user_id IS DISTINCT FROM p_user_id/)
  assert.match(rpcSql, /v_sense\.language IS DISTINCT FROM p_language/)
  assert.match(rpcSql, /v_state\.user_id IS DISTINCT FROM v_sense\.user_id/)
  assert.match(rpcSql, /'status', 'not_found'/)
  assert.match(rpcSql, /p_verdict = 'again' AND p_quality = 1/)
  assert.match(rpcSql, /p_verdict = 'hard' AND p_quality = 3/)
  assert.match(rpcSql, /p_verdict = 'good' AND p_quality = 4/)
  assert.match(rpcSql, /p_verdict = 'easy' AND p_quality = 5/)
  assert.match(rpcSql, /FOR SHARE/)
})

test('EXECUTE отозван у PUBLIC, anon и authenticated и выдан service_role', () => {
  assert.match(rpcSql, /REVOKE ALL ON FUNCTION public\.commit_vocab_srs_review\([\s\S]*?\) FROM PUBLIC;/)
  assert.match(rpcSql, /REVOKE ALL ON FUNCTION public\.commit_vocab_srs_review\([\s\S]*?\) FROM anon;/)
  assert.match(rpcSql, /REVOKE ALL ON FUNCTION public\.commit_vocab_srs_review\([\s\S]*?\) FROM authenticated;/)
  assert.match(rpcSql, /GRANT EXECUTE ON FUNCTION public\.commit_vocab_srs_review\([\s\S]*?\) TO service_role;/)
  assert.doesNotMatch(rpcSql, /GRANT EXECUTE ON FUNCTION public\.commit_vocab_srs_review[\s\S]*TO (PUBLIC|anon|authenticated)/)
  assert.doesNotMatch(rpcSql, /eyJ|service_role_key|SUPABASE_SERVICE_ROLE/)
})
