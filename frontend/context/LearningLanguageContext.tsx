'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_LEARNING_LANGUAGE,
  fetchUserLearningLanguage,
  LearningLanguage,
  LEARNING_LANGUAGE_LABELS,
  saveUserLearningLanguage,
} from '@/lib/learning-language';

export type LanguageToast = {
  id: number;
  message: string;
  kind?: 'success' | 'error';
};

type LearningLanguageContextValue = {
  learningLanguage: LearningLanguage;
  setLearningLanguage: (lang: LearningLanguage) => void;
  label: string;
  isLanguageReady: boolean;
  isSavingLanguage: boolean;
  toasts: LanguageToast[];
  dismissToast: (id: number) => void;
};

const LearningLanguageContext = createContext<LearningLanguageContextValue | null>(null);

export function LearningLanguageProvider({ children }: { children: React.ReactNode }) {
  const [learningLanguage, setLearningLanguageState] = useState<LearningLanguage>(DEFAULT_LEARNING_LANGUAGE);
  const [isLanguageReady, setIsLanguageReady] = useState(false);
  const [isSavingLanguage, setIsSavingLanguage] = useState(false);
  const [toasts, setToasts] = useState<LanguageToast[]>([]);
  const toastIdRef = useRef(1);
  const languageRef = useRef(DEFAULT_LEARNING_LANGUAGE);
  const userIdRef = useRef<string | null>(null);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback((message: string, kind: 'success' | 'error' = 'success') => {
    const id = toastIdRef.current++;
    setToasts((prev) => [...prev, { id, message, kind }]);
    window.setTimeout(() => {
      dismissToast(id);
    }, 3200);
  }, [dismissToast]);

  useEffect(() => {
    let mounted = true;

    const loadLanguage = async (userId: string | null) => {
      const userChanged = userIdRef.current !== userId;
      userIdRef.current = userId;

      if (userChanged && mounted) {
        setIsLanguageReady(false);
      }

      if (!userId) {
        languageRef.current = DEFAULT_LEARNING_LANGUAGE;
        if (mounted) {
          setLearningLanguageState(DEFAULT_LEARNING_LANGUAGE);
          setIsLanguageReady(true);
        }
        return;
      }

      const stored = await fetchUserLearningLanguage(userId);
      if (!mounted || userIdRef.current !== userId) return;

      languageRef.current = stored;
      setLearningLanguageState(stored);
      setIsLanguageReady(true);
    };

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      void loadLanguage(data.user?.id ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadLanguage(session?.user?.id ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const setLearningLanguage = useCallback((next: LearningLanguage) => {
    if (languageRef.current === next) return;

    const previous = languageRef.current;
    const userId = userIdRef.current;

    languageRef.current = next;
    setLearningLanguageState(next);
    pushToast(next === 'zh' ? 'Режим: китайский' : 'Режим: английский');

    if (!userId) return;

    setIsSavingLanguage(true);
    void saveUserLearningLanguage(userId, next).then((saved) => {
      setIsSavingLanguage(false);
      if (saved) return;

      languageRef.current = previous;
      setLearningLanguageState(previous);
      pushToast('Не удалось сохранить режим обучения', 'error');
    });
  }, [pushToast]);

  const value = useMemo(
    () => ({
      learningLanguage,
      setLearningLanguage,
      label: LEARNING_LANGUAGE_LABELS[learningLanguage],
      isLanguageReady,
      isSavingLanguage,
      toasts,
      dismissToast,
    }),
    [learningLanguage, setLearningLanguage, isLanguageReady, isSavingLanguage, toasts, dismissToast],
  );

  return (
    <LearningLanguageContext.Provider value={value}>
      {children}
    </LearningLanguageContext.Provider>
  );
}

export function useLearningLanguage(): LearningLanguageContextValue {
  const ctx = useContext(LearningLanguageContext);
  if (!ctx) {
    throw new Error('useLearningLanguage must be used within LearningLanguageProvider');
  }
  return ctx;
}
