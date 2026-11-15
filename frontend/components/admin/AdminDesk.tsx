'use client'

import { useEffect, useState } from 'react'
import styles from './admin.module.css'
import { blockReason, formatRate, partnerGet, partnerSend } from '@/lib/partner'
import { getStoredBackendToken } from '@/lib/backend-jwt'
import { useAdminSection } from './AdminFrame'

type Status = 'active' | 'paused' | 'disabled'
type Filter = 'all' | Status

type Partner = {
  id: string
  email: string
  referral_code: string
  status: Status
  commission_rate: number | string | null
  referrals_total: number
  preliminary_commission_rub: number | string | null
  commission_blocked_reason: string | null
  issued_at?: string | null
  is_admin?: boolean
}

type PartnerList = {
  ok: true
  month: string
  truncated: boolean
  partners: Partner[]
}

type Application = {
  id: string
  email: string
  status: 'pending' | 'approved' | 'rejected'
  commission_rate: number | null
  referral_code: string | null
  decision_note: string | null
  created_at: string
  decided_at: string | null
}

type ApplicationList = { ok: true; applications: Application[] }
type Decision = { ok: true; status: string; referral_code?: string | null; commission_rate?: number | null }
type Saved = { ok: true; status: Status; commission_rate: number; referral_code: string }

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'active', label: 'Активен' },
  { id: 'paused', label: 'Пауза' },
  { id: 'disabled', label: 'Отключён' },
]

function numberOrNull(value: number | string | null | undefined) {
  if (value == null || value === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function rub(value: number) {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function monthTitle(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null
  const [year, month] = value.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)))
    .replace(/\s*г\.\s*$/, '')
}

function formatDay(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('ru-RU')
}

function statusLabel(status: Status) {
  if (status === 'active') return 'Активен'
  if (status === 'paused') return 'Пауза'
  return 'Отключён'
}

function statusClass(status: Status) {
  if (status === 'active') return styles.pillOk
  if (status === 'paused') return styles.pillWarn
  return styles.pillMuted
}

function percentInput(value: number | string | null) {
  const number = numberOrNull(value)
  if (number == null) return ''
  return String(Math.round(number * 1000) / 10)
}

function Money({ value, unpaid }: { value: number | null; unpaid?: boolean }) {
  if (value == null) return <span className={styles.unavailable}>Недоступно</span>
  return (
    <>
      {rub(value)} <i className={styles.cur}>₽</i>
      {unpaid && <span className={`${styles.pill} ${styles.pillWarn}`}>не к выплате</span>}
    </>
  )
}

function Head({ title, text }: { title: string; text: string }) {
  return (
    <div className={styles.head}>
      <div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
    </div>
  )
}

function Unavailable({ title, text, onRetry }: { title: string; text: string; onRetry?: () => void }) {
  return (
    <div className={`${styles.card} ${styles.empty}`}>
      <b>{title}</b>
      {text}
      {onRetry && (
        <div style={{ marginTop: 14 }}>
          <button type="button" className={`${styles.btn} ${styles.small}`} onClick={onRetry}>Повторить</button>
        </div>
      )}
    </div>
  )
}

function useApplications() {
  const [rows, setRows] = useState<Application[] | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancel = false
    async function load() {
      const token = getStoredBackendToken()
      if (!token) return
      const result = await partnerGet<ApplicationList>('/api/admin/applications', token)
      if (cancel) return
      if (!result.ok) {
        setRows(null)
        setError('Список заявок недоступен.')
        return
      }
      setError('')
      setRows(result.applications)
    }
    load().catch(() => {
      if (!cancel) setError('Список заявок недоступен.')
    })
    return () => {
      cancel = true
    }
  }, [reload])

  return { rows, error, reload: () => setReload((value) => value + 1) }
}

function usePartners(query: string, status: Filter, reloadKey: number) {
  const [list, setList] = useState<PartnerList | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancel = false
    async function load() {
      const token = getStoredBackendToken()
      if (!token) return
      const params = new URLSearchParams()
      if (query) params.set('q', query)
      if (status !== 'all') params.set('status', status)
      const result = await partnerGet<PartnerList>(`/api/admin/partners${params.size ? `?${params}` : ''}`, token)
      if (cancel) return
      if (!result.ok) {
        setList(null)
        setError('Список партнёров недоступен.')
        return
      }
      setError('')
      setList(result)
    }
    load().catch(() => {
      if (!cancel) setError('Список партнёров недоступен.')
    })
    return () => {
      cancel = true
    }
  }, [query, status, reloadKey])

  return { list, error, setList }
}

function commissionSum(list: PartnerList | null) {
  if (!list || list.truncated) return { amount: null as number | null, unpaid: false }
  let amount = 0
  let unpaid = false
  for (const row of list.partners) {
    const value = numberOrNull(row.preliminary_commission_rub)
    if (value == null) return { amount: null, unpaid: false }
    amount += value
  }
  return { amount, unpaid }
}

const RECON_GROUPS = [
  ['unknown_api_cost', 'Неизвестная стоимость API'],
  ['tariff_estimate', 'Предварительная оценка расходов'],
  ['unconfirmed_cost', 'Неподтверждённая себестоимость'],
  ['blocked_month', 'Заблокированные месяцы'],
] as const

type Problem = {
  group: string
  email: string
  month: string
  amount_rub: number | string | null
  detail: string
}

type Recon = {
  ok: true
  truncated: boolean
  refunds_tracked: boolean
  problems: Problem[]
}

function useReconciliation(enabled: boolean) {
  const [data, setData] = useState<Recon | null>(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancel = false
    async function load() {
      const token = getStoredBackendToken()
      if (!token) return
      const result = await partnerGet<Recon>('/api/admin/reconciliation', token)
      if (cancel) return
      if (!result.ok) {
        setData(null)
        setError('Сверка недоступна.')
        return
      }
      setError('')
      setData(result)
    }
    load().catch(() => {
      if (!cancel) setError('Сверка недоступна.')
    })
    return () => {
      cancel = true
    }
  }, [enabled, reloadKey])

  return { data, error, reload: () => setReloadKey((value) => value + 1) }
}

type Accrual = {
  partner_id: string
  email: string
  referral_code: string
  month: string
  paid_revenue_rub: number | string | null
  paid_provider_cost_rub: number | string | null
  qualified_profit_rub: number | string | null
  commission_rate: number | string | null
  preliminary_commission_rub: number | string | null
  blocked_reason: string | null
  confirmed: boolean
}

type AccrualList = {
  ok: true
  truncated: boolean
  confirmation_available: boolean
  accruals: Accrual[]
}

function useAccruals(enabled: boolean) {
  const [data, setData] = useState<AccrualList | null>(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancel = false
    async function load() {
      const token = getStoredBackendToken()
      if (!token) return
      const result = await partnerGet<AccrualList>('/api/admin/accruals', token)
      if (cancel) return
      if (!result.ok) {
        setData(null)
        setError('Начисления недоступны.')
        return
      }
      setError('')
      setData(result)
    }
    load().catch(() => {
      if (!cancel) setError('Начисления недоступны.')
    })
    return () => {
      cancel = true
    }
  }, [enabled, reloadKey])

  return { data, error, reload: () => setReloadKey((value) => value + 1) }
}

