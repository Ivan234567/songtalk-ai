/** Живой трекер урока в китайском ролевом сценарии: шаги сюжета и must_say слова. */

export type ZhTrackerVocabItem = {
  hanzi: string;
  pinyin?: string;
  translation_ru?: string;
  usage?: 'must_say' | 'model';
};

const FUNCTION_HANZI = new Set(['的', '了', '吗', '呢', '吧', '啊', '呀', '么', '嘛']);

export function getMustSayVocab(
  vocabulary?: ZhTrackerVocabItem[] | null,
): ZhTrackerVocabItem[] {
  if (!Array.isArray(vocabulary)) return [];
  const seen = new Set<string>();
  const out: ZhTrackerVocabItem[] = [];
  for (const item of vocabulary) {
    const hanzi = (item?.hanzi || '').trim();
    if (!hanzi || seen.has(hanzi)) continue;
    if (item.usage !== 'must_say') continue;
    seen.add(hanzi);
    out.push({
      hanzi,
      pinyin: item.pinyin || '',
      translation_ru: item.translation_ru || '',
      usage: 'must_say',
    });
  }
  return out;
}

export function extractHanziRun(text: string): string {
  if (!text) return '';
  return Array.from(text)
    .filter((ch) => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch))
    .join('');
}

export function stripPinyinTones(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[1-5]/g, '')
    .replace(/ü/gi, 'v')
    .toLowerCase();
}

export function compactPinyin(text: string): string {
  return stripPinyinTones(text).replace(/[^a-z]/g, '');
}

function isSkippableFunctionWord(hanzi: string): boolean {
  return hanzi.length === 1 && FUNCTION_HANZI.has(hanzi);
}

export function userUtteranceMatchesVocab(utterance: string, item: ZhTrackerVocabItem): boolean {
  const hanzi = (item.hanzi || '').trim();
  if (!hanzi || isSkippableFunctionWord(hanzi)) return false;
  const spoken = (utterance || '').trim();
  if (!spoken) return false;

  const spokenHanzi = extractHanziRun(spoken);
  if (spokenHanzi.includes(hanzi)) return true;

  const itemPinyin = compactPinyin(item.pinyin || '');
  if (itemPinyin.length >= 3) {
    const spokenPinyin = compactPinyin(spoken);
    if (spokenPinyin.includes(itemPinyin)) return true;
  }
  return false;
}

export function mergeForwardIds(prev: string[], next: string[]): string[] {
  const out = [...prev];
  for (const id of next) {
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

export function applyUserUtteranceToSaid(
  utterance: string,
  mustSay: ZhTrackerVocabItem[],
  alreadySaid: string[],
): string[] {
  const said = [...alreadySaid];
  for (const item of mustSay) {
    if (said.includes(item.hanzi)) continue;
    if (userUtteranceMatchesVocab(utterance, item)) said.push(item.hanzi);
  }
  return said;
}

export function getLessonTrackerState({
  steps,
  completedStepIds,
  mustSay,
  saidHanzi,
}: {
  steps?: Array<{ id: string }> | null;
  completedStepIds: string[];
  mustSay: ZhTrackerVocabItem[];
  saidHanzi: string[];
}) {
  const list = Array.isArray(steps) ? steps : [];
  const stepsTotal = list.length;
  const completed = new Set(completedStepIds.filter(Boolean));
  const stepsDone = list.filter((s) => completed.has(s.id)).length;
  const plotReady = stepsTotal === 0 || stepsDone === stepsTotal;
  const said = new Set(saidHanzi);
  const missingMustSay = mustSay.filter((v) => !said.has(v.hanzi));
  const vocabTotal = mustSay.length;
  const vocabDone = Math.max(0, vocabTotal - missingMustSay.length);
  const lessonReady = plotReady && (vocabTotal === 0 || missingMustSay.length === 0);
  const currentStepId = list.find((s) => !completed.has(s.id))?.id ?? null;
  return {
    stepsDone,
    stepsTotal,
    plotReady,
    vocabDone,
    vocabTotal,
    missingMustSay,
    lessonReady,
    currentStepId,
  };
}
