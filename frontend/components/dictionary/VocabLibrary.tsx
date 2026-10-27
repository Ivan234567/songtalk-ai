'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useLearningLanguage } from '@/context/LearningLanguageContext';
import { useTtsVoice } from '@/context/TtsVoiceContext';
import styles from './vocab-library.module.css';
import { ListIcon } from '@/components/tabs/CreateWordListModal';

type ListStats = { new: number; learning: number; due: number; mastered: number };

type VocabListCard = {
  id: string;
  title: string;
  description: string | null;
  source: string;
  system_key: string | null;
  collection_id: string | null;
  word_count: number;
  stats: ListStats;
  studied: boolean;
  level: string | null;
};

type StarterPack = {
  key: string;
  title: string;
  description: string;
  level: string;
  icon: string;
  word_count: number;
  in_library: boolean;
};

type LibraryPayload = {
  items: VocabListCard[];
  count: number;
  starter_packs: StarterPack[];
  summary: { due: number };
};

type ListWord = {
  vocabulary_id: string;
  headword: string;
  gloss_ru: string | null;
  part_of_speech: string | null;
  phonetic: string | null;
  status: 'new' | 'learning' | 'due' | 'mastered';
  progress: number;
  next_review_at: string | null;
  sense_ids: string[];
};

function getApiUrl() {
  const url = process.env.NEXT_PUBLIC_API_URL || '';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function apiPath(path: string, params?: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value) search.set(key, value);
    });
  }
  const query = search.toString();
  return `${getApiUrl()}${path}${query ? `?${query}` : ''}`;
}

const PACK_LOOK: Record<string, { color: string; icon: string; subtitle: string }> = {
  intro: { color: '#4ade80', icon: 'spark', subtitle: 'Привет, пожалуйста, спасибо' },
  family: { color: '#f472b6', icon: 'people', subtitle: 'Мать, отец, родственники' },
  home: { color: '#fb923c', icon: 'calendar', subtitle: 'Дом и вещи вокруг' },
  food: { color: '#f59e0b', icon: 'utensils', subtitle: 'Хлеб, вода и многое другое' },
  everyday: { color: '#60a5fa', icon: 'bolt', subtitle: 'Быть, иметь, идти' },
};

const STATUS_LABEL: Record<ListWord['status'], string> = {
  new: 'Новые',
  learning: 'Учу',
  due: 'К повторению',
  mastered: 'Освоены',
};

const STATUS_COLOR: Record<ListWord['status'], string> = {
  new: '#60a5fa',
  learning: '#fb923c',
  due: '#f87171',
  mastered: '#4ade80',
};

