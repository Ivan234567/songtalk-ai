'use client';

import React, { useState } from 'react';
import type { LearningLanguage } from '@/lib/learning-language';
import { PRACTICE_WORDS_LIMIT, type ChatPracticeSense } from './ChatPracticeWords';
import { PracticeWordListPicker } from './PracticeWordListPicker';
import {
  buildModePracticeContext,
  type PracticeListContext,
} from '@/lib/practice-list-context';
import styles from './practice-words-gate.module.css';

export { PRACTICE_WORDS_LIMIT };

type GateMode = 'roleplay' | 'debate' | 'chat';
export type WordsGatePhase = 'preselect' | 'bound';

type PracticeWordsGateProps = {
  apiUrl: string;
  token: string;
  learningLanguage: LearningLanguage;
  mode: GateMode;
  /** preselect — до сцены/темы; bound — после конкретного модуля */
  phase?: WordsGatePhase;
  initialSenses?: ChatPracticeSense[];
  listContext?: PracticeListContext | null;
  preferredListId?: string | null;
  onContinue: (senses: ChatPracticeSense[], meta?: { listId?: string | null }) => void;
  onSkip: () => void;
  onClose?: () => void;
};

type GateCopy = { eyebrow: string; title: string; subtitle: string; continueLabel: string };

const PRESELECT_COPY: Record<GateMode, GateCopy> = {
  roleplay: {
    eyebrow: 'Перед сценой',
    title: 'Возьми слова в сцену',
    subtitle: 'Выбери до 5 слов из словаря. Точный подбор под сцену — после выбора сценария. Можно без слов.',
    continueLabel: 'Дальше к сценариям',
  },
  debate: {
    eyebrow: 'Перед дебатом',
    title: 'Возьми слова в спор',
    subtitle: 'Выбери до 5 слов из словаря. Подбор под тему — после выбора дебата. Можно без слов.',
    continueLabel: 'Дальше к темам',
  },
  chat: {
    eyebrow: 'Свободный разговор',
    title: 'Слова для этого разговора',
    subtitle: 'Список → до 5 слов. ИИ поможет сказать их в разговоре.',
    continueLabel: 'Готово',
  },
};

const BOUND_COPY: Record<GateMode, GateCopy> = {
  roleplay: {
    eyebrow: 'Сцена выбрана',
    title: 'Слова для этой сцены',
    subtitle: 'Можно пересобрать пятёрку под сцену, собрать список ИИ или оставить как есть.',
    continueLabel: 'В сцену',
  },
  debate: {
    eyebrow: 'Тема выбрана',
    title: 'Слова для этого дебата',
    subtitle: 'Можно пересобрать пятёрку под тему, собрать список ИИ или оставить как есть.',
    continueLabel: 'В дебат',
  },
  chat: {
    eyebrow: 'Свободный разговор',
    title: 'Слова для этого разговора',
    subtitle: 'Список → до 5 слов. ИИ поможет сказать их в разговоре.',
    continueLabel: 'Готово',
  },
};

export function PracticeWordsGate({
  apiUrl,
  token,
  learningLanguage,
  mode,
  phase = 'bound',
  initialSenses = [],
  listContext = null,
  preferredListId = null,
  onContinue,
  onSkip,
  onClose,
}: PracticeWordsGateProps) {
  const isPreselect = phase === 'preselect';
  const copy = isPreselect ? PRESELECT_COPY[mode] : BOUND_COPY[mode];
  const [draft, setDraft] = useState<ChatPracticeSense[]>(initialSenses);
  const [activeListId, setActiveListId] = useState<string | null>(preferredListId);
  const baseContext = listContext || buildModePracticeContext(mode);
  // До сцены не кормим AI/fit фейковым binding — оставляем только мягкий ranking по тексту.
  const effectiveContext: PracticeListContext = isPreselect
    ? { ...baseContext, binding: null }
    : baseContext;
  const bindingLabel = !isPreselect ? effectiveContext.binding?.label : null;
  const toolsMode = isPreselect ? 'browse' : 'scene';
  const canContinueEmpty = !isPreselect || mode === 'chat';

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
          <p className={styles.subtitle}>
            {bindingLabel
              ? `${copy.subtitle} Сейчас: «${bindingLabel}».`
              : copy.subtitle}
          </p>
        </div>

        <div className={styles.body}>
          <PracticeWordListPicker
            apiUrl={apiUrl}
            token={token}
            learningLanguage={learningLanguage}
            selected={draft}
            onChange={setDraft}
            limit={PRACTICE_WORDS_LIMIT}
            listContext={effectiveContext}
            preferredListId={preferredListId}
            toolsMode={toolsMode}
            onActiveListChange={(list) => setActiveListId(list?.id || null)}
          />
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.secondary} onClick={onSkip}>
            Без слов
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={!canContinueEmpty && draft.length < 1}
            onClick={() => onContinue(draft.slice(0, PRACTICE_WORDS_LIMIT), { listId: activeListId })}
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
