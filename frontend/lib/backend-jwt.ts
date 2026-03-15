/**
 * Helpers for storing and validating backend JWT in browser storage.
 */

const BACKEND_JWT_STORAGE_KEY = 'backend_jwt';

type JwtPayload = {
  exp?: number;
};

function parseJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payloadBase64Url = parts[1];
    const payloadBase64 = payloadBase64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = payloadBase64.padEnd(payloadBase64.length + ((4 - (payloadBase64.length % 4)) % 4), '=');
    const payloadJson = atob(padded);
    return JSON.parse(payloadJson) as JwtPayload;
  } catch {
    return null;
  }
}

export function isBackendTokenExpired(token: string, skewSeconds: number = 30): boolean {
  const payload = parseJwtPayload(token);
  if (!payload?.exp) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return payload.exp <= nowSeconds + skewSeconds;
}

export function getStoredBackendToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = window.localStorage.getItem(BACKEND_JWT_STORAGE_KEY);
  if (!token) return null;
  if (isBackendTokenExpired(token)) {
    window.localStorage.removeItem(BACKEND_JWT_STORAGE_KEY);
    return null;
  }
  return token;
}

export function storeBackendToken(token: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(BACKEND_JWT_STORAGE_KEY, token);
}

export function clearBackendToken(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(BACKEND_JWT_STORAGE_KEY);
}
