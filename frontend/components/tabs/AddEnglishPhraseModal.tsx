'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { containsEnglish } from '@/lib/vocabulary';

type VocabularyCategory = {
  id: string;
  name: string;
  color: string;
  icon: string | null;
};

export type PhraseKind = 'idiom' | 'phrasal-verb';

export type AddedEnglishPhrase = {
  id?: string;
  phrase: string;
  meaning: string;
  literal_translation: string;
  usage_examples: string[];
  categories?: { id: string; name: string; color: string; icon: string | null }[];
  created_at?: string;
  [key: string]: unknown;
};

type AddEnglishPhraseModalProps = {
  open: boolean;
  kind: PhraseKind;
  accessToken: string | null;
  apiUrl: string;
  categories: VocabularyCategory[];
  onClose: () => void;
  onAdded: (phrase: AddedEnglishPhrase, alreadyExisted: boolean) => void;
};

type AssistField = 'meaning' | 'literal_translation' | 'usage_examples';
type AiBusy = AssistField | 'empty' | null;

const COPY: Record<
  PhraseKind,
  {
    kicker: string;
    title: string;
    phraseLabel: string;
    phrasePlaceholder: string;
    meaningPlaceholder: string;
    literalPlaceholder: string;
    submit: string;
    addPath: string;
    categoriesPath: (id: string) => string;
    responseKey: 'idiom' | 'phrasal_verb';
  }
> = {
  idiom: {
    kicker: 'Idiom · смысл, не слова',
    title: 'Новая идиома',
    phraseLabel: 'Идиома',
    phrasePlaceholder: "it's raining cats and dogs",
    meaningPlaceholder: 'льёт как из ведра',
    literalPlaceholder: 'идёт дождь из кошек и собак',
    submit: 'Добавить идиому',
    addPath: '/api/vocabulary/idioms/add',
    categoriesPath: (id) => `/api/vocabulary/idioms/${id}/categories`,
    responseKey: 'idiom',
  },
  'phrasal-verb': {
    kicker: 'Phrasal verb · новый смысл связки',
    title: 'Новый фразовый глагол',
    phraseLabel: 'Фразовый глагол',
    phrasePlaceholder: 'give up',
    meaningPlaceholder: 'сдаваться, бросать',
    literalPlaceholder: 'дать вверх',
    submit: 'Добавить фразовый глагол',
    addPath: '/api/vocabulary/phrasal-verbs/add',
    categoriesPath: (id) => `/api/vocabulary/phrasal-verbs/${id}/categories`,
    responseKey: 'phrasal_verb',
  },
};

