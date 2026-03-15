import { createClient } from '@supabase/supabase-js'

/**
 * Серверный Supabase клиент для real-time операций
 */
export function createSupabaseRealtimeClient(supabaseUrl, supabaseKey) {
  const supabase = createClient(supabaseUrl, supabaseKey, {
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  })

  /**
   * Подписка на изменения таблицы (серверная сторона)
   */
  function subscribeToTable(tableName, callback) {
    const channel = supabase
      .channel(`${tableName}_server_changes`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tableName,
        },
        (payload) => {
          console.log(`[Real-time] ${tableName}:`, payload.eventType)
          callback(payload)
        }
      )
      .subscribe()

    return channel
  }

  return {
    supabase,
    subscribeToTable
  }
}
