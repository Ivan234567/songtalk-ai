/**
 * Копирует backend/src в frontend/server для деплоя на Vercel (один проект = фронт + API).
 * Запускается перед next build при деплое.
 */
const fs = require('fs')
const path = require('path')

const backendSrc = path.join(__dirname, '..', '..', 'backend', 'src')
const targetDir = path.join(__dirname, '..', 'server')

if (!fs.existsSync(backendSrc)) {
  console.warn('[copy-backend] backend/src not found, skipping (OK for Vercel if backend is in repo)')
  process.exit(0)
}

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true })
}

const files = fs.readdirSync(backendSrc)
for (const file of files) {
  const src = path.join(backendSrc, file)
  const dest = path.join(targetDir, file)
  if (fs.statSync(src).isFile()) {
    fs.copyFileSync(src, dest)
    console.log('[copy-backend] copied', file)
  }
}

console.log('[copy-backend] done:', targetDir)
