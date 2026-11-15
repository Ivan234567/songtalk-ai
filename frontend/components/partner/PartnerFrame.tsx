'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '@/lib/supabase'
import { exchangeSupabaseToken } from '@/lib/exchange-backend-token'
import { clearBackendToken, getStoredBackendToken } from '@/lib/backend-jwt'
import {
  monthLabel,
  partnerGet,
  statusText,
  type PartnerFailure,
  type PartnerOverview,
  type PartnerStatus,
} from '@/lib/partner'
import AccountAuth from '@/components/auth/AccountAuth'
import { ApplicationPanel } from '@/components/partner/ApplicationPanel'
import styles from './partner.module.css'

type Load<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: string; http: number }

type PartnerState = {
  token: string | null | undefined
  email: string | null
  overview: Load<PartnerOverview> | null
  notify: (message: string) => void
}

const PartnerContext = createContext<PartnerState>({
  token: undefined,
  email: null,
  overview: null,
  notify: () => {},
})

export function usePartnerState() {
  return useContext(PartnerContext)
}

const NAV = [
  { href: '/partner', label: 'Обзор', exact: true, icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
  { href: '/partner/referrals', label: 'Рефералы', icon: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M22 21v-2a4 4 0 00-3-3.9M15 3.1a4 4 0 010 7.8' },
  { href: '/partner/finance', label: 'Финансы', icon: 'M3 3v18h18M7 15l4-6 4 3 5-8' },
  { href: '/partner/accruals', label: 'Начисления', icon: 'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6' },
  { href: '/partner/payouts', label: 'Выплаты', icon: 'M21 12V7H5a2 2 0 010-4h14v4M3 5v14a2 2 0 002 2h16v-5M18 12a2 2 0 000 4h4v-4z' },
  { href: '/partner/terms', label: 'Условия', icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M9 13h6M9 17h6' },
]

function Glyph({ d }: { d: string }) {
  return (
    <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}

function isFailure(value: PartnerOverview | PartnerFailure): value is PartnerFailure {
  return value.ok === false
}

function titleFor(path: string) {
  if (/^\/partner\/accruals\/\d{4}-\d{2}$/.test(path)) return 'Начисления · детали'
  const item = NAV.find((entry) => (entry.exact ? path === entry.href : path.startsWith(entry.href)))
  return item?.label || 'Обзор'
}

function activeHref(path: string) {
  if (path.startsWith('/partner/accruals')) return '/partner/accruals'
  const item = NAV.find((entry) => (entry.exact ? path === entry.href : path.startsWith(entry.href)))
  return item?.href || '/partner'
}

export function PartnerFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const path = pathname ?? ''
  const [token, setToken] = useState<string | null | undefined>(undefined)
  const [overview, setOverview] = useState<Load<PartnerOverview> | null>(null)
  const [label, setLabel] = useState('Аккаунт')
  const [email, setEmail] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [more, setMore] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const terms = path === '/partner/terms'
  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 1800)
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
    }
  }, [])

  useEffect(() => {
    if (!token) return
    const fromToken = emailFromToken(token)
    if (fromToken) {
      setEmail(fromToken)
      setLabel(fromToken.split('@')[0] || 'Аккаунт')
    }
    let cancel = false
    supabase.auth.getUser().then(({ data }) => {
      const nextEmail = data.user?.email
      if (!cancel && nextEmail) {
        setEmail(nextEmail)
        setLabel(nextEmail.split('@')[0] || 'Аккаунт')
      }
    }).catch(() => {})
    return () => {
      cancel = true
    }
  }, [token])

  useEffect(() => {
    if (!token || terms) return
    let cancel = false
    setOverview({ status: 'loading' })
    partnerGet<PartnerOverview>('/api/partner/overview', token).then((result) => {
      if (cancel) return
      if (isFailure(result)) {
        if (result.status === 401 || result.error === 'unauthorized') {
          clearBackendToken()
          setToken(null)
          setOverview(null)
          return
        }
        setOverview({ status: 'error', error: result.error, http: result.status })
      } else setOverview({ status: 'ready', data: result })
    }).catch(() => {
      if (!cancel) setOverview({ status: 'error', error: 'partner_read_failed', http: 0 })
    })
    return () => {
      cancel = true
    }
  }, [token, terms, retry])

  async function logout() {
    clearBackendToken()
    await supabase.auth.signOut().catch(() => {})
    setMenu(false)
    setToken(null)
    setEmail(null)
    setOverview(null)
  }

  const blocked = !terms && overview?.status === 'error'
  const bannerStatus: PartnerStatus | null = overview?.status === 'ready' ? overview.data.status : null
  const period = overview?.status === 'ready' ? monthLabel(overview.data.month?.month) : ''

  if (!terms && token === null) {
    return (
      <PartnerContext.Provider value={{ token, email, overview, notify }}>
        <AccountAuth
          mode="login"
          nextPath="/partner"
          rememberNext
          switchMode="toggle"
          showYandex={false}
          onAuthenticated={(nextToken) => setToken(nextToken)}
          loginTitle="Партнёрский кабинет"
          loginSubtitle="Войдите в аккаунт"
          registerTitle="Регистрация партнёра"
          registerSubtitle="После регистрации откроется заявка. Ссылку выдаёт администратор."
        />
      </PartnerContext.Provider>
    )
  }

  let body: ReactNode = children
  if (!terms && token === undefined) body = <Loading />
  else if (!terms && overview?.status === 'loading') body = <Loading />
    else if (blocked && overview?.status === 'error' && overview.error === 'not_a_partner' && token) body = <ApplicationPanel token={token} />
  else if (blocked && overview?.status === 'error') body = <Unavailable onRetry={() => setRetry((value) => value + 1)} />

  const current = activeHref(path)

  return (
    <PartnerContext.Provider value={{ token, email, overview, notify }}>
      <div className={styles.app} data-theme={theme === 'light' ? 'light' : undefined}>
        <aside className={styles.side}>
          <div className={styles.logoRow}>
            <div className={styles.mark} aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
                <circle cx="12" cy="12" r="3.2" />
              </svg>
            </div>
            <div>
              <div className={styles.logo}>Speakeasy</div>
              <small className={styles.logoSub}>партнёрская программа</small>
            </div>
          </div>
          <nav className={styles.nav} aria-label="Кабинет партнёра">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navLink} ${current === item.href ? styles.navLinkActive : ''}`}
                aria-current={current === item.href ? 'page' : undefined}
              >
                <Glyph d={item.icon} />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className={styles.me}>
            <span className={styles.avatar}>{initials(label)}</span>
            <div>
              <b>{label}</b>
              <span className={styles.statusLine}>
                <i className={`${styles.dot} ${bannerStatus && bannerStatus !== 'active' ? styles.dotOff : ''}`} />
                {bannerStatus || 'вход'}
              </span>
            </div>
          </div>
        </aside>
        <div className={styles.column}>
          <header className={styles.header}>
            <div>
              <div className={styles.crumb}>Кабинет партнёра</div>
              <h1>{titleFor(path)}</h1>
            </div>
            <div className={styles.tools}>
              {period && (
                <span className={`${styles.chip} ${styles.chipStatic}`}>
                  <i className={styles.dot} />
                  {period} · МСК
                </span>
              )}
              <button
                type="button"
                className={styles.iconBtn}
                aria-label="Тема"
                onClick={() => {
                  const next = theme === 'dark' ? 'light' : 'dark'
                  setTheme(next)
                  window.localStorage.setItem('partner_theme', next)
                }}
              >
                <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </svg>
              </button>
              <button type="button" className={styles.accountBtn} aria-label="Меню аккаунта" onClick={() => setMenu((value) => !value)}>
                <span className={styles.avatar}>{initials(label)}</span>
                {label}
              </button>
              {menu && (
                <div className={styles.menu}>
                  <p><b>{label}</b>{bannerStatus || 'аккаунт'}</p>
                  <button type="button" className={styles.chip} onClick={logout}>Выйти</button>
                </div>
              )}
            </div>
          </header>
          <main className={styles.main}>
            {bannerStatus && bannerStatus !== 'active' && (
              <div className={styles.warn} role="status">{statusText(bannerStatus)}</div>
            )}
            {body}
          </main>
        </div>
        <nav className={styles.bottom} aria-label="Разделы">
          {NAV.slice(0, 4).map((item) => (
            <Link key={item.href} href={item.href} className={current === item.href ? styles.bottomOn : ''}>
              <Glyph d={item.icon} />
              {item.label}
            </Link>
          ))}
          <button type="button" className={current === '/partner/payouts' || current === '/partner/terms' ? styles.bottomOn : ''} onClick={() => setMore(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
            Ещё
          </button>
        </nav>
        {more && (
          <>
          <button type="button" className={styles.overlay} aria-label="Закрыть" onClick={() => setMore(false)} />
          <div className={styles.sheet}>
            <div className={styles.bar}>
              <h2>Ещё</h2>
              <button type="button" className={styles.chip} onClick={() => setMore(false)}>Закрыть</button>
            </div>
            <div className={styles.filters} style={{ flexDirection: 'column' }}>
              <Link className={styles.button} href="/partner/payouts" onClick={() => setMore(false)}>Выплаты</Link>
              <Link className={styles.buttonQuiet} href="/partner/terms" onClick={() => setMore(false)}>Условия программы</Link>
            </div>
          </div>
          </>
        )}
        {toast && <div className={styles.toast} role="status">{toast}</div>}
      </div>
    </PartnerContext.Provider>
  )
}

function emailFromToken(token: string | null) {
  if (!token) return null
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof json.email === 'string' && json.email.includes('@') ? json.email : null
  } catch {
    return null
  }
}

function initials(value: string) {
  const clean = value.replace(/[^a-zA-Zа-яА-Я0-9]/g, '')
  return (clean.slice(0, 2) || 'АК').toUpperCase()
}

function Loading() {
  return (
    <>
      <div className={styles.skeleton} />
      <div className={styles.grid4}>
        <div className={styles.skeleton} />
        <div className={styles.skeleton} />
        <div className={styles.skeleton} />
        <div className={styles.skeleton} />
      </div>
      <div className={styles.skeletonTall} />
    </>
  )
}

function NotPartner() {
  return (
    <section className={styles.card}>
      <div className={styles.empty}>
        <b>Этот аккаунт не подключён</b>
        <p>Партнёрская статистика доступна только аккаунту, который уже заведён как партнёр. Регистрация через эту форму партнёром не делает и уникальную ссылку не выдаёт.</p>
        <Link href="/partner/terms" className={styles.button}>Условия программы</Link>
      </div>
    </section>
  )
}

function Unavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <section className={styles.card}>
      <div className={styles.empty}>
        <b>Не удалось загрузить данные</b>
        <p>Проверьте соединение и повторите попытку. Списки и комиссия не заполняются вручную.</p>
        <button type="button" className={styles.button} onClick={onRetry}>Повторить</button>
      </div>
    </section>
  )
}