function currentMonthSum(
  data: AccrualList | null,
  error: string,
  field: 'paid_revenue_rub' | 'paid_provider_cost_rub' | 'qualified_profit_rub',
) {
  if (error) return { value: null as number | string | null, note: 'Начисления недоступны' }
  if (!data) return { value: 'Загрузка' as number | string | null, note: '' }
  if (data.truncated) return { value: null, note: 'Список длиннее 100, сумму не складываем' }
  const latest = data.accruals.reduce((max, row) => (row.month > max ? row.month : max), '')
  const rows = latest ? data.accruals.filter((row) => row.month === latest) : []
  let amount = 0
  for (const row of rows) {
    const value = numberOrNull(row[field])
    if (value == null) return { value: null, note: 'Нельзя сложить, пока у кого-то сумма недоступна' }
    amount += value
  }
  return { value: amount, note: 'По выданным партнёрам за месяц' }
}

type Payout = {
  id: string
  email: string
  referral_code: string
  created_at: string
  month: string | null
  amount_rub: number | string
  recorded_by: string | null
}

type PayoutList = {
  ok: true
  truncated: boolean
  total_count: number
  total_amount_rub: number | string
  recording_available: boolean
  recording_blocked_reason: string | null
  payouts: Payout[]
}

function usePayouts(enabled: boolean) {
  const [data, setData] = useState<PayoutList | null>(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancel = false
    async function load() {
      const token = getStoredBackendToken()
      if (!token) return
      const result = await partnerGet<PayoutList>('/api/admin/payouts', token)
      if (cancel) return
      if (!result.ok) {
        setData(null)
        setError('История выплат недоступна.')
        return
      }
      setError('')
      setData(result)
    }
    load().catch(() => {
      if (!cancel) setError('История выплат недоступна.')
    })
    return () => {
      cancel = true
    }
  }, [enabled, reloadKey])

  return { data, error, reload: () => setReloadKey((value) => value + 1) }
}

type WithdrawalRequest = {
  id: string
  partner_id: string
  email: string
  referral_code: string
  amount_rub: number | string
  status: 'pending' | 'paid' | 'rejected'
  partner_note: string | null
  decision_note: string | null
  created_at: string
  decided_at: string | null
}

type WithdrawalList = {
  ok: true
  truncated: boolean
  pending_count: number
  requests: WithdrawalRequest[]
}

function useWithdrawals(enabled: boolean) {
  const [data, setData] = useState<WithdrawalList | null>(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancel = false
    async function load() {
      const token = getStoredBackendToken()
      if (!token) return
      const result = await partnerGet<WithdrawalList>('/api/admin/withdrawals', token)
      if (cancel) return
      if (!result.ok) {
        setData(null)
        setError('Запросы на вывод недоступны.')
        return
      }
      setError('')
      setData(result)
    }
    load().catch(() => {
      if (!cancel) setError('Запросы на вывод недоступны.')
    })
    return () => {
      cancel = true
    }
  }, [enabled, reloadKey])

  return { data, error, reload: () => setReloadKey((value) => value + 1) }
}

type AuditEntry = {
  id: string
  created_at: string
  actor_email: string | null
  action: string
  partner_email: string | null
  before_value: string | null
  after_value: string | null
}

type AuditList = {
  ok: true
  truncated: boolean
  entries: AuditEntry[]
}

const AUDIT_ACTIONS: Record<string, string> = {
  status: 'Смена статуса',
  commission_rate: 'Смена ставки',
  referral_code: 'Смена промокода',
  code_issued: 'Выдача ссылки',
  application_rejected: 'Отклонение заявки',
  account_deleted: 'Удаление аккаунта',
  withdrawal_paid: 'Выплата по запросу',
  withdrawal_rejected: 'Отклонение вывода',
}

function useJournal(enabled: boolean) {
  const [data, setData] = useState<AuditList | null>(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancel = false
    async function load() {
      const token = getStoredBackendToken()
      if (!token) return
      const result = await partnerGet<AuditList>('/api/admin/audit', token)
      if (cancel) return
      if (!result.ok) {
        setData(null)
        setError('Журнал недоступен.')
        return
      }
      setError('')
      setData(result)
    }
    load().catch(() => {
      if (!cancel) setError('Журнал недоступен.')
    })
    return () => {
      cancel = true
    }
  }, [enabled, reloadKey])

  return { data, error, reload: () => setReloadKey((value) => value + 1) }
}

function auditText(action: string, value: string | null) {
  if (!value) return null
  if (action === 'status' || action === 'application_rejected') {
    if (value === 'active') return 'Активен'
    if (value === 'paused') return 'Пауза'
    if (value === 'disabled') return 'Отключён'
    if (value === 'pending') return 'Ожидает'
    if (value === 'rejected') return 'Отклонена'
  }
  if (action === 'commission_rate') {
    const number = numberOrNull(value)
    return number == null ? value : formatRate(number)
  }
  return value
}

function formatStamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function confirmationLabel(data: AccrualList | null, error: string) {
  if (error) return { value: 'Недоступно', note: 'Подтверждение нельзя вывести без расчёта' }
  if (!data) return { value: 'Загрузка', note: '' }
  const blocked = data.accruals.filter((row) => row.blocked_reason)
  if (blocked.length === 0) return { value: 'Да', note: 'Налог в цене уже заложен и второй раз не вычитается' }
  return { value: 'Нет', note: `Заблокировано строк: ${blocked.length}` }
}

function paidTotal(data: PayoutList | null, error: string) {
  if (error) return { value: null as number | string | null, note: 'История выплат недоступна' }
  if (!data) return { value: 'Загрузка' as number | string | null, note: '' }
  const amount = numberOrNull(data.total_amount_rub)
  if (amount == null) return { value: null, note: 'Сумму выплат нельзя прочитать' }
  return {
    value: amount,
    note: amount === 0 ? 'Записанных выплат нет' : 'Сумма записанных выплат',
  }
}

