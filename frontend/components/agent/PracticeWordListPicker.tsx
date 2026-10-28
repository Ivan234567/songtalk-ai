'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { buildAgentAuthHeaders } from '@/lib/agent-request';
import type { LearningLanguage } from '@/lib/learning-language';
import { PRACTICE_WORDS_LIMIT, type ChatPracticeSense } from './ChatPracticeWords';
import {
  rankVocabListsForContext,
  type PracticeListContext,
} from '@/lib/practice-list-context';
import styles from './practice-word-list-picker.module.css';

type VocabListCard = {
  id: string;
  title: string;
  word_count: number;
  source?: string;
  level?: string | null;
  description?: string | null;
  system_key?: string | null;
  bound_kind?: string | null;
  bound_ref?: string | null;
  bound_label?: string | null;
  theme_keys?: string[] | null;
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
  listContext?: PracticeListContext | null;
  preferredListId?: string | null;
  onActiveListChange?: (list: VocabListCard | null) => void;
};

function getApiUrl(apiUrl: string) {
  return apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
}

function wordCountLabel(count: number) {
  if (count === 1) return 'слово';
  if (count >= 2 && count <= 4) return 'слова';
  return 'слов';
}

function mapListItem(item: VocabListCard & { stats?: { word_count?: number } }): VocabListCard | null {
  const id = typeof item?.id === 'string' ? item.id : '';
  const title = typeof item?.title === 'string' ? item.title.trim() : '';
  if (!id || !title) return null;
  return {
    id,
    title,
    word_count: Number(item.word_count ?? item.stats?.word_count) || 0,
    source: item.source,
    level: item.level ?? null,
    description: typeof item.description === 'string' ? item.description : null,
    system_key: typeof item.system_key === 'string' ? item.system_key : null,
    bound_kind: typeof item.bound_kind === 'string' ? item.bound_kind : null,
    bound_ref: typeof item.bound_ref === 'string' ? item.bound_ref : null,
    bound_label: typeof item.bound_label === 'string' ? item.bound_label : null,
    theme_keys: Array.isArray(item.theme_keys)
      ? item.theme_keys.filter((key): key is string => typeof key === 'string' && Boolean(key.trim()))
      : null,
  };
}

