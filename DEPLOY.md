# Руководство по деплою

## Быстрый деплой

### 1. Supabase (5 минут)

1. Создайте проект на [supabase.com](https://supabase.com)
2. Выполните SQL из `supabase/schema.sql` в SQL Editor
3. Включите Realtime для таблиц (Database → Replication)
4. Скопируйте URL и ключи API

### 2. Railway - Backend (10 минут)

1. Зайдите на [railway.app](https://railway.app)
2. New Project → Deploy from GitHub repo
3. Выберите репозиторий
4. В настройках проекта:
   - **Root Directory**: `backend`
   - **Start Command**: `npm start`
5. Добавьте переменные окружения:
   ```
   SUPABASE_URL=ваш_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=ваш_service_role_key
   FRONTEND_URL=https://your-vercel-app.vercel.app
   ```
6. Railway автоматически задеплоит и даст URL

### 3. Vercel - Frontend (10 минут)

1. Зайдите на [vercel.com](https://vercel.com)
2. New Project → Import Git Repository
3. Выберите репозиторий
4. Настройки:
   - **Framework Preset**: Next.js
   - **Root Directory**: `frontend`
5. Добавьте переменные окружения:
   ```
   NEXT_PUBLIC_SUPABASE_URL=ваш_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=ваш_anon_key
   NEXT_PUBLIC_API_URL=https://your-railway-app.railway.app
   ```
6. Deploy

### 4. Обновление URL (5 минут)

После деплоя обновите:
- В Vercel: `NEXT_PUBLIC_API_URL` = URL Railway бэкенда
- В Railway: `FRONTEND_URL` = URL Vercel фронтенда

## Проверка деплоя

1. ✅ Frontend: `https://your-app.vercel.app` - должна открыться главная страница
2. ✅ Backend Health: `https://your-backend.railway.app/health` - должен вернуть `{"status":"ok"}`
3. ✅ Real-time: `https://your-app.vercel.app/realtime-example` - должна работать подписка

## Troubleshooting

### Railway не деплоит
- Проверьте, что Root Directory = `backend`
- Проверьте Start Command = `npm start`
- Проверьте логи в Railway Dashboard

### Vercel ошибки сборки
- Проверьте, что Root Directory = `frontend`
- Проверьте все переменные окружения
- Проверьте логи сборки в Vercel Dashboard

### Real-time не работает
- Убедитесь, что Realtime включен для таблиц в Supabase
- Проверьте правильность ключей API
- Откройте консоль браузера для отладки WebSocket
