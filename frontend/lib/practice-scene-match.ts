const STOP = new Set([
  'the', 'and', 'for', 'you', 'your', 'with', 'this', 'that', 'from',
  'что', 'как', 'это', 'для', 'или', 'при', 'про', 'все', 'есть', 'быть', 'когда', 'чтобы', 'только',
]);

export type MatchCard = {
  id: string;
  title: string;
  haystack: string;
};

export type RankedMatch = {
  id: string;
  title: string;
  reason: string;
  score: number;
};

export function sceneTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-zа-яё0-9\u4e00-\u9fff]+/i)
    .filter((token) => token.length >= 3 && !STOP.has(token));
}

/** Совпадение по словам списка и текста сцены. Нулевые совпадения не входят. */
export function rankPracticeMatches(needles: string[], cards: MatchCard[], limit = 6): RankedMatch[] {
  const need = new Set(needles.flatMap(sceneTokens));
  return cards
    .map((card) => {
      const hits = [...new Set(sceneTokens(card.haystack).filter((token) => need.has(token)))];
      return {
        id: card.id,
        title: card.title,
        score: hits.length,
        reason: hits.slice(0, 2).join(' · '),
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'ru'))
    .slice(0, limit);
}

export function practiceSeed(glosses: string[], kind: 'scene' | 'topic'): string {
  const list = glosses.map((item) => item.trim()).filter(Boolean).join(', ');
  if (kind === 'topic') {
    return list ? `Тема, где естественно спорить про: ${list}` : 'Тема для спора на бытовую ситуацию';
  }
  return list ? `Сцена, где естественно сказать: ${list}` : 'Бытовая сцена, где ученик сам говорит';
}
