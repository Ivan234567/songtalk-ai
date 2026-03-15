import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import http from 'http'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import dns from 'node:dns'
import multer from 'multer'
import jwt from 'jsonwebtoken'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { Readable } from 'stream'
import { transcribe as sttTranscribe } from './stt.js'
import { synthesize as ttsSynthesize } from './tts.js'
import { getBalance, deductBalance, topupBalance, BALANCE_THRESHOLD_RUB } from './balance.js'
import { getCost } from './balance-rates.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Загружаем переменные окружения (на Vercel переменные задаются в панели, .env не нужен)
if (!process.env.VERCEL) {
  dotenv.config({ path: path.join(__dirname, '..', '.env') })
}

// Prefer IPv4 on hosts where IPv6 connectivity is flaky (common cause of UND_ERR_CONNECT_TIMEOUT)
dns.setDefaultResultOrder('ipv4first')

const app = express()
const PORT = process.env.PORT || 3001

// Увеличиваем таймаут для Express сервера (для длительных AI запросов до 15 минут)
// По умолчанию Express имеет таймаут 2 минуты, что недостаточно для AITUNNEL
const SERVER_TIMEOUT_MS = Number.parseInt(process.env.SERVER_TIMEOUT_MS || '900000', 10) // 15 минут по умолчанию

// Middleware
// Разрешаем несколько origins для CORS (разные домены Vercel)
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'https://songtalk-ai-frontend-ivans-projects-bf7082bb.vercel.app',
  'https://songtalk-ai-qt84.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://localhost:3005',
].filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    // Разрешаем запросы без origin (например, Postman, curl)
    if (!origin) return callback(null, true)

    // Проверяем, есть ли origin в списке разрешенных
    if (allowedOrigins.some(allowed => origin.startsWith(allowed))) {
      callback(null, true)
    } else {
      // Также разрешаем все поддомены vercel.app для preview деплоев
      if (origin.includes('.vercel.app')) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Type', 'Authorization']
}))
app.use(express.json({ limit: '1mb' }))

// На Vercel нет постоянной файловой системы — используем memory storage для загрузок
const isVercel = Boolean(process.env.VERCEL)
const multerStorage = isVercel ? multer.memoryStorage() : { dest: 'uploads/' }

const upload = multer({
  storage: multerStorage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for video files
  },
  fileFilter: (req, file, cb) => {
    // Accept audio and video files
    const audioMimeTypes = [
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm',
      'audio/ogg', 'audio/m4a', 'audio/aac', 'audio/flac'
    ]
    const videoMimeTypes = [
      'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
      'video/x-msvideo', 'video/x-matroska'
    ]
    const allMimeTypes = [...audioMimeTypes, ...videoMimeTypes]
    const allExtensions = /\.(mp3|wav|webm|ogg|m4a|aac|flac|mp4|mov|avi|mkv)$/i

    if (allMimeTypes.includes(file.mimetype) || file.originalname.match(allExtensions)) {
      cb(null, true)
    } else {
      cb(new Error('Only audio and video files are allowed'))
    }
  }
})

