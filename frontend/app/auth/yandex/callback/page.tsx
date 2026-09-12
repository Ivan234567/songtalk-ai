'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { storeBackendToken } from '@/lib/backend-jwt'
import { consumeYandexOAuthReturn, getApiBaseUrl } from '@/lib/yandex-auth'
import { logSecurityEvent } from '@/lib/securityEvents'
import styles from '../../auth.module.css'

function YandexCallbackFallback() {
  return (
    <div className={styles.authPage}>
      <div className={styles.authCard}>
        <div className={styles.authAccentLine} />
        <div className={styles.authHeader}>
          <h1 className={styles.authTitle}>Яндекс ID</h1>
          <p className={styles.authSubtitle}>
            Входим через Яндекс…
            <span className={styles.authSubline} />
          </p>
        </div>
      </div>
    </div>
  )
}

function YandexCallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [message, setMessage] = useState('Входим через Яндекс…')
  const [failed, setFailed] = useState(false)
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const yandexError = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')
    const code = searchParams.get('code')
    const state = searchParams.get('state')

    async function run() {
      if (yandexError) {
        setFailed(true)
        setMessage(
          yandexError === 'access_denied'
            ? 'Вход через Яндекс отменён.'
            : errorDescription || 'Яндекс не подтвердил вход.',
        )
        return
      }

      if (!code) {
        setFailed(true)
        setMessage('Нет кода авторизации. Начните вход заново.')
        return
      }

      const consumed = consumeYandexOAuthReturn(state)
      if (!consumed.ok || !consumed.verifier) {
        setFailed(true)
        setMessage('Сессия входа устарела. Вернитесь на страницу входа и попробуйте снова.')
        return
      }

      try {
        const resp = await fetch(`${getApiBaseUrl()}/api/auth/yandex`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            code_verifier: consumed.verifier,
          }),
        })
        const payload = await resp.json().catch(() => null)
        if (!resp.ok || !payload?.hashed_token) {
          throw new Error(payload?.error || 'Не удалось войти через Яндекс')
        }

        const otpType =
          payload.verification_type === 'signup' ? 'email' : payload.verification_type || 'magiclink'
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: payload.hashed_token,
          type: otpType,
        })
        if (otpError) throw otpError

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError

        const supabaseToken = sessionData.session?.access_token
        if (supabaseToken) {
          try {
            const exchangeResp = await fetch(`${getApiBaseUrl()}/api/auth/exchange-supabase-token`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ supabase_token: supabaseToken }),
            })
            if (exchangeResp.ok) {
              const exchangeData = await exchangeResp.json().catch(() => null)
              if (exchangeData?.token) storeBackendToken(exchangeData.token)
            }
          } catch (exchangeError) {
            console.error('[auth/yandex] backend JWT exchange failed', exchangeError)
          }
        }

        await logSecurityEvent('login', { method: 'yandex' })
        setMessage('Готово. Переходим в кабинет…')
        router.push('/dashboard')
        router.refresh()
      } catch (err: unknown) {
        setFailed(true)
        setMessage(err instanceof Error ? err.message : 'Не удалось войти через Яндекс')
      }
    }

    run()
  }, [router, searchParams])

  return (
    <div className={styles.authPage}>
      <div className={styles.authCard}>
        <div className={styles.authAccentLine} />
        <div className={styles.authHeader}>
          <h1 className={styles.authTitle}>Яндекс ID</h1>
          <p className={styles.authSubtitle}>
            {message}
            <span className={styles.authSubline} />
          </p>
        </div>
        {failed && (
          <p className={styles.authFooterText}>
            <a href="/auth/login" className={styles.authFooterLinkPrimary}>
              Вернуться ко входу
            </a>
          </p>
        )}
      </div>
    </div>
  )
}

export default function YandexCallbackPage() {
  return (
    <Suspense fallback={<YandexCallbackFallback />}>
      <YandexCallbackInner />
    </Suspense>
  )
}
