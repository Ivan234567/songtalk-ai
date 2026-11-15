'use client'

import { useEffect, useState } from 'react'
import styles from '@/components/partner/partner.module.css'
import { usePartnerState } from '@/components/partner/PartnerFrame'
import { Empty, LinkCard, PersonName, ReferralDrawer } from '@/components/partner/bits'
import { formatWhen, partnerGet, type PartnerReferrals, type ReferralRow } from '@/lib/partner'

export default function PartnerReferralsPage() {
  const { token, overview } = usePartnerState()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PartnerReferrals | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opened, setOpened] = useState<ReferralRow | null>(null)
  const summary = overview?.status === 'ready' ? overview.data : null

  useEffect(() => {
    if (!token) return
    let cancel = false
    const params = new URLSearchParams({ page: String(page), status })
    if (query.trim()) params.set('q', query.trim())
    partnerGet<PartnerReferrals>(`/api/partner/referrals?${params}`, token).then((result) => {
      if (cancel) return
      if (!result.ok) setError('Список рефералов недоступен.')
      else {
        setError(null)
        setData(result)
      }
    }).catch(() => {
      if (!cancel) setError('Список рефералов недоступен.')
    })
    return () => {
      cancel = true
    }
  }, [token, query, status, page])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1

  return (
    <>
      <section className={styles.grid3}>
        <article className={`${styles.card} ${styles.kpi}`}>
          <div className={styles.k}>Всего приглашённых</div>
          <div className={styles.value}>{summary ? summary.referrals_total : '—'}</div>
        </article>
        <article className={`${styles.card} ${styles.kpi}`}>
          <div className={styles.k}>С платным использованием</div>
          <div className={styles.value}>{summary ? summary.referrals_with_paid_usage : '—'}</div>
        </article>
        <article className={`${styles.card} ${styles.kpi}`}>
          <div className={styles.k}>Активные</div>
          <div className={styles.unknown} style={{ marginTop: 10, fontStyle: 'normal' }}>После определения критериев активности</div>
        </article>
      </section>
      <LinkCard />
      <section className={styles.card}>
        <div className={styles.filters}>
          <input
            className={styles.field}
            value={query}
            placeholder="Поиск по пользователю"
            aria-label="Поиск"
            onChange={(event) => {
              setPage(1)
              setQuery(event.target.value)
            }}
          />
          <select
            className={styles.field}
            value={status}
            aria-label="Статус"
            onChange={(event) => {
              setPage(1)
              setStatus(event.target.value)
            }}
          >
            <option value="all">Все</option>
            <option value="paid_usage">Есть платное использование</option>
            <option value="no_paid_usage">Без платного использования</option>
          </select>
        </div>
        {error && <p className={styles.k} role="alert">{error}</p>}
        {data && data.total === 0 && !query && status === 'all' && !error && (
          <Empty
            title="Рефералов пока нет"
            text="Скопируйте ссылку и поделитесь ею: пользователи появятся здесь после регистрации."
          />
        )}
        {data && data.referrals.length === 0 && (query || status !== 'all') && !error && (
          <Empty title="Ничего не найдено" text="Измените поиск или статус." />
        )}
        {data && data.referrals.length > 0 && (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Пользователь</th>
                    <th>Дата регистрации</th>
                  </tr>
                </thead>
                <tbody>
                  {data.referrals.map((person, index) => (
                    <tr
                      key={`${person.registered_at}-${person.masked_email}`}
                      className={styles.rowLink}
                      onClick={() => setOpened(person)}
                    >
                      <td><PersonName mail={person.masked_email || 'Скрыт'} index={index} /></td>
                      <td>{formatWhen(person.registered_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.cards}>
              {data.referrals.map((person, index) => (
                <button
                  key={`${person.registered_at}-${person.masked_email}`}
                  type="button"
                  className={`${styles.card} ${styles.mobileCard}`}
                  onClick={() => setOpened(person)}
                >
                  <PersonName mail={person.masked_email || 'Скрыт'} index={index} />
                  <span className={styles.k}>{formatWhen(person.registered_at)}</span>
                </button>
              ))}
            </div>
            <div className={styles.pager}>
              <span className={styles.k}>Стр. {page} из {totalPages} · {data.total}</span>
              <div className={styles.tabs}>
                <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Назад</button>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Далее</button>
              </div>
            </div>
          </>
        )}
      </section>
      {opened && summary && (
        <ReferralDrawer person={opened} code={summary.referral_code} onClose={() => setOpened(null)} />
      )}
    </>
  )
}
