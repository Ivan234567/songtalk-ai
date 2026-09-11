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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const hanzi = useMemo(() => extractChineseCharacters(hanziInput), [hanziInput]);
  const displayPinyin = useMemo(() => numberedPinyinToMarks(pinyin), [pinyin]);
  const translations = useMemo(() => splitTranslations(translation), [translation]);
  const previewUnits = useMemo(() => splitChineseWord(hanzi, displayPinyin), [hanzi, displayPinyin]);

  useEffect(() => {
    if (!open) return;
    setHanziInput('');
    setPinyin('');
    setTranslation('');
    setHskLevel(null);
    setNotes('');
    setSelectedCategoryIds(new Set());
    setSubmitting(false);
    setError(null);
    setSuccess(null);
    const t = window.setTimeout(() => hanziRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const canSubmit =
    Boolean(accessToken) &&
    hanzi.length > 0 &&
    translations.length > 0 &&
    !submitting;

  const toggleCategory = (id: string) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
        if (!submitting) onClose();
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
            <p className="zh-add-kicker">词典 · вручную</p>
            <h3 id="zh-add-word-title">Новое слово</h3>
          </div>
          <button type="button" className="zh-add-close" onClick={onClose} aria-label="Закрыть">
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
                  <span className="zh-add-preview-hint">Добавьте перевод на русский</span>
                )}
                {hskLevel ? <span className="zh-add-hsk-badge">HSK {hskLevel}</span> : null}
              </div>
            </>
          ) : (
            <div className="zh-add-preview-placeholder">
              <span style={{ fontFamily: CHINESE_FONT }}>汉字</span>
              <p>Введите иероглифы — карточка соберётся сама</p>
            </div>
          )}
        </div>

        <form
          className="zh-add-form"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit(false);
          }}
        >
          <label className="zh-add-field">
            <span>Иероглифы · 汉字</span>
            <input
              ref={hanziRef}
              value={hanziInput}
              onChange={(e) => {
                setHanziInput(e.target.value);
                setError(null);
                setSuccess(null);
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

          <label className="zh-add-field">
            <span>Пиньинь</span>
            <input
              value={pinyin}
              onChange={(e) => setPinyin(e.target.value)}
              onBlur={() => setPinyin(numberedPinyinToMarks(pinyin))}
              placeholder="nǐ hǎo или ni3 hao3"
              autoComplete="off"
              spellCheck={false}
              className="zh-add-input"
            />
          </label>

          <label className="zh-add-field">
            <span>Перевод</span>
            <input
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              placeholder="привет, здравствуй"
              autoComplete="off"
              className="zh-add-input"
            />
            <em className="zh-add-field-hint">Несколько значений — через запятую</em>
          </label>

          <div className="zh-add-field">
            <span>Уровень HSK</span>
            <div className="zh-add-hsk" role="radiogroup" aria-label="Уровень HSK">
              <button
                type="button"
                role="radio"
                aria-checked={hskLevel === null}
                className={`zh-add-hsk-chip${hskLevel === null ? ' zh-add-hsk-chip--active' : ''}`}
                onClick={() => setHskLevel(null)}
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
                  onClick={() => setHskLevel(level)}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {categories.length > 0 && (
            <div className="zh-add-field">
              <span>Категория</span>
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

          <label className="zh-add-field">
            <span>Заметка</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="мнемоника или короткий комментарий"
              className="zh-add-input"
              maxLength={160}
            />
          </label>

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
