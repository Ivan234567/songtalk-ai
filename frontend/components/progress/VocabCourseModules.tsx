'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAgentAuthHeaders } from '@/lib/agent-request';
import { useLearningLanguage } from '@/context/LearningLanguageContext';
import { supabase } from '@/lib/supabase';
import { SenseCourseTimeline } from '@/components/dictionary/SenseCourseTimeline';
import styles from './vocab-course-modules.module.css';

type FunnelStats = {
  new: number;
  learning: number;
  due: number;
  mastered: number;
  word_count?: number;
};

type WeakWord = {
  sense_id: string;
  headword: string;
  gloss_ru: string;
  milestone: string;
  milestone_label: string;
  status: string;
  missed: number;
  hinted: number;
  produced: number;
};

type RecentSession = {
  id: string;
  status: string;
  created_at: string;
  used_count: number;
  hinted_count: number;
  missed_count: number;
  target_count: number;
  words: Array<{ sense_id: string; headword: string; status: string }>;
};

type CourseModule = {
  id: string;
  title: string;
  source?: string;
  bound_kind: string | null;
  bound_ref: string | null;
  bound_label: string | null;
  stats: FunnelStats;
  coverage_pct: number;
  mastered_pct: number;
  sessions_7d: number;
  sessions_30d: number;
  hint_free_assessed: number;
  assessed_count: number;
  weak_words: WeakWord[];
  recent_sessions?: RecentSession[];
  module_clear?: boolean;
  last_session_at: string | null;
};