// Ensure uploads directory exists (only when not on Vercel)
const uploadsDir = isVercel ? '/tmp' : path.join(__dirname, '..', 'uploads')
if (!isVercel && !fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

/** На Vercel req.file приходит из memory storage (buffer). Возвращаем путь к файлу: либо req.file.path, либо записываем buffer в /tmp. */
function getUploadPath(req) {
  if (!req?.file) return null
  if (req.file.path) return req.file.path
  if (req.file.buffer && isVercel) {
    const ext = (req.file.originalname && path.extname(req.file.originalname)) || '.bin'
    const tmpPath = path.join('/tmp', `upload-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`)
    fs.writeFileSync(tmpPath, req.file.buffer)
    return tmpPath
  }
  return null
}

const execAsync = promisify(exec)

// Backend JWT configuration (independent of Supabase)
const BACKEND_JWT_SECRET = process.env.BACKEND_JWT_SECRET
const BACKEND_JWT_EXPIRES_IN = process.env.BACKEND_JWT_EXPIRES_IN || '7d'

if (!BACKEND_JWT_SECRET) {
  console.warn('[Auth] BACKEND_JWT_SECRET is not set. Backend-issued JWT will not be available.')
}

/**
 * Sign backend JWT for a given user.
 * Payload is intentionally simple to keep tokens small and stable.
 */
function signBackendJwt(user) {
  if (!BACKEND_JWT_SECRET) {
    throw new Error('BACKEND_JWT_SECRET is not configured')
  }

  const payload = {
    // Use stable identifiers from Supabase user
    sub: user.id,
    email: user.email,
    // place for future subscription/plan data if needed
  }

  return jwt.sign(payload, BACKEND_JWT_SECRET, {
    expiresIn: BACKEND_JWT_EXPIRES_IN,
  })
}

/**
 * Verify backend JWT from Authorization: Bearer <token>
 * Returns decoded payload or null on any error.
 */
function verifyBackendJwt(rawToken) {
  if (!BACKEND_JWT_SECRET || !rawToken) return null

  try {
    const decoded = jwt.verify(rawToken, BACKEND_JWT_SECRET)
    return decoded
  } catch (err) {
    return null
  }
}


// Инициализация Supabase клиента
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

// Create Supabase client with timeout configuration
// Note: Supabase uses undici internally, timeout is handled at network level
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

// Инициализация AITUNNEL (OpenAI-compatible)
const AITUNNEL_BASE_URL = process.env.AITUNNEL_BASE_URL || 'https://api.aitunnel.ru/v1/'
const AITUNNEL_API_KEY = process.env.AITUNNEL_API_KEY
const AITUNNEL_MODEL = process.env.AITUNNEL_MODEL || 'gpt-4o'
// Увеличенный таймаут для долгих запросов (анализ текста на идиомы и т.п.)
// По умолчанию 900 секунд (15 минут), можно переопределить через переменную окружения AITUNNEL_TIMEOUT_MS
const AITUNNEL_TIMEOUT_MS = Number.parseInt(process.env.AITUNNEL_TIMEOUT_MS || '900000', 10)
// Отдельный таймаут для STT запросов (транскрипция аудио может быть очень долгой для больших файлов)
// По умолчанию 1800 секунд (30 минут), можно переопределить через переменную окружения AITUNNEL_STT_TIMEOUT_MS
const AITUNNEL_STT_TIMEOUT_MS = Number.parseInt(process.env.AITUNNEL_STT_TIMEOUT_MS || '1800000', 10)
const AITUNNEL_MAX_RETRIES = Number.parseInt(process.env.AITUNNEL_MAX_RETRIES || '1', 10)
const AITUNNEL_STT_MODEL = process.env.AITUNNEL_STT_MODEL || 'whisper-1'
const AITUNNEL_TTS_MODEL = process.env.AITUNNEL_TTS_MODEL || 'gpt-4o-mini-tts'

if (!AITUNNEL_API_KEY) {
  console.error('Missing AITUNNEL_API_KEY environment variable')
  process.exit(1)
}

// Логируем конфигурацию AITUNNEL при запуске
console.log('🔧 AITUNNEL configuration loaded:')
console.log(`   Base URL: ${AITUNNEL_BASE_URL}`)
console.log(`   Model: ${AITUNNEL_MODEL}`)
console.log(`   Timeout: ${AITUNNEL_TIMEOUT_MS / 1000} seconds (${AITUNNEL_TIMEOUT_MS / 60000} minutes)`)
console.log(`   STT Timeout: ${AITUNNEL_STT_TIMEOUT_MS / 1000} seconds (${AITUNNEL_STT_TIMEOUT_MS / 60000} minutes)`)
console.log(`   Max Retries: ${AITUNNEL_MAX_RETRIES}`)
console.log(`   API Key: ${AITUNNEL_API_KEY.substring(0, 20)}...`)

// Основной клиент для обычных запросов
const llm = new OpenAI({
  apiKey: AITUNNEL_API_KEY,
  baseURL: AITUNNEL_BASE_URL,
  timeout: Number.isFinite(AITUNNEL_TIMEOUT_MS) ? AITUNNEL_TIMEOUT_MS : 60000,
  maxRetries: Number.isFinite(AITUNNEL_MAX_RETRIES) ? AITUNNEL_MAX_RETRIES : 1,
})

function normalizeAitunnelError(err) {
  const e = err || {}
  const cause = e.cause || {}
  return {
    name: e.name,
    message: e.message,
    code: e.code || cause.code,
    type: e.type,
    status: e.status,
  }
}

function getBearerToken(req) {
  const raw = req.headers.authorization || ''
  const [type, token] = raw.split(' ')
  if (type?.toLowerCase() !== 'bearer' || !token) return null
  return token
}

/**
 * Resolve user id from request: backend JWT or Supabase token.
 * @returns {Promise<string|null>} user id or null
 */
async function resolveUserId(req) {
  const rawToken = getBearerToken(req)
  if (!rawToken) return null
  const decoded = verifyBackendJwt(rawToken)
  if (decoded?.sub) return decoded.sub
  const result = await Promise.resolve(supabase.auth.getUser(rawToken)).catch(() => ({ data: { user: null } }))
  return result?.data?.user?.id ?? null
}

// Helper function to safely call Supabase with timeout and retry
async function safeSupabaseCall(callFn, options = {}) {
  const maxRetries = options.maxRetries || 2
  const timeoutMs = options.timeoutMs || 20000 // 20 seconds default (increased from 10s)
  const retryDelayMs = options.retryDelayMs || 1000

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Supabase call timeout after ${timeoutMs}ms`))
        }, timeoutMs)
      })

      // Race between the actual call and timeout
      const result = await Promise.race([
        callFn(),
        timeoutPromise
      ])

      return result
    } catch (error) {
      const errorCode = error?.cause?.code || error?.code
      const isTimeout = errorCode === 'UND_ERR_CONNECT_TIMEOUT' ||
        errorCode === 'ETIMEDOUT' ||
        errorCode === 'ECONNRESET' ||
        error.message?.includes('timeout') ||
        error.message?.toLowerCase?.().includes('fetch failed')

      // If it's the last attempt or not a timeout/connection error, throw
      if (attempt === maxRetries || !isTimeout) {
        throw error
      }

      // Wait before retry
      if (attempt < maxRetries) {
        console.log(`[Supabase] Retry attempt ${attempt + 1}/${maxRetries} after ${retryDelayMs}ms...`)
        await new Promise(resolve => setTimeout(resolve, retryDelayMs))
      }
    }
  }
}

// Async error wrapper helper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => {
    // Log error before passing to error handler
    console.error('[asyncHandler] Caught error:', {
      message: err.message,
      code: err?.cause?.code || err?.code,
      path: req.path
    })
    next(err)
  })
}

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Backend API',
    version: '0.1.0',
    endpoints: [
      '/health',
      '/api/ping',
      '/api/chat',
      '/api/transcribe',
      '/api/tts',
      '/api/agent/stt',
      '/api/agent/tts',
      '/api/karaoke/transcribe',
      '/api/videos',
      '/api/videos/:id',
      '/api/vocabulary/extract',
      '/api/vocabulary/define',
      '/api/vocabulary/add',
      '/api/vocabulary/list',
      '/api/vocabulary/review-list',
      '/api/vocabulary/review'
    ]
  })
})

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    supabase: supabaseUrl ? 'configured' : 'missing'
  })
})

// Minimal API route
app.get('/api/ping', async (req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
  })
})

// Balance (monetization) — requires auth
app.get('/api/balance', asyncHandler(async (req, res) => {
  const userId = await resolveUserId(req)
  if (!userId) {
    return res.status(401).json({ error: 'Missing or invalid Authorization' })
  }
  const balance_rub = await getBalance(supabase, userId)
  return res.json({ balance_rub })
}))

// Balance transactions history — requires auth
app.get('/api/balance/transactions', asyncHandler(async (req, res) => {
  const userId = await resolveUserId(req)
  if (!userId) {
    return res.status(401).json({ error: 'Missing or invalid Authorization' })
  }
  const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 50), 500)
  const type = req.query.type // optional: usage, topup_manual, topup_gateway
  const fromDate = req.query.from // optional ISO date
  const toDate = req.query.to // optional ISO date

  let query = supabase
    .from('balance_transactions')
    .select('id, amount_rub, type, service, metadata, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (type) query = query.eq('type', type)
  if (fromDate) query = query.gte('created_at', fromDate)
  if (toDate) query = query.lte('created_at', toDate)

  const { data, error } = await query
  if (error) throw error
  return res.json(data || [])
}))

// Admin: manual balance topup (no gateway). Requires ADMIN_BALANCE_SECRET in header X-Admin-Key or Authorization: Bearer <secret>.
const ADMIN_BALANCE_SECRET = process.env.ADMIN_BALANCE_SECRET
const MIN_TOPUP_RUB = 300

app.post('/api/admin/balance/topup', asyncHandler(async (req, res) => {
  const rawToken = getBearerToken(req)
  const adminKey = req.headers['x-admin-key']
  const secret = typeof adminKey === 'string' ? adminKey : rawToken
  if (!ADMIN_BALANCE_SECRET || secret !== ADMIN_BALANCE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const { user_id, email, amount_rub, comment } = req.body || {}
  let userId = typeof user_id === 'string' ? user_id.trim() : null
  if (!userId && typeof email === 'string' && email.trim()) {
    const { data: idRow, error: rpcError } = await supabase.rpc('get_user_id_by_email', { p_email: email.trim() })
    if (rpcError) throw rpcError
    userId = idRow || null
  }
  if (!userId) {
    return res.status(400).json({ error: 'Provide user_id or email' })
  }

  const amount = Number(amount_rub)
  if (!Number.isFinite(amount) || amount < MIN_TOPUP_RUB) {
    return res.status(400).json({ error: `amount_rub must be at least ${MIN_TOPUP_RUB}` })
  }

  const metadata = typeof comment === 'string' && comment.trim() ? { comment: comment.trim() } : null
  const result = await topupBalance(supabase, userId, amount, 'topup_manual', metadata)
  if (!result.ok) {
    return res.status(500).json({ error: result.error || 'Topup failed' })
  }
  return res.json({ ok: true, new_balance: result.newBalance })
}))

// Exchange Supabase access token for backend JWT
// Expected body: { supabase_token: string }
// This endpoint is called rarely (при логине/обновлении сессии),
// а все дальнейшие запросы (например, /api/chat) используют только backend JWT.
app.post('/api/auth/exchange-supabase-token', asyncHandler(async (req, res) => {
  const { supabase_token } = req.body || {}

  if (!supabase_token || typeof supabase_token !== 'string') {
    return res.status(400).json({ error: 'supabase_token is required' })
  }

  if (!BACKEND_JWT_SECRET) {
    console.error('[auth/exchange] BACKEND_JWT_SECRET is not configured')
    return res.status(500).json({ error: 'Backend JWT is not configured' })
  }

  try {
    // Один запрос к Supabase для проверки токена и получения данных пользователя
    const result = await safeSupabaseCall(
      () => supabase.auth.getUser(supabase_token),
      { timeoutMs: 15000, maxRetries: 1 }
    )

    const userData = result?.data
    const userErr = result?.error

    if (userErr || !userData?.user) {
      console.error('[auth/exchange] Supabase auth error:', {
        message: userErr?.message,
        status: userErr?.status,
        name: userErr?.name,
      })
      return res.status(401).json({ error: 'Invalid or expired Supabase token' })
    }

    const user = userData.user

    // Подписываем собственный JWT
    const backendToken = signBackendJwt({
      id: user.id,
      email: user.email,
    })

    return res.json({
      ok: true,
      token: backendToken,
      user: {
        id: user.id,
        email: user.email,
      },
    })
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    // Специальная обработка таймаутов Supabase
    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      console.error('[auth/exchange] Supabase connection timeout:', {
        code: errorCode,
        message: errorMessage,
        address: authError?.cause?.address || 'unknown'
      })
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения). Попробуйте позже.',
        details: {
          code: errorCode,
          message: errorMessage
        }
      })
    }

    console.error('[auth/exchange] Unexpected error:', {
      message: errorMessage,
      code: errorCode,
      cause: authError?.cause,
    })

    return res.status(500).json({ error: 'Internal server error' })
  }
}))

// Chat endpoint (AITUNNEL proxy) — requires backend JWT (independent of Supabase availability)
app.post('/api/chat', asyncHandler(async (req, res) => {
  try {
    const rawToken = getBearerToken(req)
    if (!rawToken) {
      return res.status(401).json({ error: 'Missing Authorization Bearer token' })
    }

    const decoded = verifyBackendJwt(rawToken)
    if (!decoded || !decoded.sub) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }
    const userId = decoded.sub

    const balance = await getBalance(supabase, userId)
    if (balance < BALANCE_THRESHOLD_RUB) {
      return res.status(402).json({ error: 'Пополните баланс' })
    }

    const { messages, max_tokens } = req.body || {}

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Body must include non-empty "messages" array' })
    }

    const chatResult = await llm.chat.completions.create({
      model: AITUNNEL_MODEL,
      messages,
      max_tokens: typeof max_tokens === 'number' ? max_tokens : 1500,
    })

    const usage = chatResult?.usage
    if (usage && (usage.input_tokens || usage.output_tokens)) {
      const costRub = getCost('deepseek-v3.2', usage)
      if (costRub > 0) {
        const deductResult = await deductBalance(supabase, userId, costRub, 'deepseek-v3.2', { api_chat: true })
        if (!deductResult.ok) {
          console.error('[api/chat] Deduct failed:', deductResult.error)
          return res.status(402).json({ error: 'Недостаточно средств. Пополните баланс.' })
        }
      }
    }

    const assistant = chatResult.choices?.[0]?.message
    return res.json({
      ok: true,
      assistant: assistant || null,
      usage: chatResult.usage || null,
      model: chatResult.model || AITUNNEL_MODEL,
    })
  } catch (err) {
    // Check error message for timeout FIRST (before logging)
    const errorMessage = err?.message || ''
    const errorCode = err?.cause?.code || err?.code || ''
    const errorName = err?.name || ''

    // Handle timeout errors (various formats) - check early to avoid unnecessary logging
    const isTimeout = (
      errorCode === 'UND_ERR_CONNECT_TIMEOUT' ||
      errorCode === 'UND_ERR_HEADERS_TIMEOUT' ||
      errorCode === 'ETIMEDOUT' ||
      errorMessage.toLowerCase().includes('timed out') ||
      errorMessage.toLowerCase().includes('request timed out') ||
      errorMessage.toLowerCase().includes('timeout') ||
      errorName === 'TimeoutError'
    )

    if (isTimeout) {
      // Check if it's from Supabase (shouldn't happen here, but just in case)
      if (errorMessage.includes('Supabase') || errorMessage.includes('supabase')) {
        console.error('[api/chat] Supabase timeout:', errorMessage)
        return res.status(502).json({
          error: 'Не удалось подключиться к Supabase (таймаут соединения). Проверьте SUPABASE_URL и сеть.',
          details: {
            code: errorCode,
            message: errorMessage
          }
        })
      }

      // Otherwise it's AITUNNEL timeout (log code: UND_ERR_CONNECT_TIMEOUT = не удалось установить соединение с api.aitunnel.ru)
      console.error('[api/chat] AITUNNEL timeout:', { code: errorCode, name: errorName, message: errorMessage })
      return res.status(502).json({
        error: 'Таймаут при обращении к провайдеру (AITUNNEL/DeepSeek). Сервис не ответил вовремя — возможны перегрузки на стороне провайдера. Попробуйте позже.',
        details: {
          code: errorCode,
          message: errorMessage,
          name: errorName
        }
      })
    }

    // Handle connection reset errors
    if (errorCode === 'ECONNRESET') {
      const details = normalizeAitunnelError(err)
      console.error('[api/chat] Connection reset:', details)
      return res.status(502).json({
        error: 'Соединение с провайдером (AITUNNEL/DeepSeek) было сброшено. Возможны временные проблемы на стороне провайдера — попробуйте позже.',
        details,
      })
    }

    // Log other errors
    const details = normalizeAitunnelError(err)
    console.error('[api/chat] error:', details)

    // Default error response
    return res.status(500).json({
      error: 'Chat request failed',
      details: {
        message: errorMessage,
        code: errorCode,
        name: errorName,
        type: details.type
      }
    })
  }
}))

// Whisper transcription endpoint — requires backend JWT (independent of Supabase availability)
// Использует AITunnel API вместо Python скриптов
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  let audioFilePath = null

  try {
    const rawToken = getBearerToken(req)
    if (!rawToken) {
      return res.status(401).json({ error: 'Missing Authorization Bearer token' })
    }

    // Use backend-issued JWT instead of calling Supabase on every request
    const decoded = verifyBackendJwt(rawToken)
    if (!decoded || !decoded.sub) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }
    const userId = decoded.sub

    const balance = await getBalance(supabase, userId)
    if (balance < BALANCE_THRESHOLD_RUB) {
      return res.status(402).json({ error: 'Пополните баланс' })
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No audio or video file provided' })
    }

    audioFilePath = getUploadPath(req)

    // Проверяем, что файл существует и не пустой
    if (!fs.existsSync(audioFilePath)) {
      return res.status(400).json({ error: 'Audio file not found on server' })
    }
    const stats = fs.statSync(audioFilePath)
    if (stats.size === 0) {
      return res.status(400).json({ error: 'Audio file is empty' })
    }

    // Определяем расширение файла на основе mimetype или оригинального имени
    let fileName = req.file.originalname
    if (!fileName || !fileName.includes('.')) {
      const extMap = {
        'audio/webm': 'webm',
        'audio/mpeg': 'mp3',
        'audio/mp3': 'mp3',
        'audio/wav': 'wav',
        'audio/x-wav': 'wav',
        'audio/ogg': 'ogg',
        'audio/m4a': 'm4a',
        'audio/mp4': 'm4a',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'video/quicktime': 'mov'
      }
      const ext = extMap[req.file.mimetype] || 'webm'
      fileName = `audio.${ext}`
    }
    const ext = path.extname(fileName).slice(1) || 'webm'

    // API определяет формат по имени файла. Multer сохраняет без расширения —
    // переименовываем файл, чтобы путь заканчивался на .webm/.mp3 и т.д.
    if (!audioFilePath.toLowerCase().endsWith(`.${ext}`)) {
      const pathWithExt = `${audioFilePath}.${ext}`
      fs.renameSync(audioFilePath, pathWithExt)
      audioFilePath = pathWithExt
    }

    // Используем реальный fs.ReadStream — путь уже с расширением, API распознает формат
    const fileStream = fs.createReadStream(audioFilePath)

    fileStream.on('error', (streamErr) => {
      console.error('[api/transcribe] File stream error:', streamErr)
    })

    const startTime = Date.now()
    const { text } = await sttTranscribe(fileStream, { language: 'en' })
    const duration = Date.now() - startTime
    console.log('[api/transcribe] Request completed in', duration + 'ms')

    const durationSec = Math.max(1, Math.ceil(stats.size / (128 * 1024)))
    const costRub = getCost('whisper-1', { duration_sec: durationSec })
    if (costRub > 0) {
      const deductResult = await deductBalance(supabase, userId, costRub, 'whisper-1', { duration_sec: durationSec })
      if (!deductResult.ok) {
        console.error('[api/transcribe] Deduct failed:', deductResult.error)
        return res.status(402).json({ error: 'Недостаточно средств. Пополните баланс.' })
      }
    }

    if (!text) {
      console.warn('[api/transcribe] Empty transcription result')
      return res.json({ ok: true, text: '', language: 'en', segments: [] })
    }

    // Не сохраняем голосовые записи пользователя в базу - они нужны только для транскрибирования
    // Файл будет удален в блоке finally после транскрибирования

    return res.json({
      ok: true,
      text,
      language: 'en',
      segments: []
    })
  } catch (err) {
    console.error('[api/transcribe] error:', err)

    const code = err?.cause?.code || err?.code
    const errorMessage = err?.message || ''
    const isTimeoutError = code === 'UND_ERR_CONNECT_TIMEOUT' ||
      code === 'ETIMEDOUT' ||
      code === 'ECONNRESET' ||
      errorMessage.toLowerCase().includes('timed out') ||
      errorMessage.includes('Request timed out') ||
      errorMessage.includes('timeout') ||
      err?.name === 'TimeoutError' ||
      err?.type === 'aborted'

    if (isTimeoutError) {
      return res.status(504).json({
        error: 'Таймаут транскрипции аудио',
        details: {
          code,
          message: errorMessage,
          timeout: AITUNNEL_STT_TIMEOUT_MS / 1000 + ' seconds',
          suggestion: 'Попробуйте уменьшить размер аудиофайла или разделить его на части. Проверьте доступность AITunnel API.'
        }
      })
    }

    // Обработка ошибок от OpenAI API
    if (err?.response?.data) {
      return res.status(err?.status || err?.statusCode || 500).json({
        error: 'Transcription request failed',
        details: err.response.data
      })
    }

    if (err?.error) {
      return res.status(err?.status || err?.statusCode || 500).json({
        error: 'Transcription request failed',
        details: err.error
      })
    }

    return res.status(500).json({
      error: 'Transcription request failed',
      details: err?.message || 'Unknown error'
    })
  } finally {
    // Clean up uploaded file immediately after transcription
    // Голосовые записи не сохраняются в базу - они нужны только для транскрибирования
    if (audioFilePath && fs.existsSync(audioFilePath)) {
      try {
        fs.unlinkSync(audioFilePath)
        console.log('[api/transcribe] Temp file deleted:', audioFilePath)
      } catch (unlinkErr) {
        console.error('[api/transcribe] Failed to delete temp file:', unlinkErr)
        // Try async deletion as fallback
        fs.unlink(audioFilePath, (err) => {
          if (err) console.error('[api/transcribe] Async deletion also failed:', err)
        })
      }
    }
  }
})

// TTS synthesis endpoint — принимает backend JWT или Supabase access token (словарь и др. шлют Supabase)
// Использует AITunnel API вместо Python скриптов
app.post('/api/tts', async (req, res) => {
  try {
    const rawToken = getBearerToken(req)
    if (!rawToken) {
      return res.status(401).json({ error: 'Missing Authorization Bearer token' })
    }

    // Сначала пробуем backend JWT; если нет — проверяем Supabase (для словаря, караоке, видео)
    let userId = null
    const decoded = verifyBackendJwt(rawToken)
    if (decoded?.sub) {
      userId = decoded.sub
    } else {
      const result = await Promise.resolve(supabase.auth.getUser(rawToken)).catch(() => ({ data: { user: null }, error: { message: 'Invalid token' } }))
      if (result?.data?.user?.id) {
        userId = result.data.user.id
      }
    }
    if (!userId) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const balance = await getBalance(supabase, userId)
    if (balance < BALANCE_THRESHOLD_RUB) {
      return res.status(402).json({ error: 'Пополните баланс' })
    }

    const { text, voice } = req.body || {}

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Text is required and must be a non-empty string' })
    }

    const startTime = Date.now()
    const { buffer, characters } = await ttsSynthesize(text, { maxLength: 2000, voice })
    const duration = Date.now() - startTime
    console.log('[api/tts] Request completed in', duration + 'ms', { audioSizeKB: (buffer.length / 1024).toFixed(2) })

    const costRub = getCost('gpt-4o-mini-tts', { characters })
    if (costRub > 0) {
      const deductResult = await deductBalance(supabase, userId, costRub, 'gpt-4o-mini-tts', { characters })
      if (!deductResult.ok) {
        console.error('[api/tts] Deduct failed:', deductResult.error)
        return res.status(402).json({ error: 'Недостаточно средств. Пополните баланс.' })
      }
    }

    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Content-Disposition', 'inline; filename="tts_audio.mp3"')
    res.setHeader('Content-Length', String(buffer.length))
    res.setHeader('Cache-Control', 'public, max-age=31536000') // Cache for 1 year

    return res.send(buffer)
  } catch (err) {
    const errorDetails = {
      message: err?.message,
      code: err?.code || err?.cause?.code,
      status: err?.status,
      statusCode: err?.statusCode,
      response: err?.response?.data || err?.error,
      error: err?.error,
      name: err?.name,
      type: err?.type,
      cause: err?.cause,
    }

    const isTimeoutError =
      errorDetails.code === 'UND_ERR_CONNECT_TIMEOUT' ||
      errorDetails.code === 'ETIMEDOUT' ||
      errorDetails.code === 'ECONNRESET' ||
      errorDetails.message?.toLowerCase().includes('timed out') ||
      errorDetails.message?.includes('Request timed out') ||
      errorDetails.message?.includes('timeout') ||
      errorDetails.name === 'TimeoutError' ||
      errorDetails.type === 'aborted'

    console.error('[api/tts] error:', {
      ...errorDetails,
      isTimeoutError,
      timeout: AITUNNEL_TIMEOUT_MS / 1000 + ' seconds',
      model: AITUNNEL_TTS_MODEL,
      baseURL: AITUNNEL_BASE_URL
    })

    if (isTimeoutError) {
      return res.status(502).json({
        error: 'Таймаут AITunnel TTS',
        details: {
          code: errorDetails.code,
          message: errorDetails.message,
          timeout: AITUNNEL_TIMEOUT_MS / 1000 + ' seconds',
          suggestion: 'Проверьте подключение к AITunnel API или увеличьте таймаут'
        }
      })
    }

    if (errorDetails.message?.includes('unsupported characters')) {
      return res.status(400).json({ error: 'Text contains only unsupported characters' })
    }

    // Проверка на ошибки API
    if (errorDetails.response) {
      return res.status(errorDetails.status || errorDetails.statusCode || 500).json({
        error: 'TTS request failed',
        details: errorDetails.response
      })
    }

    return res.status(500).json({
      error: 'TTS request failed',
      details: errorDetails.message || 'Unknown error',
    })
  }
})

// Agent STT (AITunnel Whisper) — для голосового ввода в агенте
app.post('/api/agent/stt', upload.single('audio'), async (req, res) => {
  console.log('[api/agent/stt] Request received:', {
    method: req.method,
    path: req.path,
    url: req.url,
    headers: { authorization: req.headers.authorization ? 'present' : 'missing' },
    hasFile: !!req.file
  })
  let audioFilePath = null
  try {
    const rawToken = getBearerToken(req)
    if (!rawToken) return res.status(401).json({ error: 'Missing Authorization Bearer token' })
    const decoded = verifyBackendJwt(rawToken)
    if (!decoded || !decoded.sub) return res.status(401).json({ error: 'Invalid or expired token' })
    const userId = decoded.sub

    const balance = await getBalance(supabase, userId)
    if (balance < BALANCE_THRESHOLD_RUB) {
      return res.status(402).json({ error: 'Пополните баланс' })
    }

    if (!req.file) return res.status(400).json({ error: 'No audio file provided' })
    audioFilePath = getUploadPath(req)

    console.log('[api/agent/stt] Processing file:', {
      path: audioFilePath,
      size: req.file.size,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname,
      model: AITUNNEL_STT_MODEL
    })

    // Проверяем, что файл существует и не пустой
    if (!fs.existsSync(audioFilePath)) {
      return res.status(400).json({ error: 'Audio file not found on server' })
    }
    const stats = fs.statSync(audioFilePath)
    if (stats.size === 0) {
      return res.status(400).json({ error: 'Audio file is empty' })
    }

    // Определяем расширение файла на основе mimetype или оригинального имени
    let fileName = req.file.originalname
    if (!fileName || !fileName.includes('.')) {
      const extMap = {
        'audio/webm': 'webm',
        'audio/mpeg': 'mp3',
        'audio/mp3': 'mp3',
        'audio/wav': 'wav',
        'audio/x-wav': 'wav',
        'audio/ogg': 'ogg',
        'audio/m4a': 'm4a',
        'audio/mp4': 'm4a'
      }
      const ext = extMap[req.file.mimetype] || 'webm'
      fileName = `audio.${ext}`
    }
    const ext = path.extname(fileName).slice(1) || 'webm'

    // API определяет формат по имени файла. Multer сохраняет без расширения —
    // переименовываем файл, чтобы путь заканчивался на .webm/.mp3 и т.д.
    if (!audioFilePath.toLowerCase().endsWith(`.${ext}`)) {
      const pathWithExt = `${audioFilePath}.${ext}`
      fs.renameSync(audioFilePath, pathWithExt)
      audioFilePath = pathWithExt
    }

    // Используем реальный fs.ReadStream — путь уже с расширением, API распознает формат
    const fileStream = fs.createReadStream(audioFilePath)

    fileStream.on('error', (streamErr) => {
      console.error('[api/agent/stt] File stream error:', streamErr)
    })

    const startTime = Date.now()
    const { text } = await sttTranscribe(fileStream)
    const duration = Date.now() - startTime
    console.log('[api/agent/stt] Request completed in', duration + 'ms', { hasText: !!text, textLength: text?.length || 0 })

    const durationSec = Math.max(1, Math.ceil(stats.size / (128 * 1024)))
    const costRub = getCost('whisper-1', { duration_sec: durationSec })
    if (costRub > 0) {
      const deductResult = await deductBalance(supabase, userId, costRub, 'whisper-1', { duration_sec: durationSec })
      if (!deductResult.ok) {
        console.error('[api/agent/stt] Deduct failed:', deductResult.error)
        return res.status(402).json({ error: 'Недостаточно средств. Пополните баланс.' })
      }
    }

    if (!text) {
      console.warn('[api/agent/stt] Empty transcription result')
      return res.json({ ok: true, text: '' })
    }

    return res.json({ ok: true, text })
  } catch (err) {
    const errorDetails = {
      message: err?.message,
      code: err?.code || err?.cause?.code,
      status: err?.status,
      statusCode: err?.statusCode,
      response: err?.response?.data || err?.error,
      error: err?.error,
      name: err?.name,
      type: err?.type,
      cause: err?.cause,
      stack: err?.stack
    }

    console.error('[api/agent/stt] error:', errorDetails)

    const code = err?.cause?.code || err?.code
    const errorMessage = err?.message || ''
    const isTimeoutError = code === 'UND_ERR_CONNECT_TIMEOUT' ||
      code === 'ETIMEDOUT' ||
      code === 'ECONNRESET' ||
      errorMessage.toLowerCase().includes('timed out') ||
      errorMessage.includes('Request timed out') ||
      errorMessage.includes('timeout') ||
      err?.name === 'TimeoutError' ||
      err?.type === 'aborted'

    if (isTimeoutError) {
      console.error('[api/agent/stt] Timeout error details:', {
        code,
        message: errorMessage,
        name: err?.name,
        type: err?.type,
        timeout: AITUNNEL_STT_TIMEOUT_MS / 1000 + ' seconds',
        fileSize: req.file?.size,
        baseURL: AITUNNEL_BASE_URL,
        model: AITUNNEL_STT_MODEL
      })
      return res.status(504).json({
        error: 'Таймаут транскрипции аудио',
        details: {
          code,
          message: errorMessage,
          timeout: AITUNNEL_STT_TIMEOUT_MS / 1000 + ' seconds',
          suggestion: 'Попробуйте уменьшить размер аудиофайла или разделить его на части. Проверьте доступность AITunnel API.'
        }
      })
    }

    // Запись слишком короткая (Whisper требует минимум ~0.1 с)
    const isAudioTooShort =
      err?.error?.code === 'audio_too_short' ||
      (err?.message && /audio.*too short|minimum.*length/i.test(err.message))
    if (isAudioTooShort) {
      return res.status(400).json({
        error: 'Запись слишком короткая. Держите кнопку не менее секунды.',
        code: 'audio_too_short'
      })
    }

    // Обработка ошибок от OpenAI API
    if (err?.response?.data) {
      return res.status(err?.status || err?.statusCode || 500).json({
        error: 'STT request failed',
        details: err.response.data
      })
    }

    if (err?.error) {
      return res.status(err?.status || err?.statusCode || 500).json({
        error: 'STT request failed',
        details: err.error
      })
    }

    return res.status(500).json({
      error: 'STT request failed',
      details: err?.message || 'Unknown error',
    })
  } finally {
    if (audioFilePath && fs.existsSync(audioFilePath)) {
      try { fs.unlinkSync(audioFilePath) } catch (e) { console.error('[api/agent/stt] unlink error:', e?.message) }
    }
  }
})

// Agent TTS (AITunnel gpt-4o-mini-tts) — для озвучки ответов агента
app.post('/api/agent/tts', async (req, res) => {
  try {
    const rawToken = getBearerToken(req)
    if (!rawToken) return res.status(401).json({ error: 'Missing Authorization Bearer token' })
    const decoded = verifyBackendJwt(rawToken)
    if (!decoded || !decoded.sub) return res.status(401).json({ error: 'Invalid or expired token' })
    const userId = decoded.sub

    const balance = await getBalance(supabase, userId)
    if (balance < BALANCE_THRESHOLD_RUB) {
      return res.status(402).json({ error: 'Пополните баланс' })
    }

    const { text } = req.body || {}
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Text is required' })
    }

    const startTime = Date.now()
    const { buffer, characters } = await ttsSynthesize(text, { maxLength: 2000 })
    const duration = Date.now() - startTime
    console.log('[api/agent/tts] Request completed in', duration + 'ms', { audioSizeKB: (buffer.length / 1024).toFixed(2) })

    const costRub = getCost('gpt-4o-mini-tts', { characters })
    if (costRub > 0) {
      const deductResult = await deductBalance(supabase, userId, costRub, 'gpt-4o-mini-tts', { characters })
      if (!deductResult.ok) {
        console.error('[api/agent/tts] Deduct failed:', deductResult.error)
        return res.status(402).json({ error: 'Недостаточно средств. Пополните баланс.' })
      }
    }

    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Content-Disposition', 'inline; filename="agent_tts.mp3"')
    res.setHeader('Content-Length', String(buffer.length))
    return res.send(buffer)
  } catch (err) {
    const errorDetails = {
      message: err?.message,
      code: err?.code || err?.cause?.code,
      status: err?.status,
      statusCode: err?.statusCode,
      response: err?.response?.data || err?.error,
      error: err?.error,
      name: err?.name,
      type: err?.type,
      cause: err?.cause,
    }

    const isTimeoutError =
      errorDetails.code === 'UND_ERR_CONNECT_TIMEOUT' ||
      errorDetails.code === 'ETIMEDOUT' ||
      errorDetails.code === 'ECONNRESET' ||
      errorDetails.message?.toLowerCase().includes('timed out') ||
      errorDetails.message?.includes('Request timed out') ||
      errorDetails.message?.includes('timeout') ||
      errorDetails.name === 'TimeoutError' ||
      errorDetails.type === 'aborted'

    console.error('[api/agent/tts] error:', {
      ...errorDetails,
      isTimeoutError,
      timeout: AITUNNEL_TIMEOUT_MS / 1000 + ' seconds',
      model: AITUNNEL_TTS_MODEL,
      baseURL: AITUNNEL_BASE_URL
    })

    if (isTimeoutError) {
      return res.status(502).json({
        error: 'Таймаут AITunnel TTS',
        details: {
          code: errorDetails.code,
          message: errorDetails.message,
          timeout: AITUNNEL_TIMEOUT_MS / 1000 + ' seconds',
          suggestion: 'Проверьте подключение к AITunnel API или увеличьте таймаут'
        }
      })
    }

    if (errorDetails.message?.includes('unsupported characters')) {
      return res.status(400).json({ error: 'Text contains only unsupported characters' })
    }

    // Проверка на ошибки API
    if (errorDetails.response) {
      return res.status(errorDetails.status || errorDetails.statusCode || 500).json({
        error: 'TTS request failed',
        details: errorDetails.response
      })
    }

    return res.status(500).json({
      error: 'TTS request failed',
      details: errorDetails.message || 'Unknown error',
    })
  }
})

// Agent chat (streaming NDJSON) — заменяет WebSocket /ws/agent
app.post('/api/agent/chat', async (req, res) => {
  const rawToken = getBearerToken(req)
  if (!rawToken) return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  const decoded = verifyBackendJwt(rawToken)
  if (!decoded || !decoded.sub) return res.status(401).json({ error: 'Invalid or expired token' })
  const userId = decoded.sub

  const balance = await getBalance(supabase, userId)
  if (balance < BALANCE_THRESHOLD_RUB) {
    return res.status(402).json({ error: 'Пополните баланс' })
  }

  const { messages, max_tokens, scenario_steps, roleplay_settings, freestyle_context } = req.body || {}
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Expected { messages: [...] }' })
  }
  const maxTokens = typeof max_tokens === 'number' ? max_tokens : 1500
  const steps = Array.isArray(scenario_steps) && scenario_steps.length > 0
    ? scenario_steps.filter((s) => s && typeof s.id === 'string')
    : []
  const settings = roleplay_settings && typeof roleplay_settings === 'object' ? roleplay_settings : null
  const slangMode = settings && ['off', 'light', 'heavy'].includes(settings.slang_mode) ? settings.slang_mode : 'off'
  const allowProfanity = Boolean(settings?.allow_profanity)
  const aiMayUseProfanity = allowProfanity && Boolean(settings?.ai_may_use_profanity)
  const profanityIntensity = settings && ['light', 'medium', 'hard'].includes(settings.profanity_intensity)
    ? settings.profanity_intensity
    : 'light'
  const freestyleContext = freestyle_context && typeof freestyle_context === 'object' ? freestyle_context : null
  const freestyleRoleHint = freestyleContext && typeof freestyleContext.role_hint === 'string' ? freestyleContext.role_hint : 'none'
  const freestyleToneFormality = freestyleContext && Number.isFinite(Number(freestyleContext.tone_formality))
    ? Math.max(0, Math.min(100, Number(freestyleContext.tone_formality)))
    : 50
  const freestyleToneDirectness = freestyleContext && Number.isFinite(Number(freestyleContext.tone_directness))
    ? Math.max(0, Math.min(100, Number(freestyleContext.tone_directness)))
    : 50
  const freestyleMicroGoals = Array.isArray(freestyleContext?.micro_goals)
    ? freestyleContext.micro_goals.filter((g) => typeof g === 'string').slice(0, 3)
    : []

  const send = (obj) => {
    try {
      res.write(JSON.stringify(obj) + '\n')
    } catch (e) {
      console.error('[api/agent/chat] write error:', e?.message)
    }
  }

  res.setHeader('Content-Type', 'application/x-ndjson')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  const startTime = Date.now()
  let timeoutId = null

  // Для обычного чата (без сценария) добавляем системный промпт: язык ответа = язык пользователя
  const roleplaySafetySystem = settings
    ? {
      role: 'system',
      content:
        'Safety and style policy: follow provided style settings and keep responses contextual. ' +
        `slang_mode=${slangMode}; allow_profanity=${allowProfanity}; ai_may_use_profanity=${aiMayUseProfanity}; profanity_intensity=${profanityIntensity}. ` +
        'Never include prohibited content: sexual content involving minors/pedophilia, extremism/terrorism support, instructions for violent wrongdoing, non-consensual sexual violence, doxxing, or direct real-world threats. ' +
        'If the user requests prohibited content, refuse briefly and steer the dialogue to a safe alternative.',
    }
    : null
  const freestyleCoachSystem = freestyleContext
    ? {
      role: 'system',
      content:
        'Freestyle coaching context (ephemeral, no progress tracking): ' +
        `role_hint=${freestyleRoleHint}; tone_formality=${freestyleToneFormality}/100; tone_directness=${freestyleToneDirectness}/100; ` +
        `micro_goals=${freestyleMicroGoals.join(', ') || 'none'}. ` +
        'Apply this softly: stay natural and conversational, do not mention these settings explicitly.',
    }
    : null
  const baseMessages = steps.length > 0
    ? messages
    : [
      {
        role: 'system',
        content: 'You are a helpful assistant. Always reply in the SAME language the user writes in (e.g. Russian if they write in Russian, English if in English). Do not switch to Chinese or other languages unless the user explicitly writes in that language.',
      },
      ...messages,
    ]
  const chatMessages = [
    ...(roleplaySafetySystem ? [roleplaySafetySystem] : []),
    ...(freestyleCoachSystem ? [freestyleCoachSystem] : []),
    ...baseMessages,
  ]

  try {
    console.log('[api/agent/chat] Starting chat request:', {
      model: AITUNNEL_MODEL,
      messagesCount: chatMessages.length,
      maxTokens,
      timeout: AITUNNEL_TIMEOUT_MS / 1000 + ' seconds',
      baseURL: AITUNNEL_BASE_URL
    })

    const stream = await llm.chat.completions.create({
      model: AITUNNEL_MODEL,
      messages: chatMessages,
      max_tokens: maxTokens,
      stream: true,
    })

    timeoutId = setTimeout(() => {
      console.error('[api/agent/chat] Stream timeout exceeded:', {
        timeout: AITUNNEL_TIMEOUT_MS / 1000 + ' seconds',
        elapsed: Date.now() - startTime
      })
    }, AITUNNEL_TIMEOUT_MS)

    let chunkCount = 0
    let fullReply = ''
    for await (const chunk of stream) {
      const elapsed = Date.now() - startTime
      if (elapsed > AITUNNEL_TIMEOUT_MS) {
        throw new Error(`Stream timeout: ${elapsed}ms > ${AITUNNEL_TIMEOUT_MS}ms`)
      }
      const delta = chunk.choices?.[0]?.delta?.content ?? ''
      if (delta) {
        chunkCount++
        fullReply += delta
        send({ type: 'chunk', delta })
      }
    }

    if (timeoutId) clearTimeout(timeoutId)
    const duration = Date.now() - startTime
    console.log('[api/agent/chat] Stream completed:', {
      chunkCount,
      duration: duration + 'ms',
      durationSeconds: (duration / 1000).toFixed(2) + 's'
    })

    const inputTokens = Math.ceil(chatMessages.reduce((acc, m) => acc + (m.content || '').length, 0) / 4)
    const outputTokens = Math.ceil((fullReply || '').length / 4)
    const costRub = getCost('deepseek-v3.2', { input_tokens: inputTokens, output_tokens: outputTokens })
    if (costRub > 0) {
      const deductResult = await deductBalance(supabase, userId, costRub, 'deepseek-v3.2', { input_tokens: inputTokens, output_tokens: outputTokens })
      if (!deductResult.ok) {
        console.error('[api/agent/chat] Deduct failed after stream:', deductResult.error)
      }
    }

    if (steps.length > 0 && fullReply.trim()) {
      try {
        const stepDesc = (s) => s.titleRu || s.title_ru || s.titleEn || s.title_en || s.id
        const stepCriteria = (s) => {
          const c = s && typeof s.completionCriteria === 'object' ? s.completionCriteria : null
          if (!c) return ''
          const parts = []
          if (typeof c.min_user_turns === 'number') parts.push(`min_user_turns=${c.min_user_turns}`)
          if (typeof c.min_sentences === 'number') parts.push(`min_sentences=${c.min_sentences}`)
          if (Array.isArray(c.required_markers) && c.required_markers.length > 0) {
            parts.push(`required_markers=[${c.required_markers.join(', ')}]`)
          }
          if (c.must_reference_opponent === true) parts.push('must_reference_opponent=true')
          if (typeof c.evidence_hint_en === 'string' && c.evidence_hint_en.trim()) {
            parts.push(`evidence_hint="${c.evidence_hint_en.trim()}"`)
          }
          return parts.length > 0 ? ` | criteria: ${parts.join('; ')}` : ''
        }
        const stepList = steps
          .map((s, i) => `Step ${i + 1} (id: ${s.id}): ${stepDesc(s)}${stepCriteria(s)}`)
          .join('\n')
        const conversationText = [...messages, { role: 'assistant', content: fullReply }]
          .map((m) => `${m.role}: ${m.content}`)
          .join('\n\n')
        const stepCheckSystem = `You are a step checker for a roleplay scenario. Your job is to output a JSON object with one key: "completedStepIds" (array of step identifiers that the user has completed in the conversation).

Rules:
- For steps that require CONCRETE information (e.g. pickup address, destination, time, confirmation of booking): the user must have actually stated that information. Mere "hello" or "I need a taxi" without address/destination does NOT count.
- For steps that mean "start a conversation about X" / "begin discussing X" / "bring up topic X" / "начать разговор о X": the step IS completed when the user has clearly introduced or raised the topic X in their message(s), even if they started with a greeting. Example: "Hello, you have such a nice costume, what is it?" or "Hi! I love your witch costume" — the user started a conversation about costumes, so a step like "Start a conversation about costumes" MUST be marked completed. The assistant replying on the same topic (e.g. about the costume) confirms the step.
- If a step has criteria, treat those criteria as mandatory. Do not mark the step unless criteria are satisfied.
- For other step types: include the step if the user's messages clearly satisfy what the step requires.
- If the evidence is ambiguous or weak, do NOT mark the step completed.
- For "completedStepIds" use EITHER the exact "id" from the step list OR the position: "step1", "step2", "step3" for 1st/2nd/3rd step, or "1", "2", "3".
- Output ONLY the JSON object, nothing else. Example: {"completedStepIds":["step1","step2"]} or {"completedStepIds":["pickup","destination"]}`
        const stepCheckUser = `Steps (what each step means):\n${stepList}\n\nConversation:\n${conversationText}`
        const stepCompletion = await llm.chat.completions.create({
          model: AITUNNEL_MODEL,
          messages: [
            { role: 'system', content: stepCheckSystem },
            { role: 'user', content: stepCheckUser },
          ],
          max_tokens: 200,
          stream: false,
        })
        const stepUsage = stepCompletion?.usage
        if (stepUsage && (stepUsage.input_tokens || stepUsage.output_tokens)) {
          const stepCost = getCost('deepseek-v3.2', {
            input_tokens: stepUsage.input_tokens || 0,
            output_tokens: stepUsage.output_tokens || 0,
          })
          if (stepCost > 0) {
            await deductBalance(supabase, userId, stepCost, 'deepseek-v3.2', { step_check: true })
          }
        }
        const raw = stepCompletion.choices?.[0]?.message?.content?.trim() || ''
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          const rawIds = Array.isArray(parsed.completedStepIds)
            ? parsed.completedStepIds.filter((id) => typeof id === 'string').map((id) => String(id).trim())
            : []
          const normalized = (id) => id.toLowerCase().replace(/\s+/g, '')
          const completed = []
          for (const id of rawIds) {
            const exact = steps.find((s) => s.id === id || normalized(s.id) === normalized(id))
            if (exact) {
              if (!completed.includes(exact.id)) completed.push(exact.id)
              continue
            }
            const byPosition = id.match(/^step\s*_?\s*(\d+)$/i) || id.match(/^(\d+)$/)
            const idx = byPosition ? parseInt(byPosition[1], 10) - 1 : -1
            if (idx >= 0 && idx < steps.length && !completed.includes(steps[idx].id)) {
              completed.push(steps[idx].id)
            }
          }
          send({ type: 'steps', completedStepIds: completed })
        }
      } catch (stepErr) {
        console.error('[api/agent/chat] step-check error:', stepErr?.message)
      }
    }

    send({ type: 'done' })
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId)
    const errorDetails = {
      message: err?.message,
      code: err?.code || err?.cause?.code,
      status: err?.status,
      statusCode: err?.statusCode,
      name: err?.name,
      type: err?.type,
      cause: err?.cause,
    }
    const isTimeoutError =
      errorDetails.code === 'UND_ERR_CONNECT_TIMEOUT' ||
      errorDetails.code === 'ETIMEDOUT' ||
      errorDetails.code === 'ECONNRESET' ||
      errorDetails.message?.toLowerCase().includes('timed out') ||
      errorDetails.message?.includes('Request timed out') ||
      errorDetails.message?.includes('timeout') ||
      errorDetails.name === 'TimeoutError' ||
      errorDetails.type === 'aborted'
    console.error('[api/agent/chat] stream error:', {
      ...errorDetails,
      isTimeoutError,
      timeout: AITUNNEL_TIMEOUT_MS / 1000 + ' seconds',
      model: AITUNNEL_MODEL,
      baseURL: AITUNNEL_BASE_URL
    })
    const msg = isTimeoutError
      ? `Таймаут запроса (${AITUNNEL_TIMEOUT_MS / 1000} сек). Провайдер (AITUNNEL/DeepSeek) не ответил вовремя — возможны сбои на их стороне. Попробуйте позже.`
      : (err?.message || 'Chat request failed')
    send({ type: 'error', message: msg, details: errorDetails })
  } finally {
    res.end()
  }
})

// Roleplay feedback — short, supportive coaching after scenario
app.post('/api/agent/roleplay-feedback', async (req, res) => {
  const rawToken = getBearerToken(req)
  if (!rawToken) return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  const decoded = verifyBackendJwt(rawToken)
  if (!decoded || !decoded.sub) return res.status(401).json({ error: 'Invalid or expired token' })
  const userId = decoded.sub

  const balance = await getBalance(supabase, userId)
  if (balance < BALANCE_THRESHOLD_RUB) {
    return res.status(402).json({ error: 'Пополните баланс' })
  }

  const { messages, scenario_id, scenario_title, goal, goal_ru, roleplay_settings } = req.body || {}
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Expected { messages: [{role, content}, ...] }' })
  }

  const userMessages = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .filter(Boolean)
    .slice(-10)
  if (userMessages.length === 0) {
    return res.status(400).json({ error: 'No user messages to evaluate' })
  }

  const scenarioGoal = (typeof goal_ru === 'string' && goal_ru.trim()) || (typeof goal === 'string' && goal.trim()) || ''
  const settings = roleplay_settings && typeof roleplay_settings === 'object' ? roleplay_settings : {}
  const slangMode = ['off', 'light', 'heavy'].includes(settings.slang_mode) ? settings.slang_mode : 'off'
  const allowProfanity = Boolean(settings.allow_profanity)
  const aiMayUseProfanity = allowProfanity && Boolean(settings.ai_may_use_profanity)
  const profanityIntensity = ['light', 'medium', 'hard'].includes(settings.profanity_intensity)
    ? settings.profanity_intensity
    : 'light'
  const FEEDBACK_SYSTEM = `You are a supportive language coach. Give brief, actionable feedback on the user's dialogue in this scenario.

Rules:
1. Name one concrete STRENGTH: refer to something they said or did well (e.g. "You used 'I'd like to...' well" or "You asked for the address clearly").
2. Give one concrete SUGGESTION for next time, tied to the scenario goal (e.g. if the goal was to book a taxi, suggest asking about price or confirming the time).
3. Suggest one USEFUL PHRASE in English they could remember for this type of situation (a typical sentence), and its RUSSIAN translation.
4. If this scenario uses slang/profanity settings, add one short STYLE NOTE about register control and appropriateness.
5. If user used very aggressive language, provide one neutral rewrite line.
Respond ONLY with valid JSON, no markdown, no other text:
{"feedback": "1-2 short sentences in Russian or English: strength + suggestion.", "useful_phrase": "one typical phrase in English for this situation", "useful_phrase_ru": "translation of useful_phrase in Russian. Empty string if useful_phrase is empty.", "style_note": "short note about slang/profanity appropriateness. Empty string if not applicable.", "rewrite_neutral": "one short neutral rewrite for a rough line. Empty string if not applicable."}`

  const goalBlock = scenarioGoal ? `\nScenario goal (what the user was supposed to achieve): ${scenarioGoal}\n` : ''
  const settingsBlock = `
Roleplay style settings:
- slang_mode: ${slangMode}
- allow_profanity: ${allowProfanity}
- ai_may_use_profanity: ${aiMayUseProfanity}
- profanity_intensity: ${profanityIntensity}
`
  const userPrompt = `Scenario: ${scenario_title || 'Roleplay'}.${goalBlock}
${settingsBlock}

User's dialogue lines (transcript):
${userMessages.join('\n---\n')}

Return JSON with "feedback" and "useful_phrase".`

  try {
    const completion = await llm.chat.completions.create({
      model: AITUNNEL_MODEL,
      messages: [
        { role: 'system', content: FEEDBACK_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 280,
      temperature: 0.4,
    })
    const usage = completion?.usage
    if (usage && (usage.input_tokens || usage.output_tokens)) {
      const costRub = getCost('deepseek-v3.2', usage)
      if (costRub > 0) {
        await deductBalance(supabase, userId, costRub, 'deepseek-v3.2', { roleplay_feedback: true })
      }
    }
    const raw = completion.choices?.[0]?.message?.content?.trim() || ''
    let feedback = ''
    let useful_phrase = ''
    let useful_phrase_ru = ''
    let style_note = ''
    let rewrite_neutral = ''
    try {
      const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, '').trim())
      feedback = typeof parsed.feedback === 'string' ? parsed.feedback.trim() : raw
      useful_phrase = typeof parsed.useful_phrase === 'string' ? parsed.useful_phrase.trim() : ''
      useful_phrase_ru = typeof parsed.useful_phrase_ru === 'string' ? parsed.useful_phrase_ru.trim() : ''
      style_note = typeof parsed.style_note === 'string' ? parsed.style_note.trim() : ''
      rewrite_neutral = typeof parsed.rewrite_neutral === 'string' ? parsed.rewrite_neutral.trim() : ''
    } catch {
      feedback = raw
    }
    res.json({
      feedback: feedback || '',
      useful_phrase: useful_phrase || null,
      useful_phrase_ru: useful_phrase_ru || null,
      style_note: style_note || null,
      rewrite_neutral: rewrite_neutral || null,
      scenario_id: scenario_id || null,
      scenario_title: scenario_title || null,
    })
  } catch (err) {
    console.error('[api/agent/roleplay-feedback] error:', err?.message)
    res.status(500).json({ error: err?.message || 'Roleplay feedback failed' })
  }
})

// Debate feedback — short, supportive coaching after debate
app.post('/api/agent/debate-feedback', async (req, res) => {
  const rawToken = getBearerToken(req)
  if (!rawToken) return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  const decoded = verifyBackendJwt(rawToken)
  if (!decoded || !decoded.sub) return res.status(401).json({ error: 'Invalid or expired token' })
  const userId = decoded.sub

  const balance = await getBalance(supabase, userId)
  if (balance < BALANCE_THRESHOLD_RUB) {
    return res.status(402).json({ error: 'Пополните баланс' })
  }

  const { messages, topic, user_position, ai_position, roleplay_settings } = req.body || {}
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Expected { messages: [{role, content}, ...] }' })
  }

  const userMessages = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .filter(Boolean)
    .slice(-10)
  if (userMessages.length === 0) {
    return res.status(400).json({ error: 'No user messages to evaluate' })
  }

  const settings = roleplay_settings && typeof roleplay_settings === 'object' ? roleplay_settings : {}
  const slangMode = ['off', 'light', 'heavy'].includes(settings.slang_mode) ? settings.slang_mode : 'off'
  const allowProfanity = Boolean(settings.allow_profanity)
  const aiMayUseProfanity = allowProfanity && Boolean(settings.ai_may_use_profanity)
  const profanityIntensity = ['light', 'medium', 'hard'].includes(settings.profanity_intensity)
    ? settings.profanity_intensity
    : 'light'

  const FEEDBACK_SYSTEM = `You are a supportive English debate coach. Give brief, actionable feedback on the user's debate performance.

Rules:
1. Identify one concrete STRENGTH and one concrete IMPROVEMENT opportunity.
2. Use SBI format for both strength and improvement:
   - situation: where in the debate it happened
   - behavior: what exactly the user did
   - impact: why it helped / what to improve
3. Keep language practical and specific, no generic advice.
4. Suggest one NEXT-TRY phrase in English and its Russian translation.
5. If slang/profanity settings are enabled, evaluate register control and appropriateness briefly.
6. Penalize random profanity with no communicative purpose; reward controlled style switching.

Respond ONLY with valid JSON, no markdown, no other text:
{
  "feedback_short_ru": "1-2 short sentences in Russian: strength + suggestion",
  "strength_sbi": {
    "situation": "string",
    "behavior": "string",
    "impact": "string"
  },
  "improvement_sbi": {
    "situation": "string",
    "behavior": "string",
    "impact": "string"
  },
  "next_try_phrase_en": "one useful debate phrase in English",
  "next_try_phrase_ru": "translation to Russian"
}`

  const topicBlock = topic ? `\nDebate topic: ${topic}\nUser position: ${user_position || 'unknown'}\n` : ''
  const settingsBlock = `
Debate style settings:
- slang_mode: ${slangMode}
- allow_profanity: ${allowProfanity}
- ai_may_use_profanity: ${aiMayUseProfanity}
- profanity_intensity: ${profanityIntensity}
`
  const userPrompt = `Debate${topicBlock}
${settingsBlock}
User's debate arguments (transcript):
${userMessages.join('\n---\n')}

Return JSON with the required keys: feedback_short_ru, strength_sbi, improvement_sbi, next_try_phrase_en, next_try_phrase_ru.`

  try {
    const completion = await llm.chat.completions.create({
      model: AITUNNEL_MODEL,
      messages: [
        { role: 'system', content: FEEDBACK_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 420,
      temperature: 0.4,
    })
    const usage = completion?.usage
    if (usage && (usage.input_tokens || usage.output_tokens)) {
      const costRub = getCost('deepseek-v3.2', usage)
      if (costRub > 0) {
        await deductBalance(supabase, userId, costRub, 'deepseek-v3.2', { debate_feedback: true })
      }
    }
    const raw = completion.choices?.[0]?.message?.content?.trim() || ''
    let feedbackShort = ''
    let useful_phrase = ''
    let useful_phrase_ru = ''
    let strength_sbi = { situation: '', behavior: '', impact: '' }
    let improvement_sbi = { situation: '', behavior: '', impact: '' }
    try {
      const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, '').trim())
      feedbackShort =
        typeof parsed.feedback_short_ru === 'string' && parsed.feedback_short_ru.trim()
          ? parsed.feedback_short_ru.trim()
          : typeof parsed.feedback === 'string'
            ? parsed.feedback.trim()
            : ''

      const phraseEn =
        typeof parsed.next_try_phrase_en === 'string' && parsed.next_try_phrase_en.trim()
          ? parsed.next_try_phrase_en.trim()
          : typeof parsed.useful_phrase === 'string'
            ? parsed.useful_phrase.trim()
            : ''
      const phraseRu =
        typeof parsed.next_try_phrase_ru === 'string' && parsed.next_try_phrase_ru.trim()
          ? parsed.next_try_phrase_ru.trim()
          : typeof parsed.useful_phrase_ru === 'string'
            ? parsed.useful_phrase_ru.trim()
            : ''

      useful_phrase = phraseEn
      useful_phrase_ru = phraseRu

      const readSbi = (obj) => ({
        situation: typeof obj?.situation === 'string' ? obj.situation.trim() : '',
        behavior: typeof obj?.behavior === 'string' ? obj.behavior.trim() : '',
        impact: typeof obj?.impact === 'string' ? obj.impact.trim() : '',
      })
      strength_sbi = readSbi(parsed.strength_sbi)
      improvement_sbi = readSbi(parsed.improvement_sbi)
    } catch {
      feedbackShort = raw
    }
    res.json({
      // New fields (v2)
      feedback_short_ru: feedbackShort || '',
      strength_sbi,
      improvement_sbi,
      next_try_phrase_en: useful_phrase || null,
      next_try_phrase_ru: useful_phrase_ru || null,
      // Backward-compatible fields
      feedback: feedbackShort || '',
      useful_phrase: useful_phrase || null,
      useful_phrase_ru: useful_phrase_ru || null,
      topic: topic || null,
      user_position: user_position || null,
    })
  } catch (err) {
    console.error('[api/agent/debate-feedback] error:', err?.message)
    res.status(500).json({ error: err?.message || 'Debate feedback failed' })
  }
})

function normalizeDebateTopicInput(topicRaw) {
  return String(topicRaw || '').replace(/\s+/g, ' ').trim()
}

function detectDebateTopicLanguage(topic) {
  const hasCyrillic = /[А-Яа-яЁё]/.test(topic)
  const hasLatin = /[A-Za-z]/.test(topic)
  if (hasCyrillic && !hasLatin) return 'ru'
  if (hasLatin && !hasCyrillic) return 'en'
  return 'unknown'
}

function validateDebateTopicInput(topicRaw) {
  const normalized = normalizeDebateTopicInput(topicRaw)
  const language = detectDebateTopicLanguage(normalized)
  const errors = []
  const warnings = []

  if (normalized.length < 10) errors.push('Тема слишком короткая. Минимум 10 символов.')
  if (normalized.length > 180) errors.push('Тема слишком длинная. Максимум 180 символов.')
  if (!/[A-Za-zА-Яа-яЁё]{3}/.test(normalized)) {
    errors.push('Добавьте осмысленную тему (буквы, а не только символы).')
  }
  if (/[\r\n]/.test(String(topicRaw || ''))) {
    warnings.push('Тема содержит переносы строк. Лучше оставить одно предложение.')
  }
  if (/(ignore|disregard|override).{0,80}(instruction|system|prompt|developer)/i.test(normalized)) {
    warnings.push('Тема похожа на инструкцию для модели. Формулируйте только предмет дебата.')
  }

  const status = errors.length > 0 ? 'rejected' : warnings.length > 0 ? 'warning' : 'valid'
  return { status, normalized, language, errors, warnings }
}

function inferDebateDifficulty(topic) {
  const t = topic.toLowerCase()
  if (topic.length >= 120) return 'hard'
  if (/(government|econom|policy|democracy|philosoph|ethic|geopolit|capitalism|socialism|immigration|nuclear|privacy|security|регулирован|демократ|полит|философ|этик|геополит|эконом)/i.test(t)) {
    return 'hard'
  }
  if (/(school|student|work|remote|social media|health|climate|education|technology|работ|школ|ученик|соцсет|здоров|климат|образован|технолог)/i.test(t)) {
    return 'medium'
  }
  return 'easy'
}

// Debate topic preparation: validation + normalization + difficulty recommendation.
app.post('/api/agent/debate-topic-prepare', async (req, res) => {
  const rawToken = getBearerToken(req)
  if (!rawToken) return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  const decoded = verifyBackendJwt(rawToken)
  if (!decoded || !decoded.sub) return res.status(401).json({ error: 'Invalid or expired token' })

  const { topic_raw, locale, difficulty_mode } = req.body || {}
  const rawTopic = typeof topic_raw === 'string' ? topic_raw : ''
  const mode = typeof difficulty_mode === 'string' ? difficulty_mode.toLowerCase() : 'auto'
  const localeValue = typeof locale === 'string' ? locale.trim() : 'ru'
  const validation = validateDebateTopicInput(rawTopic)
  const allowedModes = new Set(['auto', 'easy', 'medium', 'hard'])
  const safeMode = allowedModes.has(mode) ? mode : 'auto'
  const recommendedDifficulty = inferDebateDifficulty(validation.normalized)
  const selectedDifficulty = safeMode === 'auto' ? recommendedDifficulty : safeMode

  return res.json({
    is_valid: validation.status !== 'rejected',
    status: validation.status,
    normalized_topic: validation.normalized,
    detected_language: validation.language,
    recommended_difficulty: recommendedDifficulty,
    selected_difficulty: selectedDifficulty,
    difficulty_mode: safeMode,
    warnings: validation.warnings,
    errors: validation.errors,
    locale: localeValue || 'ru',
  })
})

// Reply hint — подсказка ответа: и по реплике ИИ, и по шагам сценария
app.post('/api/agent/reply-hint', async (req, res) => {
  const rawToken = getBearerToken(req)
  if (!rawToken) return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  const decoded = verifyBackendJwt(rawToken)
  if (!decoded || !decoded.sub) return res.status(401).json({ error: 'Invalid or expired token' })
  const userId = decoded.sub

  const balance = await getBalance(supabase, userId)
  if (balance < BALANCE_THRESHOLD_RUB) {
    return res.status(402).json({ error: 'Пополните баланс' })
  }

  const {
    mode,
    last_assistant_message,
    history,
    goal,
    goal_ru,
    level,
    steps,
    completed_step_ids,
    topic,
    user_position,
    ai_position,
    roleplay_settings,
    freestyle_context,
    hint_mode,
  } = req.body || {}
  const agentMessage = typeof last_assistant_message === 'string' ? last_assistant_message.trim() : ''
  if (!agentMessage) {
    return res.status(400).json({ error: 'Expected { last_assistant_message: "..." }' })
  }
  const hintMode = mode === 'debate' ? 'debate' : mode === 'chat' ? 'chat' : 'roleplay'
  const settings = roleplay_settings && typeof roleplay_settings === 'object' ? roleplay_settings : {}
  const slangMode = ['off', 'light', 'heavy'].includes(settings.slang_mode) ? settings.slang_mode : 'off'
  const allowProfanity = Boolean(settings.allow_profanity)
  const aiMayUseProfanity = allowProfanity && Boolean(settings.ai_may_use_profanity)
  const profanityIntensity = ['light', 'medium', 'hard'].includes(settings.profanity_intensity)
    ? settings.profanity_intensity
    : 'light'
  const hintModeValue = ['natural', 'simpler', 'more_native', 'polite_rewrite', 'no_profanity'].includes(hint_mode)
    ? hint_mode
    : 'natural'
  const freestyleContext = freestyle_context && typeof freestyle_context === 'object' ? freestyle_context : {}
  const freestyleRoleHint = typeof freestyleContext.role_hint === 'string' ? freestyleContext.role_hint : 'none'
  const freestyleToneFormality = Number.isFinite(Number(freestyleContext.tone_formality))
    ? Math.max(0, Math.min(100, Number(freestyleContext.tone_formality)))
    : 50
  const freestyleToneDirectness = Number.isFinite(Number(freestyleContext.tone_directness))
    ? Math.max(0, Math.min(100, Number(freestyleContext.tone_directness)))
    : 50
  const freestyleMicroGoals = Array.isArray(freestyleContext.micro_goals)
    ? freestyleContext.micro_goals.filter((g) => typeof g === 'string').slice(0, 3)
    : []

  const scenarioGoal = (typeof goal_ru === 'string' && goal_ru.trim()) || (typeof goal === 'string' && goal.trim()) || ''
  const levelHint = typeof level === 'string' && level.trim()
    ? level.trim().toUpperCase().replace(/^(EASY|MEDIUM|HARD)$/i, (m) => m.charAt(0) + m.slice(1).toLowerCase())
    : 'B1'

  const levelGuidance = {
    A1: 'Use very simple words and short sentences (e.g. "I like...", "Yes, please.", "Thank you.").',
    A2: 'Use simple, everyday phrases. Short sentences are fine.',
    B1: 'Use natural everyday English with common phrases and connectors.',
    B2: 'Use varied vocabulary and natural, flowing sentences.',
    C1: 'Use idiomatic, natural English with nuance where appropriate.',
    easy: 'Use simple words and short, clear sentences.',
    medium: 'Use natural everyday phrases and moderate complexity.',
    hard: 'Use varied, natural language with more sophisticated expressions.',
  }
  const levelText = levelGuidance[levelHint] || levelGuidance.B1

  const stepsList = Array.isArray(steps) && steps.length > 0 ? steps.filter((s) => s && typeof s.id === 'string') : []
  const completedSet = new Set(Array.isArray(completed_step_ids) ? completed_step_ids.filter((id) => typeof id === 'string') : [])
  const nextSteps = stepsList.filter((s) => !completedSet.has(s.id))
  const currentStepLabel = nextSteps.length > 0
    ? (nextSteps[0].titleRu || nextSteps[0].title_ru || nextSteps[0].titleEn || nextSteps[0].title_en || nextSteps[0].id).trim()
    : ''
  const stepsBlock =
    stepsList.length > 0
      ? nextSteps.length > 0
        ? `\nSteps (user should complete these): ${stepsList.map((s) => (s.titleRu || s.title_ru || s.titleEn || s.title_en || s.id).trim()).join('; ')}\nAlready done: ${[...completedSet].join(', ') || 'none'}. Next to do: ${nextSteps.map((s) => (s.titleRu || s.title_ru || s.titleEn || s.title_en || s.id).trim()).join('; ')}. Prefer a reply that naturally moves toward the NEXT step while still answering what the agent said.`
        : `\nAll steps are done or there are no steps. Suggest a reply that fits the agent's message and the scenario goal.`
      : ''
  const historyList = Array.isArray(history)
    ? history
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-10)
    : []
  const historyBlock = historyList.length > 0
    ? `\nRecent conversation context:\n${historyList.map((m) => `${m.role}: ${m.content.trim()}`).join('\n')}`
    : ''

  const roleplaySystemContent = `You are a language coach. The user is in a roleplay dialogue. The OTHER person (the agent) just said something. Your job is to suggest a natural REPLY the user could say — one that fits the agent's message AND, if the scenario has steps, helps move the dialogue toward the next uncompleted step.

Rules:
- Output ONLY the suggested reply text, in the SAME language the agent used (usually English). No explanations, no "You could say:", no quotation marks around the whole thing.
- Match the learner level: ${levelText}
- The reply must sound like a natural response to what the agent just said (answer their question, react to their line, stay in character).
- If steps are provided, prefer a reply that both responds to the agent and moves the user toward the next step (e.g. if the next step is "give your address", the hint could include giving or leading to an address). If all steps are done, just suggest a natural reply to the agent.
- Keep it conversational. One short reply is enough; if two variants fit, you may give 1–2 options on separate lines.`

  const roleplayUserContent =
    (scenarioGoal ? `Scenario goal: ${scenarioGoal}` : '') +
    historyBlock +
    stepsBlock +
    `\n\nWhat the other person (agent) just said:\n${agentMessage}\n\nSuggest a natural reply the user could say (same language as above, one or two short options).`

  const debateTopic = typeof topic === 'string' ? topic.trim() : ''
  const userPosition = typeof user_position === 'string' ? user_position.trim() : ''
  const aiPosition = typeof ai_position === 'string' ? ai_position.trim() : ''
  const debateSystemContent = `You are a speaking coach for an English debate practice session. The AI opponent just spoke. Your task is to suggest what the USER could reply next.

Rules:
- Output ONLY the suggested reply text. No explanations, no labels, no quotation marks around the whole answer.
- Use the SAME language as the opponent's last message.
- Match learner level: ${levelText}
- The reply must directly react to the opponent's latest argument and stay logically consistent with recent dialogue context.
- Keep the user's side consistent with their debate position (do not switch sides).
- If a current debate step exists, naturally move toward it while still answering the latest opponent point.
- Style settings for this debate:
  - slang_mode=${slangMode}
  - allow_profanity=${allowProfanity}
  - ai_may_use_profanity=${aiMayUseProfanity}
  - profanity_intensity=${profanityIntensity}
- If slang_mode is off: keep wording neutral (no slang).
- If slang_mode is light/heavy: mirror that style naturally in the suggested reply.
- If allow_profanity is false: keep the hint clean.
- If allow_profanity is true but ai_may_use_profanity is false: user hint may include profanity only when contextually needed, avoid excess.
- If allow_profanity and ai_may_use_profanity are true: hint may include context-appropriate profanity with the selected intensity.
- Keep it concise and natural (usually 1-3 sentences; optionally 1-2 short variants on separate lines).`
  const debateUserContent =
    `${debateTopic ? `Debate topic: ${debateTopic}\n` : ''}` +
    `${userPosition ? `User position: ${userPosition}\n` : ''}` +
    `${aiPosition ? `Opponent position: ${aiPosition}\n` : ''}` +
    `${scenarioGoal ? `Debate completion goal: ${scenarioGoal}\n` : ''}` +
    `${currentStepLabel ? `Current stage to move toward: ${currentStepLabel}\n` : ''}` +
    historyBlock +
    stepsBlock +
    `\n\nOpponent's latest message:\n${agentMessage}\n\nSuggest the user's next reply.`

  const freestyleModeInstruction =
    hintModeValue === 'simpler'
      ? 'Make the suggested reply very simple: short sentence(s), easy vocabulary.'
      : hintModeValue === 'more_native'
        ? 'Make the suggested reply sound more native and natural with colloquial flow.'
        : hintModeValue === 'polite_rewrite'
          ? 'Rewrite the likely reply in a polite and respectful way, even if context is tense.'
          : hintModeValue === 'no_profanity'
            ? 'Keep the suggested reply strictly clean and without profanity.'
            : 'Keep the suggested reply natural and context-aware.'

  const chatSystemContent = `You are a speaking coach for freestyle conversation practice. The assistant just wrote a message, and you suggest what the USER could reply next.

Rules:
- Output ONLY the suggested reply text. No explanations, no labels, no quote wrappers.
- Use the SAME language as the assistant's last message.
- Match learner level: ${levelText}
- Keep the suggestion directly relevant to the latest assistant message and recent context.
- Apply style settings:
  - slang_mode=${slangMode}
  - allow_profanity=${allowProfanity}
  - ai_may_use_profanity=${aiMayUseProfanity}
  - profanity_intensity=${profanityIntensity}
- If slang_mode is off: keep wording neutral.
- If slang_mode is light/heavy: mirror this style naturally.
- If allow_profanity is false: keep it clean.
- If hint_mode=no_profanity: keep it clean regardless of other settings.
- Hint mode: ${hintModeValue}. ${freestyleModeInstruction}
- Ephemeral freestyle context:
  - role_hint=${freestyleRoleHint}
  - tone_formality=${freestyleToneFormality}/100
  - tone_directness=${freestyleToneDirectness}/100
  - micro_goals=${freestyleMicroGoals.join(', ') || 'none'}
- If role_hint is set (not none), phrasing should fit that social context.
- Higher tone_formality => more polite/formal wording; lower => more casual wording.
- Higher tone_directness => more direct wording; lower => softer/indirect wording.
- If micro_goals are present, make the suggested reply naturally include at least one of them.
- Keep it concise (usually 1-2 sentences; optionally 1-2 short variants on separate lines).`

  const chatUserContent =
    historyBlock +
    `\n\nAssistant's latest message:\n${agentMessage}\n\nSuggest the user's next reply.`

  try {
    const systemContent = hintMode === 'debate'
      ? debateSystemContent
      : hintMode === 'chat'
        ? chatSystemContent
        : roleplaySystemContent
    const userContent = hintMode === 'debate'
      ? debateUserContent
      : hintMode === 'chat'
        ? chatUserContent
        : roleplayUserContent
    const completion = await llm.chat.completions.create({
      model: AITUNNEL_MODEL,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ],
      max_tokens: 200,
      temperature: 0.5,
    })
    const usage = completion?.usage
    if (usage && (usage.input_tokens || usage.output_tokens)) {
      const costRub = getCost('deepseek-v3.2', usage)
      if (costRub > 0) {
        await deductBalance(supabase, userId, costRub, 'deepseek-v3.2', { reply_hint: true })
      }
    }
    const hint = (completion.choices?.[0]?.message?.content ?? '').trim()
    res.json({ hint: hint || '' })
  } catch (err) {
    console.error('[api/agent/reply-hint] error:', err?.message)
    res.status(500).json({ error: err?.message || 'Reply hint failed' })
  }
})

