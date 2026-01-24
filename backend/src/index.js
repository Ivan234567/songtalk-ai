import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
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

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config()

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

// Configure multer for file uploads (audio and video)
const upload = multer({
  dest: 'uploads/',
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

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads')
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

// Ensure TTS output directory exists
// Files are stored permanently here for caching (not deleted after use)
const ttsOutputDir = path.join(__dirname, '..', 'tts_output')
if (!fs.existsSync(ttsOutputDir)) {
  fs.mkdirSync(ttsOutputDir, { recursive: true })
  console.log('[TTS] Created output directory:', ttsOutputDir)
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

// TTS Server configuration
const TTS_SERVER_PORT = Number.parseInt(process.env.TTS_SERVER_PORT || '8765', 10)
const TTS_SERVER_URL = `http://localhost:${TTS_SERVER_PORT}`
let ttsServerProcess = null
let ttsRestartCount = 0
const MAX_TTS_RESTARTS = 5 // Максимум 5 перезапусков
const TTS_HEALTH_CHECK_DELAY = Number.parseInt(process.env.TTS_HEALTH_CHECK_DELAY || '35000', 10) // 35 секунд по умолчанию

// Whisper Server configuration
const WHISPER_SERVER_PORT = Number.parseInt(process.env.WHISPER_SERVER_PORT || '8766', 10)
const WHISPER_SERVER_URL = `http://localhost:${WHISPER_SERVER_PORT}`
let whisperServerProcess = null
let whisperRestartCount = 0
const MAX_WHISPER_RESTARTS = 5 // Максимум 5 перезапусков
const WHISPER_HEALTH_CHECK_DELAY = Number.parseInt(process.env.WHISPER_HEALTH_CHECK_DELAY || '35000', 10) // 35 секунд по умолчанию

// Start TTS HTTP server
function startTTSServer() {
  const pythonScript = path.join(__dirname, 'tts_server.py')
  const defaultPython = process.platform === 'win32' ? 'py' : 'python3'
  const pythonCommand = process.env.PYTHON_COMMAND || defaultPython
  
  console.log('[TTS] Starting TTS HTTP server...')
  console.log(`[TTS] Python command: ${pythonCommand}`)
  console.log(`[TTS] Script path: ${pythonScript}`)
  console.log(`[TTS] Port: ${TTS_SERVER_PORT}`)
  console.log(`[TTS] Output dir: ${ttsOutputDir}`)
  
  ttsServerProcess = spawn(pythonCommand, [
    pythonScript,
    '--port', TTS_SERVER_PORT.toString(),
    '--output-dir', ttsOutputDir
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: path.join(__dirname, '..')
  })
  
  console.log(`[TTS] Server process started (PID: ${ttsServerProcess.pid})`)
  
  ttsServerProcess.stdout.on('data', (data) => {
    const output = data.toString()
    // Log all stdout for debugging
    if (output.trim()) {
      console.log('[TTS Server stdout]', output.trim())
    }
  })
  
  ttsServerProcess.stderr.on('data', (data) => {
    const output = data.toString()
    // Log all stderr from TTS server for debugging
    // Filter out common warnings that are not critical
    if (output.trim()) {
      // Always log server startup messages and errors
      if (output.includes('[TTS Server]') || 
          output.includes('Starting on') || 
          output.includes('ERROR') || 
          output.includes('Error') ||
          output.includes('Traceback')) {
        console.log('[TTS Server]', output.trim())
      } else if (!output.includes('DeprecationWarning') && !output.includes('UserWarning')) {
        console.log('[TTS Server]', output.trim())
      }
    }
  })
  
  ttsServerProcess.on('error', (err) => {
    console.error('[TTS] Failed to start TTS server:', err.message || err)
    if (err.code === 'ENOENT') {
      console.error(`[TTS] Python command '${pythonCommand}' not found. Install Python or set PYTHON_COMMAND env variable.`)
    }
  })
  
  ttsServerProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[TTS] Server exited unexpectedly with code ${code}`)
      console.error('[TTS] Check stderr above for error details')
      console.error(`[TTS] Python command used: ${pythonCommand}`)
      console.error(`[TTS] Script path: ${pythonScript}`)
      
      // Автоматический перезапуск при падении (если не превышен лимит)
      if (ttsRestartCount < MAX_TTS_RESTARTS) {
        ttsRestartCount++
        const delay = Math.min(ttsRestartCount * 2000, 10000) // Увеличиваем задержку с каждым перезапуском (макс 10 сек)
        console.log(`[TTS] Attempting restart ${ttsRestartCount}/${MAX_TTS_RESTARTS} in ${delay}ms...`)
        setTimeout(() => {
          startTTSServer()
        }, delay)
      } else {
        console.error(`[TTS] Max restart attempts (${MAX_TTS_RESTARTS}) reached. Server will use fallback method.`)
      }
    } else if (code === 0) {
      console.log(`[TTS] Server process exited normally (code ${code})`)
      // Сбрасываем счетчик при нормальном завершении
      ttsRestartCount = 0
    }
  })
  
  // Wait for models to load (can take 30+ seconds) and check if server started successfully
  setTimeout(async () => {
    // Check if process is still running
    if (ttsServerProcess && (ttsServerProcess.killed || ttsServerProcess.exitCode !== null)) {
      console.error('[TTS] Server process was killed or exited before health check')
      return
    }
    
    try {
      console.log(`[TTS] Checking server health at ${TTS_SERVER_URL}/health (after ${TTS_HEALTH_CHECK_DELAY}ms)...`)
      const healthCheck = await fetch(`${TTS_SERVER_URL}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000) // 5 секунд на ответ health check
      }).catch((err) => {
        console.log(`[TTS] Health check failed: ${err.message}`)
        return null
      })
      
      if (healthCheck && healthCheck.ok) {
        const data = await healthCheck.json().catch(() => ({}))
        console.log(`[TTS] ✓ Server is running on ${TTS_SERVER_URL}`, data)
        // Сбрасываем счетчик при успешном запуске
        ttsRestartCount = 0
      } else {
        // Models may still be loading - это нормально, система будет использовать fallback
        console.log(`[TTS] Server is starting... Models may still be loading. Health check returned: ${healthCheck?.status || 'no response'}`)
        console.log(`[TTS] System will use fallback method if HTTP server isn't ready`)
      }
    } catch (err) {
      // Not critical - server will use fallback if HTTP server isn't ready
      console.log(`[TTS] Server is starting... (${err?.message || 'unknown error'})`)
      console.log(`[TTS] System will use fallback method if HTTP server isn't ready`)
    }
  }, TTS_HEALTH_CHECK_DELAY) // Увеличено до 35 секунд для загрузки моделей
}

