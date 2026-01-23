'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const translateError = (errorMessage: string): string => {
    const errorMsg = errorMessage.toLowerCase()
    
    if (errorMsg.includes('user not found') || 
        errorMsg.includes('email not found')) {
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
      
      if (error) {
        const translatedError = translateError(error.message)
        throw new Error(translatedError)
      }
      
      setSuccess('Если такой email существует — мы отправили письмо для сброса пароля.')
    } catch (e: any) {
      setError(e?.message || 'Не удалось отправить письмо')
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
            Сброс пароля
          </h1>
          <p style={{
            margin: 0,
            fontSize: '1rem',
            color: '#6b7280',
            fontWeight: '500',
            position: 'relative',
            display: 'inline-block'
          }}>
            Введите email для восстановления
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

        <form onSubmit={handleReset}>
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
              Email
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="your@email.com"
                style={{
                  width: '100%',
                  padding: '1rem 1.25rem',
                  border: `2px solid ${error && error.includes('не найден') ? '#dc2626' : '#e5e7eb'}`,
                  borderRadius: '16px',
                  fontSize: '0.9375rem',
                  color: '#111827',
                  background: 'linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'all 0.2s ease'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#667eea'
                  e.target.style.boxShadow = '0 0 0 6px rgba(102, 126, 234, 0.12), 0 8px 16px rgba(102, 126, 234, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = error && error.includes('не найден') ? '#dc2626' : '#e5e7eb'
                  e.target.style.boxShadow = 'none'
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '1.125rem 1.5rem',
              background: loading ? '#9ca3af' : 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '16px',
              fontSize: '1rem',
              fontWeight: '700',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 8px 24px rgba(102, 126, 234, 0.35), inset 0 1px 0 rgba(255,255,255,0.2)',
              position: 'relative',
              overflow: 'hidden',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.boxShadow = '0 12px 32px rgba(102, 126, 234, 0.45), inset 0 1px 0 rgba(255,255,255,0.2)'
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(102, 126, 234, 0.35), inset 0 1px 0 rgba(255,255,255,0.2)'
              }
            }}
          >
            {loading ? 'Отправка...' : 'Отправить письмо'}
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
              ← Вернуться ко входу
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
