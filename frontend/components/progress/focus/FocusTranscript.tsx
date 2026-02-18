'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './focus.module.css';

type DialogMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type FocusTranscriptProps = {
  mode: 'roleplay' | 'debate';
  agentSessionId: string | null;
  debateSessionId: string | null;
  fallbackUserMessages: string[];
  className?: string;
};

export function FocusTranscript({
  mode,
  agentSessionId,
  debateSessionId,
  fallbackUserMessages,
  className = '',
}: FocusTranscriptProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<DialogMessage[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setMessages([]);

      try {
        if (mode === 'roleplay') {
          if (agentSessionId) {
            const { data, err } = await supabase
              .from('agent_sessions')
              .select('messages')
              .eq('id', agentSessionId)
              .single();
            if (err) throw new Error(err.message);
            const msgs = Array.isArray(data?.messages) ? (data.messages as DialogMessage[]) : [];
            if (!cancelled) setMessages(msgs);
            return;
          }
          if (!cancelled) {
            setMessages(
              (fallbackUserMessages ?? []).map((text) => ({ role: 'user' as const, content: text }))
            );
          }
          return;
        }

        if (!debateSessionId) {
          if (!cancelled) {
            setError('Нет данных диалога для этой попытки.');
          }
          return;
        }

        const { data, err } = await supabase
          .from('debate_sessions')
          .select('messages')
          .eq('id', debateSessionId)
          .single();
        if (err) throw new Error(err.message);
        const msgs = Array.isArray(data?.messages) ? (data.messages as DialogMessage[]) : [];
        if (!cancelled) setMessages(msgs);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Не удалось загрузить диалог.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [mode, agentSessionId, debateSessionId, fallbackUserMessages]);

  // Stats
  const stats = useMemo(() => {
    const userCount = messages.filter((m) => m.role === 'user').length;
    const assistantCount = messages.filter((m) => m.role === 'assistant').length;
    const totalWords = messages.reduce((acc, m) => acc + m.content.split(/\s+/).length, 0);
    return { userCount, assistantCount, totalWords };
  }, [messages]);

  const hasMessages = !loading && !error && messages.length > 0;

  return (
    <section className={`${styles.card} ${className}`}>
      {/* Header */}
      <div className={styles.transcriptHeader}>
        <div className={styles.transcriptHeaderLeft}>
          <span className={styles.transcriptIcon}>💬</span>
          <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Расшифровка диалога</h2>
        </div>
        {hasMessages && (
          <div className={styles.transcriptStats}>
            <span className={styles.transcriptStatItem} title="Сообщений пользователя">
              👤 {stats.userCount}
            </span>
            <span className={styles.transcriptStatItem} title="Сообщений ассистента">
              🤖 {stats.assistantCount}
            </span>
            <span className={styles.transcriptStatItem} title="Всего слов">
              📝 {stats.totalWords}
            </span>
          </div>
        )}
      </div>

      {/* Toggle button */}
      {hasMessages && (
        <button
          type="button"
          className={styles.transcriptToggle}
          onClick={() => setExpanded(!expanded)}
        >
          <span>{expanded ? 'Скрыть диалог' : 'Показать диалог'}</span>
          <span className={`${styles.transcriptToggleIcon} ${expanded ? styles.transcriptToggleIconOpen : ''}`}>
            ▼
          </span>
        </button>
      )}

      {/* Loading state */}
      {loading && (
        <div className={styles.transcriptLoading}>
          <div className={styles.transcriptLoadingSpinner} />
          <span>Загрузка диалога...</span>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className={styles.transcriptError}>
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && messages.length === 0 && (
        <div className={styles.transcriptEmpty}>
          <span>📭</span>
          <span>Нет сообщений для этой попытки.</span>
        </div>
      )}

      {/* Messages */}
      {hasMessages && expanded && (
        <div className={styles.transcriptContainer}>
          {messages.map((msg, idx) => (
            <div
              key={`msg-${idx}`}
              className={`${styles.transcriptBubble} ${msg.role === 'user' ? styles.transcriptBubbleUser : styles.transcriptBubbleAssistant}`}
              style={{ animationDelay: `${idx * 30}ms` }}
            >
              <div className={styles.transcriptBubbleHeader}>
                <span className={styles.transcriptAvatar}>
                  {msg.role === 'user' ? '👤' : '🤖'}
                </span>
                <span className={styles.transcriptRole}>
                  {msg.role === 'user' ? 'Вы' : 'AI-тренер'}
                </span>
                <span className={styles.transcriptMsgNumber}>#{idx + 1}</span>
              </div>
              <div className={styles.transcriptContent}>{msg.content}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
