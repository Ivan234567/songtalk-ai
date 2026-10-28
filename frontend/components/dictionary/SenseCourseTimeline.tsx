'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAgentAuthHeaders } from '@/lib/agent-request';
import { useLearningLanguage } from '@/context/LearningLanguageContext';
import { supabase } from '@/lib/supabase';
import styles from './sense-course-timeline.module.css';

type TimelineItem = {
  dialogue_session_id: string;
  mode: string;
  status: string;
  word_status: string;
  created_at: string;
  list_title: string | null;
  bound_kind: string | null;
  bound_ref: string | null;
  bound_label: string | null;
  list_id: string | null;
};

type CoursePayload = {
  milestone: string;
  milestone_label: string;
  recognition_status: string;
  produced_count: number;
  session_count: number;
  last_move_source: 'card' | 'session' | null;
  timeline: TimelineItem[];
};

function getApiUrl() {
  const url = process.env.NEXT_PUBLIC_API_URL || '';
  return url.endsWith('/') ? url.slice(0, -1) : url;
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

function modeLabel(mode: string) {
  if (mode === 'roleplay') return 'Сцена';
  if (mode === 'debate') return 'Дебат';
  if (mode === 'chat') return 'Диалог';
  return mode;
}

function wordStatusLabel(status: string) {
  if (status === 'used') return 'сказал сам';
  if (status === 'hinted') return 'с подсказкой';
  if (status === 'missed') return 'мимо';
  if (status === 'waiting') return 'в сессии';
  return status;
}

export function SenseCourseTimeline({
  senseId,
  compact = false,
}: {
  senseId: string | null | undefined;
  compact?: boolean;
}) {
  const router = useRouter();
  const { learningLanguage } = useLearningLanguage();
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<CoursePayload | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data: sessionData }) => {
      if (!cancelled) setToken(sessionData.session?.access_token || null);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!token || !senseId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setState('loading');
    fetch(`${getApiUrl()}/api/vocabulary/srs/senses/${encodeURIComponent(senseId)}/course`, {
      headers: buildAgentAuthHeaders(token, learningLanguage),
    })
      .then(async (resp) => {
        const payload = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error('course');
        if (!cancelled) {
          setData(payload as CoursePayload);
          setState('idle');
        }
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => { cancelled = true; };
  }, [token, senseId, learningLanguage]);

  if (!senseId) return null;
  if (state === 'loading' && !data) {
    return <p className={styles.muted}>История в практике…</p>;
  }
  if (state === 'error' && !data) return null;
  if (!data) return null;

  return (
    <section className={`${styles.wrap} ${compact ? styles.compact : ''}`} aria-label="Курс слова">
      <div className={styles.head}>
        <div>
          <p className={styles.kicker}>В курсе</p>
          <strong className={styles.milestone}>{data.milestone_label}</strong>
        </div>
        <div className={styles.meta}>
          <span>{data.session_count} сесс.</span>
          <span>{data.produced_count} сам</span>
          {data.last_move_source ? (
            <span>{data.last_move_source === 'session' ? 'сдвиг: сессия' : 'сдвиг: карточка'}</span>
          ) : null}
        </div>
      </div>

      {data.timeline.length === 0 ? (
        <p className={styles.muted}>Пока не было в диалоге — возьми в практику из списка.</p>
      ) : (
        <ul className={styles.list}>
          {data.timeline.slice(0, compact ? 4 : 6).map((item) => (
            <li key={item.dialogue_session_id} className={styles.item}>
              <div className={styles.itemTop}>
                <span className={styles.mode}>{modeLabel(item.mode)}</span>
                <span className={styles.when}>{formatWhen(item.created_at)}</span>
              </div>
              <div className={styles.itemBody}>
                {item.bound_label || item.list_title || 'Практика слов'}
                <em className={
                  item.word_status === 'used'
                    ? styles.used
                    : item.word_status === 'hinted'
                      ? styles.hinted
                      : styles.missed
                }
                >
                  {wordStatusLabel(item.word_status)}
                </em>
              </div>
              {item.bound_kind === 'scenario' && item.bound_ref && item.list_id ? (
                <button
                  type="button"
                  className={styles.link}
                  onClick={() => router.push(
                    `/dashboard?tab=agent&from=vocab&list=${item.list_id}&target=rp:${item.bound_ref}`,
                  )}
                >
                  Снова в сцену
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
