'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export type AiChatMessage = { role: 'user' | 'assistant'; content: string };

type AiChatSessionItem = { id: string; title: string; updated_at: string };

type AiChatPanelProps = {
  onClose: () => void;
  token: string | null;
  userId: string | null;
  getApiUrl: () => string;
};

export function AiChatPanel({ onClose, token, userId, getApiUrl }: AiChatPanelProps) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; startX: number; startY: number; boxW: number; boxH: number } | null>(null);
  const resizeStartRef = useRef<{ x: number; y: number; startW: number; startH: number; handle: 'e' | 's' | 'se' } | null>(null);
  const sizeRef = useRef<{ width: number; height: number } | null>(null);
  const positionRef = useRef<{ x: number; y: number } | null>(null);

  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadLoading, setLoadLoading] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [sessionsList, setSessionsList] = useState<AiChatSessionItem[]>([]);
  const [sessionsListLoading, setSessionsListLoading] = useState(false);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadSessionsList = useCallback(() => {
    if (!userId) return;
    setSessionsListLoading(true);
    supabase
      .from('ai_chat_sessions')
      .select('id, title, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        setSessionsListLoading(false);
        if (error) {
          setSessionsList([]);
          return;
        }
        setSessionsList(
          (data || []).map((row) => ({
            id: row.id,
            title: row.title || 'Чат',
            updated_at: row.updated_at || '',
          }))
        );
      });
  }, [userId]);

  const loadSession = useCallback(
    (sessionId: string) => {
      if (!userId) return;
      setLoadLoading(true);
      setCurrentId(sessionId);
      supabase
        .from('ai_chat_sessions')
        .select('messages, title')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single()
        .then(({ data, error }) => {
          setLoadLoading(false);
          if (error || !data) {
            setMessages([]);
            return;
          }
          const msgs = data.messages && Array.isArray(data.messages) ? (data.messages as AiChatMessage[]) : [];
          setMessages(msgs);
        });
    },
    [userId]
  );

  const startNewChat = useCallback(() => {
    setCurrentId(null);
    setMessages([]);
    setHistoryPanelOpen(false);
  }, []);

  const deleteSession = useCallback(
    async (sessionId: string) => {
      if (!userId) return;
      setDeletingId(sessionId);
      await supabase.from('ai_chat_sessions').delete().eq('id', sessionId).eq('user_id', userId);
      setSessionsList((prev) => prev.filter((s) => s.id !== sessionId));
      if (currentId === sessionId) {
        setCurrentId(null);
        setMessages([]);
      }
      setDeletingId((id) => (id === sessionId ? null : id));
    },
    [userId, currentId]
  );

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || !token || loading) return;
    const userMessage: AiChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    let fullReply = '';
    try {
      const history = [...messages, userMessage];
      const resp = await fetch(`${getApiUrl()}/api/agent/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: history,
          max_tokens: 1500,
        }),
      });
      if (!resp.ok || !resp.body) {
        const j = await resp.json().catch(() => ({}));
        setMessages((prev) => prev.slice(0, -1));
        setInput(text);
        setLoading(false);
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.type === 'chunk' && typeof data.delta === 'string') fullReply += data.delta;
            else if (data.type === 'done') break;
            else if (data.type === 'error') {
              setMessages((prev) => prev.slice(0, -1));
              setInput(text);
              setLoading(false);
              return;
            }
          } catch {
            /* ignore */
          }
        }
      }
      const newMessages: AiChatMessage[] = [...messages, userMessage, { role: 'assistant', content: fullReply.trim() }];
      setMessages(newMessages);
      if (userId) {
        const title = text.length > 80 ? `${text.slice(0, 77)}…` : text;
        const payload = { messages: newMessages, updated_at: new Date().toISOString() };
        if (currentId) {
          supabase
            .from('ai_chat_sessions')
            .update({ ...payload, ...(messages.length === 0 && { title }) })
            .eq('id', currentId)
            .eq('user_id', userId)
            .then(() => {})
            .catch(() => {});
          if (messages.length === 0) {
            setSessionsList((prev) =>
              prev.map((s) => (s.id === currentId ? { ...s, title, updated_at: payload.updated_at } : s))
            );
          } else {
            setSessionsList((prev) =>
              prev.map((s) => (s.id === currentId ? { ...s, updated_at: payload.updated_at } : s))
            );
          }
        } else {
          supabase
            .from('ai_chat_sessions')
            .insert({ user_id: userId, title, messages: newMessages, updated_at: payload.updated_at })
            .select('id, title, updated_at')
            .single()
            .then(({ data }) => {
              if (data) {
                setCurrentId(data.id);
                setSessionsList((prev) => [{ id: data.id, title: data.title || title, updated_at: data.updated_at || '' }, ...prev]);
              }
            })
            .catch(() => {});
        }
      }
    } catch {
      setMessages((prev) => prev.slice(0, -1));
      setInput(text);
    } finally {
      setLoading(false);
    }
  }, [token, userId, messages, input, loading, currentId, getApiUrl]);

  useEffect(() => {
    if (!userId) return;
    loadSessionsList();
    setCurrentId(null);
    setMessages([]);
    setHistoryPanelOpen(false);
  }, [userId, loadSessionsList]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const defaultW = Math.min(900, W - 48);
    const defaultH = Math.min(640, H - 48);
    const newPos = { x: (W - defaultW) / 2, y: (H - defaultH) / 2 };
    const newSize = { width: defaultW, height: defaultH };
    setPosition((prev) => prev ?? newPos);
    setSize((prev) => prev ?? newSize);
    positionRef.current = position ?? newPos;
    sizeRef.current = size ?? newSize;
  }, []);

  useEffect(() => {
    sizeRef.current = size;
    positionRef.current = position;
  }, [size, position]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onMove = (e: MouseEvent) => {
      const drag = dragStartRef.current;
      const resize = resizeStartRef.current;
      if (drag) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        const W = window.innerWidth;
        const H = window.innerHeight;
        const nx = Math.max(0, Math.min(drag.startX + dx, W - drag.boxW));
        const ny = Math.max(0, Math.min(drag.startY + dy, H - drag.boxH));
        setPosition({ x: nx, y: ny });
      } else if (resize) {
        const dx = e.clientX - resize.x;
        const dy = e.clientY - resize.y;
        const minW = 320;
        const minH = 280;
        let nw = resize.startW;
        let nh = resize.startH;
        if (resize.handle === 'e' || resize.handle === 'se') nw = Math.max(minW, resize.startW + dx);
        if (resize.handle === 's' || resize.handle === 'se') nh = Math.max(minH, resize.startH + dy);
        setSize({ width: nw, height: nh });
      }
    };
    const onUp = () => {
      dragStartRef.current = null;
      resizeStartRef.current = null;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        pointerEvents: 'none',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          left: position?.x ?? 0,
          top: position?.y ?? 0,
          width: size?.width ?? 900,
          height: size?.height ?? 640,
          minWidth: 320,
          minHeight: 280,
          maxWidth: '100vw',
          maxHeight: '100vh',
          borderRadius: 16,
          border: '1px solid var(--sidebar-border)',
          background: 'var(--sidebar-bg)',
          color: 'var(--sidebar-text)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
          pointerEvents: 'auto',
        }}
      >
        {historyPanelOpen && (
          <div
            style={{
              width: 260,
              flexShrink: 0,
              borderRight: '1px solid var(--sidebar-border)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--sidebar-border)', flexShrink: 0 }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, opacity: 0.9 }}>История чатов</span>
            </div>
            <button
              type="button"
              onClick={startNewChat}
              style={{
                margin: '0.5rem 0.75rem',
                padding: '0.5rem 0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                border: '1px dashed var(--sidebar-border)',
                background: 'transparent',
                color: 'var(--sidebar-text)',
                borderRadius: 8,
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Новый чат
            </button>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 0.5rem 0.5rem' }}>
              {sessionsListLoading ? (
                <p style={{ margin: '0.5rem 0.75rem', fontSize: '0.8125rem', opacity: 0.7 }}>Загрузка…</p>
              ) : sessionsList.length === 0 ? (
                <p style={{ margin: '0.5rem 0.75rem', fontSize: '0.8125rem', opacity: 0.6 }}>Нет сохранённых чатов</p>
              ) : (
                sessionsList.map((s) => (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => loadSession(s.id)}
                    onKeyDown={(e) => e.key === 'Enter' && loadSession(s.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      marginBottom: 2,
                      borderRadius: 8,
                      background: currentId === s.id ? 'var(--sidebar-hover)' : 'transparent',
                      cursor: 'pointer',
                      border: 'none',
                      width: '100%',
                      textAlign: 'left',
                      color: 'var(--sidebar-text)',
                    }}
                  >
                    <span style={{ flex: 1, fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.title}>
                      {s.title}
                    </span>
                    <button
                      type="button"
                      aria-label="Удалить чат"
                      title="Удалить чат"
                      disabled={deletingId === s.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(s.id);
                      }}
                      style={{
                        flexShrink: 0,
                        padding: '0.25rem',
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--sidebar-text)',
                        opacity: 0.6,
                        cursor: deletingId === s.id ? 'default' : 'pointer',
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
          <div
            onMouseDown={(e) => {
              if ((e.target as HTMLElement).closest('button')) return;
              e.preventDefault();
              const pos = positionRef.current;
              const sz = sizeRef.current;
              if (pos && sz) {
                dragStartRef.current = { x: e.clientX, y: e.clientY, startX: pos.x, startY: pos.y, boxW: sz.width, boxH: sz.height };
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              padding: '1rem 1.25rem',
              borderBottom: '1px solid var(--sidebar-border)',
              flexShrink: 0,
              cursor: 'move',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setHistoryPanelOpen((v) => !v);
                }}
                aria-label={historyPanelOpen ? 'Скрыть историю' : 'История чатов'}
                title={historyPanelOpen ? 'Скрыть историю' : 'История чатов'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 36,
                  height: 36,
                  border: '1px solid var(--sidebar-border)',
                  background: historyPanelOpen ? 'var(--sidebar-hover)' : 'transparent',
                  color: 'var(--sidebar-text)',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span style={{ fontWeight: 600, fontSize: '1rem' }}>Чат с ИИ</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Скрыть"
              title="Скрыть окно чата"
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--sidebar-text)',
                cursor: 'pointer',
                opacity: 0.7,
                padding: '0.35rem',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div
            style={{
              flex: 1,
              minHeight: 200,
              maxHeight: 440,
              overflowY: 'auto',
              padding: '1rem 1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            {loadLoading ? (
              <p style={{ margin: 0, fontSize: '0.875rem', opacity: 0.7 }}>Загрузка чата…</p>
            ) : messages.length === 0 && !loading ? (
              <p style={{ margin: 0, fontSize: '0.875rem', opacity: 0.7 }}>
                Напишите сообщение — ИИ ответит. Можно задать вопрос по языку, грамматике или попросить помочь с формулировкой.
              </p>
            ) : (
              <>
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '90%',
                      padding: '0.6rem 0.9rem',
                      borderRadius: 12,
                      background: msg.role === 'user' ? 'rgba(99, 102, 241, 0.18)' : 'var(--sidebar-hover)',
                      border: `1px solid ${msg.role === 'user' ? 'rgba(99, 102, 241, 0.35)' : 'var(--sidebar-border)'}`,
                    }}
                  >
                    <span style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, opacity: 0.8, marginBottom: '0.25rem' }}>
                      {msg.role === 'user' ? 'Вы' : 'ИИ'}
                    </span>
                    <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {msg.content}
                    </p>
                  </div>
                ))}
                {loading && (
                  <div
                    style={{
                      alignSelf: 'flex-start',
                      maxWidth: '90%',
                      padding: '0.6rem 0.9rem',
                      borderRadius: 12,
                      background: 'var(--sidebar-hover)',
                      border: '1px solid var(--sidebar-border)',
                    }}
                  >
                    <span style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, opacity: 0.8, marginBottom: '0.25rem' }}>ИИ</span>
                    <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 2 }}>
                      <span>ИИ печатает</span>
                      <span style={{ display: 'inline-flex', gap: 2 }}>
                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor', opacity: 0.6, animation: 'aiChatDot 0.6s ease-in-out 0s infinite alternate' }} />
                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor', opacity: 0.6, animation: 'aiChatDot 0.6s ease-in-out 0.2s infinite alternate' }} />
                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor', opacity: 0.6, animation: 'aiChatDot 0.6s ease-in-out 0.4s infinite alternate' }} />
                      </span>
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
          <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--sidebar-border)', display: 'flex', flexDirection: 'column', gap: '0.5rem', flexShrink: 0 }}>
            <textarea
              placeholder="Напишите сообщение…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (!e.shiftKey && e.key === 'Enter') {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              rows={2}
              style={{
                width: '100%',
                resize: 'none',
                padding: '0.65rem 0.85rem',
                borderRadius: 10,
                border: '1px solid var(--sidebar-border)',
                background: 'var(--sidebar-hover)',
                color: 'var(--sidebar-text)',
                fontSize: '0.9rem',
                lineHeight: 1.5,
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Enter — отправить, Shift+Enter — новая строка</span>
              <button
                type="button"
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                style={{
                  '--accent': '#7ad7a7',
                  '--accent-strong': '#58c18f',
                  '--accent-soft': 'rgba(122, 215, 167, 0.16)',
                  padding: '0.5rem 1rem',
                  borderRadius: 10,
                  border: '1px solid var(--accent-strong)',
                  background: 'var(--accent-soft)',
                  color: 'var(--accent-strong)',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: loading || !input.trim() ? 'default' : 'pointer',
                  opacity: loading || !input.trim() ? 0.6 : 1,
                }}
              >
                {loading ? 'Отправка…' : 'Отправить'}
              </button>
            </div>
          </div>
        </div>
        <div
          role="presentation"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const sz = sizeRef.current;
            if (sz) resizeStartRef.current = { x: e.clientX, y: e.clientY, startW: sz.width, startH: sz.height, handle: 'e' };
          }}
          style={{ position: 'absolute', top: 0, right: 0, width: 8, height: '100%', cursor: 'ew-resize', zIndex: 10 }}
        />
        <div
          role="presentation"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const sz = sizeRef.current;
            if (sz) resizeStartRef.current = { x: e.clientX, y: e.clientY, startW: sz.width, startH: sz.height, handle: 's' };
          }}
          style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 8, cursor: 'ns-resize', zIndex: 10 }}
        />
        <div
          role="presentation"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const sz = sizeRef.current;
            if (sz) resizeStartRef.current = { x: e.clientX, y: e.clientY, startW: sz.width, startH: sz.height, handle: 'se' };
          }}
          style={{ position: 'absolute', bottom: 0, right: 0, width: 16, height: 16, cursor: 'nwse-resize', zIndex: 10 }}
        />
      </div>
    </div>
  );
}
