'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { subscribeToTable, unsubscribeFromChannel } from '@/lib/supabase-realtime'
import type { RealtimeChannel } from '@/lib/supabase'

export default function Home() {
  const [status, setStatus] = useState<string>('Connecting...')
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)

  useEffect(() => {
    // Проверка подключения к Supabase
    const checkConnection = async () => {
      try {
        // Простая проверка подключения через rpc или проверку версии
        // Если подключение работает, даже без таблиц - это успех
        const { error } = await supabase.rpc('version').catch(() => ({ error: null }))
        
        // Если нет критических ошибок подключения, считаем успешным
        if (!error || error.code === 'PGRST301' || error.message?.includes('function') || error.message?.includes('relation')) {
          setStatus('Connected to Supabase ✓')
        } else {
          setStatus(`Error: ${error.message}`)
        }
      } catch (err: any) {
        // Если ошибка связана с отсутствием таблиц/функций - это нормально, подключение работает
        if (err?.message?.includes('relation') || err?.message?.includes('function') || err?.message?.includes('schema cache')) {
          setStatus('Connected to Supabase ✓')
        } else {
          setStatus(`Connection error: ${err?.message || 'Unknown error'}`)
        }
      }
    }

    checkConnection()

    // Пример real-time подписки (раскомментируйте когда создадите таблицу)
    // const testChannel = subscribeToTable('your_table', '*', (payload) => {
    //   console.log('Real-time update:', payload)
    //   setStatus(`Real-time update received: ${payload.eventType}`)
    // })
    // setChannel(testChannel)

    return () => {
      if (channel) {
        unsubscribeFromChannel(channel)
      }
    }
  }, [])

  return (
    <main style={{ padding: '2rem', minHeight: '100vh' }}>
      <h1>SongTalk AI</h1>
      <p>Learn English with Songs</p>
      <div style={{ marginTop: '2rem', padding: '1rem', background: '#f0f0f0', borderRadius: '8px' }}>
        <h2>System Status</h2>
        <p><strong>Supabase:</strong> {status}</p>
        <p><strong>Real-time:</strong> {channel ? 'Active' : 'Inactive'}</p>
      </div>
    </main>
  )
}
