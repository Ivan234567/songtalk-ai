'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export type TranslatorDirection = 'en-ru' | 'ru-en';

export type TranslatorHistoryItem = {
  input: string;
  output: string;
  direction: TranslatorDirection;
  ts: number;
};

type TranslatorPanelProps = {
  onClose: () => void;
  token: string | null;
  userId: string | null;
  getApiUrl: () => string;
};

export function TranslatorPanel({ onClose, token, userId, getApiUrl }: TranslatorPanelProps) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; startX: number; startY: number; boxW: number; boxH: number } | null>(null);
  const resizeStartRef = useRef<{ x: number; y: number; startW: number; startH: number; handle: 'e' | 's' | 'se' } | null>(null);
  const sizeRef = useRef<{ width: number; height: number } | null>(null);
  const positionRef = useRef<{ x: number; y: number } | null>(null);

  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<TranslatorDirection>('en-ru');
  const [history, setHistory] = useState<TranslatorHistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [addingToDictionary, setAddingToDictionary] = useState(false);
  const [dictionaryError, setDictionaryError] = useState<string | null>(null);
  const [dictionarySuccess, setDictionarySuccess] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectedTextSource, setSelectedTextSource] = useState<'input' | 'output' | null>(null);
  const outputTextareaRef = useRef<HTMLTextAreaElement>(null);
  const inputTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const defaultW = Math.min(720, W - 48);
    const defaultH = Math.min(520, H - 48);
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
    if (!userId) return;
    let mounted = true;
    setHistoryLoading(true);
    setHistoryError(null);
    supabase
      .from('translator_history')
      .select('input_text, output_text, direction, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data, error: err }) => {
        if (!mounted) return;
        setHistoryLoading(false);
        if (err) {
          setHistoryError('Не удалось загрузить историю');
          return;
        }
        const list = (data || []).map((row) => ({
          input: row.input_text,
          output: row.output_text,
          direction: row.direction as TranslatorDirection,
          ts: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
        }));
        setHistory(list);
      });
    return () => {
      mounted = false;
    };
  }, [userId]);

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
        const minH = 320;
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

  const runTranslation = useCallback(async () => {
    if (!input.trim() || !token) return;
    setLoading(true);
    setError(null);
    setOutput('');
    const systemPrompt =
      direction === 'en-ru'
        ? 'You are a helpful translator. Translate the user text from English to Russian. Preserve meaning and tone. Output only the translation.'
        : 'You are a helpful translator. Translate the user text from Russian to English. Preserve meaning and tone. Output only the translation.';
    let fullReply = '';
    try {
      const resp = await fetch(`${getApiUrl()}/api/agent/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: input.trim() },
          ],
          max_tokens: 800,
        }),
      });

      if (!resp.ok || !resp.body) {
        const j = await resp.json().catch(() => ({}));
        setError(j?.error || `Ошибка ${resp.status}`);
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
            if (data.type === 'chunk' && typeof data.delta === 'string') {
              fullReply += data.delta;
            } else if (data.type === 'done') {
              break;
            } else if (data.type === 'error') {
              setError(data.message || 'Ошибка');
              setLoading(false);
              return;
            }
          } catch {
            /* ignore */
          }
        }
      }

      const trimmed = fullReply.trim();
      setOutput(trimmed);
      setSelectedText(''); // Очищаем выделение при новом переводе
      setSelectedTextSource(null);
      if (trimmed) {
        const inputSnapshot = input.trim();
        if (userId) {
          const { data, error: insertErr } = await supabase
            .from('translator_history')
            .insert({
              user_id: userId,
              input_text: inputSnapshot,
              output_text: trimmed,
              direction,
            })
            .select('created_at')
            .single();
          if (insertErr) {
            setHistoryError('Не удалось сохранить в историю');
          } else {
            const createdAt = data?.created_at ? new Date(data.created_at).getTime() : Date.now();
            setHistory((prev) => [
              { input: inputSnapshot, output: trimmed, direction, ts: createdAt },
              ...prev,
            ]);
          }
        } else {
          setHistory((prev) => [
            { input: inputSnapshot, output: trimmed, direction, ts: Date.now() },
            ...prev,
          ]);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сети');
    } finally {
      setLoading(false);
    }
  }, [direction, input, token, userId, getApiUrl]);

  // Функция для получения выделенного текста
  const getSelectedText = useCallback((): string => {
    if (typeof window === 'undefined') return '';
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return '';
    return selection.toString().trim();
  }, []);

  // Функция для проверки выделения в textarea
  const checkSelection = useCallback(() => {
    const outputTextarea = outputTextareaRef.current;
    const inputTextarea = inputTextareaRef.current;
    
    if (!outputTextarea && !inputTextarea) return;
    
    // Проверяем выделение в output textarea
    if (outputTextarea) {
      const start = outputTextarea.selectionStart;
      const end = outputTextarea.selectionEnd;
      if (start !== end && start >= 0 && end > start) {
        const selected = outputTextarea.value.substring(start, end).trim();
        if (selected) {
          console.log('Selection detected in output:', selected);
          setSelectedText(selected);
          setSelectedTextSource('output');
          if (dictionaryError) {
            setDictionaryError(null);
          }
          return;
        }
      }
    }
    
    // Проверяем выделение в input textarea
    if (inputTextarea) {
      const start = inputTextarea.selectionStart;
      const end = inputTextarea.selectionEnd;
      if (start !== end && start >= 0 && end > start) {
        const selected = inputTextarea.value.substring(start, end).trim();
        if (selected) {
          console.log('Selection detected in input:', selected);
          setSelectedText(selected);
          setSelectedTextSource('input');
          if (dictionaryError) {
            setDictionaryError(null);
          }
          return;
        }
      }
    }
    
    // Если выделения нет, очищаем
    setSelectedText('');
    setSelectedTextSource(null);
  }, [dictionaryError]);

  // Обновляем выделенный текст при изменении выделения
  useEffect(() => {
    const handleSelectionChange = () => {
      checkSelection();
    };

    // Используем несколько событий для надежности
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('mouseup', handleSelectionChange);
    document.addEventListener('keyup', handleSelectionChange);
    
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('mouseup', handleSelectionChange);
      document.removeEventListener('keyup', handleSelectionChange);
    };
  }, [checkSelection]);

  // Функция для получения Supabase токена (для vocabulary API)
  const getSupabaseToken = useCallback(async (): Promise<string | null> => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      return sessionData.session?.access_token || null;
    } catch (e) {
      console.error('Error getting Supabase token:', e);
      return null;
    }
  }, []);

  // Функция для получения актуального backend токена (для agent API)
  const getBackendToken = useCallback(async (): Promise<string | null> => {
    // Сначала проверяем переданный токен
    if (token) {
      return token;
    }
    
    // Если токена нет, пытаемся получить из localStorage
    if (typeof window !== 'undefined') {
      const storedToken = window.localStorage.getItem('backend_jwt');
      if (storedToken) {
        return storedToken;
      }
    }
    
    // Если токена нет, пытаемся обменять Supabase токен на backend токен
    try {
      const supabaseToken = await getSupabaseToken();
      if (supabaseToken) {
        const resp = await fetch(`${getApiUrl()}/api/auth/exchange-supabase-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ supabase_token: supabaseToken }),
        });
        if (resp.ok) {
          const json = await resp.json().catch(() => ({}));
          if (json?.token) {
            window.localStorage.setItem('backend_jwt', json.token);
            return json.token;
          }
        }
      }
    } catch (e) {
      console.error('Error exchanging token:', e);
    }
    
    return null;
  }, [token, getApiUrl, getSupabaseToken]);

  // Функция для определения типа фразы и получения информации через AI
  const analyzePhraseWithAI = useCallback(async (phrase: string): Promise<{
    type: 'word' | 'idiom' | 'phrasal_verb';
    data: any;
  }> => {
    const backendToken = await getBackendToken();
    if (!backendToken) throw new Error('Необходима авторизация');

    const prompt = `Проанализируй английскую фразу "${phrase}" и определи:
1. Является ли это отдельным словом (word)
2. Является ли это идиомой (idiom) 
3. Является ли это фразовым глаголом (phrasal_verb)

Верни JSON строго в следующем формате:
{
  "type": "word" | "idiom" | "phrasal_verb",
  "word": "слово (если type=word)",
  "phrase": "фраза (если type=idiom или phrasal_verb)",
  "translations": ["перевод1", "перевод2"],
  "literal_translation": "дословный перевод (для идиом и фразовых глаголов)",
  "meaning": "значение на русском",
  "usage_examples": ["пример1", "пример2"],
  "part_of_speech": "noun|verb|adjective|adverb|... (для слов)",
  "difficulty_level": "A1|A2|B1|B2|C1|C2"
}

Отвечай только JSON, без дополнительного текста.`;

    try {
      const resp = await fetch(`${getApiUrl()}/api/agent/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${backendToken}`,
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'Ты преподаватель английского языка. Отвечай строго в формате JSON, без дополнительного текста и без markdown.',
            },
            { role: 'user', content: prompt },
          ],
          max_tokens: 1000,
        }),
      });

      if (!resp.ok || !resp.body) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j?.error || `Ошибка ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullReply = '';

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
            if (data.type === 'chunk' && typeof data.delta === 'string') {
              fullReply += data.delta;
            } else if (data.type === 'done') {
              break;
            } else if (data.type === 'error') {
              throw new Error(data.message || 'Ошибка');
            }
          } catch {
            /* ignore */
          }
        }
      }

      const trimmed = fullReply.trim();
      // Извлекаем JSON из ответа (может быть в markdown коде)
      let jsonText = trimmed;
      const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonText);
      return {
        type: parsed.type || 'word',
        data: parsed,
      };
    } catch (e) {
      console.error('Error analyzing phrase:', e);
      throw e;
    }
  }, [getApiUrl, getBackendToken]);

  // Функция добавления в словарь
  const addToDictionary = useCallback(async () => {
    if (!userId) {
      setDictionaryError('Необходимо войти в систему');
      return;
    }

    // Получаем Supabase токен для vocabulary API
    const supabaseToken = await getSupabaseToken();
    if (!supabaseToken) {
      setDictionaryError('Не удалось получить токен авторизации. Попробуйте перезагрузить страницу.');
      return;
    }

    // Получаем выделенный текст из состояния или напрямую из textarea
    let currentSelected = selectedText;
    if (!currentSelected) {
      // Пытаемся получить выделение напрямую из textarea
      const outputTextarea = outputTextareaRef.current;
      const inputTextarea = inputTextareaRef.current;
      
      if (outputTextarea && outputTextarea.selectionStart !== outputTextarea.selectionEnd) {
        currentSelected = outputTextarea.value.substring(
          outputTextarea.selectionStart,
          outputTextarea.selectionEnd
        ).trim();
      } else if (inputTextarea && inputTextarea.selectionStart !== inputTextarea.selectionEnd) {
        currentSelected = inputTextarea.value.substring(
          inputTextarea.selectionStart,
          inputTextarea.selectionEnd
        ).trim();
      }
    }
    
    if (!currentSelected) {
      setDictionaryError('Выделите слово, идиому или фразовый глагол для добавления в словарь');
      return;
    }

    // Определяем английский текст для контекста
    // Для en-ru: английский в input, русский в output
    // Для ru-en: русский в input, английский в output
    let englishText = '';
    if (direction === 'en-ru') {
      // Если выделение в input - это английский, используем input как контекст
      // Если выделение в output - это русский, но нам нужен английский из input
      englishText = input;
    } else {
      // Если выделение в output - это английский, используем output как контекст
      // Если выделение в input - это русский, но нам нужен английский из output
      englishText = output;
    }
    
    if (!englishText.trim()) {
      setDictionaryError('Необходимо выполнить перевод перед добавлением в словарь');
      return;
    }

    // Проверяем, что выделенный текст содержит английские буквы
    const hasEnglishLetters = /[a-zA-Z]/.test(currentSelected);
    if (!hasEnglishLetters) {
      setDictionaryError('Выделите английское слово, идиому или фразовый глагол');
      return;
    }

    setAddingToDictionary(true);
    setDictionaryError(null);
    setDictionarySuccess(null);

    try {
      // Анализируем фразу через AI для определения типа (слово/идиома/фразовый глагол)
      console.log('Анализируем фразу через AI:', currentSelected);
      const analysis = await analyzePhraseWithAI(currentSelected);
      console.log('AI определил тип:', analysis.type, 'Данные:', analysis.data);

      if (analysis.type === 'word') {
        // Добавляем слово в словарь
        const word = analysis.data.word || currentSelected.trim().toLowerCase();
        const response = await fetch(`${getApiUrl()}/api/vocabulary/add`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseToken}`,
          },
          body: JSON.stringify({
            word: word,
            context: englishText,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Ошибка ${response.status}`);
        }

        setDictionarySuccess(`Слово "${word}" добавлено в словарь`);
        // Очищаем выделение после успешного добавления
        window.getSelection()?.removeAllRanges();
        setSelectedText('');
        setSelectedTextSource(null);
      } else if (analysis.type === 'idiom') {
        // Добавляем идиому в словарь
        const phrase = analysis.data.phrase || currentSelected.trim();
        const response = await fetch(`${getApiUrl()}/api/vocabulary/idioms/add`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseToken}`,
          },
          body: JSON.stringify({
            phrase: phrase,
            literal_translation: analysis.data.literal_translation || null,
            meaning: analysis.data.meaning || null,
            usage_examples: analysis.data.usage_examples || [],
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Ошибка ${response.status}`);
        }

        setDictionarySuccess(`Идиома "${phrase}" добавлена в словарь`);
        // Очищаем выделение после успешного добавления
        window.getSelection()?.removeAllRanges();
        setSelectedText('');
        setSelectedTextSource(null);
      } else if (analysis.type === 'phrasal_verb') {
        // Добавляем фразовый глагол в словарь
        const phrase = analysis.data.phrase || currentSelected.trim();
        const response = await fetch(`${getApiUrl()}/api/vocabulary/phrasal-verbs/add`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseToken}`,
          },
          body: JSON.stringify({
            phrase: phrase,
            literal_translation: analysis.data.literal_translation || null,
            meaning: analysis.data.meaning || null,
            usage_examples: analysis.data.usage_examples || [],
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Ошибка ${response.status}`);
        }

        setDictionarySuccess(`Фразовый глагол "${phrase}" добавлен в словарь`);
        // Очищаем выделение после успешного добавления
        window.getSelection()?.removeAllRanges();
        setSelectedText('');
        setSelectedTextSource(null);
      }
    } catch (e) {
      console.error('Error adding to dictionary:', e);
      setDictionaryError(e instanceof Error ? e.message : 'Ошибка при добавлении в словарь');
      setAddingToDictionary(false);
    }
  }, [userId, direction, input, output, selectedText, selectedTextSource, getSelectedText, analyzePhraseWithAI, getApiUrl, getSupabaseToken]);

  // Очищаем сообщение об успехе через 5 секунд
  useEffect(() => {
    if (dictionarySuccess) {
      const timer = setTimeout(() => setDictionarySuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [dictionarySuccess]);

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
          width: size?.width ?? 720,
          height: size?.height ?? 520,
          minWidth: 320,
          minHeight: 320,
          maxWidth: '100vw',
          maxHeight: '100vh',
          borderRadius: 16,
          border: '1px solid var(--sidebar-border)',
          background: 'var(--sidebar-bg)',
          color: 'var(--sidebar-text)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          overflow: 'hidden',
          pointerEvents: 'auto',
        }}
      >
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
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', cursor: 'move' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 5h12" />
              <path d="M9 3v2" />
              <path d="M4 12h6" />
              <path d="M13 16l4 4 4-4" />
              <path d="M13 20h8" />
              <path d="M5 5c1.5 3.5 4 6 7 7" />
              <path d="M12 5c-1.5 3.5-4 6-7 7" />
            </svg>
            <span style={{ fontWeight: 600 }}>Переводчик</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Скрыть"
            title="Скрыть окно переводчика"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--sidebar-text)',
              cursor: 'pointer',
              opacity: 0.7,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.8125rem', opacity: 0.8 }}>Направление:</label>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as TranslatorDirection)}
            style={{
              padding: '0.4rem 0.6rem',
              borderRadius: 8,
              border: '1px solid var(--sidebar-border)',
              background: 'var(--sidebar-hover)',
              color: 'var(--sidebar-text)',
              fontSize: '0.8125rem',
            }}
          >
            <option value="en-ru">English → Русский</option>
            <option value="ru-en">Русский → English</option>
          </select>
          <button
            type="button"
            onClick={() => setDirection((d) => (d === 'en-ru' ? 'ru-en' : 'en-ru'))}
            style={{
              padding: '0.35rem 0.6rem',
              borderRadius: 8,
              border: '1px solid var(--sidebar-border)',
              background: 'var(--sidebar-hover)',
              color: 'var(--sidebar-text)',
              fontSize: '0.8125rem',
              cursor: 'pointer',
            }}
          >
            ⇄
          </button>
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            disabled={history.length === 0}
            style={{
              padding: '0.35rem 0.8rem',
              borderRadius: 8,
              border: '1px solid var(--sidebar-border)',
              background: 'var(--sidebar-hover)',
              color: 'var(--sidebar-text)',
              fontSize: '0.8125rem',
              cursor: history.length === 0 ? 'default' : 'pointer',
              opacity: history.length === 0 ? 0.5 : 0.9,
            }}
          >
            История
          </button>
        </div>

        <textarea
          ref={inputTextareaRef}
          placeholder="Введите текст для перевода…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runTranslation();
          }}
          onMouseUp={checkSelection}
          onSelect={checkSelection}
          rows={5}
          style={{
            width: '100%',
            resize: 'vertical',
            padding: '0.75rem',
            borderRadius: 10,
            border: '1px solid var(--sidebar-border)',
            background: 'var(--sidebar-hover)',
            color: 'var(--sidebar-text)',
            fontSize: '0.95rem',
            lineHeight: 1.5,
            cursor: 'text',
            userSelect: 'text',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={runTranslation}
            disabled={loading || !input.trim()}
            style={{
              '--accent': '#7ad7a7',
              '--accent-strong': '#58c18f',
              '--accent-soft': 'rgba(122, 215, 167, 0.16)',
              padding: '0.55rem 0.9rem',
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
            {loading ? 'Переводим…' : 'Перевести'}
          </button>
          <button
            type="button"
            onClick={() => {
              setInput('');
              setOutput('');
              setError(null);
              setSelectedText('');
              setSelectedTextSource(null);
              setDictionaryError(null);
              setDictionarySuccess(null);
            }}
            style={{
              padding: '0.55rem 0.9rem',
              borderRadius: 10,
              border: '1px solid var(--sidebar-border)',
              background: 'var(--sidebar-hover)',
              color: 'var(--sidebar-text)',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Очистить
          </button>
          <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Ctrl/⌘+Enter</span>
        </div>

        {error && (
          <div style={{ fontSize: '0.8125rem', color: 'rgba(239, 68, 68, 0.9)' }}>{error}</div>
        )}

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <textarea
            ref={outputTextareaRef}
            placeholder="Здесь появится перевод…"
            value={output}
            readOnly={false}
            rows={5}
            onMouseUp={checkSelection}
            onSelect={checkSelection}
            onFocus={(e) => {
              // При фокусе проверяем выделение
              setTimeout(checkSelection, 10);
            }}
            onChange={() => {}} // Предотвращаем изменение, но не делаем readOnly
            onKeyDown={(e) => {
              // Предотвращаем редактирование, но разрешаем выделение
              if (e.key !== 'Tab' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
              }
            }}
            style={{
              width: '100%',
              resize: 'vertical',
              padding: '0.75rem',
              borderRadius: 10,
              border: '1px solid var(--sidebar-border)',
              background: 'rgba(15, 23, 42, 0.25)',
              color: 'var(--sidebar-text)',
              fontSize: '0.95rem',
              lineHeight: 1.5,
              cursor: 'text',
              userSelect: 'text',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Button clicked, selectedText:', selectedText);
                addToDictionary();
              }}
              disabled={addingToDictionary || !selectedText || (direction === 'en-ru' ? !input.trim() : !output.trim())}
              style={{
                '--accent': '#7ad7a7',
                '--accent-strong': '#58c18f',
                '--accent-soft': 'rgba(122, 215, 167, 0.16)',
                padding: '0.5rem 0.9rem',
                borderRadius: 10,
                border: '1px solid var(--accent-strong)',
                background: 'var(--accent-soft)',
                color: 'var(--accent-strong)',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: addingToDictionary || !selectedText ? 'default' : 'pointer',
                opacity: addingToDictionary || !selectedText ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              {addingToDictionary ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                    <line x1="12" y1="2" x2="12" y2="6" />
                    <line x1="12" y1="18" x2="12" y2="22" />
                    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                    <line x1="2" y1="12" x2="6" y2="12" />
                    <line x1="18" y1="12" x2="22" y2="12" />
                    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
                    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                  </svg>
                  Анализируем и добавляем…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  Добавить в словарь
                </>
              )}
            </button>
            {dictionarySuccess && (
              <div style={{ fontSize: '0.8125rem', color: 'rgba(34, 197, 94, 0.9)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {dictionarySuccess}
              </div>
            )}
            {dictionaryError && (
              <div style={{ fontSize: '0.8125rem', color: 'rgba(239, 68, 68, 0.9)' }}>{dictionaryError}</div>
            )}
          </div>
          {((direction === 'en-ru' && input.trim()) || (direction === 'ru-en' && output.trim())) && !selectedText && (
            <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>
              {direction === 'en-ru' 
                ? 'Выделите английское слово, идиому или фразовый глагол в поле ввода для добавления в словарь'
                : 'Выделите английское слово, идиому или фразовый глагол в поле перевода для добавления в словарь'}
            </div>
          )}
        </div>

        {historyOpen && (
          <div
            style={{
              position: 'absolute',
              inset: '1rem',
              borderRadius: 14,
              border: '1px solid var(--sidebar-border)',
              background: 'var(--sidebar-bg)',
              color: 'var(--sidebar-text)',
              boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              zIndex: 2,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 5h12" />
                  <path d="M9 3v2" />
                  <path d="M4 12h6" />
                  <path d="M13 16l4 4 4-4" />
                  <path d="M13 20h8" />
                  <path d="M5 5c1.5 3.5 4 6 7 7" />
                  <path d="M12 5c-1.5 3.5-4 6-7 7" />
                </svg>
                <span style={{ fontWeight: 600 }}>История переводов</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={async () => {
                    if (!userId) {
                      setHistory([]);
                      return;
                    }
                    const { error: delErr } = await supabase
                      .from('translator_history')
                      .delete()
                      .eq('user_id', userId);
                    if (delErr) {
                      setHistoryError('Не удалось очистить историю');
                      return;
                    }
                    setHistory([]);
                  }}
                  disabled={history.length === 0}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--sidebar-text)',
                    fontSize: '0.75rem',
                    cursor: history.length === 0 ? 'default' : 'pointer',
                    opacity: history.length === 0 ? 0.4 : 0.8,
                  }}
                >
                  Очистить
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  aria-label="Закрыть историю"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--sidebar-text)',
                    cursor: 'pointer',
                    opacity: 0.7,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            </div>
            {historyLoading ? (
              <p style={{ fontSize: '0.85rem', opacity: 0.7, margin: 0 }}>Загрузка…</p>
            ) : history.length === 0 ? (
              <p style={{ fontSize: '0.85rem', opacity: 0.7, margin: 0 }}>История пуста — перевода ещё не было.</p>
            ) : (
              <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {history.map((h, i) => (
                  <button
                    key={`${h.ts}-${i}`}
                    type="button"
                    onClick={() => {
                      setInput(h.input);
                      setOutput(h.output);
                      setDirection(h.direction);
                      setHistoryOpen(false);
                    }}
                    style={{
                      textAlign: 'left',
                      border: '1px solid var(--sidebar-border)',
                      background: 'var(--sidebar-bg)',
                      color: 'var(--sidebar-text)',
                      borderRadius: 10,
                      padding: '0.5rem 0.6rem',
                      cursor: 'pointer',
                      fontSize: '0.8125rem',
                      lineHeight: 1.4,
                    }}
                  >
                    <div style={{ opacity: 0.7, marginBottom: 2 }}>
                      {h.direction === 'en-ru' ? 'EN → RU' : 'RU → EN'} · {new Date(h.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{h.input}</div>
                  </button>
                ))}
              </div>
            )}
            {historyError && (
              <div style={{ fontSize: '0.8rem', color: 'rgba(239, 68, 68, 0.9)' }}>{historyError}</div>
            )}
          </div>
        )}

        {/* Ручки ресайза */}
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
