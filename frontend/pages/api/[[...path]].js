/**
 * Единая точка входа для бэкенд-API при деплое на Vercel.
 * Все запросы к /api/* передаются в Express-приложение из server/ (копия backend/src).
 * Перед сборкой должен выполняться: node scripts/copy-backend.js
 */
import app from '../../server/index.js'

export default app
