import { supabase, type RealtimeChannel } from './supabase'
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

/**
 * Создает real-time подписку на изменения в таблице
 */
export function subscribeToTable<T = any>(
  tableName: string,
  filter: string = '*',
  callback: (payload: RealtimePostgresChangesPayload<T>) => void
): RealtimeChannel {
  const channel = supabase
    .channel(`${tableName}_changes`)
    .on(
      'postgres_changes',
      {
        event: '*', // INSERT, UPDATE, DELETE
        schema: 'public',
        table: tableName,
        filter: filter,
      },
      callback
    )
    .subscribe()

  return channel
}

/**
 * Отписывается от real-time канала
 */
export function unsubscribeFromChannel(channel: RealtimeChannel) {
  supabase.removeChannel(channel)
}

/**
 * Подписка на изменения конкретной записи по ID
 */
export function subscribeToRecord<T = any>(
  tableName: string,
  recordId: string,
  callback: (payload: RealtimePostgresChangesPayload<T>) => void
): RealtimeChannel {
  return subscribeToTable<T>(
    tableName,
    `id=eq.${recordId}`,
    callback
  )
}
