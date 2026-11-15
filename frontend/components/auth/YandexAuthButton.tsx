'use client'

import { useState } from 'react'
import { startYandexAuth } from '@/lib/yandex-auth'
import { commitRegistrationPromo } from '@/lib/referral'
import { rememberAuthNext } from '@/lib/auth-next'
import styles from '../../app/auth/auth.module.css'

type YandexAuthButtonProps = {
  disabled?: boolean
  returnTo?: string
  referralCode?: string
}

export default function YandexAuthButton({ disabled = false, returnTo, referralCode }: YandexAuthButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = async () => {
    setError(null)
    setLoading(true)
    try {
      if (referralCode !== undefined) {
        const promoResult = await commitRegistrationPromo(referralCode)
        if (promoResult === 'invalid') {
          setLoading(false)
          setError('Промокод: латиница, цифры, дефис или подчёркивание, от 2 до 32 символов.')
          return
        }
        if (promoResult === 'rejected') {
          setLoading(false)
          setError('Такой промокод не найден или партнёр сейчас не принимает приглашения.')
          return
        }
        if (promoResult === 'failed') {
          setLoading(false)
          setError('Промокод не удалось проверить. Вход через Яндекс не начат.')
          return
        }
      }
      if (returnTo) rememberAuthNext(returnTo)
      await startYandexAuth()
    } catch {
      setLoading(false)
      setError('Не удалось открыть вход через Яндекс. Попробуйте ещё раз.')
    }
  }

  return (
    <>
      <div className={styles.authSocialDivider} role="separator" aria-label="или">
        <span>или</span>
      </div>
      <button
        type="button"
        className={styles.authBtnYandex}
        onClick={handleClick}
        disabled={disabled || loading}
      >
        <svg className={styles.authYandexIcon} viewBox="0 0 24 24" aria-hidden="true">
          <rect width="24" height="24" rx="6" fill="#FC3F1D" />
          <path
            fill="#fff"
            d="M8 6.4h3.55c2.46 0 4.05 1.42 4.05 3.55 0 1.62-.92 2.78-2.42 3.25L16.7 17.6h-2.52l-3.16-4.05H9.85V17.6H8V6.4zm1.85 1.85v3.35h1.55c1.32 0 2.12-.68 2.12-1.7 0-.98-.78-1.65-2.1-1.65H9.85z"
          />
        </svg>
        {loading ? 'Переход в Яндекс…' : 'Войти с Яндекс ID'}
      </button>
      {error && <p className={styles.authFieldError}>{error}</p>}
    </>
  )
}
