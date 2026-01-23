'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function UpdatePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    // In recovery/confirm flows, Supabase may set session from URL on load.
    supabase.auth.getSession().finally(() => setReady(true))
  }, [])

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
    } catch (e: any) {
      setError(e?.message || 'Не удалось обновить пароль')
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
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <div style={{
        background: 'white',
        padding: '2rem',
        borderRadius: '12px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
        width: '100%',
        maxWidth: '420px'
      }}>
        <h1 style={{ marginBottom: '1.25rem', textAlign: 'center' }}>Новый пароль</h1>

        {!ready ? (
          <div style={{ color: '#6b7280', textAlign: 'center' }}>Загрузка…</div>
        ) : (
          <>
            {error && (
              <div style={{
                padding: '0.75rem',
                background: '#fee2e2',
                color: '#dc2626',
                borderRadius: '6px',
                marginBottom: '1rem'
              }}>
                {error}
              </div>
            )}

            {success && (
              <div style={{
                padding: '0.75rem',
                background: '#dcfce7',
                color: '#166534',
                borderRadius: '6px',
                marginBottom: '1rem'
              }}>
                {success}
              </div>
            )}

            <form onSubmit={handleUpdate}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Новый пароль
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '1rem'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: loading ? '#9ca3af' : '#111827',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? 'Сохранение...' : 'Обновить пароль'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

