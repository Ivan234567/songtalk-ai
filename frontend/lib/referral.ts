const ANON_KEY = 'referral_anonymous_id'
const CODE_KEY = 'referral_code'
const SUBMITTED_KEY = 'referral_submitted_code'
const RECORDED_KEY = 'referral_click_code'
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/
const ANON_RE = /^[A-Za-z0-9_-]{8,128}$/

const inflight = new Map<string, Promise<'recorded' | 'rejected' | 'failed'>>()

function apiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '')
}

export function captureReferralCode(value: string | null | undefined): string | null {
  if (typeof window === 'undefined' || !value) return null
  const code = value.trim()
  if (!CODE_RE.test(code)) return null
  const normalized = code.toUpperCase()
  window.localStorage.setItem(CODE_KEY, normalized)
  return normalized
}

function anonymousId(): string | null {
  if (typeof window === 'undefined') return null
  const existing = window.localStorage.getItem(ANON_KEY)
  if (existing && ANON_RE.test(existing)) return existing
  const created = window.crypto.randomUUID()
  window.localStorage.setItem(ANON_KEY, created)
  return created
}

export function storedReferralPrefill(): string {
  if (typeof window === 'undefined') return ''
  const value = window.localStorage.getItem(CODE_KEY) || ''
  return CODE_RE.test(value) ? value.toUpperCase() : ''
}

export function clearSubmittedReferral(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(SUBMITTED_KEY)
}

export function referralExchangeFields(): { anonymous_id?: string; referral_code?: string } {
  if (typeof window === 'undefined') return {}
  const code = window.localStorage.getItem(SUBMITTED_KEY) || ''
  const id = window.localStorage.getItem(ANON_KEY) || ''
  if (!CODE_RE.test(code) || !ANON_RE.test(id)) return {}
  return { anonymous_id: id, referral_code: code.toUpperCase() }
}

export async function commitRegistrationPromo(raw: string): Promise<'empty' | 'recorded' | 'rejected' | 'invalid' | 'failed'> {
  const trimmed = raw.trim()
  if (!trimmed) {
    clearSubmittedReferral()
    return 'empty'
  }
  if (!CODE_RE.test(trimmed)) return 'invalid'
  const result = await recordReferralClick(trimmed)
  if (result !== 'recorded') return result
  window.localStorage.setItem(SUBMITTED_KEY, trimmed.toUpperCase())
  return 'recorded'
}

export function recordReferralClick(code: string): Promise<'recorded' | 'rejected' | 'failed'> {
  if (typeof window === 'undefined') return Promise.resolve('failed')
  const normalized = captureReferralCode(code)
  if (!normalized) return Promise.resolve('rejected')
  if (window.localStorage.getItem(RECORDED_KEY) === normalized) return Promise.resolve('recorded')
  const pending = inflight.get(normalized)
  if (pending) return pending

  const job = (async () => {
    const anonymous_id = anonymousId()
    const api = apiBase()
    if (!anonymous_id) return 'failed' as const
    const campaign = new URLSearchParams(window.location.search).get('campaign')
    const response = await fetch(`${api}/api/referral/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        referral_code: normalized,
        anonymous_id,
        landing_path: window.location.pathname.slice(0, 512),
        campaign: campaign ? campaign.slice(0, 64) : undefined,
        referrer: document.referrer ? document.referrer.slice(0, 512) : undefined,
      }),
    })
    if (response.status === 404 || response.status === 403) return 'rejected' as const
    if (!response.ok) return 'failed' as const
    window.localStorage.setItem(RECORDED_KEY, normalized)
    return 'recorded' as const
  })().finally(() => {
    inflight.delete(normalized)
  })

  inflight.set(normalized, job)
  return job
}

export async function ensureReferralClickRecorded(): Promise<void> {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  const pathCode = window.location.pathname.match(/^\/r\/([^/]+)/)
  const raw = params.get('ref')
    || (pathCode ? decodeURIComponent(pathCode[1]) : null)
    || window.localStorage.getItem(CODE_KEY)
  if (!raw) return
  await recordReferralClick(raw)
}
