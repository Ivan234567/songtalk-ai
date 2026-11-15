const KEY = 'auth_next'

function isSafeNext(value: string | null): value is string {
  if (!value || value.length > 200) return false
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return false
  return value === '/' || value === '/dashboard' || value.startsWith('/partner') || value.startsWith('/admin')
}

export function clearAuthNext() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(KEY)
}

export function rememberAuthNext(path: string) {
  if (typeof window === 'undefined' || !isSafeNext(path)) return
  localStorage.setItem(KEY, path)
}

export function takeAuthNext(fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const value = localStorage.getItem(KEY)
  localStorage.removeItem(KEY)
  return isSafeNext(value) ? value : fallback
}