function ListRow({
  list,
  matched = false,
  bound = false,
  onOpen,
}: {
  list: VocabListCard;
  matched?: boolean;
  bound?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.listRow} ${matched || bound ? styles.listRowMatched : ''}`}
      onClick={onOpen}
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
          {list.word_count} {wordCountLabel(list.word_count)}
          {list.level ? ` · ${list.level}` : ''}
          {bound ? ' · к этой сцене' : matched ? ' · к контексту' : ''}
        </span>
      </span>
      <span className={styles.chevron} aria-hidden>›</span>
    </button>
  );
}

export function PracticeWordListPicker({
  apiUrl,
  token,
  learningLanguage,
  selected,
  onChange,
  limit = PRACTICE_WORDS_LIMIT,
  listContext = null,
  preferredListId = null,
  onActiveListChange,
}: PracticeWordListPickerProps) {
  const base = getApiUrl(apiUrl);
  const binding = listContext?.binding || null;
  const [view, setView] = useState<'lists' | 'words'>('lists');
  const [lists, setLists] = useState<VocabListCard[]>([]);
  const [boundLists, setBoundLists] = useState<VocabListCard[]>([]);
  const [listsState, setListsState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [activeList, setActiveList] = useState<VocabListCard | null>(null);
  const [words, setWords] = useState<ChatPracticeSense[]>([]);
  const [wordsState, setWordsState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmingPreview, setConfirmingPreview] = useState(false);
  const [pickingSession, setPickingSession] = useState(false);
  const [pickReason, setPickReason] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [aiPreview, setAiPreview] = useState<{
    title: string;
    items: Array<{ word: string; gloss: string; phonetic?: string | null; part_of_speech?: string | null; pinyin?: string | null }>;
    replaceExisting?: boolean;
    listId?: string | null;
    mode?: 'generate' | 'regenerate';
  } | null>(null);
  const preferredOpenedRef = React.useRef<string | null>(null);
  const autoPickedListRef = React.useRef<string | null>(null);

  const reloadLists = React.useCallback(async () => {
    setListsState('loading');
    setCreateError(null);
    try {
      const [allResp, boundResp] = await Promise.all([
        fetch(`${base}/api/vocabulary/lists`, {
          headers: buildAgentAuthHeaders(token, learningLanguage),
        }),
        binding
          ? fetch(
            `${base}/api/vocabulary/lists?bound_kind=${encodeURIComponent(binding.kind)}&bound_ref=${encodeURIComponent(binding.ref)}`,
            { headers: buildAgentAuthHeaders(token, learningLanguage) },
          )
          : Promise.resolve(null),
      ]);
      const allData = await allResp.json().catch(() => ({}));
      if (!allResp.ok || !Array.isArray(allData?.items)) throw new Error('lists');
      const mappedAll = (allData.items as VocabListCard[])
        .map((item) => mapListItem(item))
        .filter(Boolean) as VocabListCard[];
      setLists(mappedAll);

      if (boundResp) {
        const boundData = await boundResp.json().catch(() => ({}));
        if (boundResp.ok && Array.isArray(boundData?.items)) {
          setBoundLists(
            (boundData.items as VocabListCard[])
              .map((item) => mapListItem(item))
              .filter(Boolean) as VocabListCard[],
          );
        } else {
          setBoundLists([]);
        }
      } else {
        setBoundLists([]);
      }
      setListsState('idle');
      return mappedAll;
    } catch {
      setListsState('error');
      return [];
    }
  }, [base, token, learningLanguage, binding]);

  useEffect(() => {
    let cancelled = false;
    void reloadLists().then((items) => {
      if (cancelled || !preferredListId || preferredOpenedRef.current === preferredListId) return;
      const preferred = items.find((item) => item.id === preferredListId);
      if (preferred) {
        preferredOpenedRef.current = preferredListId;
        openList(preferred);
      }
    });
    return () => { cancelled = true; };
    // openList is defined in render; preferred open is intentionally once per id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadLists, preferredListId]);

  const applySessionPicks = async (
    listId: string,
    options?: { excludeSenseIds?: string[]; replace?: boolean },
  ) => {
    const resp = await fetch(`${base}/api/vocabulary/lists/${encodeURIComponent(listId)}/session-picks`, {
      method: 'POST',
      headers: {
        ...buildAgentAuthHeaders(token, learningLanguage),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        limit,
        exclude_sense_ids: options?.excludeSenseIds || [],
        theme_text: listContext?.text || '',
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !Array.isArray(data?.items)) {
      throw new Error(typeof data?.error === 'string' ? data.error : 'Не удалось подобрать слова');
    }
    const mapped = (data.items as Array<{ sense_id?: string; headword?: string; gloss_ru?: string }>).flatMap((item) => {
      const senseId = typeof item.sense_id === 'string' ? item.sense_id : '';
      const headword = typeof item.headword === 'string' ? item.headword.trim() : '';
      const glossRu = typeof item.gloss_ru === 'string' ? item.gloss_ru.trim() : '';
      return senseId && headword && glossRu ? [{ senseId, headword, glossRu }] : [];
    });
    if (!mapped.length) {
      throw new Error('В списке не осталось других слов для сессии');
    }
    const next = mapped.slice(0, limit);
    onChange(options?.replace === false ? [...selected, ...next].slice(0, limit) : next);
    setPickReason(typeof data.reason === 'string' && data.reason.trim() ? data.reason.trim() : null);
    return next;
  };

  const openList = (list: VocabListCard) => {
    setActiveList(list);
    onActiveListChange?.(list);
    setView('words');
    setQuery('');
    setWordsState('loading');
    setWords([]);
    setPickReason(null);
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
        const wordList = [...dedup.values()];
        setWords(wordList);
        setWordsState('idle');
        if (
          wordList.length > 0
          && selected.length === 0
          && autoPickedListRef.current !== list.id
        ) {
          autoPickedListRef.current = list.id;
          void applySessionPicks(list.id).catch(() => {
            /* ручной выбор остаётся */
          });
        }
      })
      .catch(() => setWordsState('error'));
  };

  const createBoundList = async () => {
    if (!binding || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const title = binding.kind === 'debate'
        ? `К дебату: ${binding.label}`.slice(0, 120)
        : binding.kind === 'chat'
          ? 'Слова для свободного диалога'
          : `К сцене: ${binding.label}`.slice(0, 120);
      const resp = await fetch(`${base}/api/vocabulary/lists`, {
        method: 'POST',
        headers: {
          ...buildAgentAuthHeaders(token, learningLanguage),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          source: 'user',
          binding: {
            kind: binding.kind,
            ref: binding.ref,
            origin: binding.origin,
            label: binding.label,
          },
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.item?.id) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'create');
      }
      const created = mapListItem(data.item);
      await reloadLists();
      if (created) openList(created);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Не удалось создать список');
    } finally {
      setCreating(false);
    }
  };

  const balanceError = (status: number, message: string) => {
    if (status === 402) {
      return message.includes('баланс') || message.includes('средств')
        ? message
        : 'Недостаточно средств. Пополните баланс — генерация списывается с вашего счёта.';
    }
    return message;
  };

  const generateAiList = async (options?: { replaceExisting?: boolean }) => {
    if (!binding || generating) return;
    if (learningLanguage === 'zh' && binding.kind === 'debate') {
      setCreateError('Для китайского дебаты недоступны — выбери сцену или свободный диалог');
      return;
    }
    setGenerating(true);
    setCreateError(null);
    setAiPreview(null);
    try {
      const resp = await fetch(`${base}/api/vocabulary/lists/generate-for-context`, {
        method: 'POST',
        headers: {
          ...buildAgentAuthHeaders(token, learningLanguage),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preview: true,
          binding: {
            kind: binding.kind,
            ref: binding.ref,
            origin: binding.origin,
            label: binding.label,
          },
          title: binding.label,
          theme_text: listContext?.text || '',
          level: listContext?.level || '',
          replace_existing: Boolean(options?.replaceExisting),
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (data?.reused && data?.item?.id) {
        const created = mapListItem(data.item);
        await reloadLists();
        if (created) openList(created);
        return;
      }
      if (!resp.ok || !Array.isArray(data?.items) || data.items.length < 1) {
        throw new Error(balanceError(
          resp.status,
          typeof data?.error === 'string' ? data.error : 'Не удалось собрать список',
        ));
      }
      setAiPreview({
        title: typeof data.title === 'string' ? data.title : binding.label,
        items: data.items,
        replaceExisting: Boolean(options?.replaceExisting),
        mode: 'generate',
      });
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Не удалось собрать список');
    } finally {
      setGenerating(false);
    }
  };

  const regenerateActiveList = async (mode: 'replace' | 'new' = 'replace') => {
    if (!activeList || regenerating) return;
    setRegenerating(true);
    setCreateError(null);
    setAiPreview(null);
    try {
      const resp = await fetch(`${base}/api/vocabulary/lists/${encodeURIComponent(activeList.id)}/regenerate`, {
        method: 'POST',
        headers: {
          ...buildAgentAuthHeaders(token, learningLanguage),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preview: true,
          mode,
          theme_text: listContext?.text || '',
          level: listContext?.level || '',
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !Array.isArray(data?.items) || data.items.length < 1) {
        throw new Error(balanceError(
          resp.status,
          typeof data?.error === 'string' ? data.error : 'Не удалось пересобрать список',
        ));
      }
      setAiPreview({
        title: typeof data.title === 'string' ? data.title : activeList.title,
        items: data.items,
        listId: activeList.id,
        mode: 'regenerate',
        replaceExisting: mode === 'replace',
      });
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Не удалось пересобрать список');
    } finally {
      setRegenerating(false);
    }
  };

  const confirmAiPreview = async () => {
    if (!aiPreview || confirmingPreview) return;
    setConfirmingPreview(true);
    setCreateError(null);
    try {
      if (aiPreview.mode === 'regenerate' && aiPreview.listId) {
        const resp = await fetch(`${base}/api/vocabulary/lists/${encodeURIComponent(aiPreview.listId)}/regenerate`, {
          method: 'POST',
          headers: {
            ...buildAgentAuthHeaders(token, learningLanguage),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            confirm: true,
            mode: aiPreview.replaceExisting === false ? 'new' : 'replace',
            title: aiPreview.title,
            items: aiPreview.items,
          }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data?.item?.id) {
          throw new Error(balanceError(
            resp.status,
            typeof data?.error === 'string' ? data.error : 'Не удалось сохранить список',
          ));
        }
        const next = mapListItem(data.item);
        setAiPreview(null);
        await reloadLists();
        if (next) openList(next);
        return;
      }
      if (!binding) throw new Error('Нет привязки к модулю');
      const resp = await fetch(`${base}/api/vocabulary/lists/generate-for-context`, {
        method: 'POST',
        headers: {
          ...buildAgentAuthHeaders(token, learningLanguage),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          confirm: true,
          binding: {
            kind: binding.kind,
            ref: binding.ref,
            origin: binding.origin,
            label: binding.label,
          },
          title: aiPreview.title,
          items: aiPreview.items,
          replace_existing: Boolean(aiPreview.replaceExisting),
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.item?.id) {
        throw new Error(balanceError(
          resp.status,
          typeof data?.error === 'string' ? data.error : 'Не удалось сохранить список',
        ));
      }
      const created = mapListItem(data.item);
      setAiPreview(null);
      await reloadLists();
      if (created) openList(created);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Не удалось сохранить список');
    } finally {
      setConfirmingPreview(false);
    }
  };

  const pickSessionWords = async () => {
    if (!activeList || pickingSession) return;
    setPickingSession(true);
    setCreateError(null);
    try {
      await applySessionPicks(activeList.id, {
        excludeSenseIds: selected.map((sense) => sense.senseId),
      });
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Не удалось подобрать слова');
    } finally {
      setPickingSession(false);
    }
  };

  const boundIds = useMemo(() => new Set(boundLists.map((item) => item.id)), [boundLists]);
  const ranked = useMemo(
    () => rankVocabListsForContext(lists.filter((item) => !boundIds.has(item.id)), listContext),
    [lists, listContext, boundIds],
  );

  const visibleBound = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return boundLists;
    return boundLists.filter((list) => (
      list.title.toLowerCase().includes(needle)
      || String(list.bound_label || '').toLowerCase().includes(needle)
    ));
  }, [boundLists, query]);

  const visibleMatched = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return ranked.matched;
    return ranked.matched.filter((list) => (
      list.title.toLowerCase().includes(needle)
      || String(list.description || '').toLowerCase().includes(needle)
    ));
  }, [ranked.matched, query]);

  const visibleRest = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return ranked.rest;
    return ranked.rest.filter((list) => (
      list.title.toLowerCase().includes(needle)
      || String(list.description || '').toLowerCase().includes(needle)
    ));
  }, [ranked.rest, query]);

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
              onActiveListChange?.(null);
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
          {binding && (
            <div className={styles.createBound}>
              <button
                type="button"
                className={styles.aiBoundBtn}
                disabled={generating || creating}
                onClick={() => void generateAiList()}
              >
                {generating ? 'Собираем слова…' : (
                  binding.kind === 'debate'
                    ? 'Собрать слова ИИ под дебат'
                    : binding.kind === 'chat'
                      ? 'Собрать слова ИИ для разговора'
                      : 'Собрать слова ИИ под сцену'
                )}
              </button>
              <button
                type="button"
                className={styles.createBoundBtn}
                disabled={creating || generating}
                onClick={() => void createBoundList()}
              >
                {creating ? 'Создаём…' : 'Пустой список под модуль'}
              </button>
              {createError && <p className={styles.error}>{createError}</p>}
            </div>
          )}
          {aiPreview && (
            <div className={styles.previewPanel}>
              <p className={styles.previewTitle}>Проверьте список до сохранения</p>
              <p className={styles.previewLead}>
                Списано с баланса. Мусорные слова отфильтрованы. Подтвердите — тогда попадёт в словарь.
              </p>
              <p className={styles.previewName}>{aiPreview.title}</p>
              <ul className={styles.previewList}>
                {aiPreview.items.map((item) => (
                  <li key={item.word}>
                    <strong>{item.word}</strong>
                    <span>{item.gloss}</span>
                  </li>
                ))}
              </ul>
              <div className={styles.previewActions}>
                <button
                  type="button"
                  className={styles.aiBoundBtn}
                  disabled={confirmingPreview}
                  onClick={() => void confirmAiPreview()}
                >
                  {confirmingPreview ? 'Сохраняем…' : `Сохранить ${aiPreview.items.length} слов`}
                </button>
                <button
                  type="button"
                  className={styles.createBoundBtn}
                  disabled={confirmingPreview || generating || regenerating}
                  onClick={() => setAiPreview(null)}
                >
                  Отменить
                </button>
                <button
                  type="button"
                  className={styles.createBoundBtn}
                  disabled={confirmingPreview || generating || regenerating}
                  onClick={() => {
                    const again = aiPreview;
                    setAiPreview(null);
                    if (again.mode === 'regenerate') void regenerateActiveList(again.replaceExisting === false ? 'new' : 'replace');
                    else void generateAiList({ replaceExisting: again.replaceExisting });
                  }}
                >
                  Сгенерировать снова (ещё списание)
                </button>
              </div>
              {createError && <p className={styles.error}>{createError}</p>}
            </div>
          )}
          {listsState === 'loading' && <p className={styles.muted}>Загружаем списки…</p>}
          {listsState === 'error' && <p className={styles.error}>Не удалось открыть списки</p>}
          {listsState === 'idle' && visibleBound.length === 0 && visibleMatched.length === 0 && visibleRest.length === 0 && (
            <p className={styles.muted}>В словаре пока нет списков</p>
          )}
          {visibleBound.length > 0 && (
            <div className={styles.section}>
              <p className={styles.sectionLabel}>
                {binding?.kind === 'debate'
                  ? 'Уже к этому дебату'
                  : binding?.kind === 'chat'
                    ? 'Уже к свободному диалогу'
                    : 'Уже к этой сцене'}
              </p>
              <div className={styles.list}>
                {visibleBound.map((list) => (
                  <ListRow key={list.id} list={list} bound onOpen={() => openList(list)} />
                ))}
              </div>
            </div>
          )}
          {visibleMatched.length > 0 && (
            <div className={styles.section}>
              <p className={styles.sectionLabel}>{listContext?.label || 'Подходит к контексту'}</p>
              <div className={styles.list}>
                {visibleMatched.map((list) => (
                  <ListRow key={list.id} list={list} matched onOpen={() => openList(list)} />
                ))}
              </div>
            </div>
          )}
          {visibleRest.length > 0 && (
            <div className={styles.section}>
              {(visibleBound.length > 0 || visibleMatched.length > 0) && (
                <p className={styles.sectionLabel}>Все списки</p>
              )}
              <div className={styles.list}>
                {visibleRest.map((list) => (
                  <ListRow key={list.id} list={list} onOpen={() => openList(list)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {view === 'words' && (
        <>
          {activeList && <p className={styles.listHeading}>{activeList.title}</p>}
          {pickReason && selected.length > 0 && (
            <p className={styles.whyLine}>{pickReason}</p>
          )}
          {activeList && (
            <div className={styles.sessionActions}>
              <button
                type="button"
                className={styles.sessionBtn}
                disabled={pickingSession || wordsState === 'loading'}
                onClick={() => void pickSessionWords()}
              >
                {pickingSession ? 'Подбираем…' : 'Другие 5 для сессии'}
              </button>
              {binding && (
                <button
                  type="button"
                  className={styles.sessionBtnGhost}
                  disabled={regenerating || generating}
                  onClick={() => void regenerateActiveList('replace')}
                >
                  {regenerating ? 'Пересобираем…' : 'Пересобрать список ИИ'}
                </button>
              )}
            </div>
          )}
          {createError && view === 'words' && <p className={styles.error}>{createError}</p>}
          {wordsState === 'loading' && <p className={styles.muted}>Загружаем слова…</p>}
          {wordsState === 'error' && <p className={styles.error}>Не удалось открыть список</p>}
          {wordsState === 'idle' && visibleWords.length === 0 && (
            <p className={styles.muted}>
              {binding
                ? 'Список пуст — соберите слова ИИ или добавьте вручную в словаре'
                : 'В этом списке нет слов с переводом'}
            </p>
          )}
          {wordsState === 'idle' && visibleWords.length === 0 && binding && (
            <button
              type="button"
              className={styles.aiBoundBtn}
              disabled={generating}
              onClick={() => void generateAiList({ replaceExisting: true })}
            >
              {generating ? 'Собираем слова…' : 'Собрать слова ИИ в этот список'}
            </button>
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
