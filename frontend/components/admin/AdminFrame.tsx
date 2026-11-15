'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { exchangeSupabaseToken } from '@/lib/exchange-backend-token'
import { clearBackendToken, getStoredBackendToken } from '@/lib/backend-jwt'
import { partnerGet } from '@/lib/partner'
import { AdminGate, AdminSignIn } from './AdminAuth'
import styles from './admin.module.css'

export type AdminScreen = 'overview' | 'partners' | 'reconcile' | 'accruals' | 'payouts' | 'journal'
export type PartnersTab = 'issued' | 'applications'

const AdminSectionContext = createContext<{
  screen: AdminScreen
  setScreen: (screen: AdminScreen) => void
  partnersTab: PartnersTab
  setPartnersTab: (tab: PartnersTab) => void
  pending: number | null
  setPending: (value: number | null) => void
  payoutPending: number | null
  setPayoutPending: (value: number | null) => void
  email: string
} | null>(null)

export function useAdminSection() {
  const value = useContext(AdminSectionContext)
  if (!value) throw new Error('Раздел админки открыт вне кабинета')
  return value
}

const NAV: { id: AdminScreen; label: string; icon: ReactNode }[] = [
  { id: 'overview', label: 'Обзор', icon: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></> },
  { id: 'partners', label: 'Партнёры', icon: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.8c2 .7 3.2 2.4 3.5 5.2" /></> },
  { id: 'reconcile', label: 'Сверка', icon: <><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M9 12l2.5 2.5L16 9" /></> },
  { id: 'accruals', label: 'Начисления', icon: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18M7 15h4" /></> },
  { id: 'payouts', label: 'Выплаты', icon: <path d="M12 3v14M6 11l6 6 6-6M5 21h14" /> },
  { id: 'journal', label: 'Журнал', icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
]

type Gate = 'loading' | 'in' | 'out' | 'denied' | 'error'

function emailFromToken(token: string) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.email === 'string' ? payload.email : ''
  } catch {
    return ''
  }
}

export function AdminFrame({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<AdminScreen>('overview')
  const [partnersTab, setPartnersTab] = useState<PartnersTab>('issued')
  const [pending, setPending] = useState<number | null>(null)
  const [payoutPending, setPayoutPending] = useState<number | null>(null)
  const [gate, setGate] = useState<Gate>('loading')
  const [token, setToken] = useState<string | null | undefined>(undefined)
  const [email, setEmail] = useState('')
  const [menu, setMenu] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [retry, setRetry] = useState(0)

  const applyTheme = (next: 'dark' | 'light') => {
    setTheme(next)
    window.localStorage.setItem('partner_theme', next)
  }

  const check = useCallback(async (current: string) => {
    const result = await partnerGet<{ ok: true }>('/api/admin/me', current)
    if (result.ok) {
      setGate('in')
      return
    }
    if (result.status === 401 || result.error === 'unauthorized') {
      clearBackendToken()
      setToken(null)
      setGate('out')
      return
    }
    if (result.status === 403 || result.error === 'not_admin') {
      setGate('denied')
      return
    }
    setGate('error')
  }, [])

  useEffect(() => {
    const saved = window.localStorage.getItem('partner_theme')
    if (saved === 'light' || saved === 'dark') setTheme(saved)
  }, [])

  useEffect(() => {
    const previous = document.body.style.background
    document.body.style.background = theme === 'light' ? '#f1f6f2' : '#060d0a'
    return () => {
      document.body.style.background = previous
    }
  }, [theme])

  useEffect(() => {
    let cancel = false
    const timer = window.setTimeout(() => {
      if (cancel) return
      setToken((current) => (current === undefined ? getStoredBackendToken() : current))
    }, 4000)
    async function boot() {
      const { data } = await supabase.auth.getSession()
      const access = data.session?.access_token
      if (access) {
        const exchanged = await exchangeSupabaseToken(access)
        if (cancel) return
        if (exchanged) {
          setToken(exchanged)
          return
        }
      }
      if (!cancel) setToken(getStoredBackendToken())
    }
    boot().catch(() => {
      if (!cancel) setToken(getStoredBackendToken())
    })
    return () => {
      cancel = true
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (!token) return
    setEmail(emailFromToken(token))
    let cancel = false
    supabase.auth.getUser().then(({ data }) => {
      const next = data.user?.email
      if (!cancel && next) setEmail(next)
    }).catch(() => {})
    return () => {
      cancel = true
    }
  }, [token])

  useEffect(() => {
    if (token === undefined) return
    if (!token) {
      setGate('out')
      return
    }
    setGate('loading')
    check(token).catch(() => setGate('error'))
  }, [token, retry, check])

  async function logout() {
    clearBackendToken()
    await supabase.auth.signOut().catch(() => {})
    setMenu(false)
    setEmail('')
    setToken(null)
    setGate('out')
  }

  if (gate === 'out' || token === null) {
    return (
      <AdminGate theme={theme} onTheme={applyTheme}>
        <AdminSignIn onAuthenticated={(nextToken) => setToken(nextToken)} />
      </AdminGate>
    )
  }

  if (gate === 'denied') {
    return (
      <AdminGate theme={theme} onTheme={applyTheme}>
        <div className={styles.stack}>
          <h2>Этот аккаунт не администратор</h2>
          <p className={styles.hint} style={{ margin: 0 }}>
            Доступ в администрирование выдаётся отдельно. Партнёрская ссылка этим входом не создаётся.
          </p>
          <button type="button" className={styles.btn} onClick={logout}>Выйти</button>
        </div>
      </AdminGate>
    )
  }

  if (gate === 'loading') {
    return (
      <AdminGate theme={theme} onTheme={applyTheme}>
        <div className={styles.stack}>
          <h2>Проверяем допуск</h2>
          <div className={styles.skeleton} />
        </div>
      </AdminGate>
    )
  }

  if (gate === 'error') {
    return (
      <AdminGate theme={theme} onTheme={applyTheme}>
        <div className={styles.stack}>
          <h2>Не удалось проверить доступ</h2>
          <p className={styles.hint} style={{ margin: 0 }}>Панель не открывается, пока сервер не подтвердит допуск.</p>
          <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => setRetry((value) => value + 1)}>Повторить</button>
        </div>
      </AdminGate>
    )
  }

  return (
    <AdminSectionContext.Provider value={{ screen, setScreen, partnersTab, setPartnersTab, pending, setPending, payoutPending, setPayoutPending, email }}>
      <div className={styles.app} data-theme={theme === 'light' ? 'light' : undefined}>
        <div className={styles.shell}>
          <header className={styles.top}>
            <button type="button" className={`${styles.btn} ${styles.small}`} aria-label="Меню" onClick={() => setMenu((value) => !value)}>Меню</button>
            <span className={styles.brand}>Speakeasy</span>
          </header>
          <div className={`${styles.scrim} ${menu ? styles.scrimOn : ''}`} onClick={() => setMenu(false)} />
          <aside className={`${styles.side} ${menu ? styles.sideOpen : ''}`}>
            <div className={styles.sideHead}>
              <div className={styles.brand}>Speakeasy</div>
              <small>Администрирование</small>
            </div>
            <nav className={styles.nav} aria-label="Администрирование">
              {NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-current={screen === item.id ? 'page' : undefined}
                  onClick={() => {
                    setScreen(item.id)
                    setMenu(false)
                  }}
                >
                  <span className={styles.navLabel}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      {item.icon}
                    </svg>
                    {item.label}
                  </span>
                  {item.id === 'partners' && pending ? <span className={styles.badge}>{pending}</span> : null}
                  {item.id === 'payouts' && payoutPending ? <span className={styles.badge}>{payoutPending}</span> : null}
                </button>
              ))}
            </nav>
            <div className={styles.sideFoot}>
              <div className={styles.seg} role="group" aria-label="Тема">
                <button type="button" aria-pressed={theme === 'dark'} onClick={() => applyTheme('dark')}>Тёмная</button>
                <button type="button" aria-pressed={theme === 'light'} onClick={() => applyTheme('light')}>Светлая</button>
              </div>
              <div className={styles.email}>{email || 'Аккаунт'}</div>
              <button type="button" className={`${styles.btn} ${styles.ghost} ${styles.small}`} onClick={logout}>Выйти</button>
            </div>
          </aside>
          <main className={styles.main}>{children}</main>
        </div>
      </div>
    </AdminSectionContext.Provider>
  )
}
