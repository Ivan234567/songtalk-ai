'use client';

import React, { useEffect, useState } from 'react';
import { TrendChart, type TrendChartPoint } from '@/components/ui/TrendChart';
import { VocabCourseSection, type CourseFunnelTotals } from './VocabCourseSection';
import styles from './progress-screen.module.css';

export type ProgressTabKey = 'overview' | 'speech' | 'words';
export type ProgressPeriod = '7d' | '30d' | '90d' | 'all';
export type ProgressMode = 'roleplay' | 'debate';
export type ProgressView = 'system' | 'personal';

export type ScreenCriterion = {
  key: string;
  label: string;
  short: string;
  value: number;
  min: number | null;
  max: number | null;
  samples: number;
  delta: number;
};

export type ScreenSession = {
  id: string;
  title: string;
  score: number | null;
  completedAt: string;
  kind: 'roleplay' | 'debate';
  objectKey: string;
  completionId: string;
};

export type ScreenRecommend = {
  id: string;
  title: string;
  score: number | null;
  reason: string;
  completedAt: string;
  objectKey: string;
  completionId: string;
  priority?: 'high' | 'medium' | 'low';
};

type ProgressScreenProps = {
  period: ProgressPeriod;
  onPeriod: (value: ProgressPeriod) => void;
  mode: ProgressMode;
  onMode: (value: ProgressMode) => void;
  view: ProgressView;
  onView: (value: ProgressView) => void;
  roleplayCount: number;
  debateCount: number;
  systemCount: number;
  personalCount: number;
  avgScore: number | null;
  sessionsCount: number;
  bestScore: number | null;
  streakDays: number;
  delta: { value: number; isPositive: boolean } | null;
  trendPoints: TrendChartPoint[];
  criteria: ScreenCriterion[];
  focusKey: string | null;
  onFocus: (key: string | null) => void;
  sessions: ScreenSession[];
  recommendations: ScreenRecommend[];
  onOpen: (objectKey: string, completionId: string) => void;
  onPractice: (objectKey: string) => void;
  onPracticeHome: () => void;
  wordTotals: CourseFunnelTotals | null;
  onWordTotals: (totals: CourseFunnelTotals) => void;
};

const PERIODS: { value: ProgressPeriod; label: string }[] = [
  { value: '7d', label: '7 дней' },
  { value: '30d', label: '30 дней' },
  { value: '90d', label: '90 дней' },
  { value: 'all', label: 'Всё время' },
];

const SHORT: Record<string, string> = {
  fluency: 'Беглость',
  vocabulary_grammar: 'Лексика',
  pronunciation: 'Произношение',
  completeness: 'Логика',
  dialogue_skills: 'Диалог',
};

function tone(value: number) {
  if (value >= 7.5) return 'var(--good)';
  if (value >= 5) return 'var(--mid)';
  return 'var(--low)';
}

function verdict(value: number) {
  if (value >= 7.5) return 'Хорошо';
  if (value >= 5) return 'Есть куда расти';
  return 'Нужна практика';
}

function periodLabel(period: ProgressPeriod) {
  return PERIODS.find((item) => item.value === period)?.label ?? '30 дней';
}

