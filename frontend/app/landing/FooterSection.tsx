'use client';

import React from 'react';
import Link from 'next/link';
import styles from './landing.module.css';

const LINKS_ABOUT = [
  { href: '#hero', label: 'Главная' },
  { href: '#problem', label: 'Возможности' },
  { href: '#how-it-works', label: 'Как это работает' },
  { href: '#benefits', label: 'Выгоды' },
];

const LINKS_ACTION = [
  { href: '#reviews', label: 'Отзывы' },
  { href: '#pricing', label: 'Тарифы' },
  { href: '#cta', label: 'Начать' },
  { href: '#faq', label: 'FAQ' },
];

function LinkColumn({ title, items }: { title: string; items: typeof LINKS_ABOUT }) {
  return (
    <nav className={styles.ftColLinks} aria-label={title}>
      <span className={styles.ftColTitle}>{title}</span>
      <ul className={styles.ftLinkList} role="list">
        {items.map((item) => (
          <li key={item.href}>
            <a href={item.href} className={styles.ftLink}>
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function FooterSection() {
  return (
    <footer className={styles.ft} role="contentinfo">
      {/* Mesh-фон */}
      <div className={styles.ftMesh} aria-hidden />

      {/* Верхняя часть — колонки */}
      <div className={styles.ftTop}>
        <div className={styles.ftInner}>
          <div className={styles.ftGrid}>
            {/* Бренд */}
            <div className={styles.ftColBrand}>
              <Link href="/" className={styles.ftLogo}>
                <span className={styles.ftLogoIcon} aria-hidden>S</span>
                <span>Speakeasy</span>
              </Link>
              <p className={styles.ftTagline}>
                Практика английского с ИИ — говори, пой, учи слова в своём темпе.
              </p>
            </div>

            <LinkColumn title="О продукте" items={LINKS_ABOUT} />
            <LinkColumn title="Практика" items={LINKS_ACTION} />

            {/* Документы */}
            <div className={styles.ftColLegal}>
              <span className={styles.ftColTitle}>Документы</span>
              <div className={styles.ftLegalLinks}>
                <Link href="/legal/offer" className={styles.ftLink}>Оферта</Link>
                <Link href="/legal/privacy" className={styles.ftLink}>Конфиденциальность</Link>
              </div>
              <p className={styles.ftContact}>
                <a href="mailto:support@speakeasy.ru" className={styles.ftContactLink}>
                  support@speakeasy.ru
                </a>
              </p>
            </div>
          </div>

          {/* Градиентный разделитель */}
          <div className={styles.ftDivider} aria-hidden />

          {/* Нижняя строка */}
          <div className={styles.ftBottom}>
            <span className={styles.ftCopy}>© {new Date().getFullYear()} Speakeasy</span>
            <Link href="/legal/privacy" className={styles.ftBottomLink}>
              Политика конфиденциальности
            </Link>
          </div>
        </div>
      </div>

      {/* Баннер SPEAKEASY */}
      <div className={styles.ftBanner}>
        <div className={styles.ftBannerAurora} aria-hidden />
        <div className={styles.ftBannerGlow} aria-hidden />
        <Link href="/" className={styles.ftBannerWord} aria-label="Speakeasy — на главную">
          <span className={styles.ftBannerLeft}>SPEAK</span>
          <span className={styles.ftBannerRight}>EASY</span>
        </Link>
      </div>
    </footer>
  );
}