function Overview({
  applications,
  recon,
  accruals,
  payouts,
  withdrawals,
  onOpen,
  onReconcile,
  onPayouts,
}: {
  applications: ReturnType<typeof useApplications>
  recon: ReturnType<typeof useReconciliation>
  accruals: ReturnType<typeof useAccruals>
  payouts: ReturnType<typeof usePayouts>
  withdrawals: ReturnType<typeof useWithdrawals>
  onOpen: () => void
  onReconcile: () => void
  onPayouts: () => void
}) {
  const [reloadKey, setReloadKey] = useState(0)
  const partners = usePartners('', 'all', reloadKey)
  const month = monthTitle(partners.list?.month || null)
  const count = partners.list && !partners.list.truncated ? partners.list.partners.length : null
  const invited = partners.list && !partners.list.truncated
    ? partners.list.partners.reduce((sum, row) => sum + row.referrals_total, 0)
    : null
  const commission = commissionSum(partners.list)
  const pending = applications.rows?.filter((row) => row.status === 'pending').length
  const revenue = currentMonthSum(accruals.data, accruals.error, 'paid_revenue_rub')
  const cost = currentMonthSum(accruals.data, accruals.error, 'paid_provider_cost_rub')
  const profit = currentMonthSum(accruals.data, accruals.error, 'qualified_profit_rub')
  const paid = paidTotal(payouts.data, payouts.error)
  const metrics: { label: string; value: number | string | null; note: string; hero?: boolean; money?: boolean; unpaid?: boolean }[] = [
    { label: 'Партнёры', value: count, note: partners.list?.truncated ? 'Список длиннее 100, точное число недоступно' : '' },
    { label: 'Приглашённые', value: invited, note: '' },
    { label: 'Признанная платная выручка', value: revenue.value, note: revenue.note, hero: true, money: true },
    { label: 'Платные расходы API', value: cost.value, note: cost.note, money: true },
    { label: 'Квалифицируемая прибыль', value: profit.value, note: profit.note, hero: true, money: true },
    {
      label: 'Предварительная комиссия',
      value: commission.amount,
      note: commission.amount == null
        ? (partners.list?.truncated
          ? 'Список длиннее 100, сумму не складываем'
          : 'Нельзя сложить, пока у кого-то из партнёров сумма недоступна')
        : 'По выданным партнёрам за месяц',
      hero: true,
      money: true,
      unpaid: commission.unpaid,
    },
    { label: 'Подтверждено', value: confirmationLabel(accruals.data, accruals.error).value, note: confirmationLabel(accruals.data, accruals.error).note },
    { label: 'Выплачено', value: paid.value, note: paid.note, money: true },
    {
      label: 'Финансовые блокировки',
      value: recon.error || recon.data?.truncated
        ? null
        : recon.data
          ? recon.data.problems.length
          : 'Загрузка',
      note: recon.error
        ? 'Сверка недоступна'
        : recon.data?.truncated
          ? 'Больше 100, точное число недоступно'
          : 'Открытые проблемы сверки',
    },
  ]

  return (
    <>
      <Head
        title="Обзор"
        text={month ? `Состояние партнёрской программы за ${month}.` : 'Состояние партнёрской программы.'}
      />
      {!partners.list && !partners.error ? (
        <div className={styles.skeleton} />
      ) : partners.error ? (
        <Unavailable title="Показатели недоступны" text="Данные не загрузились. Ноль здесь не показываем." onRetry={() => setReloadKey((value) => value + 1)} />
      ) : (
        <div className={styles.grid}>
          {metrics.map((item) => (
            <article key={item.label} className={`${styles.metric} ${item.hero ? styles.metricHero : ''}`}>
              <span className={styles.hint}>{item.label}</span>
              <div className={styles.metricValue}>
                {item.value == null ? (
                  <span className={styles.unavailable}>Недоступно</span>
                ) : item.value === 'Загрузка' ? (
                  <span className={styles.hint}>Загрузка</span>
                ) : item.money && typeof item.value === 'number' ? (
                  <Money value={item.value} unpaid={item.unpaid} />
                ) : item.value}
              </div>
              {item.note && <span className={styles.metricNote}>{item.note}</span>}
            </article>
          ))}
        </div>
      )}
      <div className={styles.split}>
        <section className={styles.card}>
          <h3>Запросы на вывод</h3>
          <div className={styles.metricValue} style={{ marginTop: 12 }}>
            {withdrawals.error
              ? <span className={styles.unavailable}>Недоступно</span>
              : withdrawals.data
                ? withdrawals.data.pending_count
                : <span className={styles.hint}>Загрузка</span>}
          </div>
          <span className={styles.metricNote}>ожидает выплаты</span>
          {withdrawals.error && <p className={styles.error}>{withdrawals.error}</p>}
          <div style={{ marginTop: 14 }}>
            <button type="button" className={styles.btn} onClick={onPayouts}>Открыть выплаты</button>
          </div>
        </section>
        <section className={styles.card}>
          <h3>Очередь заявок</h3>
          <div className={styles.metricValue} style={{ marginTop: 12 }}>
            {applications.error
              ? <span className={styles.unavailable}>Недоступно</span>
              : pending == null
                ? <span className={styles.hint}>Загрузка</span>
                : pending}
          </div>
          <span className={styles.metricNote}>ожидает решения</span>
          {applications.error && <p className={styles.error}>{applications.error}</p>}
          <div style={{ marginTop: 14 }}>
            <button type="button" className={styles.btn} onClick={onOpen}>Открыть заявки</button>
          </div>
        </section>
        <section className={styles.card}>
          <h3>Финансовые блокировки</h3>
          {recon.error && <p className={styles.hint}>Сверка недоступна.</p>}
          {recon.data && recon.data.problems.length === 0 && <p className={styles.hint}>Проблемных операций нет.</p>}
          {recon.data && recon.data.problems.length > 0 && (
            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              {RECON_GROUPS.map(([key, label]) => {
                const count = recon.data?.problems.filter((row) => row.group === key).length || 0
                if (!count) return null
                return <div key={key}><b style={{ fontWeight: 500 }}>{label}</b><div className={styles.hint}>{count}</div></div>
              })}
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <button type="button" className={styles.btn} onClick={onReconcile}>Открыть сверку</button>
          </div>
        </section>
      </div>
    </>
  )
}

function PartnerCard({
  row,
  month,
  onBack,
  onChange,
  onDeleted,
}: {
  row: Partner
  month: string | null
  onBack: () => void
  onChange: (row: Partner) => void
  onDeleted: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [status, setStatus] = useState<Status>(row.status)
  const [rate, setRate] = useState(percentInput(row.commission_rate))
  const [acceptStop, setAcceptStop] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [message, setMessage] = useState('')
  const [deleteMessage, setDeleteMessage] = useState('')
  const [promo, setPromo] = useState('')
  const [promoMessage, setPromoMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [guests, setGuests] = useState<{ email: string; attributed_at: string }[] | null>(null)
  const [guestError, setGuestError] = useState(false)
  const [guestTruncated, setGuestTruncated] = useState(false)
  const link = `${window.location.origin}/r/${row.referral_code}`
  const stopping = status !== 'active' && status !== row.status
  const emailMatches = confirmEmail.trim().toLowerCase() === (row.email || '').toLowerCase()
  const issued = formatDay(row.issued_at)
  const amount = numberOrNull(row.preliminary_commission_rub)

  useEffect(() => {
    const token = getStoredBackendToken()
    if (!token) return
    let cancel = false
    partnerGet<{ ok: true; total: number; truncated: boolean; referrals: { email: string; attributed_at: string }[] }>(
      `/api/admin/partners/${row.id}/referrals`,
      token,
    ).then((result) => {
      if (cancel) return
      if (!result.ok) {
        setGuestError(true)
        setGuests(null)
        return
      }
      setGuestError(false)
      setGuests(result.referrals)
      setGuestTruncated(result.truncated)
    }).catch(() => {
      if (!cancel) setGuestError(true)
    })
    return () => {
      cancel = true
    }
  }, [row.id])

  async function save() {
    const token = getStoredBackendToken()
    if (!token) return
    const percent = Number(rate.replace(',', '.'))
    if (rate.trim() === '' || !Number.isFinite(percent) || percent < 0 || percent > 99) {
      setMessage('Ставка от 0 до 99%.')
      return
    }
    setBusy(true)
    const result = await partnerSend<Saved>(`/api/admin/partners/${row.id}`, token, {
      status,
      commission_rate: percent / 100,
    })
    setBusy(false)
    if (!result.ok) {
      setMessage('Сохранить не удалось.')
      return
    }
    if (result.referral_code !== row.referral_code) {
      setStatus(row.status)
      setRate(percentInput(row.commission_rate))
      setMessage('Сохранить не удалось. Код не менялся.')
      return
    }
    setMessage('Сохранено')
    setAcceptStop(false)
    onChange({ ...row, status: result.status, commission_rate: result.commission_rate })
  }

  async function issueCode() {
    const token = getStoredBackendToken()
    if (!token) return
    const next = promo.trim()
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/.test(next)) {
      setPromoMessage('Промокод: латиница, цифры, дефис или подчёркивание, от 2 до 32 символов.')
      return
    }
    setBusy(true)
    const result = await partnerSend<{ ok: true; referral_code: string; previous_code: string }>(
      `/api/admin/partners/${row.id}/code`,
      token,
      { code: next },
    )
    setBusy(false)
    if (!result.ok || !result.referral_code) {
      setPromoMessage(result.error === 'code_taken'
        ? 'Этот промокод уже занят.'
        : 'Выдать промокод не удалось.')
      return
    }
    setPromo('')
    setPromoMessage(result.previous_code && result.previous_code !== result.referral_code
      ? 'Промокод выдан. Прежняя ссылка тоже открывается.'
      : 'Промокод выдан.')
    onChange({ ...row, referral_code: result.referral_code })
  }

  async function remove() {
    const token = getStoredBackendToken()
    if (!token || row.is_admin) return
    setBusy(true)
    const result = await partnerSend<{ ok: true }>(`/api/admin/partners/${row.id}/delete`, token, {
      confirm_email: confirmEmail.trim(),
    })
    setBusy(false)
    if (!result.ok) {
      setDeleteMessage(result.error === 'admin_account'
        ? 'Аккаунт администратора не удаляется.'
        : result.error === 'email_mismatch'
          ? 'Введите email этого аккаунта.'
          : 'Удалить аккаунт не удалось.')
      return
    }
    onDeleted()
  }

  return (
    <div className={styles.stack}>
      <div className={styles.bar}>
        <button type="button" className={`${styles.btn} ${styles.small}`} onClick={onBack}>К списку</button>
      </div>
      <section className={`${styles.card} ${styles.cardHi} ${styles.tier}`}>
        <div className={styles.hint}>Кто это</div>
        <h2 style={{ wordBreak: 'break-all' }}>{row.email || '—'}</h2>
        <div className={styles.big}>{row.referral_code}</div>
        <div className={styles.line}>
          <code>{link}</code>
          <button
            type="button"
            className={`${styles.btn} ${styles.small}`}
            onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true)).catch(() => {})}
          >
            {copied ? 'Скопировано' : 'Копировать ссылку'}
          </button>
        </div>
        <div className={styles.facts}>
          <div><small className={styles.hint}>Статус</small><span className={`${styles.pill} ${statusClass(row.status)}`}>{statusLabel(row.status)}</span></div>
          <div><small className={styles.hint}>Ставка</small>{formatRate(numberOrNull(row.commission_rate))}</div>
          <div><small className={styles.hint}>Код выдан</small>{issued || <span className={styles.unavailable}>Недоступно</span>}</div>
        </div>
        <small className={styles.hint}>Свой промокод заменяет ссылку в кабинете. Прежняя ссылка продолжит открываться.</small>
        <label className={styles.field}>
          Свой промокод
          <input
            className={`${styles.input} ${styles.search}`}
            value={promo}
            autoComplete="off"
            placeholder="Например, SUMMER"
            onChange={(event) => { setPromo(event.target.value); setPromoMessage('') }}
          />
        </label>
        {promoMessage && (
          <div className={promoMessage.startsWith('Промокод выдан') ? styles.success : styles.error} role="status">{promoMessage}</div>
        )}
        <div>
          <button
            type="button"
            className={styles.btn}
            disabled={busy || !promo.trim() || promo.trim().toUpperCase() === row.referral_code.toUpperCase()}
            onClick={issueCode}
          >
            Выдать промокод
          </button>
        </div>
        {row.status !== 'active' && (
          <div className={styles.note}>Новые приглашения остановлены. Уже пришедшие люди остаются у партнёра.</div>
        )}
      </section>
      <section className={`${styles.card} ${styles.tier}`}>
        <div className={styles.hint}>Этот месяц{month ? ` · ${month}` : ''}</div>
        <div className={styles.facts}>
          <div><small className={styles.hint}>Приглашено</small><span className={styles.big} style={{ fontSize: 24, letterSpacing: 0 }}>{row.referrals_total}</span></div>
          <div>
            <small className={styles.hint}>Предварительная комиссия</small>
            <span style={{ font: '600 20px var(--hd)' }}>
              <Money value={amount} />
            </span>
          </div>
        </div>
        <div className={styles.formula}>
          <b>Как считается.</b> Платная выручка минус платная себестоимость API, затем ставка партнёра. Бонус, старый баланс, пополнения и ручные корректировки в эту прибыль не входят.
        </div>
        <div>
          <h3 style={{ marginBottom: 8 }}>Приглашённые</h3>
          {guestError && <div className={styles.hint}>Список приглашённых недоступен.</div>}
          {!guestError && !guests && <div className={styles.hint}>Загрузка</div>}
          {guests && guests.length === 0 && <div className={styles.hint}>Приглашённых нет</div>}
          {guests && guests.length > 0 && guests.map((guest) => (
            <div key={`${guest.email}-${guest.attributed_at}`} className={styles.listHead}>
              <b style={{ fontWeight: 500 }}>{guest.email}</b>
              <span className={styles.hint}>{formatDay(guest.attributed_at)}</span>
            </div>
          ))}
          {guestTruncated && <div className={styles.hint}>Показаны первые 500.</div>}
        </div>
      </section>
      <section className={`${styles.card} ${styles.tier}`}>
        <div className={styles.hint}>Решение</div>
        <div className={styles.seg} role="group" aria-label="Статус">
          {(['active', 'paused', 'disabled'] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={status === item}
              onClick={() => { setStatus(item); setAcceptStop(false); setMessage('') }}
            >
              {statusLabel(item)}
            </button>
          ))}
        </div>
        <label className={styles.field}>
          Ставка, % (от 0 до 99)
          <input className={`${styles.input} ${styles.narrow}`} inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} />
        </label>
        {stopping && (
          <>
            <div className={styles.note}>Новые приглашения остановятся. Люди, которые уже пришли, останутся.</div>
            <label className={styles.check}>
              <input type="checkbox" checked={acceptStop} onChange={(event) => setAcceptStop(event.target.checked)} />
              Понимаю: новые приглашения остановятся, уже пришедшие люди останутся
            </label>
          </>
        )}
        {message && <div className={message === 'Сохранено' ? styles.success : styles.error} role="status">{message}</div>}
        <div className={styles.line}>
          <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={busy || (stopping && !acceptStop)} onClick={save}>
            Сохранить
          </button>
        </div>
      </section>
      <section className={styles.danger}>
        <h3>Удаление аккаунта</h3>
        <p className={styles.hint} style={{ margin: 0 }}>
          Удаляется аккаунт целиком: вход, кабинет и ссылка. Приглашённые люди остаются. Аккаунт администратора не удаляется.
        </p>
        <label className={styles.field}>
          Введите email этого аккаунта
          <input className={styles.input} autoComplete="off" value={confirmEmail} onChange={(event) => { setConfirmEmail(event.target.value); setDeleteMessage('') }} />
        </label>
        {row.is_admin && confirmEmail.trim() && <div className={styles.error}>Аккаунт администратора не удаляется.</div>}
        {!row.is_admin && confirmEmail.trim() && !emailMatches && <div className={styles.error}>Введите email этого аккаунта.</div>}
        {deleteMessage && <div className={styles.error} role="alert">{deleteMessage}</div>}
        <div>
          <button type="button" className={`${styles.btn} ${styles.dangerBtn}`} disabled={busy || row.is_admin || !emailMatches} onClick={remove}>
            Удалить аккаунт
          </button>
        </div>
        {row.is_admin && <small className={styles.hint}>Для этого аккаунта удаление закрыто: это администратор.</small>}
      </section>
    </div>
  )
}