// Start Whisper HTTP server
function startWhisperServer() {
  const pythonScript = path.join(__dirname, 'whisper_server.py')
  const defaultPython = process.platform === 'win32' ? 'py' : 'python3'
  const pythonCommand = process.env.PYTHON_COMMAND || defaultPython
  
  console.log('[Whisper] Starting Whisper HTTP server...')
  whisperServerProcess = spawn(pythonCommand, [
    pythonScript,
    '--port', WHISPER_SERVER_PORT.toString()
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: path.join(__dirname, '..')
  })
  
  whisperServerProcess.stdout.on('data', (data) => {
    const output = data.toString()
    if (output.trim()) {
      console.log('[Whisper Server stdout]', output.trim())
    }
  })
  
  whisperServerProcess.stderr.on('data', (data) => {
    const output = data.toString()
    console.error('[Whisper Server stderr]', output.trim())
  })
  
  whisperServerProcess.on('error', (err) => {
    console.error('[Whisper] Failed to start Whisper server:', err)
    
    // Автоматический перезапуск при ошибке запуска (если не превышен лимит)
    if (whisperRestartCount < MAX_WHISPER_RESTARTS) {
      whisperRestartCount++
      const delay = Math.min(whisperRestartCount * 2000, 10000) // Увеличиваем задержку с каждым перезапуском
      console.log(`[Whisper] Attempting restart ${whisperRestartCount}/${MAX_WHISPER_RESTARTS} in ${delay}ms...`)
      setTimeout(() => {
        startWhisperServer()
      }, delay)
    } else {
      console.error(`[Whisper] Max restart attempts (${MAX_WHISPER_RESTARTS}) reached. Server will use fallback method.`)
    }
  })
  
  whisperServerProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[Whisper] Server exited unexpectedly with code ${code}`)
      console.error('[Whisper] Check stderr above for error details')
      
      // Автоматический перезапуск при падении (если не превышен лимит)
      if (whisperRestartCount < MAX_WHISPER_RESTARTS) {
        whisperRestartCount++
        const delay = Math.min(whisperRestartCount * 2000, 10000) // Увеличиваем задержку с каждым перезапуском
        console.log(`[Whisper] Attempting restart ${whisperRestartCount}/${MAX_WHISPER_RESTARTS} in ${delay}ms...`)
        setTimeout(() => {
          startWhisperServer()
        }, delay)
      } else {
        console.error(`[Whisper] Max restart attempts (${MAX_WHISPER_RESTARTS}) reached. Server will use fallback method.`)
      }
    } else if (code === 0) {
      console.log(`[Whisper] Server process exited normally (code ${code})`)
      // Сбрасываем счетчик при нормальном завершении
      whisperRestartCount = 0
    }
  })
  
  // Wait for models to load (can take 30+ seconds) and check if server started successfully
  setTimeout(async () => {
    // Check if process is still running
    if (whisperServerProcess && (whisperServerProcess.killed || whisperServerProcess.exitCode !== null)) {
      console.error('[Whisper] Server process was killed or exited before health check')
      return
    }
    
    try {
      console.log(`[Whisper] Checking server health at ${WHISPER_SERVER_URL}/health (after ${WHISPER_HEALTH_CHECK_DELAY}ms)...`)
      // Whisper server может не иметь /health endpoint, просто проверяем что процесс жив
      if (whisperServerProcess && whisperServerProcess.exitCode === null && !whisperServerProcess.killed) {
        console.log(`[Whisper] ✓ Server process is running on ${WHISPER_SERVER_URL}`)
        // Сбрасываем счетчик при успешном запуске
        whisperRestartCount = 0
      } else {
        console.log(`[Whisper] Server process status unclear, will use fallback if needed`)
      }
    } catch (err) {
      // Not critical - server will use fallback if HTTP server isn't ready
      console.log(`[Whisper] Server is starting... (${err?.message || 'unknown error'})`)
      console.log(`[Whisper] System will use fallback method if HTTP server isn't ready`)
    }
  }, WHISPER_HEALTH_CHECK_DELAY) // Увеличено до 35 секунд для загрузки моделей
}

