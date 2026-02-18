/**
 * STT (Speech-to-Text) — единая точка вызова транскрипции.
 * Сейчас: AITunnel/OpenAI Whisper API. В будущем: можно добавить провайдер (whisper-sdk и т.д.) по env.
 * Переменные окружения читаются лениво при первом вызове (после dotenv в index.js).
 */

import OpenAI from 'openai'

let client = null

function getClient() {
  const apiKey = process.env.AITUNNEL_API_KEY
  if (!apiKey) throw new Error('AITUNNEL_API_KEY is not set')
  if (!client) {
    const baseURL = process.env.AITUNNEL_BASE_URL || 'https://api.aitunnel.ru/v1/'
    const timeoutMs = Number.parseInt(process.env.AITUNNEL_STT_TIMEOUT_MS || '1800000', 10)
    const maxRetries = Number.parseInt(process.env.AITUNNEL_MAX_RETRIES || '1', 10)
    client = new OpenAI({
      apiKey,
      baseURL,
      timeout: Number.isFinite(timeoutMs) ? timeoutMs : 1800000,
      maxRetries: Number.isFinite(maxRetries) ? maxRetries : 1,
    })
  }
  return client
}

function getModel() {
  return process.env.AITUNNEL_STT_MODEL || 'whisper-1'
}

/**
 * Транскрибирует аудио из потока.
 * @param {import('stream').Readable} fileStream — поток аудиофайла (fs.createReadStream)
 * @param {{ language?: string }} [options] — опции (например language: 'en')
 * @returns {Promise<{ text: string }>}
 */
export async function transcribe(fileStream, options = {}) {
  const sttClient = getClient()
  const params = {
    model: getModel(),
    file: fileStream,
  }
  if (options.language) params.language = options.language

  const transcription = await sttClient.audio.transcriptions.create(params)
  const text = (transcription && typeof transcription.text === 'string')
    ? transcription.text.trim()
    : ''
  return { text }
}
