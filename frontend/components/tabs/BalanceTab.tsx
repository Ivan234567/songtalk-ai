'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './balance.module.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type PeriodKey = 'today' | '7' | '30' | '90' | 'custom';

const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: 'Сегодня',
  '7': '7 дней',
  '30': '30 дней',
  '90': '90 дней',
  custom: 'Свой период',
};

// Суммы зачисления на баланс (X). При подключении ЮKassa (шаг 5): сумма к оплате P = X / (0.94 * 0.993) — налог 6% и комиссия 0,7% в цене (п. 4 плана).
const TOPUP_OPTIONS = [
  { amount: 300, label: '~2 часа с агентом', sub: 'или до 800 озвучек' },
  { amount: 500, label: '~3,5 часа практики', sub: 'или до 1 300 озвучек' },
  { amount: 1000, label: '~7 часов разговора', sub: 'или до 2 500 озвучек' },
];

const LOW_BALANCE_THRESHOLD = 50;
const MIN_BALANCE_PORTFOLIO = 10; // порог, ниже которого сервисы блокируются
const HISTORY_PAGE_SIZE = 25;

interface Transaction {
  id: string;
  amount_rub: number;
  type: string;
  service: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year}, ${h}:${m}`;
}

function getPeriodBounds(period: PeriodKey, customRange?: { from: string; to: string }): { from: string; to: string } {
  if (period === 'custom' && customRange) return customRange;
  const to = new Date();
  const from = new Date();
  if (period === 'today') {
    from.setHours(0, 0, 0, 0);
  } else if (period === '7' || period === '30' || period === '90') {
    const days = parseInt(period, 10);
    from.setDate(from.getDate() - days);
    from.setHours(0, 0, 0, 0);
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

function getPreviousPeriodBounds(period: PeriodKey): { from: string; to: string } | null {
  if (period === 'today' || period === 'custom') return null;
  const { from, to } = getPeriodBounds(period);
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const spanMs = toDate.getTime() - fromDate.getTime();
  const prevTo = new Date(fromDate.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - spanMs);
  return { from: prevFrom.toISOString(), to: prevTo.toISOString() };
}

function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDailySpend(
  transactions: Transaction[],
  period: PeriodKey,
  customRange?: { from: string; to: string }
): { date: string; label: string; spent: number }[] {
  const usage = transactions.filter((t) => t.type === 'usage' && t.amount_rub < 0);
  const byDay: Record<string, number> = {};
  let from: Date;
  let to: Date;
  if (period === 'custom' && customRange) {
    from = new Date(customRange.from);
    to = new Date(customRange.to);
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
  } else {
    const daysInPeriod = period === 'today' ? 1 : parseInt(period, 10);
    to = new Date();
    from = new Date();
    from.setDate(to.getDate() - (daysInPeriod - 1));
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
  }
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    byDay[toLocalDateKey(d)] = 0;
  }
  usage.forEach((t) => {
    const key = toLocalDateKey(new Date(t.created_at));
    if (byDay[key] !== undefined) byDay[key] += Math.abs(Number(t.amount_rub));
  });
  const result: { date: string; label: string; spent: number }[] = [];
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const key = toLocalDateKey(d);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    result.push({ date: key, label: `${day}.${month}`, spent: byDay[key] ?? 0 });
  }
  return result;
}

export const BalanceTab: React.FC = () => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [balanceRub, setBalanceRub] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>('30');
  const [customFrom, setCustomFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  });
  const [customTo, setCustomTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [historyServiceFilter, setHistoryServiceFilter] = useState<string>('');
  const [historyDateFrom, setHistoryDateFrom] = useState<string>('');
  const [historyDateTo, setHistoryDateTo] = useState<string>('');
  const [historyVisibleCount, setHistoryVisibleCount] = useState(HISTORY_PAGE_SIZE);
  const [prevTransactions, setPrevTransactions] = useState<Transaction[]>([]);
  const initialLoadDoneRef = useRef(false);

  useEffect(() => {
    setHistoryVisibleCount(HISTORY_PAGE_SIZE);
  }, [period, historyServiceFilter, historyDateFrom, historyDateTo]);

  const fetchBalance = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch(`${API_URL}/api/balance`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(res.status === 402 ? 'Пополните баланс' : 'Не удалось загрузить баланс');
      const data = await res.json();
      setBalanceRub(data.balance_rub ?? 0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки баланса');
    }
  }, [accessToken]);

  const fetchTransactions = useCallback(async () => {
    if (!accessToken) return;
    const customRange =
      period === 'custom'
        ? {
            from: new Date(customFrom + 'T00:00:00').toISOString(),
            to: new Date(customTo + 'T23:59:59.999').toISOString(),
          }
        : undefined;
    const { from, to } = getPeriodBounds(period, customRange);
    try {
      const params = new URLSearchParams({ limit: '500', type: 'usage', from, to });
      const res = await fetch(`${API_URL}/api/balance/transactions?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Не удалось загрузить историю');
      const data = await res.json();
      setTransactions(Array.isArray(data) ? data : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки истории');
    }
  }, [accessToken, period, customFrom, customTo]);

  const fetchPreviousTransactions = useCallback(async () => {
    if (!accessToken) return;
    const bounds = getPreviousPeriodBounds(period);
    if (!bounds) {
      setPrevTransactions([]);
      return;
    }
    try {
      const params = new URLSearchParams({ limit: '500', type: 'usage', from: bounds.from, to: bounds.to });
      const res = await fetch(`${API_URL}/api/balance/transactions?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setPrevTransactions(Array.isArray(data) ? data : []);
    } catch {
      setPrevTransactions([]);
    }
  }, [accessToken, period]);

  const handleRefresh = useCallback(async () => {
    if (!accessToken || refreshing) return;
    setRefreshing(true);
    setError(null);
    await Promise.all([fetchBalance(), fetchTransactions(), fetchPreviousTransactions()]);
    setRefreshing(false);
  }, [accessToken, refreshing, fetchBalance, fetchTransactions, fetchPreviousTransactions]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setAccessToken(data.session?.access_token ?? null);
    })();
  }, []);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    setError(null);
    if (!initialLoadDoneRef.current) {
      setLoading(true);
      Promise.all([fetchBalance(), fetchTransactions(), fetchPreviousTransactions()]).finally(() => {
        setLoading(false);
        initialLoadDoneRef.current = true;
      });
      return;
    }
    setStatsLoading(true);
    Promise.all([fetchTransactions(), fetchPreviousTransactions()]).finally(() => setStatsLoading(false));
  }, [accessToken, period, customFrom, customTo, fetchBalance, fetchTransactions, fetchPreviousTransactions]);

  const usageOnly = transactions.filter((t) => t.type === 'usage' && t.amount_rub < 0);
  const totalSpent = usageOnly.reduce((s, t) => s + Math.abs(Number(t.amount_rub)), 0);
  const requestCount = usageOnly.length;
  const daysInPeriod =
    period === 'today'
      ? 1
      : period === 'custom'
        ? Math.max(1, Math.floor((new Date(customTo).getTime() - new Date(customFrom).getTime()) / (24 * 60 * 60 * 1000)) + 1)
        : parseInt(period, 10);
  const avgPerDay = daysInPeriod > 0 ? totalSpent / daysInPeriod : 0;
  const avgPerRequest = requestCount > 0 ? totalSpent / requestCount : 0;

  const prevUsageOnly = prevTransactions.filter((t) => t.type === 'usage' && t.amount_rub < 0);
  const prevTotalSpent = prevUsageOnly.reduce((s, t) => s + Math.abs(Number(t.amount_rub)), 0);
  const prevRequestCount = prevUsageOnly.length;
  const deltaSpent =
    prevTotalSpent > 0 ? ((totalSpent - prevTotalSpent) / prevTotalSpent) * 100 : null;
  const deltaRequests =
    prevRequestCount > 0 ? ((requestCount - prevRequestCount) / prevRequestCount) * 100 : null;

  const byServiceSpend: Record<string, number> = {};
  const byServiceCount: Record<string, number> = {};
  usageOnly.forEach((t) => {
    const svc = t.service || 'другое';
    byServiceSpend[svc] = (byServiceSpend[svc] || 0) + Math.abs(Number(t.amount_rub));
    byServiceCount[svc] = (byServiceCount[svc] || 0) + 1;
  });
  const topBySpend = Object.entries(byServiceSpend)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const topByRequests = Object.entries(byServiceCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const dailyChartData = getDailySpend(
    transactions,
    period,
    period === 'custom'
      ? {
          from: new Date(customFrom + 'T00:00:00').toISOString(),
          to: new Date(customTo + 'T23:59:59.999').toISOString(),
        }
      : undefined
  );
  const maxDailySpent = Math.max(1, ...dailyChartData.map((d) => d.spent));

  const uniqueServices = Array.from(
    new Set(usageOnly.map((t) => t.service || 'другое'))
  ).sort();
  const usageFiltered =
    historyServiceFilter === ''
      ? usageOnly
      : usageOnly.filter((t) => (t.service || 'другое') === historyServiceFilter);

  const usageFilteredByDate = (() => {
    if (!historyDateFrom && !historyDateTo) return usageFiltered;
    return usageFiltered.filter((t) => {
      const d = new Date(t.created_at).getTime();
      if (historyDateFrom && d < new Date(historyDateFrom + 'T00:00:00').getTime()) return false;
      if (historyDateTo && d > new Date(historyDateTo + 'T23:59:59.999').getTime()) return false;
      return true;
    });
  })();

  const usageVisible = usageFilteredByDate.slice(0, historyVisibleCount);
  const hasMoreHistory = usageFilteredByDate.length > historyVisibleCount;

  const downloadCsv = () => {
    const rows = [
      ['Модель', 'Дата', 'Сумма (руб.)'],
      ...usageFilteredByDate.map((t) => [t.service || '—', formatDate(t.created_at), String(Math.abs(Number(t.amount_rub)))]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = period === 'custom' ? `balance-usage-${customFrom}-${customTo}.csv` : `balance-usage-${period}-days.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading && balanceRub === null) {
    return (
      <div className={styles.wrapper}>
        <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
        <div className={`${styles.skeleton} ${styles.skeletonBalance}`} />
      </div>
    );
  }

  const isLowBalance = balanceRub != null && balanceRub < LOW_BALANCE_THRESHOLD;

  return (
    <div className={styles.wrapper}>
      <header>
        <h2 className={styles.title}>Пополнение баланса</h2>
        <p className={styles.subtitle}>Текущий баланс и статистика расходов по сервисам</p>
      </header>

      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      {isLowBalance && !error && (
        <div className={styles.lowBalanceBanner}>
          <svg className={styles.lowBalanceBannerIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <span>Баланс ниже {LOW_BALANCE_THRESHOLD} ₽. Пополнение будет доступно после подключения оплаты.</span>
        </div>
      )}

      <section className={styles.balanceHero}>
        <div className={styles.balanceHeroHead}>
          <div>
            <p className={styles.balanceLabel}>Текущий баланс</p>
            <p className={`${styles.balanceValue} ${isLowBalance ? styles.balanceValueLow : ''}`}>
              {balanceRub != null ? `${balanceRub.toFixed(2)} ₽` : '—'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className={styles.refreshBtn}
            title="Обновить баланс и историю"
          >
            {refreshing ? (
              <span className={styles.refreshBtnSpinner} aria-hidden />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            )}
            <span>Обновить</span>
          </button>
        </div>
        {(balanceRub != null && balanceRub < MIN_BALANCE_PORTFOLIO) || (balanceRub != null && balanceRub >= MIN_BALANCE_PORTFOLIO && requestCount > 0) ? (
          <div className={styles.balanceProgressBlock}>
            {balanceRub != null && balanceRub < MIN_BALANCE_PORTFOLIO && (
              <div className={styles.progressRow}>
                <span className={styles.progressLabel}>До минимума {MIN_BALANCE_PORTFOLIO} ₽</span>
                <div className={styles.progressTrack}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${Math.min(100, (balanceRub / MIN_BALANCE_PORTFOLIO) * 100)}%` }}
                  />
                </div>
                <span className={styles.progressValue}>{balanceRub.toFixed(0)} / {MIN_BALANCE_PORTFOLIO} ₽</span>
              </div>
            )}
            {balanceRub != null && balanceRub >= MIN_BALANCE_PORTFOLIO && requestCount > 0 && avgPerRequest > 0 && (
              <p className={styles.balanceHint}>
                Хватит примерно на <strong>~{Math.floor(balanceRub / avgPerRequest)}</strong> запросов при текущем среднем расходе.
              </p>
            )}
          </div>
        ) : null}
        <div className={styles.topupGrid}>
          {TOPUP_OPTIONS.map((opt) => (
            <div key={opt.amount} className={styles.topupCard}>
              <span className={styles.topupAmount}>{opt.amount} ₽</span>
              <span className={styles.topupLabel}>{opt.label}</span>
              <span className={styles.topupLabel}>{opt.sub}</span>
              <span className={styles.topupBadge}>Скоро</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>Статистика за период</h3>
          <div className={styles.periodRow}>
            <div className={styles.periodPills}>
              {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  disabled={statsLoading}
                  className={`${styles.periodPill} ${period === p ? styles.periodPillActive : ''}`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
            {period === 'custom' && (
              <div className={styles.customRangeRow}>
                <label className={styles.customRangeLabel}>
                  с
                  <input
                    type="date"
                    className={styles.customRangeInput}
                    value={customFrom}
                    max={customTo}
                    onChange={(e) => setCustomFrom(e.target.value)}
                  />
                </label>
                <label className={styles.customRangeLabel}>
                  по
                  <input
                    type="date"
                    className={styles.customRangeInput}
                    value={customTo}
                    min={customFrom}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setCustomTo(e.target.value)}
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        {statsLoading ? (
          <>
            <div className={styles.chartSkeleton}>
              <div className={`${styles.skeleton} ${styles.skeletonChartBar}`} style={{ height: 80 }} />
            </div>
            <div className={styles.metricsGrid}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className={styles.metricCard}>
                  <div className={`${styles.skeleton} ${styles.skeletonMetricLabel}`} />
                  <div className={`${styles.skeleton} ${styles.skeletonMetricValue}`} />
                </div>
              ))}
            </div>
            <div className={styles.topsGrid}>
              <div className={styles.topCard}>
                <div className={`${styles.skeleton} ${styles.skeletonTopTitle}`} />
                <ul className={styles.topList}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <li key={i} className={styles.topItem}>
                      <div className={`${styles.skeleton} ${styles.skeletonTopLine}`} />
                    </li>
                  ))}
                </ul>
              </div>
              <div className={styles.topCard}>
                <div className={`${styles.skeleton} ${styles.skeletonTopTitle}`} />
                <ul className={styles.topList}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <li key={i} className={styles.topItem}>
                      <div className={`${styles.skeleton} ${styles.skeletonTopLine}`} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        ) : (
          <>
            {dailyChartData.length > 0 && (
              <div className={`${styles.chartSection} ${dailyChartData.length <= 7 ? styles.chartSectionFewDays : ''} ${dailyChartData.length > 7 && dailyChartData.length <= 31 ? styles.chartSectionSpreadDays : ''}`}>
                <p className={styles.chartTitle}>Расход по дням</p>
                <div className={styles.chartBars} role="img" aria-label={`График расхода по дням, макс. ${maxDailySpent.toFixed(0)} ₽`}>
                  {dailyChartData.map((d) => (
                    <div
                      key={d.date}
                      className={styles.chartBarWrap}
                      title={`${d.label}: ${d.spent.toFixed(2)} ₽`}
                    >
                      <div
                        className={styles.chartBar}
                        style={{
                          height: `${(d.spent / maxDailySpent) * 100}%`,
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className={styles.chartLabels}>
                  {dailyChartData.map((d, i) => {
                    const showLabel =
                      dailyChartData.length <= 14 ||
                      i === 0 ||
                      i === dailyChartData.length - 1 ||
                      i % Math.ceil(dailyChartData.length / 5) === 0;
                    return (
                      <span key={d.date} className={styles.chartLabel}>
                        {showLabel ? d.label : '\u00A0'}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            <div className={styles.metricsGrid}>
              <div
                className={styles.metricCard}
                title="Сумма списаний с баланса за выбранный период по всем сервисам (озвучка, распознавание, чат и т.д.)"
              >
                <p className={styles.metricLabel}>Расход за период</p>
                <p className={styles.metricValue}>
                  {totalSpent.toFixed(2)} ₽
                  {deltaSpent != null && (
                    <span className={`${styles.metricDelta} ${deltaSpent >= 0 ? styles.metricDeltaUp : styles.metricDeltaDown}`}>
                      {deltaSpent >= 0 ? '+' : ''}{deltaSpent.toFixed(0)}%
                    </span>
                  )}
                </p>
              </div>
              <div
                className={styles.metricCard}
                title="Количество платных запросов: каждый вызов TTS, STT, отправка сообщения в чат и т.д."
              >
                <p className={styles.metricLabel}>Запросов</p>
                <p className={styles.metricValue}>
                  {requestCount}
                  {deltaRequests != null && (
                    <span className={`${styles.metricDelta} ${deltaRequests >= 0 ? styles.metricDeltaUp : styles.metricDeltaDown}`}>
                      {deltaRequests >= 0 ? '+' : ''}{deltaRequests.toFixed(0)}%
                    </span>
                  )}
                </p>
              </div>
              <div
                className={styles.metricCard}
                title="Средний расход в рублях в день за выбранный период"
              >
                <p className={styles.metricLabel}>Среднее в день</p>
                <p className={styles.metricValue}>{avgPerDay.toFixed(2)} ₽</p>
              </div>
              <div
                className={styles.metricCard}
                title="Средняя стоимость одного запроса: расход за период ÷ число запросов"
              >
                <p className={styles.metricLabel}>Среднее за запрос</p>
                <p className={styles.metricValue}>{avgPerRequest.toFixed(4)} ₽</p>
              </div>
            </div>

            <div className={styles.topsGrid}>
              <div className={styles.topCard}>
                <p className={styles.topCardTitle}>Топ по тратам (руб.)</p>
                <ul className={styles.topList}>
                  {topBySpend.slice(0, 5).map(([svc, sum]) => (
                    <li key={svc} className={styles.topItem}>
                      <span className={styles.topItemService}>{svc}</span>
                      <span className={styles.topItemValue}>
                        {sum.toFixed(2)}
                        {totalSpent > 0 && (
                          <span className={styles.topItemPct}> ({((sum / totalSpent) * 100).toFixed(0)}%)</span>
                        )}
                      </span>
                    </li>
                  ))}
                  {topBySpend.length === 0 && <li className={styles.emptyHint}>Нет данных</li>}
                </ul>
              </div>
              <div className={styles.topCard}>
                <p className={styles.topCardTitle}>Топ по запросам</p>
                <ul className={styles.topList}>
                  {topByRequests.slice(0, 5).map(([svc, count]) => (
                    <li key={svc} className={styles.topItem}>
                      <span className={styles.topItemService}>{svc}</span>
                      <span className={styles.topItemValue}>
                        {count}
                        {requestCount > 0 && (
                          <span className={styles.topItemPct}> ({((count / requestCount) * 100).toFixed(0)}%)</span>
                        )}
                      </span>
                    </li>
                  ))}
                  {topByRequests.length === 0 && <li className={styles.emptyHint}>Нет данных</li>}
                </ul>
              </div>
            </div>
          </>
        )}
      </section>

      <section>
        <div className={styles.historyToolbar}>
          <h3 className={styles.sectionTitle}>История расходов</h3>
          <div className={styles.historyActions}>
            {!statsLoading && usageOnly.length > 0 && uniqueServices.length > 1 && (
              <select
                className={styles.historyFilterSelect}
                value={historyServiceFilter}
                onChange={(e) => setHistoryServiceFilter(e.target.value)}
                aria-label="Фильтр по сервису"
              >
                <option value="">Все сервисы</option>
                {uniqueServices.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
            {!statsLoading && usageOnly.length > 0 && (
              <div className={styles.historyDateRange}>
                <label className={styles.historyDateLabel}>
                  с
                  <input
                    type="date"
                    className={styles.historyDateInput}
                    value={historyDateFrom}
                    max={historyDateTo || undefined}
                    onChange={(e) => setHistoryDateFrom(e.target.value)}
                    aria-label="Дата от"
                  />
                </label>
                <label className={styles.historyDateLabel}>
                  по
                  <input
                    type="date"
                    className={styles.historyDateInput}
                    value={historyDateTo}
                    min={historyDateFrom || undefined}
                    onChange={(e) => setHistoryDateTo(e.target.value)}
                    aria-label="Дата до"
                  />
                </label>
              </div>
            )}
            {!statsLoading && usageFilteredByDate.length > 0 && (
              <button type="button" onClick={downloadCsv} className={styles.downloadBtn}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Скачать CSV
              </button>
            )}
          </div>
        </div>
        {statsLoading ? (
          <div className={styles.historyTableWrap}>
            <div className={styles.historySkeleton}>
              <div className={`${styles.skeleton} ${styles.skeletonTableRow}`} />
              <div className={`${styles.skeleton} ${styles.skeletonTableRow}`} />
              <div className={`${styles.skeleton} ${styles.skeletonTableRow}`} />
              <div className={`${styles.skeleton} ${styles.skeletonTableRow}`} />
              <div className={`${styles.skeleton} ${styles.skeletonTableRow}`} />
            </div>
          </div>
        ) : usageOnly.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateIcon} aria-hidden>
              <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="8" y="12" width="48" height="40" rx="4" />
                <path d="M20 28h24M20 36h16M20 44h12" />
              </svg>
            </div>
            <h4 className={styles.emptyStateTitle}>Пока нет расходов</h4>
            <p className={styles.emptyStateText}>
              За выбранный период трат не было. Используйте агента, караоке, словарь или другие разделы — здесь появится статистика.
            </p>
          </div>
        ) : usageFiltered.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateText}>
              По выбранному сервису «{historyServiceFilter}» записей за период нет.
            </p>
          </div>
        ) : usageFilteredByDate.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateText}>
              За выбранные даты записей нет. Измените диапазон «с» / «по» или очистите поля.
            </p>
          </div>
        ) : (
          <>
            <div className={styles.historyTableWrap}>
              <div className={styles.historyTableScroll}>
                <table className={styles.historyTable}>
                  <thead>
                    <tr>
                      <th>Модель / сервис</th>
                      <th>Дата</th>
                      <th className={styles.colAmount}>Сумма (руб.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usageVisible.map((t) => (
                      <tr key={t.id}>
                        <td>{t.service || '—'}</td>
                        <td>{formatDate(t.created_at)}</td>
                        <td className={styles.colAmount}>{Math.abs(Number(t.amount_rub)).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {hasMoreHistory && (
              <div className={styles.historyShowMoreWrap}>
                <button
                  type="button"
                  onClick={() => setHistoryVisibleCount((n) => n + HISTORY_PAGE_SIZE)}
                  className={styles.showMoreBtn}
                >
                  Показать ещё ({usageFilteredByDate.length - historyVisibleCount} из {usageFilteredByDate.length})
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
};
