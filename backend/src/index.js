import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}))
app.use(express.json())

// Инициализация Supabase клиента
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    supabase: supabaseUrl ? 'configured' : 'missing'
  })
})

// API Routes
app.get('/api/test', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('_test')
      .select('*')
      .limit(1)
    
    if (error) {
      return res.status(500).json({ error: error.message })
    }
    
    res.json({ 
      message: 'Supabase connection successful',
      data 
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Real-time WebSocket endpoint для Railway
app.get('/api/realtime', (req, res) => {
  res.json({ 
    message: 'Real-time is handled by Supabase directly',
    supabaseUrl 
  })
})

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Something went wrong!' })
})

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`)
  console.log(`📡 Supabase URL: ${supabaseUrl ? 'configured' : 'missing'}`)
})
