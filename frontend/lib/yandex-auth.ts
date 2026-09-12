export const YANDEX_CLIENT_ID =
  process.env.NEXT_PUBLIC_YANDEX_CLIENT_ID || '78b55a850b524bcfb4899f22062fa7b2'

export const YANDEX_REDIRECT_URI =
  process.env.NEXT_PUBLIC_YANDEX_REDIRECT_URI ||
  'https://speakeasy-voice.vercel.app/auth/yandex/callback'

const STATE_KEY = 'yandex_oauth_state'
const VERIFIER_KEY = 'yandex_oauth_verifier'

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomString(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

async function sha256Base64Url(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return base64Url(new Uint8Array(hash))
}

export async function startYandexAuth(): Promise<void> {
  const state = randomString(16)
  const verifier = randomString(32)
  const challenge = await sha256Base64Url(verifier)
  sessionStorage.setItem(STATE_KEY, state)
  sessionStorage.setItem(VERIFIER_KEY, verifier)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: YANDEX_CLIENT_ID,
    redirect_uri: YANDEX_REDIRECT_URI,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })

  window.location.assign(`https://oauth.yandex.ru/authorize?${params.toString()}`)
}

export function consumeYandexOAuthReturn(returnedState: string | null): {
  ok: boolean
  verifier: string | null
} {
  const expected = sessionStorage.getItem(STATE_KEY)
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  sessionStorage.removeItem(STATE_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)

  if (!returnedState || !expected || returnedState !== expected || !verifier) {
    return { ok: false, verifier: null }
  }
  return { ok: true, verifier }
}

export function getApiBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL || ''
  return url.endsWith('/') ? url.slice(0, -1) : url
}
