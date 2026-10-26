/** Совпадает с CHECK sense_key: char_length(btrim(sense_key)) BETWEEN 1 AND 200. */
const SENSE_KEY_MAX_CHARS = 200

function charLength(value) {
  return Array.from(value).length
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Форматы, которые словарь реально пишет и читает:
 * строка либо объект с полем translation (source необязателен).
 * Разделители запятая/точка с запятой разбираются до записи в user_vocabulary,
 * поэтому здесь одна строка остаётся одним переводом.
 */
function glossFromItem(item) {
  if (typeof item === 'string') return item
  if (isPlainObject(item) && typeof item.translation === 'string') return item.translation
  return ''
}

function uniqueGlosses(translations) {
  if (!Array.isArray(translations)) return []
  const seen = new Set()
  const glosses = []
  for (const item of translations) {
    const gloss = glossFromItem(item).trim()
    if (!gloss || charLength(gloss) > SENSE_KEY_MAX_CHARS || seen.has(gloss)) continue
    seen.add(gloss)
    glosses.push(gloss)
  }
  return glosses
}

function firstContextText(contexts) {
  if (!Array.isArray(contexts)) return null
  for (const item of contexts) {
    if (!isPlainObject(item) || typeof item.text !== 'string') continue
    if (item.text.trim()) return item.text
  }
  return null
}

function partOfSpeech(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  return value
}

function canBuildDrafts(row) {
  if (!isPlainObject(row)) return false
  if (typeof row.id !== 'string' || !row.id.trim()) return false
  if (typeof row.user_id !== 'string' || !row.user_id.trim()) return false
  if (row.language !== 'en' && row.language !== 'zh') return false
  if (typeof row.word !== 'string' || !row.word.trim()) return false
  return true
}

/**
 * Черновики vocab_senses для одной строки user_vocabulary.
 * headword копируется из word без смены регистра.
 * sense_key равен обрезанному по краям переводу: так одинаковый перевод
 * попадает в UNIQUE (vocabulary_id, sense_key), а разный остаётся разным.
 * Без перевода черновик не создаётся. Исходный объект не меняется.
 * Неполная запись даёт пустой массив.
 */
export function buildSenseDrafts(vocabularyRow) {
  if (!canBuildDrafts(vocabularyRow)) return []
  const glosses = uniqueGlosses(vocabularyRow.translations)
  if (glosses.length === 0) return []
  const contextText = firstContextText(vocabularyRow.contexts)
  const speechPart = partOfSpeech(vocabularyRow.part_of_speech)
  return glosses.map((gloss) => ({
    vocabulary_id: vocabularyRow.id,
    user_id: vocabularyRow.user_id,
    language: vocabularyRow.language,
    headword: vocabularyRow.word,
    gloss_ru: gloss,
    sense_key: gloss,
    part_of_speech: speechPart,
    context_text: contextText,
  }))
}
