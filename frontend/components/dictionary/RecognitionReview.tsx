'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useTtsVoice } from '@/context/TtsVoiceContext';
import { useLearningLanguage } from '@/context/LearningLanguageContext';

type Rating = 'again' | 'hard' | 'good' | 'easy';

type DueCard = {
  senseId: string;
  headword: string;
  glossRu: string;
  partOfSpeech: string | null;
  contextText: string | null;
};

const RATINGS: Array<{ rating: Rating; label: string; key: string }> = [
  { rating: 'again', label: 'Снова', key: '1' },
  { rating: 'hard', label: 'Трудно', key: '2' },
  { rating: 'good', label: 'Хорошо', key: '3' },
  { rating: 'easy', label: 'Легко', key: '4' },
];

const buttonStyle: React.CSSProperties = {
  padding: '0.55rem 0.75rem',
  borderRadius: 10,
  border: '1px solid var(--stroke)',
  background: 'var(--card)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
};

function getApiUrl() {
  const url = process.env.NEXT_PUBLIC_API_URL || '';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function readCards(payload: unknown): DueCard[] {
  const items = payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)
    ? (payload as { items: unknown[] }).items
    : null;
  if (!items) return [];
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as { sense_id?: unknown; headword?: unknown; gloss_ru?: unknown; part_of_speech?: unknown; context_text?: unknown };
    const senseId = typeof row.sense_id === 'string' ? row.sense_id : '';
    const headword = typeof row.headword === 'string' ? row.headword.trim() : '';
    const glossRu = typeof row.gloss_ru === 'string' ? row.gloss_ru.trim() : '';
    if (!senseId || !headword || !glossRu) return [];
    return [{
      senseId,
      headword,
      glossRu,
      partOfSpeech: typeof row.part_of_speech === 'string' && row.part_of_speech.trim() ? row.part_of_speech.trim() : null,
      contextText: typeof row.context_text === 'string' && row.context_text.trim() ? row.context_text.trim() : null,
    }];
  });
}

