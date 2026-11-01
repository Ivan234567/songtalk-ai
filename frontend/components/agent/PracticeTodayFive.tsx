'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { buildAgentAuthHeaders, buildAgentJsonHeaders } from '@/lib/agent-request';
import type { LearningLanguage } from '@/lib/learning-language';
import type { ChatPracticeSense } from './ChatPracticeWords';
import styles from './practice-today.module.css';

type TodaySense = ChatPracticeSense & { movesSchedule: boolean };

type VocabListCard = {
  id: string;
  title: string;
  word_count: number;
};

type PracticeTodayFiveProps = {
  apiUrl: string;
  token: string | null;
  learningLanguage: LearningLanguage;
  listId?: string | null;
  initialSenseIds?: string[];
  onStart: (mode: 'roleplay' | 'debate', senses: TodaySense[], listId: string) => void;
  onFreeChat: () => void;
  situationalOnly?: boolean;
};

function baseUrl(apiUrl: string) {
  return apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
}

function mapFiveItem(item: {
  sense_id?: unknown;
  headword?: unknown;
  gloss_ru?: unknown;
  moves_schedule?: unknown;
}): TodaySense | null {
  const senseId = typeof item?.sense_id === 'string' ? item.sense_id : '';
  const headword = typeof item?.headword === 'string' ? item.headword.trim() : '';
  const glossRu = typeof item?.gloss_ru === 'string' ? item.gloss_ru.trim() : '';
  if (!senseId || !headword || !glossRu) return null;
  return {
    senseId,
    headword,
    glossRu,
    movesSchedule: item.moves_schedule !== false,
  };
}

export function PracticeTodayFive({
  apiUrl,
  token,
  learningLanguage,
  listId = null,
  initialSenseIds = [],
  onStart,
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
  const seedRef = useRef(initialSenseIds);
  seedRef.current = initialSenseIds;

  const loadFive = useCallback(async (nextListId: string, senseIds: string[]) => {
    if (!token) return;
    setWordsState('loading');
    setWordsError(null);
    setSwapOpen(false);
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
    <section className={styles.home} aria-label="Слова на сегодня">
      <div className={styles.stage}>
        <header className={styles.head}>
          <p className={styles.kicker}>Практика</p>
          <h2 className={styles.title}>
            {words.length > 0
              ? `Сегодня ${words.length} ${words.length === 1 ? 'слово' : words.length < 5 ? 'слова' : 'слов'}`
              : 'Сегодняшние слова'}
          </h2>
          <p className={styles.lead}>
            {activeList
              ? situationalOnly
                ? `Список «${activeList.title}». Дальше ситуативный диалог: собеседник создаст ситуацию, а не попросит вставить слово.`
                : `Список «${activeList.title}». Дальше сценарий или дебат: собеседник создаст ситуацию, а не попросит вставить слово.`
              : 'Выберите список. Из него возьмутся слова, которые пора сказать, и новые.'}
          </p>
        </header>

        {!activeList && listsState === 'loading' && <p className={styles.status}>Собираю списки…</p>}
        {listsState === 'error' && <p className={styles.status}>Не удалось открыть списки.</p>}
        {!activeList && listsState === 'idle' && lists.length === 0 && (
          <p className={styles.status}>В словаре пока нет списка.</p>
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

        {activeList && wordsState === 'loading' && <p className={styles.status}>Собираю пятёрку…</p>}
        {wordsError && <p className={styles.status}>{wordsError}</p>}
        {activeList && wordsState === 'idle' && words.length === 0 && (
          <p className={styles.status}>В этом списке пока нечего сказать.</p>
        )}

        {activeList && !swapOpen && words.length > 0 && (
          <ul className={styles.words}>
            {words.map((word) => (
              <li key={word.senseId} className={styles.word}>
                <span className={styles.main}>
                  <span className={styles.name}>{word.headword}</span>
                  <span className={styles.meta}>{word.glossRu}</span>
                  {word.movesSchedule === false && (
                    <span className={styles.note}>Раньше срока, график не сдвинется</span>
                  )}
                </span>
              </li>
            ))}
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
                    <span className={styles.meta}>{on ? 'в пятёрке' : 'взять'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {activeList && (
          <div className={styles.actions}>
            {swapOpen ? (
              <button
                type="button"
                className={styles.primary}
                onClick={() => void loadFive(activeList.id, picked)}
              >
                Собрать
              </button>
            ) : situationalOnly ? (
              <button
                type="button"
                className={styles.primary}
                disabled={words.length < 1}
                onClick={() => onStart('roleplay', words, activeList.id)}
              >
                Ситуативный диалог
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={words.length < 1}
                  onClick={() => onStart('roleplay', words, activeList.id)}
                >
                  Сценарий
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={words.length < 1}
                  onClick={() => onStart('debate', words, activeList.id)}
                >
                  Дебат
                </button>
              </>
            )}
          </div>
        )}

        {activeList && !swapOpen && (
          <button type="button" className={styles.quiet} onClick={() => void openSwap()}>
            Заменить слова
          </button>
        )}
        {activeList && lists.length > 1 && (
          <button
            type="button"
            className={styles.link}
            onClick={() => {
              setActiveListId(null);
              setWords([]);
              setSwapOpen(false);
            }}
          >
            Другой список
          </button>
        )}
        <button type="button" className={styles.link} onClick={onFreeChat}>
          Просто поговорить
        </button>
      </div>
    </section>
  );
}