// ---------- User roleplay scenarios (personal scenarios: create, list, edit, archive, delete) ----------
const USER_SCENARIO_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'easy', 'medium', 'hard']

function requireUserScenarioAuth(req, res) {
  const rawToken = getBearerToken(req)
  if (!rawToken) {
    res.status(401).json({ error: 'Missing Authorization Bearer token' })
    return null
  }
  const decoded = verifyBackendJwt(rawToken)
  if (!decoded || !decoded.sub) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return null
  }
  return decoded.sub
}

function buildUserScenarioRow(row) {
  if (!row) return null
  const payload = typeof row.payload === 'object' && row.payload !== null ? row.payload : {}
  return {
    id: row.id,
    title: row.title,
    level: row.level || 'medium',
    archived: Boolean(row.archived),
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...payload,
  }
}

// List user's scenarios (optional ?archived=false | true)
app.get('/api/user-scenarios', async (req, res) => {
  const userId = requireUserScenarioAuth(req, res)
  if (!userId) return

  const archivedParam = req.query.archived
  let archivedFilter = null
  if (archivedParam === 'true') archivedFilter = true
  else if (archivedParam === 'false') archivedFilter = false

  try {
    let q = supabase
      .from('user_roleplay_scenarios')
      .select('id, user_id, title, level, archived, payload, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
    if (archivedFilter !== null) {
      q = q.eq('archived', archivedFilter)
    }
    const { data, error } = await safeSupabaseCall(() => q, { timeoutMs: 15000, maxRetries: 2 })
    if (error) {
      console.error('[api/user-scenarios] list error:', error.message)
      return res.status(500).json({ error: error.message || 'Failed to list scenarios' })
    }
    const list = (data || []).map(buildUserScenarioRow)
    const scenarioIds = list.map((s) => s.id).filter(Boolean)
    // «Недавно играли» и счётчики — только из Supabase roleplay_completions, не из localStorage
    if (scenarioIds.length > 0) {
      const { data: completions } = await supabase
        .from('roleplay_completions')
        .select('scenario_id, completed_at')
        .eq('user_id', userId)
        .in('scenario_id', scenarioIds)
      const byScenario = {}
      for (const c of completions || []) {
        const id = c.scenario_id
        if (!byScenario[id]) byScenario[id] = { count: 0, lastCompletedAt: null }
        byScenario[id].count += 1
        const at = c.completed_at ? new Date(c.completed_at).toISOString() : null
        if (at && (!byScenario[id].lastCompletedAt || at > byScenario[id].lastCompletedAt)) {
          byScenario[id].lastCompletedAt = at
        }
      }
      for (const s of list) {
        const stats = byScenario[s.id]
        s.completions_count = stats ? stats.count : 0
        s.last_completed_at = stats?.lastCompletedAt ?? null
      }
    } else {
      for (const s of list) {
        s.completions_count = 0
        s.last_completed_at = null
      }
    }
    res.json({ scenarios: list })
  } catch (err) {
    console.error('[api/user-scenarios] error:', err?.message)
    res.status(500).json({ error: err?.message || 'Failed to list scenarios' })
  }
})

// Generate scenario with AI (free-text prompt and/or structured fields + level)
app.post('/api/user-scenarios/generate', async (req, res) => {
  const userId = requireUserScenarioAuth(req, res)
  if (!userId) return

  const body = req.body || {}
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  const level = USER_SCENARIO_LEVELS.includes(body.level) ? body.level : 'medium'
  const structured = body.structured && typeof body.structured === 'object' ? body.structured : {}
  const topic = typeof structured.topic === 'string' ? structured.topic.trim() : ''
  const place = typeof structured.place === 'string' ? structured.place.trim() : ''
  const userRole = typeof structured.userRole === 'string' ? structured.userRole.trim() : ''
  const goal = typeof structured.goal === 'string' ? structured.goal.trim() : ''
  const slangMode = ['off', 'light', 'heavy'].includes(structured.slangMode) ? structured.slangMode : 'light'
  const allowProfanity = Boolean(structured.allowProfanity)
  const aiMayUseProfanity = allowProfanity && Boolean(structured.aiMayUseProfanity)
  const profanityIntensity = ['light', 'medium', 'hard'].includes(structured.profanityIntensity)
    ? structured.profanityIntensity
    : 'light'

  if (!prompt && !topic && !place && !userRole && !goal) {
    return res.status(400).json({ error: 'Provide either prompt (free text) or structured fields (topic, place, userRole, goal)' })
  }

  const levelHint = {
    A1: 'Use very simple vocabulary and short sentences (1–2 words to short phrases).',
    A2: 'Use simple, everyday vocabulary and short clear sentences.',
    B1: 'Use intermediate vocabulary and natural but still clear sentences.',
    B2: 'Use varied vocabulary and more natural, flowing dialogue.',
    C1: 'Use rich, natural language and idiomatic expressions where appropriate.',
    easy: 'Use very simple vocabulary and short sentences.',
    medium: 'Use natural, everyday language and normal sentence length.',
    hard: 'Use more varied vocabulary and natural, flowing dialogue.',
  }[level] || 'Use natural, everyday language.'

  const SYSTEM_PROMPT = `You are an expert designer of English roleplay scenarios for language learners. Generate ONE complete scenario. The AI will play one character; the user (learner) plays the other.

CRITICAL: The "systemPrompt" field MUST use exactly this 5-block structure. In the JSON string value, put a newline between blocks (in JSON write \\n for newline). Order: Character → Situation → Goal → Style → First line.

Structure (each block title followed by one or more sentences):
1) Character: You are a [role]. [One short trait.]
2) Situation: [One sentence: where and what the user needs.]
3) Goal: [One sentence: what the AI must achieve in the dialogue.]
4) Style: Speak only in English. Use short, simple sentences (1–2). [Then: flow for this scenario — what to ask first, confirm what you heard, recast small mistakes naturally, offer simple choice if they struggle. Any extra rule.]
5) First line: [One sentence: how the AI should start.]

Example (taxi) — in your JSON the systemPrompt string must look like this (use \\n for line breaks):
Character: You are a friendly taxi driver answering the phone.

Situation: The caller just finished work outside an office building and needs a ride home.

Goal: Get the pick-up location and destination, then confirm the booking.

Style: Speak only in English. Use short, simple sentences (1–2). Ask for pick-up first, then destination. Confirm what you heard. If the user makes a small mistake, recast naturally. If they struggle, offer a simple choice. Only ask about payment after pick-up and destination are clear.

First line: Answer like a taxi driver and ask where they are now.

Output ONLY valid JSON, no markdown, no code fence. Required structure:
{
  "title": "Short scenario title in Russian",
  "description": "One sentence in Russian: what the user will do",
  "category": "everyday" | "professional" | "fun",
  "setting": "Where the scene takes place, in English, 1 sentence",
  "scenarioText": "Situation in English: context for the user",
  "yourRole": "In English: what the user must do in this dialogue",
  "settingRu": "Место действия по-русски",
  "scenarioTextRu": "Ситуация по-русски",
  "yourRoleRu": "Роль пользователя по-русски",
  "openingInstruction": "How the AI character should start (instruction in English)",
  "characterOpening": "Exact first line the AI says (in English)",
  "difficulty": "easy" | "medium" | "hard",
  "optionalTwist": "Optional: one sentence hint for a twist (English)",
  "systemPrompt": "MUST use the 5-block structure: Character: ...\\n\\nSituation: ...\\n\\nGoal: ...\\n\\nStyle: ...\\n\\nFirst line: ...",
  "goal": "In English: when is the goal reached (one clear sentence)",
  "goalRu": "Когда цель достигнута, по-русски",
  "steps": [{"id": "step1", "order": 1, "titleRu": "Шаг по-русски", "titleEn": "Step in English"}, ...],
  "maxScoreTipsRu": "Short tips in Russian. Optional.",
  "suggestedFirstLine": "Optional: example first line from user, in English",
  "slangMode": "off" | "light" | "heavy",
  "allowProfanity": true | false,
  "aiMayUseProfanity": true | false,
  "profanityIntensity": "light" | "medium" | "hard"
}

Rules:
- systemPrompt: exactly 5 blocks (Character, Situation, Goal, Style, First line), separated by \\n\\n. Style must include "Speak only in English" and "Use short, simple sentences (1–2)" and recast/choice guidance.
- Language: scenario and dialogue in English; Russian only for title, description, *Ru, maxScoreTipsRu.
- steps: 2–4 checkpoints (id: lowercase, no spaces).
- Always include slangMode/allowProfanity/aiMayUseProfanity/profanityIntensity in output JSON.
- If allowProfanity is false, aiMayUseProfanity must be false.
- Concrete and playable in 1–3 minutes.`

  const parts = []
  if (prompt) parts.push(`User request (free text): ${prompt}`)
  if (topic) parts.push(`Topic/theme: ${topic}`)
  if (place) parts.push(`Place: ${place}`)
  if (userRole) parts.push(`User's role: ${userRole}`)
  if (goal) parts.push(`Desired goal: ${goal}`)
  parts.push(`Slang mode: ${slangMode}`)
  parts.push(`Allow profanity (18+): ${allowProfanity ? 'yes' : 'no'}`)
  parts.push(`AI may use profanity: ${aiMayUseProfanity ? 'yes' : 'no'}`)
  parts.push(`Profanity intensity: ${profanityIntensity}`)
  parts.push('Hard forbidden themes: pedophilia/minors sexual content, extremism/terrorism promotion, violent wrongdoing instructions, non-consensual sexual violence, direct real-world threats, doxxing.')
  const userPrompt = `${parts.join('\n')}\n\nLevel: ${level}. ${levelHint}\n\nGenerate the scenario JSON now (only the JSON object, no other text).`

  try {
    const completion = await llm.chat.completions.create({
      model: AITUNNEL_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 2200,
      temperature: 0.5,
    })
    const raw = completion.choices?.[0]?.message?.content?.trim() || ''
    const jsonStr = raw.replace(/^```json\s*|\s*```$/g, '').trim()
    let payload
    try {
      payload = JSON.parse(jsonStr)
    } catch (e) {
      console.error('[api/user-scenarios/generate] Invalid JSON:', raw?.slice(0, 400))
      return res.status(500).json({ error: 'Scenario generation failed: invalid response from AI' })
    }
    if (!payload.systemPrompt || !payload.goal || !payload.goalRu) {
      return res.status(500).json({ error: 'Scenario generation failed: missing required fields' })
    }
    if (!Array.isArray(payload.steps) || payload.steps.length === 0) {
      payload.steps = [{ id: 'goal', order: 1, titleRu: 'Достичь цели', titleEn: 'Reach the goal' }]
    }
    const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim() : 'Новый сценарий'
    delete payload.title
    payload.language = 'en'
    payload.slangMode = ['off', 'light', 'heavy'].includes(payload.slangMode) ? payload.slangMode : slangMode
    payload.allowProfanity = typeof payload.allowProfanity === 'boolean' ? payload.allowProfanity : allowProfanity
    payload.aiMayUseProfanity = payload.allowProfanity ? Boolean(payload.aiMayUseProfanity) : false
    payload.profanityIntensity = ['light', 'medium', 'hard'].includes(payload.profanityIntensity)
      ? payload.profanityIntensity
      : profanityIntensity
    res.json({
      title: title.slice(0, 500),
      level,
      payload,
    })
  } catch (err) {
    console.error('[api/user-scenarios/generate] error:', err?.message)
    res.status(500).json({ error: err?.message || 'Scenario generation failed' })
  }
})

// Get one user scenario (for play or edit)
app.get('/api/user-scenarios/:id', async (req, res) => {
  const userId = requireUserScenarioAuth(req, res)
  if (!userId) return

  const { id } = req.params
  if (!id) return res.status(400).json({ error: 'Missing scenario id' })

  try {
    const { data, error } = await safeSupabaseCall(
      () => supabase
        .from('user_roleplay_scenarios')
        .select('id, user_id, title, level, archived, payload, created_at, updated_at')
        .eq('id', id)
        .eq('user_id', userId)
        .single(),
      { timeoutMs: 10000, maxRetries: 2 }
    )
    if (error || !data) {
      if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Scenario not found' })
      return res.status(500).json({ error: error?.message || 'Failed to get scenario' })
    }
    res.json(buildUserScenarioRow(data))
  } catch (err) {
    console.error('[api/user-scenarios/:id] error:', err?.message)
    res.status(500).json({ error: err?.message || 'Failed to get scenario' })
  }
})

// Create user scenario
app.post('/api/user-scenarios', async (req, res) => {
  const userId = requireUserScenarioAuth(req, res)
  if (!userId) return

  const { title, level, payload } = req.body || {}
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' })
  }
  const levelVal = USER_SCENARIO_LEVELS.includes(level) ? level : 'medium'
  const payloadObj = typeof payload === 'object' && payload !== null ? payload : {}

  try {
    const { data, error } = await safeSupabaseCall(
      () => supabase
        .from('user_roleplay_scenarios')
        .insert({
          user_id: userId,
          title: title.trim().slice(0, 500),
          level: levelVal,
          archived: false,
          payload: payloadObj,
          updated_at: new Date().toISOString(),
        })
        .select('id, user_id, title, level, archived, payload, created_at, updated_at')
        .single(),
      { timeoutMs: 15000, maxRetries: 2 }
    )
    if (error) {
      console.error('[api/user-scenarios] insert error:', serializeError(error))
      if (typeof error?.message === 'string' && error.message.toLowerCase().includes('fetch failed')) {
        return res.status(503).json({
          error: 'Не удалось сохранить сценарий: временный сбой соединения с Supabase. Проверьте сеть/VPN и попробуйте снова.',
        })
      }
      return res.status(500).json({ error: error.message || 'Failed to create scenario' })
    }
    res.status(201).json(buildUserScenarioRow(data))
  } catch (err) {
    console.error('[api/user-scenarios] error:', err?.message)
    res.status(500).json({ error: err?.message || 'Failed to create scenario' })
  }
})

