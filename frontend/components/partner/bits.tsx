'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { usePartnerState } from '@/components/partner/PartnerFrame'
import {
  accrualLabel,
  blockReason,
  formatRate,
  formatRub,
  formatWhen,
  monthKey,
  monthLabel,
  shortMonth,
  type MonthReport,
  type ReferralRow,
} from '@/lib/partner'
import styles from './partner.module.css'

export function Money({
  value,
  missing = 'Не определено',
}: {
  value: number | null | undefined
  missing?: string
}) {
  if (value == null || Number.isNaN(Number(value))) return <span className={styles.unknown}>{missing}</span>
  return <>{formatRub(value)}</>
}

export function StatusChip({ month }: { month: MonthReport }) {
  const status = accrualLabel(month)
  const tone = status.blocked ? styles.chipWarn : status.label === 'Не подтверждено' ? '' : styles.chipOn
  return (
    <span className={`${styles.chip} ${styles.chipStatic} ${tone}`}>
      <i className={`${styles.dot} ${status.blocked ? styles.dotOff : status.label === 'Не подтверждено' ? styles.dotMute : ''}`} />
      {status.label}
    </span>
  )
}

export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon} aria-hidden>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
      </div>
      <b>{title}</b>
      <p>{text}</p>
      {action}
    </div>
  )
}

const AVATAR = ['#3DDB92', '#9BE15D', '#5BC0EB', '#F5C862', '#C792EA', '#F27D72']

export function PersonName({ mail, index = 0 }: { mail: string; index?: number }) {
  const letter = (mail.trim()[0] || '?').toUpperCase()
  return (
    <span className={styles.person}>
      <span className={styles.mini} style={{ background: AVATAR[index % AVATAR.length] }}>{letter}</span>
      {mail}
    </span>
  )
}

export function LinkCard() {
  const { overview, notify, email } = usePartnerState()
  const data = overview?.status === 'ready' ? overview.data : null
  const [copied, setCopied] = useState(false)
  if (!data) return null
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const link = `${origin}/r/${data.referral_code}`
  const paused = data.status !== 'active'

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      notify('Ссылка скопирована')
    } catch {
      notify('Не удалось скопировать ссылку')
    }
  }

  async function shareLink() {
    if (!navigator.share) {
      await copyLink()
      return
    }
    try {
      await navigator.share({ title: 'Speakeasy', url: link })
    } catch {
      /* закрыли лист */
    }
  }

  return (
    <div className={`${styles.card} ${styles.linkCard}`}>
      <div className={styles.heroMark} aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7" />
          <path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7" />
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div className={styles.k}>{email || 'Партнёр'}</div>
        <div className={styles.linkUrl}>{link}</div>
        <span className={`${styles.chip} ${styles.chipStatic}`}>
          <i className={styles.dot} />
          Код {data.referral_code}
        </span>
      </div>
      <div className={styles.linkActions}>
        <button type="button" className={styles.button} onClick={copyLink} disabled={paused}>{copied ? 'Скопировано' : 'Скопировать'}</button>
        <button type="button" className={styles.buttonQuiet} onClick={shareLink} disabled={paused}>Поделиться</button>
      </div>
    </div>
  )
}

export function Chain({ month }: { month: MonthReport }) {
  const confirmed = month.status === 'confirmed' || month.status === 'paid'
  return (
    <div className={styles.chain}>
      <article className={`${styles.card} ${styles.chainCard}`}>
        <div className={styles.k}>Признанная платная выручка</div>
        <strong><Money value={month.paid_revenue_rub} /></strong>
      </article>
      <span className={styles.op}>−</span>
      <article className={`${styles.card} ${styles.chainCard} ${month.paid_provider_cost_rub == null ? styles.dashed : ''}`}>
        <div className={styles.k}>Фактические платные API-расходы</div>
        <strong><Money value={month.paid_provider_cost_rub} /></strong>
      </article>
      <span className={styles.op}>=</span>
      <article className={`${styles.card} ${styles.chainCard} ${month.qualified_profit_rub == null ? styles.dashed : ''}`}>
        <div className={styles.k}>Квалифицируемая прибыль</div>
        <strong><Money value={month.qualified_profit_rub} missing="Расчёт недоступен" /></strong>
      </article>
      <span className={styles.op}>×</span>
      <article className={`${styles.card} ${styles.chainCard} ${month.commission_rate == null ? styles.dashed : ''}`}>
        <div className={styles.k}>Ставка</div>
        <strong>{month.commission_rate == null ? <span className={styles.unknown}>Не настроена</span> : formatRate(month.commission_rate)}</strong>
      </article>
      <span className={styles.op}>=</span>
      <article className={`${styles.card} ${styles.chainCard} ${styles.accent} ${month.preliminary_commission_rub == null ? styles.dashed : ''}`}>
        <div className={styles.k}>{confirmed ? 'Комиссия' : 'Предварительная комиссия'}</div>
        <strong><Money value={month.preliminary_commission_rub} missing="Расчёт недоступен" /></strong>
      </article>
    </div>
  )
}

export function Reason({ month }: { month: MonthReport }) {
  const reason = blockReason(month.blocked_reason)
  if (!reason) return null
  return (
    <div className={styles.noteBox}>
      <b>{reason}.</b> Пока причина не снята, комиссия не подтверждается.
    </div>
  )
}

