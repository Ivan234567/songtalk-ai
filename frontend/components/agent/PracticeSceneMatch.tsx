'use client';

import React, { useEffect, useState } from 'react';
import type { LearningLanguage } from '@/lib/learning-language';
import { loadPracticeMatches } from '@/lib/practice-close-scenes';
import type { RoleplayScenario } from '@/lib/roleplay';
import type { ChatPracticeSense } from './ChatPracticeWords';
import styles from './practice-today.module.css';

type PracticeSceneMatchProps = {
  apiUrl: string;
  token: string | null;
  learningLanguage: LearningLanguage;
  mode: 'roleplay' | 'debate';
  listId: string;
  words: ChatPracticeSense[];
  onBack: () => void;
  onPickScenario: (scenario: RoleplayScenario) => void;
  onPickTopic: (topicId: string) => void;
  onCreate: () => void;
  onBrowseAll: () => void;
};

type Row = { id: string; title: string; reason: string };

export function PracticeSceneMatch({
  apiUrl,
  token,
  learningLanguage,
  mode,
  listId,
  words,
  onBack,
  onPickScenario,
  onPickTopic,
  onCreate,
  onBrowseAll,
}: PracticeSceneMatchProps) {
  const sceneMode = mode === 'roleplay';
  const glossKey = words.map((word) => word.glossRu).join('|');
  const [state, setState] = useState<'loading' | 'idle' | 'error'>('loading');
  const [bound, setBound] = useState<Row | null>(null);
  const [matches, setMatches] = useState<Row[]>([]);
  const [scenarios, setScenarios] = useState<Map<string, RoleplayScenario>>(new Map());

  useEffect(() => {
    if (!token) {
      setState('idle');
      return;
    }
    let cancelled = false;
    setState('loading');
    loadPracticeMatches({
      apiUrl,
      token,
      learningLanguage,
      mode,
      listId,
      glosses: glossKey.split('|').filter(Boolean),
    })
      .then((result) => {
        if (cancelled) return;
        const byId = new Map<string, RoleplayScenario>();
        for (const row of [result.bound, ...result.matches]) {
          if (row?.scenario) byId.set(row.id, row.scenario);
        }
        setScenarios(byId);
        setBound(result.bound
          ? {
            id: result.bound.id,
            title: result.bound.title,
            reason: sceneMode ? 'Список привязан к этой сцене' : 'Список привязан к этой теме',
          }
          : null);
        setMatches(result.matches.map((row) => ({ id: row.id, title: row.title, reason: row.reason })));
        setState('idle');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => { cancelled = true; };
  }, [apiUrl, glossKey, learningLanguage, listId, mode, sceneMode, token]);

  const empty = state === 'idle' && !bound && matches.length === 0;
  const title = sceneMode
    ? (learningLanguage === 'zh' ? 'Диалоги для этих слов' : 'Сцены для этих слов')
    : 'Темы для этих слов';

  const open = (id: string) => {
    if (!sceneMode) {
      onPickTopic(id);
      return;
    }
    const scenario = scenarios.get(id);
    if (scenario) onPickScenario(scenario);
  };

  return (
    <section className={styles.home} aria-label={title}>
      <div className={styles.stage}>
        <button type="button" className={styles.link} onClick={onBack}>Назад к словам</button>
        <header className={styles.head}>
          <p className={styles.kicker}>{words.map((word) => word.glossRu).join(' · ')}</p>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.lead}>
            {sceneMode
              ? 'Ищем сцену, где эти значения естественно сказать. Собеседник само слово не подскажет.'
              : 'Ищем тему, где эти значения естественно сказать. Собеседник само слово не подскажет.'}
          </p>
        </header>
        {state === 'loading' && <p className={styles.status}>Подбираю…</p>}
        {state === 'error' && <p className={styles.status}>Не удалось открыть сцены.</p>}
        {bound && (
          <button type="button" className={styles.row} onClick={() => open(bound.id)}>
            <span className={styles.main}>
              <span className={styles.name}>{bound.title}</span>
              <span className={styles.meta}>{bound.reason}</span>
            </span>
          </button>
        )}
        {matches.length > 0 && <p className={styles.kicker}>Подходят по теме</p>}
        <ul className={styles.list}>
          {matches.map((row) => (
            <li key={row.id}>
              <button type="button" className={styles.row} onClick={() => open(row.id)}>
                <span className={styles.main}>
                  <span className={styles.name}>{row.title}</span>
                  <span className={styles.meta}>{row.reason}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {empty && (
          <p className={styles.status}>
            {sceneMode ? 'Готовой сцены под эти слова нет.' : 'Готовой темы под эти слова нет.'}
            {' '}Если в выбранной сцене слову не найдётся места, срок не сдвинется.
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={onCreate}>
            {sceneMode ? 'Собрать сцену под эти слова' : 'Собрать тему под эти слова'}
          </button>
          <button type="button" className={styles.quiet} onClick={onBrowseAll}>
            {sceneMode ? 'Выбрать любую сцену' : 'Выбрать любую тему'}
          </button>
        </div>
      </div>
    </section>
  );
}
