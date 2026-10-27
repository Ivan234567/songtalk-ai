'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useLearningLanguage } from '@/context/LearningLanguageContext';
import { useTtsVoice } from '@/context/TtsVoiceContext';
import styles from './vocab-library.module.css';

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
  status: 'new' | 'learning' | 'due' | 'mastered';
  sense_ids: string[];
};

function getApiUrl() {
  const url = process.env.NEXT_PUBLIC_API_URL || '';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

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
      const url = new URL(`${getApiUrl()}/api/vocabulary/lists`);
      if (q) url.searchParams.set('q', q);
      const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'load');
      setLibrary(data as LibraryPayload);
    } catch {
      setError('Не удалось открыть библиотеку словарей');
      setLibrary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (accessToken: string, id: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const url = new URL(`${getApiUrl()}/api/vocabulary/lists/${id}`);
      if (wordFilter !== 'all') url.searchParams.set('filter', wordFilter);
      if (wordQuery.trim()) url.searchParams.set('q', wordQuery.trim());
      const resp = await fetch(url.toString(), {
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

  const listenList = () => {
    if (!listId) return;
    router.push(`/dashboard?tab=words&list=${listId}`);
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
    const senseIds = detail.words.flatMap((word) => word.sense_ids).slice(0, 5);
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
      <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%', padding: '0.5rem 0 2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
          <button type="button" onClick={closeCreate} style={ghostBtn}>← К словарям</button>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', letterSpacing: '0.08em' }}>ВЫБЕРИТЕ СТАРТОВЫЙ НАБОР</span>
        </div>
        <h1 className={styles.title}>
          Пять демо-списков <span>A1–A2</span>
        </h1>
        <div style={{ display: 'flex', gap: 18, marginBottom: 16, borderBottom: '1px solid var(--stroke)' }}>
          {([
            ['starter', '01', 'Быстрый старт'],
            ['empty', '02', 'Пустой список'],
            ['custom', '03', 'Настраиваемый'],
          ] as const).map(([key, num, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setCreateTab(key)}
              style={{
                border: 'none',
                background: 'transparent',
                color: createTab === key ? 'var(--text-primary)' : 'var(--text-muted)',
                padding: '0.6rem 0',
                borderBottom: createTab === key ? '2px solid var(--accent)' : '2px solid transparent',
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>{num}</div>
              {label}
            </button>
          ))}
        </div>
        {error && <p style={{ color: '#fca5a5' }}>{error}</p>}
        {createTab === 'starter' && (
          <>
            <p style={{ color: 'var(--text-muted)', maxWidth: 720 }}>
              Нажмите на любой набор, чтобы создать список. Потом можно слушать слова и говорить их самому.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginTop: 16 }}>
              {(library?.starter_packs || []).map((pack) => (
                <button
                  key={pack.key}
                  type="button"
                  disabled={busyKey === pack.key}
                  onClick={() => void (pack.in_library
                    ? openList(library?.items.find((item) => item.system_key === pack.key)?.id || '')
                    : addStarter(pack.key))}
                  style={{ ...cardBtn, textAlign: 'left', minHeight: 160 }}
                >
                  {pack.in_library && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--accent)', marginBottom: 8 }}>В БИБЛИОТЕКЕ · {pack.level}</div>
                  )}
                  <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{pack.title}</div>
                  <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{pack.word_count} слов</div>
                  <div style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{pack.description}</div>
                  <div style={{ marginTop: 'auto', paddingTop: 16, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {pack.in_library ? 'ОТКРЫТЬ СПИСОК →' : busyKey === pack.key ? 'Добавляем…' : 'ДОБАВИТЬ →'}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
        {createTab === 'empty' && (
          <div style={{ maxWidth: 420 }}>
            <p style={{ color: 'var(--text-muted)' }}>Свой список: дайте имя, затем добавляйте слова и переводы.</p>
            <input
              value={emptyTitle}
              onChange={(event) => setEmptyTitle(event.target.value)}
              placeholder="Название списка"
              style={inputStyle}
            />
            <button type="button" disabled={!emptyTitle.trim() || busyKey === 'empty'} onClick={() => void createEmpty()} style={primaryBtn}>
              {busyKey === 'empty' ? 'Создаём…' : 'Создать список'}
            </button>
          </div>
        )}
        {createTab === 'custom' && (
          <div style={{ maxWidth: 520 }}>
            <p style={{ color: 'var(--text-muted)' }}>
              Свой список уже бесплатный. Уровень, контекст и часть речи для автоподбора слов подключим следующим шагом.
            </p>
            <button type="button" onClick={() => setCreateTab('empty')} style={primaryBtn}>Сделать пустой список</button>
          </div>
        )}
      </div>
    );
  }

  if (listId) {
    const item = detail?.item;
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%', padding: '0.5rem 0 2rem' }}>
        <button type="button" onClick={backToLibrary} style={ghostBtn}>← Назад к словарям</button>
        <h1 className={styles.title}>{item?.title || 'Список'}</h1>
        {item && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
            {[
              ['new', item.stats.new, 'Новые'],
              ['learning', item.stats.learning, 'Учу'],
              ['due', item.stats.due, 'К повторению'],
              ['mastered', item.stats.mastered, 'Освоены'],
            ].map(([key, value, label]) => (
              <div key={key} style={statCard}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: STATUS_COLOR[key as ListWord['status']] }} />
                <strong style={{ fontSize: '1.2rem' }}>{value}</strong>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{label}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <button type="button" onClick={listenList} style={primaryBtn}>Послушать</button>
          <button type="button" onClick={sayList} style={secondaryBtn}>Сказать сам</button>
        </div>
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
            {busyKey === 'add-word' ? 'Добавляем…' : '+ Добавить слово'}
          </button>
        </form>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <input
            value={wordQuery}
            onChange={(event) => setWordQuery(event.target.value)}
            placeholder="Поиск слов..."
            style={{ ...inputStyle, margin: 0, flex: 1, minWidth: 180 }}
          />
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {(detail?.words || []).map((word) => (
            <div key={word.vocabulary_id} style={{ ...panel, minHeight: 150 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ fontSize: '1.05rem' }}>{word.headword}</strong>
                <button type="button" onClick={() => void speakWord(word)} style={iconBtn} aria-label="Послушать слово">
                  {speakingId === word.vocabulary_id ? '…' : '♪'}
                </button>
              </div>
              {word.part_of_speech && <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 4 }}>{word.part_of_speech}</div>}
              <div style={{ marginTop: 10 }}>{word.gloss_ru || '—'}</div>
              <div style={{ marginTop: 'auto', paddingTop: 14, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: STATUS_COLOR[word.status] }} />
                {STATUS_LABEL[word.status]}
              </div>
            </div>
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

          {(library?.starter_packs || []).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8, color: 'var(--text-muted)', fontSize: '0.78rem', letterSpacing: '0.08em' }}>ДЕМО A1–A2</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                {library.starter_packs.map((pack) => (
                  <button
                    key={pack.key}
                    type="button"
                    disabled={busyKey === pack.key}
                    onClick={() => void (pack.in_library
                      ? openList(library.items.find((item) => item.system_key === pack.key)?.id || '')
                      : addStarter(pack.key))}
                    style={{ ...cardBtn, textAlign: 'left', minHeight: 120 }}
                  >
                    <div style={{ color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 700 }}>{pack.level}</div>
                    <div style={{ fontWeight: 700, marginTop: 4 }}>{pack.title}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 6 }}>{pack.word_count} слов</div>
                    <div style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {pack.in_library ? 'Открыть' : busyKey === pack.key ? 'Добавляем…' : 'Добавить в библиотеку'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {lists.map((item) => (
              <button key={item.id} type="button" onClick={() => openList(item.id)} style={{ ...cardBtn, textAlign: 'left', minHeight: 170 }}>
                {item.source === 'system' && (
                  <div style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderLeft: '28px solid transparent', borderTop: '28px solid var(--accent)' }} />
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

const iconBtn: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 99,
  border: '1px solid var(--stroke)',
  background: 'transparent',
  color: 'var(--text-primary)',
  cursor: 'pointer',
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
