'use client';

import React, { useEffect, useState } from 'react';
import { buildAgentAuthHeaders } from '@/lib/agent-request';
import type { LearningLanguage } from '@/lib/learning-language';
import { DEBATE_TOPICS } from '@/lib/debate-topics';
import { getRoleplayScenarios, type RoleplayScenario } from '@/lib/roleplay';
import { listUserScenarios } from '@/lib/user-scenarios';
import { listZhScenarios, zhScenarioToRoleplay, type ZhScenario } from '@/lib/zh-scenarios';
import { rankPracticeMatches, type MatchCard } from '@/lib/practice-scene-match';
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

type ListMeta = {
  title: string;
  themeKeys: string[];
  boundKind: string | null;
  boundRef: string | null;
  boundLabel: string | null;
};

type Row = { id: string; title: string; reason: string };

function baseUrl(apiUrl: string) {
  return apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
}

function scenarioHaystack(scenario: RoleplayScenario): string {
  const steps = (scenario.steps || []).map((step) => step.titleRu || step.titleEn || '').join(' ');
  return [
    scenario.title,
    scenario.description,
    scenario.settingRu,
    scenario.scenarioTextRu,
    scenario.goalRu,
    scenario.themeId,
    steps,
  ].filter(Boolean).join(' ');
}

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
    const needlesPromise = fetch(`${baseUrl(apiUrl)}/api/vocabulary/lists/${encodeURIComponent(listId)}`, {
      headers: buildAgentAuthHeaders(token, learningLanguage),
    }).then(async (resp) => {
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error('list');
      const item = data?.item || data;
      const meta: ListMeta = {
        title: typeof item?.title === 'string' ? item.title : '',
        themeKeys: Array.isArray(item?.theme_keys) ? item.theme_keys.filter((key: unknown) => typeof key === 'string') : [],
        boundKind: typeof item?.bound_kind === 'string' ? item.bound_kind : null,
        boundRef: typeof item?.bound_ref === 'string' ? item.bound_ref : null,
        boundLabel: typeof item?.bound_label === 'string' ? item.bound_label : null,
      };
      return meta;
    });

    const cardsPromise: Promise<{ cards: MatchCard[]; byId: Map<string, RoleplayScenario> }> = sceneMode
      ? loadScenes(learningLanguage)
      : loadTopics();

    Promise.all([needlesPromise, cardsPromise])
      .then(([meta, loaded]) => {
        if (cancelled) return;
        const needles = [meta.title, ...meta.themeKeys, ...glossKey.split('|').filter(Boolean)];
        const boundKind = sceneMode ? 'scenario' : 'debate';
        const boundCard = meta.boundKind === boundKind
          ? loaded.cards.find((card) => card.id === meta.boundRef) || null
          : null;
        const ranked = rankPracticeMatches(
          needles,
          loaded.cards.filter((card) => card.id !== boundCard?.id),
        );
        setScenarios(loaded.byId);
        setBound(boundCard
          ? { id: boundCard.id, title: meta.boundLabel || boundCard.title, reason: sceneMode ? 'Список привязан к этой сцене' : 'Список привязан к этой теме' }
          : null);
        setMatches(ranked.map((row) => ({ id: row.id, title: row.title, reason: row.reason })));
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

async function loadScenes(language: LearningLanguage): Promise<{ cards: MatchCard[]; byId: Map<string, RoleplayScenario> }> {
  const byId = new Map<string, RoleplayScenario>();
  const cards: MatchCard[] = [];
  if (language === 'zh') {
    const rows = await listZhScenarios({ archived: false }).catch(() => [] as ZhScenario[]);
    for (const row of rows) {
      const scenario = zhScenarioToRoleplay(row);
      byId.set(scenario.id, scenario);
      const steps = (row.steps || []).map((step) => step.title_ru || '').join(' ');
      cards.push({
        id: scenario.id,
        title: row.title,
        haystack: [row.title, row.setting_ru, ...(row.goals || []), steps].filter(Boolean).join(' '),
      });
    }
    return { cards, byId };
  }
  for (const scenario of getRoleplayScenarios()) {
    if (scenario.language === 'zh') continue;
    byId.set(scenario.id, scenario);
    cards.push({ id: scenario.id, title: scenario.title, haystack: scenarioHaystack(scenario) });
  }
  const mine = await listUserScenarios().catch(() => []);
  for (const scenario of mine) {
    if (scenario.archived) continue;
    byId.set(scenario.id, scenario);
    cards.push({ id: scenario.id, title: scenario.title, haystack: scenarioHaystack(scenario) });
  }
  return { cards, byId };
}

async function loadTopics(): Promise<{ cards: MatchCard[]; byId: Map<string, RoleplayScenario> }> {
  const cards: MatchCard[] = DEBATE_TOPICS.map((topic) => ({
    id: topic.id,
    title: topic.topicRu,
    haystack: [topic.topicRu, topic.topic, topic.category].join(' '),
  }));
  return { cards, byId: new Map() };
}
