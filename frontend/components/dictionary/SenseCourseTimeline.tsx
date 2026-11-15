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
  verdict?: string;
  schedule_held?: boolean;
};

type SpeechSchedule = {
  bucket: 'new' | 'due' | 'later';
  due_at: string | null;
};

type RetentionWindow = {
  days: number;
  state: 'waiting' | 'available' | 'confirmed' | 'unconfirmed';
  due_at: string;
  checked_at: string | null;
  interval_days: number | null;
};

type RetentionPlan = {
  anchored_at: string;
  check_7_at: string;
  check_30_at: string;
  windows?: RetentionWindow[];
};

type CoursePayload = {
  milestone: string;
  milestone_label: string;
  recognition_status: string;
  produced_count: number;
  session_count: number;
  last_move_source: 'card' | 'session' | null;
  speech?: SpeechSchedule | null;
  retention?: RetentionPlan | null;
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

function wordStatusLabel(status: string, held = false) {
  if (status === 'used') return held ? 'сказал сам · срок без изменений' : 'сказал сам';
  if (status === 'wrong_sense') return held ? 'другой смысл · срок без изменений' : 'другой смысл';
  if (status === 'hinted') return 'после подсказки';
  if (status === 'echoed') return 'повтор за собеседником';
  if (status === 'mentioned') return 'неясно';
  if (status === 'no_opportunity') return 'возможности не было';
  if (status === 'missed') return 'не сказал';
  if (status === 'waiting') return 'в сессии';
  return status;
}

function pluralDays(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'сутки';
  return 'суток';
}

function retentionWindowLine(window: RetentionWindow) {
  const name = window.days === 30 ? 'Вторая проверка' : 'Первая проверка';
  if (window.state === 'confirmed' && window.interval_days != null && window.checked_at) {
    return `${name}: удерживает, ${window.interval_days} ${pluralDays(window.interval_days)}. Проверено ${formatWhen(window.checked_at)}.`;
  }
  if (window.state === 'available') return `${name} доступна.`;
  if (window.state === 'unconfirmed') return `${name}: попытка не подтвердила удержание.`;
  return `${name} ожидается ${formatWhen(window.due_at)}.`;
}

function RetentionPlanView({ plan }: { plan: RetentionPlan | null | undefined }) {
  if (!plan?.anchored_at || !plan.check_7_at || !plan.check_30_at) return null;
  const windows = Array.isArray(plan.windows) ? plan.windows : [];
  return (
    <div className={styles.plan} aria-label="Удержание">
      <p className={styles.kicker}>Удержание</p>
      <p>Повторно сказано {formatWhen(plan.anchored_at)}</p>
      {windows.length > 0 ? windows.map((window) => (
        <p key={window.days}>{retentionWindowLine(window)}</p>
      )) : (
        <>
          <p>Первая проверка ожидается {formatWhen(plan.check_7_at)}</p>
          <p>Вторая проверка ожидается {formatWhen(plan.check_30_at)}</p>
        </>
      )}
      <p className={styles.note}>Это отдельно от карточки узнавания и обычного срока повторения.</p>
    </div>
  );
}

function speechLabel(speech: SpeechSchedule | null | undefined) {
  if (!speech || speech.bucket === 'new') return 'новое';
  const when = speech.due_at ? formatWhen(speech.due_at) : '';
  if (speech.bucket === 'due') return when ? `пора сказать · ${when}` : 'пора сказать';
  return when ? `следующий раз · ${when}` : 'следующий раз';
}

export function SenseCourseTimeline({
  senseId,
  compact = false,
  variant = 'card',
}: {
  senseId: string | null | undefined;
  compact?: boolean;
  variant?: 'card' | 'sheet';
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

  if (variant === 'sheet') {
    return (
      <>
        <div className={styles.facts}>
          <span><b>{data?.session_count ?? 0}</b>в диалогах</span>
          <span><b>{data?.produced_count ?? 0}</b>сказано самому</span>
        </div>
        <RetentionPlanView plan={data?.retention} />
        <div className={styles.sheetSec}>
          <h3>История</h3>
          {state === 'loading' && !data ? <p className={styles.sheetMuted}>История в практике…</p> : null}
          {data && data.timeline.length > 0 ? (
            <ul className={styles.hist}>
              {data.timeline.slice(0, 6).map((item) => {
                const ok = item.word_status === 'used' || item.word_status === 'produced';
                return (
                  <li key={item.dialogue_session_id}>
                    <span className={ok ? styles.ok : styles.no}>
                      {ok ? '✓' : '↺'} {wordStatusLabel(item.word_status, item.schedule_held)}
                    </span>
                    <small>
                      {formatWhen(item.created_at)}
                      {item.bound_label || item.list_title ? ` · ${item.bound_label || item.list_title}` : ''}
                    </small>
                  </li>
                );
              })}
            </ul>
          ) : state === 'loading' ? null : (
            <p className={styles.sheetMuted}>Пока не было в диалоге.</p>
          )}
        </div>
      </>
    );
  }

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
          <span>{speechLabel(data.speech)}</span>
          {data.last_move_source ? (
            <span>{data.last_move_source === 'session' ? 'сдвиг: сессия' : 'сдвиг: карточка'}</span>
          ) : null}
        </div>
      </div>

      <RetentionPlanView plan={data.retention} />

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
                    : item.word_status === 'hinted' || item.word_status === 'no_opportunity'
                      ? styles.hinted
                      : item.word_status === 'missed' || item.word_status === 'wrong_sense'
                        ? styles.missed
                        : styles.hinted
                }
                >
                  {wordStatusLabel(item.word_status, item.schedule_held)}
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
