'use client';

import React, { useState } from 'react';
import styles from './landing.module.css';
import { useLandingPreviewLang } from './preview-lang';

const FAQ_ITEMS = [
  {
    id: 'what-is',
    question: 'Что такое Speakeasy?',
    answer: 'Это платформа для практики английского и китайского: ты говоришь или печатаешь с ИИ-собеседником, учишь слова из песен через караоке по YouTube, ведёшь словарь с озвучкой и смотришь прогресс в аналитике. Всё в одном месте — речь, лексика и понимание, что уже получается.',
  },
  {
    id: 'languages',
    question: 'Какие языки можно учить?',
    answer: 'Английский и китайский. Для английского — сценарии, дебаты и словарь с идиомами и фразовыми глаголами. Для китайского — сценарии HSK, голосовые задания, пиньинь и иероглифы. Язык обучения выбирается в аккаунте. Переключатель English / 中文 на этой странице только показывает, как выглядит каждый режим.',
  },
  {
    id: 'how-start',
    question: 'Как начать заниматься?',
    answer: 'Зарегистрируйся, пополни баланс (от 300 ₽) — подписки нет. Дальше выбирай: диалоги с агентом для речи, караоке для лексики из песен, словарь для повторений, аналитика — чтобы видеть прогресс. Баланс один на все разделы.',
  },
  {
    id: 'payment',
    question: 'Как устроена оплата?',
    answer: 'Ты вносишь деньги на баланс. Каждое действие (разговор с агентом, озвучка слова, распознавание речи) списывает с баланса небольшую сумму. Никакого автоматического списания по подписке — платишь только за то, что реально потратил.',
  },
  {
    id: 'how-much',
    question: 'Сколько хватает пополнения?',
    answer: 'За 300 ₽ — примерно до 2 часов разговора с агентом или до 800 озвучек. За 500 ₽ — около 3,5 часов практики, за 1 000 ₽ — примерно 7 часов. Часто по факту выходит чуть больше.',
  },
  {
    id: 'balance-zero',
    question: 'Что если баланс закончился?',
    answer: 'Платёжные функции отключатся до пополнения. Аккаунт не блокируется, прогресс и история сохраняются — просто пополни баланс, когда захочешь продолжить.',
  },
];

export function FaqSection() {
  const { previewLang } = useLandingPreviewLang();
  const isZh = previewLang === 'zh';
  const items = [
    {
      id: 'what-is',
      question: 'Что такое Speakeasy?',
      answer: isZh
        ? 'Это платформа для практики китайского: ты говоришь или печатаешь с ИИ-собеседником в сценариях HSK, делаешь голосовые задания, учишь слова из песен через караоке, ведёшь словарь с пиньинем и смотришь прогресс. Английский тоже есть — переключи превью наверху.'
        : 'Это платформа для практики английского: ты говоришь или печатаешь с ИИ-собеседником, тренируешь сценарии и дебаты, учишь слова из песен через караоке, ведёшь словарь с идиомами и смотришь прогресс. Китайский тоже есть — переключи превью наверху.',
    },
    FAQ_ITEMS[1],
    {
      id: 'how-start',
      question: 'Как начать заниматься?',
      answer: isZh
        ? 'Зарегистрируйся, пополни баланс (от 300 ₽) — подписки нет. Дальше выбирай китайский в аккаунте: диалоги и сценарии HSK, голосовые задания, караоке, словарь, аналитика. Баланс один на все разделы.'
        : FAQ_ITEMS[2].answer,
    },
    FAQ_ITEMS[3],
    FAQ_ITEMS[4],
    FAQ_ITEMS[5],
  ];
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);

  return (
    <section id="faq" className={styles.faqSection} aria-labelledby="faq-title">
      <div className={styles.faqInner}>
        <p className={styles.faqLabel}>Вопросы и ответы</p>
        <h2 id="faq-title" className={styles.faqTitle}>
          Как всё устроено
        </h2>

        <ul className={styles.faqList} role="list">
          {items.map((item) => (
            <li key={item.id} className={styles.faqItem}>
              <button
                type="button"
                className={styles.faqQuestion}
                onClick={() => setOpenId((prev) => (prev === item.id ? null : item.id))}
                aria-expanded={openId === item.id}
                aria-controls={`faq-answer-${item.id}`}
                id={`faq-question-${item.id}`}
              >
                <span>{item.question}</span>
                <span className={styles.faqChevron} aria-hidden>
                  {openId === item.id ? '−' : '+'}
                </span>
              </button>
              <div
                id={`faq-answer-${item.id}`}
                role="region"
                aria-labelledby={`faq-question-${item.id}`}
                className={`${styles.faqAnswerWrap} ${openId === item.id ? styles.faqAnswerWrapOpen : ''}`}
              >
                <p className={styles.faqAnswer}>{item.answer}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