export function MonthTable({ months }: { months: MonthReport[] }) {
  if (months.length === 0) {
    return (
      <Empty
        title="Начислений пока нет"
        text="Они появятся после первого платного использования привлечённых пользователей."
      />
    )
  }
  return (
    <>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Период</th>
              <th>Выручка</th>
              <th>Расходы</th>
              <th>Прибыль</th>
              <th>Ставка</th>
              <th>Комиссия</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {months.map((month) => (
              <tr key={month.month} className={styles.rowLink}>
                <td><Link href={`/partner/accruals/${monthKey(month.month)}`}>{monthLabel(month.month)}</Link></td>
                <td><Money value={month.paid_revenue_rub} /></td>
                <td><Money value={month.paid_provider_cost_rub} /></td>
                <td><Money value={month.qualified_profit_rub} missing="Расчёт недоступен" /></td>
                <td>{month.commission_rate == null ? <span className={styles.unknown}>—</span> : formatRate(month.commission_rate)}</td>
                <td><Money value={month.preliminary_commission_rub} missing="Расчёт недоступен" /></td>
                <td><StatusChip month={month} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.cards}>
        {months.map((month) => (
          <Link key={month.month} href={`/partner/accruals/${monthKey(month.month)}`} className={`${styles.card} ${styles.mobileCard}`}>
            <div>
              <b>{monthLabel(month.month)}</b>
              <div className={styles.k}>Комиссия: <Money value={month.preliminary_commission_rub} missing="Расчёт недоступен" /></div>
            </div>
            <StatusChip month={month} />
          </Link>
        ))}
      </div>
    </>
  )
}

export function CommissionChart({ months }: { months: MonthReport[] }) {
  const rows = months.filter((month) => month.month)
  if (rows.length === 0) {
    return <Empty title="Нет данных за выбранный период" text="Когда появится расчёт месяца, график заполнится." />
  }
  const width = 640
  const height = 210
  const pad = 18
  const max = Math.max(...rows.map((month) => month.preliminary_commission_rub ?? 0), 1)
  const step = (width - pad * 2) / Math.max(rows.length - 1, 1)
  const points = rows.map((month, index) => {
    const value = month.preliminary_commission_rub
    const x = rows.length === 1 ? width / 2 : pad + index * step
    const y = value == null ? null : height - 36 - (value / max) * (height - 78)
    return { x, y, label: shortMonth(month.month), value, key: month.month }
  })
  const known = points.filter((point) => point.y != null)
  const line = known.length > 1
    ? known.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y?.toFixed(1)}`).join(' ')
    : known.length === 1
      ? `M${Math.max(pad, known[0].x - 36)} ${known[0].y?.toFixed(1)} L${Math.min(width - pad, known[0].x + 36)} ${known[0].y?.toFixed(1)}`
      : ''
  const area = known.length > 1
    ? `M${known[0].x} ${height - 30} ${known.map((point) => `L${point.x.toFixed(1)} ${point.y?.toFixed(1)}`).join(' ')} L${known[known.length - 1].x} ${height - 30} Z`
    : ''
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block', minHeight: 180 }} role="img" aria-label="Комиссия по месяцам">
        <defs>
          <linearGradient id="partner-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3DDB92" stopOpacity="0.32" />
            <stop offset="1" stopColor="#3DDB92" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="partner-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#3DDB92" />
            <stop offset="1" stopColor="#9BE15D" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((level) => (
          <line
            key={level}
            x1={pad}
            x2={width - pad}
            y1={height - 30 - level * (height - 70)}
            y2={height - 30 - level * (height - 70)}
            stroke="currentColor"
            strokeOpacity="0.28"
            strokeDasharray="3 5"
          />
        ))}
        {area && <path d={area} fill="url(#partner-area)" />}
        {line && <path d={line} fill="none" stroke="url(#partner-line)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
        {points.map((point) => (
          <g key={point.key}>
            {point.y != null && (
              <circle cx={point.x} cy={point.y} r="3.5" fill="#0A1510" stroke="#3DDB92" strokeWidth="2">
                <title>{`${point.label}: ${point.value == null ? 'расчёт недоступен' : formatRub(point.value)}`}</title>
              </circle>
            )}
            <text x={point.x} y={height - 10} textAnchor="middle" fontSize="13" fill="#8AA295">{point.label}{point.value == null ? '' : ` · ${formatRub(point.value)}`}</text>
          </g>
        ))}
      </svg>
      <p className={styles.chartNote}>Комиссия по месяцам, ₽</p>
    </div>
  )
}

export function ReferralDrawer({
  person,
  code,
  onClose,
}: {
  person: ReferralRow
  code: string
  onClose: () => void
}) {
  return (
    <>
    <button type="button" className={styles.overlay} aria-label="Закрыть" onClick={onClose} />
    <div className={styles.drawer} role="dialog" aria-label="Реферал">
      <div className={styles.bar}>
        <h2>Реферал</h2>
        <button type="button" className={styles.chip} onClick={onClose}>Закрыть</button>
      </div>
      <table className={styles.table}>
        <tbody>
          <tr><td>Пользователь</td><td>{person.masked_email || 'Скрыт'}</td></tr>
          <tr><td>Регистрация</td><td>{formatWhen(person.registered_at)}</td></tr>
          <tr><td>Статус</td><td>{person.has_paid_usage ? 'Есть платное использование' : 'Без платного использования'}</td></tr>
          <tr><td>Код привлечения</td><td>{code}</td></tr>
        </tbody>
      </table>
      <p className={styles.k}>Финансовые данные отдельных пользователей партнёру не показываются.</p>
    </div>
    </>
  )
}