function ApplicationCard({
  row,
  onBack,
  onDecided,
}: {
  row: Application
  onBack: () => void
  onDecided: () => Promise<void>
}) {
  const [rate, setRate] = useState('')
  const [promo, setPromo] = useState('')
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [issued, setIssued] = useState<string | null>(row.referral_code)
  const [savedRate, setSavedRate] = useState<number | null>(numberOrNull(row.commission_rate))
  const code = issued || row.referral_code
  const link = code ? `${window.location.origin}/r/${code}` : ''

  async function approve() {
    const token = getStoredBackendToken()
    if (!token) return
    const raw = rate.trim().replace(',', '.')
    const percent = raw === '' ? null : Number(raw)
    if (percent != null && (!Number.isFinite(percent) || percent < 0 || percent > 99)) {
      setMessage('Ставка от 0 до 99%.')
      return
    }
    if (promo.trim() && !/^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/.test(promo.trim())) {
      setMessage('Промокод: латиница, цифры, дефис или подчёркивание, от 2 до 32 символов. Ссылка не выдана.')
      return
    }
    setBusy(true)
    const result = await partnerSend<Decision>(`/api/admin/applications/${row.id}/approve`, token, {
      commission_rate: percent == null ? null : percent / 100,
      code: promo.trim() ? promo.trim() : null,
    })
    setBusy(false)
    if (!result.ok || !result.referral_code) {
      setMessage(!result.ok && result.error === 'code_taken'
        ? 'Этот промокод уже занят. Ссылка не выдана.'
        : 'Подтвердить заявку не удалось. Ссылка не выдана.')
      return
    }
    setIssued(result.referral_code)
    setSavedRate(percent == null ? 0.4 : percent / 100)
    setMessage('')
    await onDecided()
  }

  async function reject() {
    const token = getStoredBackendToken()
    if (!token) return
    setBusy(true)
    const result = await partnerSend<Decision>(`/api/admin/applications/${row.id}/reject`, token, {
      note: note.trim(),
    })
    setBusy(false)
    if (!result.ok) {
      setMessage('Отклонить заявку не удалось.')
      return
    }
    setMessage('')
    await onDecided()
  }

  return (
    <div className={styles.stack}>
      <div className={styles.bar}>
        <button type="button" className={`${styles.btn} ${styles.small}`} onClick={onBack}>К списку</button>
      </div>
      <section className={styles.card}>
        <h2 style={{ wordBreak: 'break-all' }}>{row.email}</h2>
        <div className={styles.facts} style={{ marginTop: 12 }}>
          <div><small className={styles.hint}>Дата заявки</small>{formatDay(row.created_at) || '—'}</div>
          <div>
            <small className={styles.hint}>Статус</small>
            {row.status === 'pending' && <span className={`${styles.pill} ${styles.pillWarn}`}>Ожидает</span>}
            {row.status === 'approved' && <span className={`${styles.pill} ${styles.pillOk}`}>Подтверждена</span>}
            {row.status === 'rejected' && <span className={`${styles.pill} ${styles.pillMuted}`}>Отклонена</span>}
          </div>
        </div>
      </section>
      {row.status === 'approved' || issued ? (
        <section className={`${styles.card} ${styles.cardHi} ${styles.stack}`}>
          <h3>Заявка подтверждена</h3>
          {code ? (
            <>
              <div className={styles.facts}>
                <div><small className={styles.hint}>Код</small><span className={styles.big}>{code}</span></div>
                <div><small className={styles.hint}>Ставка</small>{formatRate(savedRate ?? numberOrNull(row.commission_rate))}</div>
              </div>
              <div className={styles.line}>
                <code>{link}</code>
                <button type="button" className={`${styles.btn} ${styles.small}`} onClick={() => navigator.clipboard.writeText(link).catch(() => {})}>Копировать ссылку</button>
              </div>
            </>
          ) : (
            <p className={styles.hint}>Ссылка не выдана.</p>
          )}
        </section>
      ) : row.status === 'rejected' ? (
        <section className={`${styles.card} ${styles.stack}`}>
          <h3>Заявка отклонена</h3>
          <p className={styles.hint} style={{ margin: 0 }}>{row.decision_note || 'Без заметки'}</p>
          <p className={styles.hint} style={{ margin: 0 }}>Ссылка не создавалась.</p>
        </section>
      ) : (
        <section className={`${styles.card} ${styles.cardHi} ${styles.stack}`}>
          <label className={styles.field}>
            Промокод
            <input className={`${styles.input} ${styles.search}`} value={promo} autoComplete="off" placeholder="Например, SUMMER" onChange={(event) => setPromo(event.target.value)} />
          </label>
          <small className={styles.hint}>Пустое поле — код вида SPK выдастся сам. Свой код появится только после подтверждения.</small>
          <label className={styles.field}>
            Ставка, % (от 0 до 99)
            <input className={`${styles.input} ${styles.narrow}`} inputMode="decimal" placeholder="40" value={rate} onChange={(event) => setRate(event.target.value)} />
          </label>
          <small className={styles.hint}>Пустое поле означает 40%.</small>
          <label className={styles.field}>
            Заметка к отклонению
            <textarea className={styles.input} rows={3} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
            <span className={styles.counter}>{note.length} / 500</span>
          </label>
          {message && <div className={styles.error} role="alert">{message}</div>}
          <div className={styles.line}>
            <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={busy} onClick={approve}>Подтвердить</button>
            <button type="button" className={styles.btn} disabled={busy} onClick={reject}>Отклонить</button>
          </div>
        </section>
      )}
    </div>
  )
}

