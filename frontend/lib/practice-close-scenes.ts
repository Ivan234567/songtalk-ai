import { buildAgentAuthHeaders } from '@/lib/agent-request';
import { DEBATE_TOPICS } from '@/lib/debate-topics';
import type { LearningLanguage } from '@/lib/learning-language';
import { rankPracticeMatches, type MatchCard } from '@/lib/practice-scene-match';
import { getRoleplayScenarios, type RoleplayScenario } from '@/lib/roleplay';
import { supabase } from '@/lib/supabase';
import { listUserDebateTopics } from '@/lib/user-debate-topics';
import { listUserScenarios } from '@/lib/user-scenarios';
import { listZhScenarios, zhScenarioToRoleplay, type ZhScenario } from '@/lib/zh-scenarios';

export type CloseScene = {
  id: string;
  title: string;
  reason: string;
  bound: boolean;
  scenario: RoleplayScenario | null;
  /** Формулировка темы, если карточка — дебат. */
  debateTopic: string | null;
};

type ListMeta = {
  title: string;
  themeKeys: string[];
  boundKind: string | null;
  boundRef: string | null;
  boundLabel: string | null;
};

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

async function loadTopics(): Promise<{ cards: MatchCard[]; byId: Map<string, RoleplayScenario>; statements: Map<string, string> }> {
  const statements = new Map<string, string>();
  const cards: MatchCard[] = DEBATE_TOPICS.map((topic) => {
    const statement = topic.topicRu || topic.topic;
    statements.set(topic.id, statement);
    return {
      id: topic.id,
      title: statement,
      haystack: [topic.topicRu, topic.topic, topic.category].join(' '),
    };
  });
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (userId) {
    const mine = await listUserDebateTopics(userId).catch(() => []);
    for (const row of mine) {
      if (row.archived || !row.topic.trim()) continue;
      statements.set(row.id, row.topic);
      cards.push({ id: row.id, title: row.topic, haystack: row.topic });
    }
  }
  return { cards, byId: new Map(), statements };
}

async function loadListMeta(apiUrl: string, token: string, learningLanguage: LearningLanguage, listId: string): Promise<ListMeta> {
  const resp = await fetch(`${baseUrl(apiUrl)}/api/vocabulary/lists/${encodeURIComponent(listId)}`, {
    headers: buildAgentAuthHeaders(token, learningLanguage),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error('list');
  const item = data?.item || data;
  return {
    title: typeof item?.title === 'string' ? item.title : '',
    themeKeys: Array.isArray(item?.theme_keys) ? item.theme_keys.filter((key: unknown) => typeof key === 'string') : [],
    boundKind: typeof item?.bound_kind === 'string' ? item.bound_kind : null,
    boundRef: typeof item?.bound_ref === 'string' ? item.bound_ref : null,
    boundLabel: typeof item?.bound_label === 'string' ? item.bound_label : null,
  };
}

/** Привязанная сцена первая, затем сцены по пересечению со списком. */
export async function loadPracticeMatches(input: {
  apiUrl: string;
  token: string;
  learningLanguage: LearningLanguage;
  mode: 'roleplay' | 'debate';
  listId: string;
  glosses: string[];
}): Promise<{ bound: CloseScene | null; matches: CloseScene[] }> {
  const sceneMode = input.mode === 'roleplay';
  const [meta, loaded] = await Promise.all([
    loadListMeta(input.apiUrl, input.token, input.learningLanguage, input.listId),
    sceneMode ? loadScenes(input.learningLanguage) : loadTopics(),
  ]);
  const statements = 'statements' in loaded ? loaded.statements : new Map<string, string>();
  const needles = [meta.title, ...meta.themeKeys, ...input.glosses.filter(Boolean)];
  const boundKind = sceneMode ? 'scenario' : 'debate';
  const boundCard = meta.boundKind === boundKind
    ? loaded.cards.find((card) => card.id === meta.boundRef) || null
    : null;
  const ranked = rankPracticeMatches(
    needles,
    loaded.cards.filter((card) => card.id !== boundCard?.id),
  );
  const toScene = (id: string, title: string, reason: string, bound: boolean): CloseScene => ({
    id,
    title: meta.boundKind === boundKind && bound && meta.boundLabel ? meta.boundLabel : title,
    reason,
    bound,
    scenario: loaded.byId.get(id) || null,
    debateTopic: statements.get(id) || null,
  });
  return {
    bound: boundCard
      ? toScene(boundCard.id, meta.boundLabel || boundCard.title, '', true)
      : (!sceneMode && meta.boundKind === 'debate' && meta.boundRef && meta.boundLabel
        ? {
          id: meta.boundRef,
          title: meta.boundLabel,
          reason: '',
          bound: true,
          scenario: null,
          debateTopic: meta.boundLabel,
        }
        : null),
    matches: ranked.map((row) => toScene(row.id, row.title, row.reason, false)),
  };
}
