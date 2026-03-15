# Деплой фронта и бэкенда на Vercel (один проект)

Фронт и API работают в одном проекте Vercel: все запросы к `/api/*` обрабатывает Express-бэкенд через serverless-функцию.

## Что сделано в репозитории

- **Backend** (`backend/src/index.js`): при `VERCEL=1` не запускает свой сервер, отдаёт только приложение (`export default app`); загрузки файлов идут через memory storage, при необходимости файл пишется в `/tmp`.
- **Frontend**: перед сборкой скрипт `scripts/copy-backend.js` копирует `backend/src` в `frontend/server/`. Роут `pages/api/[[...path]].js` отдаёт все запросы к `/api/*` в это Express-приложение.
- Зависимости бэкенда (express, cors, multer, openai, jsonwebtoken, dotenv) добавлены в `frontend/package.json`.

## Шаги деплоя на Vercel

1. **Репозиторий**  
   Подключите репозиторий к Vercel (GitHub/GitLab/Bitbucket). В настройках проекта укажите **Root Directory: `frontend`** (сборка идёт из папки frontend).

2. **Build & Output**  
   Оставьте по умолчанию:
   - Build Command: `npm run build` (уже включает `node scripts/copy-backend.js && next build`)
   - Output Directory: `.next` (по умолчанию для Next.js)

3. **Переменные окружения** (Settings → Environment Variables)  
   Задайте те же переменные, что и для отдельного бэкенда (Supabase, AITUNNEL и т.д.), плюс опционально для API на том же домене:

   | Переменная | Значение | Заметка |
   |------------|----------|--------|
   | `NEXT_PUBLIC_SUPABASE_URL` | URL проекта Supabase | обязательно |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key Supabase | обязательно |
   | `SUPABASE_URL` | URL проекта Supabase | для бэкенд-логики |
   | `SUPABASE_SERVICE_ROLE_KEY` | service role key | для бэкенд-логики |
   | `AITUNNEL_API_KEY` | ключ API | обязательно для ИИ |
   | `AITUNNEL_BASE_URL` | `https://api.aitunnel.ru/v1/` | по желанию |
   | `AITUNNEL_MODEL` | `gpt-4o` | по желанию |
   | `BACKEND_JWT_SECRET` | секрет для JWT | обязательно для авторизации API |
   | `NEXT_PUBLIC_API_URL` | **оставьте пустым** | чтобы запросы шли на тот же домен (`/api/...`) |

   Если `NEXT_PUBLIC_API_URL` не задан или пустой, фронт ходит на тот же хост (ваш домен Vercel), и `/api/*` обрабатывает этот же деплой.

4. **Деплой**  
   Сделайте push в ветку, с которой связан проект, или запустите деплой из панели Vercel. После успешной сборки приложение и API будут доступны по одному URL, например: `https://ваш-проект.vercel.app`.

## Ограничения (демо)

- **Таймаут**: на бесплатном плане Vercel serverless-функции ограничены **10 секундами**. Длинные ответы ИИ или стриминг дольше 10 сек могут обрываться. Для демо с короткими репликами этого обычно хватает.
- **Караоке / yt-dlp**: эндпоинт загрузки субтитров через yt-dlp на Vercel может не работать (нет бинарника в окружении). Остальной функционал (чат, TTS, STT, словарь и т.д.) работает.

## Локальная разработка

- **Только фронт**: `cd frontend && npm run dev` — API не будет (нет копии бэкенда, если не запускали `npm run build` хотя бы раз).
- **Фронт + бэкенд отдельно**: как раньше — в одном терминале `npm run dev:backend`, в другом `npm run dev:frontend`, в frontend задайте `NEXT_PUBLIC_API_URL=http://localhost:3001`.

## Проверка после деплоя

- Откройте `https://ваш-проект.vercel.app/api/ping` — должен вернуться JSON `{ ok: true, timestamp: "..." }`. Или `/api/balance` с заголовком Authorization после входа.
- Войдите в приложение и проверьте чат/озвучку/словарь — запросы должны идти на тот же домен.
