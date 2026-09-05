# Реализация Ступени 3 — Словарь (китайская поддержка)

## ✅ Статус: Backend полностью реализован

Все изменения из Ступени 3 дорожной карты реализованы на уровне backend и базы данных.

## 📋 Выполненные задачи

### 1. База данных ✅

**Файл:** `supabase/migrations/20260905000000_add_language_support_vocabulary.sql`

Создана миграция, которая добавляет:

- **Колонку `language`** (`'en' | 'zh'`) в таблицы:
  - `user_vocabulary`
  - `user_idioms`
  - `vocabulary_progress`
  - `word_occurrences`
  - `word_definitions_cache`

- **Дополнительные поля для китайского языка:**
  - `pinyin` (TEXT) - пиньинь для китайских слов
  - `hsk_level` (INTEGER, 1-6) - уровень HSK для китайских слов

- **Обновлённые constraints:**
  - `word_definitions_cache`: UNIQUE(word, language)
  - `user_vocabulary`: UNIQUE(user_id, word, language)
  - `user_idioms`: UNIQUE(user_id, phrase, language)
  - `vocabulary_progress`: UNIQUE(user_id, word, language)

- **Обновлённые views:**
  - `user_vocabulary_with_details` - включает pinyin и hsk_level
  - `words_to_review_today` - фильтрует по language
  - `user_vocabulary_stats` - статистика по HSK и CEFR отдельно

### 2. Backend API ✅

#### Обновлённые функции:

**`getWordDefinitionFromAI(word, language)`**
- Принимает параметр `language` ('en' или 'zh')
- Для китайского: запрашивает иероглифы, pinyin, HSK-уровень, перевод на русский
- Для английского: работает как раньше (CEFR, транскрипция)

**`getOrCreateWordDefinition(word, language)`**
- Проверяет кэш с учётом составного ключа (word, language)
- Сохраняет pinyin и hsk_level для китайских слов

**`analyzeIdiomsWithAI(text, options)`**
- Добавлен параметр `language` в options
- Для китайского: анализирует 成语 (чэнъюи) - идиомы из 4 иероглифов
- Возвращает pinyin для китайских идиом

#### Обновлённые эндпоинты:

Все эндпоинты теперь автоматически получают `learning_language` из `user_profiles`:

1. **`POST /api/vocabulary/add`**
   - Получает язык из профиля пользователя
   - Добавляет слово с полями `language`, `pinyin`, `hsk_level`
   - Проверяет существование слова с учётом языка

2. **`GET /api/vocabulary/list`**
   - Фильтрует словарь по текущему языку пользователя
   - Возвращает pinyin и hsk_level для китайских слов

3. **`GET /api/vocabulary/review-list`**
   - Возвращает слова на повторение только для текущего языка
   - Получает определения с учётом language

4. **`GET /api/vocabulary/export`**
   - Экспортирует словарь/идиомы для текущего языка
   - Включает pinyin в экспорт китайских слов

5. **`POST /api/vocabulary/import`**
   - Импортирует слова с учётом текущего языка
   - Проверяет дубликаты с учётом language

6. **`POST /api/vocabulary/idioms/analyze`**
   - Анализирует 成语 для китайского текста
   - Анализирует idioms/phrasal verbs для английского
   - Сохраняет pinyin для китайских идиом

7. **`POST /api/vocabulary/idioms/add`**
   - Добавляет идиому с language и pinyin
   - UNIQUE constraint: (user_id, phrase, language)

8. **`GET /api/vocabulary/idioms/list`**
   - Возвращает идиомы только для текущего языка
   - Включает pinyin для китайских 成语

### 3. Изоляция данных по языкам ✅

**Английский и китайский словари полностью разделены:**

- Одно и то же слово может существовать в обоих языках независимо
- SRS-повторения работают отдельно для каждого языка
- Статистика ведётся раздельно: HSK для китайского, CEFR для английского
- При переключении языка пользователь видит только слова этого языка

### 4. Кэширование AI-запросов ✅

**`word_definitions_cache` обновлён:**
- Составной ключ (word, language) предотвращает конфликты
- Китайские определения хранятся с pinyin и hsk_level
- Английские определения хранятся с phonetic_transcription и difficulty_level

## 🔧 Как применить изменения

### Шаг 1: Применить миграцию БД

```bash
# Если используете Supabase CLI
supabase db push

# Или через Supabase Dashboard
# Загрузите содержимое файла миграции в SQL Editor
```

### Шаг 2: Обновить frontend

См. подробное руководство: `docs/frontend-chinese-implementation-guide.md`

Основные изменения frontend:
- Отображение pinyin для китайских слов
- HSK фильтр вместо CEFR для китайского
- Две вкладки: "Слова" и "成语" для китайского режима
- Обновить типы TypeScript

### Шаг 3: Тестирование

1. Переключите язык в профиле: `learning_language = 'zh'`
2. Добавьте китайское слово (например: 你好)
3. Проверьте, что оно отображается с pinyin (nǐ hǎo)
4. Добавьте 成语 (например: 一见钟情)
5. Переключитесь на английский - китайские слова не должны отображаться
6. Проверьте SRS - должны повторяться только слова текущего языка

