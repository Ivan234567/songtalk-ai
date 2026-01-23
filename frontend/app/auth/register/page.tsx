'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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

  const validatePassword = (pass: string): string | null => {
    // Проверка минимальной длины
    if (!pass || pass.length < 6) {
      return 'Пароль должен содержать минимум 6 символов'
    }

    // Проверка наличия букв (латиница, кириллица)
    const hasLetters = /[a-zA-Zа-яА-ЯёЁ]/.test(pass)
    if (!hasLetters) {
      return 'Пароль должен содержать хотя бы одну букву'
    }

    // Проверка наличия цифр
    const hasNumbers = /[0-9]/.test(pass)
    if (!hasNumbers) {
      return 'Пароль должен содержать хотя бы одну цифру'
    }

    return null
  }

  // Проверка валидности пароля (возвращает true/false)
  const isPasswordValid = (pass: string): boolean => {
    return validatePassword(pass) === null
  }

  // Расчет силы пароля (0-3: слабый, средний, сильный)
  const getPasswordStrength = (pass: string): { strength: number; label: string; color: string } => {
    if (!pass || pass.length === 0) {
      return { strength: 0, label: '', color: '#e5e7eb' }
    }

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

    if (strength <= 2) {
      return { strength: 1, label: 'Слабый', color: '#ef4444' }
    } else if (strength <= 4) {
      return { strength: 2, label: 'Средний', color: '#f59e0b' }
    } else {
      return { strength: 3, label: 'Сильный', color: '#10b981' }
    }
  }

  // Проверка требований к паролю для прогрессивной валидации
  const getPasswordRequirements = (pass: string) => {
    return {
      minLength: pass.length >= 6,
      hasLetters: /[a-zA-Zа-яА-ЯёЁ]/.test(pass),
      hasNumbers: /[0-9]/.test(pass),
    }
  }

  const passwordStrength = getPasswordStrength(password)
  const passwordRequirements = getPasswordRequirements(password)

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value
    setEmail(newEmail)
    
    // Сбрасываем ошибки email при изменении
    if (emailError) {
      setEmailError(null)
    }
    if (error && (error.includes('email') || error.includes('почт') || error.includes('уже'))) {
      setError(null)
    }
  }

  const handleEmailBlur = async () => {
    if (!email || !email.includes('@')) {
      return
    }

    setCheckingEmail(true)
    setEmailError(null)

    try {
      // Проверяем существование email через API
      const response = await fetch('/api/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (data.exists) {
        setEmailError('Пользователь с таким email уже зарегистрирован. Войдите в аккаунт или используйте другой email.')
      }
    } catch (error) {
      // Если проверка не удалась, не показываем ошибку
      // Валидация произойдет при попытке регистрации
      console.error('Failed to check email:', error)
    } finally {
      setCheckingEmail(false)
    }
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPassword = e.target.value
    setPassword(newPassword)
    
    // Сбрасываем общую ошибку при изменении пароля
    if (error && error.includes('Пароль')) {
      setError(null)
    }
    
    // Валидация при вводе
    if (newPassword.length > 0) {
      const validationError = validatePassword(newPassword)
      setPasswordError(validationError)
    } else {
      setPasswordError(null)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setEmailError(null)

    // Строгая валидация пароля перед отправкой - блокируем регистрацию
    const passwordValidationError = validatePassword(password)
    if (passwordValidationError) {
      setPasswordError(passwordValidationError)
      setError(passwordValidationError)
      return // Выходим без отправки запроса
    }

    // Дополнительная проверка на всякий случай
    if (!isPasswordValid(password)) {
      const errorMsg = 'Пароль не соответствует требованиям безопасности'
      setPasswordError(errorMsg)
      setError(errorMsg)
      return
    }

    setLoading(true)

    try {
      const emailRedirectTo = `${window.location.origin}/auth/callback`
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo },
      })

      if (error) {
        // Проверяем если ошибка связана с существующим email
        const errorMsg = error.message.toLowerCase()
        const isEmailExists = 
          errorMsg.includes('already registered') || 
          errorMsg.includes('already exists') ||
          errorMsg.includes('user already') ||
          errorMsg.includes('email already') ||
          errorMsg.includes('already been registered') ||
          errorMsg.includes('user is already registered') ||
          errorMsg.includes('signup_disabled') ||
          (error.status === 400 && errorMsg.includes('email'))
        
        if (isEmailExists) {
          const emailExistsError = 'Пользователь с таким email уже зарегистрирован. Войдите в аккаунт или используйте другой email.'
          setEmailError(emailExistsError)
          setError(emailExistsError)
          setLoading(false)
          return
        }
        throw error
      }

      // Если есть session - новый пользователь создан и вошел
      if (data.session) {
        router.push('/')
        router.refresh()
        return
      }

      // Если нет session, но есть user - проверяем, был ли это новый пользователь
      // Проверяем через API, существует ли email в базе
      try {
        const checkResponse = await fetch('/api/check-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
        
        const checkData = await checkResponse.json()
        
        if (checkData.exists) {
          // Email уже существует - пользователь не был создан, письмо не отправлено
          const emailExistsError = 'Пользователь с таким email уже зарегистрирован. Войдите в аккаунт или используйте другой email.'
          setEmailError(emailExistsError)
          setError(emailExistsError)
          setLoading(false)
          return
        }
      } catch (checkError) {
        // Если проверка не удалась, продолжаем как обычно
        // (пользователь мог быть создан, показываем сообщение о письме)
        console.error('Failed to check email:', checkError)
      }

      // Если email не существует (или проверка не удалась), предполагаем что пользователь был создан
      // Показываем сообщение о письме только если мы уверены, что email не существует
      setSuccess('Проверьте почту: мы отправили письмо для подтверждения email.')
    } catch (error: any) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
      position: 'relative',
      padding: '1rem',
      overflow: 'hidden'
    }}>
      {/* Декоративные элементы фона */}
      <div style={{
        position: 'absolute',
        width: '500px',
        height: '500px',
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.1)',
        top: '-200px',
        right: '-200px',
        filter: 'blur(60px)'
      }} />
      <div style={{
        position: 'absolute',
        width: '400px',
        height: '400px',
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.08)',
        bottom: '-150px',
        left: '-150px',
        filter: 'blur(50px)'
      }} />

      <div style={{
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(20px)',
        padding: '3.5rem 3rem',
        borderRadius: '32px',
        boxShadow: '0 25px 80px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.6)',
        width: '100%',
        maxWidth: '480px',
        border: '2px solid rgba(255, 255, 255, 0.5)',
        position: 'relative',
        zIndex: 1
      }}>
        {/* Декоративная линия сверху */}
        <div style={{
          width: '60px',
          height: '4px',
          background: 'linear-gradient(90deg, #667eea, #764ba2)',
          borderRadius: '2px',
          margin: '0 auto 2rem auto'
        }} />

        <div style={{ marginBottom: '2.5rem', textAlign: 'center', position: 'relative' }}>
          <h1 style={{ 
            margin: 0,
            fontSize: '2.5rem',
            fontWeight: '800',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '-0.03em',
            marginBottom: '0.75rem',
            lineHeight: '1.2'
          }}>
            Создать аккаунт
          </h1>
          <p style={{
            margin: 0,
            fontSize: '1rem',
            color: '#6b7280',
            fontWeight: '500',
            position: 'relative',
            display: 'inline-block'
          }}>
            Начните использование сервиса
            <span style={{
              position: 'absolute',
              bottom: '-4px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '30px',
              height: '2px',
              background: 'linear-gradient(90deg, #667eea, #764ba2)',
              borderRadius: '1px'
            }} />
          </p>
        </div>
        
        {error && (
          <div style={{
            padding: '1rem 1.25rem',
            background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
            color: '#dc2626',
            borderRadius: '16px',
            marginBottom: '1.75rem',
            fontSize: '0.875rem',
            border: '2px solid #fecaca',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            boxShadow: '0 4px 12px rgba(220, 38, 38, 0.1)'
          }}>
            <span style={{ fontSize: '1.25rem' }}>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div style={{
            padding: '1rem 1.25rem',
            background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
            color: '#166534',
            borderRadius: '16px',
            marginBottom: '1.75rem',
            fontSize: '0.875rem',
            border: '2px solid #bbf7d0',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            boxShadow: '0 4px 12px rgba(22, 101, 52, 0.1)'
          }}>
            <span style={{ fontSize: '1.25rem' }}>✓</span>
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleRegister}>
          <div style={{ marginBottom: '1.5rem', position: 'relative' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '0.75rem', 
              fontWeight: '700',
              fontSize: '0.875rem',
              color: '#374151',
              letterSpacing: '0.02em',
              textTransform: 'uppercase'
            }}>
              Email
            </label>
            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: email ? '#667eea' : '#9ca3af',
                fontSize: '1.125rem',
                pointerEvents: 'none',
                transition: 'color 0.3s ease'
              }}>
                ✉️
              </div>
              <input
                type="email"
                value={email}
                onChange={handleEmailChange}
                onBlur={handleEmailBlur}
                required
                placeholder="your@email.com"
                style={{
                  width: '100%',
                  padding: '1rem 1.25rem 1rem 3rem',
                  border: `2px solid ${emailError ? '#dc2626' : '#e5e7eb'}`,
                  borderRadius: '16px',
                  fontSize: '0.9375rem',
                  color: '#111827',
                  background: 'linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'all 0.3s ease'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = emailError ? '#dc2626' : '#667eea'
                  e.target.style.boxShadow = emailError
                    ? '0 0 0 6px rgba(220, 38, 38, 0.12), 0 8px 16px rgba(220, 38, 38, 0.1)'
                    : '0 0 0 6px rgba(102, 126, 234, 0.12), 0 8px 16px rgba(102, 126, 234, 0.1)'
                }}
                onBlurCapture={(e) => {
                  e.target.style.borderColor = emailError ? '#dc2626' : '#e5e7eb'
                  e.target.style.boxShadow = 'none'
                }}
              />
            </div>
            {emailError && (
              <div style={{
                marginTop: '0.5rem',
                fontSize: '0.75rem',
                color: '#dc2626',
                paddingLeft: '0.5rem'
              }}>
                {emailError}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '2rem', position: 'relative' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '0.75rem', 
              fontWeight: '700',
              fontSize: '0.875rem',
              color: '#374151',
              letterSpacing: '0.02em',
              textTransform: 'uppercase'
            }}>
              Пароль
              <span style={{ 
                marginLeft: '0.5rem',
                fontSize: '0.75rem',
                fontWeight: '400',
                color: '#9ca3af',
                textTransform: 'none'
              }}>
                (мин. 6 символов, буквы и цифры)
              </span>
            </label>
            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: password ? '#667eea' : '#9ca3af',
                fontSize: '1.125rem',
                pointerEvents: 'none',
                transition: 'color 0.3s ease'
              }}>
                🔒
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={handlePasswordChange}
                required
                minLength={6}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '1rem 3.5rem 1rem 3rem',
                  border: `2px solid ${passwordError ? '#dc2626' : '#e5e7eb'}`,
                  borderRadius: '16px',
                  fontSize: '0.9375rem',
                  color: '#111827',
                  background: 'linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'all 0.3s ease'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = passwordError ? '#dc2626' : '#667eea'
                  e.target.style.boxShadow = passwordError 
                    ? '0 0 0 6px rgba(220, 38, 38, 0.12), 0 8px 16px rgba(220, 38, 38, 0.1)'
                    : '0 0 0 6px rgba(102, 126, 234, 0.12), 0 8px 16px rgba(102, 126, 234, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = passwordError ? '#dc2626' : '#e5e7eb'
                  e.target.style.boxShadow = 'none'
                  if (password.length > 0) {
                    const validationError = validatePassword(password)
                    setPasswordError(validationError)
                  }
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  top: '50%',
                  right: '1rem',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: password ? '#667eea' : '#9ca3af',
                  fontSize: '1.125rem',
                  transition: 'color 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#764ba2'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = password ? '#667eea' : '#9ca3af'
                }}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
            
            {/* Индикатор силы пароля */}
            {password && password.length > 0 && (
              <div style={{ marginTop: '0.75rem', transition: 'opacity 0.3s ease' }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem',
                  marginBottom: '0.5rem'
                }}>
                  <div style={{
                    flex: 1,
                    height: '4px',
                    background: '#e5e7eb',
                    borderRadius: '2px',
                    overflow: 'hidden',
                    position: 'relative'
                  }}>
                    <div style={{
                      width: passwordStrength.strength === 1 ? '33%' : passwordStrength.strength === 2 ? '66%' : '100%',
                      height: '100%',
                      background: passwordStrength.color,
                      borderRadius: '2px',
                      transition: 'all 0.3s ease'
                    }} />
                  </div>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    color: passwordStrength.color,
                    minWidth: '60px',
                    textAlign: 'right',
                    transition: 'color 0.3s ease'
                  }}>
                    {passwordStrength.label}
                  </span>
                </div>
              </div>
            )}

            {/* Прогрессивная валидация - требования к паролю */}
            {password && password.length > 0 && !isPasswordValid(password) && (
              <div style={{
                marginTop: '0.75rem',
                padding: '0.75rem 1rem',
                background: '#f9fafb',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
                transition: 'all 0.3s ease'
              }}>
                <div style={{
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Требования к паролю:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.5rem',
                    fontSize: '0.75rem',
                    color: passwordRequirements.minLength ? '#10b981' : '#6b7280',
                    transition: 'color 0.3s ease'
                  }}>
                    <span style={{ fontSize: '0.875rem' }}>
                      {passwordRequirements.minLength ? '✓' : '○'}
                    </span>
                    <span>Минимум 6 символов</span>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.5rem',
                    fontSize: '0.75rem',
                    color: passwordRequirements.hasLetters ? '#10b981' : '#6b7280',
                    transition: 'color 0.3s ease'
                  }}>
                    <span style={{ fontSize: '0.875rem' }}>
                      {passwordRequirements.hasLetters ? '✓' : '○'}
                    </span>
                    <span>Содержит буквы</span>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.5rem',
                    fontSize: '0.75rem',
                    color: passwordRequirements.hasNumbers ? '#10b981' : '#6b7280',
                    transition: 'color 0.3s ease'
                  }}>
                    <span style={{ fontSize: '0.875rem' }}>
                      {passwordRequirements.hasNumbers ? '✓' : '○'}
                    </span>
                    <span>Содержит цифры</span>
                  </div>
                </div>
              </div>
            )}

            {passwordError && (
              <div style={{
                marginTop: '0.5rem',
                fontSize: '0.75rem',
                color: '#dc2626',
                paddingLeft: '0.5rem',
                transition: 'opacity 0.3s ease'
              }}>
                {passwordError}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || checkingEmail || !isPasswordValid(password) || !!passwordError || !!emailError || password.length === 0}
            style={{
              width: '100%',
              padding: '1.125rem 1.5rem',
              background: (loading || checkingEmail || !isPasswordValid(password) || !!passwordError || !!emailError || password.length === 0) ? '#9ca3af' : 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '16px',
              fontSize: '1rem',
              fontWeight: '700',
              cursor: (loading || checkingEmail || !isPasswordValid(password) || !!passwordError || !!emailError || password.length === 0) ? 'not-allowed' : 'pointer',
              boxShadow: (loading || checkingEmail || !isPasswordValid(password) || !!passwordError || !!emailError || password.length === 0) ? 'none' : '0 8px 24px rgba(102, 126, 234, 0.35), inset 0 1px 0 rgba(255,255,255,0.2)',
              position: 'relative',
              overflow: 'hidden',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}
            onMouseEnter={(e) => {
              if (!loading && !checkingEmail && isPasswordValid(password) && !passwordError && !emailError && password.length > 0) {
                e.currentTarget.style.boxShadow = '0 12px 32px rgba(102, 126, 234, 0.45), inset 0 1px 0 rgba(255,255,255,0.2)'
              }
            }}
            onMouseLeave={(e) => {
              if (!loading && !checkingEmail && isPasswordValid(password) && !passwordError && !emailError && password.length > 0) {
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(102, 126, 234, 0.35), inset 0 1px 0 rgba(255,255,255,0.2)'
              }
            }}
          >
            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>
        </form>

        <div style={{ 
          marginTop: '2.5rem', 
          paddingTop: '2rem',
          borderTop: '2px solid #e5e7eb',
          textAlign: 'center',
          position: 'relative'
        }}>
          <div style={{
            position: 'absolute',
            top: '-1px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '40px',
            height: '2px',
            background: 'linear-gradient(90deg, #667eea, #764ba2)'
          }} />
          <p style={{ 
            margin: 0,
            fontSize: '0.875rem', 
            color: '#6b7280',
            fontWeight: '500'
          }}>
            Уже есть аккаунт?{' '}
            <a 
              href="/auth/login" 
              style={{ 
                color: '#667eea',
                textDecoration: 'none',
                fontWeight: '700',
                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.8'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1'
              }}
            >
              Войти
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}