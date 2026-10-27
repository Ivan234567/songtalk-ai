'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './create-word-list.module.css';

type SystemList = {
  id: string;
  title: string;
  subtitle: string;
  color: string;
  icon: string;
  word_count: number;
  in_library: boolean;
  category_id: string | null;
};

type TabId = 'quick' | 'empty' | 'custom';

function pluralWords(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'слово';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'слова';
  return 'слов';
}

function ListIcon({ name, color }: { name: string; color: string }) {
  const stroke = color;
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke,
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (name === 'hash') {
    return (
      <svg {...common}>
        <path d="M5 9h14M5 15h14M9 4L7 20M17 4l-2 16" />
      </svg>
    );
  }
  if (name === 'palette') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <circle cx="9" cy="10" r="1.1" fill={stroke} />
        <circle cx="13" cy="8.5" r="1.1" fill={stroke} />
        <circle cx="15.5" cy="12" r="1.1" fill={stroke} />
      </svg>
    );
  }
  if (name === 'calendar') {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 10h16" />
      </svg>
    );
  }
  if (name === 'spark') {
    return (
      <svg {...common}>
        <path d="M12 3l1.4 5.2L18 10l-4.6 1.8L12 17l-1.4-5.2L6 10l4.6-1.8L12 3z" />
      </svg>
    );
  }
  if (name === 'people') {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19c.6-3 2.7-4.5 5.5-4.5S14.4 16 15 19" />
        <circle cx="17" cy="9" r="2.2" />
        <path d="M16 14.5c2.1.3 3.6 1.6 4.2 4.5" />
      </svg>
    );
  }
  if (name === 'person') {
    return (
      <svg {...common}>
        <circle cx="12" cy="6.5" r="2.4" />
        <path d="M12 10.2c-3.2 0-5.5 2-6 5.8h12c-.5-3.8-2.8-5.8-6-5.8z" />
      </svg>
    );
  }
  if (name === 'utensils') {
    return (
      <svg {...common}>
        <path d="M8 4v16M6 4c0 3 2 3 2 6M10 4c0 3-2 3-2 6M16 4v7h2v9" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M13 3L5 14h6l-1 7 9-12h-6l0-6z" />
    </svg>
  );
}

function parseCustomWords(raw: string, isChinese: boolean) {
  return raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s*[|—–\-]\s*/).map((part) => part.trim()).filter(Boolean);
      if (isChinese) {
        return {
          word: parts[0] || '',
          pinyin: parts[1] || '',
          translation: parts[2] || parts[1] || '',
        };
      }
      return {
        word: parts[0] || '',
        translation: parts[1] || '',
      };
    })
    .filter((item) => item.word);
}

type Props = {
  open: boolean;
  accessToken: string | null;
  apiUrl: string;
  isChinese: boolean;
  language: 'en' | 'zh';
  onClose: () => void;
  onOpenList: (categoryId: string) => void;
  onCreatedEmpty: (categoryId: string) => void;
};

