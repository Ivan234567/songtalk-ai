'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { exchangeSupabaseToken } from '@/lib/exchange-backend-token'
import { logSecurityEvent } from '@/lib/securityEvents'
import { takeAuthNext } from '@/lib/auth-next'

export default function AuthCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [message, setMessage] = useState('Finishing sign-in…')

  useEffect(() => {
    const code = searchParams.get('code')

    async function run() {
      try {
        // PKCE code flow (OAuth, email confirmations)
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
        } else {
          // Implicit/hash flows are handled by supabase-js автоматически, просто убеждаемся, что сессия есть
          await supabase.auth.getSession()
        }

        // После того как Supabase создал сессию, меняем Supabase токен на backend JWT
        try {
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
          if (sessionError) throw sessionError

          const supabaseToken = sessionData.session?.access_token
          if (supabaseToken) {
            const exchanged = await exchangeSupabaseToken(supabaseToken)
            if (!exchanged) {
              console.error('[auth/callback] Failed to exchange Supabase token for backend JWT')
            }
          }
        } catch (exchangeError) {
          console.error('[auth/callback] Backend JWT exchange error', exchangeError)
          // Не прерываем основной поток авторизации
        }

        await logSecurityEvent('login', { method: code ? 'callback_code' : 'session_restore' })

        setMessage('Success. Redirecting…')
        router.push(takeAuthNext('/'))
        router.refresh()
      } catch (e: any) {
        setMessage(e?.message || 'Auth callback failed')
      }
    }

    run()
  }, [router, searchParams])

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ maxWidth: 520, textAlign: 'center' }}>
        <h1 style={{ marginBottom: 12 }}>Auth</h1>
        <p style={{ margin: 0, color: '#374151' }}>{message}</p>
        <p style={{ marginTop: 16 }}>
          <a href="/" style={{ color: '#667eea', textDecoration: 'none' }}>Go home</a>
        </p>
      </div>
    </main>
  )
}

