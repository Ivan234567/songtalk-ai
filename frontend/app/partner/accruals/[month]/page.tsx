'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import styles from '@/components/partner/partner.module.css'
import { usePartnerState } from '@/components/partner/PartnerFrame'
import { Chain, Empty, Money, Reason, StatusChip } from '@/components/partner/bits'
import { monthLabel, partnerGet, type MonthReport } from '@/lib/partner'

export default function PartnerAccrualDetailPage() {
  const params = useParams<{ month: string }>()
  const { token } = usePartnerState()
  const [report, setReport] = useState<MonthReport | null>(null)
  const [error, setError] = useState(false)
  const month = typeof params?.month === 'string' ? params.month : ''
  const valid = /^\d{4}-\d{2}$/.test(month)

  useEffect(() => {
    if (!token || !valid) return
    let cancel = false
    partnerGet<MonthReport>(`/api/partner/months/${month}`, token).then((result) => {
      if (cancel) return
      if (!result.ok) setError(true)
      else setReport(result)
    }).catch(() => {
      if (!cancel) setError(true)
    })
    return () => {
      cancel = true
    }
  }, [token, month, valid])

  if (!valid) {
    return <Empty title="Начисление не найдено" text="Вернитесь к списку начислений." action={<Link href="/partner/accruals" className={styles.button}>К начислениям</Link>} />
  }

  return (
    <>
      <Link href="/partner/accruals" className={styles.chip} style={{ width: 'fit-content' }}>← Все начисления</Link>
      {error && <Empty title="Не удалось загрузить месяц" text="Детализация недоступна. Список начислений не изменился." />}
      {!report && !error && <div className={styles.skeletonTall} />}
      {report && (
        <>
          <section className={styles.card}>
            <h2>{monthLabel(report.month)} <StatusChip month={report} /></h2>
            <Chain month={report} />
            <Reason month={report} />
          </section>
          <section className={styles.card}>
            <h2>Подтверждение</h2>
            <table className={styles.table}>
              <tbody>
                <tr>
                  <td>Предварительный расчёт</td>
                  <td><Money value={report.preliminary_commission_rub} missing="Расчёт недоступен" /></td>
                </tr>
                <tr>
                  <td>Подтверждённая сумма</td>
                  <td>{report.blocked_reason ? <span className={styles.unknown}>Нет</span> : <Money value={report.preliminary_commission_rub} />}</td>
                </tr>
              </tbody>
            </table>
            <p className={styles.k}>Налог уже заложен в цену и второй раз не вычитается. Комиссия — ставка от квалифицируемой прибыли. Выплату проводит администратор по запросу.</p>
          </section>
        </>
      )}
    </>
  )
}
