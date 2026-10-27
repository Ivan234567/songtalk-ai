'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { buildAgentAuthHeaders } from '@/lib/agent-request';
import type { LearningLanguage } from '@/lib/learning-language';

export type ChatPracticeSense = {
  senseId: string;
  headword: string;
  glossRu: string;
};

const PRACTICE_LIMIT = 5;

const VERDICT_LABELS: Record<string, string> = {
  produced: 'Ты сказал сам',
  wrong_sense: 'Смысл другой',
  echoed: 'Ты повторил за собеседником',
  hinted: 'Сказал после подсказки',
  mentioned: 'Неясно, то ли слово',
  unused: 'Ты это не сказал',
};

export type PracticeVerdict = { senseId: string; verdict: string; intervalDays?: number | null };

function intervalLabel(days?: number | null): string {
  if (days == null || !Number.isInteger(days) || days <= 0) return '';
  const mod10 = days % 10;
  const mod100 = days % 100;
  const word = mod10 === 1 && mod100 !== 11
    ? 'день'
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? 'дня'
      : 'дней';
  return `снова через ${days} ${word}`;
}

export function PracticeSpeechReport({
  senses,
  results,
  assessable = false,
  assessing = false,
  assessError = null,
  storeWarning = null,
  onAssess,
}: {
  senses: ChatPracticeSense[];
  results?: PracticeVerdict[] | null;
  assessable?: boolean;
  assessing?: boolean;
  assessError?: string | null;
  storeWarning?: string | null;
  onAssess?: () => void;
}) {
  const lines = results || [];
  const showButton = assessable && lines.length === 0 && Boolean(onAssess);
  if (!senses.length || (lines.length === 0 && !showButton && !assessError && !storeWarning)) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left' }}>
      {lines.length > 0 && senses.map((sense) => {
        const result = lines.find((item) => item.senseId === sense.senseId);
        if (!result) return null;
        const when = result.verdict === 'produced' || result.verdict === 'wrong_sense'
          ? intervalLabel(result.intervalDays)
          : '';
        return (
          <p key={result.senseId} style={{ margin: 0, fontSize: '0.75rem', lineHeight: 1.4 }}>
            {sense.headword}: {VERDICT_LABELS[result.verdict] || result.verdict}
            {when ? ` · ${when}` : ''}
          </p>
        );
      })}
      {showButton && (
        <button type="button" className="agent-toolbar-btn" style={{ height: 32 }} disabled={assessing} onClick={onAssess}>
          {assessing ? 'Слушаю…' : 'Проверить, сказал ли я сам'}
        </button>
      )}
      {assessError && <p style={{ margin: 0, fontSize: '0.75rem' }}>{assessError}</p>}
      {storeWarning && <p style={{ margin: 0, fontSize: '0.75rem' }}>{storeWarning}</p>}
    </div>
  );
}

type ChatPracticeWordsProps = {
  apiUrl: string;
  token: string;
  learningLanguage: LearningLanguage;
  senses: ChatPracticeSense[];
  locked: boolean;
  revealed: Record<string, boolean>;
  onConfirm: (senses: ChatPracticeSense[]) => void;
  onClear: () => void;
  onToggleReveal: (senseId: string) => void;
  assessable?: boolean;
  assessing?: boolean;
  assessError?: string | null;
  results?: PracticeVerdict[] | null;
  storeWarning?: string | null;
  usedCount?: number;
  totalCount?: number;
  onAssess?: () => void;
};