// Update user scenario (title, level, archived, payload)
app.patch('/api/user-scenarios/:id', async (req, res) => {
  const userId = requireUserScenarioAuth(req, res)
  if (!userId) return

  const { id } = req.params
  if (!id) return res.status(400).json({ error: 'Missing scenario id' })

  const { title, level, archived, payload } = req.body || {}
  const updates = { updated_at: new Date().toISOString() }
  if (typeof title === 'string' && title.trim()) updates.title = title.trim().slice(0, 500)
  if (USER_SCENARIO_LEVELS.includes(level)) updates.level = level
  if (typeof archived === 'boolean') updates.archived = archived
  if (typeof payload === 'object' && payload !== null) updates.payload = payload

  if (Object.keys(updates).length <= 1) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }

  try {
    const { data, error } = await safeSupabaseCall(
      () => supabase
        .from('user_roleplay_scenarios')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId)
        .select('id, user_id, title, level, archived, payload, created_at, updated_at')
        .single(),
      { timeoutMs: 15000, maxRetries: 2 }
    )
    if (error) {
      if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Scenario not found' })
      return res.status(500).json({ error: error.message || 'Failed to update scenario' })
    }
    res.json(buildUserScenarioRow(data))
  } catch (err) {
    console.error('[api/user-scenarios PATCH] error:', err?.message)
    res.status(500).json({ error: err?.message || 'Failed to update scenario' })
  }
})

// Delete user scenario
app.delete('/api/user-scenarios/:id', async (req, res) => {
  const userId = requireUserScenarioAuth(req, res)
  if (!userId) return

  const { id } = req.params
  if (!id) return res.status(400).json({ error: 'Missing scenario id' })

  try {
    const { error } = await safeSupabaseCall(
      () => supabase
        .from('user_roleplay_scenarios')
        .delete()
        .eq('id', id)
        .eq('user_id', userId),
      { timeoutMs: 15000, maxRetries: 2 }
    )
    if (error) {
      return res.status(500).json({ error: error.message || 'Failed to delete scenario' })
    }
    res.status(204).send()
  } catch (err) {
    console.error('[api/user-scenarios DELETE] error:', err?.message)
    res.status(500).json({ error: err?.message || 'Failed to delete scenario' })
  }
})

// ---------- End user roleplay scenarios ----------

// Speaking assessment — AI evaluates user speech by rubric (fluency, vocabulary, grammar, pronunciation, completeness, dialogue)
app.post('/api/agent/assess-speaking', async (req, res) => {
  const rawToken = getBearerToken(req)
  if (!rawToken) return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  const decoded = verifyBackendJwt(rawToken)
  if (!decoded || !decoded.sub) return res.status(401).json({ error: 'Invalid or expired token' })
  const userId = decoded.sub

  const balance = await getBalance(supabase, userId)
  if (balance < BALANCE_THRESHOLD_RUB) {
    return res.status(402).json({ error: 'Пополните баланс' })
  }

  const { messages, scenario_id, scenario_title, format, agent_session_id, goal, steps, topic, user_position, micro_goals, roleplay_settings } = req.body || {}
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Expected { messages: [{role, content}, ...] }' })
  }

  const userMessages = messages.filter((m) => m.role === 'user').map((m) => m.content).filter(Boolean)
  if (userMessages.length === 0) {
    return res.status(400).json({ error: 'No user messages to assess' })
  }

  const fmt = ['dialogue', 'monologue', 'presentation', 'debate'].includes(format) ? format : 'dialogue'
  const settings = roleplay_settings && typeof roleplay_settings === 'object' ? roleplay_settings : {}
  const slangMode = ['off', 'light', 'heavy'].includes(settings.slang_mode) ? settings.slang_mode : 'off'
  const allowProfanity = Boolean(settings.allow_profanity)
  const aiMayUseProfanity = allowProfanity && Boolean(settings.ai_may_use_profanity)
  const profanityIntensity = ['light', 'medium', 'hard'].includes(settings.profanity_intensity)
    ? settings.profanity_intensity
    : 'light'
  const parsedMicroGoals = Array.isArray(micro_goals)
    ? micro_goals
      .filter((g) => g && typeof g === 'object')
      .map((g) => ({
        goal_id: typeof g.goal_id === 'string' ? g.goal_id : '',
        goal_label: typeof g.goal_label === 'string' ? g.goal_label : '',
      }))
      .filter((g) => g.goal_id)
      .slice(0, 3)
    : []

  const scenarioContext =
    goal || (Array.isArray(steps) && steps.length > 0)
      ? [
        'SCENARIO CONTEXT (use this to judge completeness and dialogue_skills):',
        goal ? `Goal: ${typeof goal === 'string' ? goal : goal.titleEn || goal.goal || ''}` : '',
        Array.isArray(steps) && steps.length > 0
          ? 'Expected from the user: ' +
          steps.map((s) => (typeof s === 'string' ? s : s.titleEn || s.titleRu || s.title || '')).filter(Boolean).join('; ')
          : '',
      ]
        .filter(Boolean)
        .join('\n')
      : ''

  const completenessGuidance = scenarioContext
    ? "\nFor completeness and dialogue_skills: if the user addressed the scenario goal and the expected steps (gave required information, reacted, asked questions, took turns), give 8-10. Do not mark as 'insufficiently informative' or suggest 'give more complete answers' when they followed the scenario."
    : ''

  const debateGuidance = fmt === 'debate' && topic
    ? `
If format is 'debate':
- Evaluate argumentation quality: logical structure, use of examples, clarity of reasoning
- Evaluate counter-argument responses: did they address opponent's points directly? Did they challenge the opponent's logic?
- Evaluate debate phrases: use of connectors ("However", "Moreover", "On the other hand", "I disagree because", "That's not entirely true")
- Evaluate position defense: how well did they maintain and defend their position? Did they stay consistent?
- For completeness: did they present their position clearly, provide main arguments, respond to counter-arguments, and defend their stance?
- For dialogue_skills: did they engage in back-and-forth debate, listen to opponent's points, and respond appropriately?
`
    : ''
  const microGoalsGuidance = fmt === 'debate' && parsedMicroGoals.length > 0
    ? `
MICRO-GOALS (track these explicitly):
${parsedMicroGoals.map((g, i) => `${i + 1}. ${g.goal_label || g.goal_id} (id: ${g.goal_id})`).join('\n')}

For each micro-goal, determine whether the user achieved it in the transcript and include concise evidence.
`
    : ''
  const slangGuidance = (fmt === 'dialogue' || fmt === 'debate') && (slangMode !== 'off' || allowProfanity)
    ? `
If this session uses slang/profanity settings:
- Evaluate appropriateness: slang/profanity should match context and not replace meaning.
- Penalize random swearing without communicative purpose.
- Reward controlled register switching and clear intent under emotional tone.
- Add one concise style advice in "improvements" when needed.
`
    : ''

  const ASSESSMENT_SYSTEM = `You are an expert English speaking assessor (TEFL/TESOL). Evaluate the user's spoken English from the TRANSCRIPT of their messages in a conversation.

RUBRIC (1-10 each):
1. fluency: smooth speech, minimal pauses/hesitations, natural pace
2. vocabulary_grammar: variety of words, correct grammar, errors don't block understanding
3. pronunciation: clarity (assume transcript reflects intended pronunciation; evaluate word choice/phonetic plausibility from spelling)
4. completeness: topic coverage, logical structure, full answers (for roleplay: did they cover what the scenario required?)
5. dialogue_skills: (for dialogues) listening, reacting, asking questions, turn-taking
${completenessGuidance}${debateGuidance}${slangGuidance}

Return ONLY valid JSON, no markdown:
{
  "criteria_scores": {
    "fluency": 1-10,
    "vocabulary_grammar": 1-10,
    "pronunciation": 1-10,
    "completeness": 1-10,
    "dialogue_skills": 1-10
  },
  "overall_score": 1-10,
  "feedback": {
    "strengths": ["string"],
    "improvements": ["string"],
    "summary": "string",
    "goal_attainment": [
      {
        "goal_id": "string",
        "goal_label": "string",
        "achieved": true,
        "evidence": "short proof from transcript",
        "suggestion": "short next-step suggestion"
      }
    ]
  }
}${microGoalsGuidance}`

  const userText = userMessages.join('\n---\n')
  let context = scenario_title ? `Scenario: ${scenario_title}. ` : ''
  if (scenarioContext) context += '\n\n' + scenarioContext + '\n\n'
  if (fmt === 'debate' && topic) {
    context += `Debate topic: ${topic}. `
    if (user_position) context += `User position: ${user_position}. `
  }
  if (fmt === 'debate' && parsedMicroGoals.length > 0) {
    context += `\nMicro goals: ${parsedMicroGoals.map((g) => `${g.goal_id}${g.goal_label ? ` (${g.goal_label})` : ''}`).join(', ')}. `
  }

  const userPrompt = `${context}Format: ${fmt}.

Roleplay settings:
- slang_mode: ${slangMode}
- allow_profanity: ${allowProfanity}
- ai_may_use_profanity: ${aiMayUseProfanity}
- profanity_intensity: ${profanityIntensity}

TRANSCRIPT (user messages only):
${userText}

Evaluate and return JSON only.`

  try {
    const completion = await llm.chat.completions.create({
      model: AITUNNEL_MODEL,
      messages: [
        { role: 'system', content: ASSESSMENT_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 800,
      temperature: 0.3,
    })

    const usage = completion?.usage
    if (usage && (usage.input_tokens || usage.output_tokens)) {
      const costRub = getCost('deepseek-v3.2', usage)
      if (costRub > 0) {
        await deductBalance(supabase, userId, costRub, 'deepseek-v3.2', { assess_speaking: true })
      }
    }

    const raw = completion.choices?.[0]?.message?.content?.trim() || ''
    let json
    const m = raw.match(/\{[\s\S]*\}/)
    if (m) {
      try {
        json = JSON.parse(m[0])
      } catch {
        json = null
      }
    }

    if (!json || !json.criteria_scores) {
      console.error('[api/agent/assess-speaking] Invalid LLM response:', raw?.slice(0, 300))
      return res.status(500).json({ error: 'Assessment parsing failed' })
    }

    const scores = json.criteria_scores || {}
    const vals = Object.values(scores).filter((v) => typeof v === 'number')
    const overall = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0

    const goalAttainment = Array.isArray(json?.feedback?.goal_attainment)
      ? json.feedback.goal_attainment
        .filter((it) => it && typeof it === 'object')
        .map((it) => ({
          goal_id: typeof it.goal_id === 'string' ? it.goal_id : '',
          goal_label: typeof it.goal_label === 'string' ? it.goal_label : '',
          achieved: Boolean(it.achieved),
          evidence: typeof it.evidence === 'string' ? it.evidence : '',
          suggestion: typeof it.suggestion === 'string' ? it.suggestion : '',
        }))
        .filter((it) => it.goal_id)
      : []

    const feedbackObj = json && typeof json.feedback === 'object' && json.feedback !== null
      ? json.feedback
      : { strengths: [], improvements: [], summary: '' }

    const result = {
      criteria_scores: {
        fluency: clampScore(scores.fluency),
        vocabulary_grammar: clampScore(scores.vocabulary_grammar),
        pronunciation: clampScore(scores.pronunciation),
        completeness: clampScore(scores.completeness),
        dialogue_skills: clampScore(scores.dialogue_skills),
      },
      overall_score: Math.round(overall * 10) / 10,
      feedback: {
        ...feedbackObj,
        goal_attainment: goalAttainment,
      },
      user_messages: userMessages,
      format: fmt,
      scenario_id: scenario_id || null,
      scenario_title: scenario_title || null,
      agent_session_id: agent_session_id || null,
    }
    res.json(result)
  } catch (err) {
    console.error('[api/agent/assess-speaking] error:', err?.message)
    res.status(500).json({ error: err?.message || 'Assessment failed' })
  }
})

function clampScore(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 5
  return Math.max(1, Math.min(10, Math.round(n)))
}

// Karaoke YouTube transcription endpoint — requires Supabase auth
app.post('/api/karaoke/transcribe', async (req, res) => {

  try {
    const token = getBearerToken(req)
    if (!token) {
      return res.status(401).json({ error: 'Missing Authorization Bearer token' })
    }

    // Try to get user with timeout handling
    let userData, userErr
    try {
      const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
        throw err
      })
      userData = result.data
      userErr = result.error
    } catch (authError) {
      const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
      const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

      console.error('[api/karaoke/transcribe] Supabase auth error:', {
        message: errorMessage,
        code: errorCode,
        cause: authError?.cause,
        fullError: authError
      })

      if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
        return res.status(502).json({
          error: 'Не удалось подключиться к Supabase (таймаут соединения). Проверьте SUPABASE_URL и сеть.',
          details: {
            code: errorCode,
            message: errorMessage
          }
        })
      }
      throw authError
    }

    if (userErr || !userData?.user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const { youtubeUrl } = req.body || {}

    if (!youtubeUrl || typeof youtubeUrl !== 'string' || !youtubeUrl.trim()) {
      return res.status(400).json({ error: 'YouTube URL is required' })
    }

    // Extract YouTube video ID from URL
    const videoIdPatterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/
    ]
    let videoId = null
    for (const pattern of videoIdPatterns) {
      const match = youtubeUrl.trim().match(pattern)
      if (match) {
        videoId = match[1]
        break
      }
    }

    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL format' })
    }

    console.log('[api/karaoke/transcribe] Fetching YouTube subtitles using yt-dlp for video:', videoId)

    // Use yt-dlp to download subtitles
    const ytdlpCommand = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
    const downloadUrl = `https://www.youtube.com/watch?v=${videoId}`

    // Get video metadata first (title, thumbnail, etc.)
    let videoMetadata = null
    try {
      const metadataCommand = `"${ytdlpCommand}" --dump-json --no-warnings --skip-download "${downloadUrl}"`
      console.log('[api/karaoke/transcribe] Fetching video metadata...')
      const { stdout: metadataOutput } = await execAsync(metadataCommand)
      videoMetadata = JSON.parse(metadataOutput)
      console.log('[api/karaoke/transcribe] Video title:', videoMetadata.title)
    } catch (metadataError) {
      console.warn('[api/karaoke/transcribe] Failed to fetch metadata:', metadataError.message)
      // Continue without metadata
    }

    // Create temporary file for subtitles (without extension, yt-dlp will add it)
    const timestamp = Date.now()
    const subtitleBaseName = `subtitle_${timestamp}_${videoId}`
    const subtitleBasePath = path.join(uploadsDir, subtitleBaseName)

    // Download subtitles using yt-dlp
    // --write-auto-subs: get auto-generated subtitles
    // --write-subs: get manual subtitles  
    // Without --sub-lang, yt-dlp will download all available subtitles
    // --sub-format srt: get SRT format
    // --skip-download: don't download video, only subtitles
    // --convert-subs srt: convert to SRT if needed
    // Note: yt-dlp will create files like: subtitle_123_videoId.en.srt
    // We use %(ext)s placeholder, but for subtitles yt-dlp adds language code
    const subtitleCommand = `"${ytdlpCommand}" --write-auto-subs --write-subs --sub-format srt --convert-subs srt --skip-download -o "${subtitleBasePath.replace(/\\/g, '/')}.%(ext)s" "${downloadUrl}"`

    console.log('[api/karaoke/transcribe] Downloading subtitles from YouTube...')
    console.log('[api/karaoke/transcribe] Command:', subtitleCommand)
    let subtitleDownloadOutput
    try {
      const { stdout, stderr } = await execAsync(subtitleCommand)
      subtitleDownloadOutput = stdout + (stderr || '')
      console.log('[yt-dlp] stdout:', stdout)
      if (stderr) console.log('[yt-dlp] stderr:', stderr)
    } catch (downloadError) {
      console.error('[yt-dlp] Error downloading subtitles:', downloadError)
      console.error('[yt-dlp] Error stdout:', downloadError.stdout)
      console.error('[yt-dlp] Error stderr:', downloadError.stderr)

      // Check if subtitles are not available
      const errorText = (downloadError.message || '') + (downloadError.stderr || '') + (downloadError.stdout || '')
      if (errorText.includes('No subtitles') ||
        errorText.includes('subtitles are not available') ||
        errorText.includes('has no subtitles')) {
        return res.status(400).json({
          error: 'Субтитры недоступны для этого видео. Убедитесь, что у видео включены субтитры.',
          details: errorText
        })
      }
      throw downloadError
    }

    // Wait a bit for file system to sync
    await new Promise(resolve => setTimeout(resolve, 500))

    // Find the actual subtitle file (yt-dlp might add language code to filename)
    // yt-dlp creates files like: subtitle_123_videoId.en.srt or subtitle_123_videoId.srt
    let actualSubtitleFile = null
    const files = fs.readdirSync(uploadsDir)
    console.log('[api/karaoke/transcribe] Files in uploads dir:', files)
    console.log('[api/karaoke/transcribe] Looking for base name:', subtitleBaseName)
    console.log('[api/karaoke/transcribe] Video ID:', videoId)

    // Look for subtitle files matching our pattern
    // yt-dlp might create: subtitle_123_videoId.en.srt, subtitle_123_videoId.srt, etc.
    const subtitleFiles = files.filter(f => {
      const matchesBase = f.startsWith(subtitleBaseName) || f.includes(videoId)
      const isSubtitle = f.endsWith('.srt') || f.endsWith('.vtt')
      return matchesBase && isSubtitle
    })

    console.log('[api/karaoke/transcribe] Found subtitle files:', subtitleFiles)

    if (subtitleFiles.length > 0) {
      // Prefer .srt format, then .vtt
      // Also prefer English if available
      const englishSub = subtitleFiles.find(f => (f.includes('.en.') || f.includes('.en-')) && f.endsWith('.srt'))
      actualSubtitleFile = englishSub || subtitleFiles.find(f => f.endsWith('.srt')) || subtitleFiles[0]
      actualSubtitleFile = path.join(uploadsDir, actualSubtitleFile)
      console.log('[api/karaoke/transcribe] Using subtitle file:', actualSubtitleFile)
    } else {
      // Try to find any .srt file with video ID (broader search)
      const allSrtFiles = files.filter(f => f.includes(videoId) && (f.endsWith('.srt') || f.endsWith('.vtt')))
      console.log('[api/karaoke/transcribe] All SRT files with video ID:', allSrtFiles)
      if (allSrtFiles.length > 0) {
        actualSubtitleFile = path.join(uploadsDir, allSrtFiles[0])
        console.log('[api/karaoke/transcribe] Found subtitle file by video ID:', actualSubtitleFile)
      }
    }

    if (!actualSubtitleFile || !fs.existsSync(actualSubtitleFile)) {
      console.error('[api/karaoke/transcribe] Subtitle file not found.')
      console.error('[api/karaoke/transcribe] Available files:', files)
      console.error('[api/karaoke/transcribe] Looking for base name:', subtitleBaseName)
      console.error('[api/karaoke/transcribe] Video ID:', videoId)
      console.error('[api/karaoke/transcribe] yt-dlp output:', subtitleDownloadOutput?.substring(0, 1000))
      return res.status(400).json({
        error: 'Субтитры не найдены для этого видео',
        details: `Не удалось найти файл субтитров после загрузки. Проверьте логи сервера для деталей.`
      })
    }

    // Parse SRT subtitle file
    console.log('[api/karaoke/transcribe] Parsing subtitle file:', actualSubtitleFile)
    const subtitleContent = fs.readFileSync(actualSubtitleFile, 'utf-8')

    // Parse SRT format
    // SRT format: 
    // 1
    // 00:00:00,000 --> 00:00:02,500
    // Text here
    //
    const srtBlocks = subtitleContent.split(/\n\s*\n/).filter(block => block.trim())
    const segments = []

    for (const block of srtBlocks) {
      const lines = block.trim().split('\n')
      if (lines.length < 3) continue

      // Skip sequence number (first line)
      const timeLine = lines[1]
      const textLines = lines.slice(2)

      // Parse time: 00:00:00,000 --> 00:00:02,500
      const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/)
      if (!timeMatch) continue

      const startHours = parseInt(timeMatch[1])
      const startMinutes = parseInt(timeMatch[2])
      const startSeconds = parseInt(timeMatch[3])
      const startMs = parseInt(timeMatch[4])
      const start = startHours * 3600 + startMinutes * 60 + startSeconds + startMs / 1000

      const endHours = parseInt(timeMatch[5])
      const endMinutes = parseInt(timeMatch[6])
      const endSeconds = parseInt(timeMatch[7])
      const endMs = parseInt(timeMatch[8])
      const end = endHours * 3600 + endMinutes * 60 + endSeconds + endMs / 1000

      const text = textLines.join(' ').trim()

      if (text) {
        segments.push({
          start: Math.round(start * 100) / 100,
          end: Math.round(end * 100) / 100,
          text: text
        })
      }
    }

    // Clean up subtitle file
    try {
      fs.unlinkSync(actualSubtitleFile)
      // Also clean up any other subtitle files
      subtitleFiles.forEach(f => {
        const filePath = path.join(uploadsDir, f)
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      })
    } catch (cleanupError) {
      console.warn('[api/karaoke/transcribe] Failed to cleanup subtitle file:', cleanupError)
    }

    if (segments.length === 0) {
      return res.status(400).json({
        error: 'Субтитры не найдены для этого видео',
        details: 'Не удалось распарсить субтитры из файла'
      })
    }

    // Keep original segments from YouTube without merging
    // YouTube subtitles are already properly structured and synchronized
    // Each segment represents a line/phrase with correct timing
    // Merging would break the synchronization and visual structure
    const finalSegments = segments

    // Build full text from segments
    const fullText = finalSegments.map(s => s.text).join(' ').trim()

    // Save video to database
    const videoData = {
      user_id: userData.user.id,
      video_url: youtubeUrl.trim(),
      video_type: 'youtube',
      video_id: videoId,
      title: videoMetadata?.title || `YouTube: ${videoId}`,
      transcription_text: fullText,
      transcription_segments: finalSegments,
      language: 'youtube-subs' // Mark as YouTube subtitles source
    }

    try {
      const { error: dbError } = await supabase
        .from('user_videos')
        .insert([videoData])

      if (dbError) {
        console.error('[api/karaoke/transcribe] Error saving to database:', dbError)
        // Continue even if DB save fails - return transcription result anyway
      }
    } catch (dbErr) {
      console.error('[api/karaoke/transcribe] Database save error:', dbErr)
      // Continue even if DB save fails
    }

    return res.json({
      ok: true,
      videoId: videoId,
      title: videoMetadata?.title || null,
      thumbnail: videoMetadata?.thumbnail || null,
      text: fullText,
      language: 'youtube-subs',
      segments: finalSegments
    })
  } catch (err) {
    console.error('[api/karaoke/transcribe] error:', err)

    const code = err?.cause?.code || err?.code
    if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT') {
      return res.status(502).json({
        error: 'Таймаут соединения. Проверьте сеть и доступность сервисов.',
        details: {
          code,
          message: err.message
        }
      })
    }

    return res.status(500).json({
      error: 'Karaoke transcription request failed',
      details: err.message
    })
  }
})

