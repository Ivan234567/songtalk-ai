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
    text: 'Пакеты 300, 500 и 1 000 ₽ зачисляются на баланс после оплаты через ЮKassa. Комиссия сервиса добавляется к оплате и минимальна при СБП.',
  },
  {
    num: 3,
    title: 'Выбери, что тренировать',
    text: 'До пяти слов, которым пора. Дальше сцена: собеседник создаёт ситуацию и сам слово не подсказывает.',
  },
  {
    num: 4,
    title: 'Практикуй и смотри результат',
    text: 'В прогрессе видно, когда сказать слово снова. Баллы сцены считаются отдельно.',
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
        ? 'До пяти слов, которым пора. Дальше ситуативный диалог HSK: собеседник создаёт ситуацию и сам иероглиф не пишет.'
        : 'До пяти слов, которым пора. Дальше сценарий или дебат: собеседник создаёт ситуацию и сам слово не говорит.',
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
