import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const sql = fs.readFileSync(
  new URL('../../supabase/migrations/20261026120000_create_vocab_learning_cycle.sql', import.meta.url),
  'utf8',
)

const tables = [
  'vocab_senses',
  'vocab_srs_states',
  'vocab_review_events',
  'vocab_dialogue_sessions',
  'vocab_dialogue_targets',
  'vocab_dialogue_hints',
]

function policyStatements() {
  return [...sql.matchAll(/CREATE POLICY[\s\S]*?;/g)].map((match) => match[0])
}

test('миграция создаёт шесть новых таблиц и не меняет старый словарь', () => {
  for (const table of tables) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`))
  }
  assert.doesNotMatch(sql, /ALTER\s+TABLE\s+(user_vocabulary|vocabulary_progress|agent_sessions|word_definitions_cache)\b/i)
  assert.doesNotMatch(sql, /UPDATE\s+(user_vocabulary|vocabulary_progress|agent_sessions)\b/i)
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+(user_vocabulary|vocabulary_progress)\b/i)
  assert.doesNotMatch(sql, /CREATE\s+TRIGGER\b[\s\S]*?\bON\s+(user_vocabulary|vocabulary_progress|agent_sessions)\b/i)
  assert.doesNotMatch(sql, /next_review_at|vocabulary_progress/)
})

test('значения ссылаются на user_vocabulary и уникальны по vocabulary_id и sense_key', () => {
  assert.match(sql, /vocabulary_id UUID NOT NULL REFERENCES user_vocabulary\(id\) ON DELETE CASCADE/)
  assert.match(sql, /user_id UUID NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/)
  assert.match(sql, /language TEXT NOT NULL CHECK \(language IN \('en', 'zh'\)\)/)
  assert.match(sql, /headword TEXT NOT NULL/)
  assert.match(sql, /gloss_ru TEXT CHECK \(gloss_ru IS NULL/)
  assert.match(sql, /UNIQUE \(vocabulary_id, sense_key\)/)
})

test('карточки recognition и production стартуют с параметрами SM-2 и обе создаются вместе со значением', () => {
  assert.match(sql, /card_type TEXT NOT NULL CHECK \(card_type IN \('recognition', 'production'\)\)/)
  assert.match(sql, /ease_factor NUMERIC\(8, 2\) NOT NULL DEFAULT 2\.5 CHECK \(ease_factor >= 1\.3\)/)
  assert.match(sql, /interval_days INTEGER NOT NULL DEFAULT 0/)
  assert.match(sql, /repetitions INTEGER NOT NULL DEFAULT 0/)
  assert.match(sql, /lapses INTEGER NOT NULL DEFAULT 0/)
  assert.match(sql, /UNIQUE \(sense_id, card_type\)/)
  assert.match(sql, /idx_vocab_srs_states_due[\s\S]*\(user_id, card_type, due_at\)/)
  assert.match(sql, /\(NEW\.id, NEW\.user_id, 'recognition', NEW\.created_at\)/)
  assert.match(sql, /\(NEW\.id, NEW\.user_id, 'production', NEW\.created_at\)/)
})

test('журнал хранит качество, вердикт, снимки и запрещает второй разбор одного значения', () => {
  assert.match(sql, /quality INTEGER NOT NULL CHECK \(quality BETWEEN 0 AND 5\)/)
  assert.match(sql, /source TEXT NOT NULL CHECK \(source IN \('daily_review', 'dialogue'\)\)/)
  assert.match(sql, /hint_used BOOLEAN NOT NULL DEFAULT FALSE/)
  assert.match(sql, /evidence_text TEXT/)
  assert.match(sql, /ease_before NUMERIC\(8, 2\) NOT NULL/)
  assert.match(sql, /ease_after NUMERIC\(8, 2\) NOT NULL/)
  assert.match(sql, /interval_before INTEGER NOT NULL/)
  assert.match(sql, /interval_after INTEGER NOT NULL/)
  assert.match(sql, /due_before TIMESTAMP WITH TIME ZONE/)
  assert.match(sql, /due_after TIMESTAMP WITH TIME ZONE/)
  assert.match(sql, /verdict = 'produced' AND quality = 5/)
  assert.match(sql, /verdict = 'wrong_sense' AND quality = 1/)
  assert.match(sql, /ease_before = ease_after/)
  assert.match(sql, /vocab_review_events_dialogue_sense_uidx[\s\S]*\(dialogue_session_id, sense_id\)/)
  assert.match(sql, /vocab_review_events is append-only/)
  assert.match(sql, /BEFORE UPDATE ON vocab_review_events/)
})

test('учебная сессия хранит режим, статус, уровень и связь с agent_sessions', () => {
  assert.match(sql, /mode TEXT NOT NULL CHECK \(mode IN \('chat', 'roleplay', 'debate'\)\)/)
  assert.match(sql, /status TEXT NOT NULL DEFAULT 'active' CHECK \(status IN \('active', 'assessed', 'abandoned'\)\)/)
  assert.match(sql, /level_snapshot TEXT NOT NULL/)
  assert.match(sql, /agent_session_id UUID REFERENCES agent_sessions\(id\) ON DELETE SET NULL/)
  assert.match(sql, /vocab_dialogue_sessions_agent_uidx[\s\S]*\(agent_session_id\)[\s\S]*WHERE agent_session_id IS NOT NULL/)
  assert.match(sql, /vocab_dialogue_sessions_request_uidx[\s\S]*\(user_id, request_id\)/)
  assert.match(sql, /UNIQUE \(dialogue_session_id, sense_id\)/)
  assert.match(sql, /UNIQUE \(dialogue_session_id, position\)/)
  assert.match(sql, /position SMALLINT NOT NULL CHECK \(position BETWEEN 1 AND 5\)/)
  assert.match(sql, /UNIQUE \(dialogue_session_id, turn_index\)/)
})

test('чтение своих строк идёт через auth.uid(), клиентской записи политиками нет', () => {
  const policies = policyStatements()
  assert.equal(policies.length, 6)
  for (const table of tables) {
    assert.ok(policies.some((policy) => policy.includes(`ON ${table} FOR SELECT`)))
    assert.match(sql, new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`))
  }
  for (const policy of policies) {
    assert.match(policy, /USING \(auth\.uid\(\) = user_id\)/)
    assert.doesNotMatch(policy, /FOR (INSERT|UPDATE|DELETE)/)
  }
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON vocab_review_events FROM anon, authenticated/)
  assert.match(sql, /Backend JWT подписывается отдельно/)
  assert.match(sql, /обходит RLS/)
})
