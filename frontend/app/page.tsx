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
        const { data, error } = await supabase.from('_test').select('count').limit(1)
        if (error && error.code !== 'PGRST116') {
          setStatus(`Error: ${error.message}`)
        } else {
          setStatus('Connected to Supabase ✓')
        }
      } catch (err) {
        setStatus(`Connection error: ${err}`)
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
