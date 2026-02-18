'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useDashboardMetrics, formatDuration } from './useDashboardMetrics';
import styles from './dashboard.module.css';

const AgentIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2C10.9 2 10 2.9 10 4V12C10 13.1 10.9 14 12 14C13.1 14 14 13.1 14 12V4C14 2.9 13.1 2 12 2Z" />
    <path d="M19 10V12C19 15.9 15.9 19 12 19C8.1 19 5 15.9 5 12V10" />
    <path d="M12 19V22" />
  </svg>
);

const DictionaryIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5C4 18.1 5.1 17 6.5 17H20" />
    <path d="M6.5 2H20V22H6.5C5.1 22 4 20.9 4 19.5V4.5C4 3.1 5.1 2 6.5 2Z" />
    <path d="M8 7H16" />
    <path d="M8 11H16" />
  </svg>
);

const KaraokeIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1C10.62 1 9.5 2.12 9.5 3.5V10.5C9.5 11.88 10.62 13 12 13C13.38 13 14.5 11.88 14.5 10.5V3.5C14.5 2.12 13.38 1 12 1Z" />
    <path d="M12 13V16" />
    <path d="M12 16C12 16 8 16.5 8 19" />
    <path d="M12 16C12 16 16 16.5 16 19" />
    <path d="M6 19H18" />
  </svg>
);

const FlameIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);

const ProgressIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" />
    <path d="M7 14l4-4 4 4 5-8" />
  </svg>
);

const QUICK_ACCESS_ITEMS: { tab: 'karaoke' | 'dictionary' | 'agent' | 'progress'; label: string; icon: React.ReactNode }[] = [
  { tab: 'karaoke', label: 'Караоке', icon: <KaraokeIcon /> },
  { tab: 'dictionary', label: 'Словарь', icon: <DictionaryIcon /> },
  { tab: 'agent', label: 'AI-собеседник', icon: <AgentIcon /> },
  { tab: 'progress', label: 'Прогресс', icon: <ProgressIcon /> },
];

export const DashboardTab: React.FC = () => {
  const { metrics, loading, error } = useDashboardMetrics();
  const router = useRouter();
  const pathname = usePathname();

  const goToTab = (tab: string) => {
    const base = pathname || '/';
    const sep = base.includes('?') ? '&' : '?';
    router.replace(`${base}${sep}tab=${tab}`, { scroll: false });
  };

  if (loading) {
    return (
      <div className={styles.wrapper}>
        <section className={styles.overviewSection}>
          <div className={styles.metricsRow1}>
            {[1, 2, 3].map((i) => (
              <div key={i} className={`${styles.card} ${styles.skeletonCard}`}>
                <div className={styles.skeletonTitle} />
                <div className={styles.skeletonValue} />
              </div>
            ))}
          </div>
        </section>
        <section className={styles.metricsSection}>
          <div className={styles.metricsGrid}>
            {[1, 2, 3].map((i) => (
              <div key={i} className={`${styles.card} ${styles.skeletonCard}`}>
                <div className={styles.skeletonTitle} />
                <div className={styles.skeletonValue} />
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: '1.5rem',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          background: 'rgba(239, 68, 68, 0.08)',
          color: 'rgba(248, 113, 113, 0.95)',
        }}
      >
        Не удалось загрузить метрики: {error}
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <section className={styles.overviewSection} aria-label="Обзор">
        <div className={styles.metricsRow1}>
        <div className={`${styles.card} ${styles.cardStreak}`}>
          <div className={styles.cardIcon}>
            <FlameIcon />
          </div>
          <div className={styles.cardTitle}>Streak</div>
          <div className={styles.cardValue}>{metrics.streakDays}</div>
          <div className={styles.cardSub}>
            {metrics.streakDays === 0
              ? 'Позанимайся сегодня'
              : metrics.streakDays === 1
                ? 'день подряд'
                : metrics.streakDays < 5
                  ? 'дня подряд'
                  : 'дней подряд'}
          </div>
        </div>

        <div className={`${styles.card} ${styles.cardAgent}`}>
          <div className={styles.cardIcon}>
            <AgentIcon />
          </div>
          <div className={styles.cardTitle}>Сегодня</div>
          <div className={styles.cardValue}>{formatDuration(metrics.todayMinutes)}</div>
          <div className={styles.cardSub}>в разговорах с AI</div>
        </div>

        <div className={`${styles.card} ${styles.cardWeek}`}>
          <div className={styles.cardIcon}>
            <AgentIcon />
          </div>
          <div className={styles.cardTitle}>На этой неделе</div>
          <div className={styles.cardValue}>{formatDuration(metrics.weekMinutes)}</div>
          <div className={styles.cardSub}>в разговорах с AI</div>
        </div>
        </div>
      </section>

      <section className={styles.metricsSection} aria-label="Статистика">
        <h2 className={styles.sectionTitle}>Статистика</h2>
        <div className={styles.metricsGrid}>
        <div className={`${styles.card} ${styles.cardAgent}`}>
          <div className={styles.cardIcon}>
            <AgentIcon />
          </div>
          <div className={styles.cardTitle}>Время в разговорах</div>
          <div className={styles.cardValue}>{formatDuration(metrics.conversationMinutes)}</div>
          <div className={styles.cardSub}>с AI-собеседником (всего)</div>
        </div>

        <div className={`${styles.card} ${styles.cardDictionary}`}>
          <div className={styles.cardIcon}>
            <DictionaryIcon />
          </div>
          <div className={styles.cardTitle}>Словарь</div>
          <div className={styles.cardValue}>{metrics.dictionaryCount}</div>
          <div className={styles.cardDictionaryBreakdown}>
            <span>Слова: {metrics.wordsCount}</span>
            <span>Идиомы: {metrics.idiomsCount}</span>
            <span>Фразовые глаголы: {metrics.phrasalVerbsCount}</span>
          </div>
        </div>

        <div className={`${styles.card} ${styles.cardKaraoke}`}>
          <div className={styles.cardIcon}>
            <KaraokeIcon />
          </div>
          <div className={styles.cardTitle}>Активность в караоке</div>
          <div className={styles.cardValue}>{metrics.karaokeCount}</div>
          <div className={styles.cardSub}>
            {metrics.karaokeCount === 1 ? 'песня' : metrics.karaokeCount < 5 ? 'песни' : 'песен'}
          </div>
        </div>
        </div>
      </section>

      <section className={styles.quickAccessSection}>
        <h2 className={styles.sectionTitle}>Быстрый доступ</h2>
        <div className={styles.quickAccessGrid}>
          {QUICK_ACCESS_ITEMS.map((item) => (
            <button
              key={item.tab}
              type="button"
              onClick={() => goToTab(item.tab)}
              className={styles.quickAccessBtn}
              data-tab={item.tab}
            >
              <span className={styles.quickAccessBtnIcon}>{item.icon}</span>
              <span className={styles.quickAccessBtnLabel}>{item.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
