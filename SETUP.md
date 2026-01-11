# Инструкция по настройке

## Шаг 1: Настройка Supabase

1. Создайте проект на [supabase.com](https://supabase.com)
2. Перейдите в Settings → API
3. Скопируйте следующие значения:
   - **Project URL** → будет использоваться как `SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_URL`
   - **Publishable API Key** (новый формат `sb_publishable_...`) или **anon public** ключ (старый формат `eyJhbGc...`) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **Secret Key** (service_role) → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ секретный ключ!)
   
   > **Примечание**: Supabase использует новый формат API ключей через API Gateway. Publishable key (`sb_publishable_...`) работает аналогично старому anon key и используется для фронтенда.

4. Включите Realtime для таблиц:
   - Database → Replication
   - Включите replication для таблиц, которые нужны в real-time

## Шаг 2: Локальная настройка

### Frontend (.env.local в папке frontend/)

Создайте файл `frontend/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Backend (.env в папке backend/)

Создайте файл `backend/.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
FRONTEND_URL=http://localhost:3000
PORT=3001
```

## Шаг 3: Настройка Vercel

1. Подключите репозиторий к Vercel
2. В настройках проекта → Environment Variables добавьте:
   - `NEXT_PUBLIC_SUPABASE_URL` = ваш Supabase URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = ваш anon key
   - `NEXT_PUBLIC_API_URL` = URL вашего Railway бэкенда (после деплоя)

3. Деплой произойдет автоматически при push в main ветку

## Шаг 4: Настройка Railway

1. Создайте проект на [railway.app](https://railway.app)
2. Подключите репозиторий
3. Выберите папку `backend` как корневую
4. В настройках проекта → Variables добавьте:
   - `SUPABASE_URL` = ваш Supabase URL
   - `SUPABASE_SERVICE_ROLE_KEY` = ваш service role key
   - `FRONTEND_URL` = URL вашего Vercel фронтенда
   - `PORT` = Railway установит автоматически

5. Railway автоматически задеплоит проект

## Шаг 5: Обновление URL после деплоя

После деплоя Railway:
1. Скопируйте публичный URL бэкенда
2. Обновите `NEXT_PUBLIC_API_URL` в Vercel
3. Обновите `FRONTEND_URL` в Railway (URL вашего Vercel проекта)

## Проверка работы

1. Откройте фронтенд на Vercel
2. Проверьте статус подключения на главной странице
3. Откройте `/realtime-example` для тестирования real-time
4. Проверьте бэкенд: `https://your-railway-url.railway.app/health`
