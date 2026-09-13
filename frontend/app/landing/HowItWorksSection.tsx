'use client';

import React from 'react';
import Link from 'next/link';
import styles from './landing.module.css';
import { useLandingPreviewLang } from './preview-lang';

const STEPS = [
  {
    num: 1,
    title: 'Зарегистрируйся',
    text: 'Создай аккаунт за минуту. Сразу получи доступ ко всем фичам — без обязательных подписок.',
  },
  {
    num: 2,
    title: 'Выбери удобный тариф',
    text: 'Несколько вариантов пополнения под разный ритм занятий. Оплачивай только то, что используешь.',
  },
  {
    num: 3,
    title: 'Выбери, что тренировать',
    text: 'Сначала язык — английский или китайский. Дальше собеседник для речи, караоке для лексики из песен, словарь для повторений, аналитика — для прогресса.',
  },
  {
    num: 4,
    title: 'Практикуй и смотри результат',
    text: 'Занимайся в своём темпе. Баллы, рекомендации и тренды покажут, где ты растешь.',
  },
] as const;

export function HowItWorksSection() {
  const { previewLang } = useLandingPreviewLang();
  const isZh = previewLang === 'zh';
  const steps = [
    STEPS[0],
    STEPS[1],
    {
      num: 3,
      title: 'Выбери, что тренировать',
      text: isZh
        ? 'Собеседник со свободным разговором и ситуативным диалогом HSK, голосовая минутка, словарь с пиньинем, аналитика — для прогресса.'
        : 'Собеседник для речи и дебатов, караоке для лексики из песен, словарь с идиомами, аналитика — для прогресса.',
    },
    STEPS[3],
  ];

  return (
    <section id="how-it-works" className={styles.howItWorksSection} aria-labelledby="how-it-works-title">
      <div className={styles.howItWorksInner}>
        <p className={styles.howItWorksLabel}>Путь к результату</p>
        <h2 id="how-it-works-title" className={styles.howItWorksTitle}>
          Как это работает
        </h2>
        <p className={styles.howItWorksSubtitle}>
          {isZh
            ? 'От регистрации до уверенной практики китайского'
            : 'От регистрации и выбора тарифа до уверенной практики'}
        </p>

        <div className={styles.howItWorksSteps}>
          {steps.map((step, i) => (
            <React.Fragment key={step.num}>
              <div className={styles.howItWorksStep}>
                <div className={styles.howItWorksStepNum}>
                  <span className={styles.howItWorksStepNumText}>{step.num}</span>
                </div>
                <h3 className={styles.howItWorksStepTitle}>{step.title}</h3>
                <p className={styles.howItWorksStepText}>{step.text}</p>
              </div>
              {i < steps.length - 1 && (
                <div className={styles.howItWorksConnector} aria-hidden>
                  <span className={styles.howItWorksArrow}>→</span>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>

        <div className={styles.howItWorksCtaWrap}>
          <Link href="/auth/register" className={styles.howItWorksCta}>
            Начать бесплатно
            <span className={styles.howItWorksCtaArrow} aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
