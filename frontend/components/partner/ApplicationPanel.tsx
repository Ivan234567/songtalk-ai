'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import styles from '@/components/partner/partner.module.css'
import { partnerGet, partnerSend } from '@/lib/partner'

type ApplicationState = {
  ok: true
  state: 'none' | 'pending' | 'rejected' | 'partner'
  note?: string | null
  created_at?: string
}

export function ApplicationPanel({ token }: { token: string }) {
  const [data, setData] = useState<ApplicationState | null>(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  async function load() {
    const result = await partnerGet<ApplicationState>('/api/partner/application', token)
    if (!result.ok) {
      setError('Не удалось загрузить заявку.')
      return
    }
    setError('')
    setData(result)
  }

  useEffect(() => {
    load().catch(() => setError('Не удалось загрузить заявку.'))
  }, [token])

  async function submit() {
    setSending(true)
    const result = await partnerSend<ApplicationState>('/api/partner/application', token)
    setSending(false)
    if (!result.ok) {
      setError(result.error === 'already_partner'
        ? 'Этот аккаунт уже партнёр.'
        : result.error === 'application_pending'
          ? 'Заявка уже на рассмотрении.'
          : 'Не удалось отправить заявку.')
      return
    }
    setData(result)
  }

  return (
    <section className={styles.card}>
      <h2>Заявка на партнёрство</h2>
      {error && <p className={styles.k} role="alert">{error}</p>}
      {!data && !error && <div className={styles.skeleton} />}
      {data?.state === 'pending' && (
        <div className={styles.warn}>
          <div>
            <b>Заявка на рассмотрении.</b> Ссылку выдаёт администратор после подтверждения. До решения статистики и кода нет.
          </div>
        </div>
      )}
      {data?.state === 'rejected' && (
        <>
          <div className={styles.warn}>
            <div>
              <b>Заявка отклонена.</b> {data.note || 'Ссылка не выдана.'}
            </div>
          </div>
          <button type="button" className={styles.button} style={{ marginTop: 16 }} disabled={sending} onClick={submit}>
            Подать снова
          </button>
        </>
      )}
      {data?.state === 'none' && (
        <div className={styles.empty}>
          <b>Партнёрская ссылка ещё не выдана</b>
          <p>Подайте заявку. Регистрация и эта форма ссылку не создают: её подтверждает администратор.</p>
          <button type="button" className={styles.button} disabled={sending} onClick={submit}>Подать заявку</button>
          <Link href="/partner/terms" className={styles.buttonQuiet}>Условия программы</Link>
        </div>
      )}
    </section>
  )
}