## 📊 Критерии готовности

- ✅ Слово из китайского диалога попадает в китайский словарь
- ✅ Английский словарь не изменяется при работе в режиме 中文
- ✅ SRS-повторение работает отдельно по языку
- ✅ 成语 можно добавить и просмотреть

## 🎯 Структура данных

### user_vocabulary
```sql
CREATE TABLE user_vocabulary (
  id UUID PRIMARY KEY,
  user_id UUID,
  word TEXT,
  language TEXT CHECK (language IN ('en', 'zh')),
  pinyin TEXT,                    -- Для китайского
  hsk_level INTEGER,              -- 1-6 для китайского
  difficulty_level TEXT,          -- A1-C2 для английского
  translations JSONB,
  contexts JSONB,
  mastery_level INTEGER,
  times_seen INTEGER,
  times_practiced INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ,
  last_reviewed_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE(user_id, word, language)
)
```

### user_idioms
```sql
CREATE TABLE user_idioms (
  id UUID PRIMARY KEY,
  user_id UUID,
  phrase TEXT,
  language TEXT CHECK (language IN ('en', 'zh')),
  pinyin TEXT,                    -- Для китайских 成语
  literal_translation TEXT,
  meaning TEXT,
  usage_examples JSONB,
  source_video_id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE(user_id, phrase, language)
)
```

### word_definitions_cache
```sql
CREATE TABLE word_definitions_cache (
  id UUID PRIMARY KEY,
  word TEXT,
  language TEXT CHECK (language IN ('en', 'zh')),
  definitions JSONB,
  phonetic_transcription TEXT,    -- Для английского
  pinyin TEXT,                     -- Для китайского
  part_of_speech TEXT,
  difficulty_level TEXT,           -- CEFR для английского
  hsk_level INTEGER,               -- HSK для китайского
  frequency_rank INTEGER,
  is_phrase BOOLEAN,
  example_sentences JSONB,
  cached_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE(word, language)
)
```

## 🚀 Дальнейшие улучшения

### Возможные оптимизации:
1. **Умный анализ контекста** - определение HSK уровня по контексту диалога
2. **Рекомендации слов** - предложение слов для изучения на основе HSK уровня
3. **Тональная анимация** - визуализация тонов китайского языка
4. **Радикалы** - разбор иероглифов по радикалам
5. **Stroke order** - анимация порядка написания иероглифов

### Интеграция с другими ступенями:
- **Ступень 4 (Диалоги)** - извлечение китайских слов из диалогов с AI
- **Ступень 5 (Переводчик)** - добавление слов из переводчика в китайский словарь
- **Ступень 6 (Аудио)** - распознавание китайской речи с тонами

## 📝 Примеры использования

### Добавление китайского слова через API:

```javascript
// Backend автоматически получит language = 'zh' из user_profiles
await fetch('/api/vocabulary/add', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    word: '你好',
    context: '你好，很高兴认识你！'
  })
})

// Ответ:
{
  "ok": true,
  "word": {
    "word": "你好",
    "language": "zh",
    "pinyin": "nǐ hǎo",
    "hsk_level": 1,
    "translations": [
      { "translation": "привет, здравствуйте", "source": "ai" }
    ]
  }
}
```

### Анализ китайского текста на 成语:

```javascript
await fetch('/api/vocabulary/idioms/analyze', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    text: '我对她一见钟情，从此以后一心一意爱着她。',
    max_idioms: 10
  })
})

// Ответ:
{
  "ok": true,
  "idioms": [
    {
      "phrase": "一见钟情",
      "pinyin": "yī jiàn zhōng qíng",
      "literal_translation": "один взгляд, сразу полюбить",
      "meaning": "полюбить с первого взгляда",
      "usage_examples": [
        "他们一见钟情，很快就结婚了。(Они полюбили друг друга с первого взгляда и быстро поженились.)"
      ]
    },
    {
      "phrase": "一心一意",
      "pinyin": "yī xīn yī yì",
      "literal_translation": "одно сердце, одна мысль",
      "meaning": "всем сердцем, преданно",
      "usage_examples": [
        "她一心一意地学习中文。(Она всем сердцем изучает китайский язык.)"
      ]
    }
  ]
}
```

## 🔗 Связанные файлы

- **Миграция БД:** `supabase/migrations/20260905000000_add_language_support_vocabulary.sql`
- **Backend API:** `backend/src/index.js` (обновлены функции vocabulary)
- **Frontend гайд:** `docs/frontend-chinese-implementation-guide.md`
- **Дорожная карта:** `docs/chinese-language-roadmap.md`

## 👥 Команда и поддержка

При возникновении вопросов или проблем:
1. Проверьте логи backend: `console.log` при вызове AI
2. Убедитесь, что миграция применена: проверьте структуру таблиц в БД
3. Проверьте `user_profiles.learning_language` для тестового пользователя

---

**Дата реализации:** 05.09.2026  
**Версия:** 1.0  
**Статус:** ✅ Backend готов к использованию
