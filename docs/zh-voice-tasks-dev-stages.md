# Китайские голосовые задания — этапы разработки

Фича рядом со сценариями 中文: одно высказывание на 15–60 сек, не диалог.  
ИИ собирает карточку и потом проверяет транскрипт по чеклисту. Персонаж не отвечает.

Связанные документы: [chinese-language-roadmap.md](chinese-language-roadmap.md), [LEARNING_SYSTEM_BLUEPRINT_V1.md](LEARNING_SYSTEM_BLUEPRINT_V1.md).  
Образец кода: `zh_scenarios` / `ZhScenariosUI` / `registerZhScenarioRoutes`.

Копировать маршруты и в `backend/src/` и в `frontend/server/` (сейчас дубли).

---

## Зафиксированные решения (не пересматривать на этапе)

1. Вкладка Собеседника при `zh`: Диалог | Сценарии | **Задания**. English в v1 не трогаем.
2. Не писать в `roleplay_completions`. Свои таблицы.
3. Не встраивать в чат-цикл сценария (`messages`, steps, character opening).
4. Не оценивать тоны и не звать `assess-speaking` как основной фидбек.
5. Эталон — только после попытки. До записи — чеклист и опорные слова.
6. Типы v1: `voicemail` | `explain` | `retell`. Тип `picture` (看图说话) — отдельный этап в конце.
7. Создание с ИИ — как сценарии: интент → generate → конструктор → сохранить / сохранить и пройти.
8. Один дубль + одна перезапись. Текстовый ввод — только fallback без микрофона.
9. Таймер — ориентир, не fail. Минимум ~6 сек, мягкий стоп ~90 сек.

---

## Контракт карточки (черновик JSON)

Поля UI на русском, китайские поля — упрощённый китайский, пиньинь с тонами.

```json
{
  "title": "Голосовое таксисту",
  "description": "Одно предложение, о чём задание",
  "type": "voicemail",
  "hsk_level": 2,
  "time_target_sec": 25,
  "situation_ru": "Ты садишься в такси.",
  "instruction_ru": "Скажи, куда ехать и что не торопиться.",
  "checklist": [
    { "id": "where", "label_ru": "Куда ехать" },
    { "id": "when", "label_ru": "Когда / не спешить" }
  ],
  "vocabulary": [
    { "hanzi": "机场", "pinyin": "jīchǎng", "translation_ru": "аэропорт", "hsk_level": 2 }
  ],
  "stimulus_zh": null,
  "stimulus_pinyin": null,
  "stimulus_ru": null,
  "scene_ru": null,
  "model_answer_zh": "师傅，去机场，不着急。",
  "model_answer_pinyin": "shīfu, qù jīchǎng, bù zhāojí.",
  "model_answer_ru": "Мастер, на аэропорт, не торопитесь."
}
```

- `voicemail` / `explain`: стимул и сцена пустые.
- `retell`: заполнены `stimulus_*`.
- `picture` (позже): заполнен `scene_ru`.
- `vocabulary`: 4–8 слов, не выше HSK карточки. Это опоры, не жёсткий must_say.
- Чеклист: 2–4 пункта — единственная шкала «сделано / почти / мало».

Попытка (attempt): `task_id`, транскрипт, длительность, покрытие чеклиста, фидбек, эталон на момент попытки, статус.

---

## Порядок

```
0. Типы и клиент API (без UI)
1. Миграция БД
2. CRUD API
3. Generate + generate-part
4. Системный каталог (seed)
5. UI: каталог / мои / создать / конструктор / брифинг
6. Вкладка в AgentTab + запись одного дубля
7. API проверки + экран результата
8. Словарь с попытки
9. Прогресс / streak / главная
10. Recovery «дай одну» (optional)
11. Тип picture
```

Каждый этап — один узкий PR. Не смешивать чат сценария и запись задачки.

---

### Этап 0 — Контракт в коде

**Зачем:** чтобы UI и API не разъехались.

**Делать:**

- `frontend/lib/zh-voice-tasks.ts` — типы, `fetchApi` по образцу `zh-scenarios.ts` (пока можно заглушки URL).
- Хелперы: `emptyManualZhVoiceTask()`, `canSaveZhVoiceTask()`, `draftFromGenerateResult()`, `toZhVoiceTaskWritePayload()`.
- `canSave`: title + type + instruction_ru + ≥2 пункта чеклиста + hsk.

**Не делать:** UI, миграцию, промпты.

**Готово:** типы компилятся, сохранение без title/checklist отвергается.

---

### Этап 1 — Миграция

**Файлы:** `supabase/migrations/YYYYMMDD_create_zh_voice_tasks.sql`

**Таблицы:**

`zh_voice_tasks` — как `zh_scenarios`, без starter/formality/slang:

