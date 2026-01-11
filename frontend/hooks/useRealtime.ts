import { useEffect, useState, useCallback } from 'react'
import { subscribeToTable, subscribeToRecord, unsubscribeFromChannel } from '@/lib/supabase-realtime'
import type { RealtimeChannel } from '@/lib/supabase'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

/**
 * Хук для подписки на real-time изменения таблицы
 */
export function useRealtimeTable<T = any>(
  tableName: string,
  filter: string = '*',
  enabled: boolean = true
) {
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)
  const [lastUpdate, setLastUpdate] = useState<RealtimePostgresChangesPayload<T> | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!enabled || !tableName) return

    const ch = subscribeToTable<T>(tableName, filter, (payload) => {
      setLastUpdate(payload)
      setIsConnected(true)
    })

    setChannel(ch)

    return () => {
      if (ch) {
        unsubscribeFromChannel(ch)
        setIsConnected(false)
      }
    }
  }, [tableName, filter, enabled])

  return {
    channel,
    lastUpdate,
    isConnected,
    unsubscribe: useCallback(() => {
      if (channel) {
        unsubscribeFromChannel(channel)
        setChannel(null)
        setIsConnected(false)
      }
    }, [channel])
  }
}

/**
 * Хук для подписки на real-time изменения конкретной записи
 */
export function useRealtimeRecord<T = any>(
  tableName: string,
  recordId: string | null,
  enabled: boolean = true
) {
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)
  const [lastUpdate, setLastUpdate] = useState<RealtimePostgresChangesPayload<T> | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!enabled || !tableName || !recordId) return

    const ch = subscribeToRecord<T>(tableName, recordId, (payload) => {
      setLastUpdate(payload)
      setIsConnected(true)
    })

    setChannel(ch)

    return () => {
      if (ch) {
        unsubscribeFromChannel(ch)
        setIsConnected(false)
      }
    }
  }, [tableName, recordId, enabled])

  return {
    channel,
    lastUpdate,
    isConnected,
    unsubscribe: useCallback(() => {
      if (channel) {
        unsubscribeFromChannel(channel)
        setChannel(null)
        setIsConnected(false)
      }
    }, [channel])
  }
}
