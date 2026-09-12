const YANDEX_CLIENT_ID =
  process.env.YANDEX_CLIENT_ID ||
  process.env.NEXT_PUBLIC_YANDEX_CLIENT_ID ||
  '78b55a850b524bcfb4899f22062fa7b2'

const YANDEX_REDIRECT_URI =
  process.env.YANDEX_REDIRECT_URI ||
  process.env.NEXT_PUBLIC_YANDEX_REDIRECT_URI ||
  'https://speakeasy-voice.vercel.app/auth/yandex/callback'

const YANDEX_TOKEN_URL = 'https://oauth.yandex.ru/token'
const YANDEX_USERINFO_URL = 'https://login.yandex.ru/info?format=json'

function pickYandexEmail(info) {
  const fromDefault = typeof info?.default_email === 'string' ? info.default_email.trim() : ''
  if (fromDefault) return fromDefault.toLowerCase()
  const emails = Array.isArray(info?.emails) ? info.emails : []
  const first = emails.find((item) => typeof item === 'string' && item.trim())
  return first ? first.trim().toLowerCase() : ''
}

function yandexAvatarUrl(info) {
  if (!info?.default_avatar_id || info.is_avatar_empty) return null
  return `https://avatars.yandex.net/get-yapic/${info.default_avatar_id}/islands-200`
}

async function findUserIdByEmail(supabase, email) {
  const { data, error } = await supabase.rpc('get_user_id_by_email', { p_email: email })
  if (error) {
    console.error('[auth/yandex] get_user_id_by_email failed:', error.message)
    return null
  }
  return typeof data === 'string' && data ? data : null
}

export function registerYandexAuthRoutes(app, { supabase, asyncHandler }) {
  app.post('/api/auth/yandex', asyncHandler(async (req, res) => {
    const clientSecret = process.env.YANDEX_CLIENT_SECRET
    if (!clientSecret) {
      console.error('[auth/yandex] YANDEX_CLIENT_SECRET is not configured')
      return res.status(500).json({ error: 'Яндекс OAuth не настроен на сервере' })
    }

    const { code, code_verifier: codeVerifier } = req.body || {}
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'code is required' })
    }
    if (!codeVerifier || typeof codeVerifier !== 'string') {
      return res.status(400).json({ error: 'code_verifier is required' })
    }

    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: YANDEX_CLIENT_ID,
      client_secret: clientSecret,
      code_verifier: codeVerifier,
      redirect_uri: YANDEX_REDIRECT_URI,
    })

    const tokenResp = await fetch(YANDEX_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    })
    const tokenJson = await tokenResp.json().catch(() => null)

    if (!tokenResp.ok || !tokenJson?.access_token) {
      console.error('[auth/yandex] token exchange failed:', tokenResp.status, tokenJson?.error)
      return res.status(401).json({
        error: 'Не удалось получить токен Яндекса. Попробуйте войти ещё раз.',
      })
    }

    const infoResp = await fetch(YANDEX_USERINFO_URL, {
      headers: { Authorization: `OAuth ${tokenJson.access_token}` },
    })
    const info = await infoResp.json().catch(() => null)

    if (!infoResp.ok || !info) {
      console.error('[auth/yandex] userinfo failed:', infoResp.status)
      return res.status(401).json({ error: 'Не удалось получить профиль Яндекса' })
    }

    const email = pickYandexEmail(info)
    if (!email) {
      return res.status(400).json({
        error: 'Яндекс не вернул email. Разрешите приложению доступ к адресу почты и попробуйте снова.',
      })
    }

    const displayName = info.display_name || info.real_name || info.login || null
    const metadata = {
      yandex_id: info.id ? String(info.id) : null,
      full_name: displayName,
      name: displayName,
      avatar_url: yandexAvatarUrl(info),
      login: info.login || null,
    }

    let userId = await findUserIdByEmail(supabase, email)

    if (!userId) {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: metadata,
        app_metadata: { provider: 'yandex', providers: ['yandex'] },
      })

      if (createError || !created?.user?.id) {
        userId = await findUserIdByEmail(supabase, email)
        if (!userId) {
          console.error('[auth/yandex] createUser failed:', createError?.message)
          return res.status(500).json({ error: 'Не удалось создать аккаунт' })
        }
      } else {
        userId = created.user.id
      }
    } else {
      const { data: existing } = await supabase.auth.admin.getUserById(userId)
      const prevMeta = existing?.user?.user_metadata || {}
      const prevApp = existing?.user?.app_metadata || {}
      const providers = Array.isArray(prevApp.providers) ? [...prevApp.providers] : []
      if (!providers.includes('yandex')) providers.push('yandex')

      const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
        email_confirm: true,
        user_metadata: { ...prevMeta, ...metadata },
        app_metadata: {
          ...prevApp,
          provider: prevApp.provider || 'yandex',
          providers,
        },
      })
      if (updateError) {
        console.error('[auth/yandex] updateUserById failed:', updateError.message)
      }
    }

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })

    const hashedToken = linkData?.properties?.hashed_token
    if (linkError || !hashedToken) {
      console.error('[auth/yandex] generateLink failed:', linkError?.message)
      return res.status(500).json({ error: 'Не удалось создать сессию' })
    }

    return res.json({
      ok: true,
      hashed_token: hashedToken,
      verification_type: linkData.properties.verification_type || 'magiclink',
    })
  }))
}
