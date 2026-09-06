import { supabase } from '@/lib/supabase';

export type LearningLanguage = 'en' | 'zh';

export const DEFAULT_LEARNING_LANGUAGE: LearningLanguage = 'en';

export const LEARNING_LANGUAGE_LABELS: Record<LearningLanguage, string> = {
  en: 'English',
  zh: '中文',
};

export function isLearningLanguage(value: string | null | undefined): value is LearningLanguage {
  return value === 'en' || value === 'zh';
}

/** Системный каталог (англ. сценарии / дебаты) — только в режиме English */
export function hasEnglishSystemCatalog(lang: LearningLanguage): boolean {
  return lang === 'en';
}

export async function fetchUserLearningLanguage(userId: string): Promise<LearningLanguage> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('learning_language')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data?.learning_language) {
    return DEFAULT_LEARNING_LANGUAGE;
  }

  return isLearningLanguage(data.learning_language)
    ? data.learning_language
    : DEFAULT_LEARNING_LANGUAGE;
}

export async function saveUserLearningLanguage(
  userId: string,
  lang: LearningLanguage,
): Promise<boolean> {
  const { error } = await supabase
    .from('user_profiles')
    .upsert(
      {
        user_id: userId,
        learning_language: lang,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  return !error;
}
