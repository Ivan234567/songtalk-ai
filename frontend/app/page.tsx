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
        // Проверяем подключение - если ошибка связана с отсутствием таблицы, это нормально
        const { error } = await supabase.from('_test').select('count').limit(1)
        
        // Если ошибка связана с отсутствием таблицы - это нормально, подключение работает
        if (error) {
          const errorMessage = error.message || ''
          const errorCode = error.code || ''
          
          // Коды ошибок, означающие что таблица не найдена (но подключение работает)
          if (errorCode === 'PGRST116' || 
              errorMessage.includes('relation') || 
              errorMessage.includes('schema cache') ||
              errorMessage.includes('Could not find')) {
            setStatus('Connected to Supabase ✓')
          } else {
            setStatus(`Error: ${error.message}`)
          }
        } else {
          setStatus('Connected to Supabase ✓')
        }
      } catch (err: any) {
        // Если ошибка связана с отсутствием таблиц - это нормально, подключение работает
        const errorMsg = err?.message || String(err)
        if (errorMsg.includes('relation') || 
            errorMsg.includes('schema cache') ||
            errorMsg.includes('Could not find')) {
          setStatus('Connected to Supabase ✓')
        } else {
          setStatus(`Connection error: ${errorMsg}`)
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
