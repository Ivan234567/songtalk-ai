'use client';

import React, { useEffect, useLayoutEffect, useMemo, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';

type VocabularyProgress = {
  review_count: number | null;
  last_review_score: number | null;
  consecutive_correct: number | null;
  consecutive_incorrect: number | null;
  next_review_at: string | null;
};

type VocabularyCategory = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  word_count?: number;
  idiom_count?: number;
  phrasal_verb_count?: number;
  created_at?: string;
  updated_at?: string;
};

type VocabularyWord = {
  id: string;
  word: string;
  translations: { translation: string; source?: string }[] | null;
  difficulty_level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | null;
  mastery_level: number | null;
  part_of_speech: string | null;
  times_seen: number | null;
  times_practiced: number | null;
  created_at: string;
  next_review_at: string | null;
  contexts?: { video_id?: string; text?: string; timestamp?: string }[];
  progress?: VocabularyProgress | null;
  categories?: VocabularyCategory[];
  videos?: { id: string; title: string; video_type?: string; video_id?: string; video_url?: string }[];
};

type VocabularyStats = {
  total_words: number;
  words_to_review: number;
} | null;

type UserIdiomVideo = {
  id: string;
  title: string;
  video_type: string;
  video_id: string | null;
  video_url: string | null;
};

type UserIdiom = {
  id?: string;
  phrase: string;
  literal_translation: string;
  meaning: string;
  usage_examples: string[];
  videos: UserIdiomVideo[];
  difficulty_level?: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | null;
  created_at?: string;
  categories?: VocabularyCategory[];
};

type UserPhrasalVerb = {
  id?: string;
  phrase: string;
  literal_translation: string;
  meaning: string;
  usage_examples: string[];
  videos: UserIdiomVideo[];
  difficulty_level?: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | null;
  created_at?: string;
  categories?: VocabularyCategory[];
};

/** Русская плюрализация: plural(5, 'слово', 'слова', 'слов') => 'слов' */
function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function getApiUrl() {
  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  // Убираем trailing slash, если есть
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

const iconStyle = { width: 14, height: 14, flexShrink: 0 };
const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={iconStyle}>
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
);
const UploadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={iconStyle}>
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
  </svg>
);
const TagIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={iconStyle}>
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01" />
  </svg>
);
const ChevronDownIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 10, height: 10, opacity: 0.7 }}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
const ChevronUpIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 10, height: 10, opacity: 0.7 }}>
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

