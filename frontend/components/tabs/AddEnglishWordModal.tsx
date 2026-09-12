'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  containsEnglish,
  isCefrLevel,
  normalizeEnglishWord,
  type CefrLevel,
} from '@/lib/vocabulary';

type VocabularyCategory = {
  id: string;
  name: string;
  color: string;
  icon: string | null;
};

export type AddedEnglishWord = {
  id: string;
  word: string;
  language?: 'en' | 'zh';
  translations: { translation: string; source?: string }[] | null;
  difficulty_level?: CefrLevel | null;
  part_of_speech?: string | null;
  notes?: string | null;
  categories?: { id: string; name: string; color: string; icon: string | null }[];
  created_at?: string;
  [key: string]: unknown;
};

type AddEnglishWordModalProps = {
  open: boolean;
  accessToken: string | null;
  apiUrl: string;
  categories: VocabularyCategory[];
  onClose: () => void;
  onAdded: (word: AddedEnglishWord, alreadyExisted: boolean) => void;
};

const CEFR_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const POS_OPTIONS = ['noun', 'verb', 'adjective', 'adverb', 'phrase', 'preposition', 'idiom'] as const;
type AssistField = 'translation' | 'difficulty_level' | 'part_of_speech' | 'notes';
type AiBusy = AssistField | 'empty' | null;

