'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { exchangeSupabaseToken } from '@/lib/exchange-backend-token'
import { commitRegistrationPromo, storedReferralPrefill } from '@/lib/referral'
import { logSecurityEvent } from '@/lib/securityEvents'
import { clearAuthNext, rememberAuthNext } from '@/lib/auth-next'
import YandexAuthButton from '@/components/auth/YandexAuthButton'
import styles from '../../app/auth/auth.module.css'

type Mode = 'login' | 'register'

type AccountAuthProps = {
  mode?: Mode
  nextPath: string
  rememberNext?: boolean
  onAuthenticated?: (token: string) => void
  loginTitle?: string
  loginSubtitle?: string
  registerTitle?: string
  registerSubtitle?: string
  switchMode?: 'link' | 'toggle'
  showYandex?: boolean
  showPromo?: boolean
}

export default function AccountAuth({
  mode: initialMode = 'login',
  nextPath,
  rememberNext = false,
  onAuthenticated,
  loginTitle = 'Добро пожаловать',
  loginSubtitle = 'Войдите в свой аккаунт',
  registerTitle = 'Создать аккаунт',
  registerSubtitle = 'Начните использование сервиса',
  switchMode = 'link',
  showYandex = true,
  showPromo = true,
}: AccountAuthProps) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>(initialMode)

  useEffect(() => {
    if (!rememberNext) clearAuthNext()
  }, [rememberNext])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checkingEmail, setCheckingEmail] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [promo, setPromo] = useState('')
  const [promoError, setPromoError] = useState<string | null>(null)

  useEffect(() => {
    if (!showPromo) return
    setPromo(storedReferralPrefill())
  }, [showPromo])

  const translateError = (errorMessage: string): string => {
    const errorMsg = errorMessage.toLowerCase()
    if (
      errorMsg.includes('invalid login credentials') ||
      errorMsg.includes('invalid credentials') ||
      errorMsg.includes('incorrect email') ||
      errorMsg.includes('incorrect password')
    ) {
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

  const finish = async (accessToken: string | undefined) => {
    let token: string | null = null
    if (accessToken) {
      try {
        token = await exchangeSupabaseToken(accessToken)
      } catch (exchangeError) {
        console.error('[auth] backend JWT exchange failed', exchangeError)
      }
    }
    if (onAuthenticated) {
      if (!token) {
        setError('Вход выполнен, но кабинет не открылся. Попробуйте ещё раз.')
        return
      }
      onAuthenticated(token)
      return
    }
    router.push(nextPath)
    router.refresh()
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
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

  const normalizeEmail = (value: string): string => value.trim().toLowerCase()

  const validatePassword = (pass: string): string | null => {
    if (!pass || pass.length < 6) return 'Пароль должен содержать минимум 6 символов'
    if (!/[a-zA-Zа-яА-ЯёЁ]/.test(pass)) return 'Пароль должен содержать хотя бы одну букву'
    if (!/[0-9]/.test(pass)) return 'Пароль должен содержать хотя бы одну цифру'
    return null
  }

  const isPasswordValid = (pass: string): boolean => validatePassword(pass) === null

  const getPasswordStrength = (pass: string): { strength: number; label: string; color: string } => {
    if (!pass || pass.length === 0) return { strength: 0, label: '', color: 'var(--auth-neutral)' }
    let strength = 0
    const hasLetters = /[a-zA-Zа-яА-ЯёЁ]/.test(pass)
    const hasNumbers = /[0-9]/.test(pass)
    const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(pass)
    if (pass.length >= 6) strength++
    if (hasLetters) strength++
    if (hasNumbers) strength++
    if (hasSpecialChars) strength++
    if (pass.length >= 10) strength++
    if (hasLetters && hasNumbers && pass.length >= 8) strength++
    if (strength <= 2) return { strength: 1, label: 'Слабый', color: 'var(--auth-strength-weak)' }
    if (strength <= 4) return { strength: 2, label: 'Средний', color: 'var(--auth-strength-medium)' }
    return { strength: 3, label: 'Сильный', color: 'var(--auth-strength-strong)' }
  }

  const passwordStrength = getPasswordStrength(password)
  const passwordRequirements = {
    minLength: password.length >= 6,
    hasLetters: /[a-zA-Zа-яА-ЯёЁ]/.test(password),
    hasNumbers: /[0-9]/.test(password),
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setEmailError(null)
    const passwordValidationError = validatePassword(password)
    if (passwordValidationError) {
      setPasswordError(passwordValidationError)
      setError(passwordValidationError)
      return
    }
    setLoading(true)
    try {
      const promoResult = await commitRegistrationPromo(showPromo ? promo : '')
      if (promoResult === 'invalid') {
        const message = 'Промокод: латиница, цифры, дефис или подчёркивание, от 2 до 32 символов.'
        setPromoError(message)
        setError(message)
        return
      }
      if (promoResult === 'rejected') {
        const message = 'Такой промокод не найден или партнёр сейчас не принимает приглашения.'
        setPromoError(message)
        setError(message)
        return
      }
      if (promoResult === 'failed') {
        setError('Промокод не удалось проверить. Регистрация не начата.')
        return
      }
      if (rememberNext) rememberAuthNext(nextPath)
      const emailRedirectTo = `${window.location.origin}/auth/callback`
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizeEmail(email),
        password,
        options: { emailRedirectTo },
      })
      if (signUpError) {
        const errorMsg = signUpError.message.toLowerCase()
        const isEmailExists =
          errorMsg.includes('already registered') ||
          errorMsg.includes('already exists') ||
          errorMsg.includes('user already') ||
          errorMsg.includes('email already') ||
          errorMsg.includes('already been registered') ||
          errorMsg.includes('user is already registered')
        if (isEmailExists) {
          const msg = 'Пользователь с таким email уже зарегистрирован. Войдите в аккаунт или используйте другой email.'
          setEmailError(msg)
          setError(msg)
          return
        }
        if (errorMsg.includes('signup_disabled')) {
          setError('Регистрация временно недоступна. Попробуйте позже или обратитесь в поддержку.')
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

  const switchTo = (next: Mode) => {
    setMode(next)
    setError(null)
    setSuccess(null)
    setEmailError(null)
    setPasswordError(null)
  }

  const loginDisabled = loading || !email.trim() || !password.trim()
  const registerDisabled =
    loading ||
    checkingEmail ||
    !email.trim() ||
    !password.trim() ||
    !isPasswordValid(password) ||
    !!passwordError ||
    !!emailError

  return (
    <div className={`${styles.authPage} ${mode === 'register' ? styles.authPageStripes135 : ''}`}>
      <div className={styles.authCard}>
        <div className={styles.authAccentLine} />
        <div className={styles.authHeader}>
          <h1 className={styles.authTitle}>{mode === 'login' ? loginTitle : registerTitle}</h1>
          <p className={styles.authSubtitle}>
            {mode === 'login' ? loginSubtitle : registerSubtitle}
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

        {mode === 'login' ? (
          <form className={styles.authForm} onSubmit={handleLogin}>
            <div className={styles.authField}>
              <label className={styles.authLabel} htmlFor="login-email">Email</label>
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
              <label className={styles.authLabel} htmlFor="login-password">Пароль</label>
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
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loginDisabled} className={styles.authBtnPrimary}>
              {loading ? (
                <>
                  <span className={styles.authBtnSpinner} aria-hidden />
                  Вход...
                </>
              ) : (
                'Войти'
              )}
            </button>
            {showYandex && <YandexAuthButton disabled={loading} returnTo={rememberNext ? nextPath : undefined} />}
          </form>
        ) : (
          <form className={styles.authForm} onSubmit={handleRegister}>
            <div className={styles.authField}>
              <label className={styles.authLabel} htmlFor="register-email">Email</label>
              <div className={`${styles.inputWrap} ${email ? styles.hasValue : ''} ${emailError ? styles.hasError : ''}`}>
                <span className={styles.authInputIcon} aria-hidden>✉️</span>
                <input
                  id="register-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (emailError) setEmailError(null)
                    if (error) setError(null)
                  }}
                  onBlur={() => {
                    const normalized = normalizeEmail(email)
                    if (!normalized) return
                    setCheckingEmail(true)
                    setEmailError(normalized.includes('@') ? null : 'Проверьте формат email. Пример: email@example.com')
                    setCheckingEmail(false)
                  }}
                  required
                  placeholder="email@example.com"
                  autoComplete="email"
                  className={styles.authInput}
                />
              </div>
              {emailError && <p className={styles.authFieldError}>{emailError}</p>}
            </div>
            <div className={`${styles.authField} ${showPromo ? '' : styles.authFieldLast}`}>
              <label className={styles.authLabel} htmlFor="register-password">
                Пароль
                <span className={styles.authLabelHint}>(мин. 6 символов, буквы и цифры)</span>
              </label>
              <div className={`${styles.inputWrap} ${password ? styles.hasValue : ''} ${passwordError ? styles.hasError : ''}`}>
                <span className={styles.authInputIcon} aria-hidden>🔒</span>
                <input
                  id="register-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    const next = e.target.value
                    setPassword(next)
                    if (error) setError(null)
                    setPasswordError(next.length > 0 ? validatePassword(next) : null)
                  }}
                  onBlur={() => {
                    if (password.length > 0) setPasswordError(validatePassword(password))
                  }}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className={`${styles.authInput} ${styles.authInputPassword}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={styles.authToggle}
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
              {password.length > 0 && (
                <div className={styles.authStrengthWrap}>
                  <div className={styles.authStrengthBar}>
                    <div className={styles.authStrengthTrack}>
                      <div
                        className={styles.authStrengthFill}
                        style={{
                          width: passwordStrength.strength === 1 ? '33%' : passwordStrength.strength === 2 ? '66%' : '100%',
                          background: passwordStrength.color,
                        }}
                      />
                    </div>
                    <span className={styles.authStrengthLabel} style={{ color: passwordStrength.color }}>
                      {passwordStrength.label}
                    </span>
                  </div>
                </div>
              )}
              {password.length > 0 && !isPasswordValid(password) && (
                <div className={styles.authRequirements}>
                  <div className={styles.authRequirementsTitle}>Требования к паролю:</div>
                  <div className={`${styles.authRequirementItem} ${passwordRequirements.minLength ? styles.met : ''}`}>
                    <span>{passwordRequirements.minLength ? '✓' : '○'}</span>
                    <span>Минимум 6 символов</span>
                  </div>
                  <div className={`${styles.authRequirementItem} ${passwordRequirements.hasLetters ? styles.met : ''}`}>
                    <span>{passwordRequirements.hasLetters ? '✓' : '○'}</span>
                    <span>Содержит буквы</span>
                  </div>
                  <div className={`${styles.authRequirementItem} ${passwordRequirements.hasNumbers ? styles.met : ''}`}>
                    <span>{passwordRequirements.hasNumbers ? '✓' : '○'}</span>
                    <span>Содержит цифры</span>
                  </div>
                </div>
              )}
              {passwordError && <p className={styles.authFieldError}>{passwordError}</p>}
            </div>
            {showPromo && <div className={`${styles.authField} ${styles.authFieldLast}`}>
              <label className={styles.authLabel} htmlFor="register-promo">
                Промокод
                <span className={styles.authLabelHint}>необязательно</span>
              </label>
              <div className={`${styles.inputWrap} ${promo ? styles.hasValue : ''} ${promoError ? styles.hasError : ''}`}>
                <span className={styles.authInputIcon} aria-hidden>🎟️</span>
                <input
                  id="register-promo"
                  value={promo}
                  onChange={(event) => {
                    setPromo(event.target.value)
                    if (promoError) setPromoError(null)
                    if (error) setError(null)
                  }}
                  placeholder="Код партнёра"
                  autoComplete="off"
                  spellCheck={false}
                  className={styles.authInput}
                />
              </div>
              <p className={styles.authFieldNote}>
                50 ₽ начислятся только если указан промокод партнёра, от которого вы пришли.
              </p>
              {promoError && <p className={styles.authFieldError}>{promoError}</p>}
            </div>}
            <button type="submit" disabled={registerDisabled} className={styles.authBtnPrimary}>
              {loading || checkingEmail ? (
                <>
                  <span className={styles.authBtnSpinner} aria-hidden />
                  {loading ? 'Регистрация...' : 'Проверка...'}
                </>
              ) : (
                'Зарегистрироваться'
              )}
            </button>
            {showYandex && (
              <YandexAuthButton
                disabled={loading}
                returnTo={rememberNext ? nextPath : undefined}
                referralCode={promo}
              />
            )}
          </form>
        )}

        {mode === 'login' && (
          <div className={styles.authFooterLinkWrap}>
            <a href="/auth/reset" className={styles.authFooterLink}>Забыли пароль?</a>
          </div>
        )}

        {rememberNext && (
          <div className={styles.authFooterLinkWrap}>
            <a href="/partner/terms" className={styles.authFooterLink}>Условия программы</a>
          </div>
        )}

        <div className={styles.authDivider}>
          <p className={styles.authFooterText}>
            {mode === 'login' ? 'Нет аккаунта? ' : 'Уже есть аккаунт? '}
            {switchMode === 'toggle' ? (
              <button
                type="button"
                className={styles.authFooterLinkPrimary}
                onClick={() => switchTo(mode === 'login' ? 'register' : 'login')}
              >
                {mode === 'login' ? 'Зарегистрироваться' : 'Войти'}
              </button>
            ) : (
              <a
                href={mode === 'login' ? '/auth/register' : '/auth/login'}
                className={styles.authFooterLinkPrimary}
              >
                {mode === 'login' ? 'Зарегистрироваться' : 'Войти'}
              </a>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