function Partners({ applications }: { applications: ReturnType<typeof useApplications> }) {
  const { partnersTab, setPartnersTab } = useAdminSection()
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [reloadKey, setReloadKey] = useState(0)
  const [opened, setOpened] = useState<Partner | null>(null)
  const [requestId, setRequestId] = useState<string | null>(null)
  const partners = usePartners(query, filter, reloadKey)
  const month = monthTitle(partners.list?.month || null)

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(draft.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [draft])

  const request = applications.rows?.find((row) => row.id === requestId) || null
  if (opened) {
    return (
      <PartnerCard
        key={opened.id}
        row={opened}
        month={partners.list?.month ? month : null}
        onBack={() => setOpened(null)}
        onChange={(next) => {
          setOpened(next)
          partners.setList((current) => current && ({
            ...current,
            partners: current.partners.map((item) => item.id === next.id ? { ...item, ...next } : item),
          }))
        }}
        onDeleted={() => {
          setOpened(null)
          setReloadKey((value) => value + 1)
        }}
      />
    )
  }
  if (request) {
    return (
      <ApplicationCard
        key={request.id}
        row={request}
        onBack={() => setRequestId(null)}
        onDecided={async () => {
          applications.reload()
          setReloadKey((value) => value + 1)
        }}
      />
    )
  }

  const pending = applications.rows?.filter((row) => row.status === 'pending') || []
  const decided = applications.rows?.filter((row) => row.status !== 'pending') || []
  const rows = partners.list?.partners || []

  return (
    <>
      <Head title="Партнёры" text="Выдача ссылок и решения по партнёрам." />
      <div className={styles.bar}>
        <div className={styles.seg} role="group" aria-label="Раздел партнёров">
          <button type="button" aria-pressed={partnersTab === 'issued'} onClick={() => setPartnersTab('issued')}>Выданные</button>
          <button type="button" aria-pressed={partnersTab === 'applications'} onClick={() => setPartnersTab('applications')}>
            Заявки{pending.length ? ` · ${pending.length}` : ''}
          </button>
        </div>
      </div>
      {partnersTab === 'issued' ? (
        <>
          <div className={styles.bar}>
            <input
              className={`${styles.input} ${styles.search}`}
              placeholder="Поиск по email и коду"
              aria-label="Поиск по email и коду"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className={styles.seg} role="group" aria-label="Статус">
              {FILTERS.map((item) => (
                <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>
              ))}
            </div>
          </div>
          <div className={`${styles.card} ${styles.list}`}>
            {partners.error && <Unavailable title="Список партнёров недоступен" text="" onRetry={() => setReloadKey((value) => value + 1)} />}
            {!partners.list && !partners.error && <div className={styles.skeleton} />}
            {partners.list && rows.length === 0 && (
              <div className={styles.empty}>
                <b>Партнёров нет</b>
                {query || filter !== 'all' ? 'Ничего не найдено по этим условиям.' : 'Партнёр появляется здесь после подтверждения заявки.'}
              </div>
            )}
            {rows.map((row) => {
              const amount = numberOrNull(row.preliminary_commission_rub)
              return (
                <div key={row.id} className={styles.row}>
                  <div className={styles.who}>
                    <span className={styles.avatar}>{(row.email[0] || '?').toUpperCase()}</span>
                    <div style={{ minWidth: 0 }}>
                      <b>{row.email || '—'}</b>
                      {row.is_admin && <span className={`${styles.pill} ${styles.pillMuted}`}>администратор</span>}
                    </div>
                  </div>
                  <span className={styles.code}>{row.referral_code}</span>
                  <span><span className={`${styles.pill} ${statusClass(row.status)}`}>{statusLabel(row.status)}</span></span>
                  <span>{formatRate(numberOrNull(row.commission_rate))}</span>
                  <span className={styles.hint}>приглашено {row.referrals_total}</span>
                  <span>
                    <Money value={amount} />
                  </span>
                  <button type="button" className={`${styles.btn} ${styles.small}`} onClick={() => setOpened(row)}>Карточка</button>
                </div>
              )
            })}
          </div>
          {partners.list?.truncated && <p className={styles.hint}>Показаны первые 100.</p>}
        </>
      ) : (
        <>
          {applications.error && <Unavailable title="Список заявок недоступен" text="" onRetry={applications.reload} />}
          {!applications.rows && !applications.error && <div className={styles.skeleton} />}
          {applications.rows && (
            <>
              <div className={`${styles.card} ${styles.cardHi} ${styles.list}`}>
                <div className={styles.listHead}><h3>Ожидает</h3></div>
                {pending.length === 0 && <div className={styles.empty}><b>Заявок нет</b></div>}
                {pending.map((row) => (
                  <div key={row.id} className={styles.listHead}>
                    <div>
                      <b style={{ fontWeight: 500 }}>{row.email}</b>
                      <div className={styles.hint}>{formatDay(row.created_at)}</div>
                    </div>
                    <div className={styles.line}>
                      <span className={`${styles.pill} ${styles.pillWarn}`}>Ожидает</span>
                      <button type="button" className={`${styles.btn} ${styles.small} ${styles.primary}`} onClick={() => setRequestId(row.id)}>Решить</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className={`${styles.card} ${styles.list}`} style={{ marginTop: 20, background: 'none' }}>
                <div className={styles.listHead}><h3 style={{ color: 'var(--mu)' }}>Подтверждённые и отклонённые</h3></div>
                {decided.length === 0 && <div className={styles.empty}>Подтверждённых и отклонённых заявок пока нет</div>}
                {decided.map((row) => (
                  <div key={row.id} className={styles.listHead}>
                    <div>
                      <b style={{ fontWeight: 500 }}>{row.email}</b>
                      <div className={styles.hint}>{formatDay(row.decided_at || row.created_at)}{row.referral_code ? ` · ${row.referral_code}` : ''}</div>
                    </div>
                    <div className={styles.line}>
                      {row.status === 'approved'
                        ? <span className={`${styles.pill} ${styles.pillOk}`}>Подтверждена</span>
                        : <span className={`${styles.pill} ${styles.pillMuted}`}>Отклонена</span>}
                      <button type="button" className={`${styles.btn} ${styles.small}`} onClick={() => setRequestId(row.id)}>Открыть</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}

function rateLabel(value: number | string | null) {
  const number = numberOrNull(value)
  return formatRate(number)
}

function Accruals({ accruals }: { accruals: ReturnType<typeof useAccruals> }) {
  const [selected, setSelected] = useState<string | null>(null)
  const rows = accruals.data?.accruals || []
  const current = rows.find((row) => `${row.partner_id}:${row.month}` === selected) || null
  if (current) return <AccrualDetail row={current} onBack={() => setSelected(null)} />
  return (
    <>
      <Head title="Начисления" text="Комиссия — ставка от квалифицируемой прибыли. Налог в цене уже заложен и второй раз не вычитается." />
      {accruals.error && <Unavailable title="Начисления недоступны" text="Данные не загрузились. Ноль здесь не показываем." onRetry={accruals.reload} />}
      {!accruals.data && !accruals.error && <div className={styles.skeleton} />}
      {accruals.data && rows.length === 0 && (
        <div className={`${styles.card} ${styles.empty}`}><b>Начислений нет</b></div>
      )}
      {accruals.data && rows.length > 0 && (
        <div className={`${styles.card} ${styles.list}`}>
          <div className={styles.accrualHead}>
            <span>Партнёр</span>
            <span>Месяц</span>
            <span>Платная выручка</span>
            <span>Платная себестоимость</span>
            <span>Квалифицируемая прибыль</span>
            <span>Ставка</span>
            <span>Предварительная комиссия</span>
            <span>Подтверждено</span>
            <span>Причина блокировки</span>
          </div>
          {rows.map((row) => {
            const commission = numberOrNull(row.preliminary_commission_rub)
            const confirmed = row.blocked_reason == null && commission != null
            return (
              <button
                key={`${row.partner_id}:${row.month}`}
                type="button"
                className={styles.accrual}
                onClick={() => setSelected(`${row.partner_id}:${row.month}`)}
              >
                <span><b style={{ fontWeight: 500 }}>{row.email}</b></span>
                <span><small className={styles.cellLabel}>Месяц</small>{monthTitle(row.month) || row.month}</span>
                <span><small className={styles.cellLabel}>Платная выручка</small><Money value={numberOrNull(row.paid_revenue_rub)} /></span>
                <span><small className={styles.cellLabel}>Платная себестоимость</small><Money value={numberOrNull(row.paid_provider_cost_rub)} /></span>
                <span><small className={styles.cellLabel}>Квалифицируемая прибыль</small><Money value={numberOrNull(row.qualified_profit_rub)} /></span>
                <span><small className={styles.cellLabel}>Ставка</small>{rateLabel(row.commission_rate)}</span>
                <span><small className={styles.cellLabel}>Предварительная комиссия</small><Money value={commission} /></span>
                <span><small className={styles.cellLabel}>Подтверждено</small>{confirmed ? 'Да' : 'Нет'}</span>
                <span className={styles.hint}><small className={styles.cellLabel}>Причина блокировки</small>{blockReason(row.blocked_reason) || ''}</span>
              </button>
            )
          })}
        </div>
      )}
      {accruals.data?.truncated && <p className={styles.hint}>Показаны первые 100.</p>}
      {accruals.data && <p className={styles.hint}>Строка открывает расчёт месяца. Неизвестная себестоимость и пустая ставка оставляют комиссию недоступной.</p>}
    </>
  )
}

function AccrualDetail({ row, onBack }: { row: Accrual; onBack: () => void }) {
  const commission = numberOrNull(row.preliminary_commission_rub)
  const confirmed = row.blocked_reason == null && commission != null
  const reason = blockReason(row.blocked_reason)
  return (
    <>
      <div className={styles.bar}>
        <button type="button" className={styles.btn} onClick={onBack}>К списку</button>
      </div>
      <section className={`${styles.card} ${styles.stack}`}>
        <h2>{row.email} · {monthTitle(row.month) || row.month}</h2>
        <div className={styles.formula}>
          <b>Платная выручка</b> <Money value={numberOrNull(row.paid_revenue_rub)} />
          {' − '}
          <b>платная себестоимость API</b> <Money value={numberOrNull(row.paid_provider_cost_rub)} />
          {' = '}
          <b>квалифицируемая прибыль</b> <Money value={numberOrNull(row.qualified_profit_rub)} />
          <br />
          Прибыль × <b>ставка</b> {rateLabel(row.commission_rate)}
          {' = '}
          <b>предварительная комиссия</b> <Money value={commission} />
        </div>
        <div className={styles.note}>Не входят в расчёт: бонус, старый баланс, пополнения, пакеты, текущий баланс, ручные корректировки. Убыток на следующий месяц не переносится.</div>
        <div className={styles.facts}>
          <div><small className={styles.hint}>Подтверждено</small>{confirmed ? 'Да' : 'Нет'}</div>
          {reason && <div><small className={styles.hint}>Причина блокировки</small>{reason}</div>}
        </div>
        <p className={styles.hint}>Неизвестная стоимость и тарифная оценка не равны нулю и блокируют расчёт.</p>
      </section>
    </>
  )
}

const WITHDRAWAL_STATUS: Record<WithdrawalRequest['status'], string> = {
  pending: 'Ожидает',
  paid: 'Выплачен',
  rejected: 'Отклонён',
}

function Payouts({
  payouts,
  withdrawals,
}: {
  payouts: ReturnType<typeof usePayouts>
  withdrawals: ReturnType<typeof useWithdrawals>
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const requests = withdrawals.data?.requests || []
  const history = payouts.data?.payouts || []

  async function decide(id: string, decision: 'pay' | 'reject') {
    const token = getStoredBackendToken()
    if (!token) return
    setBusyId(id)
    const result = await partnerSend<{ ok: true }>(`/api/admin/withdrawals/${id}/${decision}`, token, {})
    setBusyId(null)
    if (!result.ok) {
      setMessage(result.error === 'not_available'
        ? 'Выплатить нельзя: доступная сумма больше не покрывает запрос. Его можно отклонить.'
        : result.error === 'already_decided'
          ? 'По этому запросу решение уже принято.'
          : 'Сохранить решение не удалось.')
      return
    }
    setMessage(decision === 'pay' ? 'Выплата отмечена.' : 'Запрос отклонён.')
    withdrawals.reload()
    payouts.reload()
  }

  return (
    <>
      <Head title="Выплаты" text="Партнёр запрашивает вывод. Выплату отмечает только администратор." />
      {message && <p className={styles.hint}>{message}</p>}
      {withdrawals.error && <Unavailable title="Запросы на вывод недоступны" text="Данные не загрузились. Ноль здесь не показываем." onRetry={withdrawals.reload} />}
      {!withdrawals.data && !withdrawals.error && <div className={styles.skeleton} />}
      {withdrawals.data && requests.length === 0 && (
        <div className={`${styles.card} ${styles.empty}`}><b>Запросов нет</b>Когда партнёр запросит вывод, он появится здесь.</div>
      )}
      {withdrawals.data && requests.length > 0 && (
        <div className={`${styles.card} ${styles.list}`}>
          <div className={styles.payoutHead}>
            <span>Дата</span>
            <span>Партнёр</span>
            <span>Сумма</span>
            <span>Статус</span>
            <span>Решение</span>
          </div>
          {requests.map((row) => (
            <div key={row.id} className={styles.payout}>
              <span><small className={styles.cellLabel}>Дата</small>{formatDay(row.created_at) || row.created_at}</span>
              <span>
                <b style={{ fontWeight: 500 }}>{row.email}</b>
                {(row.partner_note || row.decision_note) && (
                  <div className={styles.hint}>{row.decision_note || row.partner_note}</div>
                )}
              </span>
              <span><small className={styles.cellLabel}>Сумма</small><Money value={numberOrNull(row.amount_rub)} /></span>
              <span>
                <small className={styles.cellLabel}>Статус</small>
                <span className={`${styles.pill} ${row.status === 'paid' ? styles.pillOk : row.status === 'rejected' ? styles.pillMuted : styles.pillWarn}`}>
                  {WITHDRAWAL_STATUS[row.status]}
                </span>
              </span>
              <span>
                {row.status === 'pending' ? (
                  <span className={styles.line}>
                    <button type="button" className={`${styles.btn} ${styles.small} ${styles.primary}`} disabled={busyId === row.id} onClick={() => decide(row.id, 'pay')}>Выплатить</button>
                    <button type="button" className={`${styles.btn} ${styles.small}`} disabled={busyId === row.id} onClick={() => decide(row.id, 'reject')}>Отклонить</button>
                  </span>
                ) : (
                  <span className={styles.hint}>{formatDay(row.decided_at) || ''}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {withdrawals.data?.truncated && <p className={styles.hint}>Показаны первые 100 запросов.</p>}
      {payouts.error && <Unavailable title="История выплат недоступна" text="Сумму уже выплаченного нельзя показать." onRetry={payouts.reload} />}
      {payouts.data && history.length > 0 && (
        <div className={`${styles.card} ${styles.list}`} style={{ marginTop: 16 }}>
          <div className={styles.listHead}><h3>Ранее записанные выплаты</h3></div>
          {history.map((row) => (
            <div key={row.id} className={styles.payout}>
              <span>{formatDay(row.created_at) || row.created_at}</span>
              <span>{row.email}</span>
              <span><Money value={numberOrNull(row.amount_rub)} /></span>
              <span className={styles.hint}>{monthTitle(row.month) || ''}</span>
              <span />
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function Journal({ journal }: { journal: ReturnType<typeof useJournal> }) {
  const rows = journal.data?.entries || []
  return (
    <>
      <Head title="Журнал" text="Кто и что менял в программе." />
      {journal.error && <Unavailable title="Журнал недоступен" text="Это не то же самое, что «Записей нет». Данные не загрузились." onRetry={journal.reload} />}
      {!journal.data && !journal.error && <div className={styles.skeleton} />}
      {journal.data && rows.length === 0 && (
        <div className={`${styles.card} ${styles.empty}`}><b>Записей нет</b>Новых действий ещё не было. Старые сюда не переносились.</div>
      )}
      {journal.data && rows.length > 0 && (
        <div className={`${styles.card} ${styles.list}`}>
          <div className={styles.journalHead}>
            <span>Когда</span>
            <span>Кто</span>
            <span>Действие</span>
            <span>Было</span>
            <span>Стало</span>
          </div>
          {rows.map((row) => (
            <div key={row.id} className={styles.journal}>
              <span><small className={styles.cellLabel}>Когда</small>{formatStamp(row.created_at)}</span>
              <span><small className={styles.cellLabel}>Кто</small>{row.actor_email || <span className={styles.unavailable}>Недоступно</span>}</span>
              <span>
                <small className={styles.cellLabel}>Действие</small>
                {AUDIT_ACTIONS[row.action] || row.action}
                {row.partner_email && <div className={styles.hint}>{row.partner_email}</div>}
              </span>
              <span><small className={styles.cellLabel}>Было</small>{auditText(row.action, row.before_value) || ''}</span>
              <span><small className={styles.cellLabel}>Стало</small>{auditText(row.action, row.after_value) || ''}</span>
            </div>
          ))}
        </div>
      )}
      {journal.data?.truncated && <p className={styles.hint}>Показаны первые 100.</p>}
      {journal.data && <p className={styles.hint}>Выплата и отказ по запросу на вывод попадают сюда. Старые действия сюда не переносились.</p>}
    </>
  )
}

function Reconciliation({ recon }: { recon: ReturnType<typeof useReconciliation> }) {
  const rows = recon.data?.problems || []
  const known = new Set<string>(RECON_GROUPS.map(([key]) => key))
  const extra = [...new Set(rows.map((row) => row.group).filter((group) => !known.has(group)))]
  const groups = [...RECON_GROUPS.map(([key, label]) => [key, label] as const), ...extra.map((key) => [key, key] as const)]
  return (
    <>
      <Head title="Сверка" text="Операции, из-за которых комиссию нельзя подтвердить." />
      {recon.error && <Unavailable title="Сверка недоступна" text="Данные не загрузились. Ноль здесь не показываем." onRetry={recon.reload} />}
      {!recon.data && !recon.error && <div className={styles.skeleton} />}
      {recon.data && rows.length === 0 && (
        <div className={`${styles.card} ${styles.empty}`}><b>Проблемных операций нет</b></div>
      )}
      {recon.data && rows.length > 0 && (
        <div className={`${styles.card} ${styles.list}`}>
          {groups.map(([key, label]) => {
            const group = rows.filter((row) => row.group === key)
            if (!group.length) return null
            return (
              <div key={key}>
                <div className={styles.group}>{label}</div>
                {group.map((row, index) => (
                  <div key={`${key}-${row.email}-${row.month}-${index}`} className={styles.recon}>
                    <span>{row.email}</span>
                    <span>{monthTitle(row.month) || row.month}</span>
                    <span><Money value={numberOrNull(row.amount_rub)} /></span>
                    <span className={styles.hint}>{row.detail}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
      {recon.data?.truncated && <p className={styles.hint}>Показаны первые 100.</p>}
      {recon.data && (
        <p className={styles.hint}>Возвраты в журнале не ведутся, поэтому сверка их не показывает. Подтвердить операцию отсюда нельзя.</p>
      )}
    </>
  )
}

export function AdminDesk() {
  const { screen, setScreen, setPartnersTab, setPending, setPayoutPending } = useAdminSection()
  const applications = useApplications()
  const recon = useReconciliation(screen === 'overview' || screen === 'reconcile')
  const accruals = useAccruals(screen === 'overview' || screen === 'accruals')
  const payouts = usePayouts(screen === 'overview' || screen === 'payouts')
  const withdrawals = useWithdrawals(true)
  const journal = useJournal(screen === 'journal')

  useEffect(() => {
    if (applications.error) setPending(null)
    else if (applications.rows) setPending(applications.rows.filter((row) => row.status === 'pending').length)
  }, [applications.rows, applications.error, setPending])

  useEffect(() => {
    if (withdrawals.error) setPayoutPending(null)
    else if (withdrawals.data) setPayoutPending(withdrawals.data.pending_count)
  }, [withdrawals.data, withdrawals.error, setPayoutPending])

  if (screen === 'overview') {
    return (
      <Overview
        applications={applications}
        recon={recon}
        accruals={accruals}
        payouts={payouts}
        withdrawals={withdrawals}
        onOpen={() => {
          setPartnersTab('applications')
          setScreen('partners')
        }}
        onReconcile={() => setScreen('reconcile')}
        onPayouts={() => setScreen('payouts')}
      />
    )
  }
  if (screen === 'partners') return <Partners applications={applications} />
  if (screen === 'reconcile') return <Reconciliation recon={recon} />
  if (screen === 'accruals') return <Accruals accruals={accruals} />
  if (screen === 'payouts') return <Payouts payouts={payouts} withdrawals={withdrawals} />
  return <Journal journal={journal} />
}
