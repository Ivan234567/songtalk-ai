/**
 * Единая точка входа для бэкенд-API при деплое на Vercel.
 * Все запросы к /api/* передаются в Express-приложение из server/ (копия backend/src).
 */
import app from '../../server/index.js'

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
}

export default app
