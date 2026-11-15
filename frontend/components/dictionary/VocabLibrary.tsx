'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useLearningLanguage } from '@/context/LearningLanguageContext';
import { useTtsVoice } from '@/context/TtsVoiceContext';
import styles from './vocab-library.module.css';
import { useListScope } from './ListScopeSwitch';
import { WordDetailCard, type WordCardPayload } from './WordDetailCard';

type ListStats = { new: number; learning: number; due: number; mastered: number };

type VocabListBinding = {
  kind: 'scenario' | 'debate' | 'chat';
  ref: string;
  origin: 'system' | 'user' | null;
  label: string | null;
};

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
  bound_kind?: string | null;
  bound_ref?: string | null;
  bound_origin?: string | null;
  bound_label?: string | null;
  binding?: VocabListBinding | null;
};

function bindingBadgeText(item: VocabListCard): string | null {
  const label = item.bound_label || item.binding?.label || null;
  const kind = item.bound_kind || item.binding?.kind || null;
  if (!kind && !label) return null;
  if (kind === 'debate') return label ? `Дебат · ${label}` : 'К дебату';
  if (kind === 'chat') return label ? `Чат · ${label}` : 'К свободному диалогу';
  if (kind === 'scenario') return label ? `Сценарий · ${label}` : 'К сценарию';
  return label;
}

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
  pinyin?: string | null;
  status: 'new' | 'learning' | 'due' | 'mastered';
  progress: number;
  next_review_at: string | null;
  sense_ids: string[];
  speech?: 'none' | 'said' | 'repeated';
  recognizes?: boolean;
  sense_speech?: Array<{ sense_id: string; speech: 'none' | 'said' | 'repeated'; recognizes: boolean }>;
};

type ResolvedItem = {
  word: string;
  gloss: string;
  phonetic: string | null;
  part_of_speech: string | null;
  pinyin: string | null;
  in_list?: boolean;
  selected?: boolean;
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
  new: '#7aa2ff',
  learning: '#ffa14d',
  due: '#ff7a7a',
  mastered: '#6fdc9a',
};

const STATUS_ORDER: Array<ListWord['status']> = ['due', 'learning', 'new', 'mastered'];
const SPEECH_LABEL = {
  none: 'Новое',
  said: 'Сказал сам',
  repeated: 'Повторно использовал',
} as const;
const PACK_GLYPH: Record<string, string> = {
  spark: '✦',
  people: '☺',
  calendar: '⌂',
  utensils: '◒',
  bolt: '⚡',
};

function speechStage(speech: ListWord['speech']) {
  if (speech === 'repeated') return 2;
  if (speech === 'said') return 1;
  return 0;
}

function openedSenseSpeech(card: WordCardPayload | null, word: ListWord | null) {
  const senseId = card?.senses?.[0]?.id || null;
  if (senseId && word?.sense_speech) {
    const match = word.sense_speech.find((row) => row.sense_id === senseId);
    if (match) return { speech: match.speech, recognizes: match.recognizes };
    return { speech: 'none' as const, recognizes: false };
  }
  return {
    speech: word?.speech || 'none' as const,
    recognizes: Boolean(word?.recognizes),
  };
}

