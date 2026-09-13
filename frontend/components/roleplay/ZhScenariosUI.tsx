'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { RoleplayScenario } from '@/lib/roleplay';
import {
  addZhScenarioVocabToDictionary,
  canSaveZhScenario,
  createZhScenario,
  deleteZhScenario,
  draftFromGenerateResult,
  duplicateZhScenario,
  emptyManualZhScenario,
  generateZhScenario,
  getZhScenario,
  listZhScenarios,
  toZhWritePayload,
  updateZhScenario,
  type ZhHskLevel,
  type ZhScenario,
} from '@/lib/zh-scenarios';
import { LevelDropdown } from '@/components/ui/LevelDropdown';
import { HskLevelPicker } from '@/components/ui/HskLevelPicker';
import { ZhScenarioConstructor } from '@/components/roleplay/ZhScenarioConstructor';
import { ZhScenarioBriefing } from '@/components/roleplay/ZhScenarioBriefing';
import { ZhPlayModeDots } from '@/components/roleplay/ZhPlayModeDots';
import { type ZhPlayMode } from '@/lib/zh-play-mode';

type ZhScenariosUIProps = {
  onSelectScenario: (scenario: RoleplayScenario) => void;
  onClose: () => void;
  initialView: 'catalog' | 'create' | 'my';
  defaultHsk?: ZhHskLevel;
  onCopyToMineSuccess?: (newScenarioId: string) => void;
  initialScenarioId?: string | null;
  initialPlayMode?: ZhPlayMode;
};

type ZhScenariosErrorBoundaryProps = {
  onClose: () => void;
  children: React.ReactNode;
};

type ZhScenariosErrorBoundaryState = { error: Error | null };

export class ZhScenariosErrorBoundary extends React.Component<
  ZhScenariosErrorBoundaryProps,
  ZhScenariosErrorBoundaryState
> {
  state: ZhScenariosErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ZhScenariosErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ZhScenariosUI]', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="dialog" aria-modal="true" aria-label="Ошибка сценариев" style={overlayStyle} onClick={this.props.onClose}>
        <div
          style={{
            ...panelStyle,
            maxWidth: 480,
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>Не получилось открыть сценарии</h2>
          <p style={{ margin: 0, fontSize: '0.9375rem', opacity: 0.8, lineHeight: 1.45 }}>
            Попробуйте ещё раз. Если ошибка повторится — пришлите текст ниже.
          </p>
          <pre
            style={{
              margin: 0,
              padding: '0.75rem',
              borderRadius: 10,
              background: 'var(--sidebar-hover)',
              fontSize: '0.75rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 160,
              overflow: 'auto',
            }}
          >
            {this.state.error.message}
          </pre>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => this.setState({ error: null })} style={btnPrimary}>
              Ещё раз
            </button>
            <button type="button" onClick={this.props.onClose} style={btnSecondary}>
              Закрыть
            </button>
          </div>
        </div>
      </div>
    );
  }
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2rem',
  background: 'rgba(0,0,0,0.5)',
  backdropFilter: 'blur(4px)',
};

const panelStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 720,
  maxHeight: '94vh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 20,
  background: 'var(--sidebar-bg)',
  border: '1px solid var(--sidebar-border)',
  boxShadow: '0 24px 48px rgba(0,0,0,0.2)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem 1rem',
  borderRadius: 12,
  border: '1px solid var(--sidebar-border)',
  background: 'var(--sidebar-hover)',
  color: 'var(--sidebar-text)',
  fontSize: '1.0625rem',
  outline: 'none',
};

const btnPrimary: React.CSSProperties = {
  padding: '0.75rem 1.5rem',
  borderRadius: 12,
  border: 'none',
  background: 'rgba(79, 168, 134, 0.9)',
  color: '#fff',
  fontSize: '1.0625rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '0.7rem 1.25rem',
  borderRadius: 12,
  border: '1px solid var(--sidebar-border)',
  background: 'transparent',
  color: 'var(--sidebar-text)',
  fontSize: '1rem',
  cursor: 'pointer',
};