function splitTranslations(raw: string): string[] {
  return raw
    .split(/[,;，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function PlusGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SparkleGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3.2l1.15 4.4L17.6 8.8l-4.45 1.2L12 14.5l-1.15-4.5L6.4 8.8l4.45-1.2L12 3.2z" />
      <path d="M18.4 13.2l.7 2.2 2.2.6-2.2.7-.7 2.2-.7-2.2-2.2-.7 2.2-.6.7-2.2z" opacity="0.85" />
      <path d="M6.3 14.4l.45 1.45 1.45.4-1.45.45-.45 1.45-.45-1.45-1.45-.45 1.45-.4.45-1.45z" opacity="0.7" />
    </svg>
  );
}

function AiFieldButton({
  busy,
  disabled,
  filledByAi,
  onClick,
  label,
}: {
  busy: boolean;
  disabled: boolean;
  filledByAi: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <span className="zh-add-field-tools">
      {filledByAi && !busy ? <em className="zh-add-ai-tag">от ИИ</em> : null}
      <button
        type="button"
        className={`zh-add-ai-btn${busy ? ' zh-add-ai-btn--busy' : ''}`}
        onClick={onClick}
        disabled={disabled}
        title={label}
        aria-label={label}
      >
        <SparkleGlyph />
        {busy ? '…' : 'ИИ'}
      </button>
    </span>
  );
}

export function AddEnglishWordModal({
  open,
  accessToken,
  apiUrl,
  categories,
  onClose,
  onAdded,
}: AddEnglishWordModalProps) {
  const wordRef = useRef<HTMLInputElement | null>(null);
  const [wordInput, setWordInput] = useState('');
  const [translation, setTranslation] = useState('');
  const [cefrLevel, setCefrLevel] = useState<CefrLevel | null>(null);
  const [partOfSpeech, setPartOfSpeech] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [aiBusy, setAiBusy] = useState<AiBusy>(null);
  const [aiTouched, setAiTouched] = useState<Set<AssistField>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const word = useMemo(() => normalizeEnglishWord(wordInput), [wordInput]);
  const translations = useMemo(() => splitTranslations(translation), [translation]);

  const emptyFields = useMemo(() => {
    const fields: AssistField[] = [];
    if (!translation.trim()) fields.push('translation');
    if (cefrLevel == null) fields.push('difficulty_level');
    if (!partOfSpeech) fields.push('part_of_speech');
    if (!notes.trim()) fields.push('notes');
    return fields;
  }, [translation, cefrLevel, partOfSpeech, notes]);

  useEffect(() => {
    if (!open) return;
    setWordInput('');
    setTranslation('');
    setCefrLevel(null);
    setPartOfSpeech(null);
    setNotes('');
    setSelectedCategoryIds(new Set());
    setSubmitting(false);
    setAiBusy(null);
    setAiTouched(new Set());
    setError(null);
    setSuccess(null);
    const t = window.setTimeout(() => wordRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting && !aiBusy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, submitting, aiBusy, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const formLocked = submitting || Boolean(aiBusy);
  const canSubmit =
    Boolean(accessToken) &&
    word.length > 0 &&
    translations.length > 0 &&
    !formLocked;
  const canAskAi = Boolean(accessToken) && word.length > 0 && !formLocked;

  const markAi = (field: AssistField) => {
    setAiTouched((prev) => {
      const next = new Set(prev);
      next.add(field);
      return next;
    });
  };

  const unmarkAi = (field: AssistField) => {
    setAiTouched((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  };

  const toggleCategory = (id: string) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const requestAssist = async (fields: AssistField[], mode: AiBusy) => {
    if (!accessToken || !word || fields.length === 0 || formLocked) return;

    setAiBusy(mode);
    setError(null);
    setSuccess(null);

    try {
      const resp = await fetch(`${apiUrl}/api/vocabulary/assist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ word, fields }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) {
        throw new Error(data?.details || data?.error || 'Не удалось получить подсказку ИИ');
      }

      const suggestion = data.suggestion || {};
      const filled: string[] = [];

      if (fields.includes('translation') && Array.isArray(suggestion.translations) && suggestion.translations.length > 0) {
        setTranslation(suggestion.translations.filter(Boolean).join(', '));
        markAi('translation');
        filled.push('перевод');
      }
      if (fields.includes('difficulty_level') && isCefrLevel(String(suggestion.difficulty_level || ''))) {
        setCefrLevel(suggestion.difficulty_level as CefrLevel);
        markAi('difficulty_level');
        filled.push('CEFR');
      }
      if (fields.includes('part_of_speech') && suggestion.part_of_speech) {
        const pos = String(suggestion.part_of_speech).trim().toLowerCase();
        setPartOfSpeech(pos);
        markAi('part_of_speech');
        filled.push('часть речи');
      }
      if (fields.includes('notes') && suggestion.notes) {
        setNotes(String(suggestion.notes).slice(0, 180));
        markAi('notes');
        filled.push('заметку');
      }

      if (filled.length === 0) {
        setError('ИИ не вернул данные для выбранных полей');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось получить подсказку ИИ');
    } finally {
      setAiBusy(null);
    }
  };

  const handleSubmit = async (keepOpen: boolean) => {
    if (!accessToken || !canSubmit) return;
    if (wordInput.trim() && !containsEnglish(wordInput)) {
      setError('Нужна латиница, а не иероглифы');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const resp = await fetch(`${apiUrl}/api/vocabulary/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          word,
          translations,
          difficulty_level: cefrLevel,
          part_of_speech: partOfSpeech || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) {
        throw new Error(data?.details || data?.error || 'Не удалось добавить слово');
      }
      if (!data.word?.id || typeof data.word.word !== 'string') {
        throw new Error('Сервер не вернул добавленное слово');
      }

      const added: AddedEnglishWord = {
        ...data.word,
        word: data.word.word,
        language: data.word.language || 'en',
        difficulty_level: data.word.difficulty_level ?? cefrLevel ?? null,
        part_of_speech: data.word.part_of_speech ?? partOfSpeech ?? null,
        translations: Array.isArray(data.word.translations) && data.word.translations.length > 0
          ? data.word.translations
          : translations.map((t) => ({ translation: t, source: 'manual' })),
        notes: data.word.notes || notes.trim() || null,
      };
      const alreadyExisted = String(data.message || '').toLowerCase().includes('updated');

      if (added?.id && selectedCategoryIds.size > 0) {
        await fetch(`${apiUrl}/api/vocabulary/words/${added.id}/categories`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ category_ids: Array.from(selectedCategoryIds) }),
        }).catch(() => null);
        added.categories = categories.filter((c) => selectedCategoryIds.has(c.id));
      }

      onAdded(added, alreadyExisted);
      setSuccess(alreadyExisted ? `${added.word} обновлено в словаре` : `${added.word} добавлено в словарь`);

      if (keepOpen) {
        setWordInput('');
        setTranslation('');
        setCefrLevel(null);
        setPartOfSpeech(null);
        setNotes('');
        setSelectedCategoryIds(new Set());
        setAiTouched(new Set());
        window.setTimeout(() => wordRef.current?.focus(), 40);
      } else {
        onClose();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось добавить слово');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="zh-add-overlay"
      onClick={() => {
        if (!formLocked) onClose();
      }}
    >
      <div
        className="zh-add-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="en-add-word-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="zh-add-header">
          <div>
            <p className="zh-add-kicker">Dictionary · вручную или ИИ</p>
            <h3 id="en-add-word-title">Новое слово</h3>
          </div>
          <button type="button" className="zh-add-close" onClick={onClose} aria-label="Закрыть" disabled={formLocked}>
            ×
          </button>
        </header>

        <div className={`zh-add-preview${word ? '' : ' zh-add-preview--empty'}`}>
          {word ? (
            <>
              <div className="zh-add-preview-en">{word}</div>
              <div className="zh-add-preview-meta">
                {translations.length > 0 ? (
                  <span className="zh-add-preview-gloss">{translations.join(' · ')}</span>
                ) : (
                  <span className="zh-add-preview-hint">Перевод можно вписать или взять у ИИ</span>
                )}
                {partOfSpeech ? <span className="zh-add-preview-pos">{partOfSpeech}</span> : null}
                {cefrLevel ? <span className="zh-add-hsk-badge">{cefrLevel}</span> : null}
              </div>
            </>
          ) : (
            <div className="zh-add-preview-placeholder">
              <span>Aa</span>
              <p>Сначала английское слово — остальное вручную или кнопкой ИИ</p>
            </div>
          )}
        </div>

        {word ? (
          <button
            type="button"
            className="zh-add-fill-empty"
            onClick={() => void requestAssist(emptyFields, 'empty')}
            disabled={!canAskAi || emptyFields.length === 0}
          >
            <SparkleGlyph />
            {aiBusy === 'empty'
              ? 'Подбираю пустые поля…'
              : emptyFields.length === 0
                ? 'Все поля заполнены'
                : 'Заполнить пустые с ИИ'}
          </button>
        ) : null}

        <form
          className="zh-add-form"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit(false);
          }}
        >
          <label className="zh-add-field">
            <span className="zh-add-field-head">
              <span>Слово</span>
            </span>
            <input
              ref={wordRef}
              value={wordInput}
              onChange={(e) => {
                setWordInput(e.target.value);
                setError(null);
                setSuccess(null);
                setAiTouched(new Set());
              }}
              placeholder="serendipity"
              autoComplete="off"
              spellCheck={false}
              className="zh-add-input zh-add-input--en"
              maxLength={48}
            />
            {wordInput && word && word !== wordInput.trim() && (
              <em className="zh-add-field-hint">Сохраним как {word}</em>
            )}
          </label>

          <div className="zh-add-field">
            <span className="zh-add-field-head">
              <span>Перевод</span>
              <AiFieldButton
                busy={aiBusy === 'translation'}
                disabled={!canAskAi}
                filledByAi={aiTouched.has('translation')}
                label="Подставить перевод с ИИ"
                onClick={() => void requestAssist(['translation'], 'translation')}
              />
            </span>
            <input
              value={translation}
              onChange={(e) => {
                setTranslation(e.target.value);
                unmarkAi('translation');
              }}
              placeholder="удача, счастливая случайность"
              autoComplete="off"
              className="zh-add-input"
            />
            <em className="zh-add-field-hint">Несколько значений — через запятую</em>
          </div>

          <div className="zh-add-field">
            <span className="zh-add-field-head">
              <span>Уровень CEFR</span>
              <AiFieldButton
                busy={aiBusy === 'difficulty_level'}
                disabled={!canAskAi}
                filledByAi={aiTouched.has('difficulty_level')}
                label="Определить CEFR с ИИ"
                onClick={() => void requestAssist(['difficulty_level'], 'difficulty_level')}
              />
            </span>
            <div className="zh-add-hsk" role="radiogroup" aria-label="Уровень CEFR">
              <button
                type="button"
                role="radio"
                aria-checked={cefrLevel === null}
                className={`zh-add-hsk-chip${cefrLevel === null ? ' zh-add-hsk-chip--active' : ''}`}
                onClick={() => {
                  setCefrLevel(null);
                  unmarkAi('difficulty_level');
                }}
              >
                —
              </button>
              {CEFR_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={cefrLevel === level}
                  className={`zh-add-hsk-chip${cefrLevel === level ? ' zh-add-hsk-chip--active' : ''}`}
                  onClick={() => {
                    setCefrLevel(level);
                    unmarkAi('difficulty_level');
                  }}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div className="zh-add-field">
            <span className="zh-add-field-head">
              <span>Часть речи</span>
              <AiFieldButton
                busy={aiBusy === 'part_of_speech'}
                disabled={!canAskAi}
                filledByAi={aiTouched.has('part_of_speech')}
                label="Определить часть речи с ИИ"
                onClick={() => void requestAssist(['part_of_speech'], 'part_of_speech')}
              />
            </span>
            <div className="zh-add-hsk" role="radiogroup" aria-label="Часть речи">
              <button
                type="button"
                role="radio"
                aria-checked={partOfSpeech === null}
                className={`zh-add-hsk-chip${partOfSpeech === null ? ' zh-add-hsk-chip--active' : ''}`}
                onClick={() => {
                  setPartOfSpeech(null);
                  unmarkAi('part_of_speech');
                }}
              >
                —
              </button>
              {POS_OPTIONS.map((pos) => (
                <button
                  key={pos}
                  type="button"
                  role="radio"
                  aria-checked={partOfSpeech === pos}
                  className={`zh-add-hsk-chip${partOfSpeech === pos ? ' zh-add-hsk-chip--active' : ''}`}
                  onClick={() => {
                    setPartOfSpeech(pos);
                    unmarkAi('part_of_speech');
                  }}
                >
                  {pos}
                </button>
              ))}
              {partOfSpeech && !POS_OPTIONS.includes(partOfSpeech as (typeof POS_OPTIONS)[number]) ? (
                <button
                  type="button"
                  role="radio"
                  aria-checked
                  className="zh-add-hsk-chip zh-add-hsk-chip--active"
                >
                  {partOfSpeech}
                </button>
              ) : null}
            </div>
          </div>

          {categories.length > 0 && (
            <div className="zh-add-field">
              <span className="zh-add-field-head">
                <span>Категория</span>
              </span>
              <div className="zh-add-cats">
                {categories.map((cat) => {
                  const active = selectedCategoryIds.has(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={`zh-add-cat${active ? ' zh-add-cat--active' : ''}`}
                      style={{ '--cat-color': cat.color } as React.CSSProperties}
                      onClick={() => toggleCategory(cat.id)}
                    >
                      {cat.icon ? <span>{cat.icon}</span> : null}
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="zh-add-field">
            <span className="zh-add-field-head">
              <span>Заметка</span>
              <AiFieldButton
                busy={aiBusy === 'notes'}
                disabled={!canAskAi}
                filledByAi={aiTouched.has('notes')}
                label="Придумать мнемонику с ИИ"
                onClick={() => void requestAssist(['notes'], 'notes')}
              />
            </span>
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                unmarkAi('notes');
              }}
              placeholder="мнемоника или короткий комментарий"
              className="zh-add-input zh-add-input--notes"
              maxLength={180}
              rows={2}
            />
          </div>

          {error && <div className="zh-add-alert zh-add-alert--error">{error}</div>}
          {success && <div className="zh-add-alert zh-add-alert--ok">{success}</div>}

          <div className="zh-add-actions">
            <button
              type="button"
              className="zh-add-btn zh-add-btn--ghost"
              onClick={() => void handleSubmit(true)}
              disabled={!canSubmit}
            >
              <PlusGlyph />
              Ещё одно
            </button>
            <button type="submit" className="zh-add-btn zh-add-btn--primary" disabled={!canSubmit}>
              {submitting ? 'Сохранение…' : 'Добавить в словарь'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
