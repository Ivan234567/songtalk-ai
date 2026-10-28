'use client';

import React from 'react';
import type { LearningLanguage } from '@/lib/learning-language';
import { PRACTICE_WORDS_LIMIT, type ChatPracticeSense } from './ChatPracticeWords';
import { PracticeWordListPicker } from './PracticeWordListPicker';
import type { PracticeListContext } from '@/lib/practice-list-context';
import styles from './practice-words-in-sheet.module.css';

export type PracticeWordsSession = {
  apiUrl: string;
  token: string;
  learningLanguage: LearningLanguage;
  senses: ChatPracticeSense[];
  onSensesChange: (next: ChatPracticeSense[]) => void;
  listId?: string | null;
  onListIdChange?: (listId: string | null) => void;
};

type PracticeWordsInSheetProps = PracticeWordsSession & {
  listContext: PracticeListContext | null;
  /** scene — есть конкретный модуль; browse — только списки */
  toolsMode?: 'browse' | 'scene';
  title?: string;
  subtitle?: string;
};

export function PracticeWordsInSheet({
  apiUrl,
  token,
  learningLanguage,
  senses,
  onSensesChange,
  listId = null,
  onListIdChange,
  listContext,
  toolsMode = 'scene',
  title = 'Слова в эту попытку',
  subtitle = 'До 5 слов из словаря. Можно без слов — сразу к диалогу.',
}: PracticeWordsInSheetProps) {
  return (
    <section className={styles.section} aria-label={title}>
      <div className={styles.head}>
        <div>
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
        <span className={styles.count}>
          {senses.length}/{PRACTICE_WORDS_LIMIT}
        </span>
      </div>
      <div className={styles.body}>
        <PracticeWordListPicker
          apiUrl={apiUrl}
          token={token}
          learningLanguage={learningLanguage}
          selected={senses}
          onChange={onSensesChange}
          limit={PRACTICE_WORDS_LIMIT}
          listContext={listContext}
          preferredListId={listId}
          toolsMode={toolsMode}
          onActiveListChange={(list) => onListIdChange?.(list?.id || null)}
        />
      </div>
    </section>
  );
}
