'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import styles from '../auth.module.css'

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const translateError = (errorMessage: string): string => {
    const errorMsg = errorMessage.toLowerCase()
    if (errorMsg.includes('user not found') || errorMsg.includes('email not found')) {
      return 'Пользователь с таким email не найден'
    }
    if (errorMsg.includes('too many requests')) {
      return 'Слишком много запросов. Попробуйте позже.'
    }
    return errorMessage
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const redirectTo = `${window.location.origin}/auth/update-password`
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      if (error) throw new Error(translateError(error.message))
      setSuccess('Если такой email существует — мы отправили письмо для сброса пароля.')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось отправить письмо')
    } finally {
      setLoading(false)
    }
  }

  const hasEmailError = error?.includes('не найден') ?? false

  return (
    <div className={styles.authPage}>
      <div className={styles.authCard}>
        <div className={styles.authAccentLine} />
        <div className={styles.authHeader}>
          <h1 className={styles.authTitle}>Сброс пароля</h1>
          <p className={styles.authSubtitle}>
            Введите email для восстановления
            <span className={styles.authSubline} />
          </p>
        </div>

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

        <form className={styles.authForm} onSubmit={handleReset}>
          <div className={`${styles.authField} ${styles.authFieldLast}`}>
            <label className={styles.authLabel} htmlFor="reset-email">
              Email
            </label>
            <div className={`${styles.inputWrap} ${email ? styles.hasValue : ''} ${hasEmailError ? styles.hasError : ''}`}>
              <span className={styles.authInputIcon} aria-hidden>✉️</span>
              <input
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (error) setError(null)
                }}
                required
                placeholder="email@example.com"
                autoComplete="email"
                className={styles.authInput}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !email.trim()}
            className={styles.authBtnPrimary}
          >
            {loading ? (
              <>
                <span className={styles.authBtnSpinner} aria-hidden />
                Отправка...
              </>
            ) : (
              'Отправить письмо'
            )}
          </button>
        </form>

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
