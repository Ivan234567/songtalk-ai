'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CHINESE_FONT,
  getToneColor,
  numberedPinyinToMarks,
  splitChineseWord,
} from '@/lib/chinese-display';
import { containsChinese, extractChineseCharacters } from '@/lib/vocabulary';

type VocabularyCategory = {
  id: string;
  name: string;
  color: string;
  icon: string | null;
};

export type AddedChineseWord = {
  id: string;
  word: string;
  language?: 'en' | 'zh';
  pinyin?: string | null;
  hsk_level?: number | null;
  translations: { translation: string; source?: string }[] | null;
  notes?: string | null;
  categories?: { id: string; name: string; color: string; icon: string | null }[];
  created_at?: string;
  [key: string]: unknown;
};

type AddChineseWordModalProps = {
  open: boolean;
  accessToken: string | null;
  apiUrl: string;
  categories: VocabularyCategory[];
  onClose: () => void;
  onAdded: (word: AddedChineseWord, alreadyExisted: boolean) => void;
};

const HSK_LEVELS = [1, 2, 3, 4, 5, 6] as const;
type AssistField = 'pinyin' | 'translation' | 'hsk_level' | 'notes';
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

export function AddChineseWordModal({
  open,
  accessToken,
  apiUrl,
  categories,
  onClose,
  onAdded,
}: AddChineseWordModalProps) {
  const hanziRef = useRef<HTMLInputElement | null>(null);
  const [hanziInput, setHanziInput] = useState('');
  const [pinyin, setPinyin] = useState('');
  const [translation, setTranslation] = useState('');
  const [hskLevel, setHskLevel] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [aiBusy, setAiBusy] = useState<AiBusy>(null);
  const [aiTouched, setAiTouched] = useState<Set<AssistField>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const hanzi = useMemo(() => extractChineseCharacters(hanziInput), [hanziInput]);
  const displayPinyin = useMemo(() => numberedPinyinToMarks(pinyin), [pinyin]);
  const translations = useMemo(() => splitTranslations(translation), [translation]);
  const previewUnits = useMemo(() => splitChineseWord(hanzi, displayPinyin), [hanzi, displayPinyin]);

  const emptyFields = useMemo(() => {
    const fields: AssistField[] = [];
    if (!pinyin.trim()) fields.push('pinyin');
    if (!translation.trim()) fields.push('translation');
    if (hskLevel == null) fields.push('hsk_level');
    if (!notes.trim()) fields.push('notes');
    return fields;
  }, [pinyin, translation, hskLevel, notes]);

  useEffect(() => {
    if (!open) return;
    setHanziInput('');
    setPinyin('');
    setTranslation('');
    setHskLevel(null);
    setNotes('');
    setSelectedCategoryIds(new Set());
    setSubmitting(false);
    setAiBusy(null);
    setAiTouched(new Set());
    setError(null);
    setSuccess(null);
    const t = window.setTimeout(() => hanziRef.current?.focus(), 40);
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
    hanzi.length > 0 &&
    translations.length > 0 &&
    !formLocked;
  const canAskAi = Boolean(accessToken) && hanzi.length > 0 && !formLocked;

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
    if (!accessToken || !hanzi || fields.length === 0 || formLocked) return;

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
        body: JSON.stringify({ word: hanzi, fields }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) {
        throw new Error(data?.details || data?.error || 'Не удалось получить подсказку ИИ');
      }

      const suggestion = data.suggestion || {};
      const filled: string[] = [];

      if (fields.includes('pinyin') && suggestion.pinyin) {
        setPinyin(numberedPinyinToMarks(String(suggestion.pinyin)));
        markAi('pinyin');
        filled.push('пиньинь');
      }
      if (fields.includes('translation') && Array.isArray(suggestion.translations) && suggestion.translations.length > 0) {
        setTranslation(suggestion.translations.filter(Boolean).join(', '));
        markAi('translation');
        filled.push('перевод');
      }
      if (fields.includes('hsk_level') && [1, 2, 3, 4, 5, 6].includes(Number(suggestion.hsk_level))) {
        setHskLevel(Number(suggestion.hsk_level));
        markAi('hsk_level');
        filled.push('HSK');
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
    if (hanziInput.trim() && !containsChinese(hanziInput)) {
      setError('Нужны иероглифы 汉字, а не латиница');
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
          word: hanzi,
          pinyin: displayPinyin || undefined,
          translations,
          hsk_level: hskLevel,
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

      const added: AddedChineseWord = {
        ...data.word,
        word: data.word.word,
        pinyin: data.word.pinyin || displayPinyin || null,
        hsk_level: data.word.hsk_level ?? hskLevel,
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
      setSuccess(alreadyExisted ? `${hanzi} обновлено в словаре` : `${hanzi} добавлено в словарь`);

      if (keepOpen) {
        setHanziInput('');
        setPinyin('');
        setTranslation('');
        setHskLevel(null);
        setNotes('');
        setSelectedCategoryIds(new Set());
        setAiTouched(new Set());
        window.setTimeout(() => hanziRef.current?.focus(), 40);
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
        aria-labelledby="zh-add-word-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="zh-add-header">
          <div>
            <p className="zh-add-kicker">词典 · вручную или ИИ</p>
            <h3 id="zh-add-word-title">Новое слово</h3>
          </div>
          <button type="button" className="zh-add-close" onClick={onClose} aria-label="Закрыть" disabled={formLocked}>
            ×
          </button>
        </header>

        <div className={`zh-add-preview${hanzi ? '' : ' zh-add-preview--empty'}`}>
          {hanzi ? (
            <>
              <div className="zh-add-preview-word">
                {previewUnits.map((unit) => (
                  <span key={`${unit.index}-${unit.hanzi}`} className="zh-add-preview-unit">
                    {unit.pinyin ? (
                      <span className="zh-add-preview-py" style={{ color: getToneColor(unit.pinyin) }}>
                        {unit.pinyin}
                      </span>
                    ) : (
                      <span className="zh-add-preview-py zh-add-preview-py--placeholder">拼音</span>
                    )}
                    <span className="zh-add-preview-hanzi" style={{ fontFamily: CHINESE_FONT }}>
                      {unit.hanzi}
                    </span>
                  </span>
                ))}
              </div>
              <div className="zh-add-preview-meta">
                {translations.length > 0 ? (
                  <span className="zh-add-preview-gloss">{translations.join(' · ')}</span>
                ) : (
                  <span className="zh-add-preview-hint">Перевод можно вписать или взять у ИИ</span>
                )}
                {hskLevel ? <span className="zh-add-hsk-badge">HSK {hskLevel}</span> : null}
              </div>
            </>
          ) : (
            <div className="zh-add-preview-placeholder">
              <span style={{ fontFamily: CHINESE_FONT }}>汉字</span>
              <p>Сначала иероглифы — остальное вручную или кнопкой ИИ</p>
            </div>
          )}
        </div>

        {hanzi ? (
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
              <span>Иероглифы · 汉字</span>
            </span>
            <input
              ref={hanziRef}
              value={hanziInput}
              onChange={(e) => {
                setHanziInput(e.target.value);
                setError(null);
                setSuccess(null);
                setAiTouched(new Set());
              }}
              placeholder="你好"
              autoComplete="off"
              spellCheck={false}
              className="zh-add-input zh-add-input--hanzi"
              style={{ fontFamily: CHINESE_FONT }}
              maxLength={24}
            />
            {hanziInput && hanzi && hanzi !== hanziInput.trim() && (
              <em className="zh-add-field-hint">Сохраним только {hanzi}</em>
            )}
          </label>

          <div className="zh-add-field">
            <span className="zh-add-field-head">
              <span>Пиньинь</span>
              <AiFieldButton
                busy={aiBusy === 'pinyin'}
                disabled={!canAskAi}
                filledByAi={aiTouched.has('pinyin')}
                label="Подставить пиньинь с ИИ"
                onClick={() => void requestAssist(['pinyin'], 'pinyin')}
              />
            </span>
            <input
              value={pinyin}
              onChange={(e) => {
                setPinyin(e.target.value);
                unmarkAi('pinyin');
              }}
              onBlur={() => setPinyin(numberedPinyinToMarks(pinyin))}
              placeholder="nǐ hǎo или ni3 hao3"
              autoComplete="off"
              spellCheck={false}
              className="zh-add-input"
            />
          </div>

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
              placeholder="привет, здравствуй"
              autoComplete="off"
              className="zh-add-input"
            />
            <em className="zh-add-field-hint">Несколько значений — через запятую</em>
          </div>

          <div className="zh-add-field">
            <span className="zh-add-field-head">
              <span>Уровень HSK</span>
              <AiFieldButton
                busy={aiBusy === 'hsk_level'}
                disabled={!canAskAi}
                filledByAi={aiTouched.has('hsk_level')}
                label="Определить HSK с ИИ"
                onClick={() => void requestAssist(['hsk_level'], 'hsk_level')}
              />
            </span>
            <div className="zh-add-hsk" role="radiogroup" aria-label="Уровень HSK">
              <button
                type="button"
                role="radio"
                aria-checked={hskLevel === null}
                className={`zh-add-hsk-chip${hskLevel === null ? ' zh-add-hsk-chip--active' : ''}`}
                onClick={() => {
                  setHskLevel(null);
                  unmarkAi('hsk_level');
                }}
              >
                —
              </button>
              {HSK_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={hskLevel === level}
                  className={`zh-add-hsk-chip${hskLevel === level ? ' zh-add-hsk-chip--active' : ''}`}
                  onClick={() => {
                    setHskLevel(level);
                    unmarkAi('hsk_level');
                  }}
                >
                  {level}
                </button>
              ))}
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