// Get user's videos endpoint — requires Supabase auth
app.get('/api/videos', async (req, res) => {
  try {
    const token = getBearerToken(req)
    if (!token) {
      return res.status(401).json({ error: 'Missing Authorization Bearer token' })
    }

    // Try to get user with timeout handling and retry
    let userData, userErr
    try {
      const result = await safeSupabaseCall(
        () => supabase.auth.getUser(token),
        { timeoutMs: 20000, maxRetries: 2 }
      )
      userData = result.data
      userErr = result.error
    } catch (authError) {
      const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
      const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

      console.error('[api/videos] Supabase auth error:', {
        message: errorMessage,
        code: errorCode,
        cause: authError?.cause
      })

      if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
        return res.status(502).json({
          error: 'Не удалось подключиться к Supabase (таймаут соединения). Проверьте SUPABASE_URL и сеть.',
          details: {
            code: errorCode,
            message: errorMessage
          }
        })
      }
      throw authError
    }

    if (userErr || !userData?.user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    // Get user's videos from database
    const { data: videos, error: dbError } = await supabase
      .from('user_videos')
      .select('*')
      .eq('user_id', userData.user.id)
      .order('created_at', { ascending: false })

    if (dbError) {
      console.error('[api/videos] Database error:', dbError)
      return res.status(500).json({ error: 'Failed to fetch videos', details: dbError.message })
    }

    return res.json({
      ok: true,
      videos: videos || []
    })
  } catch (err) {
    console.error('[api/videos] error:', err)

    const code = err?.cause?.code || err?.code
    if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT') {
      return res.status(502).json({
        error: 'Таймаут соединения. Проверьте сеть и доступность сервисов.',
        details: {
          code,
          message: err.message
        }
      })
    }

    return res.status(500).json({
      error: 'Failed to fetch videos',
      details: err.message
    })
  }
})

// Get single video endpoint — requires Supabase auth
app.get('/api/videos/:id', async (req, res) => {
  try {
    const token = getBearerToken(req)
    if (!token) {
      return res.status(401).json({ error: 'Missing Authorization Bearer token' })
    }

    // Try to get user with timeout handling
    let userData, userErr
    try {
      const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
        throw err
      })
      userData = result.data
      userErr = result.error
    } catch (authError) {
      const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
      const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

      if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
        return res.status(502).json({
          error: 'Не удалось подключиться к Supabase (таймаут соединения). Проверьте SUPABASE_URL и сеть.',
          details: {
            code: errorCode,
            message: errorMessage
          }
        })
      }
      throw authError
    }

    if (userErr || !userData?.user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const videoId = req.params.id

    // Get video from database
    const { data: video, error: dbError } = await supabase
      .from('user_videos')
      .select('*')
      .eq('id', videoId)
      .eq('user_id', userData.user.id)
      .single()

    if (dbError) {
      if (dbError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Video not found' })
      }
      console.error('[api/videos/:id] Database error:', dbError)
      return res.status(500).json({ error: 'Failed to fetch video', details: dbError.message })
    }

    if (!video) {
      return res.status(404).json({ error: 'Video not found' })
    }

    return res.json({
      ok: true,
      video: video
    })
  } catch (err) {
    console.error('[api/videos/:id] error:', err)

    const code = err?.cause?.code || err?.code
    if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT') {
      return res.status(502).json({
        error: 'Таймаут соединения. Проверьте сеть и доступность сервисов.',
        details: {
          code,
          message: err.message
        }
      })
    }

    return res.status(500).json({
      error: 'Failed to fetch video',
      details: err.message
    })
  }
})

// Delete video endpoint — requires Supabase auth
app.delete('/api/videos/:id', async (req, res) => {
  try {
    const token = getBearerToken(req)
    if (!token) {
      return res.status(401).json({ error: 'Missing Authorization Bearer token' })
    }

    // Try to get user with timeout handling
    let userData, userErr
    try {
      const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
        throw err
      })
      userData = result.data
      userErr = result.error
    } catch (authError) {
      const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
      const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

      if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
        return res.status(502).json({
          error: 'Не удалось подключиться к Supabase (таймаут соединения). Проверьте SUPABASE_URL и сеть.',
          details: {
            code: errorCode,
            message: errorMessage
          }
        })
      }
      throw authError
    }

    if (userErr || !userData?.user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const videoId = req.params.id

    // Delete video from database
    const { error: dbError } = await supabase
      .from('user_videos')
      .delete()
      .eq('id', videoId)
      .eq('user_id', userData.user.id)

    if (dbError) {
      console.error('[api/videos/:id DELETE] Database error:', dbError)
      return res.status(500).json({ error: 'Failed to delete video', details: dbError.message })
    }

    return res.json({
      ok: true,
      message: 'Video deleted successfully'
    })
  } catch (err) {
    console.error('[api/videos/:id DELETE] error:', err)

    const code = err?.cause?.code || err?.code
    if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT') {
      return res.status(502).json({
        error: 'Таймаут соединения. Проверьте сеть и доступность сервисов.',
        details: {
          code,
          message: err.message
        }
      })
    }

    return res.status(500).json({
      error: 'Failed to delete video',
      details: err.message
    })
  }
})

// ============================================================================
// Vocabulary API - Вспомогательные функции
// ============================================================================

// Нормализация слова: lowercase, удаление пунктуации в начале/конце
function normalizeWord(word) {
  if (!word || typeof word !== 'string') return ''
  // Приводим к lowercase и удаляем пунктуацию в начале/конце
  // Оставляем апострофы для слов типа "don't", "I'm"
  return word.toLowerCase().trim().replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, '')
}