function reviewLabel(word: ListWord | null) {
  if (!word) return null;
  if (word.status === 'due') return 'пора сказать';
  if (!word.next_review_at) return null;
  const date = new Date(word.next_review_at);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

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
  const [listScope, setListScope] = useListScope();
  const [createTab, setCreateTab] = useState<'starter' | 'empty'>('starter');
  const [emptyTitle, setEmptyTitle] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [detail, setDetail] = useState<{ item: VocabListCard; words: ListWord[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [wordQuery, setWordQuery] = useState('');
  const [wordFilter, setWordFilter] = useState<'all' | ListWord['status']>('all');
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [assistBusy, setAssistBusy] = useState(false);
  const [assistHint, setAssistHint] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolvedItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<'due' | 'alpha' | 'new'>('due');
  const [moreOpen, setMoreOpen] = useState(false);
  const [sceneCount, setSceneCount] = useState<number | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [wordCard, setWordCard] = useState<WordCardPayload | null>(null);
  const [wordCardLoading, setWordCardLoading] = useState(false);
  const [wordCardError, setWordCardError] = useState<string | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

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
      const resp = await fetch(apiPath(`/api/vocabulary/lists/${id}`), {
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
  }, []);

  useEffect(() => {
    if (!token) return;
    if (listId) void loadDetail(token, listId);
    else void loadLibrary(token);
  }, [token, listId, loadDetail, loadLibrary, learningLanguage]);

  useEffect(() => {
    if (!flashId) return;
    const timer = window.setTimeout(() => setFlashId(null), 2500);
    return () => window.clearTimeout(timer);
  }, [flashId]);

  useEffect(() => {
    setSelected(new Set());
    setMoreOpen(false);
    setDraft('');
    setResolved([]);
    setAssistHint(null);
    setEditingTitle(false);
    setSceneCount(null);
  }, [listId]);

  useEffect(() => {
    if (!token || !listId) return;
    let cancelled = false;
    fetch(`${getApiUrl()}/api/vocabulary/srs/production/five`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ list_id: listId }),
    })
      .then(async (resp) => {
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || typeof data?.count !== 'number') throw new Error('five');
        if (!cancelled) setSceneCount(data.count);
      })
      .catch(() => {
        if (!cancelled) setSceneCount(null);
      });
    return () => { cancelled = true; };
  }, [learningLanguage, listId, token]);

  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (event: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [moreOpen]);

  useEffect(() => {
    if (!token || !listId) return;
    const text = draft.trim();
    if (text.length < 2) {
      setResolved([]);
      setAssistHint(null);
      setAssistBusy(false);
      return;
    }
    let cancelled = false;
    setAssistBusy(true);
    setAssistHint('ИИ разбирает ввод…');
    const timer = window.setTimeout(async () => {
      try {
        const resp = await fetch(apiPath(`/api/vocabulary/lists/${listId}/words/resolve`), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ text }),
        });
        const data = await resp.json().catch(() => ({}));
        if (cancelled) return;
        if (!resp.ok) throw new Error(data?.error || 'resolve');
        const items: ResolvedItem[] = (data.items || []).map((item: ResolvedItem) => ({
          ...item,
          selected: !item.in_list,
        }));
        setResolved(items);
        if (!items.length) setAssistHint('ИИ не нашёл слов. Измените ввод.');
        else if (items.length === 1 && items[0].in_list) setAssistHint('Это слово уже в списке');
        else setAssistHint(items.length === 1 ? 'Перевод от ИИ — можно сохранить' : `Нашёл ${items.length} слов. Отметьте нужные.`);
      } catch (err) {
        if (cancelled) return;
        setResolved([]);
        setAssistHint(err instanceof Error ? err.message : 'Не удалось разобрать ввод');
      } finally {
        if (!cancelled) setAssistBusy(false);
      }
    }, 550);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [draft, listId, token]);

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

  const speakText = async (text: string, id: string) => {
    if (!token || speakingId || !text) return;
    setSpeakingId(id);
    try {
      const resp = await fetch(apiPath('/api/tts'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text, language: learningLanguage, voice: ttsVoice }),
      });
      if (!resp.ok) throw new Error('tts');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      try {
        const audio = new Audio(url);
        await new Promise<void>((resolve, reject) => {
          audio.onended = () => resolve();
          audio.onerror = () => reject(new Error('play'));
          void audio.play().catch(reject);
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      setError('Не получилось произнести слово');
    } finally {
      setSpeakingId(null);
    }
  };

  const speakWord = async (word: ListWord) => {
    await speakText(word.headword, word.vocabulary_id);
  };

  const openWordCard = async (vocabularyId: string) => {
    if (!token || !listId) return;
    const known = detail?.words.find((word) => word.vocabulary_id === vocabularyId);
    setWordCardError(null);
    setWordCardLoading(true);
    if (known) {
      setWordCard({
        vocabulary_id: known.vocabulary_id,
        headword: known.headword,
        phonetic: known.phonetic,
        pinyin: known.pinyin || null,
        part_of_speech: known.part_of_speech,
        senses: [{
          id: known.sense_ids?.[0] || null,
          gloss_ru: known.gloss_ru || '',
          part_of_speech: known.part_of_speech,
          examples: [],
        }],
        examples: [],
      });
    } else {
      setWordCard(null);
    }
    try {
      const resp = await fetch(apiPath(`/api/vocabulary/lists/${listId}/words/${vocabularyId}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'card');
      setWordCard(data.card as WordCardPayload);
      await loadDetail(token, listId);
    } catch (err) {
      setWordCardError(err instanceof Error ? err.message : 'Не получилось открыть слово');
    } finally {
      setWordCardLoading(false);
    }
  };

  const closeWordCard = () => {
    setWordCard(null);
    setWordCardError(null);
    setWordCardLoading(false);
  };

  const sourceWords = detail?.words || [];
  const visibleWords = detail ? sortListWords(sourceWords.filter((word) => {
    if (wordFilter !== 'all' && word.status !== wordFilter) return false;
    const needle = wordQuery.trim().toLowerCase();
    if (!needle) return true;
    return word.headword.toLowerCase().includes(needle)
      || (word.gloss_ru || '').toLowerCase().includes(needle);
  }), sortMode) : [];
  const wordCardIndex = wordCard
    ? visibleWords.findIndex((word) => word.vocabulary_id === wordCard.vocabulary_id)
    : -1;
  const wordCardMeta = wordCardIndex >= 0 ? visibleWords[wordCardIndex] : null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (event.key === 'Escape') {
        if (wordCard || wordCardLoading) closeWordCard();
        else if (createMode) closeCreate();
        else if (editingTitle) setEditingTitle(false);
        else if (moreOpen) setMoreOpen(false);
        return;
      }
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (!wordCard || (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') || wordCardIndex < 0) return;
      const nextIndex = event.key === 'ArrowRight'
        ? Math.min(visibleWords.length - 1, wordCardIndex + 1)
        : Math.max(0, wordCardIndex - 1);
      const next = visibleWords[nextIndex];
      if (next && next.vocabulary_id !== wordCard.vocabulary_id) void openWordCard(next.vocabulary_id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [createMode, editingTitle, moreOpen, visibleWords, wordCard, wordCardIndex, wordCardLoading]);

  const saveResolved = async () => {
    if (!token || !listId) return;
    const items = resolved.filter((item) => item.selected && !item.in_list);
    if (!items.length) {
      const existing = resolved.find((item) => item.in_list);
      if (existing) {
        const found = detail?.words.find((word) => word.headword === existing.word);
        if (found) setFlashId(found.vocabulary_id);
        setAssistHint('Это слово уже в списке');
      }
      return;
    }
    setBusyKey('add-word');
    setError(null);
    try {
      const resp = await fetch(apiPath(`/api/vocabulary/lists/${listId}/words/bulk`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ items }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'add');
      const alreadyId = data.existing?.[0]?.vocabulary_id;
      setDraft('');
      setResolved([]);
      setAssistHint(null);
      await loadDetail(token, listId);
      if (alreadyId) setFlashId(alreadyId);
      else if (data.added?.[0]?.vocabulary_id) setFlashId(data.added[0].vocabulary_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить слово');
    } finally {
      setBusyKey(null);
    }
  };

  const renameList = async () => {
    if (!token || !listId || !titleDraft.trim()) return;
    setBusyKey('rename');
    try {
      const resp = await fetch(apiPath(`/api/vocabulary/lists/${listId}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: titleDraft.trim() }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'rename');
      setDetail((current) => current ? { ...current, item: { ...current.item, title: data.item.title } } : current);
      setEditingTitle(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось переименовать');
    } finally {
      setBusyKey(null);
    }
  };

  const deleteList = async () => {
    if (!token || !listId) return;
    if (!window.confirm('Удалить этот список? Слова в вашей библиотеке останутся.')) return;
    setBusyKey('delete-list');
    try {
      const resp = await fetch(apiPath(`/api/vocabulary/lists/${listId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'delete');
      backToLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить список');
    } finally {
      setBusyKey(null);
    }
  };

  const removeWord = async (vocabularyId: string) => {
    if (!token || !listId) return;
    setBusyKey(`rm-${vocabularyId}`);
    try {
      const resp = await fetch(apiPath(`/api/vocabulary/lists/${listId}/words/${vocabularyId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'remove');
      setDetail((current) => current
        ? { ...current, words: current.words.filter((word) => word.vocabulary_id !== vocabularyId) }
        : current);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось убрать слово');
    } finally {
      setBusyKey(null);
    }
  };

  const sayInScene = () => {
    if (!listId) return;
    if (sceneCount === 0) {
      setError('В этом списке пока нечего сказать');
      return;
    }
    router.push(`/dashboard?tab=agent&from=vocab&list=${encodeURIComponent(listId)}`);
  };

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const removeSelected = async () => {
    const ids = [...selected];
    for (const id of ids) {
      await removeWord(id);
    }
    setSelected(new Set());
  };

  const openDueScene = () => {
    const pool = library?.items || [];
    const target = [...pool].sort((a, b) => (b.stats?.due || 0) - (a.stats?.due || 0))[0];
    if (!target || !(target.stats?.due || 0)) return;
    router.push(`/dashboard?tab=agent&from=vocab&list=${encodeURIComponent(target.id)}`);
  };

  const draftCount = draft.split(',').map((part) => part.trim()).filter(Boolean).length;

  const statusBar = (stats: ListStats | undefined, compact = false) => {
    const parts = STATUS_ORDER
      .map((key) => ({ key, count: stats?.[key] || 0 }))
      .filter((part) => part.count > 0);
    return (
      <div className={`${styles.sbar} ${compact ? styles.sm : ''}`} aria-hidden="true">
        {parts.map((part) => (
          <i key={part.key} style={{ ['--c' as string]: STATUS_COLOR[part.key], flex: part.count }} />
        ))}
      </div>
    );
  };

  const listCard = (item: VocabListCard) => {
    const due = item.stats?.due || 0;
    const badge = bindingBadgeText(item);
    return (
      <button key={item.id} type="button" className={styles.card} onClick={() => openList(item.id)}>
        <div className={styles.top}>
          <b>{item.title}</b>
          {due > 0 && <span className={styles.due}>{due} повторить</span>}
        </div>
        {badge && <span className={styles.chip} style={{ alignSelf: 'flex-start' }}>{badge}</span>}
        <span className={styles.meta}>
          {item.word_count} {wordCountLabel(item.word_count)}
          {item.level ? ` · ${item.level}` : ''}
        </span>
        {statusBar(item.stats, true)}
      </button>
    );
  };

  if (listId) {
    const item = detail?.item;
    const due = item?.stats?.due || sourceWords.filter((word) => word.status === 'due').length;
    const badge = item ? bindingBadgeText(item) : null;
    const filters: Array<{ id: 'all' | ListWord['status']; label: string }> = [
      { id: 'all', label: 'Все' },
      ...STATUS_ORDER.map((id) => ({ id, label: STATUS_LABEL[id] })),
    ];
    return (
      <div className={styles.app}>
        <div className={styles.bar}>
          <div className={styles.crumbs}>
            <button type="button" onClick={backToLibrary}>Словарь</button>
            <span className={styles.sep}>/</span>
            <span className={styles.cur}>{item?.title || 'Список'}</span>
          </div>
        </div>
        {error && <p className={styles.err}>{error}</p>}
        {!item ? (
          <p className={styles.mut}>{detailLoading ? 'Открываем список…' : 'Список не найден'}</p>
        ) : (
          <>
            <div className={styles.head}>
              <div className={styles.titleWrap}>
                {editingTitle ? (
                  <input
                    className={`${styles.field} ${styles.titleField}`}
                    value={titleDraft}
                    aria-label="Название списка"
                    autoFocus
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void renameList();
                      }
                    }}
                    onBlur={() => {
                      if (titleDraft.trim() && titleDraft.trim() !== item.title) void renameList();
                      else setEditingTitle(false);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className={styles.titleBtn}
                    title="Переименовать"
                    onClick={() => {
                      setTitleDraft(item.title);
                      setEditingTitle(true);
                      setMoreOpen(false);
                    }}
                  >
                    <h1 className={styles.h1}>{item.title}</h1>
                  </button>
                )}
                <div className={styles.chips}>
                  {item.level && <span className={`${styles.chip} ${styles.lv}`}>{item.level}</span>}
                  {badge && <span className={styles.chip}>{badge}</span>}
                  <span className={styles.chip}>{item.word_count} {wordCountLabel(item.word_count)}</span>
                </div>
              </div>
              <div className={styles.acts} ref={moreRef}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.pri}`}
                  disabled={due <= 0 || busyKey === 'scene'}
                  onClick={sayInScene}
                >
                  {due > 0 ? `Сказать в сцене · ${due}` : 'Нечего повторять'}
                </button>
                <button
                  type="button"
                  className={`${styles.ib} ${styles.menuBtn}`}
                  aria-label="Ещё"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((open) => !open)}
                >
                  <Glyph name="m" />
                </button>
                {moreOpen && (
                  <div className={styles.menu}>
                    <button
                      type="button"
                      onClick={() => {
                        setTitleDraft(item.title);
                        setEditingTitle(true);
                        setMoreOpen(false);
                      }}
                    >
                      Переименовать
                    </button>
                    <button type="button" className={styles.del} onClick={() => { setMoreOpen(false); void deleteList(); }}>
                      Удалить список
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className={styles.fl} role="group" aria-label="Фильтр по статусу">
              {filters.map((filter) => {
                const count = filter.id === 'all'
                  ? sourceWords.length
                  : sourceWords.filter((word) => word.status === filter.id).length;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    aria-pressed={wordFilter === filter.id}
                    onClick={() => setWordFilter(filter.id)}
                  >
                    {filter.id !== 'all' && <i className={styles.dot} style={{ ['--c' as string]: STATUS_COLOR[filter.id] }} />}
                    {filter.label} <b>{count}</b>
                  </button>
                );
              })}
            </div>

            <div className={styles.ctl}>
              <label className={styles.inp}>
                <Glyph name="s" />
                <input
                  ref={searchRef}
                  className={styles.field}
                  type="text"
                  value={wordQuery}
                  placeholder="Найти слово   ( / )"
                  aria-label="Поиск слов"
                  onChange={(event) => setWordQuery(event.target.value)}
                />
              </label>
              <select
                className={styles.sel}
                aria-label="Сортировка"
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as 'due' | 'alpha' | 'new')}
              >
                <option value="due">Сначала на повторение</option>
                <option value="alpha">По алфавиту</option>
                <option value="new">Сначала новые</option>
              </select>
            </div>

            <form
              className={styles.add}
              onSubmit={(event) => {
                event.preventDefault();
                void saveResolved();
              }}
            >
              <label className={styles.inp}>
                <Glyph name="p" />
                <input
                  className={styles.field}
                  type="text"
                  value={draft}
                  placeholder="Добавить слова через запятую: room, window, table"
                  aria-label="Добавить слова"
                  onChange={(event) => setDraft(event.target.value)}
                />
              </label>
              <button className={`${styles.btn} ${styles.pri}`} type="submit" disabled={!draft.trim() || busyKey === 'add-word'}>
                {busyKey === 'add-word' ? 'Добавляем…' : `Добавить${draftCount ? ` · ${draftCount}` : ''}`}
              </button>
            </form>
            {assistHint && <p className={styles.hint}>{assistHint}</p>}
            {resolved.length > 0 && (
              <div className={styles.picks}>
                {resolved.map((entry, index) => (
                  <label key={`${entry.word}-${index}`} className={styles.pick}>
                    <input
                      type="checkbox"
                      checked={Boolean(entry.selected) && !entry.in_list}
                      disabled={entry.in_list}
                      onChange={() => setResolved((current) => current.map((row, rowIndex) => (
                        rowIndex === index ? { ...row, selected: !row.selected } : row
                      )))}
                    />
                    <span>{entry.word}</span>
                    <span className={styles.mut}>{entry.in_list ? 'уже в списке' : entry.gloss}</span>
                  </label>
                ))}
              </div>
            )}

            {visibleWords.length ? (
              <div className={styles.rows}>
                {visibleWords.map((word) => {
                  const stage = speechStage(word.speech);
                  return (
                    <div
                      key={word.vocabulary_id}
                      className={styles.r}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selected.has(word.vocabulary_id)}
                      data-flash={flashId === word.vocabulary_id ? 'true' : undefined}
                      onClick={() => void openWordCard(word.vocabulary_id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void openWordCard(word.vocabulary_id);
                      }}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Выбрать ${word.headword}`}
                        checked={selected.has(word.vocabulary_id)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => toggleSelected(word.vocabulary_id)}
                      />
                      <div className={styles.w}>
                        <b>{word.headword}</b>
                        {word.part_of_speech && <span className={styles.pos}>{word.part_of_speech}</span>}
                        <small className={styles.ipa}>{word.phonetic || word.pinyin || ''}</small>
                      </div>
                      <div className={`${styles.gl} ${styles.mut}`}>{word.gloss_ru || ''}</div>
                      <div className={styles.pips} title={SPEECH_LABEL[word.speech || 'none']}>
                        {[1, 2].map((step) => (
                          <i key={step} className={step <= stage ? styles.on : undefined} />
                        ))}
                      </div>
                      <span className={styles.st} style={{ ['--c' as string]: STATUS_COLOR[word.status] }}>
                        {STATUS_LABEL[word.status]}
                      </span>
                      <button
                        type="button"
                        className={styles.ib}
                        aria-label={`Произнести ${word.headword}`}
                        disabled={speakingId === word.vocabulary_id}
                        onClick={(event) => {
                          event.stopPropagation();
                          void speakWord(word);
                        }}
                      >
                        <Glyph name="v" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.empty}>
                <b>{wordFilter !== 'all' || wordQuery.trim() ? 'Ничего не найдено' : 'Список пуст'}</b>
                {wordFilter !== 'all' || wordQuery.trim() ? (
                  <button
                    type="button"
                    className={styles.btn}
                    style={{ marginTop: 10 }}
                    onClick={() => {
                      setWordQuery('');
                      setWordFilter('all');
                    }}
                  >
                    Сбросить фильтры
                  </button>
                ) : 'Добавьте первые слова строкой выше.'}
              </div>
            )}

            {selected.size > 0 && (
              <div className={styles.bulk}>
                <b>Выбрано {selected.size}</b>
                <button type="button" className={`${styles.btn} ${styles.pri}`} onClick={sayInScene}>В практику</button>
                <button type="button" className={styles.btn} onClick={() => void removeSelected()}>Удалить</button>
                <button type="button" className={styles.ib} aria-label="Снять выбор" onClick={() => setSelected(new Set())}>
                  <Glyph name="x" />
                </button>
              </div>
            )}

            {(wordCard || wordCardLoading || wordCardError) && (
              <WordDetailCard
                card={wordCard}
                loading={wordCardLoading}
                error={wordCardError}
                speaking={Boolean(wordCard && speakingId === wordCard.vocabulary_id)}
                status={wordCardMeta?.status || null}
                speech={openedSenseSpeech(wordCard, wordCardMeta).speech}
                recognizes={openedSenseSpeech(wordCard, wordCardMeta).recognizes}
                progress={wordCardMeta?.progress ?? null}
                nextLabel={reviewLabel(wordCardMeta)}
                index={Math.max(0, wordCardIndex)}
                total={visibleWords.length}
                onClose={closeWordCard}
                onSpeak={() => {
                  if (!wordCard) return;
                  void speakText(wordCard.headword, wordCard.vocabulary_id);
                }}
                onPrev={wordCardIndex > 0 ? () => void openWordCard(visibleWords[wordCardIndex - 1].vocabulary_id) : undefined}
                onNext={wordCardIndex >= 0 && wordCardIndex < visibleWords.length - 1
                  ? () => void openWordCard(visibleWords[wordCardIndex + 1].vocabulary_id)
                  : undefined}
                onPractice={sayInScene}
              />
            )}
          </>
        )}
      </div>
    );
  }

  const lists = library?.items || [];
  const needle = query.trim().toLowerCase();
  const ownAll = lists.filter((item) => !item.system_key);
  const packAll = lists.filter((item) => Boolean(item.system_key));
  const matched = lists.filter((item) => !needle || item.title.toLowerCase().includes(needle));
  const own = matched.filter((item) => !item.system_key);
  const packs = matched.filter((item) => Boolean(item.system_key));
  const dueTotal = typeof library?.summary?.due === 'number'
    ? library.summary.due
    : lists.reduce((sum, item) => sum + (item.stats?.due || 0), 0);
  const totals = lists.reduce((acc, item) => {
    acc.new += item.stats?.new || 0;
    acc.learning += item.stats?.learning || 0;
    acc.due += item.stats?.due || 0;
    acc.mastered += item.stats?.mastered || 0;
    return acc;
  }, { new: 0, learning: 0, due: 0, mastered: 0 });
  const libraryCount = totals.new + totals.learning + totals.due + totals.mastered;
  const showMine = listScope !== 'packs';
  const showPacks = listScope !== 'mine';

  return (
    <div className={styles.app}>
      <div className={styles.bar}>
        <div className={styles.crumbs}>
          <button type="button">Словарь</button>
        </div>
        <button type="button" className={`${styles.btn} ${styles.pri}`} onClick={() => openCreate('starter')}>
          <Glyph name="p" />
          Создать список
        </button>
      </div>
      {error && <p className={styles.err}>{error}</p>}
      <section className={styles.hero}>
        <div>
          <span className={styles.mut}>Сегодня</span>
          <div className={styles.big}>
            {dueTotal}
            <small>{wordCountLabel(dueTotal)} к повторению</small>
          </div>
          <button type="button" className={`${styles.btn} ${styles.pri}`} disabled={dueTotal <= 0} onClick={openDueScene}>
            {dueTotal > 0 ? 'Повторить в сцене' : 'Всё повторено'}
          </button>
        </div>
        <div>
          <span className={styles.mut}>Вся библиотека · {libraryCount} {wordCountLabel(libraryCount)}</span>
          {statusBar(totals)}
          <div className={styles.legend}>
            {STATUS_ORDER.map((key) => (
              <span key={key}>
                <i className={styles.dot} style={{ ['--c' as string]: STATUS_COLOR[key] }} />
                {STATUS_LABEL[key]}
                <b>{totals[key]}</b>
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className={styles.ctl}>
        <label className={styles.inp}>
          <Glyph name="s" />
          <input
            ref={searchRef}
            className={styles.field}
            type="text"
            value={query}
            placeholder="Найти список   ( / )"
            aria-label="Поиск списков"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className={styles.seg} role="group" aria-label="Показать">
          {([
            ['all', 'Все', lists.length],
            ['mine', 'Мои', ownAll.length],
            ['packs', 'Наборы', packAll.length],
          ] as const).map(([id, label, count]) => (
            <button key={id} type="button" aria-pressed={listScope === id} onClick={() => setListScope(id)}>
              {label}<b>{count}</b>
            </button>
          ))}
        </div>
      </div>

      {loading && <p className={styles.mut}>Загружаем библиотеку…</p>}
      {!loading && matched.length === 0 && (
        <div className={styles.empty}>
          <b>{needle ? 'Ничего не нашли' : 'Пока нет списков'}</b>
          {needle ? 'Попробуйте другое название.' : 'Возьмите готовый набор или начните с пустого.'}
        </div>
      )}
      {showMine && own.length > 0 && (
        <>
          {listScope === 'all' && <h2 className={styles.h2}>Мои списки</h2>}
          <div className={styles.grid}>{own.map(listCard)}</div>
        </>
      )}
      {showPacks && packs.length > 0 && (
        <>
          {listScope === 'all' && <h2 className={styles.h2}>Готовые наборы</h2>}
          <div className={styles.grid}>{packs.map(listCard)}</div>
        </>
      )}

      {createMode && (
        <div className={`${styles.scrim} ${styles.center}`} onClick={closeCreate}>
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-label="Создать список"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.nav}>
              <h1 className={styles.h1} style={{ fontSize: 22 }}>Новый список</h1>
              <button type="button" className={styles.ib} aria-label="Закрыть" onClick={closeCreate}>
                <Glyph name="x" />
              </button>
            </div>
            <div className={`${styles.seg} ${styles.tabs}`}>
              <button type="button" aria-pressed={createTab === 'starter'} onClick={() => setCreateTab('starter')}>
                Готовые наборы
              </button>
              <button type="button" aria-pressed={createTab === 'empty'} onClick={() => setCreateTab('empty')}>
                Пустой список
              </button>
            </div>
            {createTab === 'starter' ? (
              <div className={styles.pk}>
                {(library?.starter_packs || []).map((pack) => {
                  const look = PACK_LOOK[pack.key] || { color: '#7ad7a7', icon: 'spark', subtitle: pack.description };
                  const existingId = library?.items.find((entry) => entry.system_key === pack.key)?.id;
                  return (
                    <button
                      key={pack.key}
                      type="button"
                      disabled={busyKey === pack.key}
                      onClick={() => void (pack.in_library && existingId ? openList(existingId) : addStarter(pack.key))}
                    >
                      <span className={styles.ic} style={{ background: `${look.color}26`, color: look.color }}>
                        {PACK_GLYPH[look.icon] || '✦'}
                      </span>
                      <b>{pack.title}</b>
                      <span className={styles.mut} style={{ fontSize: 13.5 }}>{look.subtitle}</span>
                      <span className={styles.chip} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                        {pack.in_library ? 'В библиотеке' : `${pack.word_count} ${wordCountLabel(pack.word_count)}`}
                      </span>
                    </button>
                  );
                })}
                {!loading && !(library?.starter_packs || []).length && (
                  <p className={styles.mut}>Наборов пока нет. Создайте пустой список.</p>
                )}
              </div>
            ) : (
              <form
                className={styles.modalForm}
                onSubmit={(event) => {
                  event.preventDefault();
                  void createEmpty();
                }}
              >
                <input
                  className={styles.field}
                  type="text"
                  value={emptyTitle}
                  placeholder="Например, Путешествия"
                  aria-label="Название списка"
                  onChange={(event) => setEmptyTitle(event.target.value)}
                />
                <div className={styles.modalActs}>
                  <button type="button" className={styles.btn} onClick={closeCreate}>Отмена</button>
                  <button className={`${styles.btn} ${styles.pri}`} type="submit" disabled={!emptyTitle.trim() || busyKey === 'empty'}>
                    {busyKey === 'empty' ? 'Создаём…' : 'Создать'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Glyph({ name }: { name: 's' | 'p' | 'x' | 'm' | 'l' | 'r' | 'v' }) {
  const common = { className: styles.ico, viewBox: '0 0 24 24', 'aria-hidden': true as const };
  if (name === 's') {
    return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>;
  }
  if (name === 'p') return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === 'x') return <svg {...common}><path d="M6 6l12 12M18 6L6 18" /></svg>;
  if (name === 'm') return <svg {...common}><path d="M5 12h.01M12 12h.01M19 12h.01" /></svg>;
  if (name === 'l') return <svg {...common}><path d="M15 6l-6 6 6 6" /></svg>;
  if (name === 'r') return <svg {...common}><path d="M9 6l6 6-6 6" /></svg>;
  return <svg {...common}><path d="M4 9.5v5h4l5 4v-13l-5 4zM16.5 8.5a5 5 0 010 7" /></svg>;
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