function getApiUrl() {
  const url = process.env.NEXT_PUBLIC_API_URL || '';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function formatWhen(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function practiceHref(mod: CourseModule) {
  if (mod.bound_kind === 'scenario' && mod.bound_ref) {
    return `/dashboard?tab=agent&from=vocab&list=${mod.id}&target=rp:${mod.bound_ref}`;
  }
  if (mod.bound_kind === 'debate') {
    return `/dashboard?tab=agent&from=vocab&list=${mod.id}&mode=debate`;
  }
  if (mod.bound_kind === 'chat') {
    return `/dashboard?tab=agent&from=vocab&list=${mod.id}&mode=chat`;
  }
  return `/dashboard?tab=dictionary&list=${mod.id}`;
}

function moduleKindLabel(mod: CourseModule) {
  if (mod.bound_kind === 'chat') return 'Свободный диалог';
  if (mod.bound_kind === 'debate') return 'Дебат';
  if (mod.bound_kind === 'scenario') return 'Сцена';
  return null;
}

function FunnelBar({ stats }: { stats: FunnelStats }) {
  const total = Math.max(
    1,
    (stats.new || 0) + (stats.learning || 0) + (stats.due || 0) + (stats.mastered || 0),
  );
  const segments = [
    { key: 'due', label: 'Due', value: stats.due || 0, className: styles.segDue },
    { key: 'learning', label: 'Учу', value: stats.learning || 0, className: styles.segLearning },
    { key: 'new', label: 'Новые', value: stats.new || 0, className: styles.segNew },
    { key: 'mastered', label: 'Освоено', value: stats.mastered || 0, className: styles.segMastered },
  ];
  return (
    <div className={styles.funnel}>
      <div className={styles.funnelBar} aria-hidden>
        {segments.map((seg) => (
          <span
            key={seg.key}
            className={`${styles.seg} ${seg.className}`}
            style={{ width: `${(seg.value / total) * 100}%` }}
            title={`${seg.label}: ${seg.value}`}
          />
        ))}
      </div>
      <div className={styles.funnelLegend}>
        {segments.map((seg) => (
          <span key={seg.key} className={styles.legendItem}>
            <i className={seg.className} />
            {seg.label} {seg.value}
          </span>
        ))}
      </div>
    </div>
  );
}

function wordChipClass(status: string) {
  if (status === 'used') return styles.wordUsed;
  if (status === 'hinted') return styles.wordHinted;
  if (status === 'missed') return styles.wordMissed;
  return styles.wordOther;
}

export function VocabCourseModules() {
  const router = useRouter();
  const { learningLanguage } = useLearningLanguage();
  const [token, setToken] = useState<string | null>(null);
  const [items, setItems] = useState<CourseModule[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeSense, setActiveSense] = useState<{ id: string; headword: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setToken(data.session?.access_token || null);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setState('loading');
    fetch(`${getApiUrl()}/api/vocabulary/lists/course-modules`, {
      headers: buildAgentAuthHeaders(token, learningLanguage),
    })
      .then(async (resp) => {
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !Array.isArray(data?.items)) throw new Error('modules');
        if (!cancelled) {
          setItems(data.items as CourseModule[]);
          setState('idle');
        }
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => { cancelled = true; };
  }, [token, learningLanguage]);

  if (!token) return null;
  if (state === 'loading' && items.length === 0) {
    return (
      <section className={styles.section} aria-label="Модули слов">
        <div className={styles.head}>
          <h2 className={styles.title}>Модули слов</h2>
        </div>
        <p className={styles.muted}>Считаем воронку и слабые слова…</p>
      </section>
    );
  }
  if (state === 'error' && items.length === 0) {
    return (
      <section className={styles.section} aria-label="Модули слов">
        <div className={styles.head}>
          <h2 className={styles.title}>Модули слов</h2>
          <p className={styles.lead}>Не удалось загрузить модули — попробуй обновить страницу.</p>
        </div>
      </section>
    );
  }
  if (items.length === 0) {
    return (
      <section className={styles.section} aria-label="Модули слов">
        <div className={styles.head}>
          <h2 className={styles.title}>Модули слов</h2>
          <p className={styles.lead}>
            Здесь появится усвоение списков, привязанных к сценам и дебатам.
          </p>
        </div>
        <div className={styles.emptyActions}>
          <button
            type="button"
            className={styles.primary}
            onClick={() => router.push('/dashboard?tab=agent')}
          >
            Начать практику со словами
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => router.push('/dashboard?tab=dictionary')}
          >
            Открыть словарь
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.section} aria-label="Модули слов">
      <div className={styles.head}>
        <h2 className={styles.title}>Модули слов</h2>
        <p className={styles.lead}>
          Список = модуль. Сессия = урок до 5 слов. Ниже — воронка, цели и слабые слова.
        </p>
      </div>
      <div className={styles.list}>
        {items.slice(0, 8).map((mod) => {
          const hintShare = mod.assessed_count > 0
            ? Math.round((mod.hint_free_assessed / mod.assessed_count) * 100)
            : null;
          const open = expandedId === mod.id;
          return (
            <article key={mod.id} className={styles.card}>
              <button
                type="button"
                className={styles.cardToggle}
                onClick={() => {
                  setExpandedId(open ? null : mod.id);
                  if (open) setActiveSense(null);
                }}
                aria-expanded={open}
              >
                <div className={styles.cardTop}>
                  <div className={styles.titleRow}>
                    <h3 className={styles.cardTitle}>{mod.bound_label || mod.title}</h3>
                    {moduleKindLabel(mod) ? <span className={styles.badge}>{moduleKindLabel(mod)}</span> : null}
                    {mod.source === 'ai' ? <span className={styles.badge}>AI</span> : null}
                    {mod.module_clear ? <span className={styles.clearBadge}>Модуль закрыт</span> : null}
                    <span className={styles.chevron}>{open ? '▾' : '▸'}</span>
                  </div>
                  <div className={styles.meta}>
                    <span>{mod.coverage_pct}% в сессиях</span>
                    <span className={styles.dot}>·</span>
                    <span>{mod.mastered_pct}% освоено</span>
                    {mod.last_session_at ? (
                      <>
                        <span className={styles.dot}>·</span>
                        <span>{formatWhen(mod.last_session_at)}</span>
                      </>
                    ) : null}
                  </div>
                  <div className={styles.trend}>
                    <span>7д: {mod.sessions_7d}</span>
                    <span>30д: {mod.sessions_30d}</span>
                    {hintShare != null ? <span>без подсказки: {hintShare}%</span> : null}
                    {(mod.stats?.due || 0) > 0 ? (
                      <span className={styles.dueTag}>due {mod.stats.due}</span>
                    ) : null}
                  </div>
                </div>
              </button>

              <FunnelBar stats={mod.stats || { new: 0, learning: 0, due: 0, mastered: 0 }} />

              <div className={styles.goals}>
                {(mod.stats?.due || 0) > 0 ? (
                  <span className={styles.goalOpen}>Цель: закрыть due ({mod.stats.due})</span>
                ) : (
                  <span className={styles.goalDone}>Due закрыт</span>
                )}
                {mod.hint_free_assessed >= 3 ? (
                  <span className={styles.goalDone}>3+ сессии без подсказки</span>
                ) : (
                  <span className={styles.goalOpen}>
                    Цель: 3 сессии без подсказки ({mod.hint_free_assessed}/3)
                  </span>
                )}
                {mod.module_clear ? (
                  <span className={styles.goalDone}>Stable/Transferred под контролем</span>
                ) : null}
              </div>

              {mod.weak_words?.length > 0 && (
                <div className={styles.weak}>
                  <p className={styles.weakLabel}>Слабые сейчас — нажми, чтобы увидеть историю</p>
                  <div className={styles.weakWords}>
                    {mod.weak_words.slice(0, 5).map((word) => (
                      <button
                        key={word.sense_id}
                        type="button"
                        className={`${styles.weakChip} ${activeSense?.id === word.sense_id ? styles.weakChipOn : ''}`}
                        title={word.gloss_ru}
                        onClick={() => {
                          setExpandedId(mod.id);
                          setActiveSense(
                            activeSense?.id === word.sense_id
                              ? null
                              : { id: word.sense_id, headword: word.headword },
                          );
                        }}
                      >
                        {word.headword}
                        <em>{word.milestone_label}</em>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {open && activeSense && (
                <div className={styles.sensePanel}>
                  <div className={styles.sensePanelHead}>
                    <strong>{activeSense.headword}</strong>
                    <button type="button" className={styles.linkMuted} onClick={() => setActiveSense(null)}>
                      Скрыть
                    </button>
                  </div>
                  <SenseCourseTimeline senseId={activeSense.id} compact />
                </div>
              )}

              {open && (mod.recent_sessions?.length || 0) > 0 && (
                <div className={styles.sessions}>
                  <p className={styles.weakLabel}>Последние занятия</p>
                  {(mod.recent_sessions || []).map((session) => (
                    <div key={session.id} className={styles.sessionRow}>
                      <div className={styles.sessionMeta}>
                        <span>{formatWhen(session.created_at)}</span>
                        <span className={styles.dot}>·</span>
                        <span>
                          {session.status === 'assessed' ? 'Оценено' : session.status === 'active' ? 'В процессе' : 'Вышли'}
                        </span>
                        <span className={styles.dot}>·</span>
                        <span className={styles.summaryUsed}>{session.used_count} сам</span>
                        <span className={styles.summaryHinted}>{session.hinted_count} подск.</span>
                        <span className={styles.summaryMissed}>{session.missed_count} мимо</span>
                      </div>
                      <div className={styles.sessionWords}>
                        {(session.words || []).map((word) => (
                          <button
                            key={word.sense_id}
                            type="button"
                            className={`${styles.sessionWord} ${wordChipClass(word.status)}`}
                            onClick={() => setActiveSense({ id: word.sense_id, headword: word.headword })}
                          >
                            {word.headword}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => router.push(practiceHref(mod))}
                >
                  Продолжить модуль
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => router.push(`/dashboard?tab=dictionary&list=${mod.id}`)}
                >
                  Список / due
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => router.push(`${practiceHref(mod)}&repick=1`)}
                >
                  Другая пятёрка
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
