'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useProgressWords,
  type ProgressModuleCard,
  type ProgressWordRow,
  type RecognitionBucket,
  type SpeakMark,
} from './hooks/useProgressWords';
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
  criterionScore?: number;
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
  compareNote: string | null;
  trendPoints: Array<{ key: string; value: number; label: string; count?: number }>;
  criteria: ScreenCriterion[];
  focusKey: string | null;
  onFocus: (key: string | null) => void;
  sessions: ScreenSession[];
  recommendations: ScreenRecommend[];
  onOpen: (objectKey: string, completionId: string) => void;
  onPractice: (objectKey: string) => void;
  onPracticeHome: () => void;
};

const PERIODS: { value: ProgressPeriod; label: string }[] = [
  { value: '7d', label: '7 дней' },
  { value: '30d', label: '30 дней' },
  { value: '90d', label: '90 дней' },
  { value: 'all', label: 'Всё время' },
];

const CRITERION_ORDER = ['completeness', 'fluency', 'pronunciation', 'vocabulary_grammar', 'dialogue_skills'];
const CRITERION_SUB: Record<string, string> = {
  completeness: 'Полнота и логика',
  vocabulary_grammar: 'Лексика и грамматика',
};

type StageFilter = 'all' | 'due' | 'learn' | 'new' | 'done';

const STAGES: Array<{ key: Exclude<StageFilter, 'all'>; name: string; desc: string; color: string; border: string }> = [
  { key: 'due', name: 'К повторению', desc: 'Пришёл срок повторить', color: '#ff9b9b', border: '#ff7a7a55' },
  { key: 'learn', name: 'Учу', desc: 'Оценены, но не закреплены', color: '#ffc48a', border: '#ffa14d55' },
  { key: 'new', name: 'Новые', desc: 'Карточку ещё не оценивали', color: '#b7c8ff', border: '#7aa2ff55' },
  { key: 'done', name: 'Освоено', desc: 'Два успеха, интервал от 6 дней', color: '#6fdc9a', border: '#6fdc9a55' },
];

const REC_LABEL: Record<RecognitionBucket, string> = {
  due: 'К повторению',
  learning: 'Учу',
  new: 'Новое',
  mastered: 'Освоено',
};

const REC_COLOR: Record<RecognitionBucket, string> = {
  due: '#ff9b9b',
  learning: '#ffc48a',
  new: '#b7c8ff',
  mastered: '#6fdc9a',
};

const SPEAK_LABEL: Record<SpeakMark, string> = {
  said: 'Сказал сам',
  waiting: 'Ещё в сессии',
  hinted: 'С подсказкой',
  missed: 'Не сказал',
  silent: 'Не звучало',
};