export const DictionaryTab: React.FC = () => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [words, setWords] = useState<VocabularyWord[]>([]);
  const [stats, setStats] = useState<VocabularyStats>(null);

  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState<string>('all');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [idiomCategoryId, setIdiomCategoryId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'difficulty_level'>('difficulty_level');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Categories state
  const [categories, setCategories] = useState<VocabularyCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<VocabularyCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '', color: '#11622f', icon: '' });
  const [showAssignCategoriesModal, setShowAssignCategoriesModal] = useState(false);
  const [assigningWordId, setAssigningWordId] = useState<string | null>(null);
  const [assigningIdiomId, setAssigningIdiomId] = useState<string | null>(null);
  const [assigningPhrasalVerbId, setAssigningPhrasalVerbId] = useState<string | null>(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const categoryDropdownPortalRef = useRef<HTMLDivElement>(null);
  const [showLevelDropdown, setShowLevelDropdown] = useState(false);
  const [levelDropdownRect, setLevelDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const levelDropdownRef = useRef<HTMLDivElement>(null);
  const levelDropdownPortalRef = useRef<HTMLDivElement>(null);

  const LEVEL_OPTIONS = [
    { value: 'all', label: 'Все уровни' },
    { value: 'A1', label: 'A1' },
    { value: 'A2', label: 'A2' },
    { value: 'B1', label: 'B1' },
    { value: 'B2', label: 'B2' },
    { value: 'C1', label: 'C1' },
    { value: 'C2', label: 'C2' },
  ] as const;

  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [exportDropdownRect, setExportDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const exportDropdownPortalRef = useRef<HTMLDivElement>(null);

  const EXPORT_FORMATS = [
    { format: 'csv' as const, label: 'CSV' },
    { format: 'json' as const, label: 'JSON' },
    { format: 'anki' as const, label: 'Anki' },
  ];

  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(new Set());
  const [idioms, setIdioms] = useState<UserIdiom[]>([]);
  const [idiomsLoading, setIdiomsLoading] = useState(false);
  const [idiomsError, setIdiomsError] = useState<string | null>(null);
  const [selectedIdiomPhrases, setSelectedIdiomPhrases] = useState<Set<string>>(new Set());
  const [selectedIdiom, setSelectedIdiom] = useState<UserIdiom | null>(null);
  const [phrasalVerbs, setPhrasalVerbs] = useState<UserPhrasalVerb[]>([]);
  const [phrasalVerbsLoading, setPhrasalVerbsLoading] = useState(false);
  const [phrasalVerbsError, setPhrasalVerbsError] = useState<string | null>(null);
  const [selectedPhrasalVerbPhrases, setSelectedPhrasalVerbPhrases] = useState<Set<string>>(new Set());
  const [selectedPhrasalVerb, setSelectedPhrasalVerb] = useState<UserPhrasalVerb | null>(null);
  const [phrasalVerbCategoryId, setPhrasalVerbCategoryId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'words' | 'idioms' | 'phrasal-verbs'>('words');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [wordAudioUrl, setWordAudioUrl] = useState<string | null>(null);
  const [wordAudioLoading, setWordAudioLoading] = useState(false);
  const wordAudioRef = useRef<HTMLAudioElement | null>(null);
  const [idiomAudioUrl, setIdiomAudioUrl] = useState<string | null>(null);
  const [idiomAudioLoading, setIdiomAudioLoading] = useState(false);
  const idiomAudioRef = useRef<HTMLAudioElement | null>(null);
  const [phrasalVerbAudioUrl, setPhrasalVerbAudioUrl] = useState<string | null>(null);
  const [phrasalVerbAudioLoading, setPhrasalVerbAudioLoading] = useState(false);
  const phrasalVerbAudioRef = useRef<HTMLAudioElement | null>(null);
  // Cache for synthesized audio URLs (word/idiom/phrasal verb -> blob URL)
  const audioCacheRef = useRef<Map<string, string>>(new Map());

  // Debounce search input
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [search]);

  useEffect(() => {
    async function loadToken() {
      const { data: sessionData } = await supabase.auth.getSession();
      setAccessToken(sessionData.session?.access_token || null);
    }
    loadToken();

    // Cleanup audio cache on unmount
    return () => {
      audioCacheRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      audioCacheRef.current.clear();
    };
  }, []);

  // Measure trigger for category portal dropdown position
  useLayoutEffect(() => {
    if (!showCategoryDropdown || !categoryDropdownRef.current) {
      setDropdownRect(null);
      return;
    }
    const rect = categoryDropdownRef.current.getBoundingClientRect();
    setDropdownRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, [showCategoryDropdown, viewMode]);

  // Measure trigger for level portal dropdown position
  useLayoutEffect(() => {
    if (!showLevelDropdown || !levelDropdownRef.current) {
      setLevelDropdownRect(null);
      return;
    }
    const rect = levelDropdownRef.current.getBoundingClientRect();
    setLevelDropdownRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, [showLevelDropdown]);

  // Measure trigger for export portal dropdown position
  useLayoutEffect(() => {
    if (!showExportDropdown || !exportDropdownRef.current) {
      setExportDropdownRect(null);
      return;
    }
    const rect = exportDropdownRef.current.getBoundingClientRect();
    setExportDropdownRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, [showExportDropdown]);

  // Close dropdowns when viewMode changes
  useEffect(() => {
    setShowCategoryDropdown(false);
    setShowLevelDropdown(false);
  }, [viewMode]);

  // Close dropdowns when clicking outside (trigger or portaled panel)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const inCatTrigger = categoryDropdownRef.current?.contains(target);
      const inCatPortal = categoryDropdownPortalRef.current?.contains(target);
      const inLevelTrigger = levelDropdownRef.current?.contains(target);
      const inLevelPortal = levelDropdownPortalRef.current?.contains(target);
      const inExportTrigger = exportDropdownRef.current?.contains(target);
      const inExportPortal = exportDropdownPortalRef.current?.contains(target);
      if (!inCatTrigger && !inCatPortal) setShowCategoryDropdown(false);
      if (!inLevelTrigger && !inLevelPortal) setShowLevelDropdown(false);
      if (!inExportTrigger && !inExportPortal) setShowExportDropdown(false);
    }

    if (showCategoryDropdown || showLevelDropdown || showExportDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCategoryDropdown, showLevelDropdown, showExportDropdown]);

  // Close all dropdowns on Escape
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowCategoryDropdown(false);
        setShowLevelDropdown(false);
        setShowExportDropdown(false);
      }
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const handleExport = useCallback(
    async (format: 'csv' | 'json' | 'anki') => {
      if (!accessToken || exporting) return;
      setExporting(true);
      setShowExportDropdown(false);
      try {
        const params = new URLSearchParams();
        params.set('format', format);
        params.set('view_mode', viewMode);
        
        // Add search filter
        if (debouncedSearch.trim()) {
          params.set('search', debouncedSearch.trim());
        }
        
        // Add difficulty filter
        if (difficulty !== 'all') {
          params.set('difficulty', difficulty);
        }
        
        // Add category filter based on view mode
        if (viewMode === 'words' && categoryId) {
          params.set('category_id', categoryId);
        } else if (viewMode === 'idioms' && idiomCategoryId) {
          params.set('idiom_category_id', idiomCategoryId);
        } else if (viewMode === 'phrasal-verbs' && phrasalVerbCategoryId) {
          params.set('phrasal_verb_category_id', phrasalVerbCategoryId);
        }

        const resp = await fetch(`${getApiUrl()}/api/vocabulary/export?${params.toString()}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!resp.ok) {
          const errorData = await resp.json().catch(() => ({ error: 'Ошибка экспорта' }));
          throw new Error(errorData?.error || 'Ошибка экспорта');
        }
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().split('T')[0];
        
        // Generate filename based on view mode
        let filename = '';
        if (viewMode === 'idioms') {
          filename = format === 'anki' ? `idioms_anki_${date}.csv` : `idioms_${date}.${format === 'json' ? 'json' : 'csv'}`;
        } else if (viewMode === 'phrasal-verbs') {
          filename = format === 'anki' ? `phrasal_verbs_anki_${date}.csv` : `phrasal_verbs_${date}.${format === 'json' ? 'json' : 'csv'}`;
        } else {
          filename = format === 'anki' ? `vocabulary_anki_${date}.csv` : `vocabulary_${date}.${format === 'json' ? 'json' : 'csv'}`;
        }
        
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        alert('Не удалось экспортировать словарь: ' + (e as Error).message);
      } finally {
        setExporting(false);
      }
    },
    [accessToken, viewMode, debouncedSearch, difficulty, categoryId, idiomCategoryId, phrasalVerbCategoryId]
  );

  // Reset sort if legacy "mastery_level" or "word" was ever selected (options removed)
  useEffect(() => {
    setSortBy((prev) =>
      (prev as string) === 'mastery_level' || (prev as string) === 'word'
        ? 'difficulty_level'
        : prev
    );
  }, []);

  // Load categories
  useEffect(() => {
    if (!accessToken) return;

    async function fetchCategories() {
      setCategoriesLoading(true);
      try {
        const resp = await fetch(`${getApiUrl()}/api/vocabulary/categories`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const data = await resp.json();
        if (!resp.ok || !data.ok) {
          throw new Error(data?.error || 'Не удалось загрузить категории');
        }

        setCategories(data.categories || []);
      } catch (e: any) {
        console.error('Error loading categories:', e);
      } finally {
        setCategoriesLoading(false);
      }
    }

    fetchCategories();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;

    async function fetchVocabulary() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set('limit', '200');
        params.set('offset', '0');
        params.set('sort_by', sortBy);
        params.set('sort_order', sortOrder);
        if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
        if (difficulty !== 'all') params.set('difficulty_level', difficulty);
        if (categoryId) params.set('category_id', categoryId);

        const resp = await fetch(`${getApiUrl()}/api/vocabulary/list?${params.toString()}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const data = await resp.json();
        if (!resp.ok || !data.ok) {
          throw new Error(data?.error || 'Не удалось загрузить словарь');
        }

        setWords(data.words || []);
        setStats(data.stats || null);

        // Only auto-select first word if no word is selected and we have words
        // But don't reset selection if user has manually selected a word
        if (!selectedWordId && data.words && data.words.length > 0) {
          setSelectedWordId(data.words[0].id);
        }
        // Clear selection if selected word is no longer in the list
        else if (selectedWordId && data.words && data.words.length > 0) {
          const wordExists = data.words.some((w: VocabularyWord) => w.id === selectedWordId);
          if (!wordExists) {
            setSelectedWordId(data.words[0].id);
          }
        }
      } catch (e: any) {
        setError(e?.message || 'Ошибка загрузки словаря');
      } finally {
        setLoading(false);
      }
    }

    fetchVocabulary();
    // Removed selectedWordId from dependencies to prevent infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, debouncedSearch, difficulty, categoryId, status, sortBy, sortOrder]);

  useEffect(() => {
    if (!accessToken) return;

    async function fetchIdioms() {
      setIdiomsLoading(true);
      setIdiomsError(null);
      try {
        const params = new URLSearchParams();
        if (idiomCategoryId) params.set('category_id', idiomCategoryId);

        const resp = await fetch(`${getApiUrl()}/api/vocabulary/idioms/list?${params.toString()}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const data = await resp.json();
        if (!resp.ok || !data.ok) {
          throw new Error(data?.error || 'Не удалось загрузить идиомы');
        }

        const loadedIdioms = data.idioms || [];
        setIdioms(loadedIdioms);

        // Auto-select first idiom if no idiom is selected and we have idioms
        if (!selectedIdiom && loadedIdioms.length > 0) {
          setSelectedIdiom(loadedIdioms[0]);
        }
        // Clear selection if selected idiom is no longer in the list
        else if (selectedIdiom && loadedIdioms.length > 0) {
          const idiomExists = loadedIdioms.some(
            (i: UserIdiom) => i.phrase.trim().toLowerCase() === selectedIdiom.phrase.trim().toLowerCase()
          );
          if (!idiomExists) {
            setSelectedIdiom(loadedIdioms[0]);
          }
        }
      } catch (e: any) {
        setIdiomsError(e?.message || 'Ошибка загрузки идиом');
      } finally {
        setIdiomsLoading(false);
      }
    }

    fetchIdioms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, idiomCategoryId]);

  useEffect(() => {
    if (!accessToken) return;

    async function fetchPhrasalVerbs() {
      setPhrasalVerbsLoading(true);
      setPhrasalVerbsError(null);
      try {
        const params = new URLSearchParams();
        if (phrasalVerbCategoryId) params.set('category_id', phrasalVerbCategoryId);

        const resp = await fetch(`${getApiUrl()}/api/vocabulary/phrasal-verbs/list?${params.toString()}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const data = await resp.json();
        if (!resp.ok || !data.ok) {
          throw new Error(data?.error || 'Не удалось загрузить фразовые глаголы');
        }

        const loadedPhrasalVerbs = data.phrasal_verbs || [];
        setPhrasalVerbs(loadedPhrasalVerbs);

        // Auto-select first phrasal verb if no phrasal verb is selected and we have phrasal verbs
        if (!selectedPhrasalVerb && loadedPhrasalVerbs.length > 0) {
          setSelectedPhrasalVerb(loadedPhrasalVerbs[0]);
        }
        // Clear selection if selected phrasal verb is no longer in the list
        else if (selectedPhrasalVerb && loadedPhrasalVerbs.length > 0) {
          const phrasalVerbExists = loadedPhrasalVerbs.some(
            (pv: UserPhrasalVerb) => pv.phrase.trim().toLowerCase() === selectedPhrasalVerb.phrase.trim().toLowerCase()
          );
          if (!phrasalVerbExists) {
            setSelectedPhrasalVerb(loadedPhrasalVerbs[0]);
          }
        }
      } catch (e: any) {
        setPhrasalVerbsError(e?.message || 'Ошибка загрузки фразовых глаголов');
      } finally {
        setPhrasalVerbsLoading(false);
      }
    }

    fetchPhrasalVerbs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, phrasalVerbCategoryId]);

  const selectedWord = useMemo(
    () => words.find((w) => w.id === selectedWordId) || words[0] || null,
    [words, selectedWordId],
  );

  // Synthesize audio for selected word with caching
  useEffect(() => {
    if (!accessToken || !selectedWord) {
      // Clean up audio URL when no word is selected (but don't revoke cached URLs)
      if (wordAudioUrl) {
        const wordKey = selectedWord?.word?.trim().toLowerCase();
        const cachedUrl = wordKey ? audioCacheRef.current.get(wordKey) : null;
        // Only revoke if this URL is not in cache
        if (wordAudioUrl !== cachedUrl) {
          URL.revokeObjectURL(wordAudioUrl);
        }
        setWordAudioUrl(null);
      }
      return;
    }

    const word = selectedWord.word.trim();
    if (!word) return;

    const wordKey = word.toLowerCase();

    // Check cache first
    const cachedUrl = audioCacheRef.current.get(wordKey);
    if (cachedUrl) {
      // Use cached audio
      setWordAudioUrl((prev) => {
        // Revoke previous URL if it's not cached
        if (prev && prev !== cachedUrl) {
          const prevWordKey = selectedWord?.word?.trim().toLowerCase();
          const prevCachedUrl = prevWordKey ? audioCacheRef.current.get(prevWordKey) : null;
          if (prev !== prevCachedUrl) {
            URL.revokeObjectURL(prev);
          }
        }
        return cachedUrl;
      });
      setWordAudioLoading(false);
    } else {
      // No cached audio, reset state
      setWordAudioUrl(null);
      setWordAudioLoading(false);
    }

    // Cleanup function - don't revoke cached URLs
    return () => {
      // Cleanup is handled in the next effect run if needed
      // We don't revoke cached URLs here to keep them available
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, selectedWord?.word]);

  // Synthesize audio for selected word (called by button)
  const synthesizeWordAudio = useCallback(async () => {
    if (!accessToken || !selectedWord) return;

    // If audio already exists, just play it
    if (wordAudioUrl) {
      wordAudioRef.current?.play();
      return;
    }

    const word = selectedWord.word.trim();
    if (!word) return;

    const wordKey = word.toLowerCase();

    // Check cache first
    const cachedUrl = audioCacheRef.current.get(wordKey);
    if (cachedUrl) {
      setWordAudioUrl(cachedUrl);
      setTimeout(() => {
        wordAudioRef.current?.play();
      }, 100);
      return;
    }

    setWordAudioLoading(true);
    try {
      const resp = await fetch(`${getApiUrl()}/api/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ text: word }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        const msg = errData?.error || 'Не удалось синтезировать произношение слова';
        throw new Error(msg);
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);

      // Cache the URL
      audioCacheRef.current.set(wordKey, url);

      setWordAudioUrl((prev) => {
        // Revoke previous URL if it's not cached
        if (prev) {
          const prevWordKey = selectedWord?.word?.trim().toLowerCase();
          const prevCachedUrl = prevWordKey ? audioCacheRef.current.get(prevWordKey) : null;
          if (prev !== prevCachedUrl) {
            URL.revokeObjectURL(prev);
          }
        }
        return url;
      });

      // Automatically play after synthesis
      setTimeout(() => {
        wordAudioRef.current?.play();
      }, 100);
    } catch (e) {
      console.error('Word TTS error:', e);
      alert(e instanceof Error ? e.message : 'Не удалось синтезировать произношение');
    } finally {
      setWordAudioLoading(false);
    }
  }, [accessToken, selectedWord, wordAudioUrl]);

  // Synthesize audio for selected idiom (called by button)
  const synthesizeIdiomAudio = useCallback(async () => {
    if (!accessToken || !selectedIdiom) return;

    // If audio already exists, just play it
    if (idiomAudioUrl) {
      idiomAudioRef.current?.play();
      return;
    }

    const phrase = selectedIdiom.phrase.trim();
    if (!phrase) return;

    const phraseKey = `idiom:${phrase.toLowerCase()}`;

    // Check cache first
    const cachedUrl = audioCacheRef.current.get(phraseKey);
    if (cachedUrl) {
      setIdiomAudioUrl(cachedUrl);
      setTimeout(() => {
        idiomAudioRef.current?.play();
      }, 100);
      return;
    }

    setIdiomAudioLoading(true);
    try {
      const resp = await fetch(`${getApiUrl()}/api/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ text: phrase }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData?.error || 'Не удалось синтезировать произношение идиомы');
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);

      // Cache the URL
      audioCacheRef.current.set(phraseKey, url);

      setIdiomAudioUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return url;
      });

      // Automatically play after synthesis
      setTimeout(() => {
        idiomAudioRef.current?.play();
      }, 100);
    } catch (e) {
      console.error('Idiom TTS error:', e);
      alert(e instanceof Error ? e.message : 'Не удалось синтезировать произношение');
    } finally {
      setIdiomAudioLoading(false);
    }
  }, [accessToken, selectedIdiom, idiomAudioUrl]);

  // Category management functions
  const handleCreateCategory = useCallback(async () => {
    if (!accessToken || !categoryForm.name.trim()) return;

    try {
      const resp = await fetch(`${getApiUrl()}/api/vocabulary/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: categoryForm.name.trim(),
          description: categoryForm.description.trim() || null,
          color: categoryForm.color,
          icon: categoryForm.icon.trim() || null,
        }),
      });

      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || 'Не удалось создать категорию');
      }

      // Reload categories
      const categoriesResp = await fetch(`${getApiUrl()}/api/vocabulary/categories`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const categoriesData = await categoriesResp.json();
      if (categoriesData.ok) {
        setCategories(categoriesData.categories || []);
      }

      setShowCategoryModal(false);
      setCategoryForm({ name: '', description: '', color: '#11622f', icon: '' });
      setEditingCategory(null);
    } catch (e: any) {
      console.error('Error creating category:', e);
      alert(e?.message || 'Не удалось создать категорию');
    }
  }, [accessToken, categoryForm]);

  const handleUpdateCategory = useCallback(async () => {
    if (!accessToken || !editingCategory || !categoryForm.name.trim()) return;

    try {
      const resp = await fetch(`${getApiUrl()}/api/vocabulary/categories/${editingCategory.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: categoryForm.name.trim(),
          description: categoryForm.description.trim() || null,
          color: categoryForm.color,
          icon: categoryForm.icon.trim() || null,
        }),
      });

      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || 'Не удалось обновить категорию');
      }

      // Reload categories
      const categoriesResp = await fetch(`${getApiUrl()}/api/vocabulary/categories`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const categoriesData = await categoriesResp.json();
      if (categoriesData.ok) {
        setCategories(categoriesData.categories || []);
      }

      setShowCategoryModal(false);
      setCategoryForm({ name: '', description: '', color: '#11622f', icon: '' });
      setEditingCategory(null);
    } catch (e: any) {
      console.error('Error updating category:', e);
      alert(e?.message || 'Не удалось обновить категорию');
    }
  }, [accessToken, editingCategory, categoryForm]);

  const handleDeleteCategory = useCallback(async (deletedCategoryId: string) => {
    if (!accessToken || !confirm('Вы уверены, что хотите удалить эту категорию?')) return;

    try {
      const resp = await fetch(`${getApiUrl()}/api/vocabulary/categories/${deletedCategoryId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || 'Не удалось удалить категорию');
      }

      // Reload categories
      const categoriesResp = await fetch(`${getApiUrl()}/api/vocabulary/categories`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const categoriesData = await categoriesResp.json();
      if (categoriesData.ok) {
        setCategories(categoriesData.categories || []);
      }

      // Clear category filter if deleted category was selected
      if (categoryId === deletedCategoryId) {
        setCategoryId(null);
      }
    } catch (e: any) {
      console.error('Error deleting category:', e);
      alert(e?.message || 'Не удалось удалить категорию');
    }
  }, [accessToken, categoryId]);

  const handleAssignCategories = useCallback(async (wordId: string, categoryIds: string[]) => {
    if (!accessToken) return;

    try {
      const resp = await fetch(`${getApiUrl()}/api/vocabulary/words/${wordId}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ category_ids: categoryIds }),
      });

      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || 'Не удалось присвоить категории');
      }

      // Reload vocabulary to get updated categories
      const params = new URLSearchParams();
      params.set('limit', '200');
      params.set('offset', '0');
      params.set('sort_by', sortBy);
      params.set('sort_order', sortOrder);
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (difficulty !== 'all') params.set('difficulty_level', difficulty);
      if (categoryId) params.set('category_id', categoryId);

      const vocabResp = await fetch(`${getApiUrl()}/api/vocabulary/list?${params.toString()}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const vocabData = await vocabResp.json();
      if (vocabData.ok) {
        setWords(vocabData.words || []);
      }
    } catch (e: any) {
      console.error('Error assigning categories:', e);
      alert(e?.message || 'Не удалось назначить категории');
    }
  }, [accessToken, debouncedSearch, difficulty, categoryId, sortBy, sortOrder]);

  const handleAssignIdiomCategories = useCallback(async (idiomId: string, categoryIds: string[]) => {
    if (!accessToken) return;

    try {
      const resp = await fetch(`${getApiUrl()}/api/vocabulary/idioms/${idiomId}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ category_ids: categoryIds }),
      });

      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || 'Failed to assign categories');
      }

      // Reload idioms to get updated categories
      const params = new URLSearchParams();
      if (idiomCategoryId) params.set('category_id', idiomCategoryId);

      const idiomsResp = await fetch(`${getApiUrl()}/api/vocabulary/idioms/list?${params.toString()}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const idiomsData = await idiomsResp.json();
      if (idiomsData.ok) {
        setIdioms(idiomsData.idioms || []);
      }
    } catch (e: any) {
      console.error('Error assigning categories:', e);
      alert(e?.message || 'Не удалось назначить категории');
    }
  }, [accessToken, idiomCategoryId]);

  const handleAssignPhrasalVerbCategories = useCallback(async (phrasalVerbId: string, categoryIds: string[]) => {
    if (!accessToken) return;

    try {
      const resp = await fetch(`${getApiUrl()}/api/vocabulary/phrasal-verbs/${phrasalVerbId}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ category_ids: categoryIds }),
      });

      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || 'Failed to assign categories');
      }

      // Reload phrasal verbs to get updated categories
      const params = new URLSearchParams();
      if (phrasalVerbCategoryId) params.set('category_id', phrasalVerbCategoryId);

      const phrasalVerbsResp = await fetch(`${getApiUrl()}/api/vocabulary/phrasal-verbs/list?${params.toString()}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const phrasalVerbsData = await phrasalVerbsResp.json();
      if (phrasalVerbsData.ok) {
        setPhrasalVerbs(phrasalVerbsData.phrasal_verbs || []);
      }
    } catch (e: any) {
      console.error('Error assigning categories:', e);
      alert(e?.message || 'Не удалось назначить категории');
    }
  }, [accessToken, phrasalVerbCategoryId]);

  const openCategoryModal = useCallback((category?: VocabularyCategory) => {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({
        name: category.name,
        description: category.description || '',
        color: category.color,
        icon: category.icon || '',
      });
    } else {
      setEditingCategory(null);
      setCategoryForm({ name: '', description: '', color: '#11622f', icon: '' });
    }
    setShowCategoryModal(true);
  }, []);

  const totalWords = stats?.total_words ?? words.length;

  const filteredIdioms = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();

    const filtered = idioms.filter((i) => {
      // Apply search filter
      if (q) {
        const haystack =
          i.phrase.toLowerCase() +
          ' ' +
          i.meaning.toLowerCase() +
          ' ' +
          i.literal_translation.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      // Apply difficulty filter
      if (difficulty !== 'all') {
        if (i.difficulty_level !== difficulty) {
          return false;
        }
      }

      return true;
    });

    return filtered;
  }, [idioms, debouncedSearch, difficulty]);

  const filteredPhrasalVerbs = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();

    const filtered = phrasalVerbs.filter((pv) => {
      // Apply search filter
      if (q) {
        const haystack =
          pv.phrase.toLowerCase() +
          (pv.meaning || '').toLowerCase() +
          (pv.literal_translation || '').toLowerCase();
        if (!haystack.includes(q)) {
          return false;
        }
      }

      // Apply difficulty filter
      if (difficulty !== 'all') {
        if (pv.difficulty_level !== difficulty) {
          return false;
        }
      }

      return true;
    });

    return filtered;
  }, [phrasalVerbs, debouncedSearch, difficulty]);

  // Sync selected idiom when filtered list changes (selection not in list → pick first)
  useEffect(() => {
    if (viewMode !== 'idioms' || filteredIdioms.length === 0) return;
    const selectedKey = selectedIdiom?.phrase.trim().toLowerCase();
    const selectedExists = selectedKey
      ? filteredIdioms.some((i) => i.phrase.trim().toLowerCase() === selectedKey)
      : false;
    if (!selectedExists) {
      setSelectedIdiom(filteredIdioms[0]);
    }
  }, [viewMode, filteredIdioms, selectedIdiom?.phrase]);

  // Sync selected phrasal verb when filtered list changes (selection not in list → pick first)
  useEffect(() => {
    if (viewMode !== 'phrasal-verbs' || filteredPhrasalVerbs.length === 0) return;
    const selectedKey = selectedPhrasalVerb?.phrase.trim().toLowerCase();
    const selectedExists = selectedKey
      ? filteredPhrasalVerbs.some((pv) => pv.phrase.trim().toLowerCase() === selectedKey)
      : false;
    if (!selectedExists) {
      setSelectedPhrasalVerb(filteredPhrasalVerbs[0]);
    }
  }, [viewMode, filteredPhrasalVerbs, selectedPhrasalVerb?.phrase]);

  // Clean up idiom audio when idiom changes
  useEffect(() => {
    if (!selectedIdiom) {
      if (idiomAudioUrl) {
        URL.revokeObjectURL(idiomAudioUrl);
        setIdiomAudioUrl(null);
      }
      return;
    }

    const phrase = selectedIdiom.phrase.trim();
    if (!phrase) return;

    const phraseKey = `idiom:${phrase.toLowerCase()}`;

    // Check cache first
    const cachedUrl = audioCacheRef.current.get(phraseKey);
    if (cachedUrl) {
      setIdiomAudioUrl((prev) => {
        if (prev && prev !== cachedUrl) {
          URL.revokeObjectURL(prev);
        }
        return cachedUrl;
      });
      setIdiomAudioLoading(false);
    } else {
      // No cached audio, reset state
      setIdiomAudioUrl(null);
      setIdiomAudioLoading(false);
    }
  }, [selectedIdiom, idiomAudioUrl]);

  // Clean up phrasal verb audio when phrasal verb changes
  useEffect(() => {
    if (!selectedPhrasalVerb) {
      if (phrasalVerbAudioUrl) {
        URL.revokeObjectURL(phrasalVerbAudioUrl);
        setPhrasalVerbAudioUrl(null);
      }
      return;
    }

    const phrase = selectedPhrasalVerb.phrase.trim();
    if (!phrase) return;

    const phraseKey = `phrasal-verb:${phrase.toLowerCase()}`;

    // Check cache first
    const cachedUrl = audioCacheRef.current.get(phraseKey);
    if (cachedUrl) {
      setPhrasalVerbAudioUrl((prev) => {
        if (prev && prev !== cachedUrl) {
          URL.revokeObjectURL(prev);
        }
        return cachedUrl;
      });
      setPhrasalVerbAudioLoading(false);
    } else {
      // No cached audio, reset state
      setPhrasalVerbAudioUrl(null);
      setPhrasalVerbAudioLoading(false);
    }
  }, [selectedPhrasalVerb, phrasalVerbAudioUrl]);

  return (
    <div
      style={{
        borderRadius: '1.75rem',
        padding: '1.75rem',
        background: 'linear-gradient(135deg, var(--card) 0%, var(--card-strong) 100%)',
        border: '1px solid var(--stroke)',
        boxShadow: 'var(--shadow-soft)',
        backdropFilter: 'blur(20px)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}
    >
      <header
        className="dictionary-tab-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        <div>
          <h2
            style={{
              fontSize: '1.1rem',
              marginBottom: 0,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-primary)',
            }}
          >
            Словарь
          </h2>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '0.5rem',
          }}
        >
          <div
            style={{
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
            }}
          >
            {viewMode === 'words' && (
              <>Всего слов: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{totalWords}</span></>
            )}
            {viewMode === 'idioms' && (
              <>Всего идиом: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{filteredIdioms.length}</span></>
            )}
            {viewMode === 'phrasal-verbs' && (
              <>Всего фразовых глаголов: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{filteredPhrasalVerbs.length}</span></>
            )}
          </div>
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <div ref={exportDropdownRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => !exporting && setShowExportDropdown((prev) => !prev)}
                disabled={exporting}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '0.6rem',
                  border: '1px solid var(--stroke)',
                  background: 'var(--card)',
                  color: 'var(--text-primary)',
                  fontSize: '0.75rem',
                  cursor: exporting ? 'wait' : 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  opacity: exporting ? 0.7 : 1,
                }}
                title={exporting ? 'Экспорт…' : 'Экспорт словаря'}
              >
                <DownloadIcon /> {exporting ? 'Экспорт…' : 'Экспорт'}
                {!exporting && (showExportDropdown ? <ChevronUpIcon /> : <ChevronDownIcon />)}
              </button>
            </div>
            <button
              onClick={() => openCategoryModal()}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '0.6rem',
                border: '1px solid var(--stroke)',
                background: 'var(--card)',
                color: 'var(--text-primary)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              }}
              title="Управление категориями"
            >
              <TagIcon /> Категории
            </button>
            <label
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '0.6rem',
                border: '1px solid var(--stroke)',
                background: 'var(--card)',
                color: 'var(--text-primary)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                display: 'inline-block',
              }}
              title="Импорт словаря"
            >
              <UploadIcon /> Импорт
              <input
                type="file"
                accept=".csv,.json"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file || !accessToken) return

                  const fileName = file.name.toLowerCase()
                  let format: 'csv' | 'json' | 'anki' = 'json'

                  if (fileName.endsWith('.csv')) {
                    // Try to detect Anki format by checking if it has Front,Back columns
                    const text = await file.text()
                    const firstLine = text.split('\n')[0]?.toLowerCase() || ''
                    if (firstLine.includes('front') && firstLine.includes('back')) {
                      format = 'anki'
                    } else {
                      format = 'csv'
                    }
                  } else if (fileName.endsWith('.json')) {
                    format = 'json'
                  } else {
                    alert('Неподдерживаемый формат файла. Используйте CSV или JSON.')
                    return
                  }

                  try {
                    const fileContent = await file.text()
                    const resp = await fetch(`${getApiUrl()}/api/vocabulary/import`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${accessToken}`,
                      },
                      body: JSON.stringify({
                        format,
                        data: format === 'json' ? fileContent : fileContent,
                      }),
                    })

                    const data = await resp.json()
                    if (!resp.ok || !data.ok) {
                      throw new Error(data?.error || 'Ошибка импорта')
                    }

                    alert(
                      `Импорт завершен!\n` +
                      `Добавлено новых слов: ${data.imported}\n` +
                      `Обновлено существующих: ${data.updated}\n` +
                      `Всего обработано: ${data.total}` +
                      (data.errors && data.errors.length > 0
                        ? `\n\nОшибки (${data.errors.length}):\n${data.errors
                          .slice(0, 5)
                          .map((e: any) => `- ${e.word}: ${e.error}`)
                          .join('\n')}`
                        : '')
                    )

                    // Refresh vocabulary list
                    if (accessToken) {
                      const params = new URLSearchParams()
                      params.set('limit', '200')
                      params.set('offset', '0')
                      params.set('sort_by', sortBy)
                      params.set('sort_order', sortOrder)
                      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
                      if (difficulty !== 'all') params.set('difficulty_level', difficulty)

                      const resp = await fetch(`${getApiUrl()}/api/vocabulary/list?${params.toString()}`, {
                        method: 'GET',
                        headers: {
                          Authorization: `Bearer ${accessToken}`,
                        },
                      })

                      const data = await resp.json()
                      if (resp.ok && data.ok) {
                        setWords(data.words || [])
                        setStats(data.stats || null)
                      }
                    }
                  } catch (err) {
                    alert('Не удалось импортировать словарь: ' + (err as Error).message)
                  } finally {
                    // Reset file input
                    e.target.value = ''
                  }
                }}
              />
            </label>
          </div>
        </div>
      </header>

          <div
            className="dictionary-tab-toolbar"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
              alignItems: 'center',
              padding: '0.75rem 1rem',
              borderRadius: '1rem',
              background: 'linear-gradient(135deg, var(--card) 0%, var(--card-strong) 100%)',
              border: '1px solid var(--stroke)',
              boxShadow: 'var(--shadow-soft)',
              backdropFilter: 'blur(10px)',
              position: 'relative' as const,
              zIndex: (showCategoryDropdown || showLevelDropdown) ? 1100 : undefined,
            }}
          >
        {/* Mode switcher */}
        <div
          style={{
            display: 'flex',
            gap: '0.25rem',
            padding: '0.25rem',
            borderRadius: '0.75rem',
            background: 'var(--card)',
            border: '1px solid var(--stroke)',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
          }}
        >
          <button
            onClick={() => setViewMode('words')}
              style={{
                padding: '0.4rem 0.9rem',
                borderRadius: '0.5rem',
                border: 'none',
                background: viewMode === 'words' 
                  ? 'var(--accent)'
                  : 'transparent',
                color: viewMode === 'words' ? 'var(--bg)' : 'var(--text-muted)',
                fontSize: '0.85rem',
                cursor: 'pointer',
                fontWeight: viewMode === 'words' ? 600 : 400,
                transition: 'all 0.2s',
                boxShadow: viewMode === 'words' ? '0 2px 8px var(--accent-soft)' : 'none',
              }}
          >
            Слова
          </button>
          <button
            onClick={() => setViewMode('idioms')}
            style={{
              padding: '0.4rem 0.9rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: viewMode === 'idioms' ? 'var(--accent)' : 'transparent',
              color: viewMode === 'idioms' ? 'var(--bg)' : 'var(--text-muted)',
              fontSize: '0.85rem',
              cursor: 'pointer',
              fontWeight: viewMode === 'idioms' ? 600 : 400,
              transition: 'all 0.2s',
            }}
          >
            Идиомы
          </button>
          <button
            onClick={() => setViewMode('phrasal-verbs')}
            style={{
              padding: '0.4rem 0.9rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: viewMode === 'phrasal-verbs' ? 'var(--accent)' : 'transparent',
              color: viewMode === 'phrasal-verbs' ? 'var(--bg)' : 'var(--text-muted)',
              fontSize: '0.85rem',
              cursor: 'pointer',
              fontWeight: viewMode === 'phrasal-verbs' ? 600 : 400,
              transition: 'all 0.2s',
            }}
          >
            Фразовые глаголы
          </button>
        </div>
        <input
          type="text"
          placeholder={viewMode === 'words' ? 'Поиск по слову...' : viewMode === 'idioms' ? 'Поиск по идиомам...' : 'Поиск по фразовым глаголам...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 0,
            padding: '0.55rem 0.8rem',
            borderRadius: '0.75rem',
            border: '1px solid var(--stroke)',
            background: 'var(--card)',
            color: 'var(--text-primary)',
            fontSize: '0.9rem',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
            transition: 'all 0.2s',
          }}
        />
        <div
          ref={levelDropdownRef}
          style={{
            position: 'relative',
            zIndex: showLevelDropdown ? 1100 : undefined,
          }}
        >
          <button
            type="button"
            onClick={() => {
              setShowLevelDropdown((prev) => !prev);
              if (!showLevelDropdown) setShowCategoryDropdown(false);
            }}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '0.75rem',
              border: '1px solid var(--stroke)',
              background: 'var(--card)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              minWidth: '140px',
              justifyContent: 'space-between',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--stroke-strong)';
              e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.1), 0 0 0 2px var(--accent-soft)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--stroke)';
              e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.1)';
            }}
          >
            <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {LEVEL_OPTIONS.find((o) => o.value === difficulty)?.label ?? 'Все уровни'}
            </span>
            {showLevelDropdown ? <ChevronUpIcon /> : <ChevronDownIcon />}
          </button>
        </div>
        {viewMode === 'words' && (
          <div
            ref={categoryDropdownRef}
            style={{
              position: 'relative',
              zIndex: showCategoryDropdown ? 1100 : undefined,
            }}
          >
            <button
              onClick={() => {
                setShowLevelDropdown(false);
                setShowCategoryDropdown(!showCategoryDropdown);
              }}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '0.75rem',
                border: '1px solid var(--stroke)',
                background: 'var(--card)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                minWidth: '150px',
                justifyContent: 'space-between',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                {categoryId ? (
                  (() => {
                    const selectedCat = categories.find(c => c.id === categoryId);
                    return selectedCat ? (
                      <>
                        {selectedCat.icon && <span>{selectedCat.icon}</span>}
                        <span
                          style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '3px',
                            background: selectedCat.color || '#11622f',
                            display: 'inline-block',
                          }}
                        />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {selectedCat.name}
                        </span>
                      </>
                    ) : (
                      <span>Все категории</span>
                    );
                  })()
                ) : (
                  <span>Все категории</span>
                )}
              </div>
              {showCategoryDropdown ? <ChevronUpIcon /> : <ChevronDownIcon />}
            </button>
          </div>
        )}
        {viewMode === 'idioms' && (
          <div
            ref={categoryDropdownRef}
            style={{
              position: 'relative',
              zIndex: showCategoryDropdown ? 1100 : undefined,
            }}
          >
            <button
              onClick={() => {
                setShowLevelDropdown(false);
                setShowCategoryDropdown(!showCategoryDropdown);
              }}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '0.75rem',
                border: '1px solid var(--stroke)',
                background: 'var(--card)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                minWidth: '150px',
                justifyContent: 'space-between',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                {idiomCategoryId ? (
                  (() => {
                    const selectedCat = categories.find(c => c.id === idiomCategoryId);
                    return selectedCat ? (
                      <>
                        {selectedCat.icon && <span>{selectedCat.icon}</span>}
                        <span
                          style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '3px',
                            background: selectedCat.color || '#11622f',
                            display: 'inline-block',
                          }}
                        />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {selectedCat.name}
                        </span>
                      </>
                    ) : (
                      <span>Все категории</span>
                    );
                  })()
                ) : (
                  <span>Все категории</span>
                )}
              </div>
              {showCategoryDropdown ? <ChevronUpIcon /> : <ChevronDownIcon />}
            </button>
          </div>
        )}
        {viewMode === 'phrasal-verbs' && (
          <div
            ref={categoryDropdownRef}
            style={{
              position: 'relative',
              zIndex: showCategoryDropdown ? 1100 : undefined,
            }}
          >
            <button
              onClick={() => {
                setShowLevelDropdown(false);
                setShowCategoryDropdown(!showCategoryDropdown);
              }}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '0.75rem',
                border: '1px solid var(--stroke)',
                background: 'var(--card)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                minWidth: '150px',
                justifyContent: 'space-between',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                {phrasalVerbCategoryId ? (
                  (() => {
                    const selectedCat = categories.find(c => c.id === phrasalVerbCategoryId);
                    return selectedCat ? (
                      <>
                        {selectedCat.icon && <span>{selectedCat.icon}</span>}
                        <span
                          style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '3px',
                            background: selectedCat.color || '#11622f',
                            display: 'inline-block',
                          }}
                        />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {selectedCat.name}
                        </span>
                      </>
                    ) : (
                      <span>Все категории</span>
                    );
                  })()
                ) : (
                  <span>Все категории</span>
                )}
              </div>
              {showCategoryDropdown ? <ChevronUpIcon /> : <ChevronDownIcon />}
            </button>
          </div>
        )}
      </div>

      {showCategoryDropdown && dropdownRect && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={categoryDropdownPortalRef}
            style={{
              position: 'fixed',
              top: dropdownRect.top,
              left: dropdownRect.left,
              minWidth: dropdownRect.width,
              maxWidth: Math.max(dropdownRect.width, 280),
              borderRadius: '0.75rem',
              border: '1px solid var(--stroke)',
              background: '#1e1e1e',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
              zIndex: 1100,
              maxHeight: '300px',
              overflowY: 'auto',
            }}
          >
            {viewMode === 'words' && (
              <>
                <button
                  onClick={() => { setCategoryId(null); setShowCategoryDropdown(false); }}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    textAlign: 'left',
                    background: categoryId === null ? 'var(--accent-soft)' : 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    borderRadius: '0.5rem 0.5rem 0 0',
                  }}
                  onMouseEnter={(e) => { if (categoryId !== null) e.currentTarget.style.background = 'var(--accent-soft)'; }}
                  onMouseLeave={(e) => { if (categoryId !== null) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ width: '16px', height: '16px', borderRadius: '4px', background: 'var(--card-strong)' }} />
                  <span>Все категории</span>
                  {categoryId === null && <span style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>✓</span>}
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => { setCategoryId(cat.id); setShowCategoryDropdown(false); }}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.75rem',
                      textAlign: 'left',
                      background: categoryId === cat.id ? 'var(--accent-soft)' : 'transparent',
                      border: 'none',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                    onMouseEnter={(e) => { if (categoryId !== cat.id) e.currentTarget.style.background = 'var(--accent-soft)'; }}
                    onMouseLeave={(e) => { if (categoryId !== cat.id) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {cat.icon && <span style={{ fontSize: '1rem' }}>{cat.icon}</span>}
                    <span style={{ width: '16px', height: '16px', borderRadius: '4px', background: cat.color || '#11622f', flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</span>
                    {cat.word_count !== undefined && cat.word_count > 0 && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>({cat.word_count})</span>
                    )}
                    {categoryId === cat.id && <span style={{ marginLeft: '0.25rem', fontSize: '0.7rem' }}>✓</span>}
                  </button>
                ))}
              </>
            )}
            {viewMode === 'idioms' && (
              <>
                <button
                  onClick={() => { setIdiomCategoryId(null); setShowCategoryDropdown(false); }}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    textAlign: 'left',
                    background: idiomCategoryId === null ? 'var(--accent-soft)' : 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    borderRadius: '0.5rem 0.5rem 0 0',
                  }}
                  onMouseEnter={(e) => { if (idiomCategoryId !== null) e.currentTarget.style.background = 'var(--accent-soft)'; }}
                  onMouseLeave={(e) => { if (idiomCategoryId !== null) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ width: '16px', height: '16px', borderRadius: '4px', background: 'var(--card-strong)' }} />
                  <span>Все категории</span>
                  {idiomCategoryId === null && <span style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>✓</span>}
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => { setIdiomCategoryId(cat.id); setShowCategoryDropdown(false); }}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.75rem',
                      textAlign: 'left',
                      background: idiomCategoryId === cat.id ? 'var(--accent-soft)' : 'transparent',
                      border: 'none',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                    onMouseEnter={(e) => { if (idiomCategoryId !== cat.id) e.currentTarget.style.background = 'var(--accent-soft)'; }}
                    onMouseLeave={(e) => { if (idiomCategoryId !== cat.id) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {cat.icon && <span style={{ fontSize: '1rem' }}>{cat.icon}</span>}
                    <span style={{ width: '16px', height: '16px', borderRadius: '4px', background: cat.color || '#11622f', flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</span>
                    {cat.idiom_count !== undefined && cat.idiom_count > 0 && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>({cat.idiom_count})</span>
                    )}
                    {idiomCategoryId === cat.id && <span style={{ marginLeft: '0.25rem', fontSize: '0.7rem' }}>✓</span>}
                  </button>
                ))}
              </>
            )}
            {viewMode === 'phrasal-verbs' && (
              <>
                <button
                  onClick={() => { setPhrasalVerbCategoryId(null); setShowCategoryDropdown(false); }}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    textAlign: 'left',
                    background: phrasalVerbCategoryId === null ? 'var(--accent-soft)' : 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    borderRadius: '0.5rem 0.5rem 0 0',
                  }}
                  onMouseEnter={(e) => { if (phrasalVerbCategoryId !== null) e.currentTarget.style.background = 'var(--accent-soft)'; }}
                  onMouseLeave={(e) => { if (phrasalVerbCategoryId !== null) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ width: '16px', height: '16px', borderRadius: '4px', background: 'var(--card-strong)' }} />
                  <span>Все категории</span>
                  {phrasalVerbCategoryId === null && <span style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>✓</span>}
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => { setPhrasalVerbCategoryId(cat.id); setShowCategoryDropdown(false); }}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.75rem',
                      textAlign: 'left',
                      background: phrasalVerbCategoryId === cat.id ? 'var(--accent-soft)' : 'transparent',
                      border: 'none',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                    onMouseEnter={(e) => { if (phrasalVerbCategoryId !== cat.id) e.currentTarget.style.background = 'var(--accent-soft)'; }}
                    onMouseLeave={(e) => { if (phrasalVerbCategoryId !== cat.id) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {cat.icon && <span style={{ fontSize: '1rem' }}>{cat.icon}</span>}
                    <span style={{ width: '16px', height: '16px', borderRadius: '4px', background: cat.color || '#11622f', flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</span>
                    {cat.phrasal_verb_count !== undefined && cat.phrasal_verb_count > 0 && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>({cat.phrasal_verb_count})</span>
                    )}
                    {phrasalVerbCategoryId === cat.id && <span style={{ marginLeft: '0.25rem', fontSize: '0.7rem' }}>✓</span>}
                  </button>
                ))}
              </>
            )}
          </div>,
          document.body
        )}

      {showLevelDropdown && levelDropdownRect && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={levelDropdownPortalRef}
            style={{
              position: 'fixed',
              top: levelDropdownRect.top,
              left: levelDropdownRect.left,
              minWidth: levelDropdownRect.width,
              maxWidth: Math.max(levelDropdownRect.width, 200),
              borderRadius: '0.75rem',
              border: '1px solid var(--stroke)',
              background: '#1e1e1e',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
              zIndex: 1100,
              maxHeight: '320px',
              overflowY: 'auto',
            }}
          >
            {LEVEL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setDifficulty(opt.value);
                  setShowLevelDropdown(false);
                }}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem',
                  textAlign: 'left',
                  background: difficulty === opt.value ? 'var(--accent-soft)' : 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  borderRadius: opt.value === 'all' ? '0.5rem 0.5rem 0 0' : undefined,
                }}
                onMouseEnter={(e) => {
                  if (difficulty !== opt.value) e.currentTarget.style.background = 'var(--accent-soft)';
                }}
                onMouseLeave={(e) => {
                  if (difficulty !== opt.value) e.currentTarget.style.background = 'transparent';
                }}
              >
                {opt.value === 'all' ? (
                  <span style={{ width: '16px', height: '16px', borderRadius: '4px', background: 'var(--card-strong)', flexShrink: 0 }} />
                ) : (
                  <span
                    style={{
                      minWidth: '20px',
                      height: '18px',
                      padding: '0 4px',
                      borderRadius: '4px',
                      background: 'var(--accent-soft)',
                      color: 'var(--text-primary)',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {opt.value}
                  </span>
                )}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {opt.label}
                </span>
                {difficulty === opt.value && <span style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>✓</span>}
              </button>
            ))}
          </div>,
          document.body
        )}

      {showExportDropdown && exportDropdownRect && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={exportDropdownPortalRef}
            style={{
              position: 'fixed',
              top: exportDropdownRect.top,
              left: exportDropdownRect.left,
              minWidth: exportDropdownRect.width,
              borderRadius: '0.75rem',
              border: '1px solid var(--stroke)',
              background: '#1e1e1e',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
              zIndex: 1100,
              overflow: 'hidden',
            }}
          >
            {/* Export count info */}
            <div
              style={{
                padding: '0.5rem 0.85rem',
                borderBottom: '1px solid var(--stroke)',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                background: 'var(--card)',
              }}
            >
              {viewMode === 'words' && (
                <>Экспорт {words.length} {plural(words.length, 'слова', 'слов', 'слов')}</>
              )}
              {viewMode === 'idioms' && (
                <>Экспорт {filteredIdioms.length} {plural(filteredIdioms.length, 'идиомы', 'идиом', 'идиом')}</>
              )}
              {viewMode === 'phrasal-verbs' && (
                <>Экспорт {filteredPhrasalVerbs.length} {plural(filteredPhrasalVerbs.length, 'фразового глагола', 'фразовых глаголов', 'фразовых глаголов')}</>
              )}
            </div>
            {EXPORT_FORMATS.map(({ format, label }) => (
              <button
                key={format}
                type="button"
                onClick={() => handleExport(format)}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.85rem',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-soft)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <DownloadIcon />
                <span>{label}</span>
              </button>
            ))}
          </div>,
          document.body
        )}

      {error && (
        <div
          style={{
            padding: '0.9rem 1rem',
            borderRadius: '0.75rem',
            background: 'rgba(127,29,29,0.25)',
            border: '1px solid rgba(248,113,113,0.6)',
            color: '#fecaca',
            fontSize: '0.85rem',
          }}
        >
          {error}
        </div>
      )}

      <div className="dictionary-tab-grid">
        <div
          style={{
            borderRadius: '1.25rem',
            background: 'linear-gradient(135deg, var(--card) 0%, var(--card-strong) 100%)',
            border: '1px solid var(--stroke)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            backdropFilter: 'blur(10px)',
            padding: '0.75rem',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'visible',
          }}
        >
          <div
            style={{
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              padding: '0.25rem 0.5rem 0.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {viewMode === 'words' ? (
                <>
                  <input
                    type="checkbox"
                    checked={words.length > 0 && selectedWordIds.size === words.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedWordIds(new Set(words.map((w) => w.id)));
                      } else {
                        setSelectedWordIds(new Set());
                      }
                    }}
                    style={{
                      accentColor: 'var(--accent)',
                    }}
                  />
                  <span>
                    Слова из караоке и видео ({words.length})
                  </span>
                </>
              ) : viewMode === 'idioms' ? (
                <>
                  <input
                    type="checkbox"
                    checked={filteredIdioms.length > 0 && selectedIdiomPhrases.size === filteredIdioms.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIdiomPhrases(
                          new Set(filteredIdioms.map((i) => i.phrase.trim().toLowerCase())),
                        );
                      } else {
                        setSelectedIdiomPhrases(new Set());
                      }
                    }}
                    style={{
                      accentColor: 'var(--accent)',
                    }}
                  />
                  <span>
                    Идиомы из песен ({filteredIdioms.length})
                  </span>
                </>
              ) : (
                <>
                  <input
                    type="checkbox"
                    checked={filteredPhrasalVerbs.length > 0 && selectedPhrasalVerbPhrases.size === filteredPhrasalVerbs.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPhrasalVerbPhrases(
                          new Set(filteredPhrasalVerbs.map((pv) => pv.phrase.trim().toLowerCase())),
                        );
                      } else {
                        setSelectedPhrasalVerbPhrases(new Set());
                      }
                    }}
                    style={{
                      accentColor: 'var(--accent)',
                    }}
                  />
                  <span>
                    Фразовые глаголы из песен ({filteredPhrasalVerbs.length})
                  </span>
                </>
              )}
            </div>
            {viewMode === 'words' && selectedWordIds.size > 0 && (
              <button
                onClick={async () => {
                  if (!accessToken || selectedWordIds.size === 0) return;
                  if (
                    !confirm(
                      `Удалить ${selectedWordIds.size} выбранных слов из словаря?`,
                    )
                  ) {
                    return;
                  }
                  try {
                    const resp = await fetch(
                      `${getApiUrl()}/api/vocabulary/words/bulk-delete`,
                      {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${accessToken}`,
                        },
                        body: JSON.stringify({
                          ids: Array.from(selectedWordIds),
                        }),
                      },
                    );
                    const data = await resp.json();
                    if (!resp.ok || !data.ok) {
                      throw new Error(
                        data?.error || 'Не удалось удалить слова из словаря',
                      );
                    }
                    const toDelete = new Set<string>(data.deleted_ids || []);
                    setWords((prev) => prev.filter((w) => !toDelete.has(w.id)));
                    setSelectedWordIds(new Set());
                    if (selectedWordId && toDelete.has(selectedWordId)) {
                      const remaining = words.filter((w) => !toDelete.has(w.id));
                      setSelectedWordId(remaining[0]?.id || null);
                    }
                  } catch (e) {
                    console.error('Bulk delete words error', e);
                  }
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'rgba(248,113,113,0.9)',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                }}
              >
                Удалить выбранные
              </button>
            )}
            {viewMode === 'idioms' && selectedIdiomPhrases.size > 0 && (
              <button
                onClick={async () => {
                  if (!accessToken || selectedIdiomPhrases.size === 0) return;
                  if (
                    !confirm(
                      `Удалить ${selectedIdiomPhrases.size} выбранных идиом из словаря?`,
                    )
                  ) {
                    return;
                  }
                  try {
                    const resp = await fetch(
                      `${getApiUrl()}/api/vocabulary/idioms/bulk-delete`,
                      {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${accessToken}`,
                        },
                        body: JSON.stringify({
                          phrases: Array.from(selectedIdiomPhrases),
                        }),
                      },
                    );
                    const data = await resp.json();
                    if (!resp.ok || !data.ok) {
                      throw new Error(
                        data?.error || 'Не удалось удалить идиомы из словаря',
                      );
                    }
                    const toDelete = new Set<string>(
                      (data.deleted_phrases || []).map((p: string) =>
                        p.trim().toLowerCase(),
                      ),
                    );
                    setIdioms((prev) => {
                      const filtered = prev.filter(
                        (i) => !toDelete.has(i.phrase.trim().toLowerCase()),
                      );
                      // Update selected idiom if it was deleted
                      if (selectedIdiom && toDelete.has(selectedIdiom.phrase.trim().toLowerCase())) {
                        setSelectedIdiom(filtered[0] || null);
                      }
                      return filtered;
                    });
                    setSelectedIdiomPhrases(new Set());
                  } catch (e) {
                    console.error('Bulk delete idioms error', e);
                  }
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'rgba(248,113,113,0.9)',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                }}
              >
                Удалить выбранные
              </button>
            )}
            {viewMode === 'phrasal-verbs' && selectedPhrasalVerbPhrases.size > 0 && (
              <button
                onClick={async () => {
                  if (!accessToken || selectedPhrasalVerbPhrases.size === 0) return;
                  if (
                    !confirm(
                      `Удалить ${selectedPhrasalVerbPhrases.size} выбранных фразовых глаголов из словаря?`,
                    )
                  ) {
                    return;
                  }
                  try {
                    const resp = await fetch(
                      `${getApiUrl()}/api/vocabulary/phrasal-verbs/bulk-delete`,
                      {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${accessToken}`,
                        },
                        body: JSON.stringify({
                          phrases: Array.from(selectedPhrasalVerbPhrases),
                        }),
                      },
                    );
                    const data = await resp.json();
                    if (!resp.ok || !data.ok) {
                      throw new Error(
                        data?.error || 'Не удалось удалить фразовые глаголы из словаря',
                      );
                    }
                    const toDelete = new Set<string>(
                      (data.deleted_phrases || []).map((p: string) =>
                        p.trim().toLowerCase(),
                      ),
                    );
                    setPhrasalVerbs((prev) => {
                      const filtered = prev.filter(
                        (pv) => !toDelete.has(pv.phrase.trim().toLowerCase()),
                      );
                      // Update selected phrasal verb if it was deleted
                      if (selectedPhrasalVerb && toDelete.has(selectedPhrasalVerb.phrase.trim().toLowerCase())) {
                        setSelectedPhrasalVerb(filtered[0] || null);
                      }
                      return filtered;
                    });
                    setSelectedPhrasalVerbPhrases(new Set());
                  } catch (e) {
                    console.error('Bulk delete phrasal verbs error', e);
                  }
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'rgba(248,113,113,0.9)',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                }}
              >
                Удалить выбранные
              </button>
            )}
          </div>
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              borderRadius: '0.9rem',
            }}
          >
            {viewMode === 'words' ? (
              <>
                {loading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="dictionary-skeleton-row">
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                          <div className="dictionary-skeleton-line" style={{ width: 18, height: 18, borderRadius: 4, marginTop: 2 }} />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            <div className="dictionary-skeleton-line" style={{ width: 80 + (i % 4) * 24, maxWidth: 200 }} />
                            <div className="dictionary-skeleton-line" style={{ width: 120 + (i % 3) * 20, maxWidth: 260, height: '0.75rem' }} />
                          </div>
                        </div>
                        <div className="dictionary-skeleton-line" style={{ width: 44, height: 22, borderRadius: 999 }} />
                      </div>
                    ))}
                  </div>
                ) : words.length === 0 ? (
                  <div
                    style={{
                      padding: '2rem',
                      textAlign: 'center',
                      fontSize: '0.9rem',
                      color: 'rgba(148,163,184,0.9)',
                    }}
                  >
                    {debouncedSearch || difficulty !== 'all' ? (
                      <>
                        <div style={{ marginBottom: '0.5rem' }}>
                          Ничего не найдено по заданным фильтрам.
                        </div>
                        <button
                          onClick={() => {
                            setSearch('');
                            setDifficulty('all');
                            setCategoryId(null);
                          }}
                          style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '0.75rem',
                            border: '1px solid rgba(17,98,47,0.3)',
                            background: 'linear-gradient(135deg, rgba(24,24,27,0.95) 0%, rgba(39,39,42,0.9) 100%)',
                            color: '#e5e7eb',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            marginTop: '0.5rem',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                            transition: 'all 0.2s',
                          }}
                        >
                          Сбросить фильтры
                        </button>
                      </>
                    ) : (
                      'Словарь пока пуст. Добавляйте слова из караоке, нажимая «Добавить в словарь».'
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {words.map((word) => {
                      const isSelected = selectedWord?.id === word.id;
                      const isChecked = selectedWordIds.has(word.id);

                      return (
                        <button
                          key={word.id}
                          className="dictionary-list-item"
                          onClick={() => setSelectedWordId(word.id)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            borderRadius: '0.85rem',
                            border: isSelected
                              ? '1px solid rgba(17,98,47,0.6)'
                              : '1px solid rgba(17,98,47,0.15)',
                            background: isSelected
                              ? 'linear-gradient(135deg, rgba(17,98,47,0.25) 0%, rgba(11,81,37,0.2) 100%)'
                              : 'linear-gradient(135deg, rgba(24,24,27,0.95) 0%, rgba(39,39,42,0.9) 100%)',
                            padding: '0.6rem 0.75rem',
                            cursor: 'pointer',
                            display: 'flex',
                            boxShadow: isSelected 
                              ? '0 4px 12px rgba(17,98,47,0.2)' 
                              : '0 2px 4px rgba(0,0,0,0.1)',
                            transition: 'all 0.2s',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '0.75rem',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '0.5rem',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                e.stopPropagation();
                                setSelectedWordIds((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) {
                                    next.add(word.id);
                                  } else {
                                    next.delete(word.id);
                                  }
                                  return next;
                                });
                              }}
                              style={{
                                marginTop: '0.2rem',
                                accentColor: '#11622f',
                              }}
                            />
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.2rem',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: '0.95rem',
                                  fontWeight: 600,
                                  color: '#f9fafb',
                                }}
                              >
                                {word.word}
                              </div>
                              {word.translations && word.translations.length > 0 && (
                                <div
                                  style={{
                                    fontSize: '0.8rem',
                                    color: 'rgba(156,163,175,0.95)',
                                    whiteSpace: 'nowrap',
                                    textOverflow: 'ellipsis',
                                    overflow: 'hidden',
                                    maxWidth: '260px',
                                  }}
                                >
                                  {word.translations.map((t) => t.translation).join(', ')}
                                </div>
                              )}
                            </div>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'flex-end',
                              gap: '0.25rem',
                              fontSize: '0.75rem',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                gap: '0.35rem',
                                flexWrap: 'wrap',
                                justifyContent: 'flex-end',
                              }}
                            >
                              {word.categories && word.categories.length > 0 && (
                                <>
                                  {word.categories.map((cat) => (
                                    <span
                                      key={cat.id}
                                      style={{
                                        padding: '0.15rem 0.45rem',
                                        borderRadius: '999px',
                                        background: cat.color || '#11622f',
                                        color: '#ffffff',
                                        fontSize: '0.7rem',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.2rem',
                                      }}
                                      title={cat.description || cat.name}
                                    >
                                      {cat.icon && <span>{cat.icon}</span>}
                                      <span>{cat.name}</span>
                                    </span>
                                  ))}
                                </>
                              )}
                              {word.difficulty_level && (
                                <span
                                  style={{
                                    padding: '0.15rem 0.45rem',
                                    borderRadius: '999px',
                                    background: '#256f40',
                                    color: 'rgba(220,252,231,0.98)',
                                    fontSize: '0.75rem',
                                  }}
                                >
                                  {word.difficulty_level}
                                </span>
                              )}
                              {typeof word.mastery_level === 'number' && (
                                <span
                                  style={{
                                    padding: '0.15rem 0.45rem',
                                    borderRadius: '999px',
                                    border: '1px solid rgba(55,65,81,0.9)',
                                    color: 'rgba(209,213,219,0.95)',
                                  }}
                                >
                                  Уровень {word.mastery_level}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            ) : viewMode === 'idioms' ? (
              <>
                {idiomsLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="dictionary-skeleton-row">
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                          <div className="dictionary-skeleton-line" style={{ width: 18, height: 18, borderRadius: 4, marginTop: 2 }} />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            <div className="dictionary-skeleton-line" style={{ width: 100 + (i % 4) * 28, maxWidth: 220 }} />
                            <div className="dictionary-skeleton-line" style={{ width: 140 + (i % 3) * 25, maxWidth: 260, height: '0.75rem' }} />
                          </div>
                        </div>
                        <div className="dictionary-skeleton-line" style={{ width: 44, height: 22, borderRadius: 999 }} />
                      </div>
                    ))}
                  </div>
                ) : filteredIdioms.length === 0 ? (
                  <div
                    style={{
                      padding: '2rem',
                      textAlign: 'center',
                      fontSize: '0.9rem',
                      color: 'rgba(148,163,184,0.9)',
                    }}
                  >
                    {debouncedSearch || difficulty !== 'all' ? (
                      <>
                        <div style={{ marginBottom: '0.5rem' }}>
                          Идиомы не найдены по заданным фильтрам.
                        </div>
                        <button
                          onClick={() => {
                            setSearch('');
                            setDifficulty('all');
                            setIdiomCategoryId(null);
                          }}
                          style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '0.75rem',
                            border: '1px solid rgba(17,98,47,0.3)',
                            background: 'linear-gradient(135deg, rgba(24,24,27,0.95) 0%, rgba(39,39,42,0.9) 100%)',
                            color: '#e5e7eb',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            marginTop: '0.5rem',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                            transition: 'all 0.2s',
                          }}
                        >
                          Сбросить фильтры
                        </button>
                      </>
                    ) : (
                      'Идиом пока нет. Включите определитель идиом в караоке и добавьте интересные выражения.'
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {filteredIdioms.map((idiom, idx) => {
                      const key = idiom.phrase.trim().toLowerCase();
                      const isSelected = selectedIdiom?.phrase.trim().toLowerCase() === key;
                      const isChecked = selectedIdiomPhrases.has(key);
                      return (
                        <button
                          key={idx}
                          className="dictionary-list-item"
                          onClick={() => setSelectedIdiom(idiom)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            borderRadius: '0.85rem',
                            border: isSelected
                              ? '1px solid rgba(17,98,47,0.6)'
                              : '1px solid rgba(17,98,47,0.15)',
                            background: isSelected
                              ? 'linear-gradient(135deg, rgba(17,98,47,0.25) 0%, rgba(11,81,37,0.2) 100%)'
                              : 'linear-gradient(135deg, rgba(24,24,27,0.95) 0%, rgba(39,39,42,0.9) 100%)',
                            padding: '0.6rem 0.75rem',
                            cursor: 'pointer',
                            display: 'flex',
                            boxShadow: isSelected 
                              ? '0 4px 12px rgba(17,98,47,0.2)' 
                              : '0 2px 4px rgba(0,0,0,0.1)',
                            transition: 'all 0.2s',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '0.75rem',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '0.5rem',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                e.stopPropagation();
                                setSelectedIdiomPhrases((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) {
                                    next.add(key);
                                  } else {
                                    next.delete(key);
                                  }
                                  return next;
                                });
                              }}
                              style={{
                                marginTop: '0.2rem',
                                accentColor: '#11622f',
                              }}
                            />
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.2rem',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: '0.95rem',
                                  fontWeight: 600,
                                  color: '#f9fafb',
                                }}
                              >
                                {idiom.phrase}
                              </div>
                              {idiom.meaning && (
                                <div
                                  style={{
                                    fontSize: '0.8rem',
                                    color: 'rgba(156,163,175,0.95)',
                                    whiteSpace: 'nowrap',
                                    textOverflow: 'ellipsis',
                                    overflow: 'hidden',
                                    maxWidth: '260px',
                                  }}
                                >
                                  {idiom.meaning}
                                </div>
                              )}
                            </div>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'flex-end',
                              gap: '0.25rem',
                              fontSize: '0.75rem',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                gap: '0.35rem',
                                flexWrap: 'wrap',
                                justifyContent: 'flex-end',
                              }}
                            >
                              {idiom.categories && idiom.categories.length > 0 && (
                                <>
                                  {idiom.categories.map((cat) => (
                                    <span
                                      key={cat.id}
                                      style={{
                                        padding: '0.15rem 0.45rem',
                                        borderRadius: '999px',
                                        background: cat.color || '#11622f',
                                        color: '#ffffff',
                                        fontSize: '0.7rem',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.2rem',
                                      }}
                                      title={cat.description || cat.name}
                                    >
                                      {cat.icon && <span>{cat.icon}</span>}
                                      <span>{cat.name}</span>
                                    </span>
                                  ))}
                                </>
                              )}
                            </div>
                            {idiom.difficulty_level && (
                              <span
                                style={{
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: '999px',
                                  background: '#256f40',
                                  color: 'rgba(220,252,231,0.98)',
                                  fontSize: '0.75rem',
                                }}
                              >
                                {idiom.difficulty_level}
                              </span>
                            )}
                            {idiom.videos && idiom.videos.length > 0 && (
                              <span
                                style={{
                                  color: 'rgba(148,163,184,0.9)',
                                  fontSize: '0.7rem',
                                }}
                              >
                                {idiom.videos.length} {idiom.videos.length === 1 ? 'видео' : 'видео'}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            ) : null}
            {viewMode === 'phrasal-verbs' && (
              <>
                {phrasalVerbsLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="dictionary-skeleton-row">
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                          <div className="dictionary-skeleton-line" style={{ width: 18, height: 18, borderRadius: 4, marginTop: 2 }} />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            <div className="dictionary-skeleton-line" style={{ width: 90 + (i % 4) * 26, maxWidth: 210 }} />
                            <div className="dictionary-skeleton-line" style={{ width: 130 + (i % 3) * 22, maxWidth: 260, height: '0.75rem' }} />
                          </div>
                        </div>
                        <div className="dictionary-skeleton-line" style={{ width: 44, height: 22, borderRadius: 999 }} />
                      </div>
                    ))}
                  </div>
                ) : filteredPhrasalVerbs.length === 0 ? (
                  <div
                    style={{
                      padding: '2rem',
                      textAlign: 'center',
                      fontSize: '0.9rem',
                      color: 'rgba(148,163,184,0.9)',
                    }}
                  >
                    {debouncedSearch || difficulty !== 'all' ? (
                      <>
                        <div style={{ marginBottom: '0.5rem' }}>
                          Фразовые глаголы не найдены по заданным фильтрам.
                        </div>
                        <button
                          onClick={() => {
                            setSearch('');
                            setDifficulty('all');
                            setPhrasalVerbCategoryId(null);
                          }}
                          style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '0.75rem',
                            border: '1px solid rgba(17,98,47,0.3)',
                            background: 'linear-gradient(135deg, rgba(24,24,27,0.95) 0%, rgba(39,39,42,0.9) 100%)',
                            color: '#e5e7eb',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            marginTop: '0.5rem',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                            transition: 'all 0.2s',
                          }}
                        >
                          Сбросить фильтры
                        </button>
                      </>
                    ) : (
                      'Фразовых глаголов пока нет. Включите определитель фразовых глаголов в караоке и добавьте интересные выражения.'
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {filteredPhrasalVerbs.map((phrasalVerb, idx) => {
                      const key = phrasalVerb.phrase.trim().toLowerCase();
                      const isSelected = selectedPhrasalVerb?.phrase.trim().toLowerCase() === key;
                      const isChecked = selectedPhrasalVerbPhrases.has(key);
                      return (
                        <button
                          key={idx}
                          className="dictionary-list-item"
                          onClick={() => setSelectedPhrasalVerb(phrasalVerb)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            borderRadius: '0.85rem',
                            border: isSelected
                              ? '1px solid rgba(17,98,47,0.6)'
                              : '1px solid rgba(17,98,47,0.15)',
                            background: isSelected
                              ? 'linear-gradient(135deg, rgba(17,98,47,0.25) 0%, rgba(11,81,37,0.2) 100%)'
                              : 'linear-gradient(135deg, rgba(24,24,27,0.95) 0%, rgba(39,39,42,0.9) 100%)',
                            padding: '0.6rem 0.75rem',
                            cursor: 'pointer',
                            display: 'flex',
                            boxShadow: isSelected 
                              ? '0 4px 12px rgba(17,98,47,0.2)' 
                              : '0 2px 4px rgba(0,0,0,0.1)',
                            transition: 'all 0.2s',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '0.75rem',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '0.5rem',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                e.stopPropagation();
                                setSelectedPhrasalVerbPhrases((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) {
                                    next.add(key);
                                  } else {
                                    next.delete(key);
                                  }
                                  return next;
                                });
                              }}
                              style={{
                                marginTop: '0.2rem',
                                accentColor: '#11622f',
                              }}
                            />
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.2rem',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: '0.95rem',
                                  fontWeight: 600,
                                  color: '#f9fafb',
                                }}
                              >
                                {phrasalVerb.phrase}
                              </div>
                              {phrasalVerb.meaning && (
                                <div
                                  style={{
                                    fontSize: '0.8rem',
                                    color: 'rgba(156,163,175,0.95)',
                                    whiteSpace: 'nowrap',
                                    textOverflow: 'ellipsis',
                                    overflow: 'hidden',
                                    maxWidth: '260px',
                                  }}
                                >
                                  {phrasalVerb.meaning}
                                </div>
                              )}
                            </div>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'flex-end',
                              gap: '0.25rem',
                              fontSize: '0.75rem',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                gap: '0.35rem',
                                flexWrap: 'wrap',
                                justifyContent: 'flex-end',
                              }}
                            >
                              {phrasalVerb.categories && phrasalVerb.categories.length > 0 && (
                                <>
                                  {phrasalVerb.categories.map((cat) => (
                                    <span
                                      key={cat.id}
                                      style={{
                                        padding: '0.15rem 0.45rem',
                                        borderRadius: '999px',
                                        background: cat.color || '#11622f',
                                        color: '#ffffff',
                                        fontSize: '0.7rem',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.2rem',
                                      }}
                                      title={cat.description || cat.name}
                                    >
                                      {cat.icon && <span>{cat.icon}</span>}
                                      <span>{cat.name}</span>
                                    </span>
                                  ))}
                                </>
                              )}
                            </div>
                            {phrasalVerb.difficulty_level && (
                              <span
                                style={{
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: '999px',
                                  background: '#256f40',
                                  color: 'rgba(220,252,231,0.98)',
                                  fontSize: '0.75rem',
                                }}
                              >
                                {phrasalVerb.difficulty_level}
                              </span>
                            )}
                            {phrasalVerb.videos && phrasalVerb.videos.length > 0 && (
                              <span
                                style={{
                                  color: 'rgba(148,163,184,0.9)',
                                  fontSize: '0.7rem',
                                }}
                              >
                                {phrasalVerb.videos.length} {phrasalVerb.videos.length === 1 ? 'видео' : 'видео'}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {viewMode === 'words' ? (
          <div
            style={{
              borderRadius: '1.25rem',
              background: 'linear-gradient(135deg, var(--card) 0%, var(--card-strong) 100%)',
              border: '1px solid rgba(17,98,47,0.2)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
              backdropFilter: 'blur(10px)',
              padding: '1rem 1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            {selectedWord ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: 'rgba(148,163,184,0.9)',
                        marginBottom: '0.15rem',
                      }}
                    >
                      Выбранное слово
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '1.1rem',
                          fontWeight: 700,
                          color: '#f9fafb',
                        }}
                      >
                        {selectedWord.word}
                      </span>
                      <button
                        onClick={synthesizeWordAudio}
                        disabled={wordAudioLoading}
                        style={{
                          padding: '0.4rem 0.8rem',
                          borderRadius: '0.6rem',
                          border: '1px solid rgba(82,82,91,0.9)',
                          background: wordAudioLoading ? 'rgba(24,24,27,0.95)' : 'rgba(17,98,47,0.9)',
                          color: wordAudioLoading ? 'rgba(148,163,184,0.9)' : '#e5e7eb',
                          fontSize: '0.8rem',
                          cursor: wordAudioLoading ? 'default' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          opacity: wordAudioLoading ? 0.7 : 1,
                          transition: 'all 0.2s',
                        }}
                        title={
                          wordAudioLoading
                            ? 'Синтез произношения...'
                            : wordAudioUrl
                              ? 'Воспроизвести произношение'
                              : 'Синтезировать и воспроизвести произношение'
                        }
                      >
                        {wordAudioLoading ? (
                          <>🔊 Синтез...</>
                        ) : wordAudioUrl ? (
                          <>▶ Произношение</>
                        ) : (
                          <>🔊 Произношение</>
                        )}
                      </button>
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: '0.25rem',
                      fontSize: '0.75rem',
                      color: 'rgba(148,163,184,0.9)',
                    }}
                  >
                    {selectedWord.difficulty_level && (
                      <span
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '999px',
                          background: '#256f40',
                          color: 'rgba(219,234,254,0.98)',
                        }}
                      >
                        Уровень: {selectedWord.difficulty_level}
                      </span>
                    )}
                  </div>
                </div>

                {selectedWord.translations && selectedWord.translations.length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'rgba(148,163,184,0.9)',
                        marginBottom: '0.15rem',
                      }}
                    >
                      Переводы:
                    </div>
                    <div
                      style={{
                        fontSize: '0.95rem',
                        color: '#e5e7eb',
                      }}
                    >
                      {selectedWord.translations.map((t) => t.translation).join(', ')}
                    </div>
                  </div>
                )}

                {selectedWord.contexts && selectedWord.contexts.length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'rgba(148,163,184,0.9)',
                        marginBottom: '0.15rem',
                      }}
                    >
                      Примеры из караоке:
                    </div>
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: '1.1rem',
                        fontSize: '0.85rem',
                        color: 'rgba(209,213,219,0.98)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem',
                        maxHeight: '150px',
                        overflowY: 'auto',
                      }}
                    >
                      {selectedWord.contexts.slice(0, 5).map((ctx, idx) => (
                        <li key={idx}>{ctx.text}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: 'rgba(148,163,184,0.9)',
                      marginBottom: '0.5rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span>Категории:</span>
                    <button
                      onClick={() => {
                        setAssigningWordId(selectedWord.id);
                        setAssigningIdiomId(null);
                        const currentCategoryIds = selectedWord.categories?.map(c => c.id) || [];
                        setSelectedCategoryIds(new Set(currentCategoryIds));
                        setShowAssignCategoriesModal(true);
                      }}
                      style={{
                        padding: '0.3rem 0.6rem',
                        borderRadius: '0.5rem',
                        border: '1px solid rgba(75,85,99,0.9)',
                        background: 'rgba(24,24,27,0.95)',
                        color: '#e5e7eb',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                    >
                      Изменить
                    </button>
                  </div>
                  {selectedWord.categories && selectedWord.categories.length > 0 ? (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.4rem',
                      }}
                    >
                      {selectedWord.categories.map((cat) => (
                        <span
                          key={cat.id}
                          style={{
                            padding: '0.25rem 0.6rem',
                            borderRadius: '999px',
                            background: cat.color || '#11622f',
                            color: '#ffffff',
                            fontSize: '0.8rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                          }}
                          title={cat.description || cat.name}
                        >
                          {cat.icon && <span>{cat.icon}</span>}
                          <span>{cat.name}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div
                      style={{
                        fontSize: '0.85rem',
                        color: 'rgba(148,163,184,0.7)',
                        fontStyle: 'italic',
                      }}
                    >
                      Нет категорий
                    </div>
                  )}
                </div>

                {selectedWord.videos && selectedWord.videos.length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'rgba(148,163,184,0.9)',
                        marginBottom: '0.15rem',
                      }}
                    >
                      Связанные видео:
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                        fontSize: '0.85rem',
                      }}
                    >
                      {selectedWord.videos.map((v) => (
                        <span
                          key={v.id}
                          style={{
                            padding: '0.3rem 0.6rem',
                            borderRadius: '999px',
                            background: '#256f40',
                            color: 'rgba(219,234,254,0.98)',
                          }}
                        >
                          {v.title || 'Видео'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hidden audio element for pronunciation */}
                <audio ref={wordAudioRef} src={wordAudioUrl || undefined} />
              </>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.9rem',
                  color: 'rgba(148,163,184,0.9)',
                }}
              >
                Выберите слово слева, чтобы увидеть детали.
              </div>
            )}
          </div>
        ) : viewMode === 'idioms' ? (
          <div
            style={{
              borderRadius: '1.25rem',
              background: 'linear-gradient(135deg, var(--card) 0%, var(--card-strong) 100%)',
              border: '1px solid rgba(17,98,47,0.2)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
              backdropFilter: 'blur(10px)',
              padding: '1rem 1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            {selectedIdiom ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: 'rgba(148,163,184,0.9)',
                        marginBottom: '0.15rem',
                      }}
                    >
                      Выбранная идиома
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '1.1rem',
                          fontWeight: 700,
                          color: '#f9fafb',
                        }}
                      >
                        {selectedIdiom.phrase}
                      </div>
                      <button
                        onClick={synthesizeIdiomAudio}
                        disabled={idiomAudioLoading}
                        style={{
                          padding: '0.4rem 0.8rem',
                          borderRadius: '0.6rem',
                          border: '1px solid rgba(82,82,91,0.9)',
                          background: idiomAudioLoading ? 'rgba(24,24,27,0.95)' : 'rgba(17,98,47,0.9)',
                          color: idiomAudioLoading ? 'rgba(148,163,184,0.9)' : '#e5e7eb',
                          fontSize: '0.8rem',
                          cursor: idiomAudioLoading ? 'default' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          opacity: idiomAudioLoading ? 0.7 : 1,
                          transition: 'all 0.2s',
                        }}
                        title={
                          idiomAudioLoading
                            ? 'Синтез произношения...'
                            : idiomAudioUrl
                              ? 'Воспроизвести произношение'
                              : 'Синтезировать и воспроизвести произношение'
                        }
                      >
                        {idiomAudioLoading ? (
                          <>🔊 Синтез...</>
                        ) : idiomAudioUrl ? (
                          <>▶ Произношение</>
                        ) : (
                          <>🔊 Произношение</>
                        )}
                      </button>
                      <audio ref={idiomAudioRef} src={idiomAudioUrl || undefined} />
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: '0.25rem',
                      fontSize: '0.75rem',
                      color: 'rgba(148,163,184,0.9)',
                    }}
                  >
                    {selectedIdiom.difficulty_level && (
                      <span
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '999px',
                          background: '#256f40',
                          color: 'rgba(219,234,254,0.98)',
                        }}
                      >
                        Уровень: {selectedIdiom.difficulty_level}
                      </span>
                    )}
                    {selectedIdiom.videos && selectedIdiom.videos.length > 0 && (
                      <span>
                        Связанных видео: {selectedIdiom.videos.length}
                      </span>
                    )}
                  </div>
                </div>

                {selectedIdiom.meaning && (
                  <div>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'rgba(148,163,184,0.9)',
                        marginBottom: '0.15rem',
                      }}
                    >
                      Значение:
                    </div>
                    <div
                      style={{
                        fontSize: '0.95rem',
                        color: '#e5e7eb',
                      }}
                    >
                      {selectedIdiom.meaning}
                    </div>
                  </div>
                )}

                {selectedIdiom.literal_translation && (
                  <div>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'rgba(148,163,184,0.9)',
                        marginBottom: '0.15rem',
                      }}
                    >
                      Дословный перевод:
                    </div>
                    <div
                      style={{
                        fontSize: '0.95rem',
                        color: '#e5e7eb',
                        fontStyle: 'italic',
                      }}
                    >
                      {selectedIdiom.literal_translation}
                    </div>
                  </div>
                )}

                {selectedIdiom.usage_examples && selectedIdiom.usage_examples.length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'rgba(148,163,184,0.9)',
                        marginBottom: '0.15rem',
                      }}
                    >
                      Примеры использования:
                    </div>
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: '1.1rem',
                        fontSize: '0.85rem',
                        color: 'rgba(209,213,219,0.98)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem',
                        maxHeight: '150px',
                        overflowY: 'auto',
                      }}
                    >
                      {selectedIdiom.usage_examples.map((ex, idx) => (
                        <li key={idx}>{ex}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedIdiom.id && (
                  <div>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'rgba(148,163,184,0.9)',
                        marginBottom: '0.5rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span>Категории:</span>
                      <button
                        onClick={() => {
                          setAssigningIdiomId(selectedIdiom.id!);
                          setAssigningWordId(null);
                          const currentCategoryIds = selectedIdiom.categories?.map(c => c.id) || [];
                          setSelectedCategoryIds(new Set(currentCategoryIds));
                          setShowAssignCategoriesModal(true);
                        }}
                        style={{
                          padding: '0.3rem 0.6rem',
                          borderRadius: '0.5rem',
                          border: '1px solid rgba(75,85,99,0.9)',
                          background: 'rgba(24,24,27,0.95)',
                          color: '#e5e7eb',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                        }}
                      >
                        Изменить
                      </button>
                    </div>
                    {selectedIdiom.categories && selectedIdiom.categories.length > 0 ? (
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '0.4rem',
                        }}
                      >
                        {selectedIdiom.categories.map((cat) => (
                          <span
                            key={cat.id}
                            style={{
                              padding: '0.25rem 0.6rem',
                              borderRadius: '999px',
                              background: cat.color || '#11622f',
                              color: '#ffffff',
                              fontSize: '0.8rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                            }}
                            title={cat.description || cat.name}
                          >
                            {cat.icon && <span>{cat.icon}</span>}
                            <span>{cat.name}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: '0.85rem',
                          color: 'rgba(148,163,184,0.7)',
                          fontStyle: 'italic',
                        }}
                      >
                        Нет категорий
                      </div>
                    )}
                  </div>
                )}

                {selectedIdiom.videos && selectedIdiom.videos.length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'rgba(148,163,184,0.9)',
                        marginBottom: '0.15rem',
                      }}
                    >
                      Связанные видео:
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                        fontSize: '0.85rem',
                      }}
                    >
                      {selectedIdiom.videos.map((v) => (
                        <span
                          key={v.id}
                          style={{
                            padding: '0.3rem 0.6rem',
                            borderRadius: '999px',
                            background: '#256f40',
                            color: 'rgba(219,234,254,0.98)',
                          }}
                        >
                          {v.title || 'Видео'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

              </>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.9rem',
                  color: 'rgba(148,163,184,0.9)',
                }}
              >
                Выберите идиому слева, чтобы увидеть детали.
              </div>
            )}
          </div>
        ) : viewMode === 'phrasal-verbs' ? (
          <div
            style={{
              borderRadius: '1.25rem',
              background: 'linear-gradient(135deg, var(--card) 0%, var(--card-strong) 100%)',
              border: '1px solid rgba(17,98,47,0.2)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
              backdropFilter: 'blur(10px)',
              padding: '1rem 1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            {selectedPhrasalVerb ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '1rem',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: 'rgba(148,163,184,0.9)',
                        marginBottom: '0.15rem',
                      }}
                    >
                      Выбранный фразовый глагол
                    </div>
                    <div
                      style={{
                        fontSize: '1.15rem',
                        fontWeight: 700,
                        color: '#f9fafb',
                        marginBottom: '0.5rem',
                      }}
                    >
                      {selectedPhrasalVerb.phrase}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <button
                        onClick={async () => {
                          if (!accessToken || !selectedPhrasalVerb) return;
                          const phrase = selectedPhrasalVerb.phrase.trim();
                          if (!phrase) return;

                          const phraseKey = `phrasal-verb:${phrase.toLowerCase()}`;

                          // Check cache first
                          const cachedUrl = audioCacheRef.current.get(phraseKey);
                          if (cachedUrl) {
                            setPhrasalVerbAudioUrl((prev) => {
                              if (prev && prev !== cachedUrl) {
                                URL.revokeObjectURL(prev);
                              }
                              return cachedUrl;
                            });
                            if (phrasalVerbAudioRef.current) {
                              phrasalVerbAudioRef.current.play().catch(console.error);
                            }
                            return;
                          }

                          setPhrasalVerbAudioLoading(true);
                          try {
                            const resp = await fetch(`${getApiUrl()}/api/tts`, {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${accessToken}`,
                              },
                              body: JSON.stringify({ text: phrase }),
                            });

                            if (!resp.ok) {
                              const errData = await resp.json().catch(() => ({}));
                              throw new Error(errData?.error || 'Не удалось синтезировать произношение фразового глагола');
                            }

                            const blob = await resp.blob();
                            const url = URL.createObjectURL(blob);
                            audioCacheRef.current.set(phraseKey, url);
                            setPhrasalVerbAudioUrl((prev) => {
                              if (prev && prev !== url) {
                                URL.revokeObjectURL(prev);
                              }
                              return url;
                            });
                            if (phrasalVerbAudioRef.current) {
                              phrasalVerbAudioRef.current.play().catch(console.error);
                            }
                          } catch (e: any) {
                            console.error('Error synthesizing phrasal verb audio:', e);
                            alert(e?.message || 'Не удалось синтезировать произношение');
                          } finally {
                            setPhrasalVerbAudioLoading(false);
                          }
                        }}
                        style={{
                          padding: '0.4rem 0.8rem',
                          borderRadius: '0.6rem',
                          border: '1px solid rgba(82,82,91,0.9)',
                          background: phrasalVerbAudioLoading ? 'rgba(24,24,27,0.95)' : 'rgba(17,98,47,0.9)',
                          color: phrasalVerbAudioLoading ? 'rgba(148,163,184,0.9)' : '#e5e7eb',
                          fontSize: '0.8rem',
                          cursor: phrasalVerbAudioLoading ? 'default' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          opacity: phrasalVerbAudioLoading ? 0.7 : 1,
                          transition: 'all 0.2s',
                        }}
                        title={
                          phrasalVerbAudioLoading
                            ? 'Синтез произношения...'
                            : phrasalVerbAudioUrl
                              ? 'Воспроизвести произношение'
                              : 'Синтезировать и воспроизвести произношение'
                        }
                      >
                        {phrasalVerbAudioLoading ? (
                          <>🔊 Синтез...</>
                        ) : phrasalVerbAudioUrl ? (
                          <>▶ Произношение</>
                        ) : (
                          <>🔊 Произношение</>
                        )}
                      </button>
                      <audio ref={phrasalVerbAudioRef} src={phrasalVerbAudioUrl || undefined} />
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: '0.25rem',
                      fontSize: '0.75rem',
                      color: 'rgba(148,163,184,0.9)',
                    }}
                  >
                    {selectedPhrasalVerb.difficulty_level && (
                      <span
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '999px',
                          background: '#256f40',
                          color: 'rgba(219,234,254,0.98)',
                        }}
                      >
                        Уровень: {selectedPhrasalVerb.difficulty_level}
                      </span>
                    )}
                    {selectedPhrasalVerb.videos && selectedPhrasalVerb.videos.length > 0 && (
                      <span>
                        Связанных видео: {selectedPhrasalVerb.videos.length}
                      </span>
                    )}
                  </div>
                </div>

                {selectedPhrasalVerb.meaning && (
                  <div>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'rgba(148,163,184,0.9)',
                        marginBottom: '0.15rem',
                      }}
                    >
                      Значение:
                    </div>
                    <div
                      style={{
                        fontSize: '0.95rem',
                        color: '#e5e7eb',
                      }}
                    >
                      {selectedPhrasalVerb.meaning}
                    </div>
                  </div>
                )}

                {selectedPhrasalVerb.literal_translation && (
                  <div>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'rgba(148,163,184,0.9)',
                        marginBottom: '0.15rem',
                      }}
                    >
                      Дословный перевод:
                    </div>
                    <div
                      style={{
                        fontSize: '0.95rem',
                        color: '#e5e7eb',
                      }}
                    >
                      {selectedPhrasalVerb.literal_translation}
                    </div>
                  </div>
                )}

                {selectedPhrasalVerb.usage_examples && selectedPhrasalVerb.usage_examples.length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'rgba(148,163,184,0.9)',
                        marginBottom: '0.5rem',
                      }}
                    >
                      Примеры использования:
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                      }}
                    >
                      {selectedPhrasalVerb.usage_examples.map((example, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '0.6rem 0.75rem',
                            borderRadius: '0.75rem',
                            fontSize: '0.9rem',
                            color: '#e5e7eb',
                          }}
                        >
                          {example}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedPhrasalVerb.id && (
                  <div>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'rgba(148,163,184,0.9)',
                        marginBottom: '0.5rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span>Категории:</span>
                      <button
                        onClick={() => {
                          setAssigningPhrasalVerbId(selectedPhrasalVerb.id!);
                          setAssigningWordId(null);
                          setAssigningIdiomId(null);
                          setSelectedCategoryIds(
                            new Set(selectedPhrasalVerb.categories?.map((c) => c.id) || [])
                          );
                          setShowAssignCategoriesModal(true);
                        }}
                        style={{
                          padding: '0.3rem 0.6rem',
                          borderRadius: '0.5rem',
                          border: '1px solid rgba(75,85,99,0.9)',
                          background: 'rgba(24,24,27,0.95)',
                          color: '#e5e7eb',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                        }}
                      >
                        Изменить
                      </button>
                    </div>
                    {selectedPhrasalVerb.categories && selectedPhrasalVerb.categories.length > 0 ? (
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '0.4rem',
                        }}
                      >
                        {selectedPhrasalVerb.categories.map((cat) => (
                          <span
                            key={cat.id}
                            style={{
                              padding: '0.25rem 0.6rem',
                              borderRadius: '999px',
                              background: cat.color || '#11622f',
                              color: '#ffffff',
                              fontSize: '0.8rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                            }}
                            title={cat.description || cat.name}
                          >
                            {cat.icon && <span>{cat.icon}</span>}
                            <span>{cat.name}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: '0.85rem',
                          color: 'rgba(148,163,184,0.7)',
                          fontStyle: 'italic',
                        }}
                      >
                        Нет категорий
                      </div>
                    )}
                  </div>
                )}

                {selectedPhrasalVerb.videos && selectedPhrasalVerb.videos.length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'rgba(148,163,184,0.9)',
                        marginBottom: '0.15rem',
                      }}
                    >
                      Связанные видео:
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                        fontSize: '0.85rem',
                      }}
                    >
                      {selectedPhrasalVerb.videos.map((v) => (
                        <span
                          key={v.id}
                          style={{
                            padding: '0.3rem 0.6rem',
                            borderRadius: '999px',
                            background: '#256f40',
                            color: 'rgba(219,234,254,0.98)',
                          }}
                        >
                          {v.title || 'Видео'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

              </>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.9rem',
                  color: 'rgba(148,163,184,0.9)',
                }}
              >
                Выберите фразовый глагол слева, чтобы увидеть детали.
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Idioms error display */}
      {viewMode === 'idioms' && idiomsError && (
        <div
          style={{
            padding: '0.9rem 1rem',
            borderRadius: '0.75rem',
            background: 'rgba(127,29,29,0.25)',
            border: '1px solid rgba(248,113,113,0.6)',
            color: '#fecaca',
            fontSize: '0.85rem',
            marginTop: '0.5rem',
          }}
        >
          {idiomsError}
        </div>
      )}

      {/* Phrasal verbs error display */}
      {viewMode === 'phrasal-verbs' && phrasalVerbsError && (
        <div
          style={{
            padding: '0.9rem 1rem',
            borderRadius: '0.75rem',
            background: 'rgba(127,29,29,0.25)',
            border: '1px solid rgba(248,113,113,0.6)',
            color: '#fecaca',
            fontSize: '0.85rem',
            marginTop: '0.5rem',
          }}
        >
          {phrasalVerbsError}
        </div>
      )}

      {/* Category Management Modal */}
      {showCategoryModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => {
            setShowCategoryModal(false);
            setEditingCategory(null);
            setCategoryForm({ name: '', description: '', color: '#11622f', icon: '' });
          }}
        >
          <div
            style={{
              background: 'rgba(24,24,27,0.98)',
              border: '1px solid rgba(82,82,91,0.85)',
              borderRadius: '1.25rem',
              padding: '1.5rem',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                fontSize: '1.2rem',
                fontWeight: 600,
                color: '#f9fafb',
                marginBottom: '1rem',
              }}
            >
              {editingCategory ? 'Редактировать категорию' : 'Создать категорию'}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    color: 'rgba(148,163,184,0.9)',
                    marginBottom: '0.4rem',
                  }}
                >
                  Название *
                </label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  placeholder="Название категории"
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.8rem',
                    borderRadius: '0.75rem',
                    border: '1px solid rgba(17,98,47,0.2)',
                    background: 'linear-gradient(135deg, rgba(24,24,27,0.95) 0%, rgba(39,39,42,0.9) 100%)',
                    color: '#e5e7eb',
                    fontSize: '0.9rem',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
                    transition: 'all 0.2s',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    color: 'rgba(148,163,184,0.9)',
                    marginBottom: '0.4rem',
                  }}
                >
                  Описание
                </label>
                <textarea
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  placeholder="Описание категории (необязательно)"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.8rem',
                    borderRadius: '0.75rem',
                    border: '1px solid rgba(17,98,47,0.2)',
                    background: 'linear-gradient(135deg, rgba(24,24,27,0.95) 0%, rgba(39,39,42,0.9) 100%)',
                    color: '#e5e7eb',
                    fontSize: '0.9rem',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
                    transition: 'all 0.2s',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    color: 'rgba(148,163,184,0.9)',
                    marginBottom: '0.4rem',
                  }}
                >
                  Цвет
                </label>
                <input
                  type="color"
                  value={categoryForm.color}
                  onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
                  style={{
                    width: '100%',
                    height: '40px',
                    borderRadius: '0.75rem',
                    border: '1px solid rgba(75,85,99,0.9)',
                    cursor: 'pointer',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    color: 'rgba(148,163,184,0.9)',
                    marginBottom: '0.4rem',
                  }}
                >
                  Иконка (эмодзи)
                </label>
                <input
                  type="text"
                  value={categoryForm.icon}
                  onChange={(e) => setCategoryForm({ ...categoryForm, icon: e.target.value })}
                  placeholder="напр. 🍕, ✈️, 💼"
                  maxLength={2}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.8rem',
                    borderRadius: '0.75rem',
                    border: '1px solid rgba(17,98,47,0.2)',
                    background: 'linear-gradient(135deg, rgba(24,24,27,0.95) 0%, rgba(39,39,42,0.9) 100%)',
                    color: '#e5e7eb',
                    fontSize: '0.9rem',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
                    transition: 'all 0.2s',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setShowCategoryModal(false);
                    setEditingCategory(null);
                    setCategoryForm({ name: '', description: '', color: '#11622f', icon: '' });
                  }}
                  style={{
                    padding: '0.6rem 1.2rem',
                    borderRadius: '0.75rem',
                    border: '1px solid rgba(17,98,47,0.2)',
                    background: 'linear-gradient(135deg, rgba(24,24,27,0.95) 0%, rgba(39,39,42,0.9) 100%)',
                    color: '#e5e7eb',
                    fontSize: '0.9rem',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
                    transition: 'all 0.2s',
                    cursor: 'pointer',
                  }}
                >
                  Отмена
                </button>
                <button
                  onClick={editingCategory ? handleUpdateCategory : handleCreateCategory}
                  disabled={!categoryForm.name.trim()}
                  style={{
                    padding: '0.6rem 1.2rem',
                    borderRadius: '0.75rem',
                    border: 'none',
                    background: categoryForm.name.trim() ? 'rgba(17,98,47,0.9)' : 'rgba(75,85,99,0.5)',
                    color: '#f9fafb',
                    fontSize: '0.9rem',
                    cursor: categoryForm.name.trim() ? 'pointer' : 'not-allowed',
                    opacity: categoryForm.name.trim() ? 1 : 0.6,
                  }}
                >
                  {editingCategory ? 'Сохранить' : 'Создать'}
                </button>
              </div>
            </div>

            {categories.length > 0 && (
              <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(75,85,99,0.5)' }}>
                <h4
                  style={{
                    fontSize: '1rem',
                    fontWeight: 600,
                    color: '#f9fafb',
                    marginBottom: '1rem',
                  }}
                >
                  Все категории
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {categories.map((cat) => (
                    <div
                      key={cat.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.6rem 0.8rem',
                        borderRadius: '0.75rem',
                        background: 'var(--card)',
                        border: '1px solid rgba(55,65,81,0.95)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '4px',
                            background: cat.color || '#11622f',
                          }}
                        />
                        {cat.icon && <span>{cat.icon}</span>}
                        <span style={{ color: '#e5e7eb', fontSize: '0.9rem' }}>{cat.name}</span>
                        {cat.word_count !== undefined && (
                          <span style={{ color: 'rgba(148,163,184,0.7)', fontSize: '0.8rem' }}>
                            ({cat.word_count})
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => openCategoryModal(cat)}
                          style={{
                            padding: '0.3rem 0.6rem',
                            borderRadius: '0.5rem',
                            border: '1px solid rgba(75,85,99,0.9)',
                            background: 'rgba(24,24,27,0.95)',
                            color: '#e5e7eb',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                          }}
                        >
                          Изменить
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(cat.id)}
                          style={{
                            padding: '0.3rem 0.6rem',
                            borderRadius: '0.5rem',
                            border: '1px solid rgba(75,85,99,0.9)',
                            background: 'rgba(127,29,29,0.25)',
                            color: '#fecaca',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                          }}
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Assign Categories Modal */}
      {showAssignCategoriesModal && (assigningWordId || assigningIdiomId || assigningPhrasalVerbId) && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => {
            setShowAssignCategoriesModal(false);
            setAssigningWordId(null);
            setAssigningIdiomId(null);
            setSelectedCategoryIds(new Set());
          }}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(24,24,27,0.98) 0%, rgba(39,39,42,0.95) 100%)',
              border: '1px solid rgba(17,98,47,0.3)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(17,98,47,0.1)',
              backdropFilter: 'blur(20px)',
              borderRadius: '1.25rem',
              padding: '1.5rem',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                fontSize: '1.2rem',
                fontWeight: 600,
                color: '#f9fafb',
                marginBottom: '1rem',
              }}
            >
              Выбрать категории
            </h3>

            {categories.length === 0 ? (
              <div
                style={{
                  padding: '2rem',
                  textAlign: 'center',
                  color: 'rgba(148,163,184,0.9)',
                }}
              >
                Нет категорий. Создайте категорию, чтобы назначить её словам.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                {categories.map((cat) => (
                  <label
                    key={cat.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem',
                      borderRadius: '0.75rem',
                      background: selectedCategoryIds.has(cat.id)
                        ? 'rgba(17,98,47,0.2)'
                        : 'var(--card)',
                      border: `1px solid ${selectedCategoryIds.has(cat.id) ? cat.color : 'rgba(55,65,81,0.95)'}`,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCategoryIds.has(cat.id)}
                      onChange={(e) => {
                        setSelectedCategoryIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) {
                            next.add(cat.id);
                          } else {
                            next.delete(cat.id);
                          }
                          return next;
                        });
                      }}
                      style={{
                        accentColor: cat.color,
                      }}
                    />
                    <span
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '4px',
                        background: cat.color || '#11622f',
                      }}
                    />
                    {cat.icon && <span style={{ fontSize: '1.2rem' }}>{cat.icon}</span>}
                    <span style={{ color: '#e5e7eb', fontSize: '0.9rem', flex: 1 }}>{cat.name}</span>
                    {cat.description && (
                      <span style={{ color: 'rgba(148,163,184,0.7)', fontSize: '0.8rem' }}>
                        {cat.description}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowAssignCategoriesModal(false);
                  setAssigningWordId(null);
                  setSelectedCategoryIds(new Set());
                }}
                style={{
                  padding: '0.6rem 1.2rem',
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(75,85,99,0.9)',
                  background: 'rgba(24,24,27,0.95)',
                  color: '#e5e7eb',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                Отмена
              </button>
              <button
                onClick={async () => {
                  if (assigningWordId) {
                    await handleAssignCategories(assigningWordId, Array.from(selectedCategoryIds));
                    setShowAssignCategoriesModal(false);
                    setAssigningWordId(null);
                    setSelectedCategoryIds(new Set());
                  } else if (assigningIdiomId) {
                    await handleAssignIdiomCategories(assigningIdiomId, Array.from(selectedCategoryIds));
                    setShowAssignCategoriesModal(false);
                    setAssigningIdiomId(null);
                    setSelectedCategoryIds(new Set());
                  } else if (assigningPhrasalVerbId) {
                    await handleAssignPhrasalVerbCategories(assigningPhrasalVerbId, Array.from(selectedCategoryIds));
                    setShowAssignCategoriesModal(false);
                    setAssigningPhrasalVerbId(null);
                    setSelectedCategoryIds(new Set());
                  }
                }}
                style={{
                  padding: '0.6rem 1.2rem',
                  borderRadius: '0.75rem',
                  border: 'none',
                  background: 'rgba(17,98,47,0.9)',
                  color: '#f9fafb',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


