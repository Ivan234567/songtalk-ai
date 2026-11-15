import { getStoredBackendToken } from '@/lib/backend-jwt'

export type PartnerStatus = 'active' | 'paused' | 'disabled'

export type MonthReport = {
  ok: boolean
  error?: string
  month?: string
  paid_revenue_rub?: number | null
  paid_provider_cost_rub?: number | null
  excluded_bonus_provider_cost_rub?: number | null
  excluded_legacy_provider_cost_rub?: number | null
  qualified_profit_rub?: number | null
  preliminary_commission_rub?: number | null
  commission_rate?: number | null
  status?: string | null
  blocked_reason?: string | null
  payable?: boolean
  confirmation_available?: boolean
  payout_available?: boolean
  payout_blocked_reason?: string | null
  loss_carryforward?: boolean
}

export type ReferralRow = {
  masked_email: string | null
  registered_at: string
  has_paid_usage: boolean
}

export type PartnerOverview = {
  ok: true
  status: PartnerStatus
  referral_code: string
  commission_rate: number | null
  referrals_total: number
  referrals_with_paid_usage: number
  month: MonthReport
  recent_referrals: ReferralRow[]
}

export type PartnerReferrals = {
  ok: true
  page: number
  page_size: number
  total: number
  referrals: ReferralRow[]
}

export type PartnerMonths = {
  ok: true
  truncated: boolean
  months: MonthReport[]
}

export type PartnerPayouts = {
  ok: true
  recording_available: boolean
  recording_blocked_reason: string | null
  payouts: { amount_rub: number; created_at: string }[]
}

export type PartnerFailure = {
  ok: false
  status: number
  error: string
}

const API = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '')

export async function partnerGet<T>(path: string, token = getStoredBackendToken()): Promise<T | PartnerFailure> {
  if (!token) return { ok: false, status: 401, error: 'unauthorized' }
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.ok) {
    return {
      ok: false,
      status: response.status,
      error: typeof data?.error === 'string' ? data.error : 'partner_read_failed',
    }
  }
  return data as T
}

export async function partnerSend<T>(
  path: string,
  token: string,
  body?: unknown,
): Promise<T | PartnerFailure> {
  if (!token) return { ok: false, status: 401, error: 'unauthorized' }
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.ok) {
    return {
      ok: false,
      status: response.status,
      error: typeof data?.error === 'string' ? data.error : 'partner_read_failed',
    }
  }
  return data as T
}

export function formatRub(value: number): string {
  return `${new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} ₽`
}

export function formatRate(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return 'Не определено'
  return `${new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 2,
  }).format(value * 100)}%`
}

export function formatWhen(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function monthKey(value: string | undefined): string {
  return (value || '').slice(0, 7)
}

export function monthLabel(value: string | undefined): string {
  if (!value) return 'Период'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  const label = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(date)
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function blockReason(code: string | null | undefined): string | null {
  if (!code) return null
  if (code === 'commission_rate_missing') return 'Ставка вознаграждения не настроена'
  if (code === 'cost_not_actual') return 'Есть расходы без подтверждённой фактической стоимости'
  if (code === 'tax_rule_not_defined') return 'Налоговые правила программы ещё не определены'
  if (code === 'admin_payout_only') return 'Выплату проводит администратор после запроса из кабинета'
  if (code === 'payout_manual_outside_system') return 'Выплату проводит администратор после запроса из кабинета'
  return 'Расчёт заблокирован'
}

export function accrualLabel(month: MonthReport): { label: string; blocked: boolean } {
  if (month.blocked_reason) return { label: 'Заблокировано', blocked: true }
  if (month.status === 'paid') return { label: 'Выплачено', blocked: false }
  return { label: 'Рассчитано', blocked: false }
}

export function shortMonth(value: string | undefined): string {
  if (!value) return ''
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(date).replace('.', '')
}

export function statusTitle(status: PartnerStatus): string | null {
  if (status === 'paused') return 'Программа на паузе'
  if (status === 'disabled') return 'Программа отключена'
  return null
}

export function statusText(status: PartnerStatus): string | null {
  if (status === 'active') return null
  return `Партнёрский статус: ${status}. Новые привлечения по партнёрской ссылке не принимаются, но ранее привлечённые пользователи остаются в истории и продолжают учитываться по действующим правилам.`
}
