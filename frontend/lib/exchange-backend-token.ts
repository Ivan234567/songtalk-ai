import { storeBackendToken } from '@/lib/backend-jwt'
import { referralExchangeFields } from '@/lib/referral'

export async function exchangeSupabaseToken(supabaseToken: string): Promise<string | null> {
  const api = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '')
  if (!supabaseToken) return null
  const response = await fetch(`${api}/api/auth/exchange-supabase-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      supabase_token: supabaseToken,
      ...referralExchangeFields(),
    }),
  })
  if (!response.ok) return null
  const data = await response.json().catch(() => null)
  if (!data?.token || typeof data.token !== 'string') return null
  storeBackendToken(data.token)
  return data.token
}