- `id`, `user_id`, `source` (`user` | `system`), `title`, `description`, `type`, `hsk_level`, `archived`, `status` (`draft` | `ready`), `payload` JSONB, timestamps.
- CHECK: user ⇒ user_id NOT NULL; system ⇒ user_id NULL.
- RLS: свои + system читать; писать только свои `source=user`.

`zh_voice_task_attempts`:

- `id`, `user_id`, `task_id`, `hsk_level`, `transcript`, `duration_sec`, `checklist_result` JSONB, `feedback` TEXT, `model_answer_zh`, `status` (`recorded` | `checked` | `abandoned`), timestamps.
- RLS: только свои.

Индексы: `(user_id, archived, updated_at)`, `(source)`, `(hsk_level, type)`, attempts `(user_id, created_at DESC)`.

**Не делать:** seed, API.

**Готово:** миграция применяется, RLS не пускает чужие строки.

---

### Этап 2 — CRUD

**Файлы:**

- `backend/src/zh-voice-tasks.js` + копия `frontend/server/zh-voice-tasks.js`
- регистрация в обоих `index.js`
- дописать клиент этапа 0

**Эндпоинты** (зеркало `/api/zh-scenarios`):

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/api/zh-voice-tasks` | список: archived, hsk, type, source, sort, q |
| GET | `/api/zh-voice-tasks/:id` | одна карточка |
| POST | `/api/zh-voice-tasks` | создать user |
| PATCH | `/api/zh-voice-tasks/:id` | обновить свою |
| DELETE | `/api/zh-voice-tasks/:id` | удалить свою |
| POST | `/api/zh-voice-tasks/:id/duplicate` | копия в «Мои» |
| POST | `/api/zh-voice-tasks/:id/archive` | если нет отдельного PATCH archived |

JWT как у сценариев. System нельзя PATCH/DELETE с клиента.

**Не делать:** generate, evaluate, UI.

**Готово:** создать/прочитать/править/дублировать свою карточку curl-ом или из клиента.

---

### Этап 3 — Генерация ИИ

**Эндпоинты:**

- `POST /api/zh-voice-tasks/generate`
- `POST /api/zh-voice-tasks/generate-part` — `vocabulary` | `checklist` | `model_answer` | `stimulus`

**Интент на входе:** `prompt`, `type` (`auto` | три типа v1), `hsk_level`, опционально textbook/lesson/goal.

**Промпт (обязательные правила):**

- Output JSON карточки, не сценария.
- Нет ролей, шагов, character_opening, кто начинает.
- Если пользователь описал диалог — сжать в одно голосовое/объяснение.
- Чеклист 2–4. Слова 4–8, HSK ≤ заданного. Пиньинь с тонами.
- Эталон на том же HSK, 1–4 коротких предложения.
- `retell` ⇒ стимул 2–4 фразы. Иначе stimulus = null.
- `picture` в этом этапе не генерировать (если type auto — не выбирать picture).

Списание баланса — как `zh-scenarios/generate`.

**Не делать:** конструктор UI (достаточно проверить JSON).

**Готово:** «голосовое таксисту, HSK 2» → валидная карточка `voicemail` с чеклистом и эталоном, без полей роли.

---

### Этап 4 — Каталог

**Делать:** seed 12–18 системных карточек (`source=system`):

- по 4–6 на тип `voicemail` / `explain` / `retell`;
- HSK 1–3 в приоритете, 2–3 штуки HSK 4;
- без picture.

Формат: SQL seed или скрипт. Идемпотентно.

**Готово:** GET списка с `source=system` отдаёт каталог. Повторый seed не плодит дубли.

---

### Этап 5 — UI карточек (ещё без записи)

**Файлы** (зеркало roleplay, отдельная папка):

- `frontend/components/voice-tasks/ZhVoiceTasksUI.tsx` — оверлей: создать / мои / каталог
- `ZhVoiceTaskIntentForm.tsx` — интент
- `ZhVoiceTaskConstructor.tsx` — правка + превью брифинга + generate-part
- `ZhVoiceTaskBriefing.tsx` — ситуация, чеклист, слова, время; эталона нет

Полки как в `ZhScenariosUI`: фильтр HSK, поиск, архив, дублировать, редактировать.

Кнопки конструктора: Сохранить | Сохранить и пройти.  
«Пройти» пока только колбэк `onStartTask(task)` — родитель ещё может быть заглушкой.

**Не делать:** правки чата в `AgentTab`, STT, таймер записи.

**Готово:** создать с ИИ, поправить, сохранить в «Мои», открыть брифинг. В чат сценария не падаем.

---

### Этап 6 — Вкладка + один дубль

**Файлы:** `AgentTab.tsx` (узко), новый play-view внутри voice-tasks.

**Делать:**

- При `learningLanguage === 'zh'` третий режим: `chat | roleplay | voicetask` (debate не трогать).
- Открытие `ZhVoiceTasksUI`. После «пройти» — не `setAgentMode('roleplay')` и не `selectedScenario`.
- Экран игры: брифинг → кнопка записи → STT (`/api/agent/stt`, `language=zh`) → транскрипт + пиньинь-разметка существующим китайским парсером, если уже есть.
- Одна перезапись. Минимум 6 сек, мягкий стоп 90. Кольцо = `time_target_sec`.
- `retell`: до записи проиграть TTS стимула.
- Попытка в БД со статусом `recorded`.
- Нет streaming chat, нет reply-hint абзацем, нет шагов сбоку.
- Справа то же окно **«Настройки обучения»**, что в диалоге и сценарии: HSK, пиньинь, перевод, скорость. Чеклист и опоры — в этом же окне. Подсказки-абзаца нет.

**Готово:** записал «去机场», видишь иероглифы, ИИ-персонаж молчит. Справа открыты настройки обучения. English-вкладки без изменений.

---

### Этап 7 — Проверка и результат

**Эндпоинт:** `POST /api/zh-voice-tasks/evaluate`

Вход: `task_id` или полный payload карточки + `transcript` + `duration_sec`.  
Выход:

```json
{
  "verdict": "done | almost | missed",
  "checklist": [{ "id": "where", "status": "done | almost | missed", "note_ru": "..." }],
  "strength_ru": "одна фраза",
  "next_try_zh": "переформулировка",
  "next_try_pinyin": "",
  "next_try_ru": "",
  "model_answer_zh": "...",
  "model_answer_pinyin": "...",
  "model_answer_ru": "..."
}
```

Промпт: судить покрытие чеклиста по смыслу, не по Exact match иероглифов (Whisper врёт). Не ставить pronunciation/tone scores. Эталон не сложнее HSK карточки.

Экран результата: вердикт, чеклист, сила, next try, эталон + TTS. Кнопки: ещё одну | к списку. Сценарий — опциональная ссылка, если позже заведём тему.

Попытка → `checked`.

**Готово:** «师傅去机场» по карточке такси даёт done/almost по «куда», без балла 1–10 и без тонов. Эталон и TTS — после проверки.

---

### Этап 8 — Словарь

Кнопка «в словарь» с эталона / опорных слов. Тот же `/api/vocabulary/add` с `language: zh`. 1–2 слова за попытку, без автосвалки всего списка.

**Готово:** слово с попытки видно в китайском словаре, английский не тронут.

---

### Этап 9 — Прогресс и главная

Попытки `checked` участвуют в:

- streak (как любая практика);
- минуты / сессии на главной в режиме `zh`;
- последние сессии в прогрессе — отдельная метка «Задание», не «Сценарий».

Не подмешивать в фокус-страницу ролевого сценария.

**Готово:** прошёл задачку → на главной 中文 виден факт практики.

---

### Этап 10 — Recovery (можно отложить)

На главной / Today Focus: 3+ дня без core → CTA «Задание на минуту» (случайная system-карточка текущего HSK). После `checked` день закрыт. Не предлагать как обязательное в тот же день после полного сценария.

**Готово:** после паузы первый клик ведёт в задачку, не в конструктор сценария.

---

### Этап 11 — 看图说话

Тип `picture`: `scene_ru` + простые иконки/схема, без генерации картинок. Generate может возвращать `picture`. 8–12 системных сцен. Тот же evaluate по чеклисту элементов сцены.

---

## Что не делать ни на одном этапе

- Четвёртый `agentMode` для English.
- `roleplay_completions` / `selectedScenario` / шаги диалога.
- Оценка тонов, CREPE/YIN, Azure pronunciation.
- Показ эталона до первой записи.
- Reply-hint готовым абзацем до дубля (только чипы слов на HSK 1–2).
- Живой «врач отвечает».
- Конструктор с ролями «на всякий случай».

---

## Критерий живой фичи (после этапа 7)

Ученик за ≤6 минут: открыл Задания → (каталог или ИИ-создание) → записал дубль → увидел чеклист и эталон. Без выбора роли и без пяти шагов.

---

## Чеклист статуса

| Этап | Статус |
|------|--------|
| 0 Контракт | ✅ |
| 1 Миграция | ✅ |
| 2 CRUD | ✅ |
| 3 Generate | ✅ |
| 4 Каталог | ✅ |
| 5 UI карточек | ✅ |
| 6 Запись | ✅ |
| 7 Evaluate | ✅ |
| 8 Словарь | ⬜ |
| 9 Прогресс | ⬜ |
| 10 Recovery | ⬜ отложен |
| 11 Picture | ⬜ отложен |

Следующий шаг: **этап 8** — кнопка «в словарь» с эталона и опорных слов.
