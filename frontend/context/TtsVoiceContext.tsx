'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type TtsVoice = 'onyx' | 'nova';

export const TTS_VOICE_STORAGE_KEY = 'tts_voice';

export const TTS_VOICE_OPTIONS: { value: TtsVoice; label: string }[] = [
  { value: 'onyx', label: 'Мужской' },
  { value: 'nova', label: 'Женский' },
];

export function readStoredTtsVoice(): TtsVoice {
  if (typeof window === 'undefined') return 'nova';
  const saved = window.localStorage.getItem(TTS_VOICE_STORAGE_KEY);
  return saved === 'onyx' || saved === 'nova' ? saved : 'nova';
}

type TtsVoiceContextValue = {
  ttsVoice: TtsVoice;
  setTtsVoice: (voice: TtsVoice) => void;
};

const TtsVoiceContext = createContext<TtsVoiceContextValue | null>(null);

export function TtsVoiceProvider({ children }: { children: React.ReactNode }) {
  const [ttsVoice, setTtsVoiceState] = useState<TtsVoice>('nova');

  useEffect(() => {
    setTtsVoiceState(readStoredTtsVoice());
  }, []);

  const setTtsVoice = useCallback((voice: TtsVoice) => {
    setTtsVoiceState(voice);
    window.localStorage.setItem(TTS_VOICE_STORAGE_KEY, voice);
  }, []);

  const value = useMemo(() => ({ ttsVoice, setTtsVoice }), [ttsVoice, setTtsVoice]);

  return <TtsVoiceContext.Provider value={value}>{children}</TtsVoiceContext.Provider>;
}

export function useTtsVoice() {
  const ctx = useContext(TtsVoiceContext);
  if (!ctx) {
    throw new Error('useTtsVoice must be used within TtsVoiceProvider');
  }
  return ctx;
}
