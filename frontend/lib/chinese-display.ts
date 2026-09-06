export type ChineseCharUnit = {
  hanzi: string;
  pinyin: string;
  tone: 1 | 2 | 3 | 4 | 5;
  index: number;
};

export type ToneInfo = {
  tone: 1 | 2 | 3 | 4 | 5;
  label: string;
  short: string;
  color: string;
};

export const TONE_INFO: Record<1 | 2 | 3 | 4 | 5, ToneInfo> = {
  1: { tone: 1, label: '1-й тон — ровный высокий', short: '1 тон', color: '#ef4444' },
  2: { tone: 2, label: '2-й тон — восходящий', short: '2 тон', color: '#f59e0b' },
  3: { tone: 3, label: '3-й тон — нисходяще-восходящий', short: '3 тон', color: '#10b981' },
  4: { tone: 4, label: '4-й тон — резкий нисходящий', short: '4 тон', color: '#3b82f6' },
  5: { tone: 5, label: 'Нейтральный тон', short: 'нейтр.', color: '#94a3b8' },
};

const HANZI_RE = /[\u4e00-\u9fff]/;

export function isHanziChar(ch: string): boolean {
  return HANZI_RE.test(ch);
}

export function getToneFromPinyin(pinyin: string): 1 | 2 | 3 | 4 | 5 {
  if (/[āēīōūǖĀĒĪŌŪǕ]/.test(pinyin)) return 1;
  if (/[áéíóúǘÁÉÍÓÚǗ]/.test(pinyin)) return 2;
  if (/[ǎěǐǒǔǚǍĚǏǑǓǙ]/.test(pinyin)) return 3;
  if (/[àèìòùǜÀÈÌÒÙǛ]/.test(pinyin)) return 4;
  return 5;
}

export function getToneColor(pinyin: string): string {
  return TONE_INFO[getToneFromPinyin(pinyin)].color;
}

export function normalizePinyinSyllables(pinyin: string): string[] {
  return pinyin
    .replace(/-/g, ' ')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Разбивает слово + pinyin на кликабельные единицы (по иероглифам, когда возможно). */
export function splitChineseWord(hanzi: string, pinyin?: string | null): ChineseCharUnit[] {
  const text = (hanzi || '').trim();
  if (!text) return [];

  const chars = Array.from(text);
  const syllables = normalizePinyinSyllables(pinyin || '');
  const hanziOnly = chars.filter(isHanziChar);

  // Идеальный случай: число слогов = числу иероглифов
  if (hanziOnly.length > 0 && syllables.length === hanziOnly.length) {
    let sylIdx = 0;
    return chars.map((ch, index) => {
      if (!isHanziChar(ch)) {
        return { hanzi: ch, pinyin: '', tone: 5 as const, index };
      }
      const syl = syllables[sylIdx++] || '';
      return {
        hanzi: ch,
        pinyin: syl,
        tone: getToneFromPinyin(syl),
        index,
      };
    });
  }

  // Односложное / неразделённый pinyin на всё слово
  if (chars.length === 1) {
    const syl = syllables[0] || (pinyin || '').trim();
    return [
      {
        hanzi: chars[0],
        pinyin: syl,
        tone: getToneFromPinyin(syl),
        index: 0,
      },
    ];
  }

  // Fallback: весь pinyin на первый иероглиф, остальные без слога
  return chars.map((ch, index) => {
    const syl = index === 0 ? (pinyin || '').trim() : '';
    return {
      hanzi: ch,
      pinyin: syl,
      tone: getToneFromPinyin(syl),
      index,
    };
  });
}

export const CHINESE_FONT =
  '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif';