function toneHex(value: number) {
  if (value >= 7.5) return '#6fdc9a';
  if (value >= 5) return '#ffa14d';
  return '#ff7a7a';
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

function sessionsWord(count: number) {
  const a = count % 10;
  const b = count % 100;
  if (a === 1 && b !== 11) return 'сессия';
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'сессии';
  return 'сессий';
}

function streakLabel(days: number) {
  if (days <= 0) return '—';
  const a = days % 10;
  const b = days % 100;
  const word = a === 1 && b !== 11 ? 'день' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'дня' : 'дней';
  return `${days} ${word}`;
}

function stageKey(bucket: RecognitionBucket): 'due' | 'learn' | 'new' | 'done' {
  if (bucket === 'learning') return 'learn';
  if (bucket === 'mastered') return 'done';
  return bucket;
}

export function ProgressScreen(props: ProgressScreenProps) {
  const router = useRouter();
  const words = useProgressWords();
  const [sort, setSort] = useState<'date' | 'down' | 'up'>('date');
  const [showAll, setShowAll] = useState(false);
  const [stage, setStage] = useState<StageFilter>('all');
  const [saidOnly, setSaidOnly] = useState(false);
  const [openModule, setOpenModule] = useState<string | null>(null);

  const orderedCriteria = CRITERION_ORDER
    .map((key) => props.criteria.find((item) => item.key === key))
    .filter((item): item is ScreenCriterion => Boolean(item));
  const focus = orderedCriteria.find((item) => item.key === props.focusKey)
    ?? [...orderedCriteria].filter((item) => item.value > 0).sort((a, b) => a.value - b.value)[0]
    ?? null;
  const scored = props.sessions.filter((item) => item.score != null);
  const worst = [...scored].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];
  const sorted = [...props.sessions].sort((a, b) => {
    if (sort === 'down') return (b.score ?? -1) - (a.score ?? -1);
    if (sort === 'up') return (a.score ?? 99) - (b.score ?? 99);
    return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
  });
  const shown = showAll ? sorted : sorted.slice(0, 5);
  const hasRows = props.sessionsCount > 0;
  const scoreText = props.avgScore != null ? props.avgScore.toFixed(1) : '—';
  const scoreColor = props.avgScore != null ? toneHex(props.avgScore) : '#c5c8d0';
  const periodName = props.period === 'all' ? 'всё время' : periodLabel(props.period);

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

  const stageCount = (key: StageFilter) => {
    if (key === 'due') return words.due;
    if (key === 'learn') return words.learning;
    if (key === 'new') return words.fresh;
    if (key === 'done') return words.mastered;
    return words.total;
  };

  const visibleWords = words.words.filter((row) => {
    if (saidOnly && !row.everSaid) return false;
    if (stage === 'all') return true;
    return stageKey(row.recognition) === stage;
  });

  const wordEmpty = words.wordsReady && visibleWords.length === 0
    ? (saidOnly
      ? 'Нет слов, сказанных сами.'
      : stage === 'new' || stage === 'all'
        ? 'Пока нет слов в привязанных списках.'
        : 'Пока пусто: слова попадут сюда после оценки карточек «узнаю».')
    : '';

  const heroLine = words.total > 0 && words.fresh === words.total
    ? 'Все слова пока в начале пути. Оцените карточки «узнаю» — слова пойдут дальше.'
    : words.total > 0
      ? 'Освоено считается только по карточкам «узнаю». Сказанное в диалоге сюда не переносится.'
      : 'Привяжите список к сцене или дебату — здесь появится путь слов.';

  return (
    <div className={styles.screen}>
      <header className={styles.top}>
        <h1>Прогресс</h1>
        <nav className={styles.nv} aria-label="Разделы страницы">
          <a href="#today">Сегодня</a>
          <a href="#speech">Речь</a>
          <a href="#words">Слова</a>
        </nav>
      </header>
      <div className={styles.wrap}>
        <section className={`${styles.chap} ${styles.td}`} id="today">
          <div className={styles.cap}>
            <span className={styles.n}>СЕГОДНЯ</span>
            <h2>Где вы сейчас</h2>
          </div>
          {focus && worst && (
            <div className={`${styles.tile} ${styles.hi} ${styles.banner}`}>
              <div style={{ maxWidth: 700 }}>
                <div className={styles.lbl} style={{ color: 'var(--acc)' }}>Что дальше</div>
                <h2 style={{ fontSize: 24, margin: '6px 0' }}>Подтяните «{focus.label}» · {focus.value.toFixed(1)}</h2>
                <p className={`${styles.mut} ${styles.sm}`}>Начните с «{worst.title}» ({worst.score?.toFixed(1)}) — здесь выше всего шанс вырасти.</p>
              </div>
              <button type="button" className={`${styles.btn} ${styles.pri}`} onClick={() => props.onPractice(worst.objectKey)}>Пройти снова</button>
            </div>
          )}
          <div className={styles.grid}>
            <a className={`${styles.tile} ${styles.sp}`} href="#speech">
              <div className={styles.lbl}>Речь · {periodName}</div>
              <span className={styles.big} style={{ color: scoreColor }}>{scoreText}</span>
              <span className={`${styles.mut} ${styles.sm}`}>{props.avgScore != null ? verdict(props.avgScore) : 'Пока нет оценок'} · {props.sessionsCount} {sessionsWord(props.sessionsCount)}</span>
            </a>
            <a className={`${styles.tile} ${styles.bl}`} href="#words">
              <div className={styles.lbl}>Слова · все списки</div>
              <span className={styles.big}>
                {words.state === 'loading' ? '…' : words.mastered} <span className={styles.mut}>из {words.state === 'loading' ? '…' : words.total}</span>
              </span>
              <span className={`${styles.mut} ${styles.sm}`}>освоено · сказали сами: {words.wordsReady ? words.said : '…'}</span>
            </a>
            <div className={styles.tile}>
              <div className={styles.lbl}>Серия</div>
              <span className={styles.big}>{streakLabel(props.streakDays)}</span>
              <span className={`${styles.mut} ${styles.sm}`}>подряд</span>
            </div>
          </div>
          <details className={styles.hp}>
            <summary>Как читать эту страницу</summary>
            <p>Речь — как вы говорите: оценка 0–10 за каждый диалог. Слова — что вы запомнили. Они считаются отдельно: сказать слово в диалоге ещё не значит освоить его. Цвет балла: зелёный от 7.5, жёлтый от 5, красный ниже. Серия считается по всем занятиям, без фильтров.</p>
          </details>
        </section>

        <section className={`${styles.chap} ${styles.sp}`} id="speech">
          <div className={styles.cap}>
            <span className={styles.n}>01</span>
            <h2>Речь</h2>
            <p>Оценка 0–10 после каждого завершённого диалога.</p>
          </div>
          <div className={`${styles.tile} ${styles.filters}`}>
            <div className={styles.seg} role="group" aria-label="Период">
              {PERIODS.map((item) => (
                <button key={item.value} type="button" aria-pressed={props.period === item.value} onClick={() => props.onPeriod(item.value)}>{item.label}</button>
              ))}
            </div>
            <div className={styles.seg}>
              <button type="button" aria-pressed={props.mode === 'roleplay'} onClick={() => props.onMode('roleplay')}>Сценарии <b>{props.roleplayCount}</b></button>
              <button type="button" aria-pressed={props.mode === 'debate'} onClick={() => props.onMode('debate')}>Дебаты <b>{props.debateCount}</b></button>
            </div>
            <div className={styles.seg}>
              <button type="button" aria-pressed={props.view === 'system'} onClick={() => props.onView('system')}>Системные <b>{props.systemCount}</b></button>
              <button type="button" aria-pressed={props.view === 'personal'} onClick={() => props.onView('personal')}>Личные <b>{props.personalCount}</b></button>
            </div>
            <details className={`${styles.hp} ${styles.wide}`}>
              <summary>Фильтры — только для речи. Что значит «системные» и «личные»?</summary>
              <p>«Системные» — сценарии и дебаты из каталога приложения, включая ваши копии каталога. «Личные» — созданные вами. Слова от этих фильтров не зависят.</p>
            </details>
          </div>

          {!hasRows && (
            <div className={styles.tile}>
              <p className={styles.empty}>Нет сессий за выбранный период. Попробуйте другой период или фильтр.</p>
            </div>
          )}

          {hasRows && (
            <>
              <div className={styles.grid}>
                <div className={`${styles.tile} ${styles.hi}`}>
                  <div className={styles.scoreRow}>
                    <div className={styles.ringWrap}>
                      <svg viewBox="0 0 132 132" width="140" height="140" aria-hidden>
                        <circle cx="66" cy="66" r="54" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="10" />
                        <circle cx="66" cy="66" r="54" fill="none" stroke={scoreColor} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${((props.avgScore ?? 0) / 10) * 339.3} 339.3`} transform="rotate(-90 66 66)" />
                      </svg>
                      <div className={styles.ringCenter}>
                        <div>
                          <b style={{ color: scoreColor }}>{scoreText}</b>
                          <br />
                          <span className={`${styles.mut} ${styles.sm}`}>из 10</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <b style={{ fontSize: 24, color: scoreColor }}>{props.avgScore != null ? verdict(props.avgScore) : 'Пока нет оценок'}</b>
                      <p className={`${styles.mut} ${styles.sm}`}>Средний общий балл · {periodName}</p>
                      <details className={styles.hp}>
                        <summary>Как считается</summary>
                        <p>Среднее общих оценок завершённых диалогов. Общую оценку ставит ИИ в конце диалога, страница её не пересчитывает.</p>
                      </details>
                      {props.delta ? (
                        <p className={`${styles.pill} ${props.delta.isPositive ? styles.up : styles.dn}`} style={{ marginTop: 8 }}>
                          {props.delta.value > 0 ? '+' : ''}{props.delta.value.toFixed(1)} к прошлому периоду
                        </p>
                      ) : props.compareNote ? (
                        <p className={`${styles.mut} ${styles.sm}`} style={{ marginTop: 8 }}>{props.compareNote}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className={styles.mini}>
                    <div><b>{props.sessionsCount}</b><span>{sessionsWord(props.sessionsCount)}</span></div>
                    <div><b>{props.bestScore != null ? props.bestScore.toFixed(1) : '—'}</b><span>лучший балл</span></div>
                    <div><b>{streakLabel(props.streakDays)}</b><span>серия подряд</span></div>
                  </div>
                </div>
                <div className={styles.tile}>
                  <div className={styles.lbl}>Балл по сессиям</div>
                  {props.trendPoints.length < 2 ? (
                    <p className={styles.mut} style={{ padding: '50px 0' }}>Мало данных для графика. Пройдите ещё сессию.</p>
                  ) : (
                    <ScoreChart points={props.trendPoints} weekly={props.period === '90d' || props.period === 'all'} />
                  )}
                </div>
              </div>

              <div className={styles.tile}>
                <div>
                  <h3 style={{ fontSize: 20 }}>Критерии оценки</h3>
                  <p className={`${styles.mut} ${styles.sm}`}>Нажмите на критерий, чтобы сделать его фокусом.</p>
                  <details className={styles.hp}>
                    <summary>Как читать</summary>
                    <p>Точка — средний балл, полоса — разброс оценок. Стрелка: вторая половина периода против первой. Пять критериев ИИ оценивает в конце диалога, каждый по шкале 0–10.</p>
                  </details>
                </div>
                <div className={styles.radarWrap}>
                  <Radar criteria={orderedCriteria} focusKey={props.focusKey} />
                  <div className={styles.crits}>
                    {orderedCriteria.map((item) => {
                      const left = (item.min ?? item.value) * 10;
                      const width = Math.max(4, ((item.max ?? item.value) - (item.min ?? item.value)) * 10);
                      const color = toneHex(item.value);
                      const trend = item.delta > 0.05 ? '▲' : item.delta < -0.05 ? '▼' : '';
                      const trendColor = item.delta > 0.05 ? 'var(--good)' : item.delta < -0.05 ? 'var(--low)' : 'var(--mut)';
                      return (
                        <button key={item.key} type="button" className={styles.crit} aria-pressed={props.focusKey === item.key} onClick={() => props.onFocus(props.focusKey === item.key ? null : item.key)}>
                          <span className={styles.cr1}>
                            <span>
                              {item.short || item.label} {CRITERION_SUB[item.key] ? <span className={`${styles.mut} ${styles.sm}`}>{CRITERION_SUB[item.key]}</span> : null}
                              {props.focusKey === item.key ? <span className={styles.tag}>фокус</span> : null}
                            </span>
                            <span>
                              {trend ? <span className={styles.trend} style={{ color: trendColor }}>{trend}</span> : null}
                              <b style={{ fontSize: 20, color }}>{item.value.toFixed(1)}</b>
                            </span>
                          </span>
                          <span className={styles.band}>
                            <i style={{ left: `${left}%`, width: `${width}%`, background: color }} />
                            <u style={{ left: `${item.value * 10}%`, background: color }} />
                          </span>
                          <span className={`${styles.mut} ${styles.sm}`}>{item.samples} оценок · от {item.min != null ? item.min.toFixed(1) : '—'} до {item.max != null ? item.max.toFixed(1) : '—'}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className={styles.tile}>
                <div>
                  <h3 style={{ fontSize: 20 }}>Что повторить</h3>
                  <p className={`${styles.mut} ${styles.sm}`}>Фокус: {focus?.label ?? 'критерий'} · до трёх сессий с самым низким баллом</p>
                  <details className={styles.hp}>
                    <summary>Как считается приоритет</summary>
                    <p>До 4.5 — высокий, до 6.5 — средний, выше — низкий.</p>
                  </details>
                </div>
                {props.recommendations.length === 0 ? (
                  <p className={styles.empty}>Пока нечего повторять. Пройдите больше сессий.</p>
                ) : (
                  <div className={styles.row}>
                    {props.recommendations.slice(0, 3).map((row) => {
                      const priority = row.priority === 'high' ? 'Высокий приоритет' : row.priority === 'low' ? 'Низкий приоритет' : 'Средний приоритет';
                      const color = row.priority === 'high' ? '#ff9b9b' : row.priority === 'low' ? '#c5c8d0' : '#ffc48a';
                      return (
                        <article key={row.id} className={styles.rec}>
                          <span className={styles.pill} style={{ color }}>{priority}</span>
                          <b>{row.title}</b>
                          <span className={`${styles.mut} ${styles.sm}`}>{focus?.short || focus?.label} · {typeof row.criterionScore === 'number' ? row.criterionScore.toFixed(1) : '—'} · общий {row.score != null ? row.score.toFixed(1) : '—'} · {when(row.completedAt)}</span>
                          <div className={styles.acts}>
                            <button type="button" className={`${styles.btn} ${styles.pri} ${styles.small}`} onClick={() => props.onPractice(row.objectKey)}>Практиковать</button>
                            <button type="button" className={`${styles.btn} ${styles.small}`} onClick={() => props.onOpen(row.objectKey, row.completionId)}>Разбор</button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          <div className={styles.tile}>
            <div className={styles.headRow}>
              <div>
                <h3 style={{ fontSize: 20 }}>Сессии</h3>
                <p className={`${styles.mut} ${styles.sm}`}>Нажмите на сессию, чтобы открыть разбор</p>
              </div>
              <div className={styles.seg}>
                <button type="button" aria-pressed={sort === 'date'} onClick={() => setSort('date')}>Дата</button>
                <button type="button" aria-pressed={sort === 'down'} onClick={() => setSort('down')}>Балл ↓</button>
                <button type="button" aria-pressed={sort === 'up'} onClick={() => setSort('up')}>Балл ↑</button>
              </div>
            </div>
            {shown.map((row) => (
              <button key={row.id} type="button" className={styles.ses} onClick={() => props.onOpen(row.objectKey, row.completionId)}>
                <span className={styles.scoreTile} style={{ color: row.score != null ? toneHex(row.score) : '#c5c8d0', background: row.score != null ? `${toneHex(row.score)}26` : '#ffffff14' }}>{row.score != null ? row.score.toFixed(1) : '—'}</span>
                <span style={{ flex: 1 }}>
                  <b style={{ fontWeight: 500 }}>{row.title}</b>
                  <br />
                  <span className={`${styles.mut} ${styles.sm}`}>{row.kind === 'debate' ? 'Дебаты' : 'Сценарий'} · {when(row.completedAt)}</span>
                </span>
                <span className={styles.mut}>→</span>
              </button>
            ))}
            {sorted.length > 5 && (
              <button type="button" className={`${styles.btn} ${styles.small}`} style={{ alignSelf: 'flex-start' }} onClick={() => setShowAll((value) => !value)}>
                {showAll ? 'Скрыть' : `Показать все (${sorted.length})`}
              </button>
            )}
          </div>
        </section>

        <section className={`${styles.chap} ${styles.wd}`} id="words">
          <div className={styles.cap}>
            <span className={styles.n}>02</span>
            <h2>Слова</h2>
            <p>Списки, привязанные к сцене, дебату или чату. Фильтры речи сюда не доходят.</p>
          </div>
          <div className={`${styles.tile} ${styles.bl}`}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
              <span className={styles.huge}>{words.state === 'loading' ? '…' : words.mastered}</span>
              <span style={{ paddingBottom: 8, fontSize: 22, fontWeight: 600 }}>освоено из {words.state === 'loading' ? '…' : words.total} слов</span>
            </div>
            <p className={styles.mut}>{words.state === 'error' ? 'Не удалось загрузить слова. Обновите страницу.' : heroLine}</p>
            <div>
              <button type="button" className={`${styles.btn} ${styles.pri}`} onClick={() => router.push('/dashboard?tab=dictionary&review=1')}>Оценить карточки</button>
            </div>
            <details className={styles.hp}>
              <summary>Когда слово считается освоенным</summary>
              <p>После двух успешных оценок карточки «узнаю», когда следующий повтор назначен не раньше чем через 6 дней. Самый быстрый путь: оценить карточку сегодня и успешно повторить завтра. Тогда слово станет освоенным уже завтра.</p>
            </details>
          </div>

          <div className={styles.tile}>
            <div>
              <h3 style={{ fontSize: 20 }}>Путь слова</h3>
              <p className={`${styles.mut} ${styles.sm}`}>Нажмите на этап — ниже покажутся слова.</p>
            </div>
            <div className={styles.stages}>
              {STAGES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={styles.stage}
                  aria-pressed={stage === item.key}
                  style={{ borderColor: item.border }}
                  onClick={() => setStage(stage === item.key ? 'all' : item.key)}
                >
                  <b className={styles.n} style={{ color: item.color }}>{words.state === 'loading' ? '…' : stageCount(item.key)}</b>
                  <b>{item.name}</b>
                  <span className={`${styles.mut} ${styles.sm}`}>{item.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.tile}>
            <div className={styles.headRow}>
              <div>
                <h3 style={{ fontSize: 20 }}>Слова</h3>
                <p className={`${styles.mut} ${styles.sm}`}>
                  {words.wordsReady ? `Показано ${visibleWords.length} из ${words.total} · слова из ваших списков` : 'Собираем слова списков…'}
                </p>
              </div>
              <div className={styles.seg}>
                <button type="button" aria-pressed={saidOnly} onClick={() => setSaidOnly((value) => !value)}>Только сказанные сами <b>{words.wordsReady ? words.said : '…'}</b></button>
              </div>
            </div>
            <div className={styles.tableHead}>
              <span className={styles.lbl}>Слово</span>
              <span className={styles.lbl}>Список</span>
              <span className={styles.lbl}>Узнаю</span>
              <span className={styles.lbl}>Говорю</span>
            </div>
            {visibleWords.map((row) => (
              <WordLine key={row.key} row={row} />
            ))}
            {wordEmpty ? <p className={styles.mut} style={{ padding: '20px 4px' }}>{wordEmpty}</p> : null}
            <details className={styles.hp}>
              <summary>Что значит «Узнаю» и «Говорю»</summary>
              <p>У каждого слова две отдельные карточки. «Говорю» — вы сами сказали слово в диалоге. «Узнаю» — ваша оценка в карточках. «Освоено» считается только по «Узнаю», поэтому сказанные слова пока «Новые».</p>
            </details>
          </div>

          <div className={styles.tile}>
            <div>
              <h3 style={{ fontSize: 20 }}>Мои списки</h3>
              <p className={`${styles.mut} ${styles.sm}`}>Один список — одна сцена или дебат</p>
            </div>
            {words.state === 'error' ? null : words.modules.length === 0 && words.state === 'ready' ? (
              <div>
                <p className={styles.mut}>Здесь появится усвоение списков, привязанных к сценам и дебатам.</p>
                <div className={styles.acts}>
                  <button type="button" className={`${styles.btn} ${styles.pri} ${styles.small}`} onClick={props.onPracticeHome}>Начать практику со словами</button>
                  <button type="button" className={`${styles.btn} ${styles.small}`} onClick={() => router.push('/dashboard?tab=dictionary')}>Открыть словарь</button>
                </div>
              </div>
            ) : (
              <div className={styles.grid}>
                {words.modules.map((mod) => (
                  <ModuleCard
                    key={mod.id}
                    mod={mod}
                    open={openModule === mod.id}
                    onToggle={() => setOpenModule(openModule === mod.id ? null : mod.id)}
                    onGo={(href) => router.push(href)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className={styles.row}>
            <a className={styles.pile} href="/dashboard?tab=dictionary"><span className={styles.lbl} style={{ color: 'var(--blue)' }}>Словарь</span><b>Что учу</b></a>
            <a className={styles.pile} href="/dashboard?tab=agent"><span className={styles.lbl} style={{ color: 'var(--blue)' }}>Практика</span><b>Где применяю · до 5 слов</b></a>
            <a className={`${styles.pile} ${styles.here}`} href="#today"><span className={styles.lbl} style={{ color: 'var(--blue)' }}>Прогресс</span><b>Как усваиваю</b></a>
          </div>
          <p className={`${styles.mut} ${styles.sm}`}>Клавиши: 1–4 период · R сценарии · D дебаты · S системные · L личные</p>
        </section>
      </div>
    </div>
  );
}

function WordLine({ row }: { row: ProgressWordRow }) {
  return (
    <div className={styles.wordRow}>
      <b title={row.gloss}>{row.headword}</b>
      <span className={styles.mut}>{row.listTitle}</span>
      <span className={styles.pill} style={{ color: REC_COLOR[row.recognition] }}>{REC_LABEL[row.recognition]}</span>
      <span className={`${styles.chip} ${row.speak === 'said' ? styles.said : ''}`}>{SPEAK_LABEL[row.speak]}</span>
    </div>
  );
}

function ModuleCard({
  mod,
  open,
  onToggle,
  onGo,
}: {
  mod: ProgressModuleCard;
  open: boolean;
  onToggle: () => void;
  onGo: (href: string) => void;
}) {
  const total = Math.max(1, mod.stats.due + mod.stats.learning + mod.stats.new + mod.stats.mastered);
  const parts = [
    [mod.stats.due, '#ff7a7a'],
    [mod.stats.learning, '#ffa14d'],
    [mod.stats.new, 'var(--blue)'],
    [mod.stats.mastered, '#6fdc9a'],
  ] as const;
  return (
    <article className={styles.mod}>
      <div className={styles.modTop}>
        <b className={styles.modTitle}>{mod.title}</b>
        <span className={styles.pill} style={{ color: '#b7c8ff' }}>{mod.kind} · {mod.wordCount} слов</span>
      </div>
      <div className={styles.fun} aria-hidden>
        {parts.map(([value, color], index) => value > 0 ? <i key={index} style={{ flex: value / total, background: color }} /> : null)}
      </div>
      <span className={`${styles.mut} ${styles.sm}`}>Освоено {mod.stats.mastered} из {mod.wordCount} · Сказали сами: {mod.saidInLast}</span>
      <div className={styles.acts}>
        <button type="button" className={`${styles.btn} ${styles.pri} ${styles.small}`} onClick={() => onGo(mod.practiceHref)}>Практиковать</button>
        <button type="button" className={`${styles.btn} ${styles.small}`} aria-expanded={open} onClick={onToggle}>{open ? 'Скрыть подробности' : 'Подробнее'}</button>
      </div>
      {open && (
        <div className={styles.detail}>
          <span className={`${styles.mut} ${styles.sm}`}>Последний урок: {mod.lastMeta}</span>
          {mod.weak.length > 0 && (
            <>
              <span className={`${styles.mut} ${styles.sm}`}>Слабые сейчас:</span>
              <div className={styles.chips}>
                {mod.weak.map((word) => <span key={word} className={styles.chip}>{word}</span>)}
              </div>
            </>
          )}
          <span className={`${styles.mut} ${styles.sm}`}>В сессиях звучали {mod.coveragePct}% слов списка · за 7 дней: {mod.sessions7} · за 30 дней: {mod.sessions30}</span>
          <div className={styles.goals}>
            {mod.stats.due > 0 ? (
              <span className={styles.goal}>Цель: закрыть срок ({mod.stats.due})</span>
            ) : (
              <span className={`${styles.goal} ${styles.goalDone}`}>Срок повторов закрыт</span>
            )}
            {mod.hintFree >= 3 ? (
              <span className={`${styles.goal} ${styles.goalDone}`}>3+ сессии без подсказки</span>
            ) : (
              <span className={styles.goal}>Цель: 3 сессии без подсказки ({mod.hintFree}/3)</span>
            )}
          </div>
          <div className={styles.links}>
            {mod.continueHref ? (
              <button type="button" className={styles.lk} onClick={() => onGo(mod.continueHref!)}>{mod.continueLabel}</button>
            ) : null}
            {mod.repickHref ? (
              <button type="button" className={`${styles.lk} ${styles.quiet}`} onClick={() => onGo(mod.repickHref!)}>Другая пятёрка</button>
            ) : null}
          </div>
        </div>
      )}
    </article>
  );
}

function ScoreChart({
  points,
  weekly,
}: {
  points: Array<{ value: number; label: string }>;
  weekly: boolean;
}) {
  const n = points.length;
  const xOf = (index: number) => (n === 1 ? 50 : (index / (n - 1)) * 100);
  const yOf = (value: number) => 88 - (value / 10) * 76;
  const poly = points.map((point, index) => `${xOf(index)},${yOf(point.value)}`).join(' ');
  return (
    <>
      <div className={styles.chart}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <polyline points={poly} fill="none" stroke="#3ddc97" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        </svg>
        {points.map((point, index) => (
          <span key={`${point.label}-${index}`} className={styles.dot} style={{ left: `${xOf(index)}%`, top: `${yOf(point.value)}%` }}>
            <i>{point.value.toFixed(1)}</i>
            <em>{point.label}</em>
          </span>
        ))}
      </div>
      <p className={`${styles.mut} ${styles.sm}`}>
        {weekly ? 'Среднее по неделям' : 'Среднее по дням'} · {n} {n % 10 === 1 && n % 100 !== 11 ? 'точка' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'точки' : 'точек'}. Над точкой — средний балл, под ней — когда.
      </p>
    </>
  );
}

function Radar({ criteria, focusKey }: { criteria: ScreenCriterion[]; focusKey: string | null }) {
  const cx = 130;
  const cy = 108;
  const radius = 78;
  const point = (index: number, value: number) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(criteria.length, 1);
    return [cx + radius * (value / 10) * Math.cos(angle), cy + radius * (value / 10) * Math.sin(angle)];
  };
  const poly = (scale?: number) => criteria.map((item, index) => point(index, scale ?? item.value).map((n) => n.toFixed(1)).join(',')).join(' ');
  return (
    <div className={styles.radar}>
      <svg viewBox="-20 -8 300 240" role="img" aria-label="Радар критериев">
        {[2.5, 5, 7.5, 10].map((value) => <polygon key={value} points={poly(value)} fill="none" stroke="rgba(255,255,255,0.12)" />)}
        {criteria.map((item, index) => {
          const end = point(index, 10);
          const label = point(index, 12.4);
          return (
            <g key={item.key}>
              <line x1={cx} y1={cy} x2={end[0]} y2={end[1]} stroke="rgba(255,255,255,0.12)" />
              <text x={label[0]} y={label[1] + 4} textAnchor={Math.abs(label[0] - cx) < 8 ? 'middle' : label[0] > cx ? 'start' : 'end'} fill={item.key === focusKey ? '#3ddc97' : undefined}>
                {item.short || item.label} {item.value.toFixed(1)}
              </text>
            </g>
          );
        })}
        <polygon points={poly()} fill="rgba(61,220,151,0.26)" stroke="#3ddc97" strokeWidth="2.5" />
        {criteria.map((item, index) => {
          const spot = point(index, item.value);
          return <circle key={item.key} cx={spot[0]} cy={spot[1]} r={item.key === focusKey ? 6.5 : 4} fill="#3ddc97" />;
        })}
      </svg>
    </div>
  );
}
