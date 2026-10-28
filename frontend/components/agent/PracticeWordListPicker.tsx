'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { buildAgentAuthHeaders } from '@/lib/agent-request';
import type { LearningLanguage } from '@/lib/learning-language';
import { PRACTICE_WORDS_LIMIT, type ChatPracticeSense } from './ChatPracticeWords';
import styles from './practice-word-list-picker.module.css';

type VocabListCard = {
  id: string;
  title: string;
  word_count: number;
  source?: string;
  level?: string | null;
};

type ListWord = {
  vocabulary_id: string;
  headword: string;
  gloss_ru: string | null;
  sense_ids: string[];
};

type PracticeWordListPickerProps = {
  apiUrl: string;
  token: string;
  learningLanguage: LearningLanguage;
  selected: ChatPracticeSense[];
  onChange: (next: ChatPracticeSense[]) => void;
  limit?: number;
};

function getApiUrl(apiUrl: string) {
  return apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
}

export function PracticeWordListPicker({
  apiUrl,
  token,
  learningLanguage,
  selected,
  onChange,
  limit = PRACTICE_WORDS_LIMIT,
}: PracticeWordListPickerProps) {
  const base = getApiUrl(apiUrl);
  const [view, setView] = useState<'lists' | 'words'>('lists');
  const [lists, setLists] = useState<VocabListCard[]>([]);
  const [listsState, setListsState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [activeList, setActiveList] = useState<VocabListCard | null>(null);
  const [words, setWords] = useState<ChatPracticeSense[]>([]);
  const [wordsState, setWordsState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setListsState('loading');
    fetch(`${base}/api/vocabulary/lists`, {
      headers: buildAgentAuthHeaders(token, learningLanguage),
    })
      .then(async (resp) => {
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !Array.isArray(data?.items)) throw new Error('lists');
        if (cancelled) return;
        setLists(data.items.flatMap((item: VocabListCard) => {
          const id = typeof item?.id === 'string' ? item.id : '';
          const title = typeof item?.title === 'string' ? item.title.trim() : '';
          if (!id || !title) return [];
          return [{
            id,
            title,
            word_count: Number(item.word_count) || 0,
            source: item.source,
            level: item.level ?? null,
          }];
        }));
        setListsState('idle');
      })
      .catch(() => {
        if (!cancelled) setListsState('error');
      });
    return () => { cancelled = true; };
  }, [base, token, learningLanguage]);

  const openList = (list: VocabListCard) => {
    setActiveList(list);
    setView('words');
    setQuery('');
    setWordsState('loading');
    setWords([]);
    fetch(`${base}/api/vocabulary/lists/${encodeURIComponent(list.id)}`, {
      headers: buildAgentAuthHeaders(token, learningLanguage),
    })
      .then(async (resp) => {
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !Array.isArray(data?.words)) throw new Error('words');
        const mapped = (data.words as ListWord[]).flatMap((word) => {
          const senseId = Array.isArray(word.sense_ids)
            ? word.sense_ids.find((id) => typeof id === 'string' && id.trim()) || ''
            : '';
          const headword = typeof word.headword === 'string' ? word.headword.trim() : '';
          const glossRu = typeof word.gloss_ru === 'string' ? word.gloss_ru.trim() : '';
          if (!senseId || !headword || !glossRu) return [];
          return [{ senseId, headword, glossRu }];
        });
        const dedup = new Map<string, ChatPracticeSense>();
        for (const item of mapped) {
          if (!dedup.has(item.senseId)) dedup.set(item.senseId, item);
        }
        setWords([...dedup.values()]);
        setWordsState('idle');
      })
      .catch(() => setWordsState('error'));
  };

  const visibleLists = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || view !== 'lists') return lists;
    return lists.filter((list) => list.title.toLowerCase().includes(needle));
  }, [lists, query, view]);

  const visibleWords = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return words;
    return words.filter((item) => (
      item.headword.toLowerCase().includes(needle) || item.glossRu.toLowerCase().includes(needle)
    ));
  }, [words, query]);

  const toggle = (item: ChatPracticeSense) => {
    const exists = selected.some((sense) => sense.senseId === item.senseId);
    if (exists) {
      onChange(selected.filter((sense) => sense.senseId !== item.senseId));
      return;
    }
    if (selected.length >= limit) return;
    onChange([...selected, item]);
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        {view === 'words' ? (
          <button
            type="button"
            className={styles.back}
            onClick={() => {
              setView('lists');
              setActiveList(null);
              setQuery('');
            }}
          >
            ← Списки
          </button>
        ) : (
          <span className={styles.crumb}>Списки словаря</span>
        )}
        <span className={styles.count}>{selected.length}/{limit}</span>
      </div>

      {selected.length > 0 && (
        <div className={styles.chips}>
          {selected.map((sense) => (
            <button
              key={sense.senseId}
              type="button"
              className={styles.chip}
              onClick={() => toggle(sense)}
              title="Убрать"
            >
              <span className={styles.chipWord}>{sense.headword}</span>
              <span className={styles.chipX}>×</span>
            </button>
          ))}
        </div>
      )}

      <input
        className={styles.search}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={view === 'lists' ? 'Найти список' : 'Слово или перевод'}
      />

      {view === 'lists' && (
        <>
          {listsState === 'loading' && <p className={styles.muted}>Загружаем списки…</p>}
          {listsState === 'error' && <p className={styles.error}>Не удалось открыть списки</p>}
          {listsState === 'idle' && visibleLists.length === 0 && (
            <p className={styles.muted}>В словаре пока нет списков</p>
          )}
          <div className={styles.list}>
            {visibleLists.map((list) => (
              <button
                key={list.id}
                type="button"
                className={styles.listRow}
                onClick={() => openList(list)}
              >
                <span className={styles.listIcon} aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                </span>
                <span className={styles.listText}>
                  <span className={styles.listTitle}>{list.title}</span>
                  <span className={styles.listMeta}>
                    {list.word_count} {list.word_count === 1 ? 'слово' : list.word_count < 5 ? 'слова' : 'слов'}
                    {list.level ? ` · ${list.level}` : ''}
                  </span>
                </span>
                <span className={styles.chevron} aria-hidden>›</span>
              </button>
            ))}
          </div>
        </>
      )}

      {view === 'words' && (
        <>
          {activeList && <p className={styles.listHeading}>{activeList.title}</p>}
          {wordsState === 'loading' && <p className={styles.muted}>Загружаем слова…</p>}
          {wordsState === 'error' && <p className={styles.error}>Не удалось открыть список</p>}
          {wordsState === 'idle' && visibleWords.length === 0 && (
            <p className={styles.muted}>В этом списке нет слов с переводом</p>
          )}
          <div className={styles.list}>
            {visibleWords.map((item) => {
              const isOn = selected.some((sense) => sense.senseId === item.senseId);
              const disabled = !isOn && selected.length >= limit;
              return (
                <button
                  key={item.senseId}
                  type="button"
                  className={`${styles.wordRow} ${isOn ? styles.wordSelected : ''}`}
                  disabled={disabled}
                  onClick={() => toggle(item)}
                >
                  <span className={styles.check}>{isOn ? '✓' : ''}</span>
                  <span className={styles.wordText}>
                    <span className={styles.headword}>{item.headword}</span>
                    <span className={styles.gloss}>{item.glossRu}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
