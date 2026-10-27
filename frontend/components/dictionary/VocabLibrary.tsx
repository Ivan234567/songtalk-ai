'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useLearningLanguage } from '@/context/LearningLanguageContext';
import { useTtsVoice } from '@/context/TtsVoiceContext';
import styles from './vocab-library.module.css';
import createStyles from '@/components/tabs/create-word-list.module.css';
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
  limit_free: number;
  collections: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
  sidebar: { all: number; ungrouped: number };
  summary: { due: number; mastered: number; sessions_week: number; streak_days: number };
  starter_packs: StarterPack[];
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

const STATUS_NOTE: Record<ListWord['status'], string> = {
  new: 'Новые · Ещё не изучалось · Не изучалось',
  learning: 'Учу · Уже разбираешь · Продолжай',
  due: 'К повторению · Пора снова · Послушай ещё раз',
  mastered: 'Освоены · Уже знаешь · Можно сказать сам',
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
  const [createTab, setCreateTab] = useState<'starter' | 'empty' | 'custom'>('starter');
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
  const [pageSize, setPageSize] = useState<'all' | '10'>('all');
  const [page, setPage] = useState(0);

  const setParams = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('tab', 'dictionary');
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
    setPage(0);
  }, [listId]);

  const openCreate = () => setParams({ create: '1', list: null });
  const closeCreate = () => setParams({ create: null });
  const openList = (id: string) => setParams({ list: id, create: null });
  const backToLibrary = () => setParams({ list: null, create: null });

  const createEmpty = async () => {
    if (!token || !emptyTitle.trim()) return;
    setBusyKey('empty');
    try {
      const resp = await fetch(`${getApiUrl()}/api/vocabulary/lists`, {
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
      const resp = await fetch(`${getApiUrl()}/api/vocabulary/lists/starter`, {
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
      const resp = await fetch(`${getApiUrl()}/api/tts`, {
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

  const listenList = () => {
    if (!listId) return;
    const words = chosenWords();
    const senseIds = words.flatMap((word) => word.sense_ids);
    if (selecting && selected.size > 0 && senseIds.length === 0) {
      setError('В выбранных словах пока нечего слушать');
      return;
    }
    const senses = selecting && selected.size > 0 ? `&senses=${encodeURIComponent(senseIds.join(','))}` : '';
    router.push(`/dashboard?tab=words&list=${listId}${senses}`);
  };

  const addWord = async () => {
    if (!token || !listId || !newWord.trim() || !newGloss.trim()) return;
    setBusyKey('add-word');
    setError(null);
    try {
      const resp = await fetch(`${getApiUrl()}/api/vocabulary/lists/${listId}/words`, {
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

  const shell: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '220px minmax(0, 1fr)',
    gap: '1rem',
    minHeight: '70vh',
  };

  const panel: React.CSSProperties = {
    borderRadius: 18,
    border: '1px solid var(--stroke)',
    background: 'linear-gradient(160deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
    padding: '1rem',
  };

  if (createMode) {
    return (
      <div style={{ maxWidth: 960, margin: '0 auto', width: '100%', padding: '0.5rem 0 2rem' }}>
        <button type="button" onClick={closeCreate} style={{ ...ghostBtn, marginBottom: 14 }}>← К словарям</button>
        <div className={createStyles.modal} style={{ position: 'relative', maxHeight: 'none' }}>
          <div className={createStyles.tabs}>
            {([
              ['starter', '01', 'Быстрый старт'],
              ['empty', '02', 'Пустой список'],
              ['custom', '03', 'Настраиваемый'],
            ] as const).map(([key, num, label]) => (
              <button
                key={key}
                type="button"
                className={`${createStyles.tab} ${createTab === key ? createStyles.tabActive : ''}`}
                onClick={() => setCreateTab(key)}
              >
                <span className={createStyles.tabNum}>{num}</span>
                <span className={createStyles.tabLabel}>
                  {label}
                  {key === 'custom' ? <span className={createStyles.proBadge}>PRO</span> : null}
                </span>
              </button>
            ))}
          </div>
          {error && <p className={createStyles.error}>{error}</p>}
          {createTab === 'starter' && (
            <>
              <p className={createStyles.intro}>
                Нажмите на любой набор, чтобы создать список для вашего целевого языка.
                Первая установка занимает несколько секунд — повторно список открывается сразу.
              </p>
              <div className={createStyles.grid}>
                {(library?.starter_packs || []).map((pack) => {
                  const look = PACK_LOOK[pack.key] || { color: '#7ad7a7', icon: 'spark', subtitle: pack.description };
                  return (
                    <button
                      key={pack.key}
                      type="button"
                      className={createStyles.card}
                      disabled={busyKey === pack.key}
                      onClick={() => void (pack.in_library
                        ? openList(library?.items.find((item) => item.system_key === pack.key)?.id || '')
                        : addStarter(pack.key))}
                    >
                      {pack.in_library && <span className={createStyles.libraryBadge}>В библиотеке</span>}
                      <div className={createStyles.cardTop}>
                        <span
                          className={createStyles.iconWrap}
                          style={{ background: `${look.color}22`, boxShadow: `inset 0 0 0 1px ${look.color}55` }}
                        >
                          <ListIcon name={look.icon} color={look.color} />
                        </span>
                        <span className={createStyles.count}>{pack.word_count} {wordCountLabel(pack.word_count)}</span>
                      </div>
                      <h3 className={createStyles.cardTitle}>{pack.title}</h3>
                      <p className={createStyles.cardSubtitle}>{look.subtitle}</p>
                      {pack.in_library && <span className={createStyles.openHint}>Открыть список →</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {createTab === 'empty' && (
            <div className={createStyles.panel}>
              <p className={createStyles.intro}>Создайте пустой список и добавляйте слова сами.</p>
              <div>
                <label className={createStyles.label} htmlFor="empty-list-name">Название списка</label>
                <input
                  id="empty-list-name"
                  className={createStyles.input}
                  value={emptyTitle}
                  onChange={(event) => setEmptyTitle(event.target.value)}
                  placeholder="Например, Путешествия"
                />
              </div>
              <div className={createStyles.actions}>
                <button type="button" className={createStyles.secondary} onClick={closeCreate}>Отмена</button>
                <button
                  type="button"
                  className={createStyles.primary}
                  disabled={!emptyTitle.trim() || busyKey === 'empty'}
                  onClick={() => void createEmpty()}
                >
                  {busyKey === 'empty' ? 'Создаём…' : 'Создать список'}
                </button>
              </div>
            </div>
          )}
          {createTab === 'custom' && (
            <div className={createStyles.panel}>
              <p className={createStyles.intro}>
                Свой список уже бесплатный. Уровень, контекст и автоподбор слов подключим следующим шагом.
              </p>
              <div className={createStyles.actions}>
                <button type="button" className={createStyles.primary} onClick={() => setCreateTab('empty')}>
                  Сделать пустой список
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (listId) {
    const item = detail?.item;
    const sorted = sortListWords(detail?.words || [], sortMode);
    const total = sorted.length;
    const size = pageSize === 'all' ? Math.max(total, 1) : 10;
    const pageCount = Math.max(1, Math.ceil(total / size));
    const safePage = Math.min(page, pageCount - 1);
    const visible = sorted.slice(safePage * size, safePage * size + size);
    const from = total === 0 ? 0 : safePage * size + 1;
    const to = total === 0 ? 0 : safePage * size + visible.length;
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%', padding: '0.5rem 0 2rem' }}>
        <button type="button" onClick={backToLibrary} style={ghostBtn}>← Назад к словарям</button>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <h1 className={styles.title}>
            {item?.title || 'Список'}
            {item?.level ? <span> {item.level}</span> : null}
          </h1>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <button type="button" onClick={listenList} style={primaryBtn}>Послушать</button>
            <button type="button" onClick={sayList} style={secondaryBtn}>Сказать сам</button>
          </div>
        </div>
        <div className={styles.toolbar}>
          <div className={styles.meta}>
            <span>Показано {from}–{to} из {total}</span>
            <span>На странице</span>
            <select
              className={styles.select}
              value={pageSize}
              onChange={(event) => {
                setPageSize(event.target.value === '10' ? '10' : 'all');
                setPage(0);
              }}
              aria-label="На странице"
            >
              <option value="all">все</option>
              <option value="10">10</option>
            </select>
            {pageCount > 1 && (
              <>
                <button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} style={ghostBtn} disabled={safePage === 0}>Назад</button>
                <button type="button" onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} style={ghostBtn} disabled={safePage >= pageCount - 1}>Дальше</button>
              </>
            )}
          </div>
          <input
            value={wordQuery}
            onChange={(event) => setWordQuery(event.target.value)}
            placeholder="Поиск слов..."
            className={styles.search}
            style={{ ...inputStyle, margin: 0 }}
          />
          <button
            type="button"
            onClick={() => {
              setSelecting((on) => {
                if (on) setSelected(new Set());
                return !on;
              });
            }}
            style={{ ...secondaryBtn, padding: '0.55rem 0.9rem', background: selecting ? 'var(--accent-soft)' : 'transparent' }}
          >
            {selecting ? 'Снять выбор' : 'Выбрать'}
          </button>
          <button type="button" onClick={() => setAddOpen((open) => !open)} style={{ ...primaryBtn, padding: '0.55rem 0.9rem' }}>
            + Добавить слово
          </button>
          <select className={styles.select} value={sortMode} onChange={(event) => setSortMode(event.target.value as 'due' | 'alpha' | 'new')} aria-label="Сортировка">
            <option value="due">Следующее повторение</option>
            <option value="alpha">По алфавиту</option>
            <option value="new">Сначала новые</option>
          </select>
          <span className={styles.count}>{total} {wordCountLabel(total)}</span>
        </div>
        {addOpen && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void addWord();
            }}
            style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}
          >
            <input value={newWord} onChange={(event) => setNewWord(event.target.value)} placeholder="Слово" style={{ ...inputStyle, margin: 0, flex: 1, minWidth: 140 }} />
            <input value={newGloss} onChange={(event) => setNewGloss(event.target.value)} placeholder="Перевод" style={{ ...inputStyle, margin: 0, flex: 1, minWidth: 140 }} />
            <button type="submit" disabled={!newWord.trim() || !newGloss.trim() || busyKey === 'add-word'} style={primaryBtn}>
              {busyKey === 'add-word' ? 'Добавляем…' : 'Сохранить'}
            </button>
          </form>
        )}
        <div className={styles.filters}>
          {(['all', 'due', 'new', 'learning', 'mastered'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setWordFilter(key)}
              style={{
                ...chipBtn,
                background: wordFilter === key ? 'var(--accent)' : 'transparent',
                color: wordFilter === key ? '#121614' : 'var(--text-muted)',
                fontFamily: 'inherit',
              }}
            >
              {key === 'all' ? 'Все' : STATUS_LABEL[key]}
            </button>
          ))}
        </div>
        {error && <p style={{ color: '#fca5a5' }}>{error}</p>}
        {detailLoading && <p style={{ color: 'var(--text-muted)' }}>Загружаем слова…</p>}
        <div className={styles.grid}>
          {visible.map((word) => (
            <article
              key={word.vocabulary_id}
              className={styles.wordCard}
              data-selected={selected.has(word.vocabulary_id) ? 'true' : 'false'}
              onClick={() => {
                if (!selecting) return;
                setSelected((current) => {
                  const next = new Set(current);
                  if (next.has(word.vocabulary_id)) next.delete(word.vocabulary_id);
                  else next.add(word.vocabulary_id);
                  return next;
                });
              }}
            >
              <div className={styles.wordTop}>
                {selecting && (
                  <input
                    className={styles.check}
                    type="checkbox"
                    checked={selected.has(word.vocabulary_id)}
                    onChange={() => {
                      setSelected((current) => {
                        const next = new Set(current);
                        if (next.has(word.vocabulary_id)) next.delete(word.vocabulary_id);
                        else next.add(word.vocabulary_id);
                        return next;
                      });
                    }}
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
                  aria-label="Послушать слово"
                >
                  {speakingId === word.vocabulary_id ? '…' : <SpeakerIcon />}
                </button>
              </div>
              <div className={styles.ipa}>
                {word.phonetic || '—'}
                {word.part_of_speech ? <span>{word.part_of_speech}</span> : null}
              </div>
              <div className={styles.gloss}>{word.gloss_ru || '—'}</div>
              <div className={styles.bar} aria-hidden="true">
                <i style={{ width: `${Math.max(0, Math.min(100, word.progress || 0))}%` }} />
              </div>
              <div className={styles.status}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: STATUS_COLOR[word.status], flex: 'none' }} />
                {STATUS_NOTE[word.status]}
              </div>
            </article>
          ))}
        </div>
        {!detailLoading && detail && detail.words.length === 0 && (
          <p style={{ color: 'var(--text-muted)' }}>В этом списке пока нет слов.</p>
        )}
      </div>
    );
  }

  const lists = library?.items || [];
  const summary = library?.summary;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', padding: '0.25rem 0 2rem' }}>
      <div style={shell}>
        <aside style={panel}>
          <div style={{ fontSize: '0.72rem', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 12 }}>БИБЛИОТЕКА</div>
          <SideItem label="Все списки" count={library?.sidebar.all || 0} active />
          <SideItem label="Без группы" count={library?.sidebar.ungrouped || 0} />
          <div style={{ marginTop: 18, fontSize: '0.72rem', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>КОЛЛЕКЦИИ</div>
          <button type="button" style={sideAction} disabled>+ Новая коллекция</button>
          <div style={{ marginTop: 18, fontSize: '0.72rem', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>ТЕГИ</div>
          <button type="button" style={sideAction} disabled>+ Новый тег</button>
        </aside>

        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 6 }}>
                {learningLanguage === 'zh' ? 'КИТАЙСКИЙ' : 'АНГЛИЙСКИЙ'}
              </div>
              <h1 className={styles.title}>
                Мои словари{' '}
                <span style={badge}>{library ? `${library.count} ${listWord(library.count)}` : '…'}</span>
              </h1>
              <p style={{ margin: '0.45rem 0 0', color: 'var(--text-muted)' }}>
                Создавайте списки слов и управляйте ими здесь
              </p>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', letterSpacing: '0.08em' }}>ВАША БИБЛИОТЕКА</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10, margin: '1rem 0' }}>
            <MiniStat title={`${summary?.streak_days ?? 0} дней`} subtitle="Практикуй каждый день" />
            <MiniStat title={`${summary?.due ?? 0}`} subtitle="К повторению" />
            <MiniStat title={`${summary?.sessions_week ?? 0}`} subtitle="Сессии на этой неделе" />
            <MiniStat title={`${summary?.mastered ?? 0}`} subtitle="Освоено" />
            <button type="button" onClick={() => router.push('/dashboard?tab=words')} style={{ ...statCard, cursor: 'pointer', textAlign: 'left' }}>
              <strong>Послушать слова</strong>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Сначала на слух</span>
            </button>
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск словарей..."
              style={{ ...inputStyle, margin: 0, flex: 1 }}
            />
            <button type="button" onClick={openCreate} style={primaryBtn}>+ Создать новый словарь</button>
          </div>

          {error && <p style={{ color: '#fca5a5' }}>{error}</p>}
          {loading && <p style={{ color: 'var(--text-muted)' }}>Загружаем библиотеку…</p>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {lists.map((item) => (
              <button key={item.id} type="button" onClick={() => openList(item.id)} style={{ ...cardBtn, textAlign: 'left', minHeight: 170 }}>
                {item.source === 'system' && (
                  <div style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderLeft: '28px solid transparent', borderTop: '28px solid var(--accent)' }} />
                )}
                {item.level && (
                  <div style={{ color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 700 }}>{item.level}</div>
                )}
                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{item.title}</div>
                <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: '0.85rem' }}>{item.word_count} слов</div>
                <div style={{ marginTop: 'auto', paddingTop: 18 }}>
                  <div style={{ height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.08)' }}>
                    <div style={{
                      width: `${item.word_count ? Math.min(100, Math.round((item.stats.mastered / item.word_count) * 100)) : 0}%`,
                      height: '100%',
                      borderRadius: 99,
                      background: 'var(--accent)',
                    }}
                    />
                  </div>
                  <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    {item.studied ? 'Уже изучается' : 'Ещё не изучалось'}
                  </div>
                </div>
              </button>
            ))}
            <button type="button" onClick={openCreate} style={{ ...cardBtn, borderStyle: 'dashed', minHeight: 170, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2rem', lineHeight: 1 }}>+</div>
              <div>Создать новый словарь</div>
            </button>
          </div>
        </section>
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

function SideItem({ label, count, active = false }: { label: string; count: number; active?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.55rem 0.65rem',
      borderRadius: 12,
      background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
      marginBottom: 4,
    }}
    >
      <span>{label}</span>
      <span style={{
        minWidth: 22,
        height: 22,
        borderRadius: 99,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255,255,255,0.08)',
        fontSize: '0.75rem',
      }}
      >
        {count}
      </span>
    </div>
  );
}

function MiniStat({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={statCard}>
      <strong>{title}</strong>
      <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{subtitle}</span>
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  padding: 0,
};

const primaryBtn: React.CSSProperties = {
  border: 'none',
  borderRadius: 14,
  background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 78%, #fff) 0%, var(--accent) 48%, var(--accent-strong) 100%)',
  color: '#121614',
  fontFamily: 'inherit',
  fontWeight: 700,
  padding: '0.75rem 1rem',
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  ...primaryBtn,
  background: 'transparent',
  color: 'var(--text-primary)',
  border: '1px solid var(--stroke)',
};

const chipBtn: React.CSSProperties = {
  border: '1px solid var(--stroke)',
  borderRadius: 999,
  padding: '0.4rem 0.75rem',
  cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  margin: '0.75rem 0',
  borderRadius: 12,
  border: '1px solid var(--stroke)',
  background: 'rgba(255,255,255,0.04)',
  color: 'var(--text-primary)',
  padding: '0.75rem 0.9rem',
};

const cardBtn: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 16,
  border: '1px solid var(--stroke)',
  background: 'rgba(255,255,255,0.03)',
  color: 'var(--text-primary)',
  padding: '1rem',
  cursor: 'pointer',
};

const statCard: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  borderRadius: 14,
  border: '1px solid var(--stroke)',
  background: 'rgba(255,255,255,0.03)',
  padding: '0.8rem 0.9rem',
};

const sideAction: React.CSSProperties = {
  width: '100%',
  marginTop: 8,
  border: '1px dashed var(--stroke)',
  borderRadius: 12,
  background: 'transparent',
  color: 'var(--text-muted)',
  padding: '0.55rem 0.65rem',
  textAlign: 'left',
  cursor: 'not-allowed',
};

const badge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 999,
  border: '1px solid var(--stroke)',
  padding: '0.15rem 0.55rem',
  fontSize: '0.8rem',
  fontFamily: 'system-ui, sans-serif',
  color: 'var(--text-muted)',
  verticalAlign: 'middle',
};
