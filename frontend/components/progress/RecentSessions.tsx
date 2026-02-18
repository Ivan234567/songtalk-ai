'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './progress.module.css';

export type RecentSessionRow = {
  id: string;
  rowMode: 'roleplay' | 'debate';
  title: string;
  completedAt: string;
  score: number | null;
  objectKey: string;
  completionId: string;
};

type RecentSessionsProps = {
  sessions: RecentSessionRow[];
  limit?: number;
  onOpenFocus?: (objectKey: string, completionId?: string) => void;
  className?: string;
};

type SortMode = 'date_desc' | 'score_desc' | 'score_asc' | 'mode';

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return 'сегодня';
  if (diffDays === 1) return 'вчера';
  if (diffDays < 7) return `${diffDays} дн. назад`;
  return date.toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' });
}

export function RecentSessions({
  sessions,
  limit = 5,
  onOpenFocus,
  className = '',
}: RecentSessionsProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('date_desc');

  const sortedSessions = useMemo(() => {
    const rows = [...sessions];
    if (sortMode === 'mode') {
      rows.sort((a, b) => {
        if (a.rowMode !== b.rowMode) return a.rowMode.localeCompare(b.rowMode);
        return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
      });
      return rows;
    }
    if (sortMode === 'score_desc') {
      rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
      return rows;
    }
    if (sortMode === 'score_asc') {
      rows.sort((a, b) => (a.score ?? 11) - (b.score ?? 11));
      return rows;
    }
    rows.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
    return rows;
  }, [sessions, sortMode]);

  const displaySessions = expanded ? sortedSessions : sortedSessions.slice(0, limit);

  const handleClick = (row: RecentSessionRow) => {
    if (onOpenFocus) {
      onOpenFocus(row.objectKey, row.completionId);
    } else {
      router.push(`/dashboard/progress/focus/${encodeURIComponent(row.objectKey)}?attempt=${row.completionId}`);
    }
  };

  if (displaySessions.length === 0) {
    return (
      <section className={`${styles.card} ${className}`}>
        <h3 className={styles.sectionTitle}>Последние сессии</h3>
        <p className={styles.sectionHint} style={{ marginTop: '0.5rem' }}>
          Нет сессий для выбранных фильтров.
        </p>
      </section>
    );
  }

  return (
    <section className={`${styles.card} ${className}`}>
      <div className={styles.sessionHeaderRow}>
        <div>
          <h3 className={styles.sectionTitle}>Последние сессии</h3>
          <p className={styles.sectionHint} style={{ marginTop: '0.25rem' }}>
            Кликните для детального просмотра.
          </p>
        </div>
        <div className={styles.sessionSort}>
          <button
            type="button"
            className={`${styles.sessionSortBtn} ${sortMode === 'date_desc' ? styles.sessionSortBtnActive : ''}`}
            onClick={() => setSortMode('date_desc')}
          >
            Дата
          </button>
          <button
            type="button"
            className={`${styles.sessionSortBtn} ${sortMode === 'score_desc' ? styles.sessionSortBtnActive : ''}`}
            onClick={() => setSortMode('score_desc')}
          >
            Балл ↓
          </button>
          <button
            type="button"
            className={`${styles.sessionSortBtn} ${sortMode === 'score_asc' ? styles.sessionSortBtnActive : ''}`}
            onClick={() => setSortMode('score_asc')}
          >
            Балл ↑
          </button>
          <button
            type="button"
            className={`${styles.sessionSortBtn} ${sortMode === 'mode' ? styles.sessionSortBtnActive : ''}`}
            onClick={() => setSortMode('mode')}
          >
            Тип
          </button>
        </div>
      </div>
      <div className={styles.sessionList} style={{ marginTop: '0.75rem' }}>
        {displaySessions.map((row) => (
          <button
            key={row.id}
            type="button"
            className={styles.sessionCard}
            onClick={() => handleClick(row)}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className={styles.sessionTitleRow}>
                <span className={styles.sessionModeIcon} aria-hidden="true">
                  {row.rowMode === 'roleplay' ? '🎭' : '⚔️'}
                </span>
                <div className={styles.sessionTitle}>{row.title}</div>
              </div>
              <div className={styles.sessionMeta}>
                {row.score != null ? `${row.score.toFixed(1)}` : '—'} · {formatRelativeDate(row.completedAt)}
              </div>
              {row.score != null && (
                <div className={styles.sessionScoreBar}>
                  <div
                    className={styles.sessionScoreFill}
                    style={{ width: `${Math.max(0, Math.min(100, row.score * 10))}%` }}
                  />
                </div>
              )}
            </div>
            <span className={styles.sessionArrow}>→</span>
            <div className={styles.sessionPreview} aria-hidden="true">
              <div className={styles.sessionPreviewTitle}>Быстрый просмотр</div>
              <div className={styles.sessionPreviewText}>
                {row.rowMode === 'roleplay' ? 'Ролевой сценарий' : 'Дебаты'}
                {' · '}
                {row.score != null ? `${row.score.toFixed(1)}/10` : 'без оценки'}
              </div>
              <div className={styles.sessionPreviewText}>Нажмите, чтобы открыть разбор</div>
            </div>
          </button>
        ))}
      </div>
      {sortedSessions.length > limit && (
        <button
          type="button"
          className={styles.sessionExpandBtn}
          onClick={() => setExpanded((prev) => !prev)}
          style={{ marginTop: '0.75rem' }}
        >
          {expanded ? 'Скрыть список' : `Показать все (${sortedSessions.length})`}
        </button>
      )}
    </section>
  );
}
