'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import styles from '../auth.module.css'

export default function UpdatePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    // In recovery/confirm flows, Supabase may set session from URL on load.
    supabase.auth.getSession().finally(() => setReady(true))
  }, [])

  const translateError = (errorMessage: string): string => {
    const errorMsg = errorMessage.toLowerCase()
    if (errorMsg.includes('same password')) {
      return 'Новый пароль должен отличаться от текущего.'
    }
    if (errorMsg.includes('password should be at least')) {
      return 'Пароль должен содержать минимум 6 символов.'
    }
    if (errorMsg.includes('expired')) {
      return 'Ссылка для восстановления устарела. Запросите сброс пароля заново.'
    }
    return errorMessage
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setSuccess('Пароль обновлён. Теперь можно войти.')
      setPassword('')
      setTimeout(() => {
        router.push('/auth/login')
        router.refresh()
      }, 800)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Не удалось обновить пароль'
      setError(translateError(message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.authPage}>
      <div className={styles.authCard}>
        <div className={styles.authAccentLine} />
        <div className={styles.authHeader}>
          <h1 className={styles.authTitle}>Новый пароль</h1>
          <p className={styles.authSubtitle}>
            Установите новый пароль для входа
            <span className={styles.authSubline} />
          </p>
        </div>

        {!ready && (
          <div className={styles.authSuccess} role="status">
            <span aria-hidden>⏳</span>
            <span>Проверяем ссылку для восстановления…</span>
          </div>
        )}

        {error && (
          <div className={styles.authError} role="alert">
            <span className={styles.authErrorIcon} aria-hidden>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className={styles.authSuccess} role="status">
            <span aria-hidden>✓</span>
            <span>{success}</span>
          </div>
        )}

        {ready && (
          <form className={styles.authForm} onSubmit={handleUpdate}>
            <div className={`${styles.authField} ${styles.authFieldLast}`}>
              <label className={styles.authLabel} htmlFor="update-password">
                Новый пароль
                <span className={styles.authLabelHint}>(мин. 6 символов)</span>
              </label>
              <div className={`${styles.inputWrap} ${password ? styles.hasValue : ''}`}>
                <span className={styles.authInputIcon} aria-hidden>🔒</span>
                <input
                  id="update-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (error) setError(null)
                  }}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className={`${styles.authInput} ${styles.authInputPassword}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={styles.authToggle}
                  title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !password.trim() || password.length < 6}
              className={styles.authBtnPrimary}
            >
              {loading ? (
                <>
                  <span className={styles.authBtnSpinner} aria-hidden />
                  Сохранение...
                </>
              ) : (
                'Обновить пароль'
              )}
            </button>
          </form>
        )}

        <div className={styles.authDivider}>
          <p className={styles.authFooterText}>
            <a href="/auth/login" className={styles.authFooterLinkPrimary}>
              ← Вернуться ко входу
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

