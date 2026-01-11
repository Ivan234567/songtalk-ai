'use client'

import { useState } from 'react'
import { useRealtimeTable } from '@/hooks/useRealtime'
import { supabase } from '@/lib/supabase'

/**
 * Пример страницы с real-time подпиской
 * Замените 'test_table' на название вашей таблицы в Supabase
 */
export default function RealtimeExamplePage() {
  const [tableName, setTableName] = useState('test_table')
  const [enabled, setEnabled] = useState(false)
  
  const { lastUpdate, isConnected } = useRealtimeTable(
    tableName,
    '*',
    enabled
  )

  const handleTestInsert = async () => {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .insert({ 
          // Замените на поля вашей таблицы
          name: `Test ${Date.now()}`,
          created_at: new Date().toISOString()
        })
        .select()

      if (error) throw error
      console.log('Inserted:', data)
    } catch (error) {
      console.error('Error inserting:', error)
    }
  }

  return (
    <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Real-time Example</h1>
      
      <div style={{ marginTop: '2rem', padding: '1rem', background: '#f0f0f0', borderRadius: '8px' }}>
        <div style={{ marginBottom: '1rem' }}>
          <label>
            Table Name:
            <input
              type="text"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              style={{ marginLeft: '0.5rem', padding: '0.5rem' }}
            />
          </label>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              style={{ marginRight: '0.5rem' }}
            />
            Enable Real-time Subscription
          </label>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <p><strong>Status:</strong> {isConnected ? '🟢 Connected' : '🔴 Disconnected'}</p>
        </div>

        <button
          onClick={handleTestInsert}
          style={{
            padding: '0.5rem 1rem',
            background: '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Test Insert (trigger real-time update)
        </button>
      </div>

      {lastUpdate && (
        <div style={{ marginTop: '2rem', padding: '1rem', background: '#e8f5e9', borderRadius: '8px' }}>
          <h2>Last Update:</h2>
          <pre style={{ background: '#fff', padding: '1rem', borderRadius: '4px', overflow: 'auto' }}>
            {JSON.stringify(lastUpdate, null, 2)}
          </pre>
        </div>
      )}
    </main>
  )
}
