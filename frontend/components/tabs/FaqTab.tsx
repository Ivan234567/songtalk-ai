'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLearningLanguage } from '@/context/LearningLanguageContext';
import { LEARNING_LANGUAGE_LABELS } from '@/lib/learning-language';
import {
  faqItemMatches,
  getDashboardFaq,
  getFaqCategories,
  getFaqCategoryLabel,
  getFaqQuickLinks,
  type FaqCategoryId,
  type FaqItem,
  type FaqRelatedTab,
} from '@/lib/dashboard-faq';
import styles from './faq.module.css';

const SUPPORT_URL = 'https://t.me/SPEAKEASY_SUPPORT';

type FaqTabProps = {
  onGoToTab?: (tab: FaqRelatedTab) => void;
};

function SearchIcon() {
  return (
    <svg className={styles.searchIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M20 20l-3.2-3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function highlight(text: string, query: string): React.ReactNode {
  const tokens = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (tokens.length === 0) return text;
  const re = new RegExp(`(${tokens.join('|')})`, 'gi');
  const parts = text.split(re);
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <mark key={`${part}-${index}`} className={styles.mark}>
        {part}
      </mark>
    ) : (
      <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
    ),
  );
}

function FaqAccordionItem({
  item,
  open,
  query,
  onToggle,
  onGoToTab,
}: {
  item: FaqItem;
  open: boolean;
  query: string;
  onToggle: () => void;
  onGoToTab?: (tab: FaqRelatedTab) => void;
}) {
  return (
    <article className={`${styles.item} ${open ? styles.itemOpen : ''}`}>
      <button
        type="button"
        className={styles.question}
        onClick={onToggle}
        aria-expanded={open}
        id={`faq-q-${item.id}`}
      >
        <span className={styles.questionText}>{highlight(item.question, query)}</span>
        <span className={styles.chevron} aria-hidden>
          +
        </span>
      </button>
      <div className={styles.answer} role="region" aria-labelledby={`faq-q-${item.id}`}>
        <div className={styles.answerInner}>
          {item.answer.map((paragraph) => (
            <p key={paragraph}>{highlight(paragraph, query)}</p>
          ))}
          {item.relatedTab && onGoToTab && (
            <button type="button" className={styles.related} onClick={() => onGoToTab(item.relatedTab!)}>
              {item.relatedLabel || 'Открыть раздел'}
              <span aria-hidden>→</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export const FaqTab: React.FC<FaqTabProps> = ({ onGoToTab }) => {
  const { learningLanguage } = useLearningLanguage();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FaqCategoryId | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(() => getFaqCategories(learningLanguage), [learningLanguage]);
  const items = useMemo(() => getDashboardFaq(learningLanguage), [learningLanguage]);
  const quickLinks = useMemo(() => getFaqQuickLinks(learningLanguage), [learningLanguage]);

  useEffect(() => {
    setCategory('all');
    setOpenId(null);
  }, [learningLanguage]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const isModK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      const isSlash = event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey;
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (isModK || (isSlash && !typing)) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (event.key === 'Escape' && document.activeElement === searchRef.current && query) {
        setQuery('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [query]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      return faqItemMatches(item, query);
    });
  }, [items, category, query]);

  const grouped = useMemo(() => {
    const order = categories.filter((entry) => entry.id !== 'all').map((entry) => entry.id as FaqCategoryId);
    return order
      .map((id) => ({
        id,
        label: getFaqCategoryLabel(id),
        items: filtered.filter((item) => item.category === id),
      }))
      .filter((group) => group.items.length > 0);
  }, [categories, filtered]);

  const showQuick = !query.trim() && category === 'all';
  const isZh = learningLanguage === 'zh';
  const shortcut = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform) ? '⌘K' : 'Ctrl+K';

  return (
    <div className={styles.wrapper} data-language={learningLanguage}>
      <header className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <p className={styles.kicker}>FAQ</p>
            <h1 className={styles.title}>Как устроен Speakeasy</h1>
            <p className={styles.subtitle}>
              {isZh
                ? 'Справка по китайскому режиму: ситуативные диалоги HSK, голосовая минутка, словарь с пиньинем, прогресс и оплата.'
                : 'Справка по английскому режиму: диалоги, сценарии, дебаты, караоке, словарь и оплата. Китайский переключается в шапке.'}
            </p>
          </div>
          <span className={styles.modeBadge}>
            <span className={styles.modeDot} aria-hidden />
            {LEARNING_LANGUAGE_LABELS[learningLanguage]}
          </span>
        </div>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <SearchIcon />
          <input
            ref={searchRef}
            className={styles.searchInput}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по вопросам и ответам"
            aria-label="Поиск по FAQ"
            autoComplete="off"
          />
          <div className={styles.searchMeta}>
            {query ? (
              <button type="button" className={styles.clearBtn} onClick={() => setQuery('')}>
                Сбросить
              </button>
            ) : (
              <span className={styles.kbd}>{shortcut}</span>
            )}
          </div>
        </div>
        <div className={styles.chips} role="tablist" aria-label="Категории FAQ">
          {categories.map((entry) => {
            const active = category === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`${styles.chip} ${active ? styles.chipActive : ''}`}
                onClick={() => setCategory(entry.id)}
              >
                {entry.label}
              </button>
            );
          })}
        </div>
      </div>

      {showQuick && (
        <div className={styles.quickGrid}>
          {quickLinks.map((link) => (
            <button
              key={link.id}
              type="button"
              className={styles.quickCard}
              onClick={() => onGoToTab?.(link.tab)}
            >
              <span className={styles.quickTitle}>{link.title}</span>
              <span className={styles.quickText}>{link.text}</span>
              <span className={styles.quickGo}>Перейти →</span>
            </button>
          ))}
        </div>
      )}

      <div className={styles.resultMeta}>
        <p className={styles.resultCount}>
          {filtered.length === 0
            ? 'Ничего не найдено'
            : `Показано ${filtered.length} ${filtered.length === 1 ? 'вопрос' : filtered.length < 5 ? 'вопроса' : 'вопросов'}`}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>По этому запросу пока пусто</h2>
          <p className={styles.emptyText}>
            Попробуйте другие слова — «HSK», «баланс», «сценарий» — или напишите в поддержку, если не нашли нужное.
          </p>
          <div className={styles.emptyActions}>
            <button
              type="button"
              className={styles.ghostBtn}
              onClick={() => {
                setQuery('');
                setCategory('all');
              }}
            >
              Показать все вопросы
            </button>
            <a className={styles.supportBtn} href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
              Telegram-поддержка
            </a>
          </div>
        </div>
      ) : (
        grouped.map((group) => (
          <section key={group.id} className={styles.group} aria-labelledby={`faq-group-${group.id}`}>
            <h2 id={`faq-group-${group.id}`} className={styles.groupTitle}>
              {group.label}
            </h2>
            <div className={styles.list}>
              {group.items.map((item) => (
                <FaqAccordionItem
                  key={item.id}
                  item={item}
                  query={query}
                  open={openId === item.id}
                  onToggle={() => setOpenId((prev) => (prev === item.id ? null : item.id))}
                  onGoToTab={onGoToTab}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <aside className={styles.footer}>
        <p className={styles.footerText}>
          Не нашли ответ? Напишите в <strong>@SPEAKEASY_SUPPORT</strong> — поможем разобраться или примем идею.
        </p>
        <a className={styles.supportBtn} href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
          Написать в Telegram
        </a>
      </aside>
    </div>
  );
};
