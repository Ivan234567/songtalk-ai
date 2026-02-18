export type DebateTopic = {
  id: string;
  topic: string;
  topicRu: string;
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
};

export const DEBATE_TOPICS: DebateTopic[] = [
  // Easy - Work & Education
  {
    id: 'remote-work',
    topic: 'Remote work is better than office work',
    topicRu: 'Удаленная работа лучше офисной',
    difficulty: 'easy',
    category: 'work',
  },
  {
    id: 'less-homework',
    topic: 'Students should have less homework',
    topicRu: 'Ученикам нужно меньше домашних заданий',
    difficulty: 'easy',
    category: 'education',
  },
  {
    id: 'video-games-children',
    topic: 'Video games are good for children',
    topicRu: 'Видеоигры полезны для детей',
    difficulty: 'easy',
    category: 'entertainment',
  },
  {
    id: 'pets-better',
    topic: 'Pets are better than people',
    topicRu: 'Домашние животные лучше людей',
    difficulty: 'easy',
    category: 'lifestyle',
  },
  {
    id: 'social-media-harm',
    topic: 'Social media does more harm than good',
    topicRu: 'Социальные сети приносят больше вреда, чем пользы',
    difficulty: 'easy',
    category: 'technology',
  },
  {
    id: 'fast-food',
    topic: 'Fast food should be banned',
    topicRu: 'Фастфуд должен быть запрещен',
    difficulty: 'easy',
    category: 'health',
  },
  {
    id: 'school-uniforms',
    topic: 'School uniforms should be mandatory',
    topicRu: 'Школьная форма должна быть обязательной',
    difficulty: 'easy',
    category: 'education',
  },
  {
    id: 'zoos',
    topic: 'Zoos should be abolished',
    topicRu: 'Зоопарки должны быть упразднены',
    difficulty: 'easy',
    category: 'animals',
  },

  // Medium - Technology & Society
  {
    id: 'ai-replace-jobs',
    topic: 'Artificial intelligence will replace most jobs',
    topicRu: 'Искусственный интеллект заменит большинство профессий',
    difficulty: 'medium',
    category: 'technology',
  },
  {
    id: 'climate-change-threat',
    topic: 'Climate change is the biggest threat to humanity',
    topicRu: 'Изменение климата - самая большая угроза человечеству',
    difficulty: 'medium',
    category: 'environment',
  },
  {
    id: 'social-media-ban-teens',
    topic: 'Social media should be banned for teenagers',
    topicRu: 'Социальные сети должны быть запрещены для подростков',
    difficulty: 'medium',
    category: 'technology',
  },
  {
    id: 'online-learning',
    topic: 'Online learning is as effective as traditional learning',
    topicRu: 'Онлайн-обучение так же эффективно, как традиционное',
    difficulty: 'medium',
    category: 'education',
  },
  {
    id: 'nuclear-energy',
    topic: 'Nuclear energy is necessary for the future',
    topicRu: 'Ядерная энергия необходима для будущего',
    difficulty: 'medium',
    category: 'environment',
  },
  {
    id: 'universal-healthcare',
    topic: 'Universal healthcare should be free',
    topicRu: 'Всеобщее здравоохранение должно быть бесплатным',
    difficulty: 'medium',
    category: 'health',
  },
  {
    id: 'death-penalty',
    topic: 'The death penalty should be abolished',
    topicRu: 'Смертная казнь должна быть отменена',
    difficulty: 'medium',
    category: 'society',
  },
  {
    id: 'gmo-foods',
    topic: 'Genetically modified foods are safe',
    topicRu: 'Генно-модифицированные продукты безопасны',
    difficulty: 'medium',
    category: 'health',
  },

  // Hard - Politics & Philosophy
  {
    id: 'universal-basic-income',
    topic: 'Universal basic income should be implemented',
    topicRu: 'Должен быть введен безусловный базовый доход',
    difficulty: 'hard',
    category: 'politics',
  },
  {
    id: 'democracy-best',
    topic: 'Democracy is the best form of government',
    topicRu: 'Демократия - лучшая форма правления',
    difficulty: 'hard',
    category: 'politics',
  },
  {
    id: 'space-exploration-worth',
    topic: 'Space exploration is worth the cost',
    topicRu: 'Исследование космоса стоит затрат',
    difficulty: 'hard',
    category: 'science',
  },
  {
    id: 'immigration-open',
    topic: 'Countries should have open borders',
    topicRu: 'Страны должны иметь открытые границы',
    difficulty: 'hard',
    category: 'politics',
  },
  {
    id: 'free-speech-limits',
    topic: 'Free speech should have limits',
    topicRu: 'Свобода слова должна иметь ограничения',
    difficulty: 'hard',
    category: 'politics',
  },
  {
    id: 'capitalism-vs-socialism',
    topic: 'Socialism is better than capitalism',
    topicRu: 'Социализм лучше капитализма',
    difficulty: 'hard',
    category: 'politics',
  },
  {
    id: 'privacy-vs-security',
    topic: 'Privacy is more important than security',
    topicRu: 'Приватность важнее безопасности',
    difficulty: 'hard',
    category: 'society',
  },
  {
    id: 'human-nature',
    topic: 'Humans are inherently good',
    topicRu: 'Люди по своей природе добры',
    difficulty: 'hard',
    category: 'philosophy',
  },
];

export function getTopicsByDifficulty(difficulty: 'easy' | 'medium' | 'hard' | 'all'): DebateTopic[] {
  if (difficulty === 'all') return DEBATE_TOPICS;
  return DEBATE_TOPICS.filter((t) => t.difficulty === difficulty);
}

export function getTopicsByCategory(category: string): DebateTopic[] {
  if (!category) return DEBATE_TOPICS;
  return DEBATE_TOPICS.filter((t) => t.category === category);
}

export function getTopicById(id: string): DebateTopic | undefined {
  return DEBATE_TOPICS.find((t) => t.id === id);
}

export const DEBATE_CATEGORIES = Array.from(new Set(DEBATE_TOPICS.map((t) => t.category))).sort();
