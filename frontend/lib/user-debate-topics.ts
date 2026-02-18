import { supabase } from '@/lib/supabase';

export type UserDebateTopicDifficulty = 'easy' | 'medium' | 'hard';
export type UserDebateTopicPosition = 'for' | 'against';
export type UserDebateTopicWhoStarts = 'ai' | 'user';
export type UserDebateTopicSlangMode = 'off' | 'light' | 'heavy';
export type UserDebateTopicProfanityIntensity = 'light' | 'medium' | 'hard';

export type UserDebateTopic = {
  id: string;
  user_id: string;
  topic: string;
  topic_key: string;
  difficulty: UserDebateTopicDifficulty;
  user_position: UserDebateTopicPosition | null;
  micro_goal_ids: string[];
  who_starts: UserDebateTopicWhoStarts;
  slang_mode: UserDebateTopicSlangMode;
  allow_profanity: boolean;
  ai_may_use_profanity: boolean;
  profanity_intensity: UserDebateTopicProfanityIntensity;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

const SELECT_COLS = 'id, user_id, topic, topic_key, difficulty, user_position, micro_goal_ids, who_starts, slang_mode, allow_profanity, ai_may_use_profanity, profanity_intensity, archived, created_at, updated_at';

function parseMicroGoalIds(val: unknown): string[] {
  if (Array.isArray(val)) return val.filter((x): x is string => typeof x === 'string');
  if (typeof val === 'string') {
    try {
      const arr = JSON.parse(val);
      return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
    } catch { return []; }
  }
  return [];
}

function normalizeTopic(topic: string): string {
  return topic.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function listUserDebateTopics(
  userId: string,
  opts?: { archived?: boolean },
): Promise<UserDebateTopic[]> {
  const archived = opts?.archived ?? false;
  const { data, error } = await supabase
    .from('user_debate_topics')
    .select(SELECT_COLS)
    .eq('user_id', userId)
    .eq('archived', archived)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  return rows.map((row) => ({
    ...row,
    micro_goal_ids: parseMicroGoalIds(row.micro_goal_ids),
    who_starts: row.who_starts === 'user' ? 'user' : 'ai',
    slang_mode: row.slang_mode === 'light' || row.slang_mode === 'heavy' ? row.slang_mode : 'off',
    allow_profanity: Boolean(row.allow_profanity),
    ai_may_use_profanity: Boolean(row.allow_profanity) && Boolean(row.ai_may_use_profanity),
    profanity_intensity: row.profanity_intensity === 'medium' || row.profanity_intensity === 'hard' ? row.profanity_intensity : 'light',
  })) as UserDebateTopic[];
}

export async function saveUserDebateTopic(
  userId: string,
  topic: string,
  extra?: {
    difficulty?: UserDebateTopicDifficulty;
    user_position?: UserDebateTopicPosition | null;
    micro_goal_ids?: string[];
    who_starts?: UserDebateTopicWhoStarts;
    slang_mode?: UserDebateTopicSlangMode;
    allow_profanity?: boolean;
    ai_may_use_profanity?: boolean;
    profanity_intensity?: UserDebateTopicProfanityIntensity;
  },
): Promise<UserDebateTopic | null> {
  const trimmedTopic = topic.trim();
  if (!trimmedTopic) return null;

  const payload: Record<string, unknown> = {
    user_id: userId,
    topic: trimmedTopic,
    topic_key: normalizeTopic(trimmedTopic),
    updated_at: new Date().toISOString(),
  };
  if (extra?.difficulty) payload.difficulty = extra.difficulty;
  if (extra?.user_position !== undefined) payload.user_position = extra.user_position;
  if (extra?.micro_goal_ids !== undefined) payload.micro_goal_ids = extra.micro_goal_ids;
  if (extra?.who_starts !== undefined) payload.who_starts = extra.who_starts;
  if (extra?.slang_mode !== undefined) payload.slang_mode = extra.slang_mode;
  if (extra?.allow_profanity !== undefined) payload.allow_profanity = extra.allow_profanity;
  if (extra?.ai_may_use_profanity !== undefined) payload.ai_may_use_profanity = extra.ai_may_use_profanity;
  if (extra?.profanity_intensity !== undefined) payload.profanity_intensity = extra.profanity_intensity;

  const { data, error } = await supabase
    .from('user_debate_topics')
    .upsert(payload, { onConflict: 'user_id,topic_key' })
    .select(SELECT_COLS)
    .single();

  if (error) {
    throw error;
  }
  const row = data as Record<string, unknown>;
  if (row) {
    row.micro_goal_ids = parseMicroGoalIds(row.micro_goal_ids);
    row.who_starts = row.who_starts === 'user' ? 'user' : 'ai';
    row.slang_mode = row.slang_mode === 'light' || row.slang_mode === 'heavy' ? row.slang_mode : 'off';
    row.allow_profanity = Boolean(row.allow_profanity);
    row.ai_may_use_profanity = Boolean(row.allow_profanity) && Boolean(row.ai_may_use_profanity);
    row.profanity_intensity = row.profanity_intensity === 'medium' || row.profanity_intensity === 'hard' ? row.profanity_intensity : 'light';
  }
  return (row as UserDebateTopic | null) ?? null;
}

/** Обновить тему дебата (редактирование из модалки) */
export async function updateUserDebateTopic(
  userId: string,
  topicId: string,
  updates: {
    topic?: string;
    difficulty?: UserDebateTopicDifficulty;
    user_position?: UserDebateTopicPosition | null;
    micro_goal_ids?: string[];
    who_starts?: UserDebateTopicWhoStarts;
    slang_mode?: UserDebateTopicSlangMode;
    allow_profanity?: boolean;
    ai_may_use_profanity?: boolean;
    profanity_intensity?: UserDebateTopicProfanityIntensity;
  },
): Promise<UserDebateTopic | null> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.topic !== undefined) {
    const trimmed = updates.topic.trim();
    if (!trimmed) return null;
    patch.topic = trimmed;
    patch.topic_key = normalizeTopic(trimmed);
  }
  if (updates.difficulty !== undefined) patch.difficulty = updates.difficulty;
  if (updates.user_position !== undefined) patch.user_position = updates.user_position;
  if (updates.micro_goal_ids !== undefined) patch.micro_goal_ids = updates.micro_goal_ids;
  if (updates.who_starts !== undefined) patch.who_starts = updates.who_starts;
  if (updates.slang_mode !== undefined) patch.slang_mode = updates.slang_mode;
  if (updates.allow_profanity !== undefined) patch.allow_profanity = updates.allow_profanity;
  if (updates.ai_may_use_profanity !== undefined) patch.ai_may_use_profanity = updates.ai_may_use_profanity;
  if (updates.profanity_intensity !== undefined) patch.profanity_intensity = updates.profanity_intensity;

  const { data, error } = await supabase
    .from('user_debate_topics')
    .update(patch)
    .eq('id', topicId)
    .eq('user_id', userId)
    .select(SELECT_COLS)
    .single();

  if (error) {
    throw error;
  }
  const row = data as Record<string, unknown>;
  if (row) {
    row.micro_goal_ids = parseMicroGoalIds(row.micro_goal_ids);
    row.who_starts = row.who_starts === 'user' ? 'user' : 'ai';
    row.slang_mode = row.slang_mode === 'light' || row.slang_mode === 'heavy' ? row.slang_mode : 'off';
    row.allow_profanity = Boolean(row.allow_profanity);
    row.ai_may_use_profanity = Boolean(row.allow_profanity) && Boolean(row.ai_may_use_profanity);
    row.profanity_intensity = row.profanity_intensity === 'medium' || row.profanity_intensity === 'hard' ? row.profanity_intensity : 'light';
  }
  return (row as UserDebateTopic | null) ?? null;
}

export async function archiveUserDebateTopic(
  userId: string,
  topicId: string,
  archive: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('user_debate_topics')
    .update({ archived: archive, updated_at: new Date().toISOString() })
    .eq('id', topicId)
    .eq('user_id', userId);

  if (error) {
    throw error;
  }
}

export async function deleteUserDebateTopic(userId: string, topicId: string): Promise<void> {
  const { error } = await supabase
    .from('user_debate_topics')
    .delete()
    .eq('id', topicId)
    .eq('user_id', userId);

  if (error) {
    throw error;
  }
}