export function ChatPracticeWords({
  apiUrl,
  token,
  learningLanguage,
  senses,
  locked,
  revealed,
  onConfirm,
  onClear,
  onToggleReveal,
  assessable = false,
  assessing = false,
  assessError = null,
  results = null,
  storeWarning = null,
  usedCount,
  totalCount,
  onAssess,
}: ChatPracticeWordsProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<ChatPracticeSense[]>([]);
  const [catalogState, setCatalogState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [draft, setDraft] = useState<ChatPracticeSense[]>([]);

  useEffect(() => {
    if (!open) return;
    setDraft(senses);
    setQuery('');
    let cancelled = false;
    setCatalogState('loading');
    fetch(`${apiUrl}/api/vocabulary/srs/senses`, {
      headers: buildAgentAuthHeaders(token, learningLanguage),
    })
      .then(async (resp) => {
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !Array.isArray(data?.items)) throw new Error('catalog');
        if (cancelled) return;
        setCatalog(data.items.flatMap((item: { sense_id?: string; headword?: string; gloss_ru?: string }) => {
          const senseId = typeof item?.sense_id === 'string' ? item.sense_id : '';
          const headword = typeof item?.headword === 'string' ? item.headword.trim() : '';
          const glossRu = typeof item?.gloss_ru === 'string' ? item.gloss_ru.trim() : '';
          return senseId && headword && glossRu ? [{ senseId, headword, glossRu }] : [];
        }));
        setCatalogState('idle');
      })
      .catch(() => {
        if (!cancelled) setCatalogState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [open, apiUrl, token, learningLanguage, senses]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return catalog;
    return catalog.filter((item) => (
      item.headword.toLowerCase().includes(needle) || item.glossRu.toLowerCase().includes(needle)
    ));
  }, [catalog, query]);

  const toggle = (item: ChatPracticeSense) => {
    setDraft((prev) => {
      const exists = prev.some((sense) => sense.senseId === item.senseId);
      if (exists) return prev.filter((sense) => sense.senseId !== item.senseId);
      if (prev.length >= PRACTICE_LIMIT) return prev;
      return [...prev, item];
    });
  };

  return (
    <div style={{ width: 340, maxWidth: '100%', pointerEvents: 'auto' }}>
      <section
        style={{
          borderRadius: 14,
          border: '1px solid var(--sidebar-border)',
          background: 'var(--sidebar-bg)',
          color: 'var(--sidebar-text)',
          padding: '0.75rem 0.875rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: '1rem', fontWeight: 700 }}>Скажи сам</div>
          {locked && senses.length > 0 && (
            <span style={{ fontSize: '0.75rem', fontWeight: 650, opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
              {usedCount ?? 0}/{totalCount ?? senses.length}
            </span>
          )}
        </div>
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', lineHeight: 1.4, opacity: 0.85 }}>
          {locked
            ? (results && results.length > 0
              ? 'Разбор готов — смотри, что засчиталось.'
              : 'Назови эти слова своим голосом. В конце можно проверить.')
            : senses.length > 0
              ? 'Назови эти слова сам. Нажми на слово, если хочешь увидеть перевод.'
              : 'Выбери слова и назови их своим голосом.'}
        </p>
        {senses.length === 0 ? (
          <button type="button" className="agent-toolbar-btn" style={{ marginTop: 10, height: 36 }} onClick={() => setOpen(true)}>
            Выбрать слова
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            {senses.map((sense) => (
              <button
                key={sense.senseId}
                type="button"
                onClick={() => onToggleReveal(sense.senseId)}
                style={{
                  textAlign: 'left',
                  border: '1px solid var(--sidebar-border)',
                  background: 'transparent',
                  color: 'var(--sidebar-text)',
                  borderRadius: 10,
                  padding: '0.4rem 0.6rem',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: '0.875rem', fontWeight: 650 }}>{sense.headword}</span>
                {revealed[sense.senseId] && (
                  <span style={{ display: 'block', marginTop: 2, fontSize: '0.75rem', opacity: 0.75 }}>{sense.glossRu}</span>
                )}
              </button>
            ))}
            <PracticeSpeechReport
              senses={senses}
              results={results}
              assessable={locked && assessable}
              assessing={assessing}
              assessError={assessError}
              storeWarning={storeWarning}
              onAssess={onAssess}
            />
            {!locked && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="agent-toolbar-btn" style={{ height: 32 }} onClick={() => setOpen(true)}>
                  Другие слова
                </button>
                <button type="button" className="agent-toolbar-btn" style={{ height: 32 }} onClick={onClear}>
                  Убрать слова
                </button>
              </div>
            )}
          </div>
        )}
      </section>
      {open && !locked && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 40,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              width: 420,
              maxWidth: '100%',
              maxHeight: '70vh',
              overflow: 'auto',
              borderRadius: 16,
              border: '1px solid var(--sidebar-border)',
              background: 'var(--sidebar-bg)',
              color: 'var(--sidebar-text)',
              padding: '1rem',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Какие слова скажешь?</div>
            <p style={{ margin: '0 0 8px', fontSize: '0.85rem', opacity: 0.8 }}>Можно выбрать до пяти. Потом назови их сам.</p>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Слово или перевод"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                marginBottom: 10,
                borderRadius: 8,
                border: '1px solid var(--sidebar-border)',
                background: 'var(--sidebar-hover)',
                color: 'var(--sidebar-text)',
                padding: '0.45rem 0.6rem',
              }}
            />
            {catalogState === 'loading' && <p style={{ margin: 0, fontSize: '0.8125rem' }}>Собираем слова</p>}
            {catalogState === 'error' && <p style={{ margin: 0, fontSize: '0.8125rem' }}>Не удалось открыть словарь</p>}
            {catalogState === 'idle' && visible.length === 0 && (
              <p style={{ margin: 0, fontSize: '0.8125rem' }}>В словаре пока нет слов с переводом</p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {visible.map((item) => {
                const selected = draft.some((sense) => sense.senseId === item.senseId);
                const disabled = !selected && draft.length >= PRACTICE_LIMIT;
                return (
                  <label key={item.senseId} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', opacity: disabled ? 0.45 : 1 }}>
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={disabled}
                      onChange={() => toggle(item)}
                    />
                    <span>
                      <span style={{ fontWeight: 650 }}>{item.headword}</span>
                      <span style={{ display: 'block', fontSize: '0.75rem', opacity: 0.75 }}>{item.glossRu}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                className="agent-toolbar-btn"
                style={{ height: 32 }}
                disabled={draft.length < 1}
                onClick={() => {
                  onConfirm(draft.slice(0, PRACTICE_LIMIT));
                  setOpen(false);
                }}
              >
                Буду их говорить
              </button>
              <button type="button" className="agent-toolbar-btn" style={{ height: 32 }} onClick={() => setOpen(false)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
