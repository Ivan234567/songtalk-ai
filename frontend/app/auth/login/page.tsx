'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { logSecurityEvent } from '@/lib/securityEvents'
import styles from '../auth.module.css'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const translateError = (errorMessage: string): string => {
    const errorMsg = errorMessage.toLowerCase()

    if (errorMsg.includes('invalid login credentials') ||
      errorMsg.includes('invalid credentials') ||
      errorMsg.includes('incorrect email') ||
      errorMsg.includes('incorrect password')) {
      return 'Неверный email или пароль. Проверьте введенные данные.'
    }
    if (errorMsg.includes('email not confirmed')) {
      return 'Email не подтвержден. Проверьте почту и подтвердите регистрацию.'
    }
    if (errorMsg.includes('user not found')) {
      return 'Пользователь с таким email не найден. Проверьте email или зарегистрируйтесь.'
    }
    if (errorMsg.includes('too many requests')) {
      return 'Слишком много попыток входа. Попробуйте позже.'
    }
    return errorMessage
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw new Error(translateError(error.message))
      await logSecurityEvent('login', { method: 'password' })
      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка входа')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.authPage}>
      <div className={styles.authCard}>
        <div className={styles.authAccentLine} />

        <div className={styles.authHeader}>
          <h1 className={styles.authTitle}>Добро пожаловать</h1>
          <p className={styles.authSubtitle}>
            Войдите в свой аккаунт
            <span className={styles.authSubline} />
          </p>
        </div>

        {error && (
          <div className={styles.authError} role="alert">
            <span className={styles.authErrorIcon} aria-hidden>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form className={styles.authForm} onSubmit={handleLogin}>
          <div className={styles.authField}>
            <label className={styles.authLabel} htmlFor="login-email">
              Email
            </label>
            <div className={`${styles.inputWrap} ${email ? styles.hasValue : ''}`}>
              <span className={styles.authInputIcon} aria-hidden>✉️</span>
              <input
                id="login-email"
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

          <div className={`${styles.authField} ${styles.authFieldLast}`}>
            <label className={styles.authLabel} htmlFor="login-password">
              Пароль
            </label>
            <div className={`${styles.inputWrap} ${password ? styles.hasValue : ''}`}>
              <span className={styles.authInputIcon} aria-hidden>🔒</span>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (error) setError(null)
                }}
                required
                placeholder="••••••••"
                autoComplete="current-password"
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
            disabled={loading || !email.trim() || !password.trim()}
            className={styles.authBtnPrimary}
          >
            {loading ? (
              <>
                <span className={styles.authBtnSpinner} aria-hidden />
                Вход...
              </>
            ) : (
              'Войти'
            )}
          </button>
        </form>

        <div className={styles.authFooterLinkWrap}>
          <a href="/auth/reset" className={styles.authFooterLink}>
            Забыли пароль?
          </a>
        </div>

        <div className={styles.authDivider}>
          <p className={styles.authFooterText}>
            Нет аккаунта?{' '}
            <a href="/auth/register" className={styles.authFooterLinkPrimary}>
              Зарегистрироваться
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