// Извлечение уникальных слов из текста с сохранением позиций
function extractWordsFromText(text, segments = null) {
  if (!text || typeof text !== 'string') return []

  const words = []
  const wordSet = new Set()

  // Разбиваем текст на слова (сохраняем позиции)
  const wordRegex = /\b[\w']+\b/g
  let match

  while ((match = wordRegex.exec(text)) !== null) {
    const originalWord = match[0]
    const normalized = normalizeWord(originalWord)

    // Пропускаем пустые слова и очень короткие (1-2 символа, кроме важных слов)
    if (!normalized || normalized.length < 2) continue

    // Пропускаем очень частые слова (a, an, the, is, are, etc.)
    const stopWords = new Set([
      'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'i', 'you', 'he', 'she', 'it',
      'we', 'they', 'this', 'that', 'these', 'those', 'me', 'him', 'her', 'us', 'them'
    ])

    if (stopWords.has(normalized)) continue

    // Извлекаем контекст (10 слов до и после)
    // Находим все вхождения слова и берем первое
    const wordRegex2 = new RegExp(`\\b${originalWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
    const firstMatch = wordRegex2.exec(text)

    let contextText = ''
    if (firstMatch) {
      const wordPos = firstMatch.index
      // Находим начало и конец предложения или берем окрестность из 50 символов
      const contextStart = Math.max(0, wordPos - 100)
      const contextEnd = Math.min(text.length, wordPos + originalWord.length + 100)
      contextText = text.substring(contextStart, contextEnd).trim()

      // Обрезаем до целых слов
      const wordsBefore = contextText.substring(0, wordPos - contextStart).split(/\s+/).length
      const wordsAfter = contextText.substring(wordPos - contextStart + originalWord.length).split(/\s+/).length
      const maxWords = 10
      const wordsToTakeBefore = Math.min(wordsBefore, maxWords)
      const wordsToTakeAfter = Math.min(wordsAfter, maxWords)

      const allWordsInContext = contextText.split(/\s+/)
      const startIndex = Math.max(0, wordsBefore - wordsToTakeBefore)
      const endIndex = Math.min(allWordsInContext.length, wordsBefore + wordsToTakeAfter + 1)
      contextText = allWordsInContext.slice(startIndex, endIndex).join(' ')
    } else {
      // Если не нашли точное совпадение, берем окрестность по позиции match.index
      const contextStart = Math.max(0, match.index - 100)
      const contextEnd = Math.min(text.length, match.index + originalWord.length + 100)
      contextText = text.substring(contextStart, contextEnd).trim()
    }

    // Добавляем слово с уникальным ключом
    const wordKey = normalized
    if (!wordSet.has(wordKey)) {
      wordSet.add(wordKey)
      words.push({
        word: normalized,
        originalText: originalWord,
        context: contextText,
        position: match.index,
        length: originalWord.length
      })
    }
  }

  return words
}

// Получение определения слова через AI
// ВНИМАНИЕ: Эта функция вызывает AI и тратит токены!
// Вызывать только по явному запросу пользователя (клик на слово, добавление в словарь)
async function getWordDefinitionFromAI(word) {
  try {
    const prompt = `Проанализируй английское слово "${word}" и верни JSON с следующей структурой:
{
  "word": "${word}",
  "translations": ["перевод1", "перевод2"],
  "phonetic_transcription": "/транскрипция/",
  "part_of_speech": "noun|verb|adjective|adverb|pronoun|preposition|conjunction|interjection",
  "difficulty_level": "A1|A2|B1|B2|C1|C2",
  "frequency_rank": число_от_1_до_10000,
  "is_phrase": true/false,
  "example_sentences": ["пример1", "пример2"]
}

Учти:
- difficulty_level: A1=элементарный, A2=базовый, B1=средний, B2=средне-продвинутый, C1=продвинутый, C2=профессиональный
- Если слово является фразовым глаголом или идиомой, установи is_phrase: true
- example_sentences должны быть короткими и понятными примерами использования
- frequency_rank: 1 = самое частое слово, 10000 = редкое слово

Отвечай только JSON, без дополнительного текста.`

    const chatResult = await llm.chat.completions.create({
      model: AITUNNEL_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Ты эксперт по английскому языку. Отвечай строго в формате JSON без дополнительных комментариев.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 1000,
      temperature: 0.3 // Низкая температура для более точных результатов
    })

    const usage = chatResult?.usage || null
    const responseText = chatResult.choices?.[0]?.message?.content?.trim() || '{}'

    // Пытаемся извлечь JSON из ответа (может быть обернут в markdown code blocks)
    let jsonText = responseText
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      jsonText = jsonMatch[1]
    }

    const definition = JSON.parse(jsonText)

    // Валидация и нормализация
    const def = {
      word: definition.word || word,
      definitions: Array.isArray(definition.translations)
        ? definition.translations.map(t => ({ translation: t, source: 'ai' }))
        : [],
      phonetic_transcription: definition.phonetic_transcription || null,
      part_of_speech: definition.part_of_speech || null,
      difficulty_level: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(definition.difficulty_level)
        ? definition.difficulty_level
        : null,
      frequency_rank: typeof definition.frequency_rank === 'number' ? definition.frequency_rank : null,
      is_phrase: Boolean(definition.is_phrase),
      example_sentences: Array.isArray(definition.example_sentences) ? definition.example_sentences : []
    }
    return { definition: def, usage }
  } catch (error) {
    console.error('[getWordDefinitionFromAI] Error:', error)
    // Возвращаем минимальную структуру в случае ошибки
    return {
      definition: {
        word: word,
        definitions: [],
        phonetic_transcription: null,
        part_of_speech: null,
        difficulty_level: null,
        frequency_rank: null,
        is_phrase: false,
        example_sentences: []
      },
      usage: null
    }
  }
}

// Оценка количества токенов для анализа текста на идиомы
// Простая эвристика: 1 токен ≈ 3.5 символа
function estimateTokensForText(text = '') {
  if (!text || typeof text !== 'string') return 0
  const length = text.trim().length
  if (length <= 0) return 0
  return Math.ceil(length / 3.5)
}

// Анализ текста на идиомы через AI
// Возвращает массив идиом с переводом и примерами
async function analyzeIdiomsWithAI(text, options = {}) {
  const maxIdioms = options.maxIdioms || 20

  const prompt = `Ты преподаватель английского, специализирующийся на идиомах и устойчивых выражениях.

Проанализируй следующий текст песни и найди в нём английские идиомы, фразовые глаголы и устойчивые выражения.

Для КАЖДОЙ найденной идиомы верни JSON в следующем формате (массив объектов):
[
  {
    "phrase": "идиома на английском",
    "literal_translation": "дословный перевод на русском",
    "meaning": "краткое человеческое объяснение смысла на русском",
    "usage_examples": [
      "пример предложения 1 (английский) с коротким переводом в скобках на русском",
      "пример предложения 2 (английский) с коротким переводом в скобках на русском"
    ]
  }
]

Требования:
- Включай только действительно устойчивые выражения, фразовые глаголы и идиомы, а не отдельные обычные слова.
- Максимум ${maxIdioms} идиом, выбирай самые важные и полезные для изучающего язык.
- Объяснения должны быть простыми и понятными для уровня B1–B2.
- Если идиом нет, верни пустой массив [].

ТЕКСТ ПЕСНИ:
${text}

Отвечай СТРОГО в формате JSON массива, без пояснений и без markdown.`

  const chatResult = await llm.chat.completions.create({
    model: AITUNNEL_MODEL,
    messages: [
      {
        role: 'system',
        content: 'Ты преподаватель английского языка. Отвечай строго в формате JSON, без дополнительного текста и без markdown.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    max_tokens: 1200,
    temperature: 0.4
  })

  const usage = chatResult?.usage || null
  const raw = chatResult.choices?.[0]?.message?.content?.trim() || '[]'

  // На всякий случай пытаемся вытащить JSON из markdown-кода, если модель так ответит
  let jsonText = raw
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (jsonMatch) {
    jsonText = jsonMatch[1]
  }

  let idioms = []
  try {
    const parsed = JSON.parse(jsonText)
    if (Array.isArray(parsed)) {
      idioms = parsed
    }
  } catch (e) {
    console.error('[analyzeIdiomsWithAI] Failed to parse JSON:', e)
    idioms = []
  }

  // Нормализуем структуру
  const list = idioms
    .filter(i => i && typeof i.phrase === 'string')
    .map(i => ({
      phrase: i.phrase.trim(),
      literal_translation: i.literal_translation || '',
      meaning: i.meaning || '',
      usage_examples: Array.isArray(i.usage_examples) ? i.usage_examples : []
    }))
  return { idioms: list, usage }
}

// Анализ текста на фразовые глаголы через AI
// Возвращает массив фразовых глаголов с переводом и примерами
async function analyzePhrasalVerbsWithAI(text, options = {}) {
  const maxPhrasalVerbs = options.maxPhrasalVerbs || 20

  const prompt = `Ты преподаватель английского, специализирующийся на фразовых глаголах.

Проанализируй следующий текст песни и найди в нём ТОЛЬКО фразовые глаголы (phrasal verbs).

Фразовый глагол - это глагол + предлог/наречие, которые вместе имеют особое значение (например: "give up", "look after", "break down", "turn on").

Для КАЖДОГО найденного фразового глагола верни JSON в следующем формате (массив объектов):
[
  {
    "phrase": "фразовый глагол на английском",
    "literal_translation": "дословный перевод на русском",
    "meaning": "краткое человеческое объяснение смысла на русском",
    "usage_examples": [
      "пример предложения 1 (английский) с коротким переводом в скобках на русском",
      "пример предложения 2 (английский) с коротким переводом в скобках на русском"
    ]
  }
]

Требования:
- Включай ТОЛЬКО фразовые глаголы (глагол + предлог/наречие), а не обычные глаголы или идиомы.
- Максимум ${maxPhrasalVerbs} фразовых глаголов, выбирай самые важные и полезные для изучающего язык.
- Объяснения должны быть простыми и понятными для уровня B1–B2.
- Если фразовых глаголов нет, верни пустой массив [].

ТЕКСТ ПЕСНИ:
${text}

Отвечай СТРОГО в формате JSON массива, без пояснений и без markdown.`

  const chatResult = await llm.chat.completions.create({
    model: AITUNNEL_MODEL,
    messages: [
      {
        role: 'system',
        content: 'Ты преподаватель английского языка, специализирующийся на фразовых глаголах. Отвечай строго в формате JSON, без дополнительного текста и без markdown.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    max_tokens: 1200,
    temperature: 0.4
  })

  const usage = chatResult?.usage || null
  const raw = chatResult.choices?.[0]?.message?.content?.trim() || '[]'

  // На всякий случай пытаемся вытащить JSON из markdown-кода, если модель так ответит
  let jsonText = raw
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (jsonMatch) {
    jsonText = jsonMatch[1]
  }

  // Очищаем JSON от недопустимых управляющих символов (кроме допустимых \n, \r, \t)
  // Удаляем только символы, которые не могут быть в валидном JSON
  jsonText = jsonText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

  let phrasalVerbs = []
  try {
    const parsed = JSON.parse(jsonText)
    if (Array.isArray(parsed)) {
      phrasalVerbs = parsed
    }
  } catch (e) {
    console.error('[analyzePhrasalVerbsWithAI] Failed to parse JSON:', e)
    console.error('[analyzePhrasalVerbsWithAI] JSON text:', jsonText.substring(0, 500))
    phrasalVerbs = []
  }

  // Нормализуем структуру
  const list = phrasalVerbs
    .filter(pv => pv && typeof pv.phrase === 'string')
    .map(pv => ({
      phrase: pv.phrase.trim(),
      literal_translation: pv.literal_translation || '',
      meaning: pv.meaning || '',
      usage_examples: Array.isArray(pv.usage_examples) ? pv.usage_examples : []
    }))
  return { phrasalVerbs: list, usage }
}

// Получение или создание определения слова (с кэшированием)
// ВНИМАНИЕ: Вызывает AI только если слова нет в кэше!
// Использовать только когда пользователь явно запросил определение (клик на слово, добавление)
async function getOrCreateWordDefinition(word) {
  const normalizedWord = normalizeWord(word)
  if (!normalizedWord) {
    throw new Error('Invalid word')
  }

  // Проверяем кэш
  const { data: cached, error: cacheError } = await safeSupabaseCall(
    () => supabase
      .from('word_definitions_cache')
      .select('*')
      .eq('word', normalizedWord)
      .single(),
    { timeoutMs: 10000, maxRetries: 1 }
  )

  if (cached && !cacheError) {
    return { ...cached, cached_at: cached.cached_at || new Date().toISOString(), usage: null }
  }

  // Если нет в кэше, получаем через AI
  const { definition, usage } = await getWordDefinitionFromAI(normalizedWord)

  // Сохраняем в кэш (используем сервисный ключ, который обходит RLS)
  const { error: insertError } = await safeSupabaseCall(
    () => supabase
      .from('word_definitions_cache')
      .upsert({
        word: normalizedWord,
        definitions: definition.definitions,
        phonetic_transcription: definition.phonetic_transcription,
        part_of_speech: definition.part_of_speech,
        difficulty_level: definition.difficulty_level,
        frequency_rank: definition.frequency_rank,
        is_phrase: definition.is_phrase,
        example_sentences: definition.example_sentences,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'word'
      }),
    { timeoutMs: 10000, maxRetries: 1 }
  )

  if (insertError) {
    console.error('[getOrCreateWordDefinition] Failed to cache definition:', insertError)
  }

  return {
    word: normalizedWord,
    ...definition,
    cached_at: new Date().toISOString(),
    usage
  }
}

// ============================================================================
// Vocabulary API Endpoints
// ============================================================================

// Extract words from text or video — requires Supabase auth
app.post('/api/vocabulary/extract', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const { video_id, text } = req.body || {}

  // Если передан video_id, получаем текст из видео
  let textToProcess = text
  let videoData = null

  if (video_id) {
    const { data: video, error: videoError } = await safeSupabaseCall(
      () => supabase
        .from('user_videos')
        .select('transcription_text, transcription_segments, title')
        .eq('id', video_id)
        .eq('user_id', userData.user.id)
        .single(),
      { timeoutMs: 15000, maxRetries: 2 }
    )

    if (videoError || !video) {
      return res.status(404).json({ error: 'Video not found' })
    }

    textToProcess = video.transcription_text || ''
    videoData = video
  }

  if (!textToProcess || typeof textToProcess !== 'string') {
    return res.status(400).json({ error: 'Text or video_id with transcription is required' })
  }

  // Извлекаем слова из текста
  const extractedWords = extractWordsFromText(textToProcess, videoData?.transcription_segments)

  if (extractedWords.length === 0) {
    return res.json({
      ok: true,
      words: [],
      total: 0,
      with_definitions: 0
    })
  }

  // Батч-проверка кэша: получаем определения для всех слов одним запросом
  // Это экономит запросы к БД и не вызывает AI автоматически
  const normalizedWords = extractedWords.map(w => w.word)
  const { data: cachedDefinitions, error: cacheError } = await safeSupabaseCall(
    () => supabase
      .from('word_definitions_cache')
      .select('word, definitions, phonetic_transcription, part_of_speech, difficulty_level, frequency_rank, is_phrase, example_sentences')
      .in('word', normalizedWords),
    { timeoutMs: 15000, maxRetries: 2 }
  )

  // Создаем мапу для быстрого поиска определений из кэша
  const definitionsMap = new Map()
  if (cachedDefinitions && !cacheError) {
    cachedDefinitions.forEach(def => {
      definitionsMap.set(def.word, {
        translations: def.definitions || [],
        phonetic_transcription: def.phonetic_transcription,
        part_of_speech: def.part_of_speech,
        difficulty_level: def.difficulty_level,
        frequency_rank: def.frequency_rank,
        is_phrase: def.is_phrase || false,
        example_sentences: def.example_sentences || [],
        from_cache: true
      })
    })
  }

  // Формируем результат: добавляем определения из кэша, если они есть
  // AI НЕ вызывается автоматически - только по явному запросу через /define
  const wordsWithDefinitions = extractedWords.map(wordData => {
    const cachedDef = definitionsMap.get(wordData.word)
    return {
      word: wordData.word,
      originalText: wordData.originalText,
      context: wordData.context,
      definition: cachedDef || null // null означает, что определения нет в кэше - нужно запросить через /define
    }
  })

  const withDefinitionsCount = Array.from(definitionsMap.keys()).length

  return res.json({
    ok: true,
    words: wordsWithDefinitions,
    total: extractedWords.length,
    with_definitions: withDefinitionsCount,
    message: 'Определения загружены из кэша. Для новых слов используйте /api/vocabulary/define'
  })
}))

// Оценка токенов для анализа идиом — требует Supabase auth
app.post('/api/vocabulary/idioms/estimate', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const { video_id, text, max_idioms = 20 } = req.body || {}

  let textToProcess = text

  // Если передан video_id – берем текст из видео
  if (video_id && !textToProcess) {
    const { data: video, error: videoError } = await safeSupabaseCall(
      () => supabase
        .from('user_videos')
        .select('transcription_text')
        .eq('id', video_id)
        .eq('user_id', userData.user.id)
        .single(),
      { timeoutMs: 15000, maxRetries: 2 }
    )

    if (videoError || !video) {
      return res.status(404).json({ error: 'Video not found' })
    }

    textToProcess = video.transcription_text || ''
  }

  if (!textToProcess || typeof textToProcess !== 'string') {
    return res.status(400).json({ error: 'Text or video_id with transcription is required' })
  }

  const cleanedText = textToProcess.slice(0, 8000) // защита от слишком длинных текстов
  const promptTokens = estimateTokensForText(cleanedText) + 600 // инструкция + служебные токены
  const completionTokens = 30 * Math.min(Number(max_idioms) || 20, 50) // грубая оценка
  const totalTokens = promptTokens + completionTokens

  return res.json({
    ok: true,
    estimated_tokens_prompt: promptTokens,
    estimated_tokens_completion: completionTokens,
    estimated_tokens_total: totalTokens
  })
}))

// Get word definition — requires Supabase auth
// ВНИМАНИЕ: Это единственное место, где AI вызывается по явному запросу пользователя
// Вызывается только когда пользователь кликает на слово для получения определения
app.get('/api/vocabulary/define', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
  const userId = userData.user.id

  const balance = await getBalance(supabase, userId)
  if (balance < BALANCE_THRESHOLD_RUB) {
    return res.status(402).json({ error: 'Пополните баланс' })
  }

  const word = req.query.word
  if (!word || typeof word !== 'string') {
    return res.status(400).json({ error: 'Word parameter is required' })
  }

  try {
    const definition = await getOrCreateWordDefinition(word)
    if (definition.usage) {
      const costRub = getCost('deepseek-v3.2', definition.usage)
      if (costRub > 0) {
        const deductResult = await deductBalance(supabase, userId, costRub, 'deepseek-v3.2', { vocabulary_define: true })
        if (!deductResult.ok) {
          console.error('[api/vocabulary/define] Deduct failed:', deductResult.error)
          return res.status(402).json({ error: 'Недостаточно средств. Пополните баланс.' })
        }
      }
    }
    return res.json({
      ok: true,
      word: definition.word,
      definition: {
        translations: definition.definitions || [],
        phonetic_transcription: definition.phonetic_transcription,
        part_of_speech: definition.part_of_speech,
        difficulty_level: definition.difficulty_level,
        frequency_rank: definition.frequency_rank,
        is_phrase: definition.is_phrase,
        example_sentences: definition.example_sentences || [],
        cached_at: definition.cached_at || new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('[api/vocabulary/define] Error:', error)
    return res.status(500).json({
      error: 'Failed to get word definition',
      details: error.message
    })
  }
}))

// Add word to vocabulary — requires Supabase auth
// ВНИМАНИЕ: Вызывает AI только если слова нет в кэше (оправдано - пользователь явно добавляет слово)
app.post('/api/vocabulary/add', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
  const userId = userData.user.id

  const balance = await getBalance(supabase, userId)
  if (balance < BALANCE_THRESHOLD_RUB) {
    return res.status(402).json({ error: 'Пополните баланс' })
  }

  const { word, video_id, context } = req.body || {}

  if (!word || typeof word !== 'string') {
    return res.status(400).json({ error: 'Word is required' })
  }

  const normalizedWord = normalizeWord(word)
  if (!normalizedWord) {
    return res.status(400).json({ error: 'Invalid word' })
  }

  // Получаем определение слова (с AI только если нет в кэше)
  const definition = await getOrCreateWordDefinition(normalizedWord)
  if (definition.usage) {
    const costRub = getCost('deepseek-v3.2', definition.usage)
    if (costRub > 0) {
      const deductResult = await deductBalance(supabase, userId, costRub, 'deepseek-v3.2', { vocabulary_add: true })
      if (!deductResult.ok) {
        console.error('[api/vocabulary/add] Deduct failed:', deductResult.error)
        return res.status(402).json({ error: 'Недостаточно средств. Пополните баланс.' })
      }
    }
  }

  // Проверяем, есть ли уже это слово в словаре пользователя
  const { data: existingWord } = await safeSupabaseCall(
    () => supabase
      .from('user_vocabulary')
      .select('id, contexts, difficulty_level, part_of_speech, times_seen')
      .eq('user_id', userData.user.id)
      .eq('word', normalizedWord)
      .single(),
    { timeoutMs: 10000, maxRetries: 1 }
  )

  let contextsArray = []
  if (video_id && context) {
    contextsArray.push({
      video_id,
      text: context,
      timestamp: new Date().toISOString()
    })
  }

  // Если слово уже есть, обновляем контексты
  if (existingWord) {
    const existingContexts = existingWord.contexts || []
    if (video_id && context) {
      // Добавляем новый контекст, если его еще нет
      const contextExists = existingContexts.some(c => c.video_id === video_id && c.text === context)
      if (!contextExists) {
        contextsArray = [...existingContexts, ...contextsArray]
      } else {
        contextsArray = existingContexts
      }
    } else {
      contextsArray = existingContexts
    }

    // Обновляем запись
    const { data: updated, error: updateError } = await safeSupabaseCall(
      () => supabase
        .from('user_vocabulary')
        .update({
          contexts: contextsArray,
          difficulty_level: definition.difficulty_level || existingWord.difficulty_level,
          part_of_speech: definition.part_of_speech || existingWord.part_of_speech,
          times_seen: (existingWord.times_seen || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingWord.id)
        .select()
        .single(),
      { timeoutMs: 15000, maxRetries: 2 }
    )

    if (updateError) {
      console.error('[api/vocabulary/add] Update error:', updateError)
      return res.status(500).json({ error: 'Failed to update word in vocabulary', details: updateError.message })
    }

    // Обновляем прогресс - устанавливаем next_review_at для немедленного повторения
    const now = new Date()
    await safeSupabaseCall(
      () => supabase
        .from('vocabulary_progress')
        .upsert({
          user_id: userData.user.id,
          word: normalizedWord,
          added_from_video_id: video_id || null,
          next_review_at: now.toISOString() // Устанавливаем для немедленного повторения
        }, {
          onConflict: 'user_id,word'
        }),
      { timeoutMs: 10000, maxRetries: 1 }
    )

    return res.json({
      ok: true,
      word: updated || existingWord,
      message: 'Word updated in vocabulary'
    })
  }

  // Создаем новую запись
  const { data: newWord, error: insertError } = await safeSupabaseCall(
    () => supabase
      .from('user_vocabulary')
      .insert({
        user_id: userData.user.id,
        word: normalizedWord,
        translations: definition.definitions || [],
        contexts: contextsArray,
        difficulty_level: definition.difficulty_level,
        part_of_speech: definition.part_of_speech,
        mastery_level: 1,
        times_seen: 1
      })
      .select()
      .single(),
    { timeoutMs: 15000, maxRetries: 2 }
  )

  if (insertError) {
    console.error('[api/vocabulary/add] Insert error:', insertError)
    return res.status(500).json({ error: 'Failed to add word to vocabulary', details: insertError.message })
  }

  // Создаем прогресс с next_review_at для немедленного повторения
  const now = new Date()
  await safeSupabaseCall(
    () => supabase
      .from('vocabulary_progress')
      .upsert({
        user_id: userData.user.id,
        word: normalizedWord,
        added_from_video_id: video_id || null,
        learning_status: 'new',
        next_review_at: now.toISOString() // Устанавливаем для немедленного повторения
      }, {
        onConflict: 'user_id,word'
      }),
    { timeoutMs: 10000, maxRetries: 1 }
  )

  // Также обновляем next_review_at в user_vocabulary
  await safeSupabaseCall(
    () => supabase
      .from('user_vocabulary')
      .update({
        next_review_at: now.toISOString()
      })
      .eq('user_id', userData.user.id)
      .eq('word', normalizedWord),
    { timeoutMs: 10000, maxRetries: 1 }
  )

  return res.json({
    ok: true,
    word: newWord,
    message: 'Word added to vocabulary'
  })
}))

// Bulk delete words from vocabulary — requires Supabase auth
app.post('/api/vocabulary/words/bulk-delete', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const { ids } = req.body || {}
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array is required' })
  }

  const uniqueIds = Array.from(new Set(ids.filter(id => typeof id === 'string' && id.trim().length > 0)))
  if (uniqueIds.length === 0) {
    return res.status(400).json({ error: 'No valid ids provided' })
  }

  const { error: deleteError } = await safeSupabaseCall(
    () => supabase
      .from('user_vocabulary')
      .delete()
      .eq('user_id', userData.user.id)
      .in('id', uniqueIds),
    { timeoutMs: 20000, maxRetries: 2 }
  )

  if (deleteError) {
    console.error('[api/vocabulary/words/bulk-delete] Error:', deleteError)
    return res.status(500).json({ error: 'Failed to bulk delete words', details: deleteError.message })
  }

  return res.json({ ok: true, deleted_ids: uniqueIds })
}))

// List user vocabulary — requires Supabase auth
app.get('/api/vocabulary/list', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  // Параметры запроса
  const {
    status, // learning_status
    difficulty_level,
    mastery_level,
    search, // поиск по слову
    category_id, // фильтр по категории
    limit = 50,
    offset = 0,
    sort_by = 'word', // word, mastery_level, difficulty_level
    sort_order = 'desc' // asc, desc
  } = req.query || {}

  // Построение запроса
  let query = supabase
    .from('user_vocabulary')
    .select('*')
    .eq('user_id', userData.user.id)

  // Фильтр по категории
  if (category_id) {
    // Если указана категория, получаем слова через связующую таблицу
    const { data: vocabularyIds, error: vocabIdsError } = await safeSupabaseCall(
      () => supabase
        .from('user_vocabulary_categories')
        .select('vocabulary_id')
        .eq('user_id', userData.user.id)
        .eq('category_id', category_id),
      { timeoutMs: 10000, maxRetries: 2 }
    )

    if (vocabIdsError) {
      console.error('[api/vocabulary/list] Error fetching category words:', vocabIdsError)
      return res.status(500).json({ error: 'Failed to fetch words by category', details: vocabIdsError.message })
    }

    const ids = (vocabularyIds || []).map(v => v.vocabulary_id)
    if (ids.length === 0) {
      // Нет слов в этой категории
      return res.json({
        ok: true,
        words: [],
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: 0
        },
        stats: {
          total_words: 0,
          mastered_words: 0,
          learning_words: 0,
          new_words: 0,
          words_to_review: 0
        }
      })
    }
    query = query.in('id', ids)
  }

  // Фильтры
  if (difficulty_level && ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(difficulty_level)) {
    query = query.eq('difficulty_level', difficulty_level)
  }

  if (mastery_level && parseInt(mastery_level) >= 1 && parseInt(mastery_level) <= 5) {
    query = query.eq('mastery_level', parseInt(mastery_level))
  }

  if (search) {
    query = query.ilike('word', `%${search}%`)
  }

  // Сортировка
  if (['word', 'mastery_level', 'difficulty_level', 'times_seen', 'times_practiced'].includes(sort_by)) {
    query = query.order(sort_by, { ascending: sort_order === 'asc' })
  } else {
    query = query.order('word', { ascending: true })
  }

  // Пагинация
  query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

  const { data: words, error: wordsError } = await safeSupabaseCall(
    () => query,
    { timeoutMs: 15000, maxRetries: 2 }
  )

  if (wordsError) {
    console.error('[api/vocabulary/list] Error:', wordsError)
    return res.status(500).json({ error: 'Failed to fetch vocabulary', details: wordsError.message })
  }

  // Получаем прогресс для всех слов
  const wordList = words || []
  let progressMap = {}

  if (wordList.length > 0) {
    const wordNormalized = wordList.map(w => w.word)
    const { data: progressData } = await safeSupabaseCall(
      () => supabase
        .from('vocabulary_progress')
        .select('word, review_count, last_review_score, consecutive_correct, consecutive_incorrect, next_review_at')
        .eq('user_id', userData.user.id)
        .in('word', wordNormalized),
      { timeoutMs: 15000, maxRetries: 2 }
    )

    if (progressData) {
      progressMap = progressData.reduce((acc, p) => {
        acc[p.word] = p
        return acc
      }, {})
    }
  }

  // Получаем категории для всех слов
  let categoriesMap = {}
  if (wordList.length > 0) {
    const vocabularyIds = wordList.map(w => w.id)
    const { data: categoriesData } = await safeSupabaseCall(
      () => supabase
        .from('user_vocabulary_categories')
        .select(`
          vocabulary_id,
          category:vocabulary_categories(id, name, description, color, icon)
        `)
        .eq('user_id', userData.user.id)
        .in('vocabulary_id', vocabularyIds),
      { timeoutMs: 15000, maxRetries: 2 }
    )

    if (categoriesData) {
      categoriesMap = categoriesData.reduce((acc, item) => {
        if (!acc[item.vocabulary_id]) {
          acc[item.vocabulary_id] = []
        }
        if (item.category) {
          acc[item.vocabulary_id].push(item.category)
        }
        return acc
      }, {})
    }
  }

  // Собираем список video_id из contexts всех слов, чтобы подтянуть метаданные песен
  const videoIds = Array.from(new Set(
    wordList
      .flatMap(word => {
        if (!word.contexts || !Array.isArray(word.contexts)) return []
        return word.contexts
          .map(ctx => ctx?.video_id)
          .filter(id => !!id)
      })
  ))

  let videosById = new Map()

  if (videoIds.length > 0) {
    const { data: videos, error: videosError } = await safeSupabaseCall(
      () => supabase
        .from('user_videos')
        .select('id, title, video_url, video_type, video_id')
        .eq('user_id', userData.user.id)
        .in('id', videoIds),
      { timeoutMs: 20000, maxRetries: 2 }
    )

    if (videosError) {
      console.error('[api/vocabulary/list] Error loading videos:', videosError)
    } else if (videos) {
      videosById = new Map(videos.map(v => [v.id, v]))
    }
  }

  // Объединяем слова с прогрессом, категориями и видео
  let wordsWithProgress = wordList.map(word => {
    // Извлекаем уникальные видео из contexts
    const wordVideos = []
    if (word.contexts && Array.isArray(word.contexts)) {
      const seenVideoIds = new Set()
      for (const ctx of word.contexts) {
        if (ctx?.video_id && !seenVideoIds.has(ctx.video_id)) {
          seenVideoIds.add(ctx.video_id)
          const video = videosById.get(ctx.video_id)
          if (video) {
            wordVideos.push({
              id: video.id,
              title: video.title || video.video_url || '',
              video_type: video.video_type,
              video_id: video.video_id,
              video_url: video.video_url
            })
          }
        }
      }
    }

    return {
      ...word,
      progress: progressMap[word.word] || null,
      categories: categoriesMap[word.id] || [],
      videos: wordVideos
    }
  })

  // Получаем статистику
  const { data: stats } = await safeSupabaseCall(
    () => supabase
      .from('user_vocabulary_stats')
      .select('*')
      .eq('user_id', userData.user.id)
      .single(),
    { timeoutMs: 10000, maxRetries: 1 }
  )

  return res.json({
    ok: true,
    words: wordsWithProgress,
    pagination: {
      limit: parseInt(limit),
      offset: parseInt(offset),
      total: wordsWithProgress.length
    },
    stats: stats || {
      total_words: 0,
      mastered_words: 0,
      learning_words: 0,
      new_words: 0,
      words_to_review: 0
    }
  })
}))

// Export vocabulary — requires Supabase auth
app.get('/api/vocabulary/export', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const format = req.query.format || 'json' // csv, json, anki
  const viewMode = req.query.view_mode || 'words' // words, idioms, phrasal-verbs
  const search = req.query.search
  const difficulty = req.query.difficulty
  const categoryId = req.query.category_id
  const idiomCategoryId = req.query.idiom_category_id
  const phrasalVerbCategoryId = req.query.phrasal_verb_category_id

  // Export based on view mode
  if (viewMode === 'idioms') {
    // Export idioms
    let query = supabase
      .from('user_idioms')
      .select('id, phrase, literal_translation, meaning, usage_examples, source_video_id, created_at')
      .eq('user_id', userData.user.id)

    // Filter by category
    if (idiomCategoryId) {
      const { data: idiomIds, error: idiomIdsError } = await safeSupabaseCall(
        () => supabase
          .from('user_idioms_categories')
          .select('idiom_id')
          .eq('user_id', userData.user.id)
          .eq('category_id', idiomCategoryId),
        { timeoutMs: 10000, maxRetries: 2 }
      )

      if (idiomIdsError) {
        console.error('[api/vocabulary/export] Error fetching category idioms:', idiomIdsError)
        return res.status(500).json({ error: 'Failed to fetch idioms by category', details: idiomIdsError.message })
      }

      const ids = (idiomIds || []).map(i => i.idiom_id)
      if (ids.length === 0) {
        return res.status(400).json({ error: 'No idioms found with the specified filters' })
      }
      query = query.in('id', ids)
    }

    const { data: idiomRows, error: idiomsError } = await safeSupabaseCall(
      () => query,
      { timeoutMs: 20000, maxRetries: 2 }
    )

    if (idiomsError) {
      console.error('[api/vocabulary/export] Error loading idioms:', idiomsError)
      return res.status(500).json({ error: 'Failed to fetch idioms', details: idiomsError.message })
    }

    const idiomsList = idiomRows || []

    // Get difficulty levels from word_definitions_cache
    const normalizedPhrases = Array.from(new Set(
      idiomsList
        .map(row => (row && typeof row.phrase === 'string' ? normalizeWord(row.phrase) : ''))
        .filter(w => !!w)
    ))

    let difficultyByWord = {}
    if (normalizedPhrases.length > 0) {
      const { data: defs } = await safeSupabaseCall(
        () => supabase
          .from('word_definitions_cache')
          .select('word, difficulty_level')
          .in('word', normalizedPhrases),
        { timeoutMs: 15000, maxRetries: 1 }
      )

      if (defs) {
        difficultyByWord = defs.reduce((acc, row) => {
          if (row && row.word && row.difficulty_level) {
            acc[row.word] = row.difficulty_level
          }
          return acc
        }, {})
      }
    }

    // Apply filters (search and difficulty)
    let filteredIdioms = idiomsList.filter(row => {
      if (!row || typeof row.phrase !== 'string') return false

      // Search filter
      if (search) {
        const searchLower = search.toLowerCase()
        const haystack = (
          row.phrase.toLowerCase() +
          ' ' +
          (row.meaning || '').toLowerCase() +
          ' ' +
          (row.literal_translation || '').toLowerCase()
        )
        if (!haystack.includes(searchLower)) return false
      }

      // Difficulty filter
      if (difficulty && difficulty !== 'all') {
        const normalized = normalizeWord(row.phrase)
        const idiomDifficulty = normalized ? difficultyByWord[normalized] || null : null
        if (idiomDifficulty !== difficulty) return false
      }

      return true
    })

    // Format idioms for export
    const exportData = filteredIdioms.map(row => {
      const normalized = normalizeWord(row.phrase)
      const difficultyLevel = normalized ? difficultyByWord[normalized] || null : null
      return {
        phrase: row.phrase.trim(),
        literal_translation: row.literal_translation || '',
        meaning: row.meaning || '',
        usage_examples: Array.isArray(row.usage_examples) ? row.usage_examples : [],
        difficulty_level: difficultyLevel,
        created_at: row.created_at
      }
    })

    if (exportData.length === 0) {
      return res.status(400).json({ error: 'No idioms found with the specified filters' })
    }

    if (format === 'csv') {
      const csvHeader = 'phrase,literal_translation,meaning,usage_examples,difficulty_level\n'
      const csvRows = exportData.map(item => {
        const examples = Array.isArray(item.usage_examples) ? item.usage_examples.join('; ') : ''
        return [
          `"${(item.phrase || '').replace(/"/g, '""')}"`,
          `"${(item.literal_translation || '').replace(/"/g, '""')}"`,
          `"${(item.meaning || '').replace(/"/g, '""')}"`,
          `"${examples.replace(/"/g, '""')}"`,
          `"${item.difficulty_level || ''}"`
        ].join(',')
      })
      const csvContent = csvHeader + csvRows.join('\n')
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="idioms_${new Date().toISOString().split('T')[0]}.csv"`)
      return res.send('\ufeff' + csvContent)
    } else if (format === 'anki') {
      const csvHeader = 'Front,Back,Tags\n'
      const csvRows = exportData.map(item => {
        const back = [item.meaning]
        if (item.literal_translation) back.push(`(букв. ${item.literal_translation})`)
        if (Array.isArray(item.usage_examples) && item.usage_examples.length > 0) {
          back.push('\nПримеры:\n' + item.usage_examples.slice(0, 3).map(e => `• ${e}`).join('\n'))
        }
        const tags = []
        if (item.difficulty_level) tags.push(item.difficulty_level)
        tags.push('SongTalk', 'Idiom')
        return `"${item.phrase.replace(/"/g, '""')}","${back.filter(Boolean).join('\n').replace(/"/g, '""')}","${tags.join(' ')}"`
      })
      const csvContent = csvHeader + csvRows.join('\n')
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="idioms_anki_${new Date().toISOString().split('T')[0]}.csv"`)
      return res.send('\ufeff' + csvContent)
    } else {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="idioms_${new Date().toISOString().split('T')[0]}.json"`)
      return res.json({
        version: '1.0',
        exported_at: new Date().toISOString(),
        total_idioms: exportData.length,
        idioms: exportData
      })
    }
  } else if (viewMode === 'phrasal-verbs') {
    // Export phrasal verbs
    let query = supabase
      .from('user_phrasal_verbs')
      .select('id, phrase, literal_translation, meaning, usage_examples, source_video_id, created_at')
      .eq('user_id', userData.user.id)

    // Filter by category
    if (phrasalVerbCategoryId) {
      const { data: phrasalVerbIds, error: phrasalVerbIdsError } = await safeSupabaseCall(
        () => supabase
          .from('user_phrasal_verbs_categories')
          .select('phrasal_verb_id')
          .eq('user_id', userData.user.id)
          .eq('category_id', phrasalVerbCategoryId),
        { timeoutMs: 10000, maxRetries: 2 }
      )

      if (phrasalVerbIdsError) {
        console.error('[api/vocabulary/export] Error fetching category phrasal verbs:', phrasalVerbIdsError)
        return res.status(500).json({ error: 'Failed to fetch phrasal verbs by category', details: phrasalVerbIdsError.message })
      }

      const ids = (phrasalVerbIds || []).map(pv => pv.phrasal_verb_id)
      if (ids.length === 0) {
        return res.status(400).json({ error: 'No phrasal verbs found with the specified filters' })
      }
      query = query.in('id', ids)
    }

    const { data: phrasalVerbRows, error: phrasalVerbsError } = await safeSupabaseCall(
      () => query,
      { timeoutMs: 20000, maxRetries: 2 }
    )

    if (phrasalVerbsError) {
      console.error('[api/vocabulary/export] Error loading phrasal verbs:', phrasalVerbsError)
      return res.status(500).json({ error: 'Failed to fetch phrasal verbs', details: phrasalVerbsError.message })
    }

    const phrasalVerbsList = phrasalVerbRows || []

    // Get difficulty levels from word_definitions_cache
    const normalizedPhrases = Array.from(new Set(
      phrasalVerbsList
        .map(row => (row && typeof row.phrase === 'string' ? normalizeWord(row.phrase) : ''))
        .filter(w => !!w)
    ))

    let difficultyByWord = {}
    if (normalizedPhrases.length > 0) {
      const { data: defs } = await safeSupabaseCall(
        () => supabase
          .from('word_definitions_cache')
          .select('word, difficulty_level')
          .in('word', normalizedPhrases),
        { timeoutMs: 15000, maxRetries: 1 }
      )

      if (defs) {
        difficultyByWord = defs.reduce((acc, row) => {
          if (row && row.word && row.difficulty_level) {
            acc[row.word] = row.difficulty_level
          }
          return acc
        }, {})
      }
    }

    // Apply filters (search and difficulty)
    let filteredPhrasalVerbs = phrasalVerbsList.filter(row => {
      if (!row || typeof row.phrase !== 'string') return false

      // Search filter
      if (search) {
        const searchLower = search.toLowerCase()
        const haystack = (
          row.phrase.toLowerCase() +
          ' ' +
          (row.meaning || '').toLowerCase() +
          ' ' +
          (row.literal_translation || '').toLowerCase()
        )
        if (!haystack.includes(searchLower)) return false
      }

      // Difficulty filter
      if (difficulty && difficulty !== 'all') {
        const normalized = normalizeWord(row.phrase)
        const phrasalVerbDifficulty = normalized ? difficultyByWord[normalized] || null : null
        if (phrasalVerbDifficulty !== difficulty) return false
      }

      return true
    })

    // Format phrasal verbs for export
    const exportData = filteredPhrasalVerbs.map(row => {
      const normalized = normalizeWord(row.phrase)
      const difficultyLevel = normalized ? difficultyByWord[normalized] || null : null
      return {
        phrase: row.phrase.trim(),
        literal_translation: row.literal_translation || '',
        meaning: row.meaning || '',
        usage_examples: Array.isArray(row.usage_examples) ? row.usage_examples : [],
        difficulty_level: difficultyLevel,
        created_at: row.created_at
      }
    })

    if (exportData.length === 0) {
      return res.status(400).json({ error: 'No phrasal verbs found with the specified filters' })
    }

    if (format === 'csv') {
      const csvHeader = 'phrase,literal_translation,meaning,usage_examples,difficulty_level\n'
      const csvRows = exportData.map(item => {
        const examples = Array.isArray(item.usage_examples) ? item.usage_examples.join('; ') : ''
        return [
          `"${(item.phrase || '').replace(/"/g, '""')}"`,
          `"${(item.literal_translation || '').replace(/"/g, '""')}"`,
          `"${(item.meaning || '').replace(/"/g, '""')}"`,
          `"${examples.replace(/"/g, '""')}"`,
          `"${item.difficulty_level || ''}"`
        ].join(',')
      })
      const csvContent = csvHeader + csvRows.join('\n')
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="phrasal_verbs_${new Date().toISOString().split('T')[0]}.csv"`)
      return res.send('\ufeff' + csvContent)
    } else if (format === 'anki') {
      const csvHeader = 'Front,Back,Tags\n'
      const csvRows = exportData.map(item => {
        const back = [item.meaning]
        if (item.literal_translation) back.push(`(букв. ${item.literal_translation})`)
        if (Array.isArray(item.usage_examples) && item.usage_examples.length > 0) {
          back.push('\nПримеры:\n' + item.usage_examples.slice(0, 3).map(e => `• ${e}`).join('\n'))
        }
        const tags = []
        if (item.difficulty_level) tags.push(item.difficulty_level)
        tags.push('SongTalk', 'PhrasalVerb')
        return `"${item.phrase.replace(/"/g, '""')}","${back.filter(Boolean).join('\n').replace(/"/g, '""')}","${tags.join(' ')}"`
      })
      const csvContent = csvHeader + csvRows.join('\n')
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="phrasal_verbs_anki_${new Date().toISOString().split('T')[0]}.csv"`)
      return res.send('\ufeff' + csvContent)
    } else {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="phrasal_verbs_${new Date().toISOString().split('T')[0]}.json"`)
      return res.json({
        version: '1.0',
        exported_at: new Date().toISOString(),
        total_phrasal_verbs: exportData.length,
        phrasal_verbs: exportData
      })
    }
  } else {
    // Export words (default)
    // Build query with filters
    let query = supabase
      .from('user_vocabulary')
      .select('*')
      .eq('user_id', userData.user.id)

    // Filter by category
    if (categoryId) {
      const { data: vocabularyIds, error: vocabIdsError } = await safeSupabaseCall(
        () => supabase
          .from('user_vocabulary_categories')
          .select('vocabulary_id')
          .eq('user_id', userData.user.id)
          .eq('category_id', categoryId),
        { timeoutMs: 10000, maxRetries: 2 }
      )

      if (vocabIdsError) {
        console.error('[api/vocabulary/export] Error fetching category words:', vocabIdsError)
        return res.status(500).json({ error: 'Failed to fetch words by category', details: vocabIdsError.message })
      }

      const ids = (vocabularyIds || []).map(v => v.vocabulary_id)
      if (ids.length === 0) {
        return res.status(400).json({ error: 'No words found with the specified filters' })
      }
      query = query.in('id', ids)
    }

    // Apply difficulty filter
    if (difficulty && difficulty !== 'all' && ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(difficulty)) {
      query = query.eq('difficulty_level', difficulty)
    }

    // Apply search filter
    if (search) {
      query = query.ilike('word', `%${search}%`)
    }

    // Get all vocabulary words (no pagination for export)
    const { data: words, error: wordsError } = await safeSupabaseCall(
      () => query.order('word', { ascending: true }),
      { timeoutMs: 30000, maxRetries: 2 }
    )

    if (wordsError) {
      console.error('[api/vocabulary/export] Error:', wordsError)
      return res.status(500).json({ error: 'Failed to fetch vocabulary', details: wordsError.message })
    }

    const wordList = words || []

    if (wordList.length === 0) {
      return res.status(400).json({ error: 'No words found with the specified filters' })
    }

    if (format === 'csv') {
      // CSV format: word,translations,difficulty_level,part_of_speech,mastery_level,notes,contexts
      const csvHeader = 'word,translations,difficulty_level,part_of_speech,mastery_level,notes,contexts\n'
      const csvRows = wordList.map(word => {
        const translations = Array.isArray(word.translations)
          ? word.translations.map(t => t.translation || t).join('; ')
          : ''
        const contexts = Array.isArray(word.contexts)
          ? word.contexts.map(c => c.text || '').filter(Boolean).join('; ')
          : ''
        const notes = (word.notes || '').replace(/"/g, '""') // Escape quotes
        const contextsEscaped = contexts.replace(/"/g, '""')

        return [
          `"${word.word || ''}"`,
          `"${translations.replace(/"/g, '""')}"`,
          `"${word.difficulty_level || ''}"`,
          `"${word.part_of_speech || ''}"`,
          word.mastery_level || '',
          `"${notes}"`,
          `"${contextsEscaped}"`
        ].join(',')
      })

      const csvContent = csvHeader + csvRows.join('\n')
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="vocabulary_${new Date().toISOString().split('T')[0]}.csv"`)
      return res.send('\ufeff' + csvContent) // BOM for UTF-8
    } else if (format === 'anki') {
      // Anki format: Front,Back,Tags
      const csvHeader = 'Front,Back,Tags\n'
      const csvRows = wordList.map(word => {
        const translations = Array.isArray(word.translations)
          ? word.translations.map(t => t.translation || t).join(', ')
          : ''
        const back = [translations]
        if (word.part_of_speech) back.push(`(${word.part_of_speech})`)
        if (word.notes) back.push(word.notes)
        if (Array.isArray(word.contexts) && word.contexts.length > 0) {
          back.push('\nПримеры:\n' + word.contexts.slice(0, 3).map(c => `• ${c.text || ''}`).join('\n'))
        }

        const tags = []
        if (word.difficulty_level) tags.push(word.difficulty_level)
        if (word.mastery_level) tags.push(`Level${word.mastery_level}`)
        tags.push('SongTalk')

        const front = word.word || ''
        const backText = back.filter(Boolean).join('\n').replace(/"/g, '""')
        const tagsText = tags.join(' ')

        return `"${front}","${backText}","${tagsText}"`
      })

      const csvContent = csvHeader + csvRows.join('\n')
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="vocabulary_anki_${new Date().toISOString().split('T')[0]}.csv"`)
      return res.send('\ufeff' + csvContent) // BOM for UTF-8
    } else {
      // JSON format
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="vocabulary_${new Date().toISOString().split('T')[0]}.json"`)
      return res.json({
        version: '1.0',
        exported_at: new Date().toISOString(),
        total_words: wordList.length,
        words: wordList
      })
    }
  }
}))

// Import vocabulary — requires Supabase auth
app.post('/api/vocabulary/import', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const { format, data } = req.body || {}

  if (!format || !['csv', 'json', 'anki'].includes(format)) {
    return res.status(400).json({ error: 'Format must be csv, json, or anki' })
  }

  if (!data || (typeof data !== 'string' && !Array.isArray(data))) {
    return res.status(400).json({ error: 'Data is required (string for CSV, array for JSON)' })
  }

  let wordsToImport = []

  try {
    if (format === 'json') {
      let parsed
      if (typeof data === 'string') {
        parsed = JSON.parse(data)
      } else {
        parsed = data
      }

      // Handle different JSON structures
      if (parsed.words && Array.isArray(parsed.words)) {
        wordsToImport = parsed.words
      } else if (Array.isArray(parsed)) {
        wordsToImport = parsed
      } else {
        return res.status(400).json({ error: 'Invalid JSON format. Expected array or object with "words" array' })
      }
    } else if (format === 'csv' || format === 'anki') {
      // Parse CSV
      const lines = typeof data === 'string' ? data.split('\n').filter(line => line.trim()) : []
      if (lines.length < 2) {
        return res.status(400).json({ error: 'CSV must have at least a header and one data row' })
      }

      const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
      const rows = lines.slice(1)

      if (format === 'anki') {
        // Anki format: Front,Back,Tags
        const frontIdx = header.findIndex(h => h.toLowerCase() === 'front')
        const backIdx = header.findIndex(h => h.toLowerCase() === 'back')
        const tagsIdx = header.findIndex(h => h.toLowerCase() === 'tags')

        if (frontIdx === -1 || backIdx === -1) {
          return res.status(400).json({ error: 'Anki CSV must have Front and Back columns' })
        }

        wordsToImport = rows.map(row => {
          const cells = row.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
          const word = cells[frontIdx] || ''
          const back = cells[backIdx] || ''
          const tags = tagsIdx >= 0 ? (cells[tagsIdx] || '').split(' ') : []

          // Extract difficulty from tags
          const difficulty = tags.find(t => /^[A-C][1-2]$/.test(t)) || null

          return {
            word: word.trim().toLowerCase(),
            translations: back ? [{ translation: back }] : [],
            difficulty_level: difficulty,
            notes: back.includes('\n') ? back.split('\n').slice(1).join('\n') : null
          }
        }).filter(w => w.word)
      } else {
        // CSV format: word,translations,difficulty_level,part_of_speech,mastery_level,notes,contexts
        const wordIdx = header.findIndex(h => h.toLowerCase() === 'word')
        const translationsIdx = header.findIndex(h => h.toLowerCase() === 'translations')
        const difficultyIdx = header.findIndex(h => h.toLowerCase() === 'difficulty_level')
        const posIdx = header.findIndex(h => h.toLowerCase() === 'part_of_speech')
        const masteryIdx = header.findIndex(h => h.toLowerCase() === 'mastery_level')
        const notesIdx = header.findIndex(h => h.toLowerCase() === 'notes')
        const contextsIdx = header.findIndex(h => h.toLowerCase() === 'contexts')

        if (wordIdx === -1) {
          return res.status(400).json({ error: 'CSV must have a "word" column' })
        }

        wordsToImport = rows.map(row => {
          // Simple CSV parsing (handles quoted fields)
          const cells = []
          let current = ''
          let inQuotes = false
          for (let i = 0; i < row.length; i++) {
            const char = row[i]
            if (char === '"') {
              if (inQuotes && row[i + 1] === '"') {
                current += '"'
                i++
              } else {
                inQuotes = !inQuotes
              }
            } else if (char === ',' && !inQuotes) {
              cells.push(current.trim())
              current = ''
            } else {
              current += char
            }
          }
          cells.push(current.trim())

          const word = cells[wordIdx] || ''
          const translations = cells[translationsIdx] || ''
          const difficulty = cells[difficultyIdx] || null
          const pos = cells[posIdx] || null
          const mastery = cells[masteryIdx] ? parseInt(cells[masteryIdx]) : null
          const notes = cells[notesIdx] || null
          const contexts = cells[contextsIdx] || ''

          return {
            word: word.trim().toLowerCase(),
            translations: translations ? translations.split(';').map(t => ({ translation: t.trim() })) : [],
            difficulty_level: difficulty && /^[A-C][1-2]$/.test(difficulty) ? difficulty : null,
            part_of_speech: pos || null,
            mastery_level: mastery && mastery >= 1 && mastery <= 5 ? mastery : 1,
            notes: notes || null,
            contexts: contexts ? contexts.split(';').map(c => ({ text: c.trim() })) : []
          }
        }).filter(w => w.word)
      }
    }
  } catch (parseError) {
    console.error('[api/vocabulary/import] Parse error:', parseError)
    return res.status(400).json({ error: 'Failed to parse import data', details: parseError.message })
  }

  if (wordsToImport.length === 0) {
    return res.status(400).json({ error: 'No valid words found in import data' })
  }

  // Import words (upsert - update if exists, insert if new)
  let imported = 0
  let updated = 0
  let errors = []

  for (const wordData of wordsToImport) {
    if (!wordData.word || wordData.word.trim().length === 0) {
      continue
    }

    const normalizedWord = wordData.word.trim().toLowerCase()

    // Check if word already exists
    const { data: existing } = await safeSupabaseCall(
      () => supabase
        .from('user_vocabulary')
        .select('id, translations, contexts, notes')
        .eq('user_id', userData.user.id)
        .eq('word', normalizedWord)
        .single(),
      { timeoutMs: 10000, maxRetries: 1 }
    )

    try {
      if (existing) {
        // Update existing word - merge translations and contexts
        const existingTranslations = Array.isArray(existing.translations) ? existing.translations : []
        const existingContexts = Array.isArray(existing.contexts) ? existing.contexts : []

        const newTranslations = Array.isArray(wordData.translations) ? wordData.translations : []
        const mergedTranslations = [...existingTranslations]
        newTranslations.forEach(nt => {
          if (!mergedTranslations.some(et => et.translation === nt.translation)) {
            mergedTranslations.push(nt)
          }
        })

        const newContexts = Array.isArray(wordData.contexts) ? wordData.contexts : []
        const mergedContexts = [...existingContexts]
        newContexts.forEach(nc => {
          if (!mergedContexts.some(ec => ec.text === nc.text)) {
            mergedContexts.push(nc)
          }
        })

        const { error: updateError } = await safeSupabaseCall(
          () => supabase
            .from('user_vocabulary')
            .update({
              translations: mergedTranslations,
              contexts: mergedContexts,
              difficulty_level: wordData.difficulty_level || existing.difficulty_level,
              part_of_speech: wordData.part_of_speech || null,
              mastery_level: wordData.mastery_level || existing.mastery_level || 1,
              notes: wordData.notes || existing.notes || null,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id),
          { timeoutMs: 10000, maxRetries: 1 }
        )

        if (updateError) {
          errors.push({ word: normalizedWord, error: updateError.message })
        } else {
          updated++
        }
      } else {
        // Insert new word
        const { error: insertError } = await safeSupabaseCall(
          () => supabase
            .from('user_vocabulary')
            .insert({
              user_id: userData.user.id,
              word: normalizedWord,
              translations: Array.isArray(wordData.translations) ? wordData.translations : [],
              contexts: Array.isArray(wordData.contexts) ? wordData.contexts : [],
              difficulty_level: wordData.difficulty_level || null,
              part_of_speech: wordData.part_of_speech || null,
              mastery_level: wordData.mastery_level || 1,
              notes: wordData.notes || null
            }),
          { timeoutMs: 10000, maxRetries: 1 }
        )

        if (insertError) {
          errors.push({ word: normalizedWord, error: insertError.message })
        } else {
          imported++
        }
      }
    } catch (wordError) {
      errors.push({ word: normalizedWord, error: wordError.message })
    }
  }

  return res.json({
    ok: true,
    imported,
    updated,
    total: wordsToImport.length,
    errors: errors.length > 0 ? errors : undefined
  })
}))

// Delete word from vocabulary — requires Supabase auth
app.delete('/api/vocabulary/word/:id', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const wordId = req.params.id
  if (!wordId) {
    return res.status(400).json({ error: 'Word id is required' })
  }

  const { error: deleteError } = await safeSupabaseCall(
    () => supabase
      .from('user_vocabulary')
      .delete()
      .eq('id', wordId)
      .eq('user_id', userData.user.id),
    { timeoutMs: 15000, maxRetries: 2 }
  )

  if (deleteError) {
    console.error('[api/vocabulary/word/:id DELETE] Error:', deleteError)
    return res.status(500).json({ error: 'Failed to delete word', details: deleteError.message })
  }

  return res.json({ ok: true })
}))

// ============================================================================
// Spaced Repetition System (SRS) Algorithm
// ============================================================================

/**
 * Calculate next review date based on spaced repetition algorithm
 * Simplified version inspired by SuperMemo-2
 * 
 * @param {number} score - Review score (0.0 = don't know, 1.0 = know perfectly)
 * @param {number} currentInterval - Current interval in days (0 for first review)
 * @param {number} consecutiveCorrect - Number of consecutive correct answers
 * @param {number} consecutiveIncorrect - Number of consecutive incorrect answers
 * @returns {object} - { nextReviewAt: Date, newInterval: number }
 */
function calculateNextReview(score, currentInterval = 0, consecutiveCorrect = 0, consecutiveIncorrect = 0) {
  const now = new Date()
  let newInterval = currentInterval
  let easeFactor = 2.5 // Starting ease factor (similar to Anki)

  // Adjust ease factor based on score
  if (score >= 0.8) {
    // Correct answer (80%+ confidence)
    if (consecutiveCorrect === 0) {
      // First correct answer - start with 1 day
      newInterval = 1
    } else if (consecutiveCorrect === 1) {
      // Second correct - 3 days
      newInterval = 3
    } else if (consecutiveCorrect === 2) {
      // Third correct - 7 days
      newInterval = 7
    } else if (consecutiveCorrect === 3) {
      // Fourth correct - 14 days
      newInterval = 14
    } else {
      // After 4+ correct answers, use exponential growth
      // Formula: interval * easeFactor (but capped at reasonable values)
      newInterval = Math.floor(currentInterval * easeFactor)

      // Cap interval at 365 days (1 year)
      if (newInterval > 365) {
        newInterval = 365
      }

      // Minimum interval of 1 day
      if (newInterval < 1) {
        newInterval = 1
      }
    }

  } else if (score >= 0.5) {
    // Partial knowledge (50-80%)
    // Reset to shorter interval
    newInterval = Math.max(1, Math.floor(currentInterval * 0.5))
  } else {
    // Wrong answer (< 50%)
    // Reset to 1 day
    newInterval = 1
  }

  // Calculate next review date
  const nextReviewAt = new Date(now)
  nextReviewAt.setDate(nextReviewAt.getDate() + newInterval)

  return {
    nextReviewAt,
    newInterval,
    easeFactor
  }
}

// ============================================================================
// Review API Endpoints
// ============================================================================

// Get words to review — requires Supabase auth
app.get('/api/vocabulary/review-list', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const { limit = 20, status } = req.query || {}

  // Get words that need review (next_review_at <= now)
  let query = supabase
    .from('words_to_review_today')
    .select('*')
    .eq('user_id', userData.user.id)
    .order('next_review_at', { ascending: true })
    .limit(parseInt(limit))


  const { data: wordsToReview, error: reviewError } = await safeSupabaseCall(
    () => query,
    { timeoutMs: 15000, maxRetries: 2 }
  )

  if (reviewError) {
    console.error('[api/vocabulary/review-list] Error:', reviewError)
    return res.status(500).json({ error: 'Failed to fetch words for review', details: reviewError.message })
  }

  // Get full word details from user_vocabulary and definitions cache
  const wordList = wordsToReview || []
  let wordsWithDetails = []

  if (wordList.length > 0) {
    const wordNormalized = wordList.map(w => w.word)

    // Get vocabulary entries
    const { data: vocabularyData } = await safeSupabaseCall(
      () => supabase
        .from('user_vocabulary')
        .select('*')
        .eq('user_id', userData.user.id)
        .in('word', wordNormalized),
      { timeoutMs: 15000, maxRetries: 2 }
    )

    // Get definitions
    const { data: definitionsData } = await safeSupabaseCall(
      () => supabase
        .from('word_definitions_cache')
        .select('word, definitions, phonetic_transcription')
        .in('word', wordNormalized),
      { timeoutMs: 15000, maxRetries: 2 }
    )

    // Combine data
    const vocabularyMap = new Map((vocabularyData || []).map(v => [v.word, v]))
    const definitionsMap = new Map((definitionsData || []).map(d => [d.word, d]))

    wordsWithDetails = wordList.map(w => ({
      word: w.word,
      next_review_at: w.next_review_at,
      review_count: w.review_count || 0,
      last_review_score: w.last_review_score || null,
      vocabulary: vocabularyMap.get(w.word) || null,
      definition: definitionsMap.get(w.word) || null
    }))
  }

  return res.json({
    ok: true,
    words: wordsWithDetails,
    total: wordsWithDetails.length
  })
}))

// Анализ текста/песни на идиомы — требует Supabase auth
// ВНИМАНИЕ: вызывает AI и тратит токены, но результаты кэшируются:
// - по видео (колонка idioms в user_videos)
// - по самой идиоме (word_definitions_cache c is_phrase=true)
app.post('/api/vocabulary/idioms/analyze', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
  const userId = userData.user.id

  const balance = await getBalance(supabase, userId)
  if (balance < BALANCE_THRESHOLD_RUB) {
    return res.status(402).json({ error: 'Пополните баланс' })
  }

  const { video_id, text, force = false, max_idioms = 20 } = req.body || {}

  if (!video_id && (!text || typeof text !== 'string')) {
    return res.status(400).json({ error: 'Text or video_id is required' })
  }

  let textToProcess = text
  let videoRecord = null

  // Если анализируем по видео, пробуем вытащить уже кэшированные идиомы
  if (video_id) {
    const { data: video, error: videoError } = await safeSupabaseCall(
      () => supabase
        .from('user_videos')
        .select('id, user_id, transcription_text, idioms')
        .eq('id', video_id)
        .eq('user_id', userData.user.id)
        .single(),
      { timeoutMs: 15000, maxRetries: 2 }
    )

    if (videoError || !video) {
      return res.status(404).json({ error: 'Video not found' })
    }

    videoRecord = video
    textToProcess = textToProcess || video.transcription_text || ''

    // Если уже есть идиомы и не запрошен force — отдаем кэш и не тратим токены
    if (!force && Array.isArray(video.idioms) && video.idioms.length > 0) {
      return res.json({
        ok: true,
        idioms: video.idioms,
        from_cache: true
      })
    }
  }

  if (!textToProcess || typeof textToProcess !== 'string') {
    return res.status(400).json({ error: 'Text is required for idiom analysis' })
  }

  const cleanedText = textToProcess.slice(0, 8000)

  // Вызываем AI для анализа идиом
  const { idioms, usage: idiomsUsage } = await analyzeIdiomsWithAI(cleanedText, { maxIdioms: max_idioms })
  if (idiomsUsage) {
    const costRub = getCost('deepseek-v3.2', idiomsUsage)
    if (costRub > 0) {
      const deductResult = await deductBalance(supabase, userId, costRub, 'deepseek-v3.2', { idioms_analyze: true })
      if (!deductResult.ok) {
        console.error('[api/vocabulary/idioms/analyze] Deduct failed:', deductResult.error)
        return res.status(402).json({ error: 'Недостаточно средств. Пополните баланс.' })
      }
    }
  }

  // Кэшируем по видео, если есть video_id
  if (videoRecord) {
    await safeSupabaseCall(
      () => supabase
        .from('user_videos')
        .update({
          idioms,
          updated_at: new Date().toISOString()
        })
        .eq('id', videoRecord.id),
      { timeoutMs: 15000, maxRetries: 2 }
    )
  }

  // Кэшируем каждую идиому в word_definitions_cache как фразу
  if (idioms.length > 0) {
    const nowIso = new Date().toISOString()

    for (const idiom of idioms) {
      const normalized = normalizeWord(idiom.phrase)
      if (!normalized) continue

      // Определяем уровень сложности идиомы через AI (как для слов)
      // Сначала проверяем кеш, чтобы не тратить токены
      let difficultyLevel = null
      try {
        // Проверяем кеш перед вызовом AI
        const { data: cached, error: cacheError } = await safeSupabaseCall(
          () => supabase
            .from('word_definitions_cache')
            .select('difficulty_level')
            .eq('word', normalized)
            .single(),
          { timeoutMs: 10000, maxRetries: 1 }
        )

        if (cached && !cacheError && cached.difficulty_level) {
          // Уровень уже есть в кеше
          difficultyLevel = cached.difficulty_level
        } else {
          // Уровня нет в кеше, получаем через AI
          const def = await getWordDefinitionFromAI(normalized)
          if (def?.definition?.difficulty_level) {
            difficultyLevel = def.definition.difficulty_level
          }
        }
      } catch (e) {
        console.error('[idioms/analyze] Failed to get difficulty for idiom:', idiom.phrase, e)
      }

      const translationsArray = []
      if (idiom.meaning) {
        translationsArray.push({ translation: idiom.meaning, source: 'ai_idiom_meaning' })
      }
      if (idiom.literal_translation) {
        translationsArray.push({ translation: idiom.literal_translation, source: 'ai_idiom_literal' })
      }

      await safeSupabaseCall(
        () => supabase
          .from('word_definitions_cache')
          .upsert({
            word: normalized,
            definitions: translationsArray,
            phonetic_transcription: null,
            part_of_speech: null,
            difficulty_level: difficultyLevel,
            frequency_rank: null,
            is_phrase: true,
            example_sentences: idiom.usage_examples || [],
            updated_at: nowIso
          }, {
            onConflict: 'word'
          }),
        { timeoutMs: 10000, maxRetries: 1 }
      )
    }
  }

  return res.json({
    ok: true,
    idioms,
    from_cache: false
  })
}))

// Анализ текста/песни на фразовые глаголы — требует Supabase auth
// ВНИМАНИЕ: вызывает AI и тратит токены, но результаты кэшируются:
// - по видео (колонка phrasal_verbs в user_videos)
// - по самому фразовому глаголу (word_definitions_cache c is_phrase=true)
app.post('/api/vocabulary/phrasal-verbs/analyze', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
  const userId = userData.user.id

  const balance = await getBalance(supabase, userId)
  if (balance < BALANCE_THRESHOLD_RUB) {
    return res.status(402).json({ error: 'Пополните баланс' })
  }

  const { video_id, text, force = false, max_phrasal_verbs = 20 } = req.body || {}

  if (!video_id && (!text || typeof text !== 'string')) {
    return res.status(400).json({ error: 'Text or video_id is required' })
  }

  let textToProcess = text
  let videoRecord = null

  // Если анализируем по видео, пробуем вытащить уже кэшированные фразовые глаголы
  if (video_id) {
    const { data: video, error: videoError } = await safeSupabaseCall(
      () => supabase
        .from('user_videos')
        .select('id, user_id, transcription_text, phrasal_verbs')
        .eq('id', video_id)
        .eq('user_id', userData.user.id)
        .single(),
      { timeoutMs: 15000, maxRetries: 2 }
    )

    if (videoError || !video) {
      return res.status(404).json({ error: 'Video not found' })
    }

    videoRecord = video
    textToProcess = textToProcess || video.transcription_text || ''

    // Если уже есть фразовые глаголы и не запрошен force — отдаем кэш и не тратим токены
    if (!force && Array.isArray(video.phrasal_verbs) && video.phrasal_verbs.length > 0) {
      return res.json({
        ok: true,
        phrasal_verbs: video.phrasal_verbs,
        from_cache: true
      })
    }
  }

  if (!textToProcess || typeof textToProcess !== 'string') {
    return res.status(400).json({ error: 'Text is required for phrasal verb analysis' })
  }

  const cleanedText = textToProcess.slice(0, 8000)

  // Вызываем AI для анализа фразовых глаголов
  const { phrasalVerbs, usage: pvUsage } = await analyzePhrasalVerbsWithAI(cleanedText, { maxPhrasalVerbs: max_phrasal_verbs })
  if (pvUsage) {
    const costRub = getCost('deepseek-v3.2', pvUsage)
    if (costRub > 0) {
      const deductResult = await deductBalance(supabase, userId, costRub, 'deepseek-v3.2', { phrasal_verbs_analyze: true })
      if (!deductResult.ok) {
        console.error('[api/vocabulary/phrasal-verbs/analyze] Deduct failed:', deductResult.error)
        return res.status(402).json({ error: 'Недостаточно средств. Пополните баланс.' })
      }
    }
  }

  // Кэшируем по видео, если есть video_id
  if (videoRecord) {
    await safeSupabaseCall(
      () => supabase
        .from('user_videos')
        .update({
          phrasal_verbs: phrasalVerbs,
          updated_at: new Date().toISOString()
        })
        .eq('id', videoRecord.id),
      { timeoutMs: 15000, maxRetries: 2 }
    )
  }

  // Кэшируем каждый фразовый глагол в word_definitions_cache как фразу
  if (phrasalVerbs.length > 0) {
    const nowIso = new Date().toISOString()

    for (const pv of phrasalVerbs) {
      const normalized = normalizeWord(pv.phrase)
      if (!normalized) continue

      // Определяем уровень сложности фразового глагола через AI (как для слов)
      // Сначала проверяем кеш, чтобы не тратить токены
      let difficultyLevel = null
      try {
        // Проверяем кеш перед вызовом AI
        const { data: cached, error: cacheError } = await safeSupabaseCall(
          () => supabase
            .from('word_definitions_cache')
            .select('difficulty_level')
            .eq('word', normalized)
            .single(),
          { timeoutMs: 10000, maxRetries: 1 }
        )

        if (cached && !cacheError && cached.difficulty_level) {
          // Уровень уже есть в кеше
          difficultyLevel = cached.difficulty_level
        } else {
          // Уровня нет в кеше, получаем через AI
          const def = await getWordDefinitionFromAI(normalized)
          if (def?.definition?.difficulty_level) {
            difficultyLevel = def.definition.difficulty_level
          }
        }
      } catch (e) {
        console.error('[phrasal-verbs/analyze] Failed to get difficulty for phrasal verb:', pv.phrase, e)
      }

      const translationsArray = []
      if (pv.meaning) {
        translationsArray.push({ translation: pv.meaning, source: 'ai_phrasal_verb_meaning' })
      }
      if (pv.literal_translation) {
        translationsArray.push({ translation: pv.literal_translation, source: 'ai_phrasal_verb_literal' })
      }

      await safeSupabaseCall(
        () => supabase
          .from('word_definitions_cache')
          .upsert({
            word: normalized,
            definitions: translationsArray,
            phonetic_transcription: null,
            part_of_speech: null,
            difficulty_level: difficultyLevel,
            frequency_rank: null,
            is_phrase: true,
            example_sentences: pv.usage_examples || [],
            updated_at: nowIso
          }, {
            onConflict: 'word'
          }),
        { timeoutMs: 10000, maxRetries: 1 }
      )
    }
  }

  return res.json({
    ok: true,
    phrasal_verbs: phrasalVerbs,
    from_cache: false
  })
}))

// Добавить идиому в личный словарь идиом — требует Supabase auth
app.post('/api/vocabulary/idioms/add', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const { phrase, literal_translation, meaning, usage_examples, video_id } = req.body || {}

  if (!phrase || typeof phrase !== 'string') {
    return res.status(400).json({ error: 'Phrase is required' })
  }

  const idiomPhrase = phrase.trim()

  const examplesArray = Array.isArray(usage_examples)
    ? usage_examples.filter((e) => typeof e === 'string')
    : []

  const { data: upserted, error: upsertError } = await safeSupabaseCall(
    () => supabase
      .from('user_idioms')
      .upsert({
        user_id: userData.user.id,
        phrase: idiomPhrase,
        literal_translation: typeof literal_translation === 'string' ? literal_translation : null,
        meaning: typeof meaning === 'string' ? meaning : null,
        usage_examples: examplesArray,
        source_video_id: video_id || null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,phrase'
      })
      .select()
      .single(),
    { timeoutMs: 15000, maxRetries: 2 }
  )

  if (upsertError) {
    console.error('[api/vocabulary/idioms/add] Upsert error:', upsertError)
    return res.status(500).json({ error: 'Failed to save idiom', details: upsertError.message })
  }

  return res.json({
    ok: true,
    idiom: upserted,
  })
}))

// Список идиом пользователя из словаря идиом — требует Supabase auth
app.get('/api/vocabulary/idioms/list', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  // Параметры запроса
  const { category_id } = req.query || {}

  // Построение запроса
  let query = supabase
    .from('user_idioms')
    .select('id, phrase, literal_translation, meaning, usage_examples, source_video_id, created_at')
    .eq('user_id', userData.user.id)

  // Фильтр по категории
  if (category_id) {
    // Если указана категория, получаем идиомы через связующую таблицу
    const { data: idiomIds, error: idiomIdsError } = await safeSupabaseCall(
      () => supabase
        .from('user_idioms_categories')
        .select('idiom_id')
        .eq('user_id', userData.user.id)
        .eq('category_id', category_id),
      { timeoutMs: 10000, maxRetries: 2 }
    )

    if (idiomIdsError) {
      console.error('[api/vocabulary/idioms/list] Error fetching category idioms:', idiomIdsError)
      return res.status(500).json({ error: 'Failed to fetch idioms by category', details: idiomIdsError.message })
    }

    const ids = (idiomIds || []).map(i => i.idiom_id)
    if (ids.length === 0) {
      return res.json({ ok: true, idioms: [], total: 0 })
    }
    query = query.in('id', ids)
  }

  // Берём все идиомы пользователя из словаря идиом
  const { data: idiomRows, error: idiomsError } = await safeSupabaseCall(
    () => query,
    { timeoutMs: 20000, maxRetries: 2 }
  )

  if (idiomsError) {
    console.error('[api/vocabulary/idioms/list] Error loading idioms:', idiomsError)
    return res.status(500).json({ error: 'Failed to fetch idioms', details: idiomsError.message })
  }

  const idiomsList = idiomRows || []

  if (idiomsList.length === 0) {
    return res.json({ ok: true, idioms: [], total: 0 })
  }

  // Получаем категории для всех идиом
  let categoriesMap = {}
  if (idiomsList.length > 0) {
    const idiomIds = idiomsList.map(i => i.id)
    const { data: categoriesData } = await safeSupabaseCall(
      () => supabase
        .from('user_idioms_categories')
        .select(`
          idiom_id,
          category:vocabulary_categories(id, name, description, color, icon)
        `)
        .eq('user_id', userData.user.id)
        .in('idiom_id', idiomIds),
      { timeoutMs: 15000, maxRetries: 2 }
    )

    if (categoriesData) {
      categoriesMap = categoriesData.reduce((acc, item) => {
        if (!acc[item.idiom_id]) {
          acc[item.idiom_id] = []
        }
        if (item.category) {
          acc[item.idiom_id].push(item.category)
        }
        return acc
      }, {})
    }
  }

  const idiomMap = new Map()

  // Подтягиваем уровни сложности из word_definitions_cache (там мы кэшируем идиомы как фразы)
  const normalizedPhrases = Array.from(new Set(
    idiomsList
      .map(row => (row && typeof row.phrase === 'string' ? normalizeWord(row.phrase) : ''))
      .filter(w => !!w)
  ))

  let difficultyByWord = {}
  if (normalizedPhrases.length > 0) {
    const { data: defs, error: defsError } = await safeSupabaseCall(
      () => supabase
        .from('word_definitions_cache')
        .select('word, difficulty_level')
        .in('word', normalizedPhrases),
      { timeoutMs: 15000, maxRetries: 1 }
    )

    if (!defsError && defs) {
      difficultyByWord = defs.reduce((acc, row) => {
        if (row && row.word && row.difficulty_level) {
          acc[row.word] = row.difficulty_level
        }
        return acc
      }, {})
    }
  }

  // Собираем список video_id, чтобы подтянуть метаданные песен
  const videoIds = Array.from(new Set(
    idiomsList
      .map((i) => i.source_video_id)
      .filter((id) => !!id)
  ))

  let videosById = new Map()

  if (videoIds.length > 0) {
    const { data: videos, error: videosError } = await safeSupabaseCall(
      () => supabase
        .from('user_videos')
        .select('id, title, video_url, video_type, video_id')
        .in('id', videoIds),
      { timeoutMs: 20000, maxRetries: 2 }
    )

    if (videosError) {
      console.error('[api/vocabulary/idioms/list] Error loading videos:', videosError)
    } else if (videos) {
      videosById = new Map(videos.map(v => [v.id, v]))
    }
  }

  for (const row of idiomsList) {
    if (!row || typeof row.phrase !== 'string') continue
    const key = row.phrase.trim().toLowerCase()
    if (!key) continue

    const existing = idiomMap.get(key)

    const video = row.source_video_id ? videosById.get(row.source_video_id) : null

    const videoInfo = video ? {
      id: video.id,
      title: video.title || video.video_url || '',
      video_type: video.video_type,
      video_id: video.video_id,
      video_url: video.video_url
    } : null

    const normalized = normalizeWord(row.phrase)
    const difficultyLevel = normalized ? difficultyByWord[normalized] || null : null

    const baseIdiom = {
      phrase: row.phrase.trim(),
      literal_translation: row.literal_translation || '',
      meaning: row.meaning || '',
      usage_examples: Array.isArray(row.usage_examples) ? row.usage_examples : [],
      difficulty_level: difficultyLevel,
    }

    if (existing) {
      if (!existing.difficulty_level && difficultyLevel) {
        existing.difficulty_level = difficultyLevel
      }
      if (videoInfo) {
        const hasVideo = existing.videos.some(v => v.id === videoInfo.id)
        if (!hasVideo) {
          existing.videos.push(videoInfo)
        }
      }
      // Merge categories
      if (categoriesMap[row.id] && categoriesMap[row.id].length > 0) {
        const existingCatIds = new Set((existing.categories || []).map(c => c.id))
        categoriesMap[row.id].forEach(cat => {
          if (!existingCatIds.has(cat.id)) {
            if (!existing.categories) existing.categories = []
            existing.categories.push(cat)
          }
        })
      }
    } else {
      idiomMap.set(key, {
        ...baseIdiom,
        videos: videoInfo ? [videoInfo] : [],
        id: row.id,
        categories: categoriesMap[row.id] || []
      })
    }
  }

  const idioms = Array.from(idiomMap.values())

  return res.json({
    ok: true,
    idioms,
    total: idioms.length
  })
}))

// Delete idiom from user idioms dictionary — requires Supabase auth
app.delete('/api/vocabulary/idioms/:phrase', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const phrase = req.params.phrase
  if (!phrase) {
    return res.status(400).json({ error: 'Phrase parameter is required' })
  }

  const { error: deleteError } = await safeSupabaseCall(
    () => supabase
      .from('user_idioms')
      .delete()
      .eq('user_id', userData.user.id)
      .eq('phrase', phrase),
    { timeoutMs: 15000, maxRetries: 2 }
  )

  if (deleteError) {
    console.error('[api/vocabulary/idioms/:phrase DELETE] Error:', deleteError)
    return res.status(500).json({ error: 'Failed to delete idiom', details: deleteError.message })
  }

  return res.json({ ok: true })
}))

// Bulk delete idioms from user idioms dictionary — requires Supabase auth
app.post('/api/vocabulary/idioms/bulk-delete', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const { phrases } = req.body || {}
  if (!Array.isArray(phrases) || phrases.length === 0) {
    return res.status(400).json({ error: 'phrases array is required' })
  }

  const uniquePhrases = Array.from(
    new Set(
      phrases
        .filter(p => typeof p === 'string')
        .map(p => p.trim())
        .filter(p => p.length > 0)
    )
  )

  if (uniquePhrases.length === 0) {
    return res.status(400).json({ error: 'No valid phrases provided' })
  }

  const { error: deleteError } = await safeSupabaseCall(
    () => supabase
      .from('user_idioms')
      .delete()
      .eq('user_id', userData.user.id)
      .in('phrase', uniquePhrases),
    { timeoutMs: 20000, maxRetries: 2 }
  )

  if (deleteError) {
    console.error('[api/vocabulary/idioms/bulk-delete] Error:', deleteError)
    return res.status(500).json({ error: 'Failed to bulk delete idioms', details: deleteError.message })
  }

  return res.json({ ok: true, deleted_phrases: uniquePhrases })
}))

// Assign categories to idiom — requires Supabase auth
app.post('/api/vocabulary/idioms/:id/categories', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const idiomId = req.params.id
  const { category_ids } = req.body || {}

  if (!Array.isArray(category_ids)) {
    return res.status(400).json({ error: 'category_ids must be an array' })
  }

  // Verify idiom belongs to user
  const { data: idiom, error: idiomError } = await safeSupabaseCall(
    () => supabase
      .from('user_idioms')
      .select('id')
      .eq('id', idiomId)
      .eq('user_id', userData.user.id)
      .single(),
    { timeoutMs: 10000, maxRetries: 2 }
  )

  if (idiomError || !idiom) {
    return res.status(404).json({ error: 'Idiom not found' })
  }

  // Verify all categories belong to user
  if (category_ids.length > 0) {
    const { data: categories, error: categoriesError } = await safeSupabaseCall(
      () => supabase
        .from('vocabulary_categories')
        .select('id')
        .eq('user_id', userData.user.id)
        .in('id', category_ids),
      { timeoutMs: 10000, maxRetries: 2 }
    )

    if (categoriesError || !categories || categories.length !== category_ids.length) {
      return res.status(400).json({ error: 'One or more categories not found or do not belong to user' })
    }
  }

  // Delete existing category assignments
  const { error: deleteError } = await safeSupabaseCall(
    () => supabase
      .from('user_idioms_categories')
      .delete()
      .eq('idiom_id', idiomId)
      .eq('user_id', userData.user.id),
    { timeoutMs: 10000, maxRetries: 2 }
  )

  if (deleteError) {
    console.error('[api/vocabulary/idioms/:id/categories] Delete error:', deleteError)
    return res.status(500).json({ error: 'Failed to remove existing categories', details: deleteError.message })
  }

  // Insert new category assignments
  if (category_ids.length > 0) {
    const assignments = category_ids.map(categoryId => ({
      user_id: userData.user.id,
      idiom_id: idiomId,
      category_id: categoryId
    }))

    const { error: insertError } = await safeSupabaseCall(
      () => supabase
        .from('user_idioms_categories')
        .insert(assignments),
      { timeoutMs: 10000, maxRetries: 2 }
    )

    if (insertError) {
      console.error('[api/vocabulary/idioms/:id/categories] Insert error:', insertError)
      return res.status(500).json({ error: 'Failed to assign categories', details: insertError.message })
    }
  }

  return res.json({
    ok: true,
    message: 'Categories assigned successfully'
  })
}))

// Добавить фразовый глагол в личный словарь фразовых глаголов — требует Supabase auth
app.post('/api/vocabulary/phrasal-verbs/add', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const { phrase, literal_translation, meaning, usage_examples, video_id } = req.body || {}

  if (!phrase || typeof phrase !== 'string') {
    return res.status(400).json({ error: 'Phrase is required' })
  }

  const phrasalVerbPhrase = phrase.trim()

  const examplesArray = Array.isArray(usage_examples)
    ? usage_examples.filter((e) => typeof e === 'string')
    : []

  const { data: upserted, error: upsertError } = await safeSupabaseCall(
    () => supabase
      .from('user_phrasal_verbs')
      .upsert({
        user_id: userData.user.id,
        phrase: phrasalVerbPhrase,
        literal_translation: typeof literal_translation === 'string' ? literal_translation : null,
        meaning: typeof meaning === 'string' ? meaning : null,
        usage_examples: examplesArray,
        source_video_id: video_id || null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,phrase'
      })
      .select()
      .single(),
    { timeoutMs: 15000, maxRetries: 2 }
  )

  if (upsertError) {
    console.error('[api/vocabulary/phrasal-verbs/add] Upsert error:', upsertError)
    return res.status(500).json({ error: 'Failed to save phrasal verb', details: upsertError.message })
  }

  return res.json({
    ok: true,
    phrasal_verb: upserted,
  })
}))

// Список фразовых глаголов пользователя из словаря фразовых глаголов — требует Supabase auth
app.get('/api/vocabulary/phrasal-verbs/list', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  // Параметры запроса
  const { category_id } = req.query || {}

  // Построение запроса
  let query = supabase
    .from('user_phrasal_verbs')
    .select('id, phrase, literal_translation, meaning, usage_examples, source_video_id, created_at')
    .eq('user_id', userData.user.id)

  // Фильтр по категории
  if (category_id) {
    // Если указана категория, получаем фразовые глаголы через связующую таблицу
    const { data: phrasalVerbIds, error: phrasalVerbIdsError } = await safeSupabaseCall(
      () => supabase
        .from('user_phrasal_verbs_categories')
        .select('phrasal_verb_id')
        .eq('user_id', userData.user.id)
        .eq('category_id', category_id),
      { timeoutMs: 10000, maxRetries: 2 }
    )

    if (phrasalVerbIdsError) {
      console.error('[api/vocabulary/phrasal-verbs/list] Error fetching category phrasal verbs:', phrasalVerbIdsError)
      return res.status(500).json({ error: 'Failed to fetch phrasal verbs by category', details: phrasalVerbIdsError.message })
    }

    const ids = (phrasalVerbIds || []).map(pv => pv.phrasal_verb_id)
    if (ids.length === 0) {
      return res.json({ ok: true, phrasal_verbs: [], total: 0 })
    }
    query = query.in('id', ids)
  }

  // Берём все фразовые глаголы пользователя из словаря фразовых глаголов
  const { data: phrasalVerbRows, error: phrasalVerbsError } = await safeSupabaseCall(
    () => query,
    { timeoutMs: 20000, maxRetries: 2 }
  )

  if (phrasalVerbsError) {
    console.error('[api/vocabulary/phrasal-verbs/list] Error loading phrasal verbs:', phrasalVerbsError)
    return res.status(500).json({ error: 'Failed to fetch phrasal verbs', details: phrasalVerbsError.message })
  }

  const phrasalVerbsList = phrasalVerbRows || []

  if (phrasalVerbsList.length === 0) {
    return res.json({ ok: true, phrasal_verbs: [], total: 0 })
  }

  // Получаем категории для всех фразовых глаголов
  let categoriesMap = {}
  if (phrasalVerbsList.length > 0) {
    const phrasalVerbIds = phrasalVerbsList.map(pv => pv.id)
    const { data: categoriesData } = await safeSupabaseCall(
      () => supabase
        .from('user_phrasal_verbs_categories')
        .select(`
          phrasal_verb_id,
          category:vocabulary_categories(id, name, description, color, icon)
        `)
        .eq('user_id', userData.user.id)
        .in('phrasal_verb_id', phrasalVerbIds),
      { timeoutMs: 15000, maxRetries: 2 }
    )

    if (categoriesData) {
      categoriesMap = categoriesData.reduce((acc, item) => {
        if (!acc[item.phrasal_verb_id]) {
          acc[item.phrasal_verb_id] = []
        }
        if (item.category) {
          acc[item.phrasal_verb_id].push(item.category)
        }
        return acc
      }, {})
    }
  }

  const phrasalVerbMap = new Map()

  // Подтягиваем уровни сложности из word_definitions_cache (там мы кэшируем фразовые глаголы как фразы)
  const normalizedPhrases = Array.from(new Set(
    phrasalVerbsList
      .map(row => (row && typeof row.phrase === 'string' ? normalizeWord(row.phrase) : ''))
      .filter(w => !!w)
  ))

  let difficultyByWord = {}
  if (normalizedPhrases.length > 0) {
    const { data: defs, error: defsError } = await safeSupabaseCall(
      () => supabase
        .from('word_definitions_cache')
        .select('word, difficulty_level')
        .in('word', normalizedPhrases),
      { timeoutMs: 15000, maxRetries: 1 }
    )

    if (!defsError && defs) {
      difficultyByWord = defs.reduce((acc, row) => {
        if (row && row.word && row.difficulty_level) {
          acc[row.word] = row.difficulty_level
        }
        return acc
      }, {})
    }
  }

  // Собираем список video_id, чтобы подтянуть метаданные песен
  const videoIds = Array.from(new Set(
    phrasalVerbsList
      .map((pv) => pv.source_video_id)
      .filter((id) => !!id)
  ))

  let videosById = new Map()

  if (videoIds.length > 0) {
    const { data: videos, error: videosError } = await safeSupabaseCall(
      () => supabase
        .from('user_videos')
        .select('id, title, video_url, video_type, video_id')
        .in('id', videoIds),
      { timeoutMs: 20000, maxRetries: 2 }
    )

    if (videosError) {
      console.error('[api/vocabulary/phrasal-verbs/list] Error loading videos:', videosError)
    } else if (videos) {
      videosById = new Map(videos.map(v => [v.id, v]))
    }
  }

  for (const row of phrasalVerbsList) {
    if (!row || typeof row.phrase !== 'string') continue
    const key = row.phrase.trim().toLowerCase()
    if (!key) continue

    const existing = phrasalVerbMap.get(key)

    const video = row.source_video_id ? videosById.get(row.source_video_id) : null

    const videoInfo = video ? {
      id: video.id,
      title: video.title || video.video_url || '',
      video_type: video.video_type,
      video_id: video.video_id,
      video_url: video.video_url
    } : null

    const normalized = normalizeWord(row.phrase)
    const difficultyLevel = normalized ? difficultyByWord[normalized] || null : null

    const basePhrasalVerb = {
      phrase: row.phrase.trim(),
      literal_translation: row.literal_translation || '',
      meaning: row.meaning || '',
      usage_examples: Array.isArray(row.usage_examples) ? row.usage_examples : [],
      difficulty_level: difficultyLevel,
    }

    if (existing) {
      if (!existing.difficulty_level && difficultyLevel) {
        existing.difficulty_level = difficultyLevel
      }
      if (videoInfo) {
        const hasVideo = existing.videos.some(v => v.id === videoInfo.id)
        if (!hasVideo) {
          existing.videos.push(videoInfo)
        }
      }
      // Merge categories
      if (categoriesMap[row.id] && categoriesMap[row.id].length > 0) {
        const existingCatIds = new Set((existing.categories || []).map(c => c.id))
        categoriesMap[row.id].forEach(cat => {
          if (!existingCatIds.has(cat.id)) {
            if (!existing.categories) existing.categories = []
            existing.categories.push(cat)
          }
        })
      }
    } else {
      phrasalVerbMap.set(key, {
        ...basePhrasalVerb,
        videos: videoInfo ? [videoInfo] : [],
        id: row.id,
        categories: categoriesMap[row.id] || []
      })
    }
  }

  const phrasalVerbs = Array.from(phrasalVerbMap.values())

  return res.json({
    ok: true,
    phrasal_verbs: phrasalVerbs,
    total: phrasalVerbs.length
  })
}))

// Delete phrasal verb from user phrasal verbs dictionary — requires Supabase auth
app.delete('/api/vocabulary/phrasal-verbs/:phrase', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const phrase = req.params.phrase
  if (!phrase) {
    return res.status(400).json({ error: 'Phrase parameter is required' })
  }

  const { error: deleteError } = await safeSupabaseCall(
    () => supabase
      .from('user_phrasal_verbs')
      .delete()
      .eq('user_id', userData.user.id)
      .eq('phrase', phrase),
    { timeoutMs: 15000, maxRetries: 2 }
  )

  if (deleteError) {
    console.error('[api/vocabulary/phrasal-verbs/:phrase] Delete error:', deleteError)
    return res.status(500).json({ error: 'Failed to delete phrasal verb', details: deleteError.message })
  }

  return res.json({ ok: true })
}))

// Bulk delete phrasal verbs — requires Supabase auth
app.post('/api/vocabulary/phrasal-verbs/bulk-delete', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const { phrases } = req.body || {}
  if (!Array.isArray(phrases) || phrases.length === 0) {
    return res.status(400).json({ error: 'phrases array is required' })
  }

  const uniquePhrases = Array.from(
    new Set(
      phrases
        .filter(p => typeof p === 'string')
        .map(p => p.trim())
        .filter(p => p.length > 0)
    )
  )

  if (uniquePhrases.length === 0) {
    return res.status(400).json({ error: 'No valid phrases provided' })
  }

  const { error: deleteError } = await safeSupabaseCall(
    () => supabase
      .from('user_phrasal_verbs')
      .delete()
      .eq('user_id', userData.user.id)
      .in('phrase', uniquePhrases),
    { timeoutMs: 20000, maxRetries: 2 }
  )

  if (deleteError) {
    console.error('[api/vocabulary/phrasal-verbs/bulk-delete] Error:', deleteError)
    return res.status(500).json({ error: 'Failed to bulk delete phrasal verbs', details: deleteError.message })
  }

  return res.json({ ok: true, deleted_phrases: uniquePhrases })
}))

// Assign categories to phrasal verb — requires Supabase auth
app.post('/api/vocabulary/phrasal-verbs/:id/categories', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const phrasalVerbId = req.params.id
  const { category_ids } = req.body || {}

  if (!Array.isArray(category_ids)) {
    return res.status(400).json({ error: 'category_ids must be an array' })
  }

  // Verify phrasal verb belongs to user
  const { data: phrasalVerb, error: phrasalVerbError } = await safeSupabaseCall(
    () => supabase
      .from('user_phrasal_verbs')
      .select('id')
      .eq('id', phrasalVerbId)
      .eq('user_id', userData.user.id)
      .single(),
    { timeoutMs: 10000, maxRetries: 2 }
  )

  if (phrasalVerbError || !phrasalVerb) {
    return res.status(404).json({ error: 'Phrasal verb not found' })
  }

  // Verify all categories belong to user
  if (category_ids.length > 0) {
    const { data: categories, error: categoriesError } = await safeSupabaseCall(
      () => supabase
        .from('vocabulary_categories')
        .select('id')
        .eq('user_id', userData.user.id)
        .in('id', category_ids),
      { timeoutMs: 10000, maxRetries: 2 }
    )

    if (categoriesError || !categories || categories.length !== category_ids.length) {
      return res.status(400).json({ error: 'One or more categories not found or do not belong to user' })
    }
  }

  // Delete existing category assignments
  const { error: deleteError } = await safeSupabaseCall(
    () => supabase
      .from('user_phrasal_verbs_categories')
      .delete()
      .eq('phrasal_verb_id', phrasalVerbId)
      .eq('user_id', userData.user.id),
    { timeoutMs: 10000, maxRetries: 2 }
  )

  if (deleteError) {
    console.error('[api/vocabulary/phrasal-verbs/:id/categories] Delete error:', deleteError)
    return res.status(500).json({ error: 'Failed to remove existing categories', details: deleteError.message })
  }

  // Insert new category assignments
  if (category_ids.length > 0) {
    const assignments = category_ids.map(categoryId => ({
      user_id: userData.user.id,
      phrasal_verb_id: phrasalVerbId,
      category_id: categoryId
    }))

    const { error: insertError } = await safeSupabaseCall(
      () => supabase
        .from('user_phrasal_verbs_categories')
        .insert(assignments),
      { timeoutMs: 10000, maxRetries: 2 }
    )

    if (insertError) {
      console.error('[api/vocabulary/phrasal-verbs/:id/categories] Insert error:', insertError)
      return res.status(500).json({ error: 'Failed to assign categories', details: insertError.message })
    }
  }

  return res.json({
    ok: true,
    message: 'Categories assigned successfully'
  })
}))

// Submit word review — requires Supabase auth
app.post('/api/vocabulary/review', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const { word, score } = req.body || {}

  if (!word || typeof word !== 'string') {
    return res.status(400).json({ error: 'Word is required' })
  }

  if (typeof score !== 'number' || score < 0 || score > 1) {
    return res.status(400).json({ error: 'Score must be a number between 0 and 1' })
  }

  const normalizedWord = normalizeWord(word)
  if (!normalizedWord) {
    return res.status(400).json({ error: 'Invalid word' })
  }

  // Get current progress
  const { data: currentProgress, error: progressError } = await safeSupabaseCall(
    () => supabase
      .from('vocabulary_progress')
      .select('*')
      .eq('user_id', userData.user.id)
      .eq('word', normalizedWord)
      .single(),
    { timeoutMs: 10000, maxRetries: 2 }
  )

  if (progressError || !currentProgress) {
    return res.status(404).json({ error: 'Word not found in vocabulary' })
  }

  // Get current interval (in days)
  let currentInterval = 0
  if (currentProgress.next_review_at && currentProgress.last_reviewed_at) {
    const intervalMs = new Date(currentProgress.next_review_at) - new Date(currentProgress.last_reviewed_at)
    currentInterval = Math.floor(intervalMs / (1000 * 60 * 60 * 24))
  }

  // Calculate new review schedule
  const reviewResult = calculateNextReview(
    score,
    currentInterval,
    currentProgress.consecutive_correct || 0,
    currentProgress.consecutive_incorrect || 0
  )

  // Update consecutive counters
  let newConsecutiveCorrect = 0
  let newConsecutiveIncorrect = 0

  if (score >= 0.7) {
    // Correct answer
    newConsecutiveCorrect = (currentProgress.consecutive_correct || 0) + 1
    newConsecutiveIncorrect = 0
  } else {
    // Incorrect answer
    newConsecutiveCorrect = 0
    newConsecutiveIncorrect = (currentProgress.consecutive_incorrect || 0) + 1
  }

  // Update mastery level in user_vocabulary based on score
  let newMasteryLevel = 1
  if (score >= 0.8) {
    newMasteryLevel = Math.min(5, Math.max(3, newMasteryLevel + 1))
  } else if (score >= 0.5) {
    newMasteryLevel = Math.min(4, Math.max(2, newMasteryLevel))
  } else {
    newMasteryLevel = Math.max(1, newMasteryLevel - 1)
  }

  // Update vocabulary_progress
  const { data: updatedProgress, error: updateError } = await safeSupabaseCall(
    () => supabase
      .from('vocabulary_progress')
      .update({
        review_count: (currentProgress.review_count || 0) + 1,
        last_review_score: score,
        consecutive_correct: newConsecutiveCorrect,
        consecutive_incorrect: newConsecutiveIncorrect,
        last_reviewed_at: new Date().toISOString(),
        next_review_at: reviewResult.nextReviewAt.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', currentProgress.id)
      .select()
      .single(),
    { timeoutMs: 15000, maxRetries: 2 }
  )

  if (updateError) {
    console.error('[api/vocabulary/review] Update error:', updateError)
    return res.status(500).json({ error: 'Failed to update review progress', details: updateError.message })
  }

  // Update user_vocabulary
  await safeSupabaseCall(
    () => supabase
      .from('user_vocabulary')
      .update({
        mastery_level: newMasteryLevel,
        last_reviewed_at: new Date().toISOString(),
        next_review_at: reviewResult.nextReviewAt.toISOString(),
        times_practiced: (currentProgress.review_count || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userData.user.id)
      .eq('word', normalizedWord),
    { timeoutMs: 15000, maxRetries: 2 }
  )

  return res.json({
    ok: true,
    progress: updatedProgress,
    next_review_at: reviewResult.nextReviewAt.toISOString(),
    new_interval_days: reviewResult.newInterval,
    mastery_level: newMasteryLevel
  })
}))

// ============================================================================
// Vocabulary Categories API
// ============================================================================

// Get all categories — requires Supabase auth
app.get('/api/vocabulary/categories', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const { data: categories, error: categoriesError } = await safeSupabaseCall(
    () => supabase
      .from('vocabulary_categories_with_counts')
      .select('*')
      .eq('user_id', userData.user.id)
      .order('name', { ascending: true }),
    { timeoutMs: 15000, maxRetries: 2 }
  )

  if (categoriesError) {
    console.error('[api/vocabulary/categories] Error:', categoriesError)
    return res.status(500).json({ error: 'Failed to fetch categories', details: categoriesError.message })
  }

  return res.json({
    ok: true,
    categories: categories || []
  })
}))

// Create category — requires Supabase auth
app.post('/api/vocabulary/categories', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const { name, description, color, icon } = req.body || {}

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Category name is required' })
  }

  const { data: category, error: categoryError } = await safeSupabaseCall(
    () => supabase
      .from('vocabulary_categories')
      .insert({
        user_id: userData.user.id,
        name: name.trim(),
        description: description || null,
        color: color || '#3b82f6',
        icon: icon || null
      })
      .select()
      .single(),
    { timeoutMs: 15000, maxRetries: 2 }
  )

  if (categoryError) {
    console.error('[api/vocabulary/categories] Create error:', categoryError)
    if (categoryError.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'Category with this name already exists' })
    }
    return res.status(500).json({ error: 'Failed to create category', details: categoryError.message })
  }

  return res.json({
    ok: true,
    category: {
      ...category,
      word_count: 0
    }
  })
}))

// Update category — requires Supabase auth
app.put('/api/vocabulary/categories/:id', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const categoryId = req.params.id
  const { name, description, color, icon } = req.body || {}

  const updateData = {}
  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Category name cannot be empty' })
    }
    updateData.name = name.trim()
  }
  if (description !== undefined) updateData.description = description || null
  if (color !== undefined) updateData.color = color || '#3b82f6'
  if (icon !== undefined) updateData.icon = icon || null

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: 'No fields to update' })
  }

  const { data: category, error: categoryError } = await safeSupabaseCall(
    () => supabase
      .from('vocabulary_categories')
      .update(updateData)
      .eq('id', categoryId)
      .eq('user_id', userData.user.id)
      .select()
      .single(),
    { timeoutMs: 15000, maxRetries: 2 }
  )

  if (categoryError) {
    console.error('[api/vocabulary/categories] Update error:', categoryError)
    if (categoryError.code === 'PGRST116') { // Not found
      return res.status(404).json({ error: 'Category not found' })
    }
    if (categoryError.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'Category with this name already exists' })
    }
    return res.status(500).json({ error: 'Failed to update category', details: categoryError.message })
  }

  return res.json({
    ok: true,
    category
  })
}))

// Delete category — requires Supabase auth
app.delete('/api/vocabulary/categories/:id', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const categoryId = req.params.id

  const { error: deleteError } = await safeSupabaseCall(
    () => supabase
      .from('vocabulary_categories')
      .delete()
      .eq('id', categoryId)
      .eq('user_id', userData.user.id),
    { timeoutMs: 15000, maxRetries: 2 }
  )

  if (deleteError) {
    console.error('[api/vocabulary/categories] Delete error:', deleteError)
    return res.status(500).json({ error: 'Failed to delete category', details: deleteError.message })
  }

  return res.json({
    ok: true,
    message: 'Category deleted successfully'
  })
}))

// Assign categories to word — requires Supabase auth
app.post('/api/vocabulary/words/:id/categories', asyncHandler(async (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' })
  }

  // Authenticate user
  let userData, userErr
  try {
    const result = await Promise.resolve(supabase.auth.getUser(token)).catch(err => {
      throw err
    })
    userData = result.data
    userErr = result.error
  } catch (authError) {
    const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
    const errorMessage = authError?.message || authError?.error?.message || 'Unknown error'

    if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
      return res.status(502).json({
        error: 'Не удалось подключиться к Supabase (таймаут соединения).',
        details: { code: errorCode, message: errorMessage }
      })
    }
    throw authError
  }

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const vocabularyId = req.params.id
  const { category_ids } = req.body || {}

  if (!Array.isArray(category_ids)) {
    return res.status(400).json({ error: 'category_ids must be an array' })
  }

  // Verify vocabulary belongs to user
  const { data: vocabulary, error: vocabError } = await safeSupabaseCall(
    () => supabase
      .from('user_vocabulary')
      .select('id')
      .eq('id', vocabularyId)
      .eq('user_id', userData.user.id)
      .single(),
    { timeoutMs: 10000, maxRetries: 2 }
  )

  if (vocabError || !vocabulary) {
    return res.status(404).json({ error: 'Word not found' })
  }

  // Verify all categories belong to user
  if (category_ids.length > 0) {
    const { data: categories, error: categoriesError } = await safeSupabaseCall(
      () => supabase
        .from('vocabulary_categories')
        .select('id')
        .eq('user_id', userData.user.id)
        .in('id', category_ids),
      { timeoutMs: 10000, maxRetries: 2 }
    )

    if (categoriesError || !categories || categories.length !== category_ids.length) {
      return res.status(400).json({ error: 'One or more categories not found or do not belong to user' })
    }
  }

  // Delete existing category assignments
  const { error: deleteError } = await safeSupabaseCall(
    () => supabase
      .from('user_vocabulary_categories')
      .delete()
      .eq('vocabulary_id', vocabularyId)
      .eq('user_id', userData.user.id),
    { timeoutMs: 10000, maxRetries: 2 }
  )

  if (deleteError) {
    console.error('[api/vocabulary/words/:id/categories] Delete error:', deleteError)
    return res.status(500).json({ error: 'Failed to remove existing categories', details: deleteError.message })
  }

  // Insert new category assignments
  if (category_ids.length > 0) {
    const assignments = category_ids.map(categoryId => ({
      user_id: userData.user.id,
      vocabulary_id: vocabularyId,
      category_id: categoryId
    }))

    const { error: insertError } = await safeSupabaseCall(
      () => supabase
        .from('user_vocabulary_categories')
        .insert(assignments),
      { timeoutMs: 10000, maxRetries: 2 }
    )

    if (insertError) {
      console.error('[api/vocabulary/words/:id/categories] Insert error:', insertError)
      return res.status(500).json({ error: 'Failed to assign categories', details: insertError.message })
    }
  }

  return res.json({
    ok: true,
    message: 'Categories assigned successfully'
  })
}))

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[Global error handler]', {
    message: err.message,
    code: err?.cause?.code || err?.code,
    stack: err.stack
  })

  // Handle Supabase timeout errors
  const code = err?.cause?.code || err?.code
  if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT' || code === 'ECONNRESET') {
    return res.status(502).json({
      error: 'Не удалось подключиться к сервису (таймаут соединения). Проверьте сеть и настройки.',
      details: {
        code,
        message: err.message
      }
    })
  }

  res.status(500).json({
    error: 'Something went wrong!',
    details: err.message
  })
})

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection]', reason)
  // Don't exit, just log
})

// Функция для запуска сервера с автоматическим выбором свободного порта
function startServer(port, maxAttempts = 10) {
  return new Promise((resolve, reject) => {
    // Проверяем, что порт валидный (0-65535)
    if (port < 0 || port > 65535) {
      reject(new Error(`Invalid port: ${port}. Port must be between 0 and 65535`))
      return
    }

    const server = http.createServer(app)
    server.listen(port, () => {
      console.log(`🚀 Backend server running on port ${port}`)
      console.log(`📡 Supabase URL: ${supabaseUrl ? 'configured' : 'missing'}`)
      console.log(`⏱️  Server timeout: ${SERVER_TIMEOUT_MS / 1000} seconds (${SERVER_TIMEOUT_MS / 60000} minutes)`)
      console.log(`🤖 AITUNNEL configuration:`)
      console.log(`   Base URL: ${AITUNNEL_BASE_URL}`)
      console.log(`   Model: ${AITUNNEL_MODEL}`)
      console.log(`   Timeout: ${AITUNNEL_TIMEOUT_MS / 1000} seconds (${AITUNNEL_TIMEOUT_MS / 60000} minutes)`)
      console.log(`   API Key: ${AITUNNEL_API_KEY ? AITUNNEL_API_KEY.substring(0, 20) + '...' : 'missing'}`)
      resolve(server)
    })

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        if (maxAttempts > 0 && port < 65535) {
          const nextPort = port + 1
          console.warn(`⚠ Port ${port} is in use, trying ${nextPort} instead.`)
          server.once('close', () => {
            startServer(nextPort, maxAttempts - 1)
              .then(resolve)
              .catch(reject)
          })
          server.close()
        } else {
          reject(new Error(`Could not find a free port. Tried up to port ${port}`))
        }
      } else {
        reject(err)
      }
    })
  })
}

// На Vercel приложение отдаётся как serverless handler — сервер не запускаем
let server
let actualPort = PORT

if (!process.env.VERCEL) {
  startServer(PORT)
    .then((srv) => {
      server = srv
      actualPort = server.address().port

      server.timeout = SERVER_TIMEOUT_MS
      server.keepAliveTimeout = SERVER_TIMEOUT_MS
      server.headersTimeout = SERVER_TIMEOUT_MS

      console.log(`✅ Registered routes: /api/agent/stt, /api/agent/tts, /api/agent/chat, /api/agent/roleplay-feedback, /api/agent/debate-feedback, /api/agent/debate-topic-prepare, /api/agent/assess-speaking, /api/transcribe, /api/tts`)
    })
    .catch((err) => {
      console.error('[Server] Ошибка запуска сервера:', err)
      process.exit(1)
    })
}

export default app
