'use client';

import React from 'react';
import styles from './practice-mode-home.module.css';

export type PracticeHomeStage = 'modes' | 'roleplay' | 'debate';
export type PracticeMenuView = 'catalog' | 'create' | 'my';

type PracticeModeHomeProps = {
  stage: PracticeHomeStage;
  showDebate: boolean;
  showCatalog: boolean;
  roleplayTitle: string;
  wordsReady: boolean;
  wordsFromList: boolean;
  onSelectMode: (mode: 'chat' | 'roleplay' | 'debate') => void;
  onSelectView: (view: PracticeMenuView) => void;
  onBack: () => void;
};

type ModeCard = {
  id: 'chat' | 'roleplay' | 'debate';
  title: string;
  text: string;
  tip: string;
};

function wordsTip(base: string, wordsReady: boolean, wordsFromList: boolean): string {
  if (wordsReady) return 'Слова уже выбраны. ИИ поможет сказать их в этом режиме.';
  if (wordsFromList) return 'Список из словаря уже подключён. Возьмите из него до 5 слов.';
  return base;
}

const MODE_ICON = {
  chat: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  roleplay: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  debate: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </svg>
  ),
};

const MENU_ICON = {
  catalog: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  create: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </svg>
  ),
  my: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  ),
};

export function PracticeModeHome({
  stage,
  showDebate,
  showCatalog,
  roleplayTitle,
  wordsReady,
  wordsFromList,
  onSelectMode,
  onSelectView,
  onBack,
}: PracticeModeHomeProps) {
  if (stage === 'roleplay' || stage === 'debate') {
    const isDebate = stage === 'debate';
    const items: Array<{ view: PracticeMenuView; title: string; text: string }> = isDebate
      ? [
          ...(showCatalog ? [{ view: 'catalog' as const, title: 'Каталог дебатов', text: 'Готовые темы, можно сразу в спор' }] : []),
          { view: 'create', title: 'Создать тему', text: 'Своя тема и ваша позиция' },
          { view: 'my', title: 'Мои дебаты', text: 'Темы, которые вы уже сохранили' },
        ]
      : [
          ...(showCatalog ? [{ view: 'catalog' as const, title: 'Каталог сценариев', text: 'Кафе, такси, магазин и другие сцены' }] : []),
          { view: 'create', title: 'Создать сценарий', text: 'Своя ситуация, цель и шаги' },
          { view: 'my', title: 'Мои сценарии', text: 'Сцены, которые вы уже сохранили' },
        ];

    return (
      <section className={styles.home} aria-label={isDebate ? 'Меню дебатов' : 'Меню сценариев'}>
        <div className={styles.stage}>
          <button type="button" className={styles.back} onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
            К режимам
          </button>
          <header className={styles.head}>
            <p className={styles.kicker}>{isDebate ? 'Дебаты' : 'Сценарии'}</p>
            <h2 className={styles.title}>{isDebate ? 'Debate' : roleplayTitle}</h2>
            <p className={styles.lead}>
              {isDebate ? 'Откуда взять тему спора' : 'Откуда взять ситуацию'}
            </p>
          </header>
          <div className={items.length === 2 ? styles.tilesTwo : styles.tiles}>
            {items.map((item) => (
              <button key={item.view} type="button" className={`${styles.tile} ${styles[item.view]}`} onClick={() => onSelectView(item.view)}>
                <span className={styles.glow} aria-hidden />
                <span className={styles.icon}>{MENU_ICON[item.view]}</span>
                <span className={styles.cardTitle}>{item.title}</span>
                <span className={styles.cardText}>{item.text}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const cards: ModeCard[] = [
    {
      id: 'chat',
      title: 'Freestyle Mode',
      text: 'Свободный разговор на любую тему. ИИ поддерживает беседу и помогает формулировать.',
      tip: wordsTip('Возьмите до 5 слов из словаря — ИИ вплетёт их в разговор.', wordsReady, wordsFromList),
    },
    {
      id: 'roleplay',
      title: roleplayTitle,
      text: 'Бытовая ситуация: кафе, такси, магазин. ИИ играет роль собеседника.',
      tip: wordsTip('Возьмите до 5 слов из словаря — они прозвучат в сцене.', wordsReady, wordsFromList),
    },
    ...(showDebate
      ? [{
          id: 'debate' as const,
          title: 'Debate',
          text: 'Спор на заданную тему. ИИ занимает другую сторону и разбирает аргументы.',
          tip: wordsTip('Возьмите до 5 слов из словаря — используйте их в аргументах.', wordsReady, wordsFromList),
        }]
      : []),
  ];

  return (
    <section className={styles.home} aria-label="Выбор режима практики">
      <div className={styles.stage}>
        <header className={styles.head}>
          <p className={styles.kicker}>Практика</p>
          <h2 className={styles.title}>Выберите режим</h2>
          <p className={styles.lead}>Три способа говорить с ИИ. Слова подключаются после выбора.</p>
        </header>
        {(wordsReady || wordsFromList) && (
          <p className={styles.listChip}>
            {wordsReady ? 'Слова из словаря уже выбраны' : 'Список из словаря подключится к выбранному режиму'}
          </p>
        )}
        <div className={showDebate ? styles.grid : styles.gridTwo}>
          {cards.map((card) => (
            <button key={card.id} type="button" className={`${styles.card} ${styles[card.id]}`} onClick={() => onSelectMode(card.id)}>
              <span className={styles.glow} aria-hidden />
              <span className={styles.icon}>{MODE_ICON[card.id]}</span>
              <span className={styles.cardTitle}>{card.title}</span>
              <span className={styles.cardText}>{card.text}</span>
              <span className={styles.tip}>
                <span className={styles.tipKicker}>Перед занятием</span>
                <span className={styles.tipText}>{card.tip}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
