'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { exchangeSupabaseToken } from '@/lib/exchange-backend-token'
import { logSecurityEvent } from '@/lib/securityEvents'
import { rememberAuthNext } from '@/lib/auth-next'
import styles from './admin.module.css'

type Mode = 'login' | 'register'

function translateError(errorMessage: string) {
  const errorMsg = errorMessage.toLowerCase()
  if (
    errorMsg.includes('invalid login credentials')
    || errorMsg.includes('invalid credentials')
    || errorMsg.includes('incorrect email')
    || errorMsg.includes('incorrect password')
  ) {
    return 'Неверный email или пароль. Проверьте введенные данные.'
  }
  if (errorMsg.includes('email not confirmed')) {
    return 'Email не подтвержден. Проверьте почту и подтвердите регистрацию.'
  }
  if (errorMsg.includes('too many requests')) return 'Слишком много попыток входа. Попробуйте позже.'
  return errorMessage
}

function validatePassword(pass: string) {
  if (!pass || pass.length < 6) return 'Пароль должен содержать минимум 6 символов'
  if (!/[a-zA-Zа-яА-ЯёЁ]/.test(pass)) return 'Пароль должен содержать хотя бы одну букву'
  if (!/[0-9]/.test(pass)) return 'Пароль должен содержать хотя бы одну цифру'
  return null
}

export function AdminGate({
  theme,
  onTheme,
  children,
}: {
  theme: 'dark' | 'light'
  onTheme: (theme: 'dark' | 'light') => void
  children: ReactNode
}) {
  return (
    <div className={styles.app} data-theme={theme === 'light' ? 'light' : undefined}>
      <div className={styles.gate}>
        <div style={{ textAlign: 'center' }}>
          <div className={styles.brand} style={{ fontSize: 22 }}>Speakeasy</div>
          <small className={styles.quiet}>Администрирование</small>
        </div>
        <div className={`${styles.card} ${styles.cardHi} ${styles.gateCard}`}>{children}</div>
        <div className={styles.seg} role="group" aria-label="Тема">
          <button type="button" aria-pressed={theme === 'dark'} onClick={() => onTheme('dark')}>Тёмная</button>
          <button type="button" aria-pressed={theme === 'light'} onClick={() => onTheme('light')}>Светлая</button>
        </div>
      </div>
    </div>
  )
}

export function AdminSignIn({ onAuthenticated }: { onAuthenticated: (token: string) => void }) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function finish(accessToken: string | undefined) {
    const token = accessToken ? await exchangeSupabaseToken(accessToken).catch(() => null) : null
    if (!token) {
      setError('Вход выполнен, но кабинет не открылся. Попробуйте ещё раз.')
      return
    }
    onAuthenticated(token)
  }

  async function onLogin(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) throw new Error(translateError(signInError.message))
      await logSecurityEvent('login', { method: 'password' })
      await finish(data.session?.access_token)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка входа')
    } finally {
      setLoading(false)
    }
  }

  async function onRegister(event: FormEvent) {
    event.preventDefault()
    setError('')
    setSuccess('')
    const passwordError = validatePassword(password)
    if (passwordError) {
      setError(passwordError)
      return
    }
    setLoading(true)
    try {
      rememberAuthNext('/admin')
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      if (signUpError) {
        const message = signUpError.message.toLowerCase()
        if (message.includes('already')) {
          setError('Пользователь с таким email уже зарегистрирован. Войдите в аккаунт или используйте другой email.')
          return
        }
        throw signUpError
      }
      if (data.session?.access_token) {
        await finish(data.session.access_token)
        return
      }
      setSuccess('Проверьте почту: мы отправили письмо для подтверждения email.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка регистрации')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className={styles.stack} onSubmit={mode === 'login' ? onLogin : onRegister}>
      <h2>{mode === 'login' ? 'Вход в администрирование' : 'Создать аккаунт'}</h2>
      <label className={styles.field}>
        Email
        <input
          className={styles.input}
          type="email"
          value={email}
          autoComplete="username"
          placeholder="name@example.com"
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label className={styles.field}>
        Пароль
        <input
          className={styles.input}
          type="password"
          value={password}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          placeholder="••••••••"
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      {mode === 'register' && (
        <p className={styles.hint} style={{ margin: 0 }}>
          Регистрация не делает человека администратором и не выдаёт партнёрскую ссылку.
        </p>
      )}
      {error && <div className={styles.error} role="alert">{error}</div>}
      {success && <div className={styles.success} role="status">{success}</div>}
      <button className={`${styles.btn} ${styles.primary}`} type="submit" disabled={loading || !email.trim() || !password.trim()}>
        {mode === 'login' ? 'Войти' : 'Создать аккаунт'}
      </button>
      <div style={{ justifySelf: 'center' }}>
        <div className={styles.seg} role="group" aria-label="Форма">
          <button
            type="button"
            aria-pressed={mode === 'login'}
            onClick={() => { setMode('login'); setError(''); setSuccess('') }}
          >
            Войти
          </button>
          <button
            type="button"
            aria-pressed={mode === 'register'}
            onClick={() => { setMode('register'); setError(''); setSuccess('') }}
          >
            Нет аккаунта
          </button>
        </div>
      </div>
    </form>
  )
}
