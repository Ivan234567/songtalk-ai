'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { buildAgentAuthHeaders, buildAgentJsonHeaders } from '@/lib/agent-request';
import type { LearningLanguage } from '@/lib/learning-language';
import type { RoleplayScenario } from '@/lib/roleplay';
import { createUserScenario, generateUserScenario, type UserScenarioLevel } from '@/lib/user-scenarios';
import { generateDebateTopic } from '@/lib/user-debate-topics';
import {
  createZhScenario,
  draftFromGenerateResult,
  generateZhScenario,
  toZhWritePayload,
  zhScenarioToRoleplay,
  type ZhHskLevel,
  type ZhScenario,
} from '@/lib/zh-scenarios';
import type { ChatPracticeSense } from './ChatPracticeWords';
import styles from './practice-today.module.css';

type TodaySense = ChatPracticeSense & {
  movesSchedule: boolean;
  bucket: 'due' | 'new' | 'early';
};

type VocabListCard = {
  id: string;
  title: string;
  word_count: number;
};

type LessonDraft = {
  kind: 'roleplay' | 'debate';
  title: string;
  place: string;
  goal: string;
  topic: string;
  level: UserScenarioLevel;
  payload: Record<string, unknown> | null;
  zh: ZhScenario | null;
};

type PracticeTodayFiveProps = {
  apiUrl: string;
  token: string | null;
  learningLanguage: LearningLanguage;
  listId?: string | null;
  initialSenseIds?: string[];
  level?: string | null;
  onBeginScenario: (scenario: RoleplayScenario, senses: TodaySense[], listId: string) => void;
  onBeginDebate: (topic: string, senses: TodaySense[], listId: string) => void;
  onFreeChat: () => void;
  situationalOnly?: boolean;
};

function baseUrl(apiUrl: string) {
  return apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
}