export function VocabLibrary() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { learningLanguage } = useLearningLanguage();
  const { ttsVoice } = useTtsVoice();
  const listId = searchParams.get('list');
  const createMode = searchParams.get('create') === '1';

  const [token, setToken] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [createTab, setCreateTab] = useState<'starter' | 'empty'>('starter');
  const [emptyTitle, setEmptyTitle] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [detail, setDetail] = useState<{ item: VocabListCard; words: ListWord[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [wordQuery, setWordQuery] = useState('');
  const [wordFilter, setWordFilter] = useState<'all' | ListWord['status']>('all');
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [newWord, setNewWord] = useState('');
  const [newGloss, setNewGloss] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<'due' | 'alpha' | 'new'>('due');
  const [moreOpen, setMoreOpen] = useState(false);

  const setParams = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('tab', 'dictionary');
    next.delete('review');
    Object.entries(patch).forEach(([key, value]) => {
      if (value == null || value === '') next.delete(key);
      else next.set(key, value);
    });
    router.replace(`/dashboard?${next.toString()}`, { scroll: false });
  }, [router, searchParams]);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setToken(data.session?.access_token || null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadLibrary = useCallback(async (accessToken: string, q = '') => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(apiPath('/api/vocabulary/lists', { q: q || undefined }), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'load');
      setLibrary(data as LibraryPayload);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(message && message !== 'load' ? message : 'Не удалось открыть библиотеку словарей');
      setLibrary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (accessToken: string, id: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const resp = await fetch(apiPath(`/api/vocabulary/lists/${id}`, {
        filter: wordFilter !== 'all' ? wordFilter : undefined,
        q: wordQuery.trim() || undefined,
      }), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'detail');
      setDetail({ item: data.item, words: data.words || [] });
    } catch {
      setError('Не удалось открыть список');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [wordFilter, wordQuery]);

  useEffect(() => {
    if (!token) return;
    if (listId) void loadDetail(token, listId);
    else void loadLibrary(token, query);
  }, [token, listId, loadDetail, loadLibrary, query, learningLanguage]);

  useEffect(() => {
    setSelecting(false);
    setSelected(new Set());
    setAddOpen(false);
    setMoreOpen(false);
  }, [listId]);

  const openCreate = (tab: 'starter' | 'empty' = 'starter') => {
    setCreateTab(tab);
    setParams({ create: '1', list: null });
  };
  const closeCreate = () => setParams({ create: null });
  const openList = (id: string) => setParams({ list: id, create: null });
  const backToLibrary = () => setParams({ list: null, create: null });

  const createEmpty = async () => {
    if (!token || !emptyTitle.trim()) return;
    setBusyKey('empty');
    try {
      const resp = await fetch(apiPath('/api/vocabulary/lists'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: emptyTitle.trim() }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.item?.id) throw new Error(data?.error || 'create');
      setEmptyTitle('');
      openList(data.item.id);
    } catch (err) {
      setError(err instanceof Error && err.message !== 'create' ? err.message : 'Не удалось создать список');
    } finally {
      setBusyKey(null);
    }
  };

  const addStarter = async (key: string) => {
    if (!token) return;
    setBusyKey(key);
    try {
      const resp = await fetch(apiPath('/api/vocabulary/lists/starter'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'starter');
      openList(data.item.id);
    } catch {
      setError('Не удалось добавить набор');
    } finally {
      setBusyKey(null);
    }
  };

  const speakWord = async (word: ListWord) => {
    if (!token || speakingId) return;
    setSpeakingId(word.vocabulary_id);
    try {
      const resp = await fetch(apiPath('/api/tts'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: word.headword, language: learningLanguage, voice: ttsVoice }),
      });
      if (!resp.ok) throw new Error('tts');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      await audio.play();
      URL.revokeObjectURL(url);
    } catch {
      setError('Не получилось произнести слово');
    } finally {
      setSpeakingId(null);
    }
  };

  const chosenWords = () => {
    const words = detail?.words || [];
    if (!selecting || selected.size === 0) return words;
    return words.filter((word) => selected.has(word.vocabulary_id));
  };

  const openListen = (id?: string, senses?: string[]) => {
    const next = new URLSearchParams();
    next.set('tab', 'dictionary');
    next.set('review', '1');
    if (id) next.set('list', id);
    if (senses && senses.length) next.set('senses', senses.join(','));
    router.push(`/dashboard?${next.toString()}`);
  };

  const listenList = () => {
    if (!listId) return;
    const words = chosenWords();
    const senseIds = words.flatMap((word) => word.sense_ids);
    if (selecting && selected.size > 0 && senseIds.length === 0) {
      setError('В выбранных словах пока нечего слушать');
      return;
    }
    openListen(listId, selecting && selected.size > 0 ? senseIds : undefined);
  };

  const addWord = async () => {
    if (!token || !listId || !newWord.trim() || !newGloss.trim()) return;
    setBusyKey('add-word');
    setError(null);
    try {
      const resp = await fetch(apiPath(`/api/vocabulary/lists/${listId}/words`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ word: newWord.trim(), gloss: newGloss.trim() }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'add');
      setNewWord('');
      setNewGloss('');
      await loadDetail(token, listId);
    } catch (err) {
      setError(err instanceof Error && err.message !== 'add' ? err.message : 'Не удалось добавить слово');
    } finally {
      setBusyKey(null);
    }
  };

  const sayList = () => {
    if (!detail) return;
    const senseIds = chosenWords().flatMap((word) => word.sense_ids).slice(0, 5);
    if (!senseIds.length) {
      setError('В этом списке пока нечего сказать');
      return;
    }
    router.push(`/dashboard?tab=agent&senses=${senseIds.join(',')}`);
  };

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (createMode) {
    const packs = library?.starter_packs || [];
    return (
      <div className={styles.page}>
        <button type="button" onClick={closeCreate} className={styles.ghost}>← К словарям</button>
        <h1 className={styles.title} style={{ marginTop: 12 }}>Создать список</h1>
        <div className={styles.createTabs}>
          <button
            type="button"
            className={`${styles.createTab} ${createTab === 'starter' ? styles.createTabActive : ''}`}
            onClick={() => setCreateTab('starter')}
          >
            Наборы
          </button>
          <button
            type="button"
            className={`${styles.createTab} ${createTab === 'empty' ? styles.createTabActive : ''}`}
            onClick={() => setCreateTab('empty')}
          >
            Пустой
          </button>
        </div>
        {error && <p className={styles.error}>{error}</p>}
        {createTab === 'starter' && (
          <>
            {loading && <p className={styles.muted}>Загружаем наборы…</p>}
            {!loading && packs.length === 0 && (
              <p className={styles.muted}>
                {learningLanguage === 'zh'
                  ? 'Наборов для китайского пока нет. Создайте пустой список.'
                  : 'Наборов пока нет. Создайте пустой список.'}
              </p>
            )}
            <div className={styles.packGrid}>
              {packs.map((pack) => {
                const look = PACK_LOOK[pack.key] || { color: '#7ad7a7', icon: 'spark', subtitle: pack.description };
                const existingId = library?.items.find((item) => item.system_key === pack.key)?.id;
                return (
                  <button
                    key={pack.key}
                    type="button"
                    className={styles.packCard}
                    disabled={busyKey === pack.key}
                    onClick={() => void (pack.in_library && existingId
                      ? openList(existingId)
                      : addStarter(pack.key))}
                  >
                    {pack.in_library && <span className={styles.libraryBadge}>В библиотеке</span>}
                    <div className={styles.packTop}>
                      <span className={styles.iconWrap} style={{ background: `${look.color}22` }}>
                        <ListIcon name={look.icon} color={look.color} />
                      </span>
                      <span className={styles.packCount}>{pack.word_count} {wordCountLabel(pack.word_count)}</span>
                    </div>
                    <strong>{pack.title}</strong>
                    <span className={styles.muted}>{look.subtitle}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {createTab === 'empty' && (
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void createEmpty();
            }}
          >
            <div>
              <label className={styles.label} htmlFor="empty-list-name">Название списка</label>
              <input
                id="empty-list-name"
                className={styles.search}
                value={emptyTitle}
                onChange={(event) => setEmptyTitle(event.target.value)}
                placeholder="Например, Путешествия"
              />
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={closeCreate}>Отмена</button>
              <button type="submit" className={styles.primary} disabled={!emptyTitle.trim() || busyKey === 'empty'}>
                {busyKey === 'empty' ? 'Создаём…' : 'Создать список'}
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  if (listId) {
    const item = detail?.item;
    const words = sortListWords(detail?.words || [], sortMode);
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <div className={styles.headerText}>
            <button type="button" onClick={backToLibrary} className={styles.ghost}>← Назад</button>
            <h1 className={styles.title}>
              {item?.title || 'Список'}
              {item?.level ? <span> {item.level}</span> : null}
            </h1>
          </div>
          <div className={styles.actions}>
            <button type="button" onClick={listenList} className={styles.primary}>Послушать</button>
            <button type="button" onClick={sayList} className={styles.secondary}>Сказать эти слова</button>
          </div>
        </div>
        <div className={styles.searchRow}>
          <input
            value={wordQuery}
            onChange={(event) => setWordQuery(event.target.value)}
            placeholder="Поиск слов..."
            className={styles.search}
          />
          <button
            type="button"
            onClick={() => setAddOpen((open) => !open)}
            className={`${styles.primary} ${styles.compact}`}
          >
            + Добавить
          </button>
          <div className={styles.more}>
            <button
              type="button"
              className={`${styles.secondary} ${styles.compact}`}
              onClick={() => setMoreOpen((open) => !open)}
            >
              Ещё
            </button>
            {moreOpen && (
              <div className={styles.moreMenu}>
                <select
                  className={styles.select}
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as 'due' | 'alpha' | 'new')}
                  aria-label="Сортировка"
                >
                  <option value="due">Следующее повторение</option>
                  <option value="alpha">По алфавиту</option>
                  <option value="new">Сначала новые</option>
                </select>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => {
                    setSelecting((on) => {
                      if (on) setSelected(new Set());
                      return !on;
                    });
                  }}
                >
                  {selecting ? 'Снять выбор' : 'Выбрать'}
                </button>
                <div className={styles.filters}>
                  {(['all', 'due', 'new', 'learning', 'mastered'] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`${styles.chip} ${wordFilter === key ? styles.chipActive : ''}`}
                      onClick={() => setWordFilter(key)}
                    >
                      {key === 'all' ? 'Все' : STATUS_LABEL[key]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        {addOpen && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void addWord();
            }}
            className={styles.addForm}
          >
            <input
              value={newWord}
              onChange={(event) => setNewWord(event.target.value)}
              placeholder="Слово"
              className={styles.search}
            />
            <input
              value={newGloss}
              onChange={(event) => setNewGloss(event.target.value)}
              placeholder="Перевод"
              className={styles.search}
            />
            <button type="submit" disabled={!newWord.trim() || !newGloss.trim() || busyKey === 'add-word'} className={styles.primary}>
              {busyKey === 'add-word' ? 'Добавляем…' : 'Сохранить'}
            </button>
          </form>
        )}
        {error && <p className={styles.error}>{error}</p>}
        {detailLoading && <p className={styles.muted}>Загружаем слова…</p>}
        <div className={styles.grid}>
          {words.map((word) => (
            <article
              key={word.vocabulary_id}
              className={styles.wordCard}
              data-selected={selected.has(word.vocabulary_id) ? 'true' : 'false'}
              onClick={() => {
                if (selecting) toggleSelected(word.vocabulary_id);
              }}
            >
              <div className={styles.wordTop}>
                {selecting && (
                  <input
                    className={styles.check}
                    type="checkbox"
                    checked={selected.has(word.vocabulary_id)}
                    onChange={() => toggleSelected(word.vocabulary_id)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Выбрать ${word.headword}`}
                  />
                )}
                <strong>{word.headword}</strong>
                <button
                  type="button"
                  className={styles.speaker}
                  onClick={(event) => {
                    event.stopPropagation();
                    void speakWord(word);
                  }}
                  aria-label={`Произнести ${word.headword}`}
                  title="Превью произношения"
                >
                  {speakingId === word.vocabulary_id ? '…' : <SpeakerIcon />}
                </button>
              </div>
              <div className={styles.ipa}>
                {word.phonetic || '—'}
                {word.part_of_speech ? <span>{word.part_of_speech}</span> : null}
              </div>
              <div className={styles.gloss}>{word.gloss_ru || '—'}</div>
              <div className={styles.status}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: STATUS_COLOR[word.status], flex: 'none' }} />
                {STATUS_LABEL[word.status]}
              </div>
            </article>
          ))}
        </div>
        {!detailLoading && detail && detail.words.length === 0 && (
          <p className={styles.muted}>В этом списке пока нет слов.</p>
        )}
      </div>
    );
  }

  const lists = library?.items || [];
  const dueCount = library?.summary?.due || 0;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>
          Словарь
          <span className={styles.countBadge}>{library ? `${library.count} ${listWord(library.count)}` : '…'}</span>
        </h1>
        <div className={styles.actions}>
          <button type="button" onClick={() => openCreate('starter')} className={styles.primary}>Создать</button>
          {dueCount > 0 && (
            <button type="button" onClick={() => openListen()} className={styles.secondary}>
              Послушать · {dueCount}
            </button>
          )}
        </div>
      </div>

      <div className={styles.searchRow}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск списков..."
          className={styles.search}
        />
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {loading && <p className={styles.muted}>Загружаем библиотеку…</p>}

      {!loading && lists.length === 0 && (
        <div className={styles.empty}>
          <h2>Пока нет списков</h2>
          <p>Возьмите готовый набор или начните с пустого.</p>
          <div className={styles.emptyActions}>
            <button type="button" className={styles.primary} onClick={() => openCreate('starter')}>Взять набор</button>
            <button type="button" className={styles.secondary} onClick={() => openCreate('empty')}>Пустой список</button>
          </div>
        </div>
      )}

      <div className={styles.listGrid}>
        {lists.map((item) => (
          <button key={item.id} type="button" onClick={() => openList(item.id)} className={styles.listCard}>
            <div className={styles.listCardTitle}>{item.title}</div>
            <div className={styles.listCardMeta}>{item.word_count} {wordCountLabel(item.word_count)}</div>
            {item.stats.due > 0 && (
              <div className={styles.dueBadge}>{item.stats.due} к повторению</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function sortListWords(words: ListWord[], sortMode: 'due' | 'alpha' | 'new') {
  const copy = [...words];
  if (sortMode === 'alpha') {
    copy.sort((a, b) => a.headword.localeCompare(b.headword));
    return copy;
  }
  if (sortMode === 'new') {
    const rank: Record<ListWord['status'], number> = { new: 0, due: 1, learning: 2, mastered: 3 };
    copy.sort((a, b) => rank[a.status] - rank[b.status] || a.headword.localeCompare(b.headword));
    return copy;
  }
  copy.sort((a, b) => {
    if (!a.next_review_at && !b.next_review_at) return a.headword.localeCompare(b.headword);
    if (!a.next_review_at) return 1;
    if (!b.next_review_at) return -1;
    return a.next_review_at.localeCompare(b.next_review_at);
  });
  return copy;
}

function wordCountLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'слово';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'слова';
  return 'слов';
}

function SpeakerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 10v4h4l5 4V6L8 10H4z" fill="currentColor" />
      <path d="M16 9.5a3.5 3.5 0 010 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function listWord(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'список';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'списка';
  return 'списков';
}
