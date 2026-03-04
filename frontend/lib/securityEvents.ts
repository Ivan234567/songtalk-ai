import { supabase } from '@/lib/supabase'

export type SecurityEventType =
  | 'login'
  | 'logout'
  | 'password_change'
  | 'password_reset_request'
  | 'email_change'

export interface SecurityEventRow {
  id: string
  event_type: SecurityEventType
  metadata: Record<string, unknown> | null
  created_at: string
}

export async function logSecurityEvent(
  eventType: SecurityEventType,
  metadata?: Record<string, unknown> | null,
): Promise<boolean> {
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user?.id) return false

    const { error } = await supabase.from('user_security_events').insert({
      user_id: userData.user.id,
      event_type: eventType,
      metadata: metadata ?? null,
    })

    return !error
  } catch {
    return false
  }
}

export async function fetchSecurityEvents(limit = 20): Promise<SecurityEventRow[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 100)
  const { data, error } = await supabase
    .from('user_security_events')
    .select('id, event_type, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(safeLimit)

  if (error || !Array.isArray(data)) return []
  return data as SecurityEventRow[]
}