function splitExamples(raw: string): string[] {
  return raw
    .split(/\n|;/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
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

export function AddEnglishPhraseModal({
  open,
  kind,
  accessToken,
  apiUrl,
  categories,
  onClose,
  onAdded,
}: AddEnglishPhraseModalProps) {
  const phraseRef = useRef<HTMLInputElement | null>(null);
  const copy = COPY[kind];
  const [phraseInput, setPhraseInput] = useState('');
  const [meaning, setMeaning] = useState('');
  const [literal, setLiteral] = useState('');
  const [examplesRaw, setExamplesRaw] = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [aiBusy, setAiBusy] = useState<AiBusy>(null);
  const [aiTouched, setAiTouched] = useState<Set<AssistField>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const phrase = useMemo(() => phraseInput.trim(), [phraseInput]);
  const examples = useMemo(() => splitExamples(examplesRaw), [examplesRaw]);

  const emptyFields = useMemo(() => {
    const fields: AssistField[] = [];
    if (!meaning.trim()) fields.push('meaning');
    if (!literal.trim()) fields.push('literal_translation');
    if (!examplesRaw.trim()) fields.push('usage_examples');
    return fields;
  }, [meaning, literal, examplesRaw]);

  useEffect(() => {
    if (!open) return;
    setPhraseInput('');
    setMeaning('');
    setLiteral('');
    setExamplesRaw('');
    setSelectedCategoryIds(new Set());
    setSubmitting(false);
    setAiBusy(null);
    setAiTouched(new Set());
    setError(null);
    setSuccess(null);
    const t = window.setTimeout(() => phraseRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open, kind]);

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
  const canSubmit = Boolean(accessToken) && phrase.length > 0 && meaning.trim().length > 0 && !formLocked;
  const canAskAi = Boolean(accessToken) && phrase.length > 0 && !formLocked;

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
    if (!accessToken || !phrase || fields.length === 0 || formLocked) return;
    setAiBusy(mode);
    setError(null);
    setSuccess(null);
    try {
      const resp = await fetch(`${apiUrl}/api/vocabulary/phrases/assist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ phrase, kind, fields }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) {
        throw new Error(data?.details || data?.error || 'Не удалось получить подсказку ИИ');
      }
      const suggestion = data.suggestion || {};
      const filled: string[] = [];
      if (fields.includes('meaning') && suggestion.meaning) {
        setMeaning(String(suggestion.meaning));
        markAi('meaning');
        filled.push('смысл');
      }
      if (fields.includes('literal_translation') && suggestion.literal_translation) {
        setLiteral(String(suggestion.literal_translation));
        markAi('literal_translation');
        filled.push('дословно');
      }
      if (fields.includes('usage_examples') && Array.isArray(suggestion.usage_examples) && suggestion.usage_examples.length > 0) {
        setExamplesRaw(suggestion.usage_examples.filter(Boolean).join('\n'));
        markAi('usage_examples');
        filled.push('примеры');
      }
      if (filled.length === 0) setError('ИИ не вернул данные для выбранных полей');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось получить подсказку ИИ');
    } finally {
      setAiBusy(null);
    }
  };

  const handleSubmit = async (keepOpen: boolean) => {
    if (!accessToken || !canSubmit) return;
    if (phraseInput.trim() && !containsEnglish(phraseInput)) {
      setError('Нужна английская фраза латиницей');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const resp = await fetch(`${apiUrl}${copy.addPath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          phrase,
          meaning: meaning.trim(),
          literal_translation: literal.trim() || undefined,
          usage_examples: examples,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) {
        throw new Error(data?.details || data?.error || 'Не удалось сохранить');
      }
      const saved = data[copy.responseKey] || data.idiom || data.phrasal_verb || {};
      if (typeof saved.phrase !== 'string' || !saved.phrase) {
        saved.phrase = phrase;
      }
      const added: AddedEnglishPhrase = {
        ...saved,
        phrase: saved.phrase || phrase,
        meaning: saved.meaning || meaning.trim(),
        literal_translation: saved.literal_translation || literal.trim(),
        usage_examples: Array.isArray(saved.usage_examples) ? saved.usage_examples : examples,
      };
      const alreadyExisted = Boolean(saved.updated_at && saved.created_at && saved.updated_at !== saved.created_at);

      if (added.id && selectedCategoryIds.size > 0) {
        await fetch(`${apiUrl}${copy.categoriesPath(String(added.id))}`, {
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
      setSuccess(alreadyExisted ? `${added.phrase} обновлено` : `${added.phrase} добавлено`);

      if (keepOpen) {
        setPhraseInput('');
        setMeaning('');
        setLiteral('');
        setExamplesRaw('');
        setSelectedCategoryIds(new Set());
        setAiTouched(new Set());
        window.setTimeout(() => phraseRef.current?.focus(), 40);
      } else {
        onClose();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
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
        aria-labelledby="en-add-phrase-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="zh-add-header">
          <div>
            <p className="zh-add-kicker">{copy.kicker}</p>
            <h3 id="en-add-phrase-title">{copy.title}</h3>
          </div>
          <button type="button" className="zh-add-close" onClick={onClose} aria-label="Закрыть" disabled={formLocked}>
            ×
          </button>
        </header>

        <div className={`zh-add-preview${phrase ? '' : ' zh-add-preview--empty'}`}>
          {phrase ? (
            <>
              <div className="en-detail-word" style={{ fontSize: '1.7rem' }}>{phrase}</div>
              <div className="zh-add-preview-meta">
                {meaning.trim() ? (
                  <span className="zh-add-preview-gloss">{meaning.trim()}</span>
                ) : (
                  <span className="zh-add-preview-hint">Сначала смысл — это и есть перевод</span>
                )}
              </div>
              {literal.trim() ? (
                <div className="en-literal-text" style={{ marginTop: '0.15rem' }}>
                  дословно: {literal.trim()}
                </div>
              ) : null}
            </>
          ) : (
            <div className="zh-add-preview-placeholder">
              <span>{kind === 'idiom' ? 'Idiom' : 'Verb + particle'}</span>
              <p>Сначала фраза, затем смысл. Дословный перевод — чтобы не путать.</p>
            </div>
          )}
        </div>

        {phrase ? (
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
              <span>{copy.phraseLabel}</span>
            </span>
            <input
              ref={phraseRef}
              value={phraseInput}
              onChange={(e) => {
                setPhraseInput(e.target.value);
                setError(null);
                setSuccess(null);
                setAiTouched(new Set());
              }}
              placeholder={copy.phrasePlaceholder}
              autoComplete="off"
              spellCheck={false}
              className="zh-add-input zh-add-input--en"
              maxLength={80}
            />
          </label>

          <div className="zh-add-field">
            <span className="zh-add-field-head">
              <span>Смысл</span>
              <AiFieldButton
                busy={aiBusy === 'meaning'}
                disabled={!canAskAi}
                filledByAi={aiTouched.has('meaning')}
                label="Подставить смысл с ИИ"
                onClick={() => void requestAssist(['meaning'], 'meaning')}
              />
            </span>
            <input
              value={meaning}
              onChange={(e) => {
                setMeaning(e.target.value);
                unmarkAi('meaning');
              }}
              placeholder={copy.meaningPlaceholder}
              autoComplete="off"
              className="zh-add-input"
            />
            <em className="zh-add-field-hint">Это и есть перевод — как понимают носители</em>
          </div>

          <div className="zh-add-field">
            <span className="zh-add-field-head">
              <span>Дословно</span>
              <AiFieldButton
                busy={aiBusy === 'literal_translation'}
                disabled={!canAskAi}
                filledByAi={aiTouched.has('literal_translation')}
                label="Подставить дословный перевод с ИИ"
                onClick={() => void requestAssist(['literal_translation'], 'literal_translation')}
              />
            </span>
            <input
              value={literal}
              onChange={(e) => {
                setLiteral(e.target.value);
                unmarkAi('literal_translation');
              }}
              placeholder={copy.literalPlaceholder}
              autoComplete="off"
              className="zh-add-input"
            />
            <em className="zh-add-field-hint">Не запоминать как перевод — только чтобы видеть ловушку</em>
          </div>

          <div className="zh-add-field">
            <span className="zh-add-field-head">
              <span>Примеры</span>
              <AiFieldButton
                busy={aiBusy === 'usage_examples'}
                disabled={!canAskAi}
                filledByAi={aiTouched.has('usage_examples')}
                label="Придумать примеры с ИИ"
                onClick={() => void requestAssist(['usage_examples'], 'usage_examples')}
              />
            </span>
            <textarea
              value={examplesRaw}
              onChange={(e) => {
                setExamplesRaw(e.target.value);
                unmarkAi('usage_examples');
              }}
              placeholder={'Don’t give up now.\nShe gave up smoking.'}
              className="zh-add-input zh-add-input--notes"
              rows={3}
            />
            <em className="zh-add-field-hint">По одному примеру на строку</em>
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
              {submitting ? 'Сохранение…' : copy.submit}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
