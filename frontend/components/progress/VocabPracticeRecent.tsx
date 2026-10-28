'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAgentAuthHeaders } from '@/lib/agent-request';
import { useLearningLanguage } from '@/context/LearningLanguageContext';
import { supabase } from '@/lib/supabase';
import styles from './vocab-practice-recent.module.css';

type WordStatus = 'used' | 'hinted' | 'missed' | 'waiting' | 'other';

type RecentTarget = {
  sense_id: string;
  headword: string;
  gloss_ru: string;
  status?: WordStatus;
  verdict?: string;
};

type RecentItem = {
  id: string;
  mode: 'chat' | 'roleplay' | 'debate' | string;
  status: string;
  created_at: string;
  list_id: string | null;
  list_title: string | null;
  bound_kind: string | null;
  bound_ref: string | null;
  bound_label: string | null;
  targets: RecentTarget[];
  target_count: number;
  used_count?: number;
  hinted_count?: number;
  missed_count?: number;
};

function getApiUrl() {
  const url = process.env.NEXT_PUBLIC_API_URL || '';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function modeLabel(mode: string) {
  if (mode === 'roleplay') return 'Сценарий';
  if (mode === 'debate') return 'Дебат';
  if (mode === 'chat') return 'Свободный диалог';
  return mode;
}

function statusLabel(status: string) {
  if (status === 'assessed') return 'Оценено';
  if (status === 'abandoned') return 'Вышли';
  return 'В процессе';
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function wordStatusClass(status?: WordStatus) {
  if (status === 'used') return styles.wordUsed;
  if (status === 'hinted') return styles.wordHinted;
  if (status === 'missed') return styles.wordMissed;
  if (status === 'waiting') return styles.wordWaiting;
  return styles.wordOther;
}

function wordStatusTitle(target: RecentTarget) {
  const gloss = target.gloss_ru || '';
  if (target.status === 'used') return `${gloss} · сказал сам`;
  if (target.status === 'hinted') return `${gloss} · с подсказкой`;
  if (target.status === 'missed') return `${gloss} · не сказал`;
  if (target.status === 'waiting') return `${gloss} · ещё в сессии`;
  return gloss;
}

export function VocabPracticeRecent() {
  const router = useRouter();
  const { learningLanguage } = useLearningLanguage();
  const [token, setToken] = useState<string | null>(null);
  const [items, setItems] = useState<RecentItem[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

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
    fetch(`${getApiUrl()}/api/vocabulary/srs/dialogue/recent?limit=6`, {
      headers: buildAgentAuthHeaders(token, learningLanguage),
    })
      .then(async (resp) => {
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !Array.isArray(data?.items)) throw new Error('recent');
        if (!cancelled) {
          setItems(data.items as RecentItem[]);
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
      <section className={styles.section} aria-label="Слова в практике">
        <div className={styles.head}>
          <h2 className={styles.title}>Недавние уроки слов</h2>
        </div>
        <p className={styles.muted}>Загружаем недавние сессии…</p>
      </section>
    );
  }
  if (state === 'error' && items.length === 0) return null;
  if (items.length === 0) {
    return (
      <section className={styles.section} aria-label="Слова в практике">
        <div className={styles.head}>
          <h2 className={styles.title}>Недавние уроки слов</h2>
          <p className={styles.lead}>
            После сессии со словами здесь будет пятёрка: сказал сам / с подсказкой / мимо.
          </p>
        </div>
        <div className={styles.emptyRow}>
          <button
            type="button"
            className={styles.cta}
            onClick={() => router.push('/dashboard?tab=agent')}
          >
            Взять слова в практику
          </button>
          <button
            type="button"
            className={styles.link}
            onClick={() => router.push('/dashboard?tab=dictionary')}
          >
            Сначала выбрать список
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.section} aria-label="Слова в практике">
      <div className={styles.head}>
        <h2 className={styles.title}>Недавние уроки слов</h2>
        <p className={styles.lead}>
          Зелёный — сказал сам, жёлтый — с подсказкой, красный — не сказал. Это урок, не оценка сцены.
        </p>
      </div>
      <div className={styles.list}>
        {items.map((item) => {
          const binding = item.bound_label || item.list_title;
          const used = item.used_count ?? item.targets.filter((t) => t.status === 'used').length;
          const hinted = item.hinted_count ?? item.targets.filter((t) => t.status === 'hinted').length;
          const missed = item.missed_count ?? item.targets.filter((t) => t.status === 'missed').length;
          return (
            <article key={item.id} className={styles.card}>
              <div className={styles.cardTop}>
                <div className={styles.meta}>
                  <span className={styles.mode}>{modeLabel(item.mode)}</span>
                  <span className={styles.dot}>·</span>
                  <span>{statusLabel(item.status)}</span>
                  <span className={styles.dot}>·</span>
                  <span>{formatWhen(item.created_at)}</span>
                </div>
                {binding ? <div className={styles.binding}>{binding}</div> : null}
                {item.target_count > 0 && (
                  <div className={styles.summary}>
                    <span className={styles.summaryUsed}>{used} сам</span>
                    <span className={styles.summaryHinted}>{hinted} подсказка</span>
                    <span className={styles.summaryMissed}>{missed} мимо</span>
                  </div>
                )}
              </div>
              <div className={styles.words}>
                {(item.targets || []).slice(0, 5).map((target) => (
                  <span
                    key={target.sense_id}
                    className={`${styles.wordChip} ${wordStatusClass(target.status)}`}
                    title={wordStatusTitle(target)}
                  >
                    {target.headword}
                  </span>
                ))}
                {item.target_count === 0 && (
                  <span className={styles.mutedInline}>Без зафиксированных слов</span>
                )}
              </div>
              <div className={styles.cardActions}>
                {item.bound_kind === 'scenario' && item.bound_ref ? (
                  <button
                    type="button"
                    className={styles.link}
                    onClick={() => router.push(
                      `/dashboard?tab=agent&from=vocab&list=${item.list_id || ''}&target=rp:${item.bound_ref}`,
                    )}
                  >
                    Продолжить сцену
                  </button>
                ) : item.bound_kind === 'debate' && item.list_id ? (
                  <button
                    type="button"
                    className={styles.link}
                    onClick={() => router.push(
                      `/dashboard?tab=agent&from=vocab&list=${item.list_id}&mode=debate`,
                    )}
                  >
                    Продолжить дебат
                  </button>
                ) : item.list_id ? (
                  <button
                    type="button"
                    className={styles.link}
                    onClick={() => router.push(`/dashboard?tab=dictionary&list=${item.list_id}`)}
                  >
                    Открыть список
                  </button>
                ) : null}
                {item.list_id ? (
                  <button
                    type="button"
                    className={styles.linkMuted}
                    onClick={() => router.push(
                      item.bound_kind === 'scenario' && item.bound_ref
                        ? `/dashboard?tab=agent&from=vocab&list=${item.list_id}&target=rp:${item.bound_ref}&repick=1`
                        : `/dashboard?tab=agent&from=vocab&list=${item.list_id}&repick=1`,
                    )}
                  >
                    Другая пятёрка
                  </button>
                ) : null}
              </div>
              {item.status === 'assessed' && (
                <p className={styles.sessionOutcome}>
                  Итог сессии: {used} сказал · {hinted} с подсказкой · {missed} мимо
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
