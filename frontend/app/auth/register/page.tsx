'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import styles from '../auth.module.css'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checkingEmail, setCheckingEmail] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const router = useRouter()

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

  const getPasswordRequirements = (pass: string) => ({
    minLength: pass.length >= 6,
    hasLetters: /[a-zA-Zа-яА-ЯёЁ]/.test(pass),
    hasNumbers: /[0-9]/.test(pass),
  })

  const passwordStrength = getPasswordStrength(password)
  const passwordRequirements = getPasswordRequirements(password)

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value)
    if (emailError) setEmailError(null)
    if (error) setError(null)
  }

  const handleEmailBlur = async () => {
    const normalizedEmail = normalizeEmail(email)
    if (!normalizedEmail) return

    setCheckingEmail(true)
    setEmailError(null)
    try {
      if (!normalizedEmail.includes('@')) {
        setEmailError('Проверьте формат email. Пример: email@example.com')
      }
    } finally {
      setCheckingEmail(false)
    }
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPassword = e.target.value
    setPassword(newPassword)
    if (error) setError(null)
    if (newPassword.length > 0) {
      setPasswordError(validatePassword(newPassword))
    } else {
      setPasswordError(null)
    }
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
    if (!isPasswordValid(password)) {
      const msg = 'Пароль не соответствует требованиям безопасности'
      setPasswordError(msg)
      setError(msg)
      return
    }
    setLoading(true)
    try {
      const emailRedirectTo = `${window.location.origin}/auth/callback`
      const normalizedEmail = normalizeEmail(email)
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: { emailRedirectTo },
      })
      if (error) {
        const errorMsg = error.message.toLowerCase()
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
          setLoading(false)
          return
        }
        if (errorMsg.includes('signup_disabled')) {
          const msg = 'Регистрация временно недоступна. Попробуйте позже или обратитесь в поддержку.'
          setError(msg)
          setLoading(false)
          return
        }
        throw error
      }
      if (data.session) {
        router.push('/')
        router.refresh()
        return
      }
      setSuccess('Проверьте почту: мы отправили письмо для подтверждения email.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка регистрации')
    } finally {
      setLoading(false)
    }
  }

  const isSubmitDisabled =
    loading ||
    checkingEmail ||
    !email.trim() ||
    !password.trim() ||
    !isPasswordValid(password) ||
    !!passwordError ||
    !!emailError

  return (
    <div className={`${styles.authPage} ${styles.authPageStripes135}`}>
      <div className={styles.authCard}>
        <div className={styles.authAccentLine} />
        <div className={styles.authHeader}>
          <h1 className={styles.authTitle}>Создать аккаунт</h1>
          <p className={styles.authSubtitle}>
            Начните использование сервиса
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

        <form className={styles.authForm} onSubmit={handleRegister}>
          <div className={styles.authField}>
            <label className={styles.authLabel} htmlFor="register-email">
              Email
            </label>
            <div className={`${styles.inputWrap} ${email ? styles.hasValue : ''} ${emailError ? styles.hasError : ''}`}>
              <span className={styles.authInputIcon} aria-hidden>✉️</span>
              <input
                id="register-email"
                type="email"
                value={email}
                onChange={handleEmailChange}
                onBlur={handleEmailBlur}
                required
                placeholder="email@example.com"
                autoComplete="email"
                className={styles.authInput}
              />
            </div>
            {emailError && <p className={styles.authFieldError}>{emailError}</p>}
          </div>

          <div className={`${styles.authField} ${styles.authFieldLast}`}>
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
                onChange={handlePasswordChange}
                required
                minLength={6}
                placeholder="••••••••"
                autoComplete="new-password"
                className={`${styles.authInput} ${styles.authInputPassword}`}
                onBlur={() => {
                  if (password.length > 0) setPasswordError(validatePassword(password))
                }}
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

            {password && password.length > 0 && (
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

            {password && password.length > 0 && !isPasswordValid(password) && (
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

          <button type="submit" disabled={isSubmitDisabled} className={styles.authBtnPrimary}>
            {loading || checkingEmail ? (
              <>
                <span className={styles.authBtnSpinner} aria-hidden />
                {loading ? 'Регистрация...' : 'Проверка...'}
              </>
            ) : (
              'Зарегистрироваться'
            )}
          </button>
        </form>

        <div className={styles.authDivider}>
          <p className={styles.authFooterText}>
            Уже есть аккаунт?{' '}
            <a href="/auth/login" className={styles.authFooterLinkPrimary}>
              Войти
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
