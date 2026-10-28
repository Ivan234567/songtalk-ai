'use client';

import React, { useState } from 'react';
import type { LearningLanguage } from '@/lib/learning-language';
import { PracticeWordListPicker } from './PracticeWordListPicker';
import { PracticeWordsProgress, type PracticeProgressItem } from './PracticeWordsProgress';
import styles from './chat-practice-words.module.css';

export type ChatPracticeSense = {
  senseId: string;
  headword: string;
  glossRu: string;
};

export type PracticeVerdict = { senseId: string; verdict: string; intervalDays?: number | null };

export const PRACTICE_WORDS_LIMIT = 5;
const PRACTICE_LIMIT = PRACTICE_WORDS_LIMIT;

/** @deprecated оставлен для совместимости импортов; разбор только в настройках */
export function PracticeSpeechReport() {
  return null;
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
  progressItems?: PracticeProgressItem[] | null;
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
  progressItems = null,
  usedCount,
  totalCount,
  onAssess,
}: ChatPracticeWordsProps) {
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<ChatPracticeSense[]>(senses);

  const openPicker = () => {
    setDraft(senses);
    setPicking(true);
  };

  return (
    <section className={styles.wrap} aria-label="Скажи сам">
      {senses.length > 0 ? (
        <PracticeWordsProgress
          senses={senses}
          items={progressItems}
          results={results}
          usedCount={usedCount}
          totalCount={totalCount}
          locked={locked}
          revealed={revealed}
          onToggleReveal={onToggleReveal}
          assessable={locked && assessable}
          assessing={assessing}
          assessError={assessError}
          storeWarning={storeWarning}
          onAssess={onAssess}
        />
      ) : (
        <div className={styles.empty}>
          <div className={styles.emptyHead}>
            <span className={styles.eyebrow}>Скажи сам</span>
          </div>
          <p className={styles.emptyText}>
            Выбери до 5 слов из списков словаря — ИИ поможет сказать их в разговоре.
          </p>
        </div>
      )}

      {!locked && (
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={openPicker}>
            {senses.length > 0 ? 'Изменить слова' : 'Выбрать из словаря'}
          </button>
          {senses.length > 0 && (
            <button type="button" className={styles.ghost} onClick={onClear}>
              Убрать
            </button>
          )}
        </div>
      )}

      {picking && !locked && (
        <div className={styles.backdrop} role="presentation" onClick={() => setPicking(false)}>
          <div
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-label="Выбор слов"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.sheetHead}>
              <div>
                <p className={styles.sheetEyebrow}>Словарь</p>
                <h3 className={styles.sheetTitle}>Какие слова скажешь?</h3>
              </div>
              <button type="button" className={styles.close} onClick={() => setPicking(false)} aria-label="Закрыть">
                ×
              </button>
            </div>
            <div className={styles.sheetBody}>
              <PracticeWordListPicker
                apiUrl={apiUrl}
                token={token}
                learningLanguage={learningLanguage}
                selected={draft}
                onChange={setDraft}
                limit={PRACTICE_LIMIT}
              />
            </div>
            <div className={styles.sheetFooter}>
              <button type="button" className={styles.ghost} onClick={() => setPicking(false)}>
                Отмена
              </button>
              <button
                type="button"
                className={styles.primary}
                disabled={draft.length < 1}
                onClick={() => {
                  onConfirm(draft.slice(0, PRACTICE_LIMIT));
                  setPicking(false);
                }}
              >
                Буду их говорить
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
