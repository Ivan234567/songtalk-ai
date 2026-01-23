'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

type CallState = 'idle' | 'recording' | 'transcribing' | 'ai_thinking' | 'ai_speaking' | 'ready';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

function getApiUrl() {
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
}

function getBackendToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('backend_jwt');
}

// Функция для обновления backend JWT при истечении (вызывается при 401 ошибке)
async function refreshBackendToken(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const supabaseToken = session?.access_token;
    if (!supabaseToken) return null;

    const apiUrl = getApiUrl();
    const resp = await fetch(`${apiUrl}/api/auth/exchange-supabase-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supabase_token: supabaseToken }),
      signal: AbortSignal.timeout(10000),
    });

    if (resp.ok) {
      const data = await resp.json().catch(() => null);
      if (data?.token) {
        window.localStorage.setItem('backend_jwt', data.token);
        return data.token;
      }
    }
  } catch (e) {
    console.warn('[CallTab] Failed to refresh backend JWT:', e);
  }
  return null;
}

export const CallTab: React.FC = () => {
  const [callState, setCallState] = useState<CallState>('idle');
  const [isInCall, setIsInCall] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentStatus, setCurrentStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const messagesHistoryRef = useRef<Message[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const getSession = async () => {
      // Приоритет: используем уже сохранённый backend JWT, если он есть
      const backendToken = getBackendToken();
      if (backendToken) {
        console.log('[CallTab] Using existing backend JWT from localStorage');
        setAccessToken(backendToken);
        return;
      }

      console.log('[CallTab] No backend JWT found, attempting to exchange Supabase token...');

      // Если JWT нет, пытаемся получить Supabase сессию и обменять токен
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('[CallTab] Supabase session error:', error.message);
          setError('Не удалось получить сессию. Пожалуйста, войдите заново.');
          setAccessToken(null);
          return;
        }

        if (!session?.access_token) {
          console.error('[CallTab] No Supabase access token in session');
          setError('Сессия истекла. Пожалуйста, войдите заново.');
          setAccessToken(null);
          return;
        }

        const supabaseToken = session.access_token;
        console.log('[CallTab] Attempting to exchange Supabase token for backend JWT...');
        
        try {
          const apiUrl = getApiUrl();
          const resp = await fetch(`${apiUrl}/api/auth/exchange-supabase-token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ supabase_token: supabaseToken }),
            // Увеличиваем таймаут до 15 секунд для Supabase
            signal: AbortSignal.timeout(15000),
          });

          if (!resp.ok) {
            const errorData = await resp.json().catch(() => ({}));
            console.error('[CallTab] Exchange failed:', resp.status, errorData);
            setError(`Не удалось получить токен доступа: ${errorData?.error || `HTTP ${resp.status}`}. Попробуйте обновить страницу.`);
            setAccessToken(null);
            return;
          }

          const data = await resp.json().catch(() => null);
          if (!data?.token) {
            console.error('[CallTab] Exchange response missing token:', data);
            setError('Неверный ответ от сервера. Попробуйте обновить страницу.');
            setAccessToken(null);
            return;
          }

          console.log('[CallTab] Successfully exchanged token, saving to localStorage');
          window.localStorage.setItem('backend_jwt', data.token);
          setAccessToken(data.token);
          setError(null); // Очищаем ошибки при успехе
        } catch (e: any) {
          console.error('[CallTab] Exchange request failed:', e);
          if (e.name === 'AbortError' || e.message?.includes('timeout')) {
            setError('Таймаут при получении токена. Supabase может быть недоступен. Попробуйте позже.');
          } else {
            setError(`Ошибка при получении токена: ${e?.message || 'Неизвестная ошибка'}. Попробуйте обновить страницу.`);
          }
          setAccessToken(null);
        }
      } catch (e: any) {
        console.error('[CallTab] Failed to get Supabase session:', e);
        setError(`Ошибка при получении сессии: ${e?.message || 'Неизвестная ошибка'}. Пожалуйста, войдите заново.`);
        setAccessToken(null);
      }
    };
    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // При смене сессии Supabase:
      // 1. Если есть уже сохранённый backend JWT - используем его (не обмениваем повторно)
      // 2. Обмениваем только если JWT отсутствует
      const existingBackendToken = getBackendToken();
      if (existingBackendToken) {
        // Уже есть валидный JWT - используем его, не трогаем Supabase
        setAccessToken(existingBackendToken);
        return;
      }

      if (session?.access_token) {
        // JWT нет, но есть Supabase токен - пробуем обменять (но не блокируем, если Supabase недоступен)
        const supabaseToken = session.access_token;
        (async () => {
          try {
            const apiUrl = getApiUrl();
            const resp = await fetch(`${apiUrl}/api/auth/exchange-supabase-token`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ supabase_token: supabaseToken }),
              signal: AbortSignal.timeout(10000),
            });

            if (resp.ok) {
              const data = await resp.json().catch(() => null);
              if (data?.token) {
                window.localStorage.setItem('backend_jwt', data.token);
                setAccessToken(data.token);
                return;
              }
            }
          } catch (e: any) {
            // Не критично - если Supabase недоступен, но JWT уже есть, работаем с ним
            console.warn('[CallTab] Failed to refresh backend JWT (non-critical):', e?.message || e);
          }
          // Не сбрасываем accessToken в null, если уже был установлен ранее
          if (!existingBackendToken) {
            setAccessToken(null);
          }
        })();
      } else {
        // Пользователь вышел - очищаем всё
        window.localStorage.removeItem('backend_jwt');
        setAccessToken(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      stopCall();
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  const startCall = async () => {
    setIsInCall(true);
    setCallState('ready');
    setError(null);
    setCurrentStatus('Готов к разговору');
    messagesHistoryRef.current = [];
    setMessages([]);
  };

  const stopCall = () => {
    setIsInCall(false);
    setCallState('idle');
    setCurrentStatus('');
    setMessages([]);
    messagesHistoryRef.current = [];
    
    // Остановить запись
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        // Ignore errors
      }
    }
    
    // Остановить стрим
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Остановить аудио
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  };

  const startRecording = async () => {
    if (!accessToken || callState !== 'ready') return;

    try {
      setError(null);
      setCallState('recording');
      setCurrentStatus('Запись...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') 
        ? 'audio/webm' 
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/mp4';
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Останавливаем таймер
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        setRecordingDuration(0);
        
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        await processAudioInput(audioBlob);
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      };

      mediaRecorder.start();
      
      // Запускаем таймер длительности записи
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      setError('Не удалось получить доступ к микрофону. Проверьте разрешения.');
      setCallState('ready');
      setCurrentStatus('Ошибка доступа к микрофону');
      console.error('Recording error:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && callState === 'recording') {
      mediaRecorderRef.current.stop();
    }
    // Останавливаем таймер
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setRecordingDuration(0);
  };

  const processAudioInput = async (audioBlob: Blob) => {
    if (!accessToken) return;

    // Шаг 1: Распознавание речи (Whisper)
    setCallState('transcribing');
    setCurrentStatus('Распознавание речи...');
    
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      let transcribeResponse = await fetch(`${getApiUrl()}/api/transcribe`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      // Если получили 401 (токен истёк), пробуем обновить токен и повторить запрос
      if (transcribeResponse.status === 401) {
        console.log('[CallTab] Transcribe returned 401, refreshing token...');
        const newToken = await refreshBackendToken();
        if (newToken) {
          setAccessToken(newToken);
          // Повторяем запрос с новым токеном
          transcribeResponse = await fetch(`${getApiUrl()}/api/transcribe`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${newToken}`,
            },
            body: formData,
          });
        } else {
          throw new Error('Токен истёк и не удалось его обновить. Пожалуйста, обновите страницу.');
        }
      }

      if (!transcribeResponse.ok) {
        const data = await transcribeResponse.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${transcribeResponse.status}`);
      }

      const transcribeData = await transcribeResponse.json();
      if (!transcribeData.ok || !transcribeData.text) {
        throw new Error(transcribeData?.error || 'Не удалось распознать речь');
      }

      const userText = transcribeData.text.trim();
      if (!userText) {
        setCallState('ready');
        setCurrentStatus('Готов к разговору');
        return;
      }

      // Добавляем сообщение пользователя
      const userMessage: Message = { role: 'user', content: userText };
      messagesHistoryRef.current = [...messagesHistoryRef.current, userMessage];
      setMessages(prev => [...prev, userMessage]);

      // Шаг 2: Отправка в AI
      setCallState('ai_thinking');
      setCurrentStatus('AI думает...');

      const apiMessages = messagesHistoryRef.current.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      // No timeout - allow long AI responses (up to 15 minutes as configured on backend)
      let chatResponse = await fetch(`${getApiUrl()}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messages: apiMessages,
          max_tokens: 2000,
        }),
      });

      // Если получили 401 (токен истёк), пробуем обновить токен и повторить запрос
      if (chatResponse.status === 401) {
        console.log('[CallTab] Chat returned 401, refreshing token...');
        const newToken = await refreshBackendToken();
        if (newToken) {
          setAccessToken(newToken);
          // Повторяем запрос с новым токеном (без таймаута для длительных ответов)
          chatResponse = await fetch(`${getApiUrl()}/api/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${newToken}`,
            },
            body: JSON.stringify({
              messages: apiMessages,
              max_tokens: 2000,
            }),
          });
        } else {
          throw new Error('Токен истёк и не удалось его обновить. Пожалуйста, обновите страницу.');
        }
      }

      if (!chatResponse.ok) {
        const data = await chatResponse.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${chatResponse.status}`);
      }

      const chatData = await chatResponse.json();
      if (!chatData.ok || !chatData.assistant?.content) {
        throw new Error('Неожиданный формат ответа от AI');
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: chatData.assistant.content,
      };
      messagesHistoryRef.current = [...messagesHistoryRef.current, assistantMessage];
      setMessages(prev => [...prev, assistantMessage]);

      // Шаг 3: Синтез речи (Coqui TTS) и воспроизведение
      setCallState('ai_speaking');
      setCurrentStatus('AI говорит...');

      await synthesizeAndPlay(assistantMessage.content);

      // Готово - ждем следующего ввода
      setCallState('ready');
      setCurrentStatus('Готов к разговору');
      
    } catch (err: any) {
      setError(err?.message || 'Ошибка обработки аудио');
      setCallState('ready');
      setCurrentStatus('Ошибка');
      console.error('Audio processing error:', err);
    }
  };

  const synthesizeAndPlay = async (text: string): Promise<void> => {
    if (!accessToken) return;

    // Проверка на английский текст
    const hasCyrillic = /[а-яА-ЯЁё]/.test(text);
    if (hasCyrillic) {
      setCurrentStatus('AI ответ содержит русский текст (TTS поддерживает только английский)');
      return;
    }

    // Remove emojis before sending to TTS (backend also does this, but doing it here too for safety)
    const textWithoutEmojis = text
      .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // Misc Symbols and Pictographs
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transport and Map
      .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '') // Flags (iOS)
      .replace(/[\u{2600}-\u{26FF}]/gu, '') // Misc symbols
      .replace(/[\u{2700}-\u{27BF}]/gu, '') // Dingbats
      .replace(/[\u{FE00}-\u{FE0F}]/gu, '') // Variation Selectors
      .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // Supplemental Symbols and Pictographs
      .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '') // Chess Symbols
      .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '') // Symbols and Pictographs Extended-A
      .trim()

    if (!textWithoutEmojis) {
      setCurrentStatus('AI ответ содержит только эмодзи (TTS не поддерживает эмодзи)');
      return;
    }

    try {
      // Пробуем с повторными попытками (TTS сервер может еще загружать модели)
      let response: Response | null = null;
      let lastError: any = null;
      
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) {
            setCurrentStatus(`Попытка синтеза речи (${attempt + 1}/3)...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          response = await fetch(`${getApiUrl()}/api/tts`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              text: textWithoutEmojis,
              model: 'tts_models/en/ljspeech/tacotron2-DDC',
            }),
          });

          if (response.ok) {
            break; // Успешно получили ответ
          }

          const errorData = await response.json().catch(() => ({}));
          lastError = new Error(errorData?.error || `HTTP ${response.status}`);
          
          // Если сервер вернул 500 или 502, пробуем еще раз
          if (response.status === 500 || response.status === 502) {
            if (attempt < 2) {
              continue; // Повторная попытка
            }
          } else {
            throw lastError; // Другие ошибки не повторяем
          }
        } catch (fetchErr: any) {
          lastError = fetchErr;
          
          // Если ошибка соединения, пробуем еще раз
          if (
            (fetchErr.name === 'TypeError' && fetchErr.message.includes('fetch')) ||
            fetchErr.code === 'ECONNREFUSED' ||
            fetchErr.name === 'AbortError'
          ) {
            if (attempt < 2) {
              continue; // Повторная попытка
            }
          }
          
          throw fetchErr;
        }
      }

      if (!response || !response.ok) {
        throw lastError || new Error('Не удалось получить ответ от TTS сервера');
      }

      const audioBlob = await response.blob();
      if (audioBlob.size === 0) {
        throw new Error('Получен пустой аудио файл');
      }

      // Получаем путь к файлу из заголовка (если файл новый, не кэшированный)
      const audioFilePath = response.headers.get('X-Audio-File-Path');

      // Остановить предыдущее воспроизведение, если оно идет
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      // Настройка обработчиков перед воспроизведением
      return new Promise((resolve, reject) => {
        const cleanup = () => {
          URL.revokeObjectURL(audioUrl);
          if (audioRef.current === audio) {
            audioRef.current = null;
          }
        };

        // Удаление файла на сервере после воспроизведения (только для новых файлов)
        const deleteAudioFile = async () => {
          if (audioFilePath && accessToken) {
            try {
              await fetch(`${getApiUrl()}/api/tts/file`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ filePath: audioFilePath }),
              });
            } catch (err) {
              // Не критично, если не удалось удалить - просто логируем
              console.warn('[CallTab] Failed to delete audio file after playback:', err);
            }
          }
        };

        audio.onloadeddata = () => {
          // Аудио загружено и готово к воспроизведению
          setCurrentStatus('Воспроизведение ответа AI...');
        };

        audio.onended = async () => {
          cleanup();
          // Удаляем файл на сервере после успешного воспроизведения
          await deleteAudioFile();
          resolve();
        };

        audio.onerror = async (e) => {
          console.error('Audio playback error:', e);
          cleanup();
          // Удаляем файл даже при ошибке воспроизведения
          await deleteAudioFile();
          reject(new Error('Ошибка воспроизведения аудио'));
        };

        // Автоматически запускаем воспроизведение
        audio.play()
          .then(() => {
            setCurrentStatus('AI говорит...');
          })
          .catch(async (playError) => {
            console.error('Error playing audio:', playError);
            cleanup();
            // Удаляем файл при ошибке запуска воспроизведения
            await deleteAudioFile();
            reject(new Error('Не удалось воспроизвести аудио. Возможно, требуется взаимодействие пользователя.'));
          });
      });
    } catch (err: any) {
      console.error('TTS error:', err);
      
      // Более понятные сообщения об ошибках
      let errorMessage = err?.message || 'Ошибка синтеза речи';
      
      if (errorMessage.includes('timeout') || errorMessage.includes('AbortError')) {
        errorMessage = 'TTS сервер не отвечает. Пожалуйста, подождите немного и попробуйте снова.';
      } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('Failed to connect')) {
        errorMessage = 'TTS сервер не запущен или еще загружает модели. Пожалуйста, подождите.';
      } else if (errorMessage.includes('english') || errorMessage.includes('English')) {
        errorMessage = 'TTS поддерживает только английский текст.';
      }
      
      throw new Error(errorMessage);
    }
  };

  const toggleMicrophone = () => {
    if (!isInCall) return;

    if (callState === 'recording') {
      stopRecording();
    } else if (callState === 'ready') {
      startRecording();
    }
  };

  if (!isInCall) {
    return (
      <div
        style={{
          borderRadius: '1.75rem',
          padding: '3rem',
          background: 'linear-gradient(135deg, #18181b 0%, #111827 100%)',
          border: '1px solid rgba(80,80,80,0.85)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2rem',
          height: '100%',
          minHeight: '500px',
        }}
      >
        <div
          style={{
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(168,85,247,0.25) 0%, rgba(129,140,248,0.25) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '4rem',
            border: '2px solid rgba(168,85,247,0.7)',
            boxShadow: '0 8px 32px rgba(168,85,247,0.4)',
          }}
        >
          📞
        </div>
        
        <div style={{ textAlign: 'center' }}>
          <h2
            style={{
              fontSize: '1.5rem',
              fontWeight: 600,
              marginBottom: '0.5rem',
              color: 'rgba(249,250,251,0.95)',
            }}
          >
            Звонок с AI
          </h2>
          <p style={{ fontSize: '1rem', color: 'rgba(148,163,184,0.9)' }}>
            Практикуйте разговорный английский с AI-репетитором
          </p>
        </div>

        <button
          onClick={startCall}
          disabled={!accessToken}
          style={{
            padding: '1rem 2.5rem',
            borderRadius: '2rem',
            border: 'none',
            background: accessToken
              ? 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)'
              : 'rgba(148,163,184,0.3)',
            color: 'rgba(249,250,251,0.95)',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: accessToken ? 'pointer' : 'not-allowed',
            boxShadow: accessToken ? '0 4px 16px rgba(168,85,247,0.5)' : 'none',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            if (accessToken) {
              e.currentTarget.style.transform = 'scale(1.05)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          {accessToken ? 'Начать звонок' : 'Загрузка...'}
        </button>

        {error && (
          <div
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '0.75rem',
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.4)',
              color: 'rgba(254,226,226,0.95)',
              fontSize: '0.9rem',
              maxWidth: '400px',
              textAlign: 'center',
            }}
          >
            {error}
          </div>
        )}
      </div>
    );
  }

  // Интерфейс звонка в стиле Zoom
  return (
    <div
      style={{
        borderRadius: '1.75rem',
        padding: '1.5rem',
        background: '#1a1a1a',
        border: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '500px',
      }}
    >
      {/* Заголовок */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <div>
          <h2
            style={{
              fontSize: '1.1rem',
              fontWeight: 600,
              color: 'rgba(249,250,251,0.95)',
              marginBottom: '0.25rem',
            }}
          >
            Звонок с AI
          </h2>
          <p
            style={{
              fontSize: '0.85rem',
              color: 'rgba(148,163,184,0.8)',
            }}
          >
            {currentStatus || 'Готов к разговору'}
          </p>
        </div>
        <div
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background:
              callState === 'recording'
                ? '#ef4444'
                : callState === 'transcribing' || callState === 'ai_thinking'
                ? '#fbbf24'
                : callState === 'ai_speaking'
                ? '#10b981'
                : '#6b7280',
            boxShadow:
              callState === 'recording'
                ? '0 0 12px rgba(239,68,68,0.6)'
                : 'none',
            animation: callState === 'recording' ? 'pulse 1.5s ease-in-out infinite' : 'none',
          }}
        />
      </div>

      {/* Область участников звонка */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          gap: '1rem',
          marginBottom: '1.5rem',
          minHeight: 0,
        }}
      >
        {/* Пользователь */}
        <div
          style={{
            flex: 1,
            borderRadius: '1rem',
            background: callState === 'recording' 
              ? 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.05) 100%)'
              : 'rgba(30,41,59,0.6)',
            border: `2px solid ${
              callState === 'recording'
                ? 'rgba(239,68,68,0.6)'
                : 'rgba(148,163,184,0.2)'
            }`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            position: 'relative',
            transition: 'all 0.3s ease',
          }}
        >
          <div
            style={{
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '3rem',
              marginBottom: '1rem',
              boxShadow: '0 8px 24px rgba(59,130,246,0.4)',
              border: callState === 'recording' 
                ? '4px solid rgba(239,68,68,0.8)'
                : '4px solid rgba(59,130,246,0.5)',
              animation: callState === 'recording' ? 'pulse 1.5s ease-in-out infinite' : 'none',
            }}
          >
            👤
          </div>
          <div
            style={{
              color: 'rgba(249,250,251,0.95)',
              fontSize: '1rem',
              fontWeight: 500,
              marginBottom: '0.5rem',
            }}
          >
            Вы
          </div>
          {callState === 'recording' && (
            <div
              style={{
                color: 'rgba(239,68,68,0.9)',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#ef4444',
                  animation: 'pulse 1s ease-in-out infinite',
                  boxShadow: '0 0 8px rgba(239,68,68,0.8)',
                }}
              />
              Запись... {recordingDuration > 0 && `(${Math.floor(recordingDuration / 60)}:${String(recordingDuration % 60).padStart(2, '0')})`}
            </div>
          )}
        </div>

        {/* AI */}
        <div
          style={{
            flex: 1,
            borderRadius: '1rem',
            background: callState === 'ai_speaking'
              ? 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(16,185,129,0.05) 100%)'
              : callState === 'ai_thinking'
              ? 'linear-gradient(135deg, rgba(251,191,36,0.15) 0%, rgba(251,191,36,0.05) 100%)'
              : 'rgba(30,41,59,0.6)',
            border: `2px solid ${
              callState === 'ai_speaking'
                ? 'rgba(16,185,129,0.6)'
                : callState === 'ai_thinking'
                ? 'rgba(251,191,36,0.6)'
                : 'rgba(148,163,184,0.2)'
            }`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            position: 'relative',
            transition: 'all 0.3s ease',
          }}
        >
          <div
            style={{
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '3rem',
              marginBottom: '1rem',
              boxShadow: '0 8px 24px rgba(16,185,129,0.4)',
              border: callState === 'ai_speaking' || callState === 'ai_thinking'
                ? '4px solid rgba(16,185,129,0.8)'
                : '4px solid rgba(16,185,129,0.5)',
              animation: callState === 'ai_speaking' ? 'pulse 1.5s ease-in-out infinite' : 'none',
            }}
          >
            🤖
          </div>
          <div
            style={{
              color: 'rgba(249,250,251,0.95)',
              fontSize: '1rem',
              fontWeight: 500,
              marginBottom: '0.5rem',
            }}
          >
            AI Репетитор
          </div>
          {callState === 'ai_thinking' && (
            <div
              style={{
                color: 'rgba(251,191,36,0.9)',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: '12px',
                  height: '12px',
                  border: '2px solid rgba(251,191,36,0.3)',
                  borderTop: '2px solid rgba(251,191,36,0.9)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              Думает...
            </div>
          )}
          {callState === 'ai_speaking' && (
            <div
              style={{
                color: 'rgba(16,185,129,0.9)',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#10b981',
                  animation: 'pulse 1s ease-in-out infinite',
                }}
              />
              Говорит...
            </div>
          )}
        </div>
      </div>

      {/* Сообщения чата (мини) */}
      {messages.length > 0 && (
        <div
          style={{
            maxHeight: '180px',
            overflowY: 'auto',
            padding: '0.75rem',
            borderRadius: '0.75rem',
            background: 'rgba(15,23,42,0.6)',
            border: '1px solid rgba(148,163,184,0.2)',
            marginBottom: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            backdropFilter: 'blur(10px)',
          }}
        >
          {messages.slice(-4).map((msg, idx) => (
            <div
              key={idx}
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '0.75rem',
                background:
                  msg.role === 'user'
                    ? 'linear-gradient(135deg, rgba(59,130,246,0.25) 0%, rgba(59,130,246,0.15) 100%)'
                    : 'linear-gradient(135deg, rgba(16,185,129,0.25) 0%, rgba(16,185,129,0.15) 100%)',
                border: `1px solid ${
                  msg.role === 'user'
                    ? 'rgba(59,130,246,0.4)'
                    : 'rgba(16,185,129,0.4)'
                }`,
                fontSize: '0.85rem',
                color: 'rgba(249,250,251,0.95)',
                lineHeight: '1.5',
                transition: 'all 0.2s ease',
                animation: 'slideUp 0.3s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span style={{ 
                  fontSize: '0.7rem', 
                  fontWeight: 700,
                  opacity: 0.9,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  {msg.role === 'user' ? '👤 Вы' : '🤖 AI Репетитор'}
                </span>
              </div>
              <div style={{ fontSize: '0.9rem', lineHeight: '1.6' }}>
                {msg.content.length > 120 ? `${msg.content.substring(0, 120)}...` : msg.content}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ошибка */}
      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.75rem',
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.4)',
            color: 'rgba(254,226,226,0.95)',
            fontSize: '0.85rem',
            marginBottom: '1rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Панель управления */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '1.5rem',
          paddingTop: '1rem',
          borderTop: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <button
          onClick={toggleMicrophone}
          disabled={!accessToken || (callState !== 'ready' && callState !== 'recording')}
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            border: 'none',
            background:
              callState === 'recording'
                ? 'rgba(239,68,68,0.9)'
                : 'rgba(34,197,94,0.9)',
            color: 'rgba(249,250,251,0.95)',
            fontSize: '2rem',
            cursor:
              !accessToken || (callState !== 'ready' && callState !== 'recording')
                ? 'not-allowed'
                : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow:
              callState === 'recording'
                ? '0 0 32px rgba(239,68,68,0.7), 0 0 16px rgba(239,68,68,0.4)'
                : '0 0 24px rgba(34,197,94,0.5), 0 0 12px rgba(34,197,94,0.3)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            animation: callState === 'recording' ? 'pulse 1.5s ease-in-out infinite' : 'none',
            transform: callState === 'recording' ? 'scale(1.05)' : 'scale(1)',
          }}
          onMouseEnter={(e) => {
            if (callState === 'ready' || callState === 'recording') {
              e.currentTarget.style.transform = 'scale(1.1)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = callState === 'recording' ? 'scale(1.05)' : 'scale(1)';
          }}
          title={callState === 'recording' ? 'Остановить запись' : 'Начать говорить'}
        >
          {callState === 'recording' ? '⏹' : '🎙️'}
        </button>

        <button
          onClick={stopCall}
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(239,68,68,0.8)',
            color: 'rgba(249,250,251,0.95)',
            fontSize: '1.6rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            boxShadow: '0 4px 16px rgba(239,68,68,0.3)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.95)';
            e.currentTarget.style.transform = 'scale(1.1)';
            e.currentTarget.style.boxShadow = '0 6px 24px rgba(239,68,68,0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.8)';
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(239,68,68,0.3)';
          }}
          title="Завершить звонок"
        >
          📞
        </button>
      </div>
    </div>
  );
};
