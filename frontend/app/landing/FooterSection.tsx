'use client';

import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import Link from 'next/link';
import styles from './landing.module.css';

const TELEGRAM_SUPPORT = 'https://t.me/SPEAKEASY_SUPPORT';

/* Цвета QR в стиле лендинга: мятный на тёмном */
const QR_FG = '#6bf0b0';
const QR_BG = 'transparent';

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
                <img src="/logo-head.svg" alt="" aria-hidden width={32} height={32} style={{ display: 'block', objectFit: 'contain' }} />
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
            </div>

            {/* Поддержка — Telegram */}
            <div className={styles.ftColSupport}>
              <span className={styles.ftColTitle}>Поддержка</span>
              <div className={styles.ftTelegram}>
                <a
                  href={TELEGRAM_SUPPORT}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.ftTelegramLink}
                  aria-label="Поддержка в Telegram @SPEAKEASY_SUPPORT"
                >
                  <span className={styles.ftTelegramQrWrap}>
                    <QRCodeSVG
                      value={TELEGRAM_SUPPORT}
                      size={120}
                      level="M"
                      marginSize={1}
                      fgColor={QR_FG}
                      bgColor={QR_BG}
                      className={styles.ftTelegramQr}
                    />
                  </span>
                  <span className={styles.ftTelegramHandle}>@SPEAKEASY_SUPPORT</span>
                </a>
              </div>
            </div>
          </div>

          {/* Градиентный разделитель */}
          <div className={styles.ftDivider} aria-hidden />

          {/* Нижняя строка */}
          <div className={styles.ftBottom}>
            <span className={styles.ftCopy}>© {new Date().getFullYear()} Speakeasy</span>
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
