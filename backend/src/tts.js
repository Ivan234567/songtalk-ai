/**
 * TTS (Text-to-Speech) — единая точка вызова синтеза речи.
 * Сейчас: AITunnel/OpenAI Speech API. В будущем: можно добавить провайдер (coqui-sdk и т.д.) по env.
 * Переменные окружения читаются лениво при первом вызове (после dotenv в index.js).
 */

import OpenAI from 'openai'

const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu

let client = null

function getClient() {
  const apiKey = process.env.AITUNNEL_API_KEY
  if (!apiKey) throw new Error('AITUNNEL_API_KEY is not set')
  if (!client) {
    const baseURL = process.env.AITUNNEL_BASE_URL || 'https://api.aitunnel.ru/v1/'
    const timeoutMs = Number.parseInt(
      process.env.AITUNNEL_TTS_TIMEOUT_MS || process.env.AITUNNEL_TIMEOUT_MS || '1800000',
      10
    )
    const maxRetries = Number.parseInt(process.env.AITUNNEL_MAX_RETRIES || '1', 10)
    client = new OpenAI({
      apiKey,
      baseURL,
      timeout: Number.isFinite(timeoutMs) ? timeoutMs : 60000,
      maxRetries: Number.isFinite(maxRetries) ? maxRetries : 1,
    })
  }
  return client
}

function getModel() {
  return process.env.AITUNNEL_TTS_MODEL || 'gpt-4o-mini-tts'
}

/**
 * Очищает текст для TTS (эмодзи и лишние символы), обрезает по длине.
 * @param {string} text
 * @param {{ maxLength?: number }} [options] — maxLength по умолчанию 2000
 * @returns {string}
 */
function prepareInput(text, options = {}) {
  const maxLength = options.maxLength ?? 2000
  const clean = text.replace(EMOJI_REGEX, '').trim()
  return clean.length > maxLength ? clean.slice(0, maxLength) + '…' : clean
}

/**
 * Синтезирует речь из текста.
 * @param {string} text — исходный текст (эмодзи будут удалены, длина ограничена)
 * @param {{ maxLength?: number, voice?: string }} [options] — maxLength (по умолчанию 2000), voice (по умолчанию 'nova')
 * @returns {Promise<Buffer>} — аудио buffer (audio/mpeg)
 */
export async function synthesize(text, options = {}) {
  const input = prepareInput(text, { maxLength: options.maxLength ?? 2000 })
  if (!input) {
    throw new Error('Text contains only unsupported characters')
  }

  const ttsClient = getClient()
  const model = getModel()
  const voice = options.voice ?? 'nova'

  const speech = await ttsClient.audio.speech.create({
    model,
    input,
    voice,
  })

  if (!speech) {
    throw new Error('Empty response from TTS API')
  }

  const buffer = Buffer.from(await speech.arrayBuffer())
  if (!buffer || buffer.length === 0) {
    throw new Error('Empty audio buffer received from TTS API')
  }

  return { buffer, characters: input.length }
}
