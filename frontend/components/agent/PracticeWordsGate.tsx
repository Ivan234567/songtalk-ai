'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { buildAgentAuthHeaders } from '@/lib/agent-request';
import type { LearningLanguage } from '@/lib/learning-language';
import type { ChatPracticeSense } from './ChatPracticeWords';
import styles from './practice-words-gate.module.css';

export const PRACTICE_WORDS_LIMIT = 5;

type GateMode = 'roleplay' | 'debate' | 'chat';

type PracticeWordsGateProps = {
  apiUrl: string;
  token: string;
  learningLanguage: LearningLanguage;
  mode: GateMode;
  initialSenses?: ChatPracticeSense[];
  onContinue: (senses: ChatPracticeSense[]) => void;
  onSkip: () => void;
  onClose?: () => void;
};

const COPY: Record<GateMode, { eyebrow: string; title: string; subtitle: string; continueLabel: string }> = {
  roleplay: {
    eyebrow: 'Перед сценой',
    title: 'Возьми слова в сцену',
    subtitle: 'До 5 значений из словаря. ИИ поможет сказать их по делу — без зубрёжки. Можно пройти без слов.',
    continueLabel: 'Дальше к сценариям',
  },
  debate: {
    eyebrow: 'Перед дебатом',
    title: 'Возьми слова в спор',
    subtitle: 'До 5 слов как боезапас для аргументов. Используй их уместно. Можно начать без слов.',
    continueLabel: 'Дальше к темам',
  },
  chat: {
    eyebrow: 'Свободный разговор',
    title: 'Слова для этого разговора',
    subtitle: 'Выбери до 5 значений. ИИ создаст ситуации, где их естественно сказать.',
    continueLabel: 'Готово',
  },
};

export function PracticeWordsGate({
  apiUrl,
  token,
  learningLanguage,
  mode,
  initialSenses = [],
  onContinue,
  onSkip,
  onClose,
}: PracticeWordsGateProps) {
  const copy = COPY[mode];
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<ChatPracticeSense[]>([]);
  const [catalogState, setCatalogState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [draft, setDraft] = useState<ChatPracticeSense[]>(initialSenses);

  useEffect(() => {
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
  }, [apiUrl, token, learningLanguage]);

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
      if (prev.length >= PRACTICE_WORDS_LIMIT) return prev;
      return [...prev, item];
    });
  };

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose || onSkip}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.hero}>
          {(onClose || onSkip) && (
            <button type="button" className={styles.close} onClick={onClose || onSkip} aria-label="Закрыть">
              ×
            </button>
          )}
          <div className={styles.eyebrow}>{copy.eyebrow}</div>
          <h2 className={styles.title}>{copy.title}</h2>
          <p className={styles.subtitle}>{copy.subtitle}</p>
        </div>

        <div className={styles.body}>
          {draft.length > 0 && (
            <div className={styles.selectedStrip}>
              {draft.map((sense) => (
                <span key={sense.senseId} className={styles.chip}>
                  {sense.headword}
                  <button
                    type="button"
                    className={styles.chipRemove}
                    aria-label={`Убрать ${sense.headword}`}
                    onClick={() => toggle(sense)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className={styles.counter}>
            <span>Выбрано</span>
            <span className={styles.counterStrong}>{draft.length} из {PRACTICE_WORDS_LIMIT}</span>
          </div>

          <input
            className={styles.search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск: слово или перевод"
            autoFocus
          />

          {catalogState === 'loading' && <p className={styles.muted}>Загружаем словарь…</p>}
          {catalogState === 'error' && <p className={styles.error}>Не удалось открыть словарь</p>}
          {catalogState === 'idle' && visible.length === 0 && (
            <p className={styles.muted}>В словаре пока нет слов с переводом</p>
          )}

          <div className={styles.list}>
            {visible.map((item) => {
              const selected = draft.some((sense) => sense.senseId === item.senseId);
              const disabled = !selected && draft.length >= PRACTICE_WORDS_LIMIT;
              return (
                <button
                  key={item.senseId}
                  type="button"
                  className={`${styles.row} ${selected ? styles.rowSelected : ''}`}
                  disabled={disabled}
                  onClick={() => toggle(item)}
                >
                  <span className={styles.check}>{selected ? '✓' : ''}</span>
                  <span>
                    <span className={styles.headword}>{item.headword}</span>
                    <span className={styles.gloss}>{item.glossRu}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.secondary} onClick={onSkip}>
            Без слов
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={draft.length < 1}
            onClick={() => onContinue(draft.slice(0, PRACTICE_WORDS_LIMIT))}
          >
            {copy.continueLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

type ChatWordsInviteProps = {
  onChoose: () => void;
  onDismiss: () => void;
};

export function ChatWordsInviteStrip({ onChoose, onDismiss }: ChatWordsInviteProps) {
  return (
    <div className={styles.strip}>
      <div className={styles.stripTop}>
        <div>
          <p className={styles.stripTitle}>Хочешь потренировать слова?</p>
          <p className={styles.stripText}>Возьми до 5 значений — ИИ поможет сказать их в разговоре.</p>
        </div>
      </div>
      <div className={styles.stripActions}>
        <button type="button" className={styles.stripPrimary} onClick={onChoose}>
          Выбрать слова
        </button>
        <button type="button" className={styles.stripGhost} onClick={onDismiss}>
          Скрыть
        </button>
      </div>
    </div>
  );
}

type SoftAskProps = {
  onChoose: () => void;
  onSkip: () => void;
};

export function ChatWordsSoftAsk({ onChoose, onSkip }: SoftAskProps) {
  return (
    <div className={styles.backdrop} role="presentation" onClick={onSkip}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Взять слова в разговор"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(420px, 100%)' }}
      >
        <div className={styles.hero}>
          <div className={styles.eyebrow}>Перед разговором</div>
          <h2 className={styles.title}>Взять слова с собой?</h2>
          <p className={styles.subtitle}>
            Можно выбрать до 5 слов из словаря — или сразу говорить без них.
          </p>
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.secondary} onClick={onSkip}>
            Говорить без слов
          </button>
          <button type="button" className={styles.primary} onClick={onChoose}>
            Выбрать слова
          </button>
        </div>
      </div>
    </div>
  );
}
