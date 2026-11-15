'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { storeBackendToken } from '@/lib/backend-jwt'
import { partnerGet, type PartnerOverview } from '@/lib/partner'

export type AccountHome = 'loading' | 'guest' | 'user' | 'partner'

async function backendTokenForSession(access: string): Promise<string | null> {
  const api = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '')
  if (!api) return null
  const response = await fetch(`${api}/api/auth/exchange-supabase-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ supabase_token: access }),
  })
  if (!response.ok) return null
  const data = await response.json().catch(() => null)
  if (!data?.token || typeof data.token !== 'string') return null
  storeBackendToken(data.token)
  return data.token
}

export async function resolveAccountHome(accessToken?: string | null): Promise<Exclude<AccountHome, 'loading'>> {
  let access = accessToken
  if (access === undefined) {
    const { data } = await supabase.auth.getSession()
    access = data.session?.access_token ?? null
  }
  if (!access) return 'guest'
  const token = await backendTokenForSession(access)
  if (!token) return 'user'
  const overview = await partnerGet<PartnerOverview>('/api/partner/overview', token)
  return overview.ok ? 'partner' : 'user'
}

const listeners = new Set<(home: AccountHome) => void>()
let current: AccountHome = 'loading'
let generation = 0
let watching = false

function publish(home: AccountHome) {
  current = home
  listeners.forEach((listener) => listener(home))
}

function watchAccountHome() {
  if (watching || typeof window === 'undefined') return
  watching = true
  supabase.auth.onAuthStateChange((_event, session) => {
    const ticket = ++generation
    const access = session?.access_token ?? null
    resolveAccountHome(access)
      .then((value) => {
        if (ticket === generation) publish(value)
      })
      .catch(() => {
        if (ticket === generation) publish(access ? 'user' : 'guest')
      })
  })
}

export function useAccountHome(): AccountHome {
  const [home, setHome] = useState<AccountHome>(current)

  useEffect(() => {
    watchAccountHome()
    setHome(current)
    listeners.add(setHome)
    return () => {
      listeners.delete(setHome)
    }
  }, [])

  return home
}

export function cabinetPath(home: AccountHome): string {
  return home === 'partner' ? '/partner' : '/dashboard'
}

export function cabinetLabel(home: AccountHome): string {
  return home === 'partner' ? 'Партнёрский кабинет' : 'Перейти в дашборд'
}
