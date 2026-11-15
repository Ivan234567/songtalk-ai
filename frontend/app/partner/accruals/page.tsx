'use client'

import { useEffect, useState } from 'react'
import styles from '@/components/partner/partner.module.css'
import { usePartnerState } from '@/components/partner/PartnerFrame'
import { Money, MonthTable } from '@/components/partner/bits'
import { partnerGet, type PartnerMonths, type PartnerPayouts } from '@/lib/partner'

export default function PartnerAccrualsPage() {
  const { token, overview } = usePartnerState()
  const [data, setData] = useState<PartnerMonths | null>(null)
  const [payouts, setPayouts] = useState<PartnerPayouts | null>(null)
  const [error, setError] = useState(false)
  const current = overview?.status === 'ready' ? overview.data.month : null

  useEffect(() => {
    if (!token) return
    let cancel = false
    partnerGet<PartnerMonths>('/api/partner/months', token).then((result) => {
      if (cancel) return
      if (!result.ok) setError(true)
      else setData(result)
    }).catch(() => {
      if (!cancel) setError(true)
    })
    partnerGet<PartnerPayouts>('/api/partner/payouts', token).then((result) => {
      if (!cancel && result.ok) setPayouts(result)
    }).catch(() => {})
    return () => {
      cancel = true
    }
  }, [token])

  const paidOut = payouts ? payouts.payouts.reduce((sum, payout) => sum + payout.amount_rub, 0) : null

  return (
    <>
      <section className={styles.grid3}>
        <article className={styles.card}>
          <div className={styles.k}>Предварительная комиссия</div>
          <div className={styles.value}>
            <Money value={current?.preliminary_commission_rub} missing="Не рассчитана" />
          </div>
        </article>
        <article className={styles.card}>
          <div className={styles.k}>Расчёт месяца</div>
          <div className={styles.value}>{current?.blocked_reason ? 'Заблокирован' : current ? 'Рассчитан' : '—'}</div>
          <div className={styles.k}>Налог уже заложен в цену и второй раз не вычитается</div>
        </article>
        <article className={styles.card}>
          <div className={styles.k}>Выплачено</div>
          <div className={styles.value}>{payouts ? <Money value={paidOut} /> : '—'}</div>
        </article>
      </section>
      <section className={styles.card}>
        <h2>Начисления</h2>
        {error && <p className={styles.k} role="alert">История начислений недоступна.</p>}
        {!data && !error && <div className={styles.skeleton} />}
        {data && <MonthTable months={[...data.months].reverse()} />}
        {data?.truncated && <p className={styles.k}>Показаны последние 36 месяцев.</p>}
      </section>
    </>
  )
}
