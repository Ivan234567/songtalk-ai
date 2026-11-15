const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/
const ANON_RE = /^[A-Za-z0-9_-]{8,128}$/

export function normalizeReferralCode(value) {
  if (typeof value !== 'string') return null
  const code = value.trim()
  if (!CODE_RE.test(code)) return null
  return code.toUpperCase()
}

export function parseOptionalPromoCode(value) {
  if (value == null) return null
  if (typeof value !== 'string') return undefined
  if (!value.trim()) return null
  const code = normalizeReferralCode(value)
  return code === null ? undefined : code
}

export function normalizeAnonymousId(value) {
  if (typeof value !== 'string') return null
  const id = value.trim()
  if (!ANON_RE.test(id)) return null
  return id
}

export function clipOptional(value, max) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return null
  return text.slice(0, max)
}

export function createClickLimiter({ limit = 20, windowMs = 60_000 } = {}) {
  const buckets = new Map()
  return function allow(key) {
    const now = Date.now()
    const id = key || 'unknown'
    const recent = (buckets.get(id) || []).filter((ts) => now - ts < windowMs)
    if (recent.length >= limit) {
      buckets.set(id, recent)
      return false
    }
    recent.push(now)
    buckets.set(id, recent)
    return true
  }
}
