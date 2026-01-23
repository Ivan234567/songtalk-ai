'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// YouTube IFrame API types
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

type VideoSegment = {
  start: number;
  end: number;
  text: string;
};

type WordDefinition = {
  translations: { translation: string; source?: string }[];
  phonetic_transcription: string | null;
  part_of_speech: string | null;
  difficulty_level: string | null;
  frequency_rank: number | null;
  is_phrase: boolean;
  example_sentences: string[];
  cached_at?: string;
};

type Video = {
  id: string;
  video_url: string;
  video_type: 'youtube' | 'upload';
  video_id: string | null;
  title: string | null;
  transcription_text: string | null;
  transcription_segments: VideoSegment[] | null;
  language: string | null;
  created_at: string;
};

function getApiUrl() {
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
}

export const KaraokeTab: React.FC = () => {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState<string | null>(null);
  const [segments, setSegments] = useState<VideoSegment[]>([]);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(-1);
  const [currentTime, setCurrentTime] = useState(0);
  const [viewMode, setViewMode] = useState<'full' | 'text-only'>('full');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [savedVideos, setSavedVideos] = useState<Video[]>([]);
  const [selectedSavedVideo, setSelectedSavedVideo] = useState<Video | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedWordSegment, setSelectedWordSegment] = useState<VideoSegment | null>(null);
  const [wordDefinition, setWordDefinition] = useState<WordDefinition | null>(null);
  const [wordLoading, setWordLoading] = useState(false);
  const [wordError, setWordError] = useState<string | null>(null);
  const [isAddingWord, setIsAddingWord] = useState(false);
  const [addWordMessage, setAddWordMessage] = useState<string | null>(null);
  const [wordAudioUrl, setWordAudioUrl] = useState<string | null>(null);
  const [wordAudioLoading, setWordAudioLoading] = useState(false);
  const [idiomsModalOpen, setIdiomsModalOpen] = useState(false);
  const [idiomsLoading, setIdiomsLoading] = useState(false);
  const [idiomsError, setIdiomsError] = useState<string | null>(null);
  const [idioms, setIdioms] = useState<
    { phrase: string; literal_translation: string; meaning: string; usage_examples: string[] }[]
  >([]);
  const [idiomsAdded, setIdiomsAdded] = useState<Record<string, boolean>>({});
  const [phrasalVerbsModalOpen, setPhrasalVerbsModalOpen] = useState(false);
  const [phrasalVerbsLoading, setPhrasalVerbsLoading] = useState(false);
  const [phrasalVerbsError, setPhrasalVerbsError] = useState<string | null>(null);
  const [phrasalVerbs, setPhrasalVerbs] = useState<
    { phrase: string; literal_translation: string; meaning: string; usage_examples: string[] }[]
  >([]);
  const [phrasalVerbsAdded, setPhrasalVerbsAdded] = useState<Record<string, boolean>>({});
  const [featureInfo, setFeatureInfo] = useState<'idioms' | 'phrasal' | null>(null);
  const youtubePlayerRef = useRef<any>(null); // YT.Player instance
  const progressRef = useRef<number>(0);
  const wordAudioRef = useRef<HTMLAudioElement | null>(null);
  const updateCurrentSegmentRef = useRef<((time: number) => void) | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [youtubeApiReady, setYoutubeApiReady] = useState(false);

  // Load YouTube IFrame API
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setYoutubeApiReady(true);
      return;
    }

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      setYoutubeApiReady(true);
    };

    return () => {
      if (window.onYouTubeIframeAPIReady) {
        delete window.onYouTubeIframeAPIReady;
      }
    };
  }, []);

  useEffect(() => {
    async function loadToken() {
      const { data: sessionData } = await supabase.auth.getSession();
      setAccessToken(sessionData.session?.access_token || null);
    }
    loadToken();
  }, []);

  useEffect(() => {
    if (!accessToken) return;

    async function fetchVideos() {
      try {
        const resp = await fetch(`${getApiUrl()}/api/videos`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (resp.ok) {
          const data = await resp.json();
          if (data.ok && data.videos) {
            setSavedVideos(data.videos);
          }
        }
      } catch (e) {
        console.error('Failed to fetch videos:', e);
      }
    }

    fetchVideos();
  }, [accessToken]);

  // Player control functions
  const playVideo = useCallback(() => {
    if (youtubePlayerRef.current) {
      youtubePlayerRef.current.playVideo();
      setIsPlaying(true);
    }
  }, []);

  const pauseVideo = useCallback(() => {
    if (youtubePlayerRef.current) {
      youtubePlayerRef.current.pauseVideo();
      setIsPlaying(false);
    }
  }, []);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      pauseVideo();
    } else {
      playVideo();
    }
  }, [isPlaying, playVideo, pauseVideo]);

  const seekBackward = useCallback((seconds: number = 5) => {
    if (youtubePlayerRef.current) {
      const currentTime = youtubePlayerRef.current.getCurrentTime();
      const newTime = Math.max(0, currentTime - seconds);
      youtubePlayerRef.current.seekTo(newTime, true);
      progressRef.current = newTime;
      // Update immediately
      setTimeout(() => {
        if (youtubePlayerRef.current && updateCurrentSegmentRef.current) {
          const actualTime = youtubePlayerRef.current.getCurrentTime();
          updateCurrentSegmentRef.current(actualTime);
        }
      }, 100);
    }
  }, []);

  const seekForward = useCallback((seconds: number = 5) => {
    if (youtubePlayerRef.current) {
      const currentTime = youtubePlayerRef.current.getCurrentTime();
      const newTime = currentTime + seconds;
      youtubePlayerRef.current.seekTo(newTime, true);
      progressRef.current = newTime;
      // Update immediately
      setTimeout(() => {
        if (youtubePlayerRef.current && updateCurrentSegmentRef.current) {
          const actualTime = youtubePlayerRef.current.getCurrentTime();
          updateCurrentSegmentRef.current(actualTime);
        }
      }, 100);
    }
  }, []);

  const changePlaybackRate = useCallback((rate: number) => {
    if (youtubePlayerRef.current) {
      youtubePlayerRef.current.setPlaybackRate(rate);
      setPlaybackRate(rate);
    }
  }, []);

  const adjustPlaybackRate = useCallback((direction: 'up' | 'down') => {
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const currentIndex = rates.indexOf(playbackRate);
    let newIndex: number;
    
    if (direction === 'up') {
      newIndex = currentIndex < rates.length - 1 ? currentIndex + 1 : currentIndex;
    } else {
      newIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
    }
    
    changePlaybackRate(rates[newIndex]);
  }, [playbackRate, changePlaybackRate]);

  const toggleMute = useCallback(() => {
    if (youtubePlayerRef.current) {
      if (isMuted) {
        youtubePlayerRef.current.unMute();
        setIsMuted(false);
      } else {
        youtubePlayerRef.current.mute();
        setIsMuted(true);
      }
    }
  }, [isMuted]);

  const seekToSegment = useCallback((segmentIndex: number) => {
    if (youtubePlayerRef.current && segments[segmentIndex]) {
      const segment = segments[segmentIndex];
      youtubePlayerRef.current.seekTo(segment.start, true);
      progressRef.current = segment.start;
      // Update immediately
      setTimeout(() => {
        if (updateCurrentSegmentRef.current) {
          updateCurrentSegmentRef.current(segment.start);
        }
      }, 100);
    }
  }, [segments]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!videoId) return; // Enable in both normal and fullscreen modes

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') {
        return;
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekBackward(5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekForward(5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          adjustPlaybackRate('up');
          break;
        case 'ArrowDown':
          e.preventDefault();
          adjustPlaybackRate('down');
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [videoId, togglePlayPause, seekBackward, seekForward, adjustPlaybackRate, toggleMute]);

  // Calculate progress within current segment (0 to 1)
  const getSegmentProgress = (segmentIndex: number, time: number): number => {
    if (segmentIndex < 0 || segmentIndex >= segments.length) return 0;
    const segment = segments[segmentIndex];
    if (time < segment.start) return 0;
    if (time > segment.end) return 1;
    return (time - segment.start) / (segment.end - segment.start);
  };

  // Update current segment based on time
  const updateCurrentSegment = useCallback((time: number) => {
    if (segments.length === 0) return;

    setCurrentTime(time);
    progressRef.current = time;

    let newIndex = -1;
    for (let i = 0; i < segments.length; i++) {
      if (time >= segments[i].start && time <= segments[i].end) {
        newIndex = i;
        break;
      }
    }

    // If between segments, find closest upcoming segment
    if (newIndex === -1) {
      for (let i = 0; i < segments.length; i++) {
        if (time < segments[i].start) {
          newIndex = Math.max(0, i - 1);
          break;
        }
      }
      if (newIndex === -1 && segments.length > 0) {
        // Past all segments
        newIndex = segments.length - 1;
      }
    }

    setCurrentSegmentIndex((prevIndex) => {
      if (newIndex !== prevIndex) {
        // Auto-scroll to active segment with smooth behavior
        setTimeout(() => {
          // Scroll in normal mode
          const segmentElement = document.getElementById(`segment-${newIndex}`);
          if (segmentElement) {
            segmentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          // Scroll in fullscreen mode
          const fullscreenElement = document.getElementById(`fullscreen-segment-${newIndex}`);
          if (fullscreenElement) {
            fullscreenElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 50);
        return newIndex;
      }
      return prevIndex;
    });
  }, [segments]);

  // Store updateCurrentSegment in ref for use in other callbacks
  useEffect(() => {
    updateCurrentSegmentRef.current = updateCurrentSegment;
  }, [updateCurrentSegment]);

  // Initialize YouTube Player when videoId changes
  useEffect(() => {
    if (!videoId || !youtubeApiReady || !window.YT) return;

    // Cleanup previous player
    if (youtubePlayerRef.current) {
      try {
        youtubePlayerRef.current.destroy();
      } catch (e) {
        console.error('Error destroying player:', e);
      }
      youtubePlayerRef.current = null;
    }

    // Create new player - YT.Player will create iframe inside the container
    const containerId = 'youtube-player-container';
    const container = document.getElementById(containerId);
    if (container) {
      // Clear container
      container.innerHTML = '';
      
      try {
        const player = new window.YT.Player(containerId, {
          videoId: videoId,
          playerVars: {
            enablejsapi: 1,
            origin: window.location.origin,
            controls: 1,
            rel: 0,
          },
          events: {
            onReady: (event: any) => {
              console.log('YouTube player ready');
              youtubePlayerRef.current = event.target;
              // Set initial playback rate
              if (playbackRate) {
                event.target.setPlaybackRate(playbackRate);
              }
              // Set initial volume
              if (volume !== undefined) {
                event.target.setVolume(volume);
              }
              if (isMuted) {
                event.target.mute();
              }
              // Initial time update after player is ready
              setTimeout(() => {
                if (youtubePlayerRef.current && updateCurrentSegmentRef.current) {
                  try {
                    const currentTime = youtubePlayerRef.current.getCurrentTime();
                    if (currentTime !== null && currentTime !== undefined && currentTime >= 0) {
                      updateCurrentSegmentRef.current(currentTime);
                      progressRef.current = currentTime;
                    }
                  } catch (e) {
                    // Ignore
                  }
                }
              }, 500);
            },
            onStateChange: (event: any) => {
              // 0 = ended, 1 = playing, 2 = paused, 3 = buffering, 5 = cued
              const state = event.data;
              if (state === 1) {
                setIsPlaying(true);
              } else if (state === 2) {
                setIsPlaying(false);
              }
            },
            onError: (event: any) => {
              console.error('YouTube player error:', event.data);
            },
          },
        });
      } catch (e) {
        console.error('Error creating YouTube player:', e);
      }
    }

    return () => {
      if (youtubePlayerRef.current) {
        try {
          youtubePlayerRef.current.destroy();
        } catch (e) {
          console.error('Error destroying player on cleanup:', e);
        }
        youtubePlayerRef.current = null;
      }
    };
  }, [videoId, youtubeApiReady]);

  // Update playback rate when it changes
  useEffect(() => {
    if (youtubePlayerRef.current && playbackRate) {
      try {
        youtubePlayerRef.current.setPlaybackRate(playbackRate);
      } catch (e) {
        console.error('Error setting playback rate:', e);
      }
    }
  }, [playbackRate]);

  // Update volume when it changes
  useEffect(() => {
    if (youtubePlayerRef.current && volume !== undefined) {
      try {
        youtubePlayerRef.current.setVolume(volume);
      } catch (e) {
        console.error('Error setting volume:', e);
      }
    }
  }, [volume]);

  // Update mute state when it changes
  useEffect(() => {
    if (youtubePlayerRef.current) {
      try {
        if (isMuted) {
          youtubePlayerRef.current.mute();
        } else {
          youtubePlayerRef.current.unMute();
        }
      } catch (e) {
        console.error('Error setting mute:', e);
      }
    }
  }, [isMuted]);

  // Listen for YouTube player events and track time
  useEffect(() => {
    if (!videoId || segments.length === 0) return;

    let timeTrackingInterval: NodeJS.Timeout | null = null;

    // Wait for player to be ready, then start tracking
    const checkPlayerReady = setInterval(() => {
      if (youtubePlayerRef.current && updateCurrentSegmentRef.current) {
        try {
          // Check if player is ready by trying to get current time
          const currentTime = youtubePlayerRef.current.getCurrentTime();
          if (currentTime !== null && currentTime !== undefined && currentTime >= 0) {
            clearInterval(checkPlayerReady);
            
            // Start time tracking
            timeTrackingInterval = setInterval(() => {
              if (youtubePlayerRef.current && updateCurrentSegmentRef.current) {
                try {
                  const time = youtubePlayerRef.current.getCurrentTime();
                  if (time !== null && time !== undefined && time >= 0) {
                    updateCurrentSegmentRef.current(time);
                    progressRef.current = time;
                  }
                } catch (e) {
                  // Ignore errors
                }
              }
            }, 100);

            // Initial update
            updateCurrentSegmentRef.current(currentTime);
            progressRef.current = currentTime;
          }
        } catch (e) {
          // Player not ready yet, continue checking
        }
      }
    }, 200);

    // Cleanup
    return () => {
      clearInterval(checkPlayerReady);
      if (timeTrackingInterval) {
        clearInterval(timeTrackingInterval);
      }
    };
  }, [videoId, segments]);

  const extractYouTubeId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const getCurrentVideoDbId = (): string | null => {
    if (!videoId) return null;
    const found = savedVideos.find(
      (v) => v.video_type === 'youtube' && v.video_id === videoId
    );
    return found?.id || null;
  };

  const getFullLyricsText = (): string | null => {
    if (!segments || segments.length === 0) return null;
    return segments.map((s) => s.text).join(' ');
  };

  const handleAnalyzeIdioms = async () => {
    if (!accessToken) return;

    const videoDbId = getCurrentVideoDbId();
    const textFallback = getFullLyricsText();

    if (!videoDbId && !textFallback) {
      setIdiomsError('Нет текста для анализа. Загрузите видео с субтитрами.');
      setIdiomsModalOpen(true);
      return;
    }

    setIdiomsModalOpen(true);
    setIdiomsLoading(true);
    setIdiomsError(null);

    const body: any = {
      max_idioms: 20,
    };
    if (videoDbId) body.video_id = videoDbId;
    if (!videoDbId && textFallback) body.text = textFallback;

    // Retry логика для первого запроса (холодный старт бэкенда)
    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const resp = await fetch(`${getApiUrl()}/api/vocabulary/idioms/analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30000), // 30 секунд таймаут
        });

        // Проверяем, что ответ получен
        if (!resp) {
          throw new Error('Не получен ответ от сервера');
        }

        // Пытаемся распарсить JSON, даже если статус не OK
        let data;
        try {
          data = await resp.json();
        } catch (jsonError) {
          // Если не удалось распарсить JSON, проверяем статус
          if (!resp.ok) {
            throw new Error(`Ошибка сервера: ${resp.status} ${resp.statusText}`);
          }
          throw new Error('Не удалось обработать ответ сервера');
        }

        if (!resp.ok || !data.ok) {
          throw new Error(data?.error || 'Не удалось проанализировать идиомы');
        }

        // Успех - сохраняем результат и выходим
        setIdioms(data.idioms || []);
        return;
      } catch (e: any) {
        lastError = e instanceof Error ? e : new Error(String(e));
        
        // Проверяем, это ли ошибка сети/таймаута, которую стоит повторить
        const isNetworkError = 
          e?.message?.includes('Failed to fetch') ||
          e?.message?.includes('NetworkError') ||
          e?.message?.includes('timeout') ||
          e?.name === 'AbortError' ||
          e?.name === 'TypeError';

        // Если это последняя попытка или не сетевая ошибка - выходим
        if (attempt === maxRetries || !isNetworkError) {
          break;
        }

        // Ждем перед повтором (экспоненциальная задержка)
        const delay = Math.min(1000 * Math.pow(2, attempt), 3000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Если дошли сюда - все попытки неудачны
    const errorMessage = lastError?.message || 'Ошибка анализа идиом';
    setIdiomsError(
      errorMessage.includes('Failed to fetch') || errorMessage.includes('timeout')
        ? 'Не удалось подключиться к серверу. Попробуйте еще раз через несколько секунд.'
        : errorMessage
    );
    setIdiomsLoading(false);
  };

  const handleAddIdiomToVocabulary = async (idiom: {
    phrase: string;
    literal_translation: string;
    meaning: string;
    usage_examples: string[];
  }) => {
    if (!accessToken) return;

    const key = idiom.phrase.trim().toLowerCase();
    if (!key || idiomsAdded[key]) return;

    try {
      const videoDbId = getCurrentVideoDbId();

      const resp = await fetch(`${getApiUrl()}/api/vocabulary/idioms/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          phrase: idiom.phrase,
          literal_translation: idiom.literal_translation,
          meaning: idiom.meaning,
          usage_examples: idiom.usage_examples,
          video_id: videoDbId,
        }),
      });

      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || 'Не удалось добавить идиому в словарь');
      }

      setIdiomsAdded((prev) => ({ ...prev, [key]: true }));
    } catch (e) {
      console.error('Add idiom error', e);
    }
  };

  const handleAnalyzePhrasalVerbs = async () => {
    if (!accessToken) return;

    const videoDbId = getCurrentVideoDbId();
    const textFallback = getFullLyricsText();

    if (!videoDbId && !textFallback) {
      setPhrasalVerbsError('Нет текста для анализа. Загрузите видео с субтитрами.');
      setPhrasalVerbsModalOpen(true);
      return;
    }

    setPhrasalVerbsModalOpen(true);
    setPhrasalVerbsLoading(true);
    setPhrasalVerbsError(null);

    const body: any = {
      max_phrasal_verbs: 20,
    };
    if (videoDbId) body.video_id = videoDbId;
    if (!videoDbId && textFallback) body.text = textFallback;

    // Retry логика для первого запроса (холодный старт бэкенда)
    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const resp = await fetch(`${getApiUrl()}/api/vocabulary/phrasal-verbs/analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30000), // 30 секунд таймаут
        });

        // Проверяем, что ответ получен
        if (!resp) {
          throw new Error('Не получен ответ от сервера');
        }

        // Пытаемся распарсить JSON, даже если статус не OK
        let data;
        try {
          data = await resp.json();
        } catch (jsonError) {
          // Если не удалось распарсить JSON, проверяем статус
          if (!resp.ok) {
            throw new Error(`Ошибка сервера: ${resp.status} ${resp.statusText}`);
          }
          throw new Error('Не удалось обработать ответ сервера');
        }

        if (!resp.ok || !data.ok) {
          throw new Error(data?.error || 'Не удалось проанализировать фразовые глаголы');
        }

        // Успех - сохраняем результат и выходим
        setPhrasalVerbs(data.phrasal_verbs || []);
        return;
      } catch (e: any) {
        lastError = e instanceof Error ? e : new Error(String(e));
        
        // Проверяем, это ли ошибка сети/таймаута, которую стоит повторить
        const isNetworkError = 
          e?.message?.includes('Failed to fetch') ||
          e?.message?.includes('NetworkError') ||
          e?.message?.includes('timeout') ||
          e?.name === 'AbortError' ||
          e?.name === 'TypeError';

        // Если это последняя попытка или не сетевая ошибка - выходим
        if (attempt === maxRetries || !isNetworkError) {
          break;
        }

        // Ждем перед повтором (экспоненциальная задержка)
        const delay = Math.min(1000 * Math.pow(2, attempt), 3000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Если дошли сюда - все попытки неудачны
    const errorMessage = lastError?.message || 'Ошибка анализа фразовых глаголов';
    setPhrasalVerbsError(
      errorMessage.includes('Failed to fetch') || errorMessage.includes('timeout')
        ? 'Не удалось подключиться к серверу. Попробуйте еще раз через несколько секунд.'
        : errorMessage
    );
    setPhrasalVerbsLoading(false);
  };

  const handleAddPhrasalVerbToVocabulary = async (phrasalVerb: {
    phrase: string;
    literal_translation: string;
    meaning: string;
    usage_examples: string[];
  }) => {
    if (!accessToken) return;

    const key = phrasalVerb.phrase.trim().toLowerCase();
    if (!key || phrasalVerbsAdded[key]) return;

    try {
      const videoDbId = getCurrentVideoDbId();

      const resp = await fetch(`${getApiUrl()}/api/vocabulary/phrasal-verbs/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          phrase: phrasalVerb.phrase,
          literal_translation: phrasalVerb.literal_translation,
          meaning: phrasalVerb.meaning,
          usage_examples: phrasalVerb.usage_examples,
          video_id: videoDbId,
        }),
      });

      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || 'Не удалось добавить фразовый глагол в словарь');
      }

      setPhrasalVerbsAdded((prev) => ({ ...prev, [key]: true }));
    } catch (e) {
      console.error('Add phrasal verb error', e);
    }
  };

  const handleWordClick = async (word: string, segment: VideoSegment) => {
    if (!accessToken) return;

    const trimmed = word.trim();
    if (!trimmed) return;

    setSelectedWord(trimmed);
    setSelectedWordSegment(segment);
    setWordDefinition(null);
    setWordError(null);
    setAddWordMessage(null);
    if (wordAudioUrl) {
      URL.revokeObjectURL(wordAudioUrl);
      setWordAudioUrl(null);
    }
    setWordLoading(true);

    try {
      const resp = await fetch(
        `${getApiUrl()}/api/vocabulary/define?word=${encodeURIComponent(trimmed)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const data = await resp.json();

      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || 'Не удалось получить определение слова');
      }

      setWordDefinition(data.definition as WordDefinition);
    } catch (e: any) {
      setWordError(e?.message || 'Ошибка загрузки определения слова');
    } finally {
      setWordLoading(false);
    }
  };

  const synthesizeWordAudio = async () => {
    if (!accessToken || !selectedWord) return;
    
    // Если аудио уже есть, просто воспроизводим
    if (wordAudioUrl) {
      wordAudioRef.current?.play();
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
        body: JSON.stringify({ text: selectedWord.trim() }),
      });

      if (!resp.ok) {
        throw new Error('Не удалось синтезировать произношение слова');
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      setWordAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      
      // Автоматически воспроизводим после синтеза
      setTimeout(() => {
        wordAudioRef.current?.play();
      }, 100);
    } catch (e) {
      console.error('Word TTS error:', e);
      setWordError('Не удалось синтезировать произношение');
    } finally {
      setWordAudioLoading(false);
    }
  };

  const handleAddWordToVocabulary = async () => {
    if (!accessToken || !selectedWord) return;

    setIsAddingWord(true);
    setAddWordMessage(null);
    setWordError(null);

    try {
      const videoDbId = getCurrentVideoDbId();
      const contextText = selectedWordSegment?.text || null;

      const resp = await fetch(`${getApiUrl()}/api/vocabulary/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          word: selectedWord,
          video_id: videoDbId,
          context: contextText,
        }),
      });

      const data = await resp.json();

      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || 'Не удалось добавить слово в словарь');
      }

      setAddWordMessage('Слово добавлено в словарь');
    } catch (e: any) {
      setWordError(e?.message || 'Ошибка добавления слова в словарь');
    } finally {
      setIsAddingWord(false);
    }
  };

  const handleLoadVideo = async () => {
    if (!youtubeUrl.trim() || !accessToken) return;

    setError(null);
    setLoading(true);

    try {
      const extractedId = extractYouTubeId(youtubeUrl);
      if (!extractedId) {
        setError('Неверный формат YouTube ссылки');
        setLoading(false);
        return;
      }

      const resp = await fetch(`${getApiUrl()}/api/karaoke/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ youtubeUrl: youtubeUrl.trim() }),
      });

      const data = await resp.json();

      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || 'Ошибка загрузки видео');
      }

      setVideoId(data.videoId);
      setVideoTitle(data.title || `YouTube: ${data.videoId}`);
      setSegments(data.segments || []);
      setCurrentSegmentIndex(-1);

      // Автоматически открыть полноэкранный режим караоке
      if (data.segments && data.segments.length > 0) {
        setViewMode('text-only');
        setIsFullscreen(true);
      }

      // Refresh saved videos list
      const videosResp = await fetch(`${getApiUrl()}/api/videos`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (videosResp.ok) {
        const videosData = await videosResp.json();
        if (videosData.ok && videosData.videos) {
          setSavedVideos(videosData.videos);
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Ошибка загрузки видео');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSavedVideo = (video: Video) => {
    setSelectedSavedVideo(video);
    if (video.video_type === 'youtube' && video.video_id) {
      setVideoId(video.video_id);
      setVideoTitle(video.title || `YouTube: ${video.video_id}`);
      setSegments(video.transcription_segments || []);
      setCurrentSegmentIndex(-1);
      setError(null);
      
      // Автоматически открыть полноэкранный режим караоке
      if (video.transcription_segments && video.transcription_segments.length > 0) {
        setViewMode('text-only');
        setIsFullscreen(true);
      }
    }
  };

  const handleDelete = async (videoIdToDelete: string) => {
    if (!accessToken || !confirm('Вы уверены, что хотите удалить это видео?')) return;

    setDeleting(videoIdToDelete);
    setError(null);

    try {
      const resp = await fetch(`${getApiUrl()}/api/videos/${videoIdToDelete}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${resp.status}`);
      }

      setSavedVideos((prev) => prev.filter((v) => v.id !== videoIdToDelete));
      if (selectedSavedVideo?.id === videoIdToDelete) {
        setSelectedSavedVideo(null);
      }
      if (videoId === selectedSavedVideo?.video_id) {
        setVideoId(null);
        setSegments([]);
      }
    } catch (e: any) {
      setError(e?.message || 'Ошибка удаления видео');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
      }}
    >
      {/* URL Input Section */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(24,24,27,0.98) 0%, rgba(39,39,42,0.95) 100%)',
          borderRadius: '1.25rem',
          padding: '2rem',
          border: '1px solid rgba(139,92,246,0.2)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(139,92,246,0.1)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <div style={{ 
          display: 'flex', 
          gap: '1rem', 
          alignItems: 'stretch',
          position: 'relative',
        }}>
          <div style={{ 
            flex: 1, 
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}>
            <div style={{
              position: 'absolute',
              left: '1rem',
              fontSize: '1.25rem',
              color: 'rgba(148,163,184,0.6)',
              zIndex: 1,
            }}>
              🔗
            </div>
            <input
              type="text"
              placeholder="Вставьте ссылку на YouTube видео..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !loading) {
                  handleLoadVideo();
                }
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(139,92,246,0.6)';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(82,82,91,0.85)';
                e.currentTarget.style.boxShadow = 'none';
              }}
              disabled={loading}
              style={{
                flex: 1,
                padding: '1rem 1rem 1rem 3rem',
                background: 'rgba(39,39,42,0.95)',
                border: '1px solid rgba(82,82,91,0.85)',
                borderRadius: '0.875rem',
                color: '#f9fafb',
                fontSize: '1rem',
                outline: 'none',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                fontFamily: 'inherit',
              }}
            />
          </div>
          <button
            onClick={handleLoadVideo}
            disabled={loading || !youtubeUrl.trim()}
            onMouseEnter={(e) => {
              if (!loading && youtubeUrl.trim()) {
                e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(139,92,246,0.5), 0 0 40px rgba(236,72,153,0.3)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(139,92,246,0.4), 0 0 30px rgba(236,72,153,0.2)';
            }}
            style={{
              padding: '1rem 2rem',
              background: loading || !youtubeUrl.trim()
                ? 'rgba(148,163,184,0.2)'
                : 'linear-gradient(135deg, rgba(139,92,246,0.95) 0%, rgba(236,72,153,0.95) 100%)',
              border: loading || !youtubeUrl.trim() 
                ? '1px solid rgba(82,82,91,0.5)'
                : '1px solid rgba(139,92,246,0.6)',
              borderRadius: '0.875rem',
              color: 'white',
              fontWeight: 700,
              cursor: loading || !youtubeUrl.trim() ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              opacity: loading || !youtubeUrl.trim() ? 0.5 : 1,
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: loading || !youtubeUrl.trim() 
                ? 'none'
                : '0 4px 20px rgba(139,92,246,0.4), 0 0 30px rgba(236,72,153,0.2)',
              letterSpacing: '0.01em',
            }}
          >
            {loading ? (
              <>
                <span style={{ 
                  display: 'inline-block',
                  animation: 'spin 1s linear infinite',
                }}>⏳</span>
                <span>Загрузка...</span>
              </>
            ) : (
              <>
                <span>▶</span>
                <span>Загрузить</span>
              </>
            )}
          </button>
        </div>

        {error && (
          <div
            style={{
              marginTop: '1rem',
              padding: '1rem 1.25rem',
              background: 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(220,38,38,0.1) 100%)',
              border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: '0.75rem',
              color: '#fecaca',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              boxShadow: '0 4px 12px rgba(239,68,68,0.2)',
            }}
          >
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Video Player and Lyrics */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            minHeight: 0,
          }}
        >
          {videoId && (
            <>
              {/* Hint Banner - Shows when subtitles are loaded */}
              {segments.length > 0 && (
                <div
                  style={{
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.2) 0%, rgba(236,72,153,0.2) 100%)',
                    borderRadius: '1rem',
                    padding: '1.5rem 1.75rem',
                    border: '1px solid rgba(139,92,246,0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1.5rem',
                    boxShadow: '0 4px 20px rgba(139,92,246,0.15), 0 0 40px rgba(236,72,153,0.1)',
                    animation: 'fadeIn 0.5s ease',
                    marginBottom: '1rem',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <div
                    style={{
                      fontSize: '3rem',
                      flexShrink: 0,
                      filter: 'drop-shadow(0 4px 12px rgba(139,92,246,0.4))',
                      animation: 'pulse 2.5s ease-in-out infinite',
                      lineHeight: 1,
                    }}
                  >
                    💡
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '1.25rem',
                        fontWeight: 700,
                        color: '#f9fafb',
                        marginBottom: '0.5rem',
                        background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        letterSpacing: '-0.02em',
                      }}
                    >
                      Синхронизированные субтитры готовы!
                    </div>
                    <div
                      style={{
                        fontSize: '0.95rem',
                        color: 'rgba(148,163,184,0.95)',
                        lineHeight: '1.6',
                      }}
                    >
                      Нажмите кнопку ниже, чтобы открыть текст песни на весь экран с синхронной подсветкой слов в стиле Spotify. Видео будет продолжать воспроизводиться в фоне.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <button
                      onClick={() => {
                        setViewMode('text-only');
                        setIsFullscreen(true);
                      }}
                      style={{
                        padding: '1rem 2rem',
                        background:
                          'linear-gradient(135deg, rgba(139,92,246,0.95) 0%, rgba(236,72,153,0.95) 100%)',
                        border: '1px solid rgba(139,92,246,0.6)',
                        borderRadius: '0.75rem',
                        color: '#f9fafb',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        fontWeight: 700,
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 4px 20px rgba(139,92,246,0.4), 0 0 30px rgba(236,72,153,0.3)',
                        flexShrink: 0,
                        letterSpacing: '0.01em',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                        e.currentTarget.style.boxShadow =
                          '0 6px 30px rgba(139,92,246,0.5), 0 0 40px rgba(236,72,153,0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0) scale(1)';
                        e.currentTarget.style.boxShadow =
                          '0 4px 20px rgba(139,92,246,0.4), 0 0 30px rgba(236,72,153,0.3)';
                      }}
                    >
                      <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>📝</span>
                      <span>Открыть текст</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Video Player - Always hidden but still functional for synchronization */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  paddingBottom: '56.25%',
                  background: '#000',
                  borderRadius: '1rem',
                  overflow: 'hidden',
                  opacity: 0,
                  height: '1px',
                  pointerEvents: 'none',
                  transition: 'opacity 0.3s ease, height 0.3s ease',
                }}
              >
                <div
                  id="youtube-player-container"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '1px',
                    visibility: 'hidden',
                  }}
                />
              </div>

              {/* YouTube Video Banner with Thumbnail */}
              {videoId && (
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    paddingBottom: '56.25%',
                    background: '#000',
                    borderRadius: '1rem',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    marginBottom: '1rem',
                  }}
                  onClick={() => {
                    setViewMode('text-only');
                    setIsFullscreen(true);
                  }}
                >
                  <img
                    src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
                    alt={videoTitle || 'YouTube Video'}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                    onError={(e) => {
                      // Fallback to lower quality thumbnail
                      (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                    }}
                  />
                  {/* Play button overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: '80px',
                      height: '80px',
                      borderRadius: '50%',
                      background: 'rgba(0, 0, 0, 0.6)',
                      backdropFilter: 'blur(10px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      border: '2px solid rgba(255, 255, 255, 0.3)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(139, 92, 246, 0.8)';
                      e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.1)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
                      e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                    }}
                  >
                    <span style={{ fontSize: '2rem', color: '#fff', marginLeft: '4px' }}>▶</span>
                  </div>
                  {/* Banner text overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)',
                      padding: '1.5rem',
                      color: '#fff',
                    }}
                  >
                    <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                      {videoTitle || `YouTube: ${videoId}`}
                    </div>
                    <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>
                      Нажмите для открытия режима караоке
                    </div>
                  </div>
                </div>
              )}


              {videoTitle && (
                <div
                  style={{
                    padding: '0.75rem 1rem',
                background: 'rgba(39,39,42,0.9)',
                    borderRadius: '0.75rem',
                border: '1px solid rgba(82,82,91,0.85)',
                  }}
                >
                  <h3
                    style={{
                      fontSize: '1.1rem',
                      fontWeight: 600,
                      margin: 0,
                      color: '#f9fafb',
                    }}
                  >
                    {videoTitle}
                  </h3>
                </div>
              )}

              {/* Synchronized Lyrics - Hidden in full mode but kept for synchronization */}
              {segments.length > 0 && (
                <div
                  style={{
                    background: 'rgba(24,24,27,0.95)',
                    borderRadius: '1rem',
                    padding: viewMode === 'text-only' ? '2rem' : '1.5rem',
                    border: '1px solid rgba(82,82,91,0.85)',
                    maxHeight: viewMode === 'text-only' ? 'calc(100vh - 200px)' : '500px',
                    overflowY: 'auto',
                    minHeight: viewMode === 'text-only' ? '600px' : 'auto',
                    display: viewMode === 'full' ? 'none' : 'block',
                    // Keep in DOM but hidden for synchronization to continue working
                    visibility: viewMode === 'full' ? 'hidden' : 'visible',
                    height: viewMode === 'full' ? 0 : 'auto',
                    opacity: viewMode === 'full' ? 0 : 1,
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.875rem',
                      color: 'rgba(148,163,184,0.8)',
                      marginBottom: '1rem',
                      fontWeight: 500,
                    }}
                  >
                    Синхронизированные субтитры
        </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {segments.map((segment, index) => {
                      const isActive = currentSegmentIndex === index;
                      const isPast = index < currentSegmentIndex;
                      const isFuture = index > currentSegmentIndex;
                      const segmentProgress = isActive ? getSegmentProgress(index, currentTime) : 0;
                      
                      // Calculate opacity based on position
                      let opacity = 0.4;
                      if (isActive) {
                        opacity = 1;
                      } else if (isPast) {
                        opacity = 0.35;
                      } else if (isFuture) {
                        opacity = 0.5;
                      }

                      return (
                        <div
                          key={index}
                          id={`segment-${index}`}
                          style={{
                              position: 'relative',
                              padding: viewMode === 'text-only' ? '1.5rem 2rem' : '1.25rem 1.5rem',
                              borderRadius: '1rem',
                              background: isActive
                                ? 'rgba(39,39,42,0.95)'
                                : 'rgba(39,39,42,0.7)',
                              border: isActive
                                ? '1px solid rgba(168,85,247,0.6)'
                                : '1px solid rgba(82,82,91,0.7)',
                              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                              transform: isActive
                                ? viewMode === 'text-only'
                                  ? 'scale(1.02)'
                                  : 'scale(1.01)'
                                : 'scale(1)',
                              opacity: opacity,
                              overflow: 'hidden',
                              maxWidth: viewMode === 'text-only' ? '900px' : '100%',
                              margin: viewMode === 'text-only' ? '0 auto' : '0',
                            }}
                          >
                          {/* Spotify-style gradient highlight */}
                          {isActive && (
                            <div
                              style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                background: `linear-gradient(
                                  to right,
                                  rgba(139,92,246,0.25) 0%,
                                  rgba(236,72,153,0.25) ${segmentProgress * 100}%,
                                  transparent ${segmentProgress * 100}%,
                                  transparent 100%
                                )`,
                                pointerEvents: 'none',
                                transition: 'background 0.1s linear',
                              }}
                            />
                          )}

                          {/* Text with word-by-word highlighting */}
                          <div
                              style={{
                                position: 'relative',
                                zIndex: 1,
                                fontSize:
                                  viewMode === 'text-only'
                                    ? isActive
                                      ? '1.5rem'
                                      : '1.2rem'
                                    : isActive
                                    ? '1.25rem'
                                    : '1.05rem',
                                lineHeight: '1.8',
                                color: isActive ? '#f9fafb' : 'rgba(249,250,251,0.65)',
                                fontWeight: isActive ? 600 : 400,
                                transition: 'all 0.3s ease',
                                letterSpacing: isActive ? '0.02em' : '0',
                                textAlign: viewMode === 'text-only' ? 'center' : 'left',
                              }}
                            >
                            {segment.text.split(' ').map((word, wordIndex, words) => {
                              // Calculate progress for each word (0 to 1)
                              const wordsInSegment = words.length;
                              const wordStartProgress = wordIndex / wordsInSegment;
                              const wordEndProgress = (wordIndex + 1) / wordsInSegment;
                              
                              // Determine if this word should be highlighted
                              const isWordHighlighted = isActive && 
                                segmentProgress >= wordStartProgress && 
                                segmentProgress < wordEndProgress;
                              
                              // Calculate word-level progress (0 to 1 within this word)
                              const wordProgress = isActive
                                ? Math.max(
                                    0,
                                    Math.min(
                                      1,
                                      (segmentProgress - wordStartProgress) / 
                                      (wordEndProgress - wordStartProgress)
                                    )
                                  )
                                : 0;

                              const isWordActive = isActive && isWordHighlighted && wordProgress > 0.3;
                              const wordOpacity = isActive
                                ? isWordActive
                                  ? 1
                                  : segmentProgress >= wordStartProgress
                                  ? 0.6 + wordProgress * 0.4
                                  : 0.5
                                : 1;

                              return (
                                <span
                                  key={wordIndex}
                                  onClick={() => handleWordClick(word, segment)}
                                  style={{
                                    display: 'inline-block',
                                    marginRight: '0.5em',
                                    position: 'relative',
                                    color: isWordActive
                                      ? '#fff'
                                      : isActive
                                      ? `rgba(249,250,251,${wordOpacity})`
                                      : 'rgba(249,250,251,0.65)',
                                    fontWeight: isWordActive ? 700 : isActive ? 600 : 400,
                                    textShadow: isWordActive
                                      ? '0 0 20px rgba(139,92,246,0.6), 0 0 10px rgba(236,72,153,0.4)'
                                      : 'none',
                                    transition: 'all 0.15s ease',
                                    transform: isWordActive ? 'scale(1.05)' : 'scale(1)',
                                    cursor: accessToken ? 'pointer' : 'default',
                                    borderBottom:
                                      selectedWord &&
                                      selectedWord.toLowerCase() === word.toLowerCase()
                                        ? '1px dashed rgba(250,250,250,0.6)'
                                        : 'none',
                                  }}
                                >
                                  {word}
                                </span>
                              );
                            })}
                          </div>

                          {/* Time indicator */}
                          <div
                            style={{
                              fontSize: '0.7rem',
                              color: 'rgba(148,163,184,0.5)',
                              marginTop: '0.75rem',
                              fontFamily: 'monospace',
                            }}
                          >
                            {Math.floor(segment.start)}s - {Math.floor(segment.end)}s
                            {isActive && (
                              <span
                                style={{
                                  marginLeft: '0.5rem',
                                  color: 'rgba(139,92,246,0.8)',
                                }}
                              >
                                • {Math.round(segmentProgress * 100)}%
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Player Controls Panel - Visible in normal mode */}
              {videoId && segments.length > 0 && youtubeApiReady && (
                <div
                  style={{
                    background: 'rgba(24,24,27,0.95)',
                    borderRadius: '1rem',
                    padding: '1.5rem',
                    border: '1px solid rgba(82,82,91,0.85)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '1.5rem',
                    flexWrap: 'wrap',
                  }}
                >
                  {/* Seek Backward */}
                  <button
                    onClick={() => seekBackward(5)}
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.1)',
                      border: 'none',
                      color: '#f9fafb',
                      cursor: 'pointer',
                      fontSize: '1.2rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s ease',
                      opacity: 0.8,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                      e.currentTarget.style.opacity = '1';
                      e.currentTarget.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                      e.currentTarget.style.opacity = '0.8';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    title="← - Назад 5 сек"
                  >
                    ⏪
                  </button>

                  {/* Play/Pause */}
                  <button
                    onClick={togglePlayPause}
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '50%',
                      background: isPlaying
                        ? 'linear-gradient(135deg, rgba(139,92,246,0.9) 0%, rgba(236,72,153,0.9) 100%)'
                        : 'linear-gradient(135deg, rgba(139,92,246,0.7) 0%, rgba(236,72,153,0.7) 100%)',
                      border: 'none',
                      color: '#f9fafb',
                      cursor: 'pointer',
                      fontSize: '1.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      boxShadow: isPlaying
                        ? '0 8px 32px rgba(139,92,246,0.4), 0 0 20px rgba(236,72,153,0.3)'
                        : '0 4px 16px rgba(139,92,246,0.3)',
                      transform: 'scale(1)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.1)';
                      e.currentTarget.style.boxShadow = '0 12px 40px rgba(139,92,246,0.5), 0 0 30px rgba(236,72,153,0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = isPlaying
                        ? '0 8px 32px rgba(139,92,246,0.4), 0 0 20px rgba(236,72,153,0.3)'
                        : '0 4px 16px rgba(139,92,246,0.3)';
                    }}
                    title="Пробел - Play/Pause"
                  >
                    {isPlaying ? '⏸' : '▶'}
                  </button>

                  {/* Seek Forward */}
                  <button
                    onClick={() => seekForward(5)}
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.1)',
                      border: 'none',
                      color: '#f9fafb',
                      cursor: 'pointer',
                      fontSize: '1.2rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s ease',
                      opacity: 0.8,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                      e.currentTarget.style.opacity = '1';
                      e.currentTarget.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                      e.currentTarget.style.opacity = '0.8';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    title="→ - Вперед 5 сек"
                  >
                    ⏩
                  </button>

                  {/* Volume Control */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                      onClick={toggleMute}
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.1)',
                        border: 'none',
                        color: '#f9fafb',
                        cursor: 'pointer',
                        fontSize: '1.1rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease',
                      }}
                      title="M - Вкл/Выкл звук"
                    >
                      {isMuted ? '🔇' : '🔊'}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={volume}
                      onChange={(e) => setVolume(Number(e.target.value))}
                      style={{
                        width: '100px',
                        cursor: 'pointer',
                      }}
                      title="Громкость"
                    />
                  </div>

                  {/* Playback Rate */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.875rem', color: 'rgba(148,163,184,0.8)' }}>Скорость:</span>
                    <button
                      onClick={() => adjustPlaybackRate('down')}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '0.5rem',
                        background: 'rgba(255,255,255,0.1)',
                        border: 'none',
                        color: '#f9fafb',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                      }}
                      title="↓ - Уменьшить скорость"
                    >
                      −
                    </button>
                    <span style={{ fontSize: '0.875rem', color: '#f9fafb', minWidth: '40px', textAlign: 'center' }}>
                      {playbackRate}x
                    </span>
                    <button
                      onClick={() => adjustPlaybackRate('up')}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '0.5rem',
                        background: 'rgba(255,255,255,0.1)',
                        border: 'none',
                        color: '#f9fafb',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                      }}
                      title="↑ - Увеличить скорость"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {!videoId && (
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(24,24,27,0.95) 0%, rgba(39,39,42,0.9) 100%)',
                borderRadius: '1.25rem',
                padding: '4rem 3rem',
                border: '1px solid rgba(139,92,246,0.15)',
                textAlign: 'center',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              }}
            >
              {/* Decorative gradient background */}
              <div
                style={{
                  position: 'absolute',
                  top: '-50%',
                  left: '-50%',
                  width: '200%',
                  height: '200%',
                  background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)',
                  animation: 'pulse 4s ease-in-out infinite',
                  pointerEvents: 'none',
                }}
              />
              
              <div style={{ 
                position: 'relative',
                zIndex: 1,
              }}>
                <div style={{ 
                  fontSize: '5rem', 
                  marginBottom: '1.5rem',
                  filter: 'drop-shadow(0 4px 20px rgba(139,92,246,0.3))',
                  animation: 'float 3s ease-in-out infinite',
                }}>
                  🎤
                </div>
                <div style={{ 
                  fontSize: '1.25rem', 
                  marginBottom: '0.75rem',
                  fontWeight: 600,
                  color: '#f9fafb',
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>
                  Введите ссылку на YouTube видео выше
                </div>
                <div style={{ 
                  fontSize: '0.95rem',
                  color: 'rgba(148,163,184,0.8)',
                  lineHeight: '1.6',
                  maxWidth: '400px',
                  margin: '0 auto',
                }}>
                  Субтитры будут автоматически синхронизированы с воспроизведением
                </div>
                
                {/* Feature highlights */}
                <div style={{
                  marginTop: '2.5rem',
                  display: 'flex',
                  gap: '1.5rem',
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                }}>
                  {[
                    { icon: '🎯', text: 'Синхронизация' },
                    { icon: '📝', text: 'Субтитры' },
                    { icon: '🎵', text: 'Караоке' },
                  ].map((feature, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '0.75rem 1.25rem',
                        background: 'rgba(139,92,246,0.1)',
                        border: '1px solid rgba(139,92,246,0.2)',
                        borderRadius: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.875rem',
                        color: 'rgba(148,163,184,0.9)',
                        transition: 'all 0.3s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(139,92,246,0.2)';
                        e.currentTarget.style.borderColor = 'rgba(139,92,246,0.4)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(139,92,246,0.1)';
                        e.currentTarget.style.borderColor = 'rgba(139,92,246,0.2)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <span>{feature.icon}</span>
                      <span>{feature.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Saved Videos Collection */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(24,24,27,0.98) 0%, rgba(39,39,42,0.95) 100%)',
            borderRadius: '1.25rem',
            border: '1px solid rgba(139,92,246,0.2)',
            display: 'flex',
            flexDirection: 'column',
            height: 'fit-content',
            maxHeight: 'calc(100vh - 200px)',
            position: 'sticky',
            top: '1.5rem',
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(139,92,246,0.1)',
            backdropFilter: 'blur(20px)',
          }}
        >
          {/* Заголовок - всегда видимый */}
          <div
            style={{
              padding: '1.75rem 1.75rem 1.25rem 1.75rem',
              borderBottom: '1px solid rgba(82,82,91,0.5)',
              flexShrink: 0,
              background: 'linear-gradient(135deg, rgba(139,92,246,0.05) 0%, transparent 100%)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '1.5rem' }}>📚</span>
              <h3
                style={{
                  fontSize: '1.2rem',
                  fontWeight: 700,
                  margin: 0,
                  color: '#f9fafb',
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Моя коллекция
              </h3>
            </div>
            <div style={{
              fontSize: '0.875rem',
              color: 'rgba(148,163,184,0.7)',
              marginLeft: '2.25rem',
            }}>
              {savedVideos.length} {savedVideos.length === 1 ? 'видео' : savedVideos.length < 5 ? 'видео' : 'видео'}
            </div>
          </div>

          {/* Прокручиваемая область с градиентной маской */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: '1rem 1.5rem 1.5rem 1.5rem',
              position: 'relative',
              // Красивый скролл
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(139,92,246,0.5) rgba(24,24,27,0.95)',
            }}
            onScroll={(e) => {
              const target = e.currentTarget;
              const container = target.parentElement;
              if (!container) return;
              
              // Показываем/скрываем градиенты в зависимости от позиции скролла
              const isAtTop = target.scrollTop === 0;
              const isAtBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 5;
              
              const topGradient = container.querySelector('[data-gradient="top"]') as HTMLElement;
              const bottomGradient = container.querySelector('[data-gradient="bottom"]') as HTMLElement;
              
              if (topGradient) topGradient.style.opacity = isAtTop ? '0' : '1';
              if (bottomGradient) bottomGradient.style.opacity = isAtBottom ? '0' : '1';
            }}
          >
            {/* Контент */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {savedVideos.length === 0 ? (
                <div
                  style={{
                    padding: '3rem 2rem',
                    textAlign: 'center',
                    color: 'rgba(148,163,184,0.6)',
                    fontSize: '0.9rem',
                  }}
                >
                  <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>📭</div>
                  <div>Нет сохраненных видео</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {savedVideos
                .filter((v) => v.video_type === 'youtube')
                .map((video) => (
                  <div
                    key={video.id}
                    onClick={() => handleLoadSavedVideo(video)}
                    onMouseEnter={(e) => {
                      if (selectedSavedVideo?.id !== video.id) {
                        e.currentTarget.style.background = 'rgba(139,92,246,0.15)';
                        e.currentTarget.style.borderColor = 'rgba(139,92,246,0.4)';
                        e.currentTarget.style.transform = 'translateX(4px)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedSavedVideo?.id !== video.id) {
                        e.currentTarget.style.background = 'rgba(39,39,42,0.9)';
                        e.currentTarget.style.borderColor = 'rgba(82,82,91,0.85)';
                        e.currentTarget.style.transform = 'translateX(0)';
                      }
                    }}
                    style={{
                      padding: '1.25rem',
                      background:
                        selectedSavedVideo?.id === video.id
                          ? 'linear-gradient(135deg, rgba(139,92,246,0.25) 0%, rgba(236,72,153,0.15) 100%)'
                          : 'rgba(39,39,42,0.9)',
                      border:
                        selectedSavedVideo?.id === video.id
                          ? '1px solid rgba(168,85,247,0.75)'
                          : '1px solid rgba(82,82,91,0.85)',
                      borderRadius: '1rem',
                      cursor: 'pointer',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      boxShadow: selectedSavedVideo?.id === video.id
                        ? '0 4px 20px rgba(139,92,246,0.3), 0 0 0 1px rgba(139,92,246,0.2)'
                        : 'none',
                    }}
                  >
                    {/* Video thumbnail */}
                    {video.video_id && (
                      <div
                        style={{
                          width: '100%',
                          paddingBottom: '56.25%',
                          position: 'relative',
                          borderRadius: '0.75rem',
                          overflow: 'hidden',
                          marginBottom: '0.875rem',
                          background: '#000',
                        }}
                      >
                        <img
                          src={`https://img.youtube.com/vi/${video.video_id}/mqdefault.jpg`}
                          alt={video.title || 'Video thumbnail'}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                          }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${video.video_id}/hqdefault.jpg`;
                          }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            width: '48px',
                            height: '48px',
                            borderRadius: '50%',
                            background: 'rgba(0, 0, 0, 0.7)',
                            backdropFilter: 'blur(10px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '2px solid rgba(255, 255, 255, 0.3)',
                          }}
                        >
                          <span style={{ fontSize: '1.25rem', marginLeft: '2px' }}>▶</span>
                        </div>
                      </div>
                    )}
                    
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'start',
                        gap: '0.75rem',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: '0.95rem',
                            fontWeight: 600,
                            marginBottom: '0.5rem',
                            color: '#f9fafb',
                            lineHeight: '1.4',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                          }}
                        >
                          {video.title || `YouTube: ${video.video_id}`}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                          <div
                            style={{
                              fontSize: '0.8rem',
                              color: 'rgba(148,163,184,0.7)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                            }}
                          >
                            <span>📅</span>
                            <span>{new Date(video.created_at).toLocaleDateString('ru-RU', { 
                              day: 'numeric', 
                              month: 'short',
                              year: 'numeric'
                            })}</span>
                          </div>
                          {video.transcription_segments && (
                            <div
                              style={{
                                fontSize: '0.8rem',
                                color: 'rgba(139,92,246,0.8)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                              }}
                            >
                              <span>📝</span>
                              <span>{video.transcription_segments.length} {video.transcription_segments.length === 1 ? 'сегмент' : 'сегментов'}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(video.id);
                        }}
                        disabled={deleting === video.id}
                        onMouseEnter={(e) => {
                          if (deleting !== video.id) {
                            e.currentTarget.style.background = 'rgba(239,68,68,0.3)';
                            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.6)';
                            e.currentTarget.style.transform = 'scale(1.1)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (deleting !== video.id) {
                            e.currentTarget.style.background = 'rgba(239,68,68,0.2)';
                            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)';
                            e.currentTarget.style.transform = 'scale(1)';
                          }
                        }}
                        style={{
                          padding: '0.5rem',
                          background: 'rgba(239,68,68,0.2)',
                          border: '1px solid rgba(239,68,68,0.4)',
                          borderRadius: '0.5rem',
                          color: '#fecaca',
                          cursor: deleting === video.id ? 'not-allowed' : 'pointer',
                          fontSize: '1rem',
                          opacity: deleting === video.id ? 0.5 : 1,
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: '36px',
                          height: '36px',
                        }}
                      >
                        {deleting === video.id ? '⏳' : '🗑️'}
                      </button>
                    </div>
                  </div>
                ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Градиент сверху для плавного обрезания - поверх прокручиваемой области */}
          <div
            data-gradient="top"
            style={{
              position: 'absolute',
              top: '60px', // Высота заголовка
              left: 0,
              right: 0,
              height: '20px',
              background: 'linear-gradient(to bottom, rgba(24,24,27,0.95) 0%, transparent 100%)',
              pointerEvents: 'none',
              zIndex: 10,
              opacity: 0,
              transition: 'opacity 0.2s ease',
            }}
          />
          
          {/* Градиент снизу для плавного обрезания - поверх прокручиваемой области */}
          <div
            data-gradient="bottom"
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '20px',
              background: 'linear-gradient(to top, rgba(24,24,27,0.95) 0%, transparent 100%)',
              pointerEvents: 'none',
              zIndex: 10,
              opacity: 0,
              transition: 'opacity 0.2s ease',
            }}
          />
        </div>
      </div>

      {/* Fullscreen Text-Only Mode */}
      {isFullscreen && videoId && segments.length > 0 && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(135deg, #050509 0%, #111111 40%, #18181b 100%)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            padding: '2rem',
            overflowY: 'auto',
            animation: 'fadeIn 0.3s ease',
          }}
        >
          {/* Fullscreen Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '2rem',
              paddingBottom: '1.5rem',
              borderBottom: '1px solid rgba(148,163,184,0.2)',
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  margin: 0,
                  marginBottom: '0.5rem',
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                {videoTitle || 'Караоке'}
              </h2>
        <div
          style={{
                  fontSize: '0.875rem',
                  color: 'rgba(148,163,184,0.7)',
                }}
              >
                Синхронизированные субтитры
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                onClick={handleAnalyzeIdioms}
                disabled={!segments.length || !accessToken || idiomsLoading}
                style={{
                  padding: '0.75rem 1.25rem',
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(148,163,184,0.3)',
                  background: 'rgba(30,41,59,0.8)',
                  color: 'rgba(226,232,240,0.95)',
                  cursor:
                    !segments.length || !accessToken || idiomsLoading ? 'default' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  width: '240px',
                  justifyContent: 'center',
                  opacity:
                    !segments.length || !accessToken || idiomsLoading
                      ? 0.6
                      : 1,
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  if (segments.length && accessToken && !idiomsLoading) {
                    e.currentTarget.style.background = 'rgba(139,92,246,0.2)';
                    e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (segments.length && accessToken && !idiomsLoading) {
                    e.currentTarget.style.background = 'rgba(30,41,59,0.8)';
                    e.currentTarget.style.borderColor = 'rgba(148,163,184,0.3)';
                  }
                }}
                >
                  <span>✨</span>
                  <span>
                    {idiomsLoading ? 'Анализ идиом...' : 'Определить идиомы'}
                  </span>
                </button>
                <span
                  onClick={() => setFeatureInfo('idioms')}
                  style={{
                    cursor: 'pointer',
                    color: '#e5e7eb',
                    fontSize: '0.9rem',
                    width: '22px',
                    height: '22px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '999px',
                    border: '1px solid rgba(148,163,184,0.6)',
                    background: 'rgba(15,23,42,0.9)',
                    boxShadow: '0 0 0 1px rgba(15,23,42,0.8)',
                  }}
                >
                  ?
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                onClick={handleAnalyzePhrasalVerbs}
                disabled={!segments.length || !accessToken || phrasalVerbsLoading}
                style={{
                  padding: '0.75rem 1.25rem',
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(148,163,184,0.3)',
                  background: 'rgba(30,41,59,0.8)',
                  color: 'rgba(226,232,240,0.95)',
                  cursor:
                    !segments.length || !accessToken || phrasalVerbsLoading ? 'default' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  width: '240px',
                  justifyContent: 'center',
                  opacity:
                    !segments.length || !accessToken || phrasalVerbsLoading
                      ? 0.6
                      : 1,
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  if (segments.length && accessToken && !phrasalVerbsLoading) {
                    e.currentTarget.style.background = 'rgba(139,92,246,0.2)';
                    e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (segments.length && accessToken && !phrasalVerbsLoading) {
                    e.currentTarget.style.background = 'rgba(30,41,59,0.8)';
                    e.currentTarget.style.borderColor = 'rgba(148,163,184,0.3)';
                  }
                }}
                >
                  <span>🤖</span>
                  <span>
                    {phrasalVerbsLoading ? 'Анализ...' : 'Фразовые глаголы'}
                  </span>
                </button>
                <span
                  onClick={() => setFeatureInfo('phrasal')}
                  style={{
                    cursor: 'pointer',
                    color: '#e5e7eb',
                    fontSize: '0.9rem',
                    width: '22px',
                    height: '22px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '999px',
                    border: '1px solid rgba(148,163,184,0.6)',
                    background: 'rgba(15,23,42,0.9)',
                    boxShadow: '0 0 0 1px rgba(15,23,42,0.8)',
                  }}
                >
                  ?
                </span>
              </div>
              <button
                onClick={() => {
                  // Stop video if playing
                  if (youtubePlayerRef.current) {
                    try {
                      youtubePlayerRef.current.stopVideo();
                      youtubePlayerRef.current.destroy();
                    } catch (e) {
                      console.error('Error stopping video:', e);
                    }
                    youtubePlayerRef.current = null;
                  }
                  
                  // Clear player container
                  const container = document.getElementById('youtube-player-container');
                  if (container) {
                    container.innerHTML = '';
                  }
                  
                  // Clear all video data
                  setVideoId(null);
                  setVideoTitle(null);
                  setSegments([]);
                  setCurrentSegmentIndex(-1);
                  setCurrentTime(0);
                  setYoutubeUrl('');
                  setError(null);
                  setIsPlaying(false);
                  
                  // Exit fullscreen and return to input mode
                  setIsFullscreen(false);
                  setViewMode('full');
                  
                  // Scroll to top to show URL input
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'rgba(30,41,59,0.8)',
                  border: '1px solid rgba(148,163,184,0.3)',
                  borderRadius: '0.75rem',
                  color: '#f9fafb',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(139,92,246,0.2)';
                  e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(30,41,59,0.8)';
                  e.currentTarget.style.borderColor = 'rgba(148,163,184,0.3)';
                }}
              >
                <span style={{ fontSize: '1.2rem' }}>✕</span>
                <span>Закрыть</span>
              </button>
            </div>
          </div>

          {featureInfo && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 60,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1.5rem',
                background: 'rgba(15,23,42,0.65)',
                backdropFilter: 'blur(10px)',
              }}
              onClick={() => setFeatureInfo(null)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  maxWidth: '640px',
                  width: '100%',
                  borderRadius: '1.25rem',
                  border: '1px solid rgba(148,163,184,0.4)',
                  background:
                    'radial-gradient(circle at 0% 0%, rgba(15,23,42,0.98), rgba(30,64,175,0.65))',
                  boxShadow: '0 22px 55px rgba(15,23,42,0.95)',
                  padding: '1.8rem 2rem 1.7rem',
                  color: 'rgba(226,232,240,0.98)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '1.15rem',
                      fontWeight: 600,
                    }}
                  >
                    <span style={{ fontSize: '1.3rem' }}>
                      {featureInfo === 'idioms' ? '✨' : '🤖'}
                    </span>
                    <span>
                      {featureInfo === 'idioms'
                        ? 'Как работает определение идиом'
                        : 'Как работают фразовые глаголы (ИИ)'}
                    </span>
                  </div>
                  <button
                    onClick={() => setFeatureInfo(null)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'rgba(148,163,184,0.9)',
                      cursor: 'pointer',
                      fontSize: '1.1rem',
                      padding: '0.25rem',
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div
                  style={{
                    fontSize: '1rem',
                    lineHeight: 1.8,
                    color: 'rgba(226,232,240,0.96)',
                  }}
                >
                  {featureInfo === 'idioms' ? (
                    <>
                      <p style={{ margin: 0, marginBottom: '0.75rem' }}>
                        Сервис просматривает текст песни и находит идиомы и устойчивые выражения,
                        которые нельзя переводить дословно. Для каждой фразы вы увидите перевод и
                        простое объяснение, что она значит «в жизни», а не только в словаре.
                      </p>
                      <p style={{ margin: 0 }}>
                        Это помогает запоминать готовые выражения целиком и естественнее звучать в
                        разговорной речи, а не собирать предложение из разрозненных слов.
                      </p>
                    </>
                  ) : (
                    <>
                      <p style={{ margin: 0, marginBottom: '0.75rem' }}>
                        Алгоритм находит в тексте фразовые глаголы (phrasal verbs) вроде{' '}
                        <span style={{ color: '#a5b4fc' }}>“get over”</span> или{' '}
                        <span style={{ color: '#a5b4fc' }}>“turn up”</span>. Для каждого глагола вы
                        получаете значение конструкции целиком, а не отдельных слов.
                      </p>
                      <p style={{ margin: 0 }}>
                        Вместе с объяснением показывается пример на английском, чтобы вы увидели
                        живой контекст. Это помогает быстрее начать использовать фразовые глаголы в
                        своей речи и лучше понимать носителей.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Fullscreen Lyrics */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '2rem',
              maxWidth: '1200px',
              margin: '0 auto',
              width: '100%',
              paddingBottom: '140px', // Space for bottom controls
            }}
          >
            {segments.map((segment, index) => {
              const isActive = currentSegmentIndex === index;
              const isPast = index < currentSegmentIndex;
              const isFuture = index > currentSegmentIndex;
              const segmentProgress = isActive ? getSegmentProgress(index, currentTime) : 0;
              
              let opacity = 0.3;
              if (isActive) {
                opacity = 1;
              } else if (isPast) {
                opacity = 0.25;
              } else if (isFuture) {
                opacity = 0.4;
              }

              return (
                <div
                  key={index}
                  id={`fullscreen-segment-${index}`}
                  style={{
                    position: 'relative',
                    padding: '2rem 3rem',
                    borderRadius: '1.5rem',
                    background: isActive
                      ? 'rgba(30,41,59,0.9)'
                      : 'rgba(30,41,59,0.4)',
                    border: isActive
                      ? '2px solid rgba(139,92,246,0.6)'
                      : '1px solid rgba(148,163,184,0.15)',
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: isActive ? 'scale(1.03)' : 'scale(1)',
                    opacity: opacity,
                    overflow: 'hidden',
                    boxShadow: isActive
                      ? '0 10px 40px rgba(139,92,246,0.3), 0 0 60px rgba(236,72,153,0.2)'
                      : 'none',
                  }}
                >
                  {/* Spotify-style gradient highlight */}
                  {isActive && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: `linear-gradient(
                          to right,
                          rgba(139,92,246,0.3) 0%,
                          rgba(236,72,153,0.3) ${segmentProgress * 100}%,
                          transparent ${segmentProgress * 100}%,
                          transparent 100%
                        )`,
                        pointerEvents: 'none',
                        transition: 'background 0.1s linear',
                      }}
                    />
                  )}

                  {/* Text with word-by-word highlighting */}
                  <div
                    style={{
                      position: 'relative',
                      zIndex: 1,
                      fontSize: isActive ? '2rem' : '1.5rem',
                      lineHeight: '2',
                      color: isActive ? '#f9fafb' : 'rgba(249,250,251,0.6)',
                      fontWeight: isActive ? 700 : 500,
                      transition: 'all 0.3s ease',
                      letterSpacing: isActive ? '0.03em' : '0.01em',
                      textAlign: 'center',
            }}
          >
                    {segment.text.split(' ').map((word, wordIndex, words) => {
                      const wordsInSegment = words.length;
                      const wordStartProgress = wordIndex / wordsInSegment;
                      const wordEndProgress = (wordIndex + 1) / wordsInSegment;
                      
                      const isWordHighlighted = isActive && 
                        segmentProgress >= wordStartProgress && 
                        segmentProgress < wordEndProgress;
                      
                      const wordProgress = isActive
                        ? Math.max(
                            0,
                            Math.min(
                              1,
                              (segmentProgress - wordStartProgress) / 
                              (wordEndProgress - wordStartProgress)
                            )
                          )
                        : 0;

                      const isWordActive = isActive && isWordHighlighted && wordProgress > 0.3;
                      const wordOpacity = isActive
                        ? isWordActive
                          ? 1
                          : segmentProgress >= wordStartProgress
                          ? 0.6 + wordProgress * 0.4
                          : 0.5
                        : 1;

                      return (
                        <span
                          key={wordIndex}
                          onClick={() => handleWordClick(word, segment)}
                          style={{
                            display: 'inline-block',
                            marginRight: '0.75em',
                            marginBottom: '0.25em',
                            position: 'relative',
                            color: isWordActive
                              ? '#fff'
                              : isActive
                              ? `rgba(249,250,251,${wordOpacity})`
                              : 'rgba(249,250,251,0.6)',
                            fontWeight: isWordActive ? 800 : isActive ? 700 : 500,
                            textShadow: isWordActive
                              ? '0 0 30px rgba(139,92,246,0.8), 0 0 20px rgba(236,72,153,0.6), 0 0 10px rgba(139,92,246,0.4)'
                              : 'none',
                            transition: 'all 0.15s ease',
                            transform: isWordActive ? 'scale(1.08)' : 'scale(1)',
                            cursor: accessToken ? 'pointer' : 'default',
                            borderBottom:
                              selectedWord &&
                              selectedWord.toLowerCase() === word.toLowerCase()
                                ? '1px dashed rgba(250,250,250,0.7)'
                                : 'none',
                          }}
                        >
                          {word}
                        </span>
                      );
                    })}
                  </div>

                  {/* Time indicator */}
                  <div
                    style={{
                      fontSize: '0.875rem',
                      color: 'rgba(148,163,184,0.6)',
                      marginTop: '1rem',
                      fontFamily: 'monospace',
                      textAlign: 'center',
                    }}
                  >
                    {Math.floor(segment.start)}s - {Math.floor(segment.end)}s
                    {isActive && (
                      <span
                        style={{
                          marginLeft: '0.75rem',
                          color: 'rgba(139,92,246,0.9)',
                          fontWeight: 600,
                        }}
                      >
                        • {Math.round(segmentProgress * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Fullscreen Player Controls - Spotify-style at bottom */}
          {youtubeApiReady && (
            <div
              style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'linear-gradient(to top, rgba(5,5,9,0.98) 0%, rgba(17,17,17,0.95) 50%, transparent 100%)',
                backdropFilter: 'blur(20px)',
                borderTop: '1px solid rgba(139,92,246,0.3)',
                padding: '1.5rem 2rem',
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2rem',
                boxShadow: '0 -10px 40px rgba(0,0,0,0.5), 0 -4px 20px rgba(139,92,246,0.2)',
              }}
            >
              {/* Seek Backward */}
              <button
                onClick={() => seekBackward(5)}
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  color: '#f9fafb',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  opacity: 0.8,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.transform = 'scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.opacity = '0.8';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                title="← - Назад 5 сек"
              >
                ⏪
              </button>

              {/* Play/Pause - Large center button */}
              <button
                onClick={togglePlayPause}
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: isPlaying
                    ? 'linear-gradient(135deg, rgba(139,92,246,0.9) 0%, rgba(236,72,153,0.9) 100%)'
                    : 'linear-gradient(135deg, rgba(139,92,246,0.7) 0%, rgba(236,72,153,0.7) 100%)',
                  border: 'none',
                  color: '#f9fafb',
                  cursor: 'pointer',
                  fontSize: '1.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: isPlaying
                    ? '0 8px 32px rgba(139,92,246,0.4), 0 0 20px rgba(236,72,153,0.3)'
                    : '0 4px 16px rgba(139,92,246,0.3)',
                  transform: 'scale(1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.1)';
                  e.currentTarget.style.boxShadow = '0 12px 40px rgba(139,92,246,0.5), 0 0 30px rgba(236,72,153,0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = isPlaying
                    ? '0 8px 32px rgba(139,92,246,0.4), 0 0 20px rgba(236,72,153,0.3)'
                    : '0 4px 16px rgba(139,92,246,0.3)';
                }}
                title="Пробел - Play/Pause"
              >
                {isPlaying ? '⏸' : '▶'}
              </button>

              {/* Seek Forward */}
              <button
                onClick={() => seekForward(5)}
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  color: '#f9fafb',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  opacity: 0.8,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.transform = 'scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.opacity = '0.8';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                title="→ - Вперед 5 сек"
              >
                ⏩
              </button>

            </div>
          )}
        </div>
      )}

      {idiomsModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '1.5rem',
          }}
          onClick={() => {
            setIdiomsModalOpen(false);
            setIdiomsError(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 720,
              width: '100%',
              maxHeight: '80vh',
              borderRadius: '1.25rem',
              padding: '1.5rem 1.75rem',
              background: 'rgba(24,24,27,0.98)',
              border: '1px solid rgba(82,82,91,0.85)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.85)',
              color: '#f9fafb',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.5rem',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'rgba(148,163,184,0.9)',
                  }}
                >
                  Идиомы в этой песне
                </div>
                <div
                  style={{
                    fontSize: '1.2rem',
                    fontWeight: 700,
                  }}
                >
                  Устойчивые выражения и фразовые глаголы
                </div>
              </div>
              <button
                onClick={() => {
                  setIdiomsModalOpen(false);
                  setIdiomsError(null);
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'rgba(148,163,184,0.9)',
                  cursor: 'pointer',
                  fontSize: '1.25rem',
                }}
              >
                ✕
              </button>
            </div>

            {idiomsError && (
              <div
                style={{
                  marginTop: '0.25rem',
                  padding: '0.75rem',
                  borderRadius: '0.75rem',
                  background: 'rgba(127,29,29,0.25)',
                  border: '1px solid rgba(248,113,113,0.6)',
                  color: '#fecaca',
                  fontSize: '0.85rem',
                }}
              >
                {idiomsError}
              </div>
            )}

            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                marginTop: '0.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
              }}
            >
              {idiomsLoading && idioms.length === 0 ? (
                <div
                  style={{
                    padding: '2rem',
                    textAlign: 'center',
                    fontSize: '0.95rem',
                    color: 'rgba(148,163,184,0.9)',
                  }}
                >
                  Анализируем текст песни на идиомы...
                </div>
              ) : idioms.length === 0 ? (
                <div
                  style={{
                    padding: '2rem',
                    textAlign: 'center',
                    fontSize: '0.95rem',
                    color: 'rgba(148,163,184,0.9)',
                  }}
                >
                  Идиомы не найдены. Попробуйте другую песню или текст.
                </div>
              ) : (
                idioms.map((idiom, index) => {
                  const key = idiom.phrase.trim().toLowerCase();
                  const isAdded = !!idiomsAdded[key];
                  return (
                    <div
                      key={index}
                      style={{
                        borderRadius: '0.9rem',
                        border: '1px solid rgba(55,65,81,0.95)',
                        background: 'rgba(17,24,39,0.98)',
                        padding: '0.85rem 1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem',
                      }}
                    >
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
                              fontSize: '0.9rem',
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                              color: 'rgba(148,163,184,0.9)',
                            }}
                          >
                            Идиома
                          </div>
                          <div
                            style={{
                              fontSize: '1rem',
                              fontWeight: 600,
                            }}
                          >
                            {idiom.phrase}
                          </div>
                        </div>
                        <button
                          onClick={() => handleAddIdiomToVocabulary(idiom)}
                          disabled={isAdded}
                          style={{
                            padding: '0.45rem 0.9rem',
                            borderRadius: '999px',
                            border: 'none',
                            background: isAdded
                              ? 'rgba(34,197,94,0.18)'
                              : 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
                            color: '#f9fafb',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: isAdded ? 'default' : 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {isAdded ? 'В словаре идиом' : 'Добавить в словарь'}
                        </button>
                      </div>

                      {idiom.meaning && (
                        <div
                          style={{
                            fontSize: '0.9rem',
                            color: 'rgba(209,213,219,0.98)',
                          }}
                        >
                          {idiom.meaning}
                        </div>
                      )}

                      {idiom.literal_translation && (
                        <div
                          style={{
                            fontSize: '0.8rem',
                            color: 'rgba(148,163,184,0.95)',
                          }}
                        >
                          Дословно: {idiom.literal_translation}
                        </div>
                      )}

                      {idiom.usage_examples && idiom.usage_examples.length > 0 && (
                        <ul
                          style={{
                            margin: 0,
                            paddingLeft: '1.1rem',
                            fontSize: '0.8rem',
                            color: 'rgba(209,213,219,0.98)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.2rem',
                          }}
                        >
                          {idiom.usage_examples.slice(0, 3).map((ex, i) => (
                            <li key={i}>{ex}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {phrasalVerbsModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '1.5rem',
          }}
          onClick={() => {
            setPhrasalVerbsModalOpen(false);
            setPhrasalVerbsError(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 720,
              width: '100%',
              maxHeight: '80vh',
              borderRadius: '1.25rem',
              padding: '1.5rem 1.75rem',
              background: 'rgba(24,24,27,0.98)',
              border: '1px solid rgba(82,82,91,0.85)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.85)',
              color: '#f9fafb',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.5rem',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'rgba(148,163,184,0.9)',
                  }}
                >
                  Фразовые глаголы в этой песне
                </div>
                <div
                  style={{
                    fontSize: '1.2rem',
                    fontWeight: 700,
                  }}
                >
                  Определено с помощью ИИ
                </div>
              </div>
              <button
                onClick={() => {
                  setPhrasalVerbsModalOpen(false);
                  setPhrasalVerbsError(null);
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'rgba(148,163,184,0.9)',
                  cursor: 'pointer',
                  fontSize: '1.25rem',
                }}
              >
                ✕
              </button>
            </div>

            {phrasalVerbsError && (
              <div
                style={{
                  marginTop: '0.25rem',
                  padding: '0.75rem',
                  borderRadius: '0.75rem',
                  background: 'rgba(127,29,29,0.25)',
                  border: '1px solid rgba(248,113,113,0.6)',
                  color: '#fecaca',
                  fontSize: '0.85rem',
                }}
              >
                {phrasalVerbsError}
              </div>
            )}

            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                marginTop: '0.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
              }}
            >
              {phrasalVerbsLoading && phrasalVerbs.length === 0 ? (
                <div
                  style={{
                    padding: '2rem',
                    textAlign: 'center',
                    fontSize: '0.95rem',
                    color: 'rgba(148,163,184,0.9)',
                  }}
                >
                  Анализируем текст песни на фразовые глаголы с помощью ИИ...
                </div>
              ) : phrasalVerbs.length === 0 ? (
                <div
                  style={{
                    padding: '2rem',
                    textAlign: 'center',
                    fontSize: '0.95rem',
                    color: 'rgba(148,163,184,0.9)',
                  }}
                >
                  Фразовые глаголы не найдены. Попробуйте другую песню или текст.
                </div>
              ) : (
                phrasalVerbs.map((pv, index) => {
                  const key = pv.phrase.trim().toLowerCase();
                  const isAdded = !!phrasalVerbsAdded[key];
                  return (
                    <div
                      key={index}
                      style={{
                        borderRadius: '0.9rem',
                        border: '1px solid rgba(55,65,81,0.95)',
                        background: 'rgba(17,24,39,0.98)',
                        padding: '0.85rem 1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem',
                      }}
                    >
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
                              fontSize: '0.9rem',
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                              color: 'rgba(148,163,184,0.9)',
                            }}
                          >
                            Фразовый глагол
                          </div>
                          <div
                            style={{
                              fontSize: '1rem',
                              fontWeight: 600,
                            }}
                          >
                            {pv.phrase}
                          </div>
                        </div>
                        <button
                          onClick={() => handleAddPhrasalVerbToVocabulary(pv)}
                          disabled={isAdded}
                          style={{
                            padding: '0.45rem 0.9rem',
                            borderRadius: '999px',
                            border: 'none',
                            background: isAdded
                              ? 'rgba(34,197,94,0.18)'
                              : 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
                            color: '#f9fafb',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: isAdded ? 'default' : 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {isAdded ? 'В словаре' : 'Добавить в словарь'}
                        </button>
                      </div>

                      {pv.meaning && (
                        <div
                          style={{
                            fontSize: '0.9rem',
                            color: 'rgba(209,213,219,0.98)',
                          }}
                        >
                          {pv.meaning}
                        </div>
                      )}

                      {pv.literal_translation && (
                        <div
                          style={{
                            fontSize: '0.8rem',
                            color: 'rgba(148,163,184,0.95)',
                          }}
                        >
                          Дословно: {pv.literal_translation}
                        </div>
                      )}

                      {pv.usage_examples && pv.usage_examples.length > 0 && (
                        <ul
                          style={{
                            margin: 0,
                            paddingLeft: '1.1rem',
                            fontSize: '0.8rem',
                            color: 'rgba(209,213,219,0.98)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.2rem',
                          }}
                        >
                          {pv.usage_examples.slice(0, 3).map((ex, i) => (
                            <li key={i}>{ex}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {selectedWord && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '1.5rem',
          }}
          onClick={() => {
            setSelectedWord(null);
            setSelectedWordSegment(null);
            setWordDefinition(null);
            setWordError(null);
            setAddWordMessage(null);
            if (wordAudioUrl) {
              URL.revokeObjectURL(wordAudioUrl);
              setWordAudioUrl(null);
            }
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 520,
              width: '100%',
              borderRadius: '1.25rem',
              padding: '1.5rem 1.75rem',
              background: 'rgba(24,24,27,0.98)',
              border: '1px solid rgba(82,82,91,0.85)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.85)',
              color: '#f9fafb',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: '1rem',
                paddingBottom: '0.75rem',
                borderBottom: '1px solid rgba(39,39,42,1)',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'rgba(148,163,184,0.9)',
                    marginBottom: '0.25rem',
                    textAlign: 'center',
                  }}
                >
                  Слово из караоке
                </div>
                <div
                  style={{
                    fontSize: '1.6rem',
                    fontWeight: 700,
                    textTransform: 'none',
                    textAlign: 'center',
                  }}
                >
                  {selectedWord}
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                marginBottom: '1rem',
                marginTop: '0.5rem',
              }}
            >
              <button
                onClick={synthesizeWordAudio}
                disabled={wordAudioLoading}
                style={{
                  padding: '0.45rem 1.1rem',
                  borderRadius: '999px',
                  border: '1px solid rgba(82,82,91,0.9)',
                  background: wordAudioLoading ? 'rgba(24,24,27,0.95)' : 'rgba(59,130,246,0.9)',
                  color: wordAudioLoading ? 'rgba(148,163,184,0.9)' : '#e5e7eb',
                  fontSize: '0.9rem',
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
                <span>
                  {wordAudioLoading
                    ? '🔊 Синтез...'
                    : wordAudioUrl
                    ? '▶ Произношение'
                    : '🔊 Произношение'}
                </span>
              </button>
              <audio ref={wordAudioRef} src={wordAudioUrl || undefined} />
            </div>

            {selectedWordSegment && (
              <div
                style={{
                  fontSize: '0.9rem',
                  color: 'rgba(148,163,184,0.9)',
                  padding: '0.75rem 0.9rem',
                  borderRadius: '0.75rem',
                  background: 'rgba(39,39,42,0.95)',
                  border: '1px solid rgba(63,63,70,0.95)',
                  marginBottom: '1rem',
                }}
              >
                {selectedWordSegment.text}
              </div>
            )}

            {wordLoading && (
              <div
                style={{
                  fontSize: '0.95rem',
                  color: 'rgba(148,163,184,0.9)',
                  marginBottom: '0.75rem',
                }}
              >
                Загружаю определение слова с помощью ИИ...
              </div>
            )}

            {wordError && (
              <div
                style={{
                  marginBottom: '0.75rem',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  background: 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  fontSize: '0.8rem',
                  color: '#fecaca',
                }}
              >
                {wordError}
              </div>
            )}

            {wordDefinition && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {wordDefinition.translations?.length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: '0.9rem',
                        color: 'rgba(148,163,184,0.9)',
                        marginBottom: '0.25rem',
                      }}
                    >
                      Переводы:
                    </div>
                    <div
                      style={{
                        fontSize: '1rem',
                        fontWeight: 500,
                      }}
                    >
                      {wordDefinition.translations.map((t) => t.translation).join(', ')}
                    </div>
                  </div>
                )}

                {(wordDefinition.phonetic_transcription ||
                  wordDefinition.part_of_speech ||
                  wordDefinition.difficulty_level) && (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.4rem',
                      fontSize: '0.85rem',
                      marginTop: '0.25rem',
                    }}
                  >
                    {wordDefinition.phonetic_transcription && (
                      <span
                        style={{
                          padding: '0.25rem 0.5rem',
                          borderRadius: '999px',
                          background: 'rgba(24,24,27,0.9)',
                          border: '1px solid rgba(75,85,99,0.9)',
                        }}
                      >
                        {wordDefinition.phonetic_transcription}
                      </span>
                    )}
                    {wordDefinition.part_of_speech && (
                      <span
                        style={{
                          padding: '0.25rem 0.5rem',
                          borderRadius: '999px',
                          background: 'rgba(24,24,27,0.9)',
                          border: '1px solid rgba(55,65,81,0.9)',
                        }}
                      >
                        {wordDefinition.part_of_speech}
                      </span>
                    )}
                    {wordDefinition.difficulty_level && (
                      <span
                        style={{
                          padding: '0.25rem 0.5rem',
                          borderRadius: '999px',
                          background: 'rgba(8,47,73,0.95)',
                          border: '1px solid rgba(56,189,248,0.7)',
                          color: 'rgba(191,219,254,0.95)',
                        }}
                      >
                        Уровень: {wordDefinition.difficulty_level}
                      </span>
                    )}
                  </div>
                )}

                {wordDefinition.example_sentences?.length > 0 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div
                      style={{
                        fontSize: '0.9rem',
                        color: 'rgba(148,163,184,0.9)',
                        marginBottom: '0.25rem',
                      }}
                    >
                      Примеры использования:
                    </div>
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: '1.1rem',
                        fontSize: '0.95rem',
                        color: 'rgba(209,213,219,0.95)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem',
                      }}
                    >
                      {wordDefinition.example_sentences.slice(0, 3).map((ex, idx) => (
                        <li key={idx}>{ex}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: '1.5rem',
                gap: '0.5rem',
              }}
            >
              <button
                onClick={handleAddWordToVocabulary}
                disabled={isAddingWord || !accessToken}
                style={{
                  padding: '0.65rem 1.25rem',
                  borderRadius: '0.75rem',
                  border: 'none',
                  background: isAddingWord
                    ? 'rgba(148,163,184,0.35)'
                    : 'linear-gradient(135deg, #8b5cf6 0%, #764ba2 50%, #ec4899 100%)',
                  color: '#f9fafb',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: isAddingWord ? 'not-allowed' : 'pointer',
                  opacity: isAddingWord ? 0.7 : 1,
                  minWidth: '220px',
                }}
              >
                {isAddingWord ? 'Добавляю...' : 'Добавить в словарь'}
              </button>

              {addWordMessage && (
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: 'rgba(52,211,153,0.9)',
                    textAlign: 'center',
                  }}
                >
                  {addWordMessage}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};