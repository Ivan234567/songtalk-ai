'use client';

import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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

const QUICK_ACCESS_ITEMS: {
  tab: 'karaoke' | 'dictionary' | 'agent' | 'progress';
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  { tab: 'karaoke', label: 'Караоке', description: 'Тренируй ритм и произношение', icon: <KaraokeIcon /> },
  { tab: 'dictionary', label: 'Словарь', description: 'Закрепляй лексику по темам', icon: <DictionaryIcon /> },
  { tab: 'agent', label: 'AI-собеседник', description: 'Практикуй живой разговор', icon: <AgentIcon /> },
  { tab: 'progress', label: 'Прогресс', description: 'Отслеживай рост по навыкам', icon: <ProgressIcon /> },
];

export const DashboardTab: React.FC = () => {
  const { metrics, loading, error } = useDashboardMetrics();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const WEEKLY_GOAL_MINUTES = 90;

  const goToTab = (tab: 'karaoke' | 'dictionary' | 'agent' | 'progress') => {
    const base = pathname || '/';
    const next = new URLSearchParams(searchParams.toString());
    next.set('tab', tab);
    router.replace(`${base}?${next.toString()}`, { scroll: false });
  };

  const weeklyGoalProgress = Math.min(100, Math.round((metrics.weekMinutes / WEEKLY_GOAL_MINUTES) * 100));
  const weekMinutesLeft = Math.max(0, WEEKLY_GOAL_MINUTES - metrics.weekMinutes);
  const conversationShare = metrics.conversationMinutes > 0
    ? Math.round((metrics.weekMinutes / metrics.conversationMinutes) * 100)
    : 0;

  const streakLabel = metrics.streakDays === 1
    ? 'день подряд'
    : metrics.streakDays > 1 && metrics.streakDays < 5
      ? 'дня подряд'
      : 'дней подряд';
  const karaokeLabel = metrics.karaokeCount === 1
    ? 'песня'
    : metrics.karaokeCount > 1 && metrics.karaokeCount < 5
      ? 'песни'
      : 'песен';
  const wordsRatio = metrics.dictionaryCount > 0 ? Math.round((metrics.wordsCount / metrics.dictionaryCount) * 100) : 0;
  const idiomsRatio = metrics.dictionaryCount > 0 ? Math.round((metrics.idiomsCount / metrics.dictionaryCount) * 100) : 0;
  const phrasalRatio = metrics.dictionaryCount > 0 ? Math.round((metrics.phrasalVerbsCount / metrics.dictionaryCount) * 100) : 0;

  if (loading) {
    return (
      <div className={styles.wrapper}>
        <section className={styles.heroSection}>
          <div className={styles.heroGrid}>
            {[1, 2].map((i) => (
              <div key={i} className={`${styles.card} ${styles.skeletonCard} ${styles.skeletonHeroCard}`}>
                <div className={styles.skeletonTitle} />
                <div className={styles.skeletonValue} />
              </div>
            ))}
          </div>
        </section>
        <section className={styles.metricsSection}>
          <div className={styles.kpiGrid}>
            {[1, 2, 3, 4].map((i) => (
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
      <section className={styles.heroSection} aria-label="Учебный обзор">
        <div className={styles.heroGrid}>
          <div className={`${styles.card} ${styles.heroMainCard}`}>
            <div className={styles.heroBadge}>Персональный учебный трек</div>
            <h2 className={styles.heroTitle}>Двигайся к уверенной разговорной речи каждый день</h2>
            <p className={styles.heroSub}>
              Комбинируй диалоги с AI, словарь и караоке-практику, чтобы быстрее закреплять лексику и говорить свободнее.
            </p>
            <div className={styles.heroStats}>
              <div className={styles.heroStat}>
                <span className={styles.heroStatLabel}>На этой неделе</span>
                <span className={styles.heroStatValue}>{formatDuration(metrics.weekMinutes)}</span>
              </div>
              <div className={styles.heroStat}>
                <span className={styles.heroStatLabel}>Сегодня</span>
                <span className={styles.heroStatValue}>{formatDuration(metrics.todayMinutes)}</span>
              </div>
              <div className={styles.heroStat}>
                <span className={styles.heroStatLabel}>Streak</span>
                <span className={styles.heroStatValue}>{metrics.streakDays}</span>
              </div>
            </div>
          </div>
          <div className={`${styles.card} ${styles.heroGoalCard}`}>
            <div className={styles.goalTitleWrap}>
              <div className={styles.cardIcon}>
                <ProgressIcon />
              </div>
              <div>
                <p className={styles.goalCaption}>Недельная цель</p>
                <h3 className={styles.goalTitle}>{WEEKLY_GOAL_MINUTES} минут практики</h3>
              </div>
            </div>
            <div className={styles.goalProgressBar}>
              <div className={styles.goalProgressValue} style={{ width: `${weeklyGoalProgress}%` }} />
            </div>
            <p className={styles.goalProgressText}>
              {weeklyGoalProgress}% выполнено
              {' · '}
              {weekMinutesLeft > 0 ? `осталось ${formatDuration(weekMinutesLeft)}` : 'цель достигнута'}
            </p>
            <button type="button" onClick={() => goToTab('progress')} className={styles.goalActionBtn}>
              Открыть детальный прогресс
            </button>
          </div>
        </div>
      </section>

      <section className={styles.metricsSection} aria-label="Ключевые метрики">
        <h2 className={styles.sectionTitle}>Ключевые метрики обучения</h2>
        <div className={styles.kpiGrid}>
          <div className={`${styles.card} ${styles.kpiCard} ${styles.cardStreak}`}>
            <div className={styles.cardIcon}>
              <FlameIcon />
            </div>
            <div className={styles.cardTitle}>Текущий streak</div>
            <div className={styles.cardValue}>{metrics.streakDays}</div>
            <div className={styles.cardSub}>
              {metrics.streakDays === 0 ? 'Запусти практику сегодня' : streakLabel}
            </div>
          </div>

          <div className={`${styles.card} ${styles.kpiCard} ${styles.cardAgent}`}>
            <div className={styles.cardIcon}>
              <AgentIcon />
            </div>
            <div className={styles.cardTitle}>AI-разговоры (всего)</div>
            <div className={styles.cardValue}>{formatDuration(metrics.conversationMinutes)}</div>
            <div className={styles.cardSub}>Живая практика с ассистентом</div>
          </div>

          <div className={`${styles.card} ${styles.kpiCard} ${styles.cardDictionary}`}>
            <div className={styles.cardIcon}>
              <DictionaryIcon />
            </div>
            <div className={styles.cardTitle}>Словарь</div>
            <div className={styles.cardValue}>{metrics.dictionaryCount}</div>
            <div className={styles.cardSub}>Добавленных единиц лексики</div>
          </div>

          <div className={`${styles.card} ${styles.kpiCard} ${styles.cardKaraoke}`}>
            <div className={styles.cardIcon}>
              <KaraokeIcon />
            </div>
            <div className={styles.cardTitle}>Караоке-активность</div>
            <div className={styles.cardValue}>{metrics.karaokeCount}</div>
            <div className={styles.cardSub}>{karaokeLabel} отработано</div>
          </div>
        </div>
      </section>

      <section className={styles.learningSection} aria-label="Развитие навыков">
        <div className={`${styles.card} ${styles.learningCard}`}>
          <div className={styles.learningHeader}>
            <h2 className={styles.sectionTitle}>Фокус недели</h2>
          </div>
          <p className={styles.learningLead}>
            {weekMinutesLeft > 0
              ? `До недельной цели осталось ${formatDuration(weekMinutesLeft)}. Лучше всего добивать цель короткими ежедневными сессиями.`
              : 'Ты закрыл недельную цель. Сфокусируйся на качестве: разбирай ошибки и расширяй лексику.'}
          </p>
          <div className={styles.learningChecklist}>
            <button type="button" className={styles.learningStep} onClick={() => goToTab('agent')}>
              <span className={styles.learningStepTitle}>10-15 минут диалога с AI</span>
              <span className={styles.learningStepSub}>Прокачка fluency и уверенности</span>
            </button>
            <button type="button" className={styles.learningStep} onClick={() => goToTab('dictionary')}>
              <span className={styles.learningStepTitle}>Добавь 3-5 новых выражений</span>
              <span className={styles.learningStepSub}>Закрепление слов и идиом в контексте</span>
            </button>
            <button type="button" className={styles.learningStep} onClick={() => goToTab('karaoke')}>
              <span className={styles.learningStepTitle}>Одна песня на повторе</span>
              <span className={styles.learningStepSub}>Тренировка слуха, ритма и произношения</span>
            </button>
          </div>
        </div>

        <div className={`${styles.card} ${styles.breakdownCard}`}>
          <h2 className={styles.sectionTitle}>Структура словаря</h2>
          <div className={styles.breakdownList}>
            <div className={styles.breakdownRow}>
              <div className={styles.breakdownMeta}>
                <span>Слова</span>
                <span>{metrics.wordsCount}</span>
              </div>
              <div className={styles.breakdownBar}>
                <div className={styles.breakdownBarValue} style={{ width: `${wordsRatio}%` }} />
              </div>
            </div>
            <div className={styles.breakdownRow}>
              <div className={styles.breakdownMeta}>
                <span>Идиомы</span>
                <span>{metrics.idiomsCount}</span>
              </div>
              <div className={styles.breakdownBar}>
                <div className={styles.breakdownBarValue} style={{ width: `${idiomsRatio}%` }} />
              </div>
            </div>
            <div className={styles.breakdownRow}>
              <div className={styles.breakdownMeta}>
                <span>Фразовые глаголы</span>
                <span>{metrics.phrasalVerbsCount}</span>
              </div>
              <div className={styles.breakdownBar}>
                <div className={styles.breakdownBarValue} style={{ width: `${phrasalRatio}%` }} />
              </div>
            </div>
          </div>
          <p className={styles.breakdownFooter}>
            {metrics.dictionaryCount > 0
              ? `${conversationShare}% твоего общего разговорного времени приходится на текущую неделю.`
              : 'Начни добавлять лексику, чтобы видеть структуру словаря и персональные рекомендации.'}
          </p>
        </div>
      </section>

      <section className={styles.quickAccessSection}>
        <h2 className={styles.sectionTitle}>Быстрый старт занятий</h2>
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
              <span className={styles.quickAccessBtnTextWrap}>
                <span className={styles.quickAccessBtnLabel}>{item.label}</span>
                <span className={styles.quickAccessBtnSub}>{item.description}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