function when(iso: string) {
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  if (days < 7) return `${days} дн. назад`;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function wordsLabel(count: number) {
  const a = count % 10;
  const b = count % 100;
  const word = a === 1 && b !== 11 ? 'слово' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'слова' : 'слов';
  return `${count} ${word}`;
}

function sessionsWord(count: number) {
  const a = count % 10;
  const b = count % 100;
  if (a === 1 && b !== 11) return 'сессия';
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'сессии';
  return 'сессий';
}

function Funnel({ totals }: { totals: CourseFunnelTotals }) {
  const parts = [
    ['К повторению', totals.due, '#ff7a7a'],
    ['Учу', totals.learning, '#ffa14d'],
    ['Новые', totals.fresh, '#7aa2ff'],
    ['Освоено', totals.mastered, '#6fdc9a'],
  ] as const;
  return (
    <>
      <div className={styles.fun} aria-hidden>
        {parts.map(([label, value, color]) => value > 0 ? <i key={label} style={{ flex: value, background: color }} /> : null)}
      </div>
      <div className={styles.leg}>
        {parts.map(([label, value, color]) => (
          <div key={label} style={{ ['--c' as string]: color }}>
            <b>{value}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export function ProgressScreen(props: ProgressScreenProps) {
  const [tab, setTab] = useState<ProgressTabKey>('overview');
  const [sort, setSort] = useState<'date' | 'down' | 'up'>('date');
  const [showAll, setShowAll] = useState(false);
  const focus = props.criteria.find((item) => item.key === props.focusKey)
    ?? [...props.criteria].filter((item) => item.value > 0).sort((a, b) => a.value - b.value)[0]
    ?? null;
  const scored = props.sessions.filter((item) => item.score != null);
  const worst = [...scored].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];
  const sorted = [...props.sessions].sort((a, b) => {
    if (sort === 'down') return (b.score ?? -1) - (a.score ?? -1);
    if (sort === 'up') return (a.score ?? 99) - (b.score ?? 99);
    return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
  });
  const shown = showAll ? sorted : sorted.slice(0, 5);
  const due = props.wordTotals?.due ?? 0;
  const wordSum = props.wordTotals
    ? props.wordTotals.due + props.wordTotals.learning + props.wordTotals.fresh + props.wordTotals.mastered
    : 0;

  useEffect(() => { setShowAll(false); }, [props.period, props.mode, props.view]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const index = Number(event.key);
      if (index >= 1 && index <= 4) {
        props.onPeriod(PERIODS[index - 1].value);
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'r') props.onMode('roleplay');
      if (key === 'd') props.onMode('debate');
      if (key === 's') props.onView('system');
      if (key === 'l') props.onView('personal');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [props.onPeriod, props.onMode, props.onView]);

  const openPractice = () => {
    if (worst) props.onPractice(worst.objectKey);
    else props.onPracticeHome();
  };

  const sessionsCard = (
    <section className={styles.card}>
      <div className={styles.ch}>
        <div>
          <h2>Сессии</h2>
          <p className={styles.sub}>Нажмите, чтобы открыть разбор</p>
        </div>
        <div className={styles.flt}>
          <div className={styles.seg}>
            <button type="button" aria-pressed={props.mode === 'roleplay'} onClick={() => props.onMode('roleplay')}>Сценарии <b>{props.roleplayCount}</b></button>
            <button type="button" aria-pressed={props.mode === 'debate'} onClick={() => props.onMode('debate')}>Дебаты <b>{props.debateCount}</b></button>
          </div>
          <div className={styles.seg}>
            <button type="button" aria-pressed={props.view === 'system'} onClick={() => props.onView('system')}>Системные <b>{props.systemCount}</b></button>
            <button type="button" aria-pressed={props.view === 'personal'} onClick={() => props.onView('personal')}>Личные <b>{props.personalCount}</b></button>
          </div>
          <div className={styles.seg}>
            <button type="button" aria-pressed={sort === 'date'} onClick={() => setSort('date')}>Дата</button>
            <button type="button" aria-pressed={sort === 'down'} onClick={() => setSort('down')}>Балл ↓</button>
            <button type="button" aria-pressed={sort === 'up'} onClick={() => setSort('up')}>Балл ↑</button>
          </div>
        </div>
      </div>
      {shown.length === 0 ? <p className={styles.empty}>Нет сессий за выбранный период. Попробуйте другой период или фильтр.</p> : shown.map((row) => (
        <button key={row.id} type="button" className={styles.ses} onClick={() => props.onOpen(row.objectKey, row.completionId)}>
          <span className={styles.tile} style={{ ['--c' as string]: row.score != null ? tone(row.score) : 'var(--mut)' }}>{row.score != null ? row.score.toFixed(1) : '—'}</span>
          <span><b>{row.title}</b><small>{row.kind === 'debate' ? 'Дебаты' : 'Сценарий'} · {when(row.completedAt)}</small></span>
          <span className={styles.go}>→</span>
        </button>
      ))}
      {sorted.length > 5 ? (
        <button type="button" className={`${styles.btn} ${styles.sm}`} style={{ marginTop: 10 }} onClick={() => setShowAll((value) => !value)}>
          {showAll ? 'Скрыть' : `Показать все (${sorted.length})`}
        </button>
      ) : null}
    </section>
  );

  return (
    <div className={styles.screen}>
      <div className={styles.stick}>
        <div className={styles.head}>
          <div>
            <h1>Прогресс</h1>
            <p>Как вы говорите и как усваиваете слова</p>
          </div>
          <div className={styles.seg} role="group" aria-label="Период">
            {PERIODS.map((item) => (
              <button key={item.value} type="button" aria-pressed={props.period === item.value} onClick={() => props.onPeriod(item.value)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.tabs} role="tablist">
          {([
            ['overview', 'Обзор'],
            ['speech', 'Речь'],
            ['words', 'Слова'],
          ] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
              {label}
              {key === 'words' && due > 0 ? <span className={styles.cnt}>{due}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && (
        <>
          {sessionsCard}
          <section className={styles.card}>
            <div className={styles.hero}>
              <div>
                <div className={styles.score}>
                  <svg className={styles.ring} viewBox="0 0 132 132" role="img" aria-label={props.avgScore != null ? `Средний балл ${props.avgScore.toFixed(1)} из 10` : 'Нет среднего балла'}>
                    <circle cx="66" cy="66" r="54" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="10" />
                    <circle cx="66" cy="66" r="54" fill="none" stroke={props.avgScore != null ? tone(props.avgScore) : 'rgba(255,255,255,0.2)'} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${((props.avgScore ?? 0) / 10) * 339.3} 339.3`} transform="rotate(-90 66 66)" />
                    <text x="66" y="68" textAnchor="middle" fontSize="34" fontWeight="700">{props.avgScore != null ? props.avgScore.toFixed(1) : '—'}</text>
                    <text x="66" y="88" textAnchor="middle" fontSize="12" fill="rgba(232,236,244,0.68)">из 10</text>
                  </svg>
                  <div className={styles.sv}>
                    <b style={{ color: props.avgScore != null ? tone(props.avgScore) : undefined }}>{props.avgScore != null ? verdict(props.avgScore) : 'Пока нет оценок'}</b>
                    Средний балл за {props.period === 'all' ? 'всё время' : periodLabel(props.period)}
                    {props.delta ? <span className={`${styles.delta} ${props.delta.isPositive ? styles.up : styles.dn}`}>{props.delta.isPositive ? '↑' : '↓'} {Math.abs(props.delta.value).toFixed(1)} к прошлому периоду</span> : null}
                  </div>
                </div>
                <div className={styles.mini}>
                  <div><b>{props.sessionsCount}</b><span>{sessionsWord(props.sessionsCount)}</span></div>
                  <div><b>{props.bestScore != null ? props.bestScore.toFixed(1) : '—'}</b><span>лучший балл</span></div>
                  <div><b>{props.streakDays > 0 ? `${props.streakDays} ${props.streakDays === 1 ? 'день' : props.streakDays < 5 ? 'дня' : 'дней'}` : '—'}</b><span>серия подряд</span></div>
                </div>
              </div>
              <div>
                <div className={styles.chartH}><span>Балл по сессиям</span><span>{props.trendPoints.length} {props.trendPoints.length === 1 ? 'точка' : 'точек'}</span></div>
                {props.trendPoints.length < 2 ? <p className={styles.empty}>Мало данных для графика. Пройдите ещё сессию.</p> : <TrendChart points={props.trendPoints} height={220} />}
              </div>
            </div>
          </section>

          {focus && worst && (
            <section className={`${styles.card} ${styles.next}`}>
              <span className={styles.bolt} aria-hidden>⚡</span>
              <div className={styles.t}>
                <div className={styles.k}>Что дальше</div>
                <h2>Подтяните «{focus.label}» · {focus.value.toFixed(1)}</h2>
                <p>Это самый слабый критерий. Начните с «{worst.title}» ({worst.score?.toFixed(1)}): здесь выше всего шанс вырасти.</p>
              </div>
              <div className={styles.acts}>
                <button type="button" className={styles.pri} onClick={openPractice}>Пройти снова</button>
                {due > 0 ? <button type="button" className={styles.btn} onClick={() => setTab('words')}>Повторить {wordsLabel(due)}</button> : null}
              </div>
            </section>
          )}

          <div className={styles.g2}>
            <section className={styles.card}>
              <div className={styles.ch}>
                <div><h2>Речь</h2><p className={styles.sub}>Средний балл по критериям</p></div>
                <button type="button" className={styles.link} onClick={() => setTab('speech')}>Подробнее</button>
              </div>
              {[...props.criteria].sort((a, b) => b.value - a.value).map((item) => (
                <button key={item.key} type="button" className={styles.mr} style={{ ['--c' as string]: tone(item.value) }} onClick={() => { props.onFocus(item.key); setTab('speech'); }}>
                  <span>{SHORT[item.key] || item.short}</span>
                  <div className={styles.trk}><i style={{ width: `${item.value * 10}%` }} /></div>
                  <b>{item.value.toFixed(1)}</b>
                </button>
              ))}
            </section>
            <section className={styles.card}>
              <div className={styles.ch}>
                <div><h2>Слова</h2><p className={styles.sub}>{wordSum > 0 ? `${wordsLabel(wordSum)} в работе` : 'Списки и усвоение'}</p></div>
                <button type="button" className={styles.link} onClick={() => setTab('words')}>Подробнее</button>
              </div>
              {props.wordTotals ? <Funnel totals={props.wordTotals} /> : <p className={styles.sub}>Считаем воронку слов…</p>}
            </section>
          </div>
        </>
      )}

      {tab === 'speech' && (
        <>
          {sessionsCard}
          <section className={styles.card}>
            <div className={styles.ch}>
              <div>
                <h2>Критерии оценки</h2>
                <p className={styles.sub}>Точка — средний балл, полоса — разброс оценок. Нажмите на критерий, чтобы сделать его фокусом.</p>
              </div>
            </div>
            <div className={styles.cwrap}>
              <Radar criteria={props.criteria} focusKey={focus?.key ?? null} />
              <div>
                {props.criteria.map((item) => {
                  const left = (item.min ?? item.value) * 10;
                  const width = Math.max(4, ((item.max ?? item.value) - (item.min ?? item.value)) * 10);
                  return (
                    <button key={item.key} type="button" className={styles.crit} aria-pressed={props.focusKey === item.key} onClick={() => props.onFocus(props.focusKey === item.key ? null : item.key)}>
                      <div className={styles.cr1}>
                        <span>
                          {item.label}
                          {focus?.key === item.key && props.focusKey !== item.key ? <span className={styles.tag}>слабое место</span> : null}
                          {props.focusKey === item.key ? <span className={`${styles.tag} ${styles.focus}`}>фокус</span> : null}
                        </span>
                        <span>
                          <b style={{ color: tone(item.value) }}>{item.value.toFixed(1)}</b>
                          <em className={item.delta > 0.05 ? styles.good : item.delta < -0.05 ? styles.low : styles.flat}>{item.delta > 0.05 ? '↑' : item.delta < -0.05 ? '↓' : '→'}</em>
                        </span>
                      </div>
                      <div className={styles.band} style={{ ['--c' as string]: tone(item.value) }}>
                        <i style={{ left: `${left}%`, width: `${width}%` }} />
                        <u style={{ left: `${item.value * 10}%` }} />
                      </div>
                      <div className={styles.cr2}>{item.samples} оценок · от {item.min != null ? item.min.toFixed(1) : '—'} до {item.max != null ? item.max.toFixed(1) : '—'}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.ch}>
              <div>
                <h2>Что повторить</h2>
                <p className={styles.sub}>Фокус: {focus?.label ?? 'критерий'}. Начните с первой карточки.</p>
              </div>
            </div>
            {props.recommendations.length === 0 ? <p className={styles.empty}>Пока нечего повторять. Пройдите больше сессий.</p> : (
              <div className={styles.recs}>
                {props.recommendations.slice(0, 3).map((row, index) => (
                  <article key={row.id} className={`${styles.rec} ${index === 0 ? styles.first : ''}`}>
                    <span className={styles.prio}>{row.priority === 'high' || index === 0 ? 'Высокий приоритет' : row.priority === 'low' ? 'Низкий приоритет' : 'Средний приоритет'}</span>
                    <b>{row.title}</b>
                    <small>{focus?.short || focus?.label} · балл {row.score != null ? row.score.toFixed(1) : '—'} · {when(row.completedAt)}</small>
                    <p>{row.reason}</p>
                    <div className={styles.acts}>
                      <button type="button" className={`${index === 0 ? styles.pri : styles.btn} ${styles.sm}`} onClick={() => props.onPractice(row.objectKey)}>Практиковать</button>
                      <button type="button" className={`${styles.btn} ${styles.sm}`} onClick={() => props.onOpen(row.objectKey, row.completionId)}>Разбор</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

        </>
      )}

      <div className={styles.words} hidden={tab !== 'words'}>
        <VocabCourseSection embedded onTotals={props.onWordTotals} />
      </div>
    </div>
  );
}

function Radar({ criteria, focusKey }: { criteria: ScreenCriterion[]; focusKey: string | null }) {
  const cx = 130;
  const cy = 108;
  const radius = 78;
  const point = (index: number, value: number) => {
    const angle = -Math.PI / 2 + index * 2 * Math.PI / Math.max(criteria.length, 1);
    return [cx + radius * (value / 10) * Math.cos(angle), cy + radius * (value / 10) * Math.sin(angle)];
  };
  const poly = (scale?: number) => criteria.map((item, index) => point(index, scale ?? item.value).map((n) => n.toFixed(1)).join(',')).join(' ');
  return (
    <div className={styles.radar}>
      <svg viewBox="-36 -8 332 240" role="img" aria-label="Радар критериев">
        {[2.5, 5, 7.5, 10].map((value) => <polygon key={value} points={poly(value)} fill="none" stroke="rgba(255,255,255,0.12)" />)}
        {criteria.map((item, index) => {
          const end = point(index, 10);
          const label = point(index, 12.2);
          return (
            <g key={item.key}>
              <line x1={cx} y1={cy} x2={end[0]} y2={end[1]} stroke="rgba(255,255,255,0.12)" />
              <text x={label[0]} y={label[1] + 4} textAnchor={Math.abs(label[0] - cx) < 8 ? 'middle' : label[0] > cx ? 'start' : 'end'}>{SHORT[item.key] || item.short} {item.value.toFixed(1)}</text>
            </g>
          );
        })}
        <polygon points={poly()} fill="rgba(122,215,167,0.28)" stroke="var(--accent)" strokeWidth="2.5" />
        {criteria.map((item, index) => {
          const spot = point(index, item.value);
          return <circle key={item.key} cx={spot[0]} cy={spot[1]} r={item.key === focusKey ? 6.5 : 4} fill="var(--accent)" />;
        })}
      </svg>
    </div>
  );
}
