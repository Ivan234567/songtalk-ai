# SongTalk AI

Платформа для изучения английского языка через интерактивные песни с real-time обновлениями.

## 🏗️ Архитектура

- **Frontend**: Next.js 14 (деплой на Vercel)
- **Backend**: Node.js + Express (деплой на Railway)
- **Database & Real-time**: Supabase (PostgreSQL + Realtime)

## 🚀 Быстрый старт

### Предварительные требования

- Node.js 18+
- npm или yarn
- Аккаунт Supabase
- Аккаунт Vercel (для фронтенда)
- Аккаунт Railway (для бэкенда)

### Локальная разработка

1. **Клонируйте репозиторий**
```bash
git clone <your-repo-url>
cd songtalk-ai
```

2. **Установите зависимости**
```bash
npm install
cd frontend && npm install
cd ../backend && npm install
```

3. **Настройте переменные окружения**

Создайте env-файлы на основе примеров (шаблоны лежат в репозитории):

- `frontend/env.local.example` → скопируйте в `frontend/.env.local`
- `backend/env.example` → скопируйте в `backend/.env`

**frontend/.env.local:**
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_API_URL=http://localhost:3001
```

**backend/.env:**
```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
FRONTEND_URL=http://localhost:3000
PORT=3001

# AITUNNEL (OpenAI-compatible)
# Документация: https://docs.aitunnel.ru/api/reference.html
AITUNNEL_API_KEY=sk-aitunnel-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AITUNNEL_BASE_URL=https://api.aitunnel.ru/v1/
AITUNNEL_MODEL=DeepSeek-V3.2-Speciale
```

4. **Запустите проект**
```bash
# Из корневой директории
npm run dev

# Или отдельно:
npm run dev:frontend  # http://localhost:3000
npm run dev:backend   # http://localhost:3001
```

## 📦 Деплой

### Vercel (Frontend)

1. Подключите репозиторий к Vercel
2. Установите переменные окружения в настройках проекта:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_API_URL` (URL вашего Railway бэкенда)
3. Vercel автоматически определит Next.js и задеплоит проект

### Railway (Backend)

1. Создайте новый проект на Railway
2. Подключите репозиторий
3. Railway автоматически определит Node.js проект
4. Установите переменные окружения:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `FRONTEND_URL` (URL вашего Vercel фронтенда)
   - `PORT` (Railway установит автоматически)
5. Railway задеплоит бэкенд и предоставит публичный URL

### Supabase

1. Создайте проект на [supabase.com](https://supabase.com)
2. Получите URL проекта и API ключи:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL`
   - Anon Key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Service Role Key → `SUPABASE_SERVICE_ROLE_KEY`
3. Включите Realtime для нужных таблиц:
   - Перейдите в Database → Replication
   - Включите replication для таблиц, которые нужны в real-time

## 🔄 Real-time функциональность

### Настройка Real-time в Supabase

1. Включите Realtime для таблиц:
   - Database → Replication
   - Включите для нужных таблиц

2. Используйте в коде:

```typescript
import { useRealtimeTable } from '@/hooks/useRealtime'

function MyComponent() {
  const { lastUpdate, isConnected } = useRealtimeTable('your_table', '*', true)
  
  // lastUpdate содержит изменения
  // isConnected показывает статус подключения
}
```

### Примеры использования

- `frontend/app/realtime-example/page.tsx` - пример страницы с real-time подпиской
- `frontend/hooks/useRealtime.ts` - готовые хуки для real-time
- `frontend/lib/supabase-realtime.ts` - утилиты для работы с real-time

## 📁 Структура проекта

```
songtalk-ai/
├── frontend/          # Next.js приложение
│   ├── app/          # App Router страницы
│   ├── lib/          # Supabase клиент и утилиты
│   ├── hooks/        # React хуки
│   └── package.json
├── backend/          # Express API
│   ├── src/          # Исходный код
│   └── package.json
├── vercel.json       # Конфигурация Vercel
├── railway.json      # Конфигурация Railway
└── package.json      # Root package.json
```

## 🔧 API Endpoints

### Backend (Railway)

- `GET /health` - проверка здоровья сервера
- `GET /api/test` - тест подключения к Supabase
- `GET /api/realtime` - информация о real-time

## 🛠️ Разработка

### Добавление новых таблиц с real-time

1. Создайте таблицу в Supabase
2. Включите Realtime replication для таблицы
3. Используйте `useRealtimeTable` или `useRealtimeRecord` в компонентах

### Тестирование real-time

1. Откройте страницу `/realtime-example`
2. Включите подписку
3. Вставьте данные через Supabase Dashboard или API
4. Наблюдайте обновления в реальном времени

## 📝 Переменные окружения

### Frontend (Vercel)
- `NEXT_PUBLIC_SUPABASE_URL` - URL проекта Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Anon ключ Supabase
- `NEXT_PUBLIC_API_URL` - URL бэкенда на Railway

### Backend (Railway)
- `SUPABASE_URL` - URL проекта Supabase
- `SUPABASE_SERVICE_ROLE_KEY` - Service Role ключ Supabase
- `FRONTEND_URL` - URL фронтенда на Vercel (для CORS)
- `PORT` - Порт сервера (устанавливается Railway автоматически)
- `AITUNNEL_API_KEY` - ключ AITUNNEL (ТОЛЬКО на backend, не на фронт)
- `AITUNNEL_BASE_URL` - по умолчанию `https://api.aitunnel.ru/v1/`
- `AITUNNEL_MODEL` - название модели из панели AITUNNEL (важен регистр)

## 🐛 Troubleshooting

### Real-time не работает
- Проверьте, что Realtime включен для таблицы в Supabase
- Убедитесь, что используете правильные ключи API
- Проверьте консоль браузера на ошибки WebSocket

### CORS ошибки
- Убедитесь, что `FRONTEND_URL` в бэкенде соответствует URL фронтенда
- Проверьте настройки CORS в `backend/src/index.js`

### Проблемы с подключением к Supabase
- Проверьте правильность URL и ключей
- Убедитесь, что проект Supabase активен
- Проверьте настройки безопасности в Supabase Dashboard

## 📚 Дополнительные ресурсы

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [Railway Documentation](https://docs.railway.app)

## 📄 Лицензия

MIT
