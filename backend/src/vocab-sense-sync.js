import { buildSenseDrafts } from './vocab-senses.js'

/** Лимит одной страницы PostgREST. Сортировка по id не пропускает и не повторяет строки. */
export const VOCABULARY_PAGE_SIZE = 1000

/** Размер одной вставки. Конфликт гасит UNIQUE (vocabulary_id, sense_key). */
export const SENSE_INSERT_BATCH_SIZE = 100

const VOCABULARY_COLUMNS = 'id, user_id, language, word, translations, part_of_speech, contexts'

function assertSyncParams(supabase, userId, language) {
  if (!supabase || typeof supabase.from !== 'function') {
    throw new TypeError('supabase client is required')
  }
  if (typeof userId !== 'string' || userId.trim() === '' || userId !== userId.trim()) {
    throw new TypeError('userId is required')
  }
  if (language !== 'en' && language !== 'zh') {
    throw new TypeError('language must be en or zh')
  }
}

function assertDraftOwned(draft, userId, language) {
  if (!draft || draft.user_id !== userId || draft.language !== language) {
    throw new Error('sense draft does not match userId or language')
  }
}

/**
 * Дописывает отсутствующие vocab_senses для одного пользователя и языка.
 * Клиент передаёт вызывающий код. Карточки recognition и production создаёт
 * триггер AFTER INSERT vocab_senses_create_cards, этот модуль их не пишет.
 * Повтор и конфликт по (vocabulary_id, sense_key) не перезаписывают строку.
 */
export async function ensureUserVocabularySenses({ supabase, userId, language }) {
  assertSyncParams(supabase, userId, language)

  let vocabularyRows = 0
  let drafts = 0
  let created = 0
  let from = 0
  let previousPageId = null

  for (;;) {
    const { data, error } = await supabase
      .from('user_vocabulary')
      .select(VOCABULARY_COLUMNS)
      .eq('user_id', userId)
      .eq('language', language)
      .order('id', { ascending: true })
      .range(from, from + VOCABULARY_PAGE_SIZE - 1)

    if (error) {
      throw new Error('Failed to read user vocabulary')
    }
    const rows = Array.isArray(data) ? data : []
    if (rows.length === 0) break
    if (previousPageId !== null && rows[0]?.id === previousPageId) {
      throw new Error('vocabulary page did not advance')
    }
    previousPageId = rows[rows.length - 1]?.id ?? previousPageId

    const pageDrafts = []
    for (const row of rows) {
      vocabularyRows += 1
      if (!row || row.user_id !== userId || row.language !== language) {
        throw new Error('vocabulary row does not match userId or language')
      }
      const rowDrafts = buildSenseDrafts(row)
      for (const draft of rowDrafts) assertDraftOwned(draft, userId, language)
      pageDrafts.push(...rowDrafts)
    }
    drafts += pageDrafts.length
    created += await insertMissingSenses(supabase, pageDrafts)

    if (rows.length < VOCABULARY_PAGE_SIZE) break
    from += VOCABULARY_PAGE_SIZE
  }

  return { vocabularyRows, drafts, created }
}

async function insertMissingSenses(supabase, pageDrafts) {
  let created = 0
  for (let index = 0; index < pageDrafts.length; index += SENSE_INSERT_BATCH_SIZE) {
    const batch = pageDrafts.slice(index, index + SENSE_INSERT_BATCH_SIZE)
    if (batch.length === 0) continue
    const { data, error } = await supabase
      .from('vocab_senses')
      .upsert(batch, {
        onConflict: 'vocabulary_id,sense_key',
        ignoreDuplicates: true,
      })
      .select('id')

    if (error) {
      throw new Error('Failed to insert vocabulary senses')
    }
    if (!Array.isArray(data)) {
      throw new Error('Failed to insert vocabulary senses')
    }
    created += data.length
  }
  return created
}