export function CreateWordListModal({
  open,
  accessToken,
  apiUrl,
  isChinese,
  language,
  onClose,
  onOpenList,
  onCreatedEmpty,
}: Props) {
  const [tab, setTab] = useState<TabId>('quick');
  const [lists, setLists] = useState<SystemList[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emptyName, setEmptyName] = useState('');
  const [customName, setCustomName] = useState('');
  const [customWords, setCustomWords] = useState('');

  const loadLists = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${apiUrl}/api/vocabulary/system-lists?language=${language}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || 'Не удалось загрузить системные списки');
      }
      setLists(data.lists || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить системные списки');
    } finally {
      setLoading(false);
    }
  }, [accessToken, apiUrl, language]);

  useEffect(() => {
    if (!open) return;
    setTab('quick');
    setEmptyName('');
    setCustomName('');
    setCustomWords('');
    setError(null);
    void loadLists();
  }, [open, loadLists]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const installList = async (pack: SystemList) => {
    if (!accessToken || busyId) return;
    if (pack.in_library && pack.category_id) {
      onOpenList(pack.category_id);
      return;
    }
    setBusyId(pack.id);
    setError(null);
    try {
      const resp = await fetch(`${apiUrl}/api/vocabulary/system-lists/${pack.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ language }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || 'Не удалось создать список');
      }
      onOpenList(data.category.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать список');
    } finally {
      setBusyId(null);
    }
  };

  const createEmpty = async () => {
    if (!accessToken || !emptyName.trim()) return;
    setBusyId('empty');
    setError(null);
    try {
      const resp = await fetch(`${apiUrl}/api/vocabulary/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: emptyName.trim(),
          description: null,
          color: '#7ad7a7',
          icon: 'spark',
          language,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || 'Не удалось создать список');
      }
      onCreatedEmpty(data.category.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать список');
    } finally {
      setBusyId(null);
    }
  };

  const createCustom = async () => {
    if (!accessToken || !customName.trim()) return;
    const words = parseCustomWords(customWords, isChinese);
    if (words.length === 0) {
      setError(isChinese ? 'Добавьте слова в формате: 汉字 | pinyin | перевод' : 'Добавьте слова в формате: word — перевод');
      return;
    }
    setBusyId('custom');
    setError(null);
    try {
      const resp = await fetch(`${apiUrl}/api/vocabulary/custom-list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: customName.trim(),
          words,
          language,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || 'Не удалось создать список');
      }
      onOpenList(data.category.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать список');
    } finally {
      setBusyId(null);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modalWrap} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="create-word-list-title">
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
          <div className={styles.tabs}>
            <button type="button" className={`${styles.tab} ${tab === 'quick' ? styles.tabActive : ''}`} onClick={() => setTab('quick')}>
              <span className={styles.tabNum}>01</span>
              <span className={styles.tabLabel}>Быстрый старт</span>
            </button>
            <button type="button" className={`${styles.tab} ${tab === 'empty' ? styles.tabActive : ''}`} onClick={() => setTab('empty')}>
              <span className={styles.tabNum}>02</span>
              <span className={styles.tabLabel}>Пустой список</span>
            </button>
            <button type="button" className={`${styles.tab} ${tab === 'custom' ? styles.tabActive : ''}`} onClick={() => setTab('custom')}>
              <span className={styles.tabNum}>03</span>
              <span className={styles.tabLabel}>
                Настраиваемый <span className={styles.proBadge}>PRO</span>
              </span>
            </button>
          </div>

          {tab === 'quick' && (
            <>
              <p className={styles.intro} id="create-word-list-title">
                Нажмите на любой набор, чтобы создать список для вашего целевого языка.
                Первая установка занимает несколько секунд — повторно список открывается сразу.
              </p>
              <div className={styles.grid}>
                {loading && lists.length === 0
                  ? Array.from({ length: 8 }).map((_, i) => <div key={i} className={styles.skeleton} />)
                  : lists.map((pack) => (
                      <button
                        key={pack.id}
                        type="button"
                        className={styles.card}
                        disabled={busyId === pack.id}
                        onClick={() => void installList(pack)}
                      >
                        {pack.in_library && <span className={styles.libraryBadge}>В библиотеке</span>}
                        <div className={styles.cardTop}>
                          <span className={styles.iconWrap} style={{ background: `${pack.color}22`, boxShadow: `inset 0 0 0 1px ${pack.color}55` }}>
                            <ListIcon name={pack.icon} color={pack.color} />
                          </span>
                          <span className={styles.count}>{pack.word_count} {pluralWords(pack.word_count)}</span>
                        </div>
                        <h3 className={styles.cardTitle}>{pack.title}</h3>
                        <p className={styles.cardSubtitle}>{pack.subtitle}</p>
                        {pack.in_library && <span className={styles.openHint}>Открыть список →</span>}
                      </button>
                    ))}
              </div>
            </>
          )}

          {tab === 'empty' && (
            <div className={styles.panel}>
              <p className={styles.intro}>Создайте пустой список и добавляйте слова сами — из караоке, чата или вручную.</p>
              <div>
                <label className={styles.label} htmlFor="empty-list-name">Название списка</label>
                <input
                  id="empty-list-name"
                  className={styles.input}
                  value={emptyName}
                  onChange={(e) => setEmptyName(e.target.value)}
                  placeholder="Например, Путешествия"
                />
              </div>
              <div className={styles.actions}>
                <button type="button" className={styles.secondary} onClick={onClose}>Отмена</button>
                <button type="button" className={styles.primary} disabled={!emptyName.trim() || busyId === 'empty'} onClick={() => void createEmpty()}>
                  {busyId === 'empty' ? 'Создаём…' : 'Создать список'}
                </button>
              </div>
            </div>
          )}

          {tab === 'custom' && (
            <div className={styles.panel}>
              <p className={styles.intro}>Соберите свой набор: название и слова с переводом. Список сразу появится в словаре.</p>
              <div>
                <label className={styles.label} htmlFor="custom-list-name">Название списка</label>
                <input
                  id="custom-list-name"
                  className={styles.input}
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Например, Урок 3"
                />
              </div>
              <div>
                <label className={styles.label} htmlFor="custom-list-words">Слова</label>
                <textarea
                  id="custom-list-words"
                  className={styles.textarea}
                  value={customWords}
                  onChange={(e) => setCustomWords(e.target.value)}
                  placeholder={isChinese ? '你好 | nǐ hǎo | привет' : 'hello — привет'}
                />
                <p className={styles.hint}>
                  {isChinese
                    ? 'По одному слову на строку: иероглифы | пиньинь | перевод.'
                    : 'По одному слову на строку: word — перевод.'}
                </p>
              </div>
              <div className={styles.actions}>
                <button type="button" className={styles.secondary} onClick={onClose}>Отмена</button>
                <button type="button" className={styles.primary} disabled={!customName.trim() || busyId === 'custom'} onClick={() => void createCustom()}>
                  {busyId === 'custom' ? 'Создаём…' : 'Создать список'}
                </button>
              </div>
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