const HSK_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'Все HSK' },
  { value: '1', label: 'HSK 1' },
  { value: '2', label: 'HSK 2' },
  { value: '3', label: 'HSK 3' },
  { value: '4', label: 'HSK 4' },
  { value: '5', label: 'HSK 5' },
  { value: '6', label: 'HSK 6' },
];

function textbookLine(s: ZhScenario): string {
  const title = typeof s.textbook?.title === 'string' ? s.textbook.title : '';
  const lesson = typeof s.textbook?.lesson_no === 'string' ? s.textbook.lesson_no : '';
  return [title, lesson].filter(Boolean).join(' · ');
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontSize: '0.875rem',
  fontWeight: 600,
  color: 'var(--sidebar-text)',
};

function ZhIntentForm({
  defaultHsk,
  onGenerated,
  onManualCreate,
}: {
  defaultHsk: ZhHskLevel;
  onGenerated: (draft: ZhScenario) => void;
  onManualCreate: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [textbook, setTextbook] = useState('');
  const [lesson, setLesson] = useState('');
  const [goal, setGoal] = useState('');
  const [hsk, setHsk] = useState<ZhHskLevel>(defaultHsk);
  const [fromLife, setFromLife] = useState(false);
  const [lifeWhen, setLifeWhen] = useState<'today' | 'week' | 'practice'>('week');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = fromLife
    ? Boolean(prompt.trim())
    : Boolean(prompt.trim() || (textbook.trim() && (goal.trim() || lesson.trim())));

  const handleGenerate = async () => {
    if (!canSubmit) {
      setError(fromLife ? 'Опишите, что случится в жизни.' : 'Опишите ситуацию или укажите учебник и что отрабатывать.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await generateZhScenario({
        prompt: prompt.trim() || undefined,
        textbook_title: textbook.trim() || undefined,
        lesson_no: lesson.trim() || undefined,
        goal: goal.trim() || undefined,
        hsk_level: hsk,
        role_mode: 'ai',
        starter: 'auto',
        formality: 'auto',
        from_life: fromLife,
        life_when: fromLife ? lifeWhen : undefined,
      });
      const draft = draftFromGenerateResult(result);
      onGenerated({ ...draft, from_life: fromLife || draft.from_life, life_when: fromLife ? lifeWhen : draft.life_when });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка генерации');
    } finally {
      setLoading(false);
    }
  };

  const lifeWhenLabel = (value: typeof lifeWhen) =>
    value === 'today' ? 'сегодня' : value === 'week' ? 'на этой неделе' : 'просто потренировать';

  return (
    <div style={{ padding: '1rem 1.25rem 1.1rem', overflow: 'visible', flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setFromLife(false)}
          style={{ ...btnSecondary, background: !fromLife ? 'var(--sidebar-active)' : 'transparent' }}
        >
          Урок / ситуация
        </button>
        <button
          type="button"
          onClick={() => setFromLife(true)}
          style={{ ...btnSecondary, background: fromLife ? 'var(--sidebar-active)' : 'transparent' }}
        >
          Моя ситуация
        </button>
      </div>
      <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.4, opacity: 0.85 }}>
        {fromLife
          ? 'Что случится в жизни — ИИ соберёт один диалог на 3–5 шагов, не квест на неделю.'
          : 'Опишите урок своими словами — ИИ соберёт диалог, шаги и словарь.'}
      </p>
      <label>
        <span style={labelStyle}>{fromLife ? 'Что случится' : 'Что хотите отработать'}</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder={
            fromLife
              ? 'Например: в четверг к терапевту в Шанхае, болит горло'
              : 'Например: HSK 2 урок 8, в магазине одежды — размер, цвет, цена, купить'
          }
          style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
        />
      </label>
      {fromLife && (
        <div>
          <span style={labelStyle}>Когда</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['today', 'week', 'practice'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setLifeWhen(value)}
                style={{ ...btnSecondary, background: lifeWhen === value ? 'var(--sidebar-active)' : 'transparent', fontSize: '0.875rem' }}
              >
                {lifeWhenLabel(value)}
              </button>
            ))}
          </div>
        </div>
      )}
      {!fromLife && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label>
              <span style={labelStyle}>Учебник</span>
              <input value={textbook} onChange={(e) => setTextbook(e.target.value)} placeholder="необязательно" style={inputStyle} />
            </label>
            <label>
              <span style={labelStyle}>Урок</span>
              <input value={lesson} onChange={(e) => setLesson(e.target.value)} placeholder="Урок 8" style={inputStyle} />
            </label>
          </div>
          <label>
            <span style={labelStyle}>Цель своими словами</span>
            <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="необязательно" style={inputStyle} />
          </label>
        </>
      )}
      <div>
        <span style={labelStyle}>HSK</span>
        <HskLevelPicker value={hsk} onChange={setHsk} />
      </div>
      {error && (
        <p style={{ margin: 0, padding: '0.75rem 1rem', borderRadius: 10, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={handleGenerate} disabled={loading || !canSubmit} style={{ ...btnPrimary, opacity: loading || !canSubmit ? 0.7 : 1 }}>
          {loading ? 'Генерация…' : 'Сгенерировать сценарий'}
        </button>
        <button type="button" onClick={onManualCreate} disabled={loading} style={btnSecondary}>
          Создать вручную
        </button>
      </div>
    </div>
  );
}

export function ZhScenariosUI({
  onSelectScenario,
  onClose,
  initialView,
  defaultHsk = 3,
  onCopyToMineSuccess,
  initialScenarioId,
  initialPlayMode,
}: ZhScenariosUIProps) {
  const [view, setView] = useState<'catalog' | 'create' | 'my'>(
    initialView === 'create' || initialView === 'catalog' ? initialView : 'my'
  );
  const [scenarios, setScenarios] = useState<ZhScenario[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hskFilter, setHskFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'last_used' | 'updated'>('last_used');
  const [briefing, setBriefing] = useState<ZhScenario | null>(null);
  const [draft, setDraft] = useState<ZhScenario | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [vocabBusyId, setVocabBusyId] = useState<string | null>(null);
  const [vocabMessage, setVocabMessage] = useState<{ id: string; text: string } | null>(null);
  const [copySuccessMessage, setCopySuccessMessage] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const list = await listZhScenarios({
        archived: view === 'catalog' ? false : showArchived,
        source: view === 'catalog' ? 'system' : 'user',
        sort: sortBy,
        hsk: hskFilter === 'all' ? undefined : (Number(hskFilter) as ZhHskLevel),
      });
      const items = Array.isArray(list) ? list : [];
      if (view === 'catalog') {
        items.sort((a, b) =>
          String(a?.textbook?.lesson_no || a?.title || '').localeCompare(
            String(b?.textbook?.lesson_no || b?.title || ''),
            'ru',
            { numeric: true }
          )
        );
      }
      setScenarios(items);
    } catch {
      setScenarios([]);
    } finally {
      setListLoading(false);
    }
  }, [view, showArchived, sortBy, hskFilter]);

  useEffect(() => {
    const next = initialView === 'create' || initialView === 'catalog' ? initialView : 'my';
    setView(next);
    if (!initialScenarioId) {
      setBriefing(null);
      setDraft(null);
    }
  }, [initialView, initialScenarioId]);

  useEffect(() => {
    if (!initialScenarioId) return;
    let cancelled = false;
    (async () => {
      const full = await getZhScenario(initialScenarioId);
      if (cancelled || !full) return;
      setView(full.source === 'system' ? 'catalog' : 'my');
      setDraft(null);
      setBriefing(full);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialScenarioId]);

  useEffect(() => {
    if (view === 'my' || view === 'catalog') loadList();
  }, [view, loadList]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (briefing) setBriefing(null);
      else if (draft) setDraft(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [briefing, draft, onClose]);

  const filtered = useMemo(() => {
    const list = Array.isArray(scenarios) ? scenarios.filter((s) => s && typeof s === 'object') : [];
    const q = String(searchQuery || '').trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) => {
      const hay = `${s?.title || ''} ${s?.textbook?.title || ''} ${typeof s?.description === 'string' ? s.description : ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [scenarios, searchQuery]);

  const recentlyPlayed = useMemo(
    () => filtered.filter((s) => Boolean(s?.last_completed_at) && !showArchived).slice(0, 5),
    [filtered, showArchived]
  );
  const fromLifeList = useMemo(
    () => filtered.filter((s) => Boolean(s?.from_life) && !recentlyPlayed.some((r) => r?.id === s?.id)),
    [filtered, recentlyPlayed]
  );
  const mainList = recentlyPlayed.length || fromLifeList.length
    ? filtered.filter((s) => !recentlyPlayed.some((r) => r?.id === s?.id) && !s?.from_life)
    : filtered;

  const handleSaveDraft = async (andPlay: boolean) => {
    if (!draft || !canSaveZhScenario(draft)) {
      setSaveError('Нужны название, хотя бы одна цель и шаг с ожидаемым действием.');
      return;
    }
    setSaveLoading(true);
    setSaveError(null);
    try {
      const payload = toZhWritePayload(draft);
      const saved = draft.id
        ? await updateZhScenario(draft.id, payload)
        : await createZhScenario(payload);
      setDraft(null);
      if (andPlay) {
        setView('my');
        await loadList();
        setBriefing(saved);
        return;
      }
      setView('my');
      await loadList();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaveLoading(false);
    }
  };

  const handlePlay = async (s: ZhScenario) => {
    try {
      const full = (await getZhScenario(s.id)) ?? s;
      setBriefing(full);
    } catch {
      setBriefing(s);
    }
  };

  const handleEdit = async (s: ZhScenario) => {
    setEditingId(s.id);
    setSaveError(null);
    try {
      const full = (await getZhScenario(s.id)) ?? s;
      setDraft(full);
      setBriefing(null);
    } finally {
      setEditingId(null);
    }
  };

  const handleDuplicate = async (id: string) => {
    setDuplicatingId(id);
    try {
      const copy = await duplicateZhScenario(id);
      if (view === 'catalog') {
        setCopySuccessMessage('Сохранено в «Мои сценарии»');
        window.setTimeout(() => {
          setCopySuccessMessage(null);
          setShowArchived(false);
          setView('my');
          onCopyToMineSuccess?.(copy.id);
        }, 1500);
      } else {
        setShowArchived(false);
        setView('my');
        onCopyToMineSuccess?.(copy.id);
        setVocabMessage({ id: copy.id, text: 'Сохранено в «Мои сценарии»' });
      }
    } catch (err) {
      setVocabMessage({
        id,
        text: err instanceof Error ? err.message : 'Не удалось скопировать',
      });
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleAddVocab = async (id: string) => {
    setVocabBusyId(id);
    setVocabMessage(null);
    try {
      const result = await addZhScenarioVocabToDictionary(id);
      setVocabMessage({
        id,
        text: result.added || result.skipped
          ? `В словарь: добавлено ${result.added}, уже было ${result.skipped}`
          : 'В сценарии нет слов для словаря',
      });
    } catch (err) {
      setVocabMessage({
        id,
        text: err instanceof Error ? err.message : 'Не удалось добавить в словарь',
      });
    } finally {
      setVocabBusyId(null);
    }
  };

  const handleArchive = async (id: string, archive: boolean) => {
    setArchivingId(id);
    try {
      await updateZhScenario(id, { archived: archive });
      await loadList();
    } finally {
      setArchivingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить сценарий без возможности восстановления?')) return;
    setDeletingId(id);
    try {
      await deleteZhScenario(id);
      await loadList();
    } finally {
      setDeletingId(null);
    }
  };

  const renderCard = (s: ZhScenario) => {
    const count = s.completions_count ?? 0;
    const lastAt = s.last_completed_at
      ? new Date(s.last_completed_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
      : null;
    const goal = typeof s.goals?.[0] === 'string' ? s.goals[0] : '';
    const stepsCount = s.steps?.length ?? 0;
    const canMutate = s.source === 'user';

    return (
      <li
        key={s.id}
        style={{
          padding: '0.85rem 1rem',
          borderRadius: 12,
          border: '1px solid var(--sidebar-border)',
          background: 'var(--sidebar-hover)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
              {typeof s.title === 'string' && s.title.trim() ? s.title : 'Без названия'}
            </span>
            {s.hsk_level && (
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: 6, background: 'var(--sidebar-active)' }}>
                HSK {s.hsk_level}
              </span>
            )}
            {s.from_life && (
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: 6, background: 'rgba(79, 168, 134, 0.18)' }}>
                Из жизни
              </span>
            )}
          </div>
          {s.mastered_modes && (s.completions_count ?? 0) > 0 && (
            <div style={{ marginTop: 6 }}>
              <ZhPlayModeDots mastered={s.mastered_modes} compact />
            </div>
          )}
          {(textbookLine(s) || goal) && (
            <div style={{ fontSize: '0.8125rem', opacity: 0.75, marginTop: 4 }}>
              {textbookLine(s) || goal}
              {stepsCount > 0 ? ` · ${stepsCount} шаг.` : ''}
            </div>
          )}
          {(count > 0 || lastAt) && (
            <div style={{ fontSize: '0.75rem', opacity: 0.65, marginTop: 6 }}>
              {count > 0 && <span>Пройден {count} раз</span>}
              {count > 0 && lastAt && ' · '}
              {lastAt && <span>Последний: {lastAt}</span>}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          {!showArchived && (
            <button type="button" onClick={() => handlePlay(s)} style={{ ...btnPrimary, padding: '0.5rem 1rem', fontSize: '0.9375rem' }}>
              Пройти
            </button>
          )}
          {canMutate && (
            <button
              type="button"
              disabled={editingId === s.id}
              onClick={() => handleEdit(s)}
              style={{ ...btnSecondary, padding: '0.5rem 0.75rem', fontSize: '0.8125rem' }}
            >
              {editingId === s.id ? 'Открываем…' : 'Править'}
            </button>
          )}
          <button
            type="button"
            disabled={duplicatingId === s.id}
            onClick={() => handleDuplicate(s.id)}
            style={{ ...btnSecondary, padding: '0.5rem 0.75rem', fontSize: '0.8125rem' }}
          >
            {duplicatingId === s.id ? 'Копируем…' : view === 'catalog' ? 'В мои' : 'Копия'}
          </button>
          <button
            type="button"
            disabled={vocabBusyId === s.id}
            onClick={() => handleAddVocab(s.id)}
            style={{ ...btnSecondary, padding: '0.5rem 0.75rem', fontSize: '0.8125rem' }}
          >
            {vocabBusyId === s.id ? 'Добавляем…' : 'В словарь'}
          </button>
          {canMutate && (
            <>
              <button
                type="button"
                disabled={archivingId === s.id}
                onClick={() => handleArchive(s.id, !showArchived)}
                style={{ ...btnSecondary, padding: '0.5rem 0.75rem', fontSize: '0.8125rem' }}
              >
                {showArchived ? 'Вернуть' : 'В архив'}
              </button>
              <button
                type="button"
                disabled={deletingId === s.id}
                onClick={() => handleDelete(s.id)}
                style={{ ...btnSecondary, padding: '0.5rem 0.75rem', fontSize: '0.8125rem' }}
              >
                Удалить
              </button>
            </>
          )}
        </div>
        {vocabMessage?.id === s.id && (
          <div style={{ flexBasis: '100%', fontSize: '0.8125rem', opacity: 0.75 }}>{vocabMessage.text}</div>
        )}
      </li>
    );
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Китайские сценарии" style={overlayStyle} onClick={briefing || draft ? undefined : onClose}>
      <div
        style={{
          ...panelStyle,
          maxWidth: draft || briefing ? 980 : view === 'catalog' ? 960 : 720,
          overflow: draft ? 'visible' : 'hidden',
          boxShadow: '0 24px 48px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.04)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ flexShrink: 0, padding: '1rem 1.25rem', borderBottom: '1px solid var(--sidebar-border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              display: 'inline-flex',
              padding: 4,
              borderRadius: 14,
              background: 'var(--sidebar-hover)',
              border: '1px solid var(--sidebar-border)',
              marginRight: 'auto',
            }}
          >
            <button
              type="button"
              onClick={() => { setView('catalog'); setBriefing(null); setDraft(null); }}
              style={{
                padding: '0.5rem 0.875rem',
                borderRadius: 10,
                border: 'none',
                background: view === 'catalog' && !briefing && !draft ? 'var(--sidebar-active)' : 'transparent',
                color: 'var(--sidebar-text)',
                fontSize: '0.8125rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Каталог
            </button>
            <button
              type="button"
              onClick={() => { setView('create'); setBriefing(null); setDraft(null); }}
              style={{
                padding: '0.5rem 0.875rem',
                borderRadius: 10,
                border: 'none',
                background: view === 'create' && !briefing && !draft ? 'var(--sidebar-active)' : 'transparent',
                color: 'var(--sidebar-text)',
                fontSize: '0.8125rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Создать
            </button>
            <button
              type="button"
              onClick={() => { setView('my'); setBriefing(null); setDraft(null); }}
              style={{
                padding: '0.5rem 0.875rem',
                borderRadius: 10,
                border: 'none',
                background: view === 'my' && !briefing && !draft ? 'var(--sidebar-active)' : 'transparent',
                color: 'var(--sidebar-text)',
                fontSize: '0.8125rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Мои сценарии
            </button>
          </div>
          {view !== 'catalog' || briefing || draft ? (
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: 'var(--sidebar-text)' }}>
              {briefing ? 'Брифинг' : draft ? 'Конструктор' : view === 'create' ? 'Создать сценарий' : 'Мои сценарии'}
            </h2>
          ) : (
            <div style={{ flex: 1 }} />
          )}
          <button type="button" onClick={onClose} aria-label="Закрыть" style={{ ...btnSecondary, padding: '0.4rem' }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <line x1={18} y1={6} x2={6} y2={18} />
              <line x1={6} y1={6} x2={18} y2={18} />
            </svg>
          </button>
        </div>

        {briefing ? (
          <ZhScenarioBriefing
            key={`${briefing.id}:${initialPlayMode || 'rehearsal'}`}
            scenario={briefing}
            initialPlayMode={initialPlayMode}
            onBack={() => setBriefing(null)}
            onStart={(playable) => {
              onSelectScenario(playable);
              onClose();
            }}
            onAddToDictionary={briefing.vocabulary?.length ? () => handleAddVocab(briefing.id) : undefined}
            vocabBusy={vocabBusyId === briefing.id}
            vocabMessage={vocabMessage?.id === briefing.id ? vocabMessage.text : null}
          />
        ) : draft ? (
          <ZhScenarioConstructor
            draft={draft}
            onChange={setDraft}
            onBack={() => { setDraft(null); setSaveError(null); setVocabMessage(null); }}
            onSave={handleSaveDraft}
            saving={saveLoading}
            saveError={saveError}
            onAddToDictionary={draft.id ? () => handleAddVocab(draft.id) : undefined}
            vocabBusy={Boolean(draft.id && vocabBusyId === draft.id)}
            vocabMessage={vocabMessage?.id === draft.id ? vocabMessage.text : null}
          />
        ) : view === 'create' ? (
          <ZhIntentForm
            defaultHsk={defaultHsk}
            onGenerated={(next) => { setSaveError(null); setDraft(next); }}
            onManualCreate={() => { setSaveError(null); setDraft(emptyManualZhScenario(defaultHsk)); }}
          />
        ) : view === 'catalog' ? (
          <ZhScenarioCatalog
            scenarios={scenarios}
            loading={listLoading}
            searchQuery={searchQuery}
            onSearchQuery={setSearchQuery}
            hskFilter={hskFilter}
            onHskFilter={setHskFilter}
            onSelect={handlePlay}
            onSaveToMine={(s) => handleDuplicate(s.id)}
            savingId={duplicatingId}
            copyMessage={copySuccessMessage}
          />
        ) : (
          <>
            <div style={{ padding: '0.85rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {view === 'my' && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => setShowArchived(false)} style={{ ...btnSecondary, background: !showArchived ? 'var(--sidebar-active)' : 'transparent' }}>
                      Активные
                    </button>
                    <button type="button" onClick={() => setShowArchived(true)} style={{ ...btnSecondary, background: showArchived ? 'var(--sidebar-active)' : 'transparent' }}>
                      Архив
                    </button>
                  </div>
                )}
              <input
                type="search"
                placeholder="Поиск по названию или учебнику…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={inputStyle}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ minWidth: 120 }}>
                  <LevelDropdown value={hskFilter} onChange={setHskFilter} options={HSK_FILTERS} openUpward={false} ariaLabel="Фильтр HSK" />
                </div>
                {view === 'my' && (
                  <>
                    <button type="button" onClick={() => setSortBy('last_used')} style={{ ...btnSecondary, background: sortBy === 'last_used' ? 'var(--sidebar-active)' : 'transparent' }}>
                      По использованию
                    </button>
                    <button type="button" onClick={() => setSortBy('updated')} style={{ ...btnSecondary, background: sortBy === 'updated' ? 'var(--sidebar-active)' : 'transparent' }}>
                      По обновлению
                    </button>
                  </>
                )}
              </div>
            </div>
            <div style={{ padding: '0 1.25rem 1.25rem', overflowY: 'auto', flex: 1 }}>
              {listLoading ? (
                <p style={{ opacity: 0.7 }}>Загрузка…</p>
              ) : filtered.length === 0 ? (
                <p style={{ opacity: 0.75, lineHeight: 1.5 }}>
                  {scenarios.length === 0
                    ? (view === 'catalog'
                      ? 'В каталоге пока нет сценариев.'
                      : showArchived
                        ? 'В архиве пока ничего нет.'
                        : 'У вас пока нет своих сценариев. Создайте через «Создать» или скопируйте из каталога.')
                    : 'По запросу ничего не найдено.'}
                </p>
              ) : (
                <>
                  {recentlyPlayed.length > 0 && (
                    <div style={{ marginBottom: '1rem' }}>
                      <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', fontWeight: 600, opacity: 0.8 }}>Недавно играли</h3>
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {recentlyPlayed.map(renderCard)}
                      </ul>
                    </div>
                  )}
                  {fromLifeList.length > 0 && (
                    <div style={{ marginBottom: '1rem' }}>
                      <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', fontWeight: 600, opacity: 0.8 }}>Моя ситуация</h3>
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {fromLifeList.map(renderCard)}
                      </ul>
                    </div>
                  )}
                  {mainList.length > 0 && (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {mainList.map(renderCard)}
                    </ul>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