function textOf(payload: Record<string, unknown> | null, key: string): string {
  const value = payload?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

function mapFiveItem(item: {
  sense_id?: unknown;
  headword?: unknown;
  gloss_ru?: unknown;
  moves_schedule?: unknown;
  bucket?: unknown;
}): TodaySense | null {
  const senseId = typeof item?.sense_id === 'string' ? item.sense_id : '';
  const headword = typeof item?.headword === 'string' ? item.headword.trim() : '';
  const glossRu = typeof item?.gloss_ru === 'string' ? item.gloss_ru.trim() : '';
  if (!senseId || !headword || !glossRu) return null;
  const bucket = item.bucket === 'due' || item.bucket === 'early' || item.bucket === 'new' ? item.bucket : 'new';
  return {
    senseId,
    headword,
    glossRu,
    movesSchedule: item.moves_schedule !== false,
    bucket,
  };
}

function bucketKind(word: TodaySense): 'due' | 'new' | 'early' {
  if (word.bucket === 'early' || word.movesSchedule === false) return 'early';
  if (word.bucket === 'due') return 'due';
  return 'new';
}

function bucketLabel(kind: 'due' | 'new' | 'early'): string {
  if (kind === 'due') return 'Пора сказать';
  if (kind === 'early') return 'Раньше срока';
  return 'Новое';
}

function cefrLevel(level?: string | null): UserScenarioLevel {
  const value = (level || '').toUpperCase();
  if (value === 'A1' || value === 'A2' || value === 'B1' || value === 'B2' || value === 'C1') return value;
  return 'B1';
}

function debateDifficulty(level?: string | null): 'easy' | 'medium' | 'hard' {
  const value = (level || '').toUpperCase();
  if (value === 'A1' || value === 'A2') return 'easy';
  if (value === 'C1' || value === 'C2') return 'hard';
  return 'medium';
}

function hskLevel(level?: string | null): ZhHskLevel {
  const value = Number(String(level || '').replace(/\D/g, ''));
  if (value >= 1 && value <= 6) return value as ZhHskLevel;
  return 3;
}

function wordBrief(words: TodaySense[]): string {
  return words.map((word) => `${word.headword} — ${word.glossRu}`).join('; ');
}

function lessonCount(count: number): string {
  if (count === 1) return '1 слово';
  if (count > 1 && count < 5) return `${count} слова`;
  return `${count} слов`;
}

export function PracticeTodayFive({
  apiUrl,
  token,
  learningLanguage,
  listId = null,
  initialSenseIds = [],
  level = null,
  onBeginScenario,
  onBeginDebate,
  onFreeChat,
  situationalOnly = false,
}: PracticeTodayFiveProps) {
  const base = baseUrl(apiUrl);
  const [lists, setLists] = useState<VocabListCard[]>([]);
  const [listsState, setListsState] = useState<'loading' | 'idle' | 'error'>('loading');
  const [activeListId, setActiveListId] = useState<string | null>(listId);
  const [words, setWords] = useState<TodaySense[]>([]);
  const [wordsState, setWordsState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [wordsError, setWordsError] = useState<string | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [catalog, setCatalog] = useState<ChatPracticeSense[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [phase, setPhase] = useState<'lesson' | 'working' | 'ready'>('lesson');
  const [busyKind, setBusyKind] = useState<'roleplay' | 'debate' | null>(null);
  const [draft, setDraft] = useState<LessonDraft | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const seedRef = useRef(initialSenseIds);
  seedRef.current = initialSenseIds;

  const loadFive = useCallback(async (nextListId: string, senseIds: string[]) => {
    if (!token) return;
    setWordsState('loading');
    setWordsError(null);
    setSwapOpen(false);
    setPhase('lesson');
    setDraft(null);
    setGenError(null);
    try {
      const resp = await fetch(`${base}/api/vocabulary/srs/production/five`, {
        method: 'POST',
        headers: buildAgentJsonHeaders(token, learningLanguage),
        body: JSON.stringify({
          list_id: nextListId,
          ...(senseIds.length > 0 ? { sense_ids: senseIds.slice(0, 5) } : {}),
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !Array.isArray(data?.items)) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'five');
      }
      setActiveListId(nextListId);
      setWords(data.items.flatMap((item: Parameters<typeof mapFiveItem>[0]) => {
        const mapped = mapFiveItem(item);
        return mapped ? [mapped] : [];
      }));
      setWordsState('idle');
    } catch {
      setWords([]);
      setWordsState('error');
      setWordsError('Не удалось собрать слова на сегодня');
    }
  }, [base, learningLanguage, token]);

  useEffect(() => {
    if (!token) {
      setListsState('idle');
      return;
    }
    let cancelled = false;
    setListsState('loading');
    fetch(`${base}/api/vocabulary/lists`, {
      headers: buildAgentAuthHeaders(token, learningLanguage),
    })
      .then(async (resp) => {
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !Array.isArray(data?.items)) throw new Error('lists');
        const mapped = (data.items as VocabListCard[]).flatMap((item) => {
          const id = typeof item?.id === 'string' ? item.id : '';
          const title = typeof item?.title === 'string' ? item.title.trim() : '';
          if (!id || !title) return [];
          return [{ id, title, word_count: Number(item.word_count) || 0 }];
        });
        if (cancelled) return;
        setLists(mapped);
        setListsState('idle');
        const preferred = listId && mapped.some((item) => item.id === listId)
          ? listId
          : mapped.length === 1
            ? mapped[0].id
            : null;
        if (preferred) {
          const seed = preferred === listId ? seedRef.current : [];
          void loadFive(preferred, seed);
        }
      })
      .catch(() => {
        if (!cancelled) setListsState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [base, learningLanguage, listId, loadFive, token]);

  const openSwap = async () => {
    if (!token || !activeListId) return;
    setSwapOpen(true);
    setPhase('lesson');
    setDraft(null);
    setPicked(words.map((word) => word.senseId));
    try {
      const resp = await fetch(`${base}/api/vocabulary/lists/${encodeURIComponent(activeListId)}`, {
        headers: buildAgentAuthHeaders(token, learningLanguage),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !Array.isArray(data?.words)) throw new Error('words');
      const rows: ChatPracticeSense[] = [];
      const seen = new Set<string>();
      for (const word of data.words as Array<{ headword?: unknown; gloss_ru?: unknown; sense_ids?: unknown }>) {
        const headword = typeof word?.headword === 'string' ? word.headword.trim() : '';
        const glossRu = typeof word?.gloss_ru === 'string' ? word.gloss_ru.trim() : '';
        const ids = Array.isArray(word?.sense_ids) ? word.sense_ids : [];
        if (!headword || !glossRu) continue;
        for (const raw of ids) {
          const senseId = typeof raw === 'string' ? raw.trim() : '';
          if (!senseId || seen.has(senseId)) continue;
          seen.add(senseId);
          rows.push({ senseId, headword, glossRu });
        }
      }
      setCatalog(rows);
    } catch {
      setCatalog([]);
      setWordsError('Не удалось открыть слова списка');
    }
  };

  const togglePick = (senseId: string) => {
    setPicked((current) => {
      if (current.includes(senseId)) return current.filter((id) => id !== senseId);
      if (current.length >= 5) return current;
      return [...current, senseId];
    });
  };

  const activeList = lists.find((item) => item.id === activeListId) || null;

  const generate = async (kind: 'roleplay' | 'debate') => {
    if (!activeList || words.length < 1 || phase === 'working') return;
    setPhase('working');
    setBusyKind(kind);
    setGenError(null);
    setDraft(null);
    try {
      if (kind === 'debate') {
        const result = await generateDebateTopic({
          difficulty: debateDifficulty(level),
          seed: `Список ученика «${activeList.title}». Тема спора, в котором естественно сказать значения: ${words.map((word) => word.glossRu).join(', ')}. Формулировка по-русски. Английские слова списка в теме не называть.`,
        });
        setDraft({
          kind: 'debate',
          title: result.text,
          place: '',
          goal: 'Выберите сторону, затем скажите значения из списка, когда спор сам даст для этого повод.',
          topic: result.text,
          level: cefrLevel(level),
          payload: null,
          zh: null,
        });
      } else if (learningLanguage === 'zh') {
        const result = await generateZhScenario({
          prompt: `Список ученика «${activeList.title}». Ситуативный диалог, где ученику самому нужно выразить: ${wordBrief(words)}. Не называй эти слова первым и не проси вставить слово.`,
          hsk_level: hskLevel(level),
          goal: 'Ученик сам говорит значения из своего списка, потому что ситуация этого требует.',
        });
        const scenario = draftFromGenerateResult(result);
        setDraft({
          kind: 'roleplay',
          title: scenario.title,
          place: scenario.setting_ru || '',
          goal: scenario.goals?.[0] || scenario.scenario_text_ru || '',
          topic: '',
          level: cefrLevel(level),
          payload: null,
          zh: scenario,
        });
      } else {
        const result = await generateUserScenario({
          prompt: `The learner chose their own list "${activeList.title}". Build one short everyday scene where the learner will naturally need to express these meanings themselves: ${wordBrief(words)}. Do not ask them to use, say, or insert a word. Do not name these English words in the character's first line. Do not make a fill-in-the-blank.`,
          level: cefrLevel(level),
          structured: {
            topic: activeList.title,
            goal: 'The learner expresses the meanings from their own list because the situation requires it.',
            slangMode: 'off',
            allowProfanity: false,
          },
        });
        setDraft({
          kind: 'roleplay',
          title: result.title,
          place: textOf(result.payload, 'settingRu'),
          goal: textOf(result.payload, 'goalRu') || textOf(result.payload, 'description'),
          topic: '',
          level: result.level,
          payload: result.payload,
          zh: null,
        });
      }
      setPhase('ready');
    } catch (err) {
      setPhase('lesson');
      setGenError(err instanceof Error ? err.message : 'Не удалось собрать занятие');
    } finally {
      setBusyKind(null);
    }
  };

  const begin = async () => {
    if (!activeList || !draft || starting) return;
    setStarting(true);
    setGenError(null);
    try {
      if (draft.kind === 'debate') {
        onBeginDebate(draft.topic || draft.title, words, activeList.id);
        return;
      }
      if (draft.zh) {
        const saved = await createZhScenario(toZhWritePayload(draft.zh));
        onBeginScenario(zhScenarioToRoleplay(saved), words, activeList.id);
        return;
      }
      const created = await createUserScenario({
        title: draft.title,
        level: draft.level,
        payload: draft.payload || {},
      });
      onBeginScenario(created, words, activeList.id);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Не удалось начать занятие');
    } finally {
      setStarting(false);
    }
  };

  if (!token) {
    return (
      <section className={styles.home}>
        <div className={styles.stage}>
          <p className={styles.status}>Войдите, чтобы собрать слова на сегодня.</p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.home} aria-label="Сегодняшняя практика">
      <div className={styles.stage}>
        <header className={styles.head}>
          <p className={styles.kicker}>{activeList ? `Список «${activeList.title}»` : 'Практика'}</p>
          <h2 className={styles.title}>Сегодняшняя практика</h2>
          <p className={styles.lead}>
            {activeList
              ? `Скажите ${lessonCount(words.length || 5)} сами. Сцена или дебат соберутся под этот список. Собеседник слово не подскажет.`
              : 'Выберите свой список. Занятие соберётся под него.'}
          </p>
        </header>

        {activeList && words.length > 0 && !swapOpen && (
          <ol className={styles.steps}>
            <li className={styles.step} data-on={phase === 'ready' ? '0' : '1'}>1. Слова</li>
            <li className={styles.step} data-on={phase === 'ready' ? '1' : '0'}>2. Занятие</li>
          </ol>
        )}

        {!activeList && listsState === 'loading' && <p className={styles.status}>Собираю списки…</p>}
        {listsState === 'error' && <p className={styles.status}>Не удалось открыть списки.</p>}
        {!activeList && listsState === 'idle' && lists.length === 0 && (
          <p className={styles.status}>Сначала создайте список в словаре. Практика собирается под него.</p>
        )}
        {!activeList && listsState === 'idle' && lists.length > 1 && (
          <ul className={styles.list}>
            {lists.map((list) => (
              <li key={list.id}>
                <button type="button" className={styles.row} onClick={() => void loadFive(list.id, [])}>
                  <span className={styles.main}>
                    <span className={styles.name}>{list.title}</span>
                    <span className={styles.meta}>{list.word_count} в списке</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {activeList && wordsState === 'loading' && <p className={styles.status}>Собираю слова…</p>}
        {wordsError && <p className={styles.status}>{wordsError}</p>}
        {activeList && wordsState === 'idle' && words.length === 0 && (
          <p className={styles.status}>В этом списке пока нечего сказать.</p>
        )}

        {activeList && !swapOpen && words.length > 0 && (
          <ul className={styles.wordGrid}>
            {words.map((word) => {
              const kind = bucketKind(word);
              return (
                <li key={word.senseId} className={styles.card}>
                  <span className={styles.cardWord}>{word.headword}</span>
                  <span className={styles.cardGloss}>{word.glossRu}</span>
                  <span className={styles.pill} data-kind={kind}>{bucketLabel(kind)}</span>
                </li>
              );
            })}
          </ul>
        )}

        {swapOpen && (
          <ul className={styles.swap}>
            {catalog.map((word) => {
              const on = picked.includes(word.senseId);
              return (
                <li key={word.senseId}>
                  <button
                    type="button"
                    className={styles.choice}
                    data-on={on ? '1' : '0'}
                    onClick={() => togglePick(word.senseId)}
                  >
                    <span className={styles.main}>
                      <span className={styles.name}>{word.headword}</span>
                      <span className={styles.meta}>{word.glossRu}</span>
                    </span>
                    <span className={styles.meta}>{on ? 'в занятии' : 'взять'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {activeList && swapOpen && (
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => void loadFive(activeList.id, picked)}>
              Оставить эти слова
            </button>
            <button type="button" className={styles.quiet} onClick={() => setSwapOpen(false)}>
              Назад
            </button>
          </div>
        )}

        {activeList && !swapOpen && words.length > 0 && phase === 'working' && (
          <p className={styles.status}>
            {busyKind === 'debate'
              ? `Собираю дебат под список «${activeList.title}»…`
              : `Собираю сценарий под список «${activeList.title}»…`}
          </p>
        )}

        {activeList && !swapOpen && words.length > 0 && phase === 'ready' && draft && (
          <div className={styles.preview}>
            <p className={styles.previewKicker}>
              {draft.kind === 'debate' ? `Дебат под список «${activeList.title}»` : `Сценарий под список «${activeList.title}»`}
            </p>
            <h3 className={styles.previewTitle}>{draft.title}</h3>
            {draft.place && <p className={styles.previewLine}>{draft.place}</p>}
            {draft.goal && <p className={styles.previewLine}>{draft.goal}</p>}
            <div className={styles.actions}>
              <button type="button" className={styles.primary} disabled={starting} onClick={() => void begin()}>
                {starting ? 'Открываю…' : draft.kind === 'debate' ? 'Выбрать сторону' : 'Начать'}
              </button>
              <button
                type="button"
                className={styles.quiet}
                disabled={starting}
                onClick={() => void generate(draft.kind)}
              >
                Собрать другой
              </button>
            </div>
          </div>
        )}

        {genError && <p className={styles.status}>{genError}</p>}

        {activeList && !swapOpen && words.length > 0 && phase === 'lesson' && (
          <div className={styles.paths}>
            <button type="button" className={styles.path} onClick={() => void generate('roleplay')}>
              <span className={styles.mark}>01</span>
              <span>
                <span className={styles.pathTitle}>
                  {situationalOnly ? 'Сгенерировать диалог' : 'Сгенерировать сценарий'}
                </span>
                <span className={styles.pathText}>
                  {`Занятие соберётся под список «${activeList.title}». Эти слова нужно будет сказать самому.`}
                </span>
              </span>
              <span className={styles.go}>→</span>
            </button>
            {!situationalOnly && (
              <button type="button" className={styles.path} data-kind="debate" onClick={() => void generate('debate')}>
                <span className={styles.mark}>02</span>
                <span>
                  <span className={styles.pathTitle}>Сгенерировать дебат</span>
                  <span className={styles.pathText}>
                    {`Тема спора соберётся под список «${activeList.title}». Сторону выберете перед стартом.`}
                  </span>
                </span>
                <span className={styles.go}>→</span>
              </button>
            )}
          </div>
        )}

        {activeList && phase !== 'working' && (
          <div className={styles.footer}>
            {!swapOpen && (
              <button type="button" className={styles.link} onClick={() => void openSwap()}>
                Заменить слова
              </button>
            )}
            {lists.length > 1 && (
              <button
                type="button"
                className={styles.link}
                onClick={() => {
                  setActiveListId(null);
                  setWords([]);
                  setSwapOpen(false);
                  setPhase('lesson');
                  setDraft(null);
                }}
              >
                Другой список
              </button>
            )}
            <button type="button" className={styles.link} onClick={onFreeChat}>
              Просто поговорить
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
