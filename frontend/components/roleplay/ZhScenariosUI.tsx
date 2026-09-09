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
  type ZhSource,
} from '@/lib/zh-scenarios';
import { LevelDropdown } from '@/components/ui/LevelDropdown';
import { ZhScenarioConstructor } from '@/components/roleplay/ZhScenarioConstructor';
import { ZhScenarioBriefing } from '@/components/roleplay/ZhScenarioBriefing';

type ZhScenariosUIProps = {
  onSelectScenario: (scenario: RoleplayScenario) => void;
  onClose: () => void;
  initialView: 'create' | 'my';
  defaultHsk?: ZhHskLevel;
};

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
  return [s.textbook?.title, s.textbook?.lesson_no].filter(Boolean).join(' · ');
}

const HSK_CREATE: { value: ZhHskLevel; label: string }[] = [
  { value: 1, label: 'HSK 1' },
  { value: 2, label: 'HSK 2' },
  { value: 3, label: 'HSK 3' },
  { value: 4, label: 'HSK 4' },
  { value: 5, label: 'HSK 5' },
  { value: 6, label: 'HSK 6' },
];

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = prompt.trim() || (textbook.trim() && (goal.trim() || lesson.trim()));

  const handleGenerate = async () => {
    if (!canSubmit) {
      setError('Опишите ситуацию или укажите учебник и что отрабатывать.');
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
      });
      onGenerated(draftFromGenerateResult(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка генерации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '1rem 1.25rem 1.1rem', overflow: 'visible', flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.4, opacity: 0.85 }}>
        Опишите урок своими словами — ИИ соберёт диалог, шаги и словарь.
      </p>
      <label>
        <span style={labelStyle}>Что хотите отработать</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="Например: HSK 2 урок 8, в магазине одежды — размер, цвет, цена, купить"
          style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
        />
      </label>
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
      <label>
        <span style={labelStyle}>HSK</span>
        <LevelDropdown
          value={String(hsk)}
          onChange={(v) => setHsk(Number(v) as ZhHskLevel)}
          options={HSK_CREATE.map((o) => ({ value: String(o.value), label: o.label }))}
          openUpward={false}
          ariaLabel="Уровень HSK"
        />
      </label>
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

export function ZhScenariosUI({ onSelectScenario, onClose, initialView, defaultHsk = 3 }: ZhScenariosUIProps) {
  const [view, setView] = useState<'create' | 'my'>(initialView === 'create' ? 'create' : 'my');
  const [scenarios, setScenarios] = useState<ZhScenario[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hskFilter, setHskFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState<ZhSource | 'all'>('all');
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

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const list = await listZhScenarios({
        archived: showArchived,
        source: sourceFilter,
        sort: sortBy,
        hsk: hskFilter === 'all' ? undefined : (Number(hskFilter) as ZhHskLevel),
      });
      setScenarios(list);
    } catch {
      setScenarios([]);
    } finally {
      setListLoading(false);
    }
  }, [showArchived, sourceFilter, sortBy, hskFilter]);

  useEffect(() => {
    if (view === 'my') loadList();
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
    const q = searchQuery.trim().toLowerCase();
    if (!q) return scenarios;
    return scenarios.filter((s) => {
      const hay = `${s.title} ${s.textbook?.title || ''} ${s.description || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [scenarios, searchQuery]);

  const recentlyPlayed = useMemo(
    () => filtered.filter((s) => s.last_completed_at && !showArchived).slice(0, 5),
    [filtered, showArchived]
  );
  const mainList = recentlyPlayed.length
    ? filtered.filter((s) => !recentlyPlayed.some((r) => r.id === s.id))
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
    const full = (await getZhScenario(s.id)) ?? s;
    setBriefing(full);
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
      await duplicateZhScenario(id);
      setView('my');
      await loadList();
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
    const goal = s.goals?.[0];
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
            <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{s.title}</span>
            {s.hsk_level && (
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: 6, background: 'var(--sidebar-active)' }}>
                HSK {s.hsk_level}
              </span>
            )}
            {s.source === 'system' && (
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, opacity: 0.65 }}>из приложения</span>
            )}
          </div>
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
            {duplicatingId === s.id ? 'Копируем…' : 'Копия'}
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
      <div style={{ ...panelStyle, maxWidth: draft || briefing ? 980 : 720, overflow: draft ? 'visible' : 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--sidebar-border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: 'var(--sidebar-text)' }}>
            {briefing ? 'Брифинг' : draft ? 'Конструктор' : view === 'create' ? 'Создать сценарий' : 'Мои сценарии'}
          </h2>
          <button type="button" onClick={onClose} aria-label="Закрыть" style={{ ...btnSecondary, padding: '0.4rem' }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <line x1={18} y1={6} x2={6} y2={18} />
              <line x1={6} y1={6} x2={18} y2={18} />
            </svg>
          </button>
        </div>

        {briefing ? (
          <ZhScenarioBriefing
            scenario={briefing}
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
        ) : (
          <>
            <div style={{ padding: '0.85rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setShowArchived(false)} style={{ ...btnSecondary, background: !showArchived ? 'var(--sidebar-active)' : 'transparent' }}>
                  Активные
                </button>
                <button type="button" onClick={() => setShowArchived(true)} style={{ ...btnSecondary, background: showArchived ? 'var(--sidebar-active)' : 'transparent' }}>
                  Архив
                </button>
                <button type="button" onClick={() => setSourceFilter('all')} style={{ ...btnSecondary, background: sourceFilter === 'all' ? 'var(--sidebar-active)' : 'transparent' }}>
                  Все
                </button>
                <button type="button" onClick={() => setSourceFilter('user')} style={{ ...btnSecondary, background: sourceFilter === 'user' ? 'var(--sidebar-active)' : 'transparent' }}>
                  Мои
                </button>
                <button type="button" onClick={() => setSourceFilter('system')} style={{ ...btnSecondary, background: sourceFilter === 'system' ? 'var(--sidebar-active)' : 'transparent' }}>
                  Из приложения
                </button>
              </div>
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
                <button type="button" onClick={() => setSortBy('last_used')} style={{ ...btnSecondary, background: sortBy === 'last_used' ? 'var(--sidebar-active)' : 'transparent' }}>
                  По использованию
                </button>
                <button type="button" onClick={() => setSortBy('updated')} style={{ ...btnSecondary, background: sortBy === 'updated' ? 'var(--sidebar-active)' : 'transparent' }}>
                  По обновлению
                </button>
              </div>
            </div>
            <div style={{ padding: '0 1.25rem 1.25rem', overflowY: 'auto', flex: 1 }}>
              {listLoading ? (
                <p style={{ opacity: 0.7 }}>Загрузка…</p>
              ) : filtered.length === 0 ? (
                <p style={{ opacity: 0.75, lineHeight: 1.5 }}>
                  {scenarios.length === 0
                    ? (showArchived ? 'В архиве пока ничего нет.' : 'Пока нет сценариев. Создайте через «Опишите урок».')
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