export function RecognitionReview() {
  const router = useRouter();
  const { ttsVoice } = useTtsVoice();
  const { learningLanguage } = useLearningLanguage();
  const [token, setToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<'loading' | 'error' | 'empty' | 'card' | 'done'>('loading');
  const [cards, setCards] = useState<DueCard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [authBlocked, setAuthBlocked] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const requestIdRef = useRef<string | null>(null);
  const pendingRatingRef = useRef<Rating>('again');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const savingRef = useRef(false);

  const leave = useCallback(() => {
    if (savingRef.current) return;
    router.replace('/dashboard?tab=dictionary');
  }, [router]);

  const loadQueue = useCallback(async (accessToken: string, keepMessage = false) => {
    setPhase('loading');
    if (!keepMessage) setMessage(null);
    setCanRetry(false);
    setAuthBlocked(false);
    setRevealed(false);
    setIndex(0);
    requestIdRef.current = null;
    try {
      const resp = await fetch(`${getApiUrl()}/api/vocabulary/srs/due`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.status === 401) {
        setAuthBlocked(true);
        setMessage('Войдите снова, чтобы сохранить оценку');
        setPhase('error');
        return;
      }
      if (!resp.ok) {
        setMessage('Не удалось собрать слова');
        setPhase('error');
        return;
      }
      const next = readCards(data);
      setCards(next);
      setPhase(next.length ? 'card' : 'empty');
    } catch {
      setMessage('Не удалось собрать слова');
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const accessToken = data.session?.access_token || null;
      setToken(accessToken);
      if (!accessToken) {
        setAuthBlocked(true);
        setMessage('Войдите снова, чтобы сохранить оценку');
        setPhase('error');
        return;
      }
      void loadQueue(accessToken);
    });
    return () => {
      cancelled = true;
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, [loadQueue]);

  const finishBatch = useCallback(() => {
    requestIdRef.current = null;
    setRevealed(false);
    setPhase('done');
  }, []);

  const advance = useCallback((from: number, list: DueCard[]) => {
    requestIdRef.current = null;
    setRevealed(false);
    setCanRetry(false);
    if (from + 1 >= list.length) finishBatch();
    else setIndex(from + 1);
  }, [finishBatch]);

  const submit = useCallback(async (rating: Rating) => {
    const card = cards[index];
    if (!card || !token || savingRef.current || !revealed || authBlocked) return;
    pendingRatingRef.current = rating;
    const requestId = requestIdRef.current || crypto.randomUUID();
    requestIdRef.current = requestId;
    savingRef.current = true;
    setSaving(true);
    setMessage(null);
    setCanRetry(false);
    try {
      const resp = await fetch(`${getApiUrl()}/api/vocabulary/srs/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sense_id: card.senseId,
          rating,
          client_request_id: requestId,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.status === 401) {
        setAuthBlocked(true);
        setMessage('Войдите снова, чтобы сохранить оценку');
        return;
      }
      if (resp.status === 404) {
        setMessage('Это слово уже нельзя повторить');
        advance(index, cards);
        return;
      }
      if (resp.status === 409 && data?.error === 'Card is not due yet') {
        setMessage('Это слово повторять рано');
        advance(index, cards);
        return;
      }
      if (resp.status === 409) {
        setMessage('Слово уже обновилось. Пачка собрана заново');
        await loadQueue(token, true);
        return;
      }
      if (!resp.ok || (data?.status !== 'applied' && data?.status !== 'replayed')) {
        setMessage('Оценка не сохранилась');
        setCanRetry(true);
        return;
      }
      advance(index, cards);
    } catch {
      setMessage('Оценка не сохранилась');
      setCanRetry(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [advance, authBlocked, cards, index, loadQueue, revealed, token]);

  const speak = useCallback(async () => {
    const card = cards[index];
    if (!card || !token || speaking) return;
    setSpeaking(true);
    setMessage((prev) => (prev === 'Не удалось озвучить' ? null : prev));
    try {
      const resp = await fetch(`${getApiUrl()}/api/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: card.headword, language: learningLanguage, voice: ttsVoice }),
      });
      if (!resp.ok) throw new Error('tts');
      const blob = await resp.blob();
      if (!blob.size) throw new Error('empty');
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.pause();
      audioRef.current.src = url;
      await audioRef.current.play();
    } catch {
      setMessage('Не удалось озвучить');
    } finally {
      setSpeaking(false);
    }
  }, [cards, index, learningLanguage, speaking, token, ttsVoice]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        leave();
        return;
      }
      if (phase !== 'card' || savingRef.current || authBlocked) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        setMessage(null);
        setRevealed(true);
        return;
      }
      if (!revealed) return;
      const rating = RATINGS.find((item) => item.key === event.key);
      if (!rating) return;
      event.preventDefault();
      void submit(rating.rating);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [authBlocked, leave, phase, revealed, submit]);

  const card = cards[index];
  const practiceIds = cards.slice(0, 5).map((item) => item.senseId).join(',');

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', width: '100%' }}>
      <section
        style={{
          borderRadius: '1.75rem',
          padding: '1.75rem',
          background: 'linear-gradient(135deg, var(--card) 0%, var(--card-strong) 100%)',
          border: '1px solid var(--stroke)',
          boxShadow: 'var(--shadow-soft)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          minHeight: 320,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Повторение</h2>
          <button type="button" onClick={leave} disabled={saving} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: saving ? 'default' : 'pointer' }}>
            К словарю
          </button>
        </div>

        {phase === 'loading' && (
          <div>
            <p style={{ margin: '0 0 0.75rem', color: 'var(--text-muted)' }}>Собираем слова</p>
            {[0, 1, 2].map((bar) => (
              <div key={bar} style={{ height: 14, borderRadius: 8, background: 'var(--stroke)', marginBottom: 8, opacity: 0.7 }} />
            ))}
          </div>
        )}

        {phase === 'error' && (
          <div>
            <p style={{ margin: 0 }}>{message || 'Не удалось собрать слова'}</p>
            {!authBlocked && (
              <button type="button" onClick={() => token && void loadQueue(token)} style={{ ...buttonStyle, marginTop: 12 }}>
                Попробовать снова
              </button>
            )}
          </div>
        )}

        {phase === 'empty' && (
          <div>
            <p style={{ margin: 0 }}>Сейчас нечего повторять</p>
            <button type="button" onClick={leave} style={{ ...buttonStyle, marginTop: 12 }}>К словарю</button>
          </div>
        )}

        {phase === 'done' && (
          <div>
            <p style={{ margin: 0 }}>На сегодня слова разобраны</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {practiceIds && (
                <button type="button" onClick={() => router.push(`/dashboard?tab=agent&senses=${practiceIds}`)} style={buttonStyle}>
                  Сказать эти слова
                </button>
              )}
              <button type="button" onClick={leave} style={buttonStyle}>К словарю</button>
            </div>
          </div>
        )}

        {phase === 'card' && card && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>{index + 1} из {cards.length}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1.2 }}>{card.headword}</div>
              <button type="button" onClick={() => void speak()} disabled={speaking || !token} aria-label="Озвучить слово" style={{ ...buttonStyle, width: 40, height: 40, borderRadius: '50%', padding: 0 }}>
                {speaking ? '…' : '♪'}
              </button>
            </div>
            {card.partOfSpeech && <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>{card.partOfSpeech}</p>}
            {card.contextText && <p style={{ margin: 0, fontSize: '0.95rem' }}>{card.contextText}</p>}
            {!revealed ? (
              <button type="button" onClick={() => { setMessage(null); setRevealed(true); }} disabled={authBlocked} style={buttonStyle}>Показать перевод</button>
            ) : (
              <>
                <p style={{ margin: 0, paddingTop: 8, borderTop: '1px solid var(--stroke)' }}>{card.glossRu}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {RATINGS.map((item) => (
                    <button key={item.rating} type="button" disabled={saving || authBlocked} onClick={() => void submit(item.rating)} style={{ ...buttonStyle, width: '100%' }}>
                      {saving && pendingRatingRef.current === item.rating ? 'Сохраняем…' : item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            {message && <p style={{ margin: 0, fontSize: '0.85rem' }}>{message}</p>}
            {canRetry && (
              <button type="button" disabled={saving} onClick={() => void submit(pendingRatingRef.current)} style={buttonStyle}>
                Отправить ещё раз
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
