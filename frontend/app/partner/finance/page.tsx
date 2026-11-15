'use client'

import { useEffect, useState } from 'react'
import styles from '@/components/partner/partner.module.css'
import { usePartnerState } from '@/components/partner/PartnerFrame'
import { Chain, Empty, MonthTable, Reason, StatusChip } from '@/components/partner/bits'
import { monthLabel, partnerGet, type PartnerMonths } from '@/lib/partner'

export default function PartnerFinancePage() {
  const { token, overview } = usePartnerState()
  const [months, setMonths] = useState<PartnerMonths | null>(null)
  const month = overview?.status === 'ready' ? overview.data.month : null

  useEffect(() => {
    if (!token) return
    let cancel = false
    partnerGet<PartnerMonths>('/api/partner/months', token).then((result) => {
      if (!cancel && result.ok) setMonths(result)
    }).catch(() => {})
    return () => {
      cancel = true
    }
  }, [token])

  return (
    <>
      <div className={styles.warn}>
        Комиссия равна ставке от квалифицируемой прибыли. Налог уже заложен в цену и второй раз не вычитается. Выплату проводит администратор по запросу из раздела выплат.
      </div>
      {month && month.ok !== false ? (
        <section className={styles.card}>
          <h2>Расчёт за {monthLabel(month.month)} <StatusChip month={month} /></h2>
          <Chain month={month} />
          <Reason month={month} />
        </section>
      ) : (
        <section className={styles.card}>
          <Empty title="Нет финансовой истории" text="Расчёт появится после первого платного использования привлечённых пользователей." />
        </section>
      )}
      <section className={styles.grid2}>
        <article className={styles.card}>
          <h2>Откуда берутся деньги</h2>
          <p>Выручка признаётся от фактического использования средств, пополненных через платёжный шлюз. Само пополнение выручкой не считается. Учитываются только фактические платные API-расходы.</p>
        </article>
        <article className={styles.card}>
          <h2>Что не учитывается</h2>
          <p>Приветственный бонус 50 ₽ и бонусные средства, ручные пополнения и административные корректировки, расходы за счёт бонусов, неразобранный старый остаток.</p>
        </article>
      </section>
      <section className={styles.card}>
        <h2>История по месяцам (МСК)</h2>
        {months ? <MonthTable months={[...months.months].reverse()} /> : <div className={styles.skeleton} />}
        {months?.truncated && <p className={styles.k}>Показаны последние 36 месяцев.</p>}
      </section>
    </>
  )
}
