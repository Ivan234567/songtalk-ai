'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import styles from '@/components/partner/partner.module.css'
import { usePartnerState } from '@/components/partner/PartnerFrame'
import { CommissionChart, Empty, LinkCard, Money, PersonName, Reason } from '@/components/partner/bits'
import { formatWhen, monthLabel, partnerGet, type PartnerMonths } from '@/lib/partner'

type ChartMode = 'reg' | 'rev' | 'com'

export default function PartnerOverviewPage() {
  const { token, overview } = usePartnerState()
  const [months, setMonths] = useState<PartnerMonths | null>(null)
  const [mode, setMode] = useState<ChartMode>('com')
  const data = overview?.status === 'ready' ? overview.data : null

  useEffect(() => {
    if (!token || !data) return
    let cancel = false
    partnerGet<PartnerMonths>('/api/partner/months', token).then((result) => {
      if (!cancel && result.ok) setMonths(result)
    }).catch(() => {})
    return () => {
      cancel = true
    }
  }, [token, data])

  if (!data) return null
  const month = data.month
  const confirmed = month?.status === 'confirmed' || month?.status === 'paid'

  return (
    <>
      <LinkCard />
      <section className={styles.grid4} aria-label="Показатели">
        <article className={`${styles.card} ${styles.kpi}`}>
          <div className={styles.kpiTop}>
            <span className={styles.k}>Приглашённые</span>
            <span className={styles.kpiIcon} aria-hidden><Icon d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8" /></span>
          </div>
          <div className={styles.value}>{data.referrals_total}</div>
        </article>
        <article className={`${styles.card} ${styles.kpi}`}>
          <div className={styles.kpiTop}>
            <span className={styles.k}>Активные</span>
            <span className={styles.kpiIcon} style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }} aria-hidden><Icon d="M12 21a9 9 0 100-18 9 9 0 000 18M12 8v5l3 3" /></span>
          </div>
          <div className={styles.unknown} style={{ marginTop: 10, fontStyle: 'normal' }}>
            Метрика появится после определения критериев активности
          </div>
        </article>
        <article className={`${styles.card} ${styles.kpi}`}>
          <div className={styles.kpiTop}>
            <span className={styles.k}>С платным использованием</span>
            <span className={styles.kpiIcon} aria-hidden><Icon d="M3 3v18h18M7 15l4-6 4 3 5-8" /></span>
          </div>
          <div className={styles.value}>{data.referrals_with_paid_usage}</div>
        </article>
        <article className={`${styles.card} ${styles.kpi} ${styles.accent}`}>
          <div className={styles.kpiTop}>
            <span className={styles.k}>{confirmed ? 'Комиссия' : 'Предварительная комиссия'}</span>
            <span className={styles.kpiIcon} aria-hidden><Icon d="M12 21a9 9 0 100-18 9 9 0 000 18M9 12l2 2 4-4" /></span>
          </div>
          <div className={styles.value}>
            {month ? <Money value={month.preliminary_commission_rub} missing="Расчёт недоступен" /> : '—'}
          </div>
          <span className={styles.k} style={{ display: 'block', marginTop: 6 }}>Не сумма к выплате</span>
        </article>
      </section>

      <section className={styles.gridWide}>
        <article className={styles.card}>
          <div className={styles.bar}>
            <div className={styles.tabs}>
              {([
                ['reg', 'Регистрации'],
                ['rev', 'Выручка'],
                ['com', 'Комиссия по месяцам'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={mode === key ? styles.tabOn : ''}
                  onClick={() => setMode(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {mode === 'com' ? (
            months ? <CommissionChart months={months.months} /> : <div className={styles.skeletonTall} />
          ) : (
            <Empty
              title="Нет дневного ряда"
              text="Сервер отдаёт комиссию по месяцам. Дневные регистрации и выручка отдельно не считаются, поэтому график не заполняется примерными числами."
            />
          )}
        </article>
        <article className={styles.card}>
          <h2>Как формируется комиссия</h2>
          {month?.ok === false || !month ? (
            <Empty title="Нет финансовой истории" text="Расчёт появится после платного использования." />
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              <div className={styles.line}><span className={styles.k}>Признанная выручка</span><b><Money value={month.paid_revenue_rub} /></b></div>
              <div className={styles.line}><span className={styles.k}>Фактические расходы</span><b><Money value={month.paid_provider_cost_rub} /></b></div>
              <div className={styles.line}><span className={styles.k}>Квалифицируемая прибыль</span><b><Money value={month.qualified_profit_rub} missing="недоступно" /></b></div>
              <div className={styles.line}><span className={styles.k}>Ставка</span><b>{formatRateSafe(month.commission_rate)}</b></div>
              <div className={styles.line}><span>Комиссия</span><b><Money value={month.preliminary_commission_rub} missing="Расчёт недоступен" /></b></div>
              <Reason month={month} />
              <p className={styles.k}>{monthLabel(month.month)}. Это предварительный расчёт, не сумма к выплате.</p>
            </div>
          )}
        </article>
      </section>

      <section className={styles.card}>
        <div className={styles.bar}>
          <h2>Последние привлечённые</h2>
          <Link href="/partner/referrals" className={styles.chip}>Все рефералы</Link>
        </div>
        {data.recent_referrals.length === 0 ? (
          <Empty title="Рефералов пока нет" text="Скопируйте ссылку и поделитесь ею." />
        ) : (
          <table className={styles.table}>
            <tbody>
              {data.recent_referrals.slice(0, 5).map((person, index) => (
                <tr key={`${person.registered_at}-${person.masked_email}`}>
                  <td><PersonName mail={person.masked_email || 'Скрыт'} index={index} /></td>
                  <td>{formatWhen(person.registered_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

function formatRateSafe(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—'
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value * 100)}%`
}
