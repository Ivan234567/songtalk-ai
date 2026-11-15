'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { captureReferralCode, recordReferralClick } from '@/lib/referral'
import styles from '../../auth/auth.module.css'

export default function ReferralLinkPage() {
  const params = useParams<{ code: string }>()
  const [status, setStatus] = useState<'pending' | 'accepted' | 'rejected' | 'failed'>('pending')

  useEffect(() => {
    const raw = typeof params?.code === 'string' ? decodeURIComponent(params.code) : ''
    const code = captureReferralCode(raw)
    if (!code) {
      setStatus('rejected')
      return
    }
    recordReferralClick(code)
      .then((result) => {
        if (result === 'recorded') setStatus('accepted')
        else if (result === 'rejected') setStatus('rejected')
        else setStatus('failed')
      })
      .catch(() => setStatus('failed'))
  }, [params?.code])

  const subtitle = status === 'pending'
    ? 'Проверяем ссылку…'
    : status === 'accepted'
      ? 'Ссылка принята. Можно создавать аккаунт.'
      : status === 'rejected'
        ? 'Эта ссылка не принимает новых приглашённых.'
        : 'Переход не записался. Без этого бонус не начислится.'

  return (
    <div className={styles.authPage}>
      <div className={styles.authCard}>
        <div className={styles.authAccentLine} />
        <div className={styles.authHeader}>
          <h1 className={styles.authTitle}>Приглашение</h1>
          <p className={styles.authSubtitle}>
            {subtitle}
            <span className={styles.authSubline} />
          </p>
        </div>
        {status === 'accepted' && (
          <a href="/auth/register" className={styles.authFooterLinkPrimary}>
            Создать аккаунт
          </a>
        )}
      </div>
    </div>
  )
}
