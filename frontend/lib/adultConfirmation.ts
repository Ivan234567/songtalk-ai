import { supabase } from '@/lib/supabase'

export const ADULT_POLICY_VERSION = 'adult-consent-v1'
export const ADULT_CONFIRMATION_TEXT =
  'Я подтверждаю, что мне исполнилось 18 лет и я понимаю, что в режиме 18+ может использоваться нецензурная лексика.'

const ADULT_CACHE_KEY = `adult_confirmed:${ADULT_POLICY_VERSION}`

function showAdultConfirmationModal(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(false)
  }

  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.setAttribute('role', 'presentation')
    overlay.style.position = 'fixed'
    overlay.style.inset = '0'
    overlay.style.zIndex = '2000'
    overlay.style.display = 'flex'
    overlay.style.alignItems = 'center'
    overlay.style.justifyContent = 'center'
    overlay.style.padding = '1.25rem'
    overlay.style.background = 'rgba(0, 0, 0, 0.56)'
    overlay.style.backdropFilter = 'blur(4px)'

    const modal = document.createElement('div')
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')
    modal.setAttribute('aria-label', 'Подтверждение 18+')
    modal.style.width = '100%'
    modal.style.maxWidth = '460px'
    modal.style.borderRadius = '16px'
    modal.style.border = '1px solid var(--sidebar-border)'
    modal.style.background = 'var(--sidebar-bg)'
    modal.style.boxShadow = '0 24px 48px rgba(0, 0, 0, 0.32)'
    modal.style.color = 'var(--sidebar-text)'
    modal.style.overflow = 'hidden'

    const body = document.createElement('div')
    body.style.padding = '1.25rem 1.25rem 1rem'

    const title = document.createElement('h3')
    title.textContent = 'Контент 18+'
    title.style.margin = '0 0 0.5rem'
    title.style.fontSize = '1.125rem'
    title.style.fontWeight = '700'

    const text = document.createElement('p')
    text.textContent = 'В этом режиме может использоваться нецензурная лексика. Подтвердите, что вам исполнилось 18 лет.'
    text.style.margin = '0'
    text.style.fontSize = '0.9375rem'
    text.style.lineHeight = '1.45'
    text.style.opacity = '0.88'

    const footer = document.createElement('div')
    footer.style.display = 'flex'
    footer.style.justifyContent = 'flex-end'
    footer.style.gap = '0.625rem'
    footer.style.padding = '0.95rem 1.25rem 1.25rem'
    footer.style.borderTop = '1px solid var(--sidebar-border)'
    footer.style.background = 'var(--sidebar-hover)'

    const cancelBtn = document.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.textContent = 'Отмена'
    cancelBtn.style.height = '38px'
    cancelBtn.style.padding = '0 0.95rem'
    cancelBtn.style.borderRadius = '10px'
    cancelBtn.style.border = '1px solid var(--sidebar-border)'
    cancelBtn.style.background = 'var(--sidebar-bg)'
    cancelBtn.style.color = 'var(--sidebar-text)'
    cancelBtn.style.fontSize = '0.875rem'
    cancelBtn.style.fontWeight = '600'
    cancelBtn.style.cursor = 'pointer'

    const confirmBtn = document.createElement('button')
    confirmBtn.type = 'button'
    confirmBtn.textContent = 'Мне есть 18'
    confirmBtn.style.height = '38px'
    confirmBtn.style.padding = '0 1rem'
    confirmBtn.style.borderRadius = '10px'
    confirmBtn.style.border = '1px solid rgba(104, 201, 149, 0.5)'
    confirmBtn.style.background = 'linear-gradient(145deg, rgba(104, 201, 149, 0.28), rgba(70, 175, 125, 0.22))'
    confirmBtn.style.color = 'var(--sidebar-text)'
    confirmBtn.style.fontSize = '0.875rem'
    confirmBtn.style.fontWeight = '700'
    confirmBtn.style.cursor = 'pointer'

    body.appendChild(title)
    body.appendChild(text)
    footer.appendChild(cancelBtn)
    footer.appendChild(confirmBtn)
    modal.appendChild(body)
    modal.appendChild(footer)
    overlay.appendChild(modal)
    document.body.appendChild(overlay)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    let settled = false
    const close = (accepted: boolean) => {
      if (settled) return
      settled = true
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      overlay.remove()
      resolve(accepted)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close(false)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false)
    })
    cancelBtn.addEventListener('click', () => close(false))
    confirmBtn.addEventListener('click', () => close(true))

    confirmBtn.focus()
  })
}

function readLocalConfirmation(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(ADULT_CACHE_KEY) === '1'
}

function writeLocalConfirmation(): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ADULT_CACHE_KEY, '1')
}

export async function hasAdultConfirmation(): Promise<boolean> {
  if (readLocalConfirmation()) return true

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user?.id) return false

  const { data, error } = await supabase
    .from('user_adult_confirmations')
    .select('id')
    .eq('user_id', userData.user.id)
    .eq('policy_version', ADULT_POLICY_VERSION)
    .limit(1)

  const confirmed = !error && Array.isArray(data) && data.length > 0
  if (confirmed) writeLocalConfirmation()
  return confirmed
}

export async function ensureAdultConfirmation(source: string): Promise<boolean> {
  if (await hasAdultConfirmation()) return true
  if (typeof window === 'undefined') return false

  const accepted = await showAdultConfirmationModal()
  if (!accepted) return false

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user?.id) return false

  const { error } = await supabase.from('user_adult_confirmations').insert({
    user_id: userData.user.id,
    policy_version: ADULT_POLICY_VERSION,
    confirmation_text: ADULT_CONFIRMATION_TEXT,
    source,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  })

  // If duplicate already exists (same user + policy), treat as success.
  if (error && error.code !== '23505') return false

  writeLocalConfirmation()
  return true
}
