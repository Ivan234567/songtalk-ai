'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { readIntroRun, writeIntroRun } from '@/lib/next-intro-run';
import { useDashboardMetrics, formatDuration } from './useDashboardMetrics';
import styles from './dashboard.module.css';

const WEEKLY_GOAL_MINUTES = 90;
const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const PLAN = [
  { title: '10–15 минут диалога с ИИ', hint: 'Прокачка беглости и уверенности', go: 'Начать', tab: 'agent' as const },
  { title: 'Добавь 3–5 новых выражений', hint: 'Слова и идиомы в контексте', go: 'Добавить', tab: 'dictionary' as const },
  { title: 'Повтори слова, которым пора', hint: 'До пяти слов за занятие', go: 'Повторить', tab: 'agent' as const },
];

type NextSense = { sense_id: string; headword: string; gloss_ru: string };

type NextAction = {
  action: 'repair' | 'due_speech' | 'recognized_speech' | 'new_speech' | 'retention' | 'transfer' | 'recognition' | 'free';
  title: string;
  reason: string;
  count: number;
  list_id: string | null;
  senses: NextSense[];
  intro_run_after: number;
};

function getApiUrl() {
  const url = process.env.NEXT_PUBLIC_API_URL || '';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function pluralWords(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'слово';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'слова';
  return 'слов';
}

function pluralDays(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
  return 'дней';
}

function Arrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function StatIcon({ name }: { name: 'fire' | 'clock' | 'chat' | 'book' }) {
  if (name === 'fire') {
    return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 .2 1.5 1 2 2 2 0-3-1-5 1-8z" /></svg>;
  }
  if (name === 'clock') {
    return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
  }
  if (name === 'chat') {
    return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 5h16v11H9l-5 4z" /></svg>;
  }
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2zM8 7h8M8 11h8" /></svg>;
}

export const DashboardTab: React.FC<{ displayName?: string }> = ({ displayName = 'друг' }) => {
  const { metrics, loading, error } = useDashboardMetrics();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [done, setDone] = useState([false, false, false]);
  const [userId, setUserId] = useState('');
  const [recommendation, setRecommendation] = useState<NextAction | null>(null);
  const [recommendationState, setRecommendationState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [recommendationTry, setRecommendationTry] = useState(0);

  const goToTab = (tab: 'dictionary' | 'agent' | 'progress') => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('tab', tab);
    router.replace(`${pathname || '/dashboard'}?${next.toString()}`, { scroll: false });
  };

  const openRecommendation = (item: NextAction) => {
    try {
      writeIntroRun(window.localStorage, userId, item.intro_run_after);
    } catch {
      // Без хранилища переход остаётся, а счётчик вводных не сохранится.
    }
    const next = new URLSearchParams(searchParams.toString());
    next.delete('review');
    next.delete('senses');
    next.delete('list');
    next.delete('mode');
    next.delete('target');
    next.delete('repick');
    next.set('tab', 'agent');
    const spokenPractice = item.action !== 'free' && item.action !== 'recognition';
    if (spokenPractice && (item.action === 'retention' || item.action === 'transfer') && item.senses.length >= 1) {
      next.set('from', 'vocab');
      next.set('mode', item.action);
      next.set('senses', item.senses.map((sense) => sense.sense_id).join(','));
    } else if (spokenPractice && item.list_id && item.senses.length >= 2) {
      next.set('from', 'vocab');
      next.set('list', item.list_id);
      next.set('senses', item.senses.map((sense) => sense.sense_id).join(','));
    }
    router.replace(`${pathname || '/dashboard'}?${next.toString()}`, { scroll: false });
  };

  useEffect(() => {
    let cancelled = false;
    setRecommendationState('loading');
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      const nextUserId = data.session?.user?.id || '';
      if (!cancelled) setUserId(nextUserId);
      if (!token) {
        if (!cancelled) setRecommendationState('error');
        return;
      }
      try {
        let run = 0;
        try {
          run = readIntroRun(window.localStorage, nextUserId);
        } catch {
          run = 0;
        }
        const response = await fetch(`${getApiUrl()}/api/vocabulary/next-action?intro_run=${run}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.title || !payload?.reason) throw new Error('next');
        const keepHiddenWords = payload.action === 'retention' || payload.action === 'transfer';
        const senses = Array.isArray(payload.senses) ? payload.senses.flatMap((item: NextSense) => {
          const headword = typeof item?.headword === 'string' ? item.headword.trim() : '';
          const senseId = typeof item?.sense_id === 'string' ? item.sense_id : '';
          if (!senseId || (!headword && !keepHiddenWords)) return [];
          return [{
            sense_id: senseId,
            headword,
            gloss_ru: typeof item?.gloss_ru === 'string' ? item.gloss_ru.trim() : '',
          }];
        }) : [];
        if (cancelled) return;
        setRecommendation({
          action: payload.action,
          title: payload.title,
          reason: payload.reason,
          count: Number(payload.count) || senses.length,
          list_id: typeof payload.list_id === 'string' ? payload.list_id : null,
          senses,
          intro_run_after: Number.isInteger(payload.intro_run_after) ? payload.intro_run_after : 0,
        });
        setRecommendationState('ready');
      } catch {
        if (!cancelled) setRecommendationState('error');
      }
    });
    return () => { cancelled = true; };
  }, [recommendationTry]);

  const todayIndex = (new Date().getDay() + 6) % 7;
  const weekLeft = Math.max(0, WEEKLY_GOAL_MINUTES - metrics.weekMinutes);
  const goalPercent = Math.min(100, Math.round((metrics.weekMinutes / WEEKLY_GOAL_MINUTES) * 100));
  const daysLeft = Math.max(1, 7 - todayIndex);
  const pace = Math.max(1, Math.round(weekLeft / daysLeft));
  const ring = 2 * Math.PI * 38;
  const dash = (goalPercent / 100) * ring;
  const share = metrics.conversationMinutes > 0
    ? Math.round((metrics.weekMinutes / metrics.conversationMinutes) * 100)
    : 0;
  const dayMax = Math.max(20, ...metrics.weekDayMinutes);
  const dictParts = [
    { label: 'Слова', count: metrics.wordsCount, color: '#7aa2ff' },
    { label: 'Идиомы', count: metrics.idiomsCount, color: 'var(--accent)' },
    { label: 'Фразовые глаголы', count: metrics.phrasalVerbsCount, color: '#a5b0ff' },
  ];
  const dictTotal = dictParts.reduce((sum, part) => sum + part.count, 0);
  const doneCount = done.filter(Boolean).length;
  const dateLabel = useMemo(() => {
    const raw = new Intl.DateTimeFormat('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date());
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, []);

  if (loading) {
    return (
      <div className={styles.page} aria-busy="true">
        <div className={styles.hello}><h1>Главная</h1></div>
      </div>
    );
  }

  if (error) {
    return <div className={styles.error}>Не удалось загрузить метрики: {error}</div>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.hello}>
        <div>
          <h1>Привет, {displayName}!</h1>
          <p>Сфокусируйся на одной задаче и закрепи результат сегодня.</p>
        </div>
        <span className={styles.date}>{dateLabel}</span>
      </div>

      <div className={styles.grid}>
        <section className={`${styles.card} ${styles.hero}`} aria-label="Следующее занятие">
          <span className={styles.eyebrow}><i />Следующее занятие</span>
          {recommendationState === 'ready' && recommendation ? (
            <>
              <h2>{recommendation.title}</h2>
              <p className={styles.lead}>{recommendation.reason}</p>
              {recommendation.count > 0 ? (
                <p className={styles.sub}>{recommendation.count} {pluralWords(recommendation.count)}</p>
              ) : null}
              {recommendation.action !== 'retention' && recommendation.action !== 'transfer' && recommendation.senses.length > 0 ? (
                <div className={styles.wchips}>
                  {recommendation.senses.map((word) => (
                    <div className={styles.wc} key={word.sense_id}>
                      <b>{word.headword}</b>
                      {word.gloss_ru ? <span>{word.gloss_ru}</span> : null}
                    </div>
                  ))}
                </div>
              ) : null}
              <div className={styles.acts}>
                <button type="button" className={`${styles.btn} ${styles.pri}`} onClick={() => openRecommendation(recommendation)}>
                  Начать разговор
                  <Arrow />
                </button>
              </div>
            </>
          ) : recommendationState === 'error' ? (
            <>
              <h2>Занятие пока не выбрано</h2>
              <p className={styles.lead}>Не удалось прочитать учебное состояние.</p>
              <div className={styles.acts}>
                <button type="button" className={`${styles.btn} ${styles.pri}`} onClick={() => setRecommendationTry((value) => value + 1)}>
                  Попробовать снова
                </button>
              </div>
            </>
          ) : (
            <>
              <h2>Подбираем занятие</h2>
              <p className={styles.lead}>Смотрим, что сейчас важнее всего.</p>
            </>
          )}
          <div className={styles.orb} aria-hidden="true" />
        </section>

        <section className={`${styles.card} ${styles.goal}`} aria-label="Недельная цель">
          <div className={styles.ch}>
            <div>
              <h2>Цель недели</h2>
              <p className={styles.sub}>{WEEKLY_GOAL_MINUTES} минут практики</p>
            </div>
            <button type="button" className={styles.link} onClick={() => goToTab('progress')}>Прогресс</button>
          </div>
          <div className={styles.gr}>
            <svg className={styles.ring} viewBox="0 0 92 92" role="img" aria-label={`Выполнено ${goalPercent}%`}>
              <circle cx="46" cy="46" r="38" fill="none" stroke="#2e2c3a" strokeWidth="9" />
              <circle
                cx="46"
                cy="46"
                r="38"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${ring - dash}`}
                transform="rotate(-90 46 46)"
              />
              <text x="46" y="52" textAnchor="middle" fontSize="20" fontWeight="700">{goalPercent}%</text>
            </svg>
            <div>
              <b>{formatDuration(metrics.weekMinutes)} из {WEEKLY_GOAL_MINUTES} мин</b>
              <span>{weekLeft > 0 ? `Осталось ${formatDuration(weekLeft)}` : 'Цель закрыта'}</span>
            </div>
          </div>
          <div className={styles.days} aria-label="Минуты по дням недели">
            {DAY_LABELS.map((label, index) => (
              <div
                key={label}
                className={`${styles.dy} ${index === todayIndex ? styles.today : ''} ${index > todayIndex ? styles.future : ''}`}
                title={`${metrics.weekDayMinutes[index] || 0} мин`}
              >
                <i style={{ height: `${Math.max(6, ((metrics.weekDayMinutes[index] || 0) / dayMax) * 80)}px` }} />
                {label}
              </div>
            ))}
          </div>
          <p className={styles.gn}>
            {weekLeft > 0
              ? <>Чтобы успеть, занимайтесь по <b>{pace} мин в день</b> до воскресенья.</>
              : <>Недельная цель закрыта. Можно говорить спокойнее и разбирать ошибки.</>}
          </p>
          <p className={styles.foot}>
            {metrics.conversationMinutes > 0
              ? `Это ${share}% всего времени разговоров с ИИ.`
              : 'Разговоры с ИИ появятся здесь после первой сессии.'}
          </p>
        </section>

        <section className={`${styles.card} ${styles.stats}`} aria-label="Ключевые показатели">
          <div className={`${styles.stat} ${styles.fire}`}>
            <small><StatIcon name="fire" />Серия</small>
            <b>{metrics.streakDays} {pluralDays(metrics.streakDays)}</b>
            <span>{metrics.streakDays === 0 ? 'начните сегодня' : 'подряд'}</span>
          </div>
          <div className={styles.stat}>
            <small><StatIcon name="clock" />Сегодня</small>
            <b>{formatDuration(metrics.todayMinutes)}</b>
            <span>на этой неделе {formatDuration(metrics.weekMinutes)}</span>
          </div>
          <div className={styles.stat}>
            <small><StatIcon name="chat" />Разговоры с ИИ</small>
            <b>{formatDuration(metrics.conversationMinutes)}</b>
            <span>за всё время</span>
          </div>
          <div className={styles.stat}>
            <small><StatIcon name="book" />Словарь</small>
            <b>{metrics.dictionaryCount}</b>
            <span>единиц лексики</span>
          </div>
        </section>

        <section className={`${styles.card} ${styles.plan}`} aria-label="План на неделю">
          <div className={styles.ch}>
            <div>
              <h2>План на неделю</h2>
              <p className={styles.sub}>Три коротких шага, чтобы закрыть цель</p>
            </div>
            <span className={styles.cnt}>{doneCount} из 3</span>
          </div>
          {PLAN.map((item, index) => (
            <div className={styles.task} role="checkbox" aria-checked={done[index]} key={item.title} onClick={() => {
              setDone((prev) => prev.map((value, itemIndex) => (itemIndex === index ? !value : value)));
            }}>
              <span className={styles.cb}><Check /></span>
              <span>
                <b>{item.title}</b>
                <small>{item.hint}</small>
              </span>
              {!done[index] ? (
                <button
                  type="button"
                  className={styles.go}
                  onClick={(event) => {
                    event.stopPropagation();
                    goToTab(item.tab);
                  }}
                >
                  {item.go}
                </button>
              ) : null}
            </div>
          ))}
        </section>

        <section className={`${styles.card} ${styles.dict}`} aria-label="Структура словаря">
          <div className={styles.ch}>
            <div>
              <h2>Словарь</h2>
              <p className={styles.sub}>Что вы уже собрали</p>
            </div>
            <button type="button" className={styles.link} onClick={() => goToTab('dictionary')}>Открыть</button>
          </div>
          <div className={styles.big}>{dictTotal}<small>единиц</small></div>
          <div className={styles.stack} role="img" aria-label={dictParts.map((part) => `${part.label} ${part.count}`).join(', ')}>
            {dictParts.map((part) => (
              part.count > 0 ? <i key={part.label} style={{ flex: part.count, ['--c' as string]: part.color }} /> : null
            ))}
          </div>
          <div className={styles.dl}>
            {dictParts.map((part) => (
              <div className={styles.dlRow} key={part.label} style={{ ['--c' as string]: part.color }}>
                <i className={styles.swatch} />
                <span>{part.label}</span>
                <b>{part.count}</b>
                <em>{dictTotal > 0 ? `${Math.round((part.count / dictTotal) * 100)}%` : '0%'}</em>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
