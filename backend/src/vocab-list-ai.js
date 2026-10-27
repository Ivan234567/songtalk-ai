import crypto from 'node:crypto'

function parseJsonObject(raw) {
  const text = String(raw || '').trim()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      return JSON.parse(text.slice(start, end + 1))
    } catch {
      return null
    }
  }
}

function cleanEntry(row, language) {
  if (!row || typeof row !== 'object') return null
  const word = typeof row.word === 'string' ? row.word.trim() : ''
  const gloss = typeof row.gloss === 'string' ? row.gloss.trim() : ''
  if (!word || !gloss) return null
  if (language === 'zh' && !/[\u4e00-\u9fff]/.test(word)) return null
  if (language !== 'zh' && !/[a-zA-Z]/.test(word)) return null
  return {
    word: language === 'zh' ? word.replace(/\s+/g, '') : word.toLowerCase(),
    gloss: gloss.slice(0, 200),
    phonetic: typeof row.phonetic === 'string' && row.phonetic.trim() ? row.phonetic.trim().slice(0, 80) : null,
    part_of_speech: typeof row.part_of_speech === 'string' && row.part_of_speech.trim()
      ? row.part_of_speech.trim().slice(0, 40)
      : null,
    pinyin: typeof row.pinyin === 'string' && row.pinyin.trim() ? row.pinyin.trim().slice(0, 80) : null,
  }
}

export function createResolveListEntries(deps) {
  const { billableChatCreate } = deps
  return async function resolveListEntries({ text, language, userId }) {
    const source = String(text || '').trim().slice(0, 2000)
    if (!source) return []
    const target = language === 'zh' ? 'simplified Chinese headwords' : 'English headwords'
    const paid = await billableChatCreate(userId, crypto.randomUUID(), {
      messages: [
        {
          role: 'system',
          content: [
            `Turn learner input into ${target} for a vocabulary list.`,
            'Input may be the target word, a Russian gloss, a comma list, or a short paragraph.',
            'Return JSON only: {"items":[{"word":"","gloss":"","phonetic":"","part_of_speech":"","pinyin":""}]}',
            'word is the headword in the learning language. gloss is Russian.',
            'phonetic is IPA for English, empty for Chinese. pinyin only for Chinese.',
            'part_of_speech in Russian (существительное, глагол, прилагательное).',
            'At most 15 items. Skip names, numbers, and junk. Do not invent extra words.',
          ].join(' '),
        },
        { role: 'user', content: source },
      ],
      max_tokens: 700,
      temperature: 0,
      metadata: { vocabulary_list_resolve: true },
    })
    if (!paid?.ok) {
      const err = new Error(paid?.error || 'Недостаточно средств для подсказки ИИ')
      err.status = paid?.status || 402
      throw err
    }
    const parsed = parseJsonObject(paid.result?.text)
    const rows = Array.isArray(parsed?.items) ? parsed.items : []
    const seen = new Set()
    const items = []
    for (const row of rows) {
      const entry = cleanEntry(row, language)
      if (!entry || seen.has(entry.word)) continue
      seen.add(entry.word)
      items.push(entry)
      if (items.length >= 15) break
    }
    return items
  }
}
