'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

type Video = {
  id: string
  video_url: string
  video_type: 'youtube' | 'upload'
  video_id: string | null
  title: string | null
  transcription_text: string | null
  transcription_segments: Array<{ start: number; end: number; text: string }> | null
  language: string | null
  created_at: string
}

function getApiUrl() {
  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  // Убираем trailing slash, если есть
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function getBackendToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem('backend_jwt')
}

export default function VideosPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [videos, setVideos] = useState<Video[]>([])
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [idioms, setIdioms] = useState<Array<{
    phrase: string
    literal_translation?: string
    meaning?: string
    usage_examples?: string[]
  }> | null>(null)
  const [idiomsLoading, setIdiomsLoading] = useState(false)
  const [idiomsError, setIdiomsError] = useState<string | null>(null)
  const [idiomsTokenEstimate, setIdiomsTokenEstimate] = useState<{
    prompt: number
    completion: number
    total: number
  } | null>(null)
  const [addingIdiom, setAddingIdiom] = useState<string | null>(null)
  // Audio state for idioms
  const idiomAudioCache = useRef<Map<string, string>>(new Map())
  const [synthesizingIdiom, setSynthesizingIdiom] = useState<string | null>(null)
  const idiomAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map())

  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError
        
        // Пытаемся использовать backend JWT, если он уже есть
        let token = getBackendToken()

        // Если backend JWT ещё нет, пробуем получить Supabase токен и обменять его
        if (!token) {
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
          if (sessionError) throw sessionError
          
          const supabaseToken = sessionData.session?.access_token || null
          if (supabaseToken) {
            try {
              const apiUrl = getApiUrl()
              const resp = await fetch(`${apiUrl}/api/auth/exchange-supabase-token`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ supabase_token: supabaseToken }),
              })

              if (resp.ok) {
                const data = await resp.json().catch(() => null)
                if (data?.token) {
                  window.localStorage.setItem('backend_jwt', data.token)
                  token = data.token
                }
              }
            } catch (e) {
              console.error('[Videos] Failed to exchange Supabase token for backend JWT', e)
            }
          }
        }
        
        if (!userData.user || !token) {
          if (mounted) {
            router.push('/auth/login')
            router.refresh()
            return
          }
        }
        
        if (mounted) {
          setUser(userData.user)
          setAccessToken(token)
        }
      } catch (e: any) {
        if (mounted) {
          router.push('/auth/login')
          router.refresh()
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        window.localStorage.removeItem('backend_jwt')
        router.push('/auth/login')
        router.refresh()
        return
      }

      setUser(session.user)

      // При обновлении сессии Supabase пробуем обновить backend JWT
      const supabaseToken = session.access_token || null
      if (supabaseToken) {
        ;(async () => {
          try {
            const apiUrl = getApiUrl()
            const resp = await fetch(`${apiUrl}/api/auth/exchange-supabase-token`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ supabase_token: supabaseToken }),
            })

            if (resp.ok) {
              const data = await resp.json().catch(() => null)
              if (data?.token) {
                window.localStorage.setItem('backend_jwt', data.token)
                setAccessToken(data.token)
                router.refresh()
                return
              }
            }
          } catch (e) {
            console.error('[Videos] Failed to refresh backend JWT', e)
          }
          setAccessToken(null)
          router.refresh()
        })()
      } else {
        window.localStorage.removeItem('backend_jwt')
        setAccessToken(null)
        router.refresh()
      }
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
      // Cleanup audio cache
      idiomAudioCache.current.forEach((url) => {
        URL.revokeObjectURL(url)
      })
      idiomAudioCache.current.clear()
      idiomAudioRefs.current.clear()
    }
  }, [router])

  useEffect(() => {
    if (!accessToken) return

    async function fetchVideos() {
      try {
        const resp = await fetch(`${getApiUrl()}/api/videos`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })

        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}))
          throw new Error(data?.error || `HTTP ${resp.status}`)
        }

        const data = await resp.json()
        if (data.ok && data.videos) {
          setVideos(data.videos)
        }
      } catch (e: any) {
        setError(e?.message || 'Ошибка загрузки видео')
      }
    }

    fetchVideos()
  }, [accessToken])

  const handleDelete = async (videoId: string) => {
    if (!accessToken || !confirm('Вы уверены, что хотите удалить это видео?')) return

    setDeleting(videoId)
    setError(null)

    try {
      const resp = await fetch(`${getApiUrl()}/api/videos/${videoId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        throw new Error(data?.error || `HTTP ${resp.status}`)
      }

      // Remove from list
      setVideos(prev => prev.filter(v => v.id !== videoId))
      if (selectedVideo?.id === videoId) {
        setSelectedVideo(null)
      }
    } catch (e: any) {
      setError(e?.message || 'Ошибка удаления видео')
    } finally {
      setDeleting(null)
    }
  }

  const handleAnalyzeIdioms = async () => {
    if (!accessToken || !selectedVideo?.id) return

    setIdiomsError(null)
    setIdiomsTokenEstimate(null)
    setIdiomsLoading(true)

    try {
      // 1) Estimate tokens (для информации пользователю)
      const estimateResp = await fetch(`${getApiUrl()}/api/vocabulary/idioms/estimate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          video_id: selectedVideo.id,
        }),
      })

      const estimateData = await estimateResp.json().catch(() => ({}))

      if (estimateResp.ok && estimateData.ok) {
        setIdiomsTokenEstimate({
          prompt: estimateData.estimated_tokens_prompt,
          completion: estimateData.estimated_tokens_completion,
          total: estimateData.estimated_tokens_total,
        })
      }

      // 2) Запускаем анализ (использует кэш, если уже есть)
      const analyzeResp = await fetch(`${getApiUrl()}/api/vocabulary/idioms/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          video_id: selectedVideo.id,
          force: false,
        }),
      })

      const analyzeData = await analyzeResp.json().catch(() => ({}))

      if (!analyzeResp.ok || !analyzeData.ok) {
        throw new Error(analyzeData?.error || `HTTP ${analyzeResp.status}`)
      }

      setIdioms(analyzeData.idioms || [])
    } catch (e: any) {
      setIdiomsError(e?.message || 'Не удалось оценить токены для анализа идиом')
    } finally {
      setIdiomsLoading(false)
    }
  }

  const handleAddIdiomToVocabulary = async (idiomPhrase: string, sampleContext?: string) => {
    if (!accessToken || !idiomPhrase) return
    setAddingIdiom(idiomPhrase)
    try {
      const resp = await fetch(`${getApiUrl()}/api/vocabulary/idioms/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          phrase: idiomPhrase,
          literal_translation: undefined,
          meaning: undefined,
          usage_examples: sampleContext ? [sampleContext] : [],
          video_id: selectedVideo?.id,
        }),
      })

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        throw new Error(data?.error || `HTTP ${resp.status}`)
      }
    } catch (e: any) {
      setError(e?.message || 'Не удалось добавить идиому в словарь')
    } finally {
      setAddingIdiom(null)
    }
  }

  const synthesizeIdiomAudio = async (idiomPhrase: string) => {
    if (!accessToken || !idiomPhrase) return

    const phraseKey = idiomPhrase.trim().toLowerCase()
    
    // Check cache first
    const cachedUrl = idiomAudioCache.current.get(phraseKey)
    if (cachedUrl) {
      const audioEl = idiomAudioRefs.current.get(phraseKey)
      if (audioEl) {
        audioEl.play()
      }
      return
    }

    setSynthesizingIdiom(phraseKey)
    try {
      const resp = await fetch(`${getApiUrl()}/api/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ text: idiomPhrase.trim() }),
      })

      if (!resp.ok) {
        throw new Error('Не удалось синтезировать произношение идиомы')
      }

      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      
      // Cache the URL
      idiomAudioCache.current.set(phraseKey, url)
      
      // Create audio element
      const audioEl = new Audio(url)
      idiomAudioRefs.current.set(phraseKey, audioEl)
      
      // Play automatically after synthesis
      audioEl.play()
    } catch (e) {
      console.error('Idiom TTS error:', e)
    } finally {
      setSynthesizingIdiom(null)
    }
  }

  const extractYouTubeId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/
    ]
    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match) return match[1]
    }
    return null
  }

  if (loading || !user) {
    return (
      <main style={{ minHeight: '100vh', background: '#0b1220', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>Загрузка...</div>
      </main>
    )
  }

  return (
    <main style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #8b5cf6 0%, #764ba2 50%, #f093fb 100%)',
      color: 'white',
      padding: '20px'
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '30px'
        }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', margin: 0 }}>Моя коллекция видео</h1>
          <button
            onClick={() => router.push('/')}
            style={{
              padding: '10px 20px',
              background: 'rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '8px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            ← Назад
          </button>
        </div>

        {error && (
          <div style={{
            padding: '15px',
            background: 'rgba(239, 68, 68, 0.2)',
            border: '1px solid rgba(239, 68, 68, 0.5)',
            borderRadius: '8px',
            marginBottom: '20px',
            color: '#fecaca'
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Video List */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)',
            borderRadius: '12px',
            padding: '20px',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}>
            <h2 style={{ fontSize: '20px', marginBottom: '15px', marginTop: 0 }}>Список видео ({videos.length})</h2>
            
            {videos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255, 255, 255, 0.7)' }}>
                <p>У вас пока нет сохраненных видео</p>
                <button
                  onClick={() => router.push('/')}
                  style={{
                    marginTop: '20px',
                    padding: '10px 20px',
                    background: 'rgba(255, 255, 255, 0.2)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '8px',
                    color: 'white',
                    cursor: 'pointer'
                  }}
                >
                  Загрузить видео
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {videos.map((video) => (
                  <div
                    key={video.id}
                    onClick={() => setSelectedVideo(video)}
                    style={{
                      padding: '15px',
                      background: selectedVideo?.id === video.id 
                        ? 'rgba(255, 255, 255, 0.2)' 
                        : 'rgba(255, 255, 255, 0.05)',
                      border: `1px solid ${selectedVideo?.id === video.id ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ 
                          fontSize: '14px', 
                          color: 'rgba(255, 255, 255, 0.6)',
                          marginBottom: '5px'
                        }}>
                          {video.video_type === 'youtube' ? '📺 YouTube' : '📁 Файл'}
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '5px' }}>
                          {video.title || (video.video_type === 'youtube' ? `YouTube: ${video.video_id}` : video.video_url)}
                        </div>
                        <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                          {new Date(video.created_at).toLocaleString('ru-RU')}
                        </div>
                        {video.transcription_text && (
                          <div style={{ 
                            fontSize: '12px', 
                            color: 'rgba(255, 255, 255, 0.7)',
                            marginTop: '8px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical'
                          }}>
                            {video.transcription_text.substring(0, 100)}...
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(video.id)
                        }}
                        disabled={deleting === video.id}
                        style={{
                          padding: '5px 10px',
                          background: 'rgba(239, 68, 68, 0.3)',
                          border: '1px solid rgba(239, 68, 68, 0.5)',
                          borderRadius: '6px',
                          color: 'white',
                          cursor: deleting === video.id ? 'not-allowed' : 'pointer',
                          fontSize: '12px',
                          opacity: deleting === video.id ? 0.5 : 1
                        }}
                      >
                        {deleting === video.id ? '...' : '🗑️'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Video Details */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)',
            borderRadius: '12px',
            padding: '20px',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}>
            {selectedVideo ? (
              <div>
                <h2 style={{ fontSize: '20px', marginBottom: '20px', marginTop: 0 }}>
                  {selectedVideo.title || (selectedVideo.video_type === 'youtube' ? `YouTube: ${selectedVideo.video_id}` : selectedVideo.video_url)}
                </h2>

                {selectedVideo.video_type === 'youtube' && selectedVideo.video_id && (
                  <div style={{ marginBottom: '20px' }}>
                    <iframe
                      width="100%"
                      height="315"
                      src={`https://www.youtube.com/embed/${selectedVideo.video_id}`}
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      style={{ borderRadius: '8px' }}
                    />
                  </div>
                )}

                <div style={{ marginBottom: '15px' }}>
                  <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '5px' }}>
                    Информация
                  </div>
                  <div style={{ fontSize: '14px' }}>
                    <div>Тип: {selectedVideo.video_type === 'youtube' ? 'YouTube' : 'Загруженный файл'}</div>
                    <div>Язык: {selectedVideo.language || 'не определен'}</div>
                    <div>Дата создания: {new Date(selectedVideo.created_at).toLocaleString('ru-RU')}</div>
                    {selectedVideo.video_type === 'youtube' && (
                      <div>
                        <a 
                          href={selectedVideo.video_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ color: '#93c5fd', textDecoration: 'underline' }}
                        >
                          Открыть на YouTube
                        </a>
                      </div>
                    )}
                  </div>
                </div>

              <div style={{ 
                marginBottom: '20px',
                padding: '12px 14px',
                borderRadius: '10px',
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(148, 163, 184, 0.5)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600 }}>
                      Анализ идиом в тексте песни (AI)
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgba(148, 163, 184, 0.9)', marginTop: '2px' }}>
                      Поиск устойчивых выражений и идиом с переводом и объяснениями. Анализ выполняется через AI и тратит токены,
                      но результат кэшируется для этого видео.
                    </div>
                  </div>
                  <button
                    onClick={handleAnalyzeIdioms}
                    disabled={idiomsLoading || !selectedVideo.transcription_text}
                    style={{
                      padding: '9px 13px',
                      background: idiomsLoading
                        ? 'rgba(148, 163, 184, 0.4)'
                        : 'rgba(56, 189, 248, 0.9)',
                      border: 'none',
                      borderRadius: '999px',
                      color: 'white',
                      cursor: idiomsLoading ? 'default' : 'pointer',
                      fontSize: '13px',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      opacity: selectedVideo.transcription_text ? 1 : 0.5,
                    }}
                  >
                    {idiomsLoading ? 'Ищем идиомы…' : 'Найти идиомы'}
                  </button>
                </div>
                {idiomsTokenEstimate && (
                  <div style={{ fontSize: '11px', color: 'rgba(148, 163, 184, 0.9)' }}>
                    Оценка токенов для анализа: ≈ {idiomsTokenEstimate.total} (prompt: {idiomsTokenEstimate.prompt}, completion: {idiomsTokenEstimate.completion})
                  </div>
                )}
              </div>

                {selectedVideo.transcription_text && (
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
                      Расшифрованный текст
                    </div>
                    <div style={{
                      background: 'rgba(0, 0, 0, 0.2)',
                      padding: '15px',
                      borderRadius: '8px',
                      fontSize: '14px',
                      lineHeight: '1.6',
                      whiteSpace: 'pre-wrap',
                      maxHeight: '300px',
                      overflowY: 'auto'
                    }}>
                      {selectedVideo.transcription_text}
                    </div>
                  </div>
                )}

              {idiomsError && (
                <div style={{
                  marginBottom: '15px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: 'rgba(248, 113, 113, 0.15)',
                  border: '1px solid rgba(248, 113, 113, 0.6)',
                  fontSize: '13px',
                  color: '#fee2e2',
                }}>
                  {idiomsError}
                </div>
              )}

              {idioms && idioms.length > 0 && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                    Идиомы и устойчивые выражения из песни
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(148, 163, 184, 0.9)', marginBottom: '10px' }}>
                    Каждая карточка — это идиома или устойчивое выражение с переводом, объяснением и примерами использования.
                  </div>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    maxHeight: '260px',
                    overflowY: 'auto',
                  }}>
                    {idioms.map((idiom, idx) => (
                      <div
                        key={`${idiom.phrase}-${idx}`}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '10px',
                          background: 'rgba(15, 23, 42, 0.7)',
                          border: '1px solid rgba(148, 163, 184, 0.4)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <div style={{ fontSize: '15px', fontWeight: 700, flex: 1 }}>
                            {idiom.phrase}
                          </div>
                          <button
                            onClick={() => synthesizeIdiomAudio(idiom.phrase)}
                            disabled={synthesizingIdiom === idiom.phrase.trim().toLowerCase()}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              border: '1px solid rgba(82,82,91,0.9)',
                              background: synthesizingIdiom === idiom.phrase.trim().toLowerCase() 
                                ? 'rgba(24,24,27,0.95)' 
                                : 'rgba(103,199,163,0.9)',
                              color: synthesizingIdiom === idiom.phrase.trim().toLowerCase() 
                                ? 'rgba(148,163,184,0.9)' 
                                : '#e5e7eb',
                              fontSize: '11px',
                              cursor: synthesizingIdiom === idiom.phrase.trim().toLowerCase() 
                                ? 'default' 
                                : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              opacity: synthesizingIdiom === idiom.phrase.trim().toLowerCase() ? 0.7 : 1,
                              transition: 'all 0.2s',
                            }}
                            title={
                              synthesizingIdiom === idiom.phrase.trim().toLowerCase()
                                ? 'Синтез произношения...'
                                : 'Синтезировать и воспроизвести произношение'
                            }
                          >
                            {synthesizingIdiom === idiom.phrase.trim().toLowerCase() ? (
                              <>🔊 Синтез...</>
                            ) : (
                              <>🔊</>
                            )}
                          </button>
                        </div>
                        {idiom.meaning && (
                          <div style={{ fontSize: '13px', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 600, color: 'rgba(248, 250, 252, 0.9)' }}>Смысл: </span>
                            <span>{idiom.meaning}</span>
                          </div>
                        )}
                        {idiom.literal_translation && (
                          <div style={{ fontSize: '12px', marginBottom: '4px', color: 'rgba(148, 163, 184, 0.95)' }}>
                            Дословно: {idiom.literal_translation}
                          </div>
                        )}
                        {idiom.usage_examples && idiom.usage_examples.length > 0 && (
                          <div style={{ marginTop: '4px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '2px' }}>
                              Примеры:
                            </div>
                            <ul style={{ paddingLeft: '18px', margin: 0, fontSize: '12px' }}>
                              {idiom.usage_examples.slice(0, 3).map((ex, exIdx) => (
                                <li key={exIdx} style={{ marginBottom: '2px' }}>
                                  {ex}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div style={{ marginTop: '6px' }}>
                          <button
                            onClick={() => handleAddIdiomToVocabulary(idiom.phrase, idiom.usage_examples?.[0])}
                            disabled={addingIdiom === idiom.phrase}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 999,
                              border: 'none',
                              background: addingIdiom === idiom.phrase ? 'rgba(139, 92, 246, 0.5)' : '#8b5cf6',
                              color: 'white',
                              cursor: addingIdiom === idiom.phrase ? 'default' : 'pointer',
                              fontSize: '12px',
                              fontWeight: 600,
                            }}
                          >
                            {addingIdiom === idiom.phrase ? 'Добавлено' : 'Добавить в словарь'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}


                {selectedVideo.transcription_segments && selectedVideo.transcription_segments.length > 0 && (
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
                      Сегменты с временными метками
                    </div>
                    <div style={{
                      background: 'rgba(0, 0, 0, 0.2)',
                      padding: '15px',
                      borderRadius: '8px',
                      maxHeight: '300px',
                      overflowY: 'auto'
                    }}>
                      {selectedVideo.transcription_segments.map((segment, idx) => (
                        <div key={idx} style={{ marginBottom: '10px', fontSize: '13px' }}>
                          <div style={{ color: 'rgba(255, 255, 255, 0.6)', marginBottom: '3px' }}>
                            {Math.floor(segment.start)}s - {Math.floor(segment.end)}s
                          </div>
                          <div>{segment.text}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255, 255, 255, 0.7)' }}>
                <p>Выберите видео из списка, чтобы просмотреть детали</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