// Stop TTS server on process exit
process.on('SIGINT', () => {
  if (ttsServerProcess) {
    console.log('[TTS] Stopping TTS server...')
    ttsServerProcess.kill()
  }
  process.exit(0)
})

process.on('SIGTERM', () => {
  if (ttsServerProcess) {
    console.log('[TTS] Stopping TTS server...')
    ttsServerProcess.kill()
  }
  process.exit(0)
})

// Start TTS server
startTTSServer()
// Start Whisper server
startWhisperServer()

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
const AITUNNEL_MODEL = process.env.AITUNNEL_MODEL || 'DeepSeek-V3.2-Speciale'
// Увеличенный таймаут для долгих запросов (анализ текста на идиомы и т.п.)
// По умолчанию 900 секунд (15 минут), можно переопределить через переменную окружения AITUNNEL_TIMEOUT_MS
const AITUNNEL_TIMEOUT_MS = Number.parseInt(process.env.AITUNNEL_TIMEOUT_MS || '900000', 10)
const AITUNNEL_MAX_RETRIES = Number.parseInt(process.env.AITUNNEL_MAX_RETRIES || '1', 10)

if (!AITUNNEL_API_KEY) {
  console.error('Missing AITUNNEL_API_KEY environment variable')
  process.exit(1)
}

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
                       error.message?.includes('timeout')

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

    // Use backend-issued JWT instead of calling Supabase on every request
    const decoded = verifyBackendJwt(rawToken)
    if (!decoded || !decoded.sub) {
      return res.status(401).json({ error: 'Invalid or expired token' })
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
      
      // Otherwise it's AITUNNEL timeout
      console.error('[api/chat] AITUNNEL timeout:', errorMessage)
      return res.status(502).json({
        error: 'Не удалось подключиться к AITUNNEL (таймаут запроса). Проверьте сеть/фаервол/прокси или увеличьте таймаут.',
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
        error: 'Соединение с AITUNNEL было сброшено (ECONNRESET). Проверьте сеть/фаервол/прокси.',
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

    if (!req.file) {
      return res.status(400).json({ error: 'No audio or video file provided' })
    }

    audioFilePath = req.file.path
    // Используем small.en - оптимальный баланс скорости и точности для английского языка
    // small.en обеспечивает отличную точность при приемлемой скорости для production
    const whisperModel = 'small.en' // Оптимальная модель Whisper для production (только английский)
    const language = 'en' // Фиксируем английский язык

    // Check if file is a video and extract audio if needed
    // Whisper can handle video files directly, but we'll keep the original file path
    const isVideoFile = req.file.mimetype?.startsWith('video/') || 
                        req.file.originalname?.match(/\.(mp4|mov|avi|mkv|webm)$/i)

    // Use Whisper HTTP server (model stays in memory - MUCH FASTER!)
    let result
    try {
      const whisperResponse = await fetch(`${WHISPER_SERVER_URL}/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audio_path: audioFilePath.replace(/\\/g, '/'),
          model: whisperModel,
          language: language,
        }),
        // Timeout for Whisper transcription (60 seconds)
        signal: AbortSignal.timeout(60000)
      })
      
      if (!whisperResponse.ok) {
        const errorData = await whisperResponse.json().catch(() => ({}))
        throw new Error(errorData.error || `Whisper server error: ${whisperResponse.status}`)
      }
      
      result = await whisperResponse.json()
      
      console.log('[api/transcribe] Using Whisper HTTP server (model in memory)')
    } catch (fetchError) {
      // If Whisper server is not available, fallback to old method
      const errorCode = fetchError.code || fetchError.cause?.code || 
                       (fetchError.cause?.errors?.[0]?.code) ||
                       (fetchError.cause?.code)
      
      const isConnectionError = (
        errorCode === 'ECONNREFUSED' || 
        fetchError.name === 'AbortError' ||
        fetchError.message?.includes('ECONNREFUSED') ||
        fetchError.message?.includes('fetch failed')
      )
      
      if (isConnectionError) {
        console.warn('[api/transcribe] Whisper HTTP server not available, falling back to script method (this is normal if Whisper server failed to start)')
        // Fallback to old method (for backward compatibility)
        const pythonScript = path.join(__dirname, 'whisper_transcribe.py')
        const defaultPython = process.platform === 'win32' ? 'py' : 'python3'
        const pythonCommand = process.env.PYTHON_COMMAND || defaultPython
        
        const scriptPath = pythonScript.replace(/\\/g, '/')
        const filePath = audioFilePath.replace(/\\/g, '/')
        const command = `${pythonCommand} "${scriptPath}" "${filePath}" "${whisperModel}" "${language}"`
        
        const { stdout, stderr } = await execAsync(command)
        
        // Filter out harmless warnings
        if (stderr) {
          const harmlessWarnings = [
            'Using cache',
            'FP16 is not supported on CPU',
            'UserWarning: FP16'
          ]
          const hasRealError = !harmlessWarnings.some(warning => 
            stderr.includes(warning)
          )
          if (hasRealError) {
            console.error('[whisper] stderr:', stderr)
          }
        }
        
        result = JSON.parse(stdout)
      } else {
        throw fetchError
      }
    }

    if (!result.success) {
      return res.status(500).json({
        error: 'Transcription failed',
        details: result.error
      })
    }

    // Не сохраняем голосовые записи пользователя в базу - они нужны только для транскрибирования
    // Файл будет удален в блоке finally после транскрибирования

    return res.json({
      ok: true,
      text: result.text,
      language: result.language,
      segments: result.segments || []
    })
  } catch (err) {
    console.error('[api/transcribe] error:', err)
    
    // Handle specific error types
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
      error: 'Transcription request failed', 
      details: err.message 
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

// TTS synthesis endpoint — requires backend JWT (independent of Supabase availability)
app.post('/api/tts', async (req, res) => {
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

    const { text, model } = req.body || {}
    
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Text is required and must be a non-empty string' })
    }

    // Remove emojis and other Unicode symbols that TTS can't handle
    // This regex removes emojis, emoticons, and other Unicode symbols
    const textWithoutEmojis = text
      .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // Misc Symbols and Pictographs
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transport and Map
      .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '') // Flags (iOS)
      .replace(/[\u{2600}-\u{26FF}]/gu, '') // Misc symbols
      .replace(/[\u{2700}-\u{27BF}]/gu, '') // Dingbats
      .replace(/[\u{FE00}-\u{FE0F}]/gu, '') // Variation Selectors
      .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // Supplemental Symbols and Pictographs
      .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '') // Chess Symbols
      .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '') // Symbols and Pictographs Extended-A
      .trim()

    if (!textWithoutEmojis) {
      return res.status(400).json({ error: 'Text contains only emojis or unsupported characters' })
    }

    // Limit text length
    const maxLength = 500
    const textToSynthesize = textWithoutEmojis.length > maxLength ? textWithoutEmojis.substring(0, maxLength) + "..." : textWithoutEmojis
    
    // Используем tacotron2-DDC — модель, которая уже полностью скачана локально
    // Она даёт хорошее качество английской речи и гарантированно доступна
    const ttsModel = model || 'tts_models/en/ljspeech/tacotron2-DDC'
    
    // Use TTS HTTP server (model stays in memory - MUCH FASTER!)
    let result
    try {
      // Try to connect with retry logic
      let ttsResponse = null
      let lastError = null
      
      // Try up to 2 times with short delay
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          ttsResponse = await fetch(`${TTS_SERVER_URL}/synthesize`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: textToSynthesize,
              model: ttsModel,
              output_dir: ttsOutputDir
            })
          })
          
          // If we got a response (even error), server is running
          break
        } catch (fetchErr) {
          lastError = fetchErr
          // If connection refused, wait a bit and retry once
          if (fetchErr.code === 'ECONNREFUSED' && attempt === 0) {
            await new Promise(resolve => setTimeout(resolve, 1000))
            continue
          }
          // If timeout, don't retry - fallback to script method
          // For other errors, also throw to fallback
          throw fetchErr
        }
      }
      
      if (!ttsResponse) {
        throw lastError || new Error('Failed to connect to TTS server')
      }
      
      if (!ttsResponse.ok) {
        const errorData = await ttsResponse.json().catch(() => ({}))
        throw new Error(errorData.error || `TTS server error: ${ttsResponse.status}`)
      }
      
      result = await ttsResponse.json()
      
      // Log cache information
      if (result.cached) {
        console.log('[api/tts] Using cached audio file')
      }
    } catch (fetchError) {
      // If TTS server is not available, fallback to old method
      // Handle AggregateError with nested causes (common with fetch failures)
      const errorCode = fetchError.code || fetchError.cause?.code || 
                       (fetchError.cause?.errors?.[0]?.code) ||
                       (fetchError.cause?.code)
      
      const errorName = fetchError.name || fetchError.constructor?.name || ''
      const errorMessage = fetchError.message || String(fetchError) || ''
      
      const isConnectionError = (
        errorCode === 'ECONNREFUSED' || 
        errorName === 'AbortError' ||
        errorName === 'TimeoutError' ||
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('fetch failed') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('timed out') ||
        errorMessage.includes('aborted due to timeout') ||
        errorMessage.includes('signal timed out')
      )
      
      if (isConnectionError) {
        const reason = errorName === 'TimeoutError' || errorMessage.includes('timeout') 
          ? 'timeout' 
          : 'connection refused'
        console.warn(`[api/tts] TTS HTTP server ${reason}, falling back to script method`)
        console.warn('[api/tts] Note: TTS server provides faster synthesis. Check server logs for startup issues.')
        // Fallback to old method (for backward compatibility)
        const pythonScript = path.join(__dirname, 'tts_synthesize.py')
        const defaultPython = process.platform === 'win32' ? 'py' : 'python3'
        const pythonCommand = process.env.PYTHON_COMMAND || defaultPython
        const ttsOutputPath = ttsOutputDir.replace(/\\/g, '/')
        const escapedText = textToSynthesize.replace(/"/g, '\\"').replace(/\$/g, '\\$')
        const escapedOutputPath = ttsOutputPath.replace(/"/g, '\\"').replace(/\$/g, '\\$')
        const scriptPath = pythonScript.replace(/\\/g, '/')
        const command = `${pythonCommand} "${scriptPath}" "${escapedText}" "${ttsModel}" "${escapedOutputPath}"`
        
        const { stdout } = await execAsync(command)
        const jsonMatch = stdout.match(/\{[\s\S]*\}/)
        result = JSON.parse(jsonMatch ? jsonMatch[0] : stdout.trim().split('\n').pop())
      } else {
        throw fetchError
      }
    }
    
    // Check if synthesis failed (even if command succeeded)
    if (!result.success) {
      console.error('[api/tts] TTS synthesis error:', result.error)
      
      // Special handling for language unsupported error
      if (result.language_unsupported) {
        return res.status(400).json({ 
          error: 'TTS is only available for English text',
          details: result.error,
          language_unsupported: true
        })
      }
      
      return res.status(500).json({ 
        error: 'TTS synthesis failed', 
        details: result.error 
      })
    }

    const audioPath = result.audio_path
    
    // Check if file exists
    if (!fs.existsSync(audioPath)) {
      return res.status(500).json({
        error: 'Generated audio file not found',
        details: audioPath
      })
    }

    // Send audio file
    res.setHeader('Content-Type', 'audio/wav')
    res.setHeader('Content-Disposition', `inline; filename="tts_audio.wav"`)
    res.setHeader('Content-Length', result.file_size)
    res.setHeader('Cache-Control', 'public, max-age=31536000') // Cache for 1 year
    
    // Передаем путь к файлу в заголовке для последующего удаления после воспроизведения
    // Удаляем только новые файлы (не кэшированные), чтобы не терять кэш
    if (!result.cached) {
      // Используем относительный путь от корня проекта для безопасности
      const relativePath = path.relative(path.join(__dirname, '..'), audioPath)
      res.setHeader('X-Audio-File-Path', relativePath)
      console.log('[api/tts] Created new audio file (will be deleted after playback):', audioPath)
    } else {
      console.log('[api/tts] Using cached audio file (will be kept):', audioPath)
    }
    
    const audioStream = fs.createReadStream(audioPath)
    audioStream.pipe(res)
  } catch (err) {
    console.error('[api/tts] error:', err)
    
    // Handle specific error types
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
      error: 'TTS synthesis request failed', 
      details: err.message 
    })
  }
})

// Delete TTS audio file after playback
app.delete('/api/tts/file', asyncHandler(async (req, res) => {
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

    const { filePath } = req.body || {}
    
    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ error: 'filePath is required' })
    }

    // Безопасность: проверяем, что путь находится в tts_output директории
    const ttsOutputDirNormalized = path.normalize(ttsOutputDir)
    const requestedPath = path.normalize(path.join(__dirname, '..', filePath))
    
    if (!requestedPath.startsWith(ttsOutputDirNormalized)) {
      return res.status(403).json({ error: 'Invalid file path' })
    }

    // Проверяем, что файл существует
    if (!fs.existsSync(requestedPath)) {
      return res.status(404).json({ error: 'File not found' })
    }

    // Удаляем файл
    try {
      fs.unlinkSync(requestedPath)
      console.log('[api/tts] Deleted audio file after playback:', requestedPath)
      return res.json({ ok: true, message: 'File deleted successfully' })
    } catch (unlinkErr) {
      console.error('[api/tts] Failed to delete file:', unlinkErr)
      return res.status(500).json({ error: 'Failed to delete file', details: unlinkErr.message })
    }
  } catch (err) {
    console.error('[api/tts/delete] error:', err)
    return res.status(500).json({ 
      error: 'Failed to delete audio file', 
      details: err.message 
    })
  }
}))

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

    const responseText = chatResult.choices?.[0]?.message?.content?.trim() || '{}'
    
    // Пытаемся извлечь JSON из ответа (может быть обернут в markdown code blocks)
    let jsonText = responseText
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      jsonText = jsonMatch[1]
    }
    
    const definition = JSON.parse(jsonText)
    
    // Валидация и нормализация
    return {
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
  } catch (error) {
    console.error('[getWordDefinitionFromAI] Error:', error)
    // Возвращаем минимальную структуру в случае ошибки
    return {
      word: word,
      definitions: [],
      phonetic_transcription: null,
      part_of_speech: null,
      difficulty_level: null,
      frequency_rank: null,
      is_phrase: false,
      example_sentences: []
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
  return idioms
    .filter(i => i && typeof i.phrase === 'string')
    .map(i => ({
      phrase: i.phrase.trim(),
      literal_translation: i.literal_translation || '',
      meaning: i.meaning || '',
      usage_examples: Array.isArray(i.usage_examples) ? i.usage_examples : []
    }))
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
  return phrasalVerbs
    .filter(pv => pv && typeof pv.phrase === 'string')
    .map(pv => ({
      phrase: pv.phrase.trim(),
      literal_translation: pv.literal_translation || '',
      meaning: pv.meaning || '',
      usage_examples: Array.isArray(pv.usage_examples) ? pv.usage_examples : []
    }))
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
    return cached
  }

  // Если нет в кэше, получаем через AI
  const definition = await getWordDefinitionFromAI(normalizedWord)

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
    cached_at: new Date().toISOString()
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

  const word = req.query.word
  if (!word || typeof word !== 'string') {
    return res.status(400).json({ error: 'Word parameter is required' })
  }

  try {
    const definition = await getOrCreateWordDefinition(word)
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

  const { word, video_id, context } = req.body || {}
  
  if (!word || typeof word !== 'string') {
    return res.status(400).json({ error: 'Word is required' })
  }

  const normalizedWord = normalizeWord(word)
  if (!normalizedWord) {
    return res.status(400).json({ error: 'Invalid word' })
  }

  // Получаем определение слова (с AI только если нет в кэше)
  // Это оправдано, так как пользователь явно добавляет слово в словарь
  const definition = await getOrCreateWordDefinition(normalizedWord)

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

  // Объединяем слова с прогрессом и категориями
  let wordsWithProgress = wordList.map(word => ({
    ...word,
    progress: progressMap[word.word] || null,
    categories: categoriesMap[word.id] || []
  }))

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

  // Get all vocabulary words (no pagination for export)
  const { data: words, error: wordsError } = await safeSupabaseCall(
    () => supabase
      .from('user_vocabulary')
      .select('*')
      .eq('user_id', userData.user.id)
      .order('word', { ascending: true }),
    { timeoutMs: 30000, maxRetries: 2 }
  )

  if (wordsError) {
    console.error('[api/vocabulary/export] Error:', wordsError)
    return res.status(500).json({ error: 'Failed to fetch vocabulary', details: wordsError.message })
  }

  const wordList = words || []

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
  const idioms = await analyzeIdiomsWithAI(cleanedText, { maxIdioms: max_idioms })

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
          if (def && def.difficulty_level) {
            difficultyLevel = def.difficulty_level
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
  const phrasalVerbs = await analyzePhrasalVerbsWithAI(cleanedText, { maxPhrasalVerbs: max_phrasal_verbs })

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
          if (def && def.difficulty_level) {
            difficultyLevel = def.difficulty_level
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

const server = app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`)
  console.log(`📡 Supabase URL: ${supabaseUrl ? 'configured' : 'missing'}`)
  console.log(`⏱️  Server timeout: ${SERVER_TIMEOUT_MS / 1000} seconds (${SERVER_TIMEOUT_MS / 60000} minutes)`)
})

// Устанавливаем таймаут для сервера (для длительных AI запросов)
server.timeout = SERVER_TIMEOUT_MS
server.keepAliveTimeout = SERVER_TIMEOUT_MS
server.headersTimeout = SERVER_TIMEOUT_MS
