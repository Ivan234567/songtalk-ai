/**
 * Умный отбор ≤5 слов сессии: SRS (due→learning→new) + fit к сцене + разнообразие.
 */

const STATUS_BASE = {
  due: 100,
  learning: 70,
  new: 45,
  mastered: 10,
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[\s,.;:!?/()«»"'`_+={}\[\]|\\<>~@#$%^&*-]+/)
    .filter((token) => token.length >= 3)
}

/** Насколько gloss/headword стыкуется с текстом сцены/дебата. */
export function scoreSceneFit(candidate, sceneText = '') {
  const hay = String(sceneText || '').toLowerCase()
  if (!hay.trim()) return 0
  const gloss = String(candidate?.glossRu || candidate?.gloss_ru || '').toLowerCase()
  const head = String(candidate?.headword || '').toLowerCase()
  let score = 0
  for (const token of tokenize(gloss)) {
    if (hay.includes(token)) score += 3
  }
  if (head && hay.includes(head)) score += 2
  return score
}

/** Минимальный fit, чтобы слово прошло в пятёрку при наличии сцены (D6). */
export const SCENE_FIT_FLOOR = 1

/**
 * @param {Array<{ senseId: string, headword: string, glossRu: string, status: string }>} candidates
 * @param {{ limit?: number, sceneText?: string, excludeSenseIds?: Set<string>|string[], rng?: () => number, fitFloor?: number }} [options]
 */
export function pickSessionCandidates(candidates, options = {}) {
  const limit = Math.max(1, Math.min(5, Number(options.limit) || 5))
  const sceneText = options.sceneText || ''
  const hasScene = Boolean(String(sceneText).trim())
  const fitFloor = Number.isFinite(Number(options.fitFloor)) ? Number(options.fitFloor) : SCENE_FIT_FLOOR
  const exclude = options.excludeSenseIds instanceof Set
    ? options.excludeSenseIds
    : new Set(Array.isArray(options.excludeSenseIds) ? options.excludeSenseIds : [])
  const rng = typeof options.rng === 'function' ? options.rng : Math.random

  const pool = []
  for (const raw of candidates || []) {
    if (!raw?.senseId || exclude.has(raw.senseId)) continue
    const status = STATUS_BASE[raw.status] != null ? raw.status : 'new'
    const fit = scoreSceneFit(raw, sceneText)
    const jitter = rng() * 3
    pool.push({
      senseId: raw.senseId,
      headword: raw.headword,
      glossRu: raw.glossRu,
      status,
      fit,
      score: (STATUS_BASE[status] ?? 0) + fit * 4 + jitter,
      pickReason: fit >= fitFloor
        ? (status === 'due' ? 'due_fit' : status === 'learning' ? 'learning_fit' : 'fit')
        : status === 'due'
          ? 'due'
          : status === 'learning'
            ? 'learning'
            : status === 'new'
              ? 'new'
              : 'mastered',
    })
  }

  pool.sort((a, b) => b.score - a.score || a.headword.localeCompare(b.headword, 'en'))

  // D6: при тексте сцены сначала только слова с fit ≥ порога; due без fit не вытесняет сцену.
  const withFit = hasScene ? pool.filter((item) => item.fit >= fitFloor) : pool
  const ranked = withFit.length > 0 ? withFit : pool
  const weakSceneFit = hasScene && withFit.length === 0 && pool.length > 0

  // Разнообразие: не больше 2 mastered, если есть другие кандидаты.
  const picked = []
  let masteredTaken = 0
  for (const item of ranked) {
    if (picked.length >= limit) break
    if (item.status === 'mastered' && masteredTaken >= 2) {
      const remainingNonMastered = ranked.slice(ranked.indexOf(item) + 1)
        .some((row) => row.status !== 'mastered')
      if (remainingNonMastered) continue
    }
    if (item.status === 'mastered') masteredTaken += 1
    picked.push(item)
  }

  if (picked.length < limit) {
    const taken = new Set(picked.map((item) => item.senseId))
    for (const item of ranked) {
      if (picked.length >= limit) break
      if (taken.has(item.senseId)) continue
      picked.push(item)
    }
  }

  return {
    items: picked.slice(0, limit),
    reason: buildSessionPickReason(picked.slice(0, limit), { weakSceneFit }),
    weak_scene_fit: weakSceneFit,
  }
}

export function buildSessionPickReason(items, options = {}) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) return ''
  if (options.weakSceneFit) {
    return 'К сцене слабо стыкуются — взяли по повторению; due без fit лучше в карточках'
  }
  const due = list.filter((item) => item.status === 'due' || item.pickReason === 'due' || item.pickReason === 'due_fit').length
  const learning = list.filter((item) => item.status === 'learning' || String(item.pickReason || '').includes('learning')).length
  const fit = list.filter((item) => String(item.pickReason || '').includes('fit')).length
  const parts = []
  if (due) parts.push(due === 1 ? '1 на повторение' : `${due} на повторение`)
  if (learning) parts.push(learning === 1 ? '1 в изучении' : `${learning} в изучении`)
  if (fit) parts.push('ближе к сцене')
  if (!parts.length) {
    const neu = list.filter((item) => item.status === 'new').length
    if (neu) return neu === list.length ? 'Новые слова из списка' : 'Смесь новых и знакомых'
    return 'Слова из списка под сессию'
  }
  return `Подобрали: ${parts.join(', ')}`
}

/** Вехи усвоения sense по SRS + истории сессий. */
export function classifySenseMilestone({ status, producedCount = 0, sessionAppearances = 0 }) {
  if (producedCount >= 2 && (status === 'mastered' || status === 'learning' || status === 'due')) {
    return 'transferred'
  }
  if (status === 'mastered') return 'stable'
  if (producedCount >= 1) return 'produced'
  if (sessionAppearances >= 1) return 'exposed'
  return 'new'
}

export const MILESTONE_LABELS = {
  new: 'Новое',
  exposed: 'Встретил',
  produced: 'Сказал',
  stable: 'Устойчиво',
  transferred: 'В речи',
}
