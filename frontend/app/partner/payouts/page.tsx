'use client'

import { useEffect, useState } from 'react'
import styles from '@/components/partner/partner.module.css'
import { usePartnerState } from '@/components/partner/PartnerFrame'
import { Empty, Money } from '@/components/partner/bits'
import { blockReason, partnerGet, partnerSend } from '@/lib/partner'

type Withdrawal = {
  id: string
  amount_rub: number | string
  status: 'pending' | 'paid' | 'rejected'
  partner_note: string | null
  decision_note: string | null
  created_at: string
  decided_at: string | null
}

type WithdrawalState = {
  ok: true
  available_rub: number | string | null
  paid_rub: number | string
  pending_rub: number | string
  blocked_months: { month: string; blocked_reason: string | null }[]
  requests: Withdrawal[]
}

const STATUS: Record<Withdrawal['status'], string> = {
  pending: 'Ожидает',
  paid: 'Выплачен',
  rejected: 'Отклонён',
}

function numberOrNull(value: number | string | null | undefined) {
  if (value == null || value === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

export default function PartnerPayoutsPage() {
  const { token } = usePartnerState()
  const [data, setData] = useState<WithdrawalState | null>(null)
  const [error, setError] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  function load() {
    if (!token) return
    partnerGet<WithdrawalState>('/api/partner/withdrawals', token).then((result) => {
      if (!result.ok) setError(true)
      else {
        setError(false)
        setData(result)
      }
    }).catch(() => setError(true))
  }

  useEffect(() => {
    load()
  }, [token])

  const available = numberOrNull(data?.available_rub)
  const pending = data?.requests.find((row) => row.status === 'pending')

  async function request() {
    if (!token) return
    const value = Number(amount.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) {
      setMessage('Укажите сумму больше нуля.')
      return
    }
    if (available != null && value > available + 0.001) {
      setMessage('Сумма больше доступной к выводу.')
      return
    }
    setBusy(true)
    const result = await partnerSend<{ ok: true }>('/api/partner/withdrawals', token, {
      amount_rub: Math.round(value * 100) / 100,
      note: note.trim(),
    })
    setBusy(false)
    if (!result.ok) {
      setMessage(result.error === 'amount_exceeds_available'
        ? 'Сумма больше доступной к выводу.'
        : result.error === 'request_pending'
          ? 'Уже есть запрос, который ждёт решения.'
          : result.error === 'not_available'
            ? 'Сумму к выводу сейчас нельзя посчитать.'
            : 'Отправить запрос не удалось.')
      return
    }
    setAmount('')
    setNote('')
    setMessage('Запрос отправлен. Выплату проводит администратор.')
    load()
  }

  return (
    <>
      <div className={styles.noteBox}>
        {blockReason('admin_payout_only')}. Деньги не уходят, пока администратор не отметит запрос выплаченным.
      </div>
      {error && <Empty title="Запросы недоступны" text="Сумму к выводу не показываем, пока данные не загрузятся." />}
      {!data && !error && <div className={styles.skeletonTall} />}
      {data && (
        <>
          <section className={styles.grid3}>
            <article className={styles.card}>
              <div className={styles.k}>Доступно к выводу</div>
              <div className={styles.value}><Money value={available} missing="Недоступно" /></div>
            </article>
            <article className={styles.card}>
              <div className={styles.k}>Ожидает решения</div>
              <div className={styles.value}><Money value={numberOrNull(data.pending_rub)} /></div>
            </article>
            <article className={styles.card}>
              <div className={styles.k}>Выплачено</div>
              <div className={styles.value}><Money value={numberOrNull(data.paid_rub)} /></div>
            </article>
          </section>
          {data.blocked_months.length > 0 && (
            <p className={styles.k}>Месяцы без фактической себестоимости или без ставки в доступную сумму не входят.</p>
          )}
          <section className={styles.card}>
            <h2>Запросить вывод</h2>
            {pending ? (
              <p className={styles.k}>Запрос на <Money value={numberOrNull(pending.amount_rub)} /> уже ожидает решения администратора.</p>
            ) : (
              <form
                className={styles.form}
                onSubmit={(event) => {
                  event.preventDefault()
                  request()
                }}
              >
                <label className={styles.formLabel}>
                  Сумма, ₽
                  <input className={styles.field} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
                </label>
                <label className={styles.formLabel}>
                  Комментарий
                  <input className={styles.field} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
                </label>
                {message && <p className={styles.k}>{message}</p>}
                <div>
                  <button type="submit" className={styles.button} disabled={busy || available == null || available <= 0}>
                    Запросить вывод
                  </button>
                </div>
              </form>
            )}
          </section>
          <section className={styles.card}>
            <h2>Запросы</h2>
            {data.requests.length === 0 && <Empty title="Запросов нет" text="Когда появится рассчитанная комиссия, её можно запросить к выводу." />}
            {data.requests.length > 0 && (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Сумма</th>
                    <th>Статус</th>
                    <th>Комментарий</th>
                  </tr>
                </thead>
                <tbody>
                  {data.requests.map((row) => (
                    <tr key={row.id}>
                      <td>{new Date(row.created_at).toLocaleDateString('ru-RU')}</td>
                      <td><Money value={numberOrNull(row.amount_rub)} /></td>
                      <td>{STATUS[row.status] || row.status}</td>
                      <td>{row.decision_note || row.partner_note || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </>
  )
}
