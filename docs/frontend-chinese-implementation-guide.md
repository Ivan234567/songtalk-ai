# Руководство по реализации китайской поддержки во frontend

## Статус: Backend готов ✅, Frontend требует обновления

Backend полностью обновлен для поддержки китайского языка. Все эндпоинты словаря теперь работают с `language` параметром и автоматически получают язык из `user_profiles.learning_language`.

## Что нужно сделать во frontend

### 1. Обновить компоненты словаря для отображения китайских данных

#### Основные изменения:
- Добавить отображение `pinyin` для китайских слов
- Добавить поддержку `hsk_level` вместо `difficulty_level` для китайского
- Обновить фильтры: HSK 1-6 для китайского, CEFR A1-C2 для английского

#### Компоненты для обновления:
1. **VocabularyList.tsx** (или аналог)
   - Добавить колонку для `pinyin`
   - Условно отображать HSK или CEFR в зависимости от `learningLanguage`
   
2. **WordDetailsPanel.tsx** (или аналог)
   ```typescript
   interface WordDetails {
     word: string
     language: 'en' | 'zh'
     pinyin?: string
     hsk_level?: number
     difficulty_level?: string
     // ... остальные поля
   }
   ```

3. **VocabularyFilters.tsx**
   ```typescript
   // Условно отображать фильтр в зависимости от языка
   {learningLanguage === 'zh' ? (
     <HSKLevelFilter levels={[1, 2, 3, 4, 5, 6]} />
   ) : (
     <CEFRLevelFilter levels={['A1', 'A2', 'B1', 'B2', 'C1', 'C2']} />
   )}
   ```

### 2. Добавить вкладки для китайских идиом (成语)

В компоненте словаря добавить условное отображение:

```typescript
const VocabularyTabs = () => {
  const { learningLanguage } = useUserProfile()
  
  return (
    <Tabs>
      <Tab label="Слова" />
      {learningLanguage === 'zh' ? (
        <Tab label="成语" /> // Китайские идиомы
      ) : (
        <>
          <Tab label="Idioms" />
          <Tab label="Phrasal Verbs" />
        </>
      )}
    </Tabs>
  )
}
```

### 3. Обновить форму добавления слова

```typescript
const AddWordForm = () => {
  const { learningLanguage } = useUserProfile()
  
  return (
    <form>
      <Input name="word" label={learningLanguage === 'zh' ? '汉字' : 'Word'} />
      
      {learningLanguage === 'zh' && (
        <Input name="pinyin" label="拼音 (Pinyin)" />
      )}
      
      {learningLanguage === 'zh' ? (
        <Select name="hsk_level" label="HSK уровень">
          {[1, 2, 3, 4, 5, 6].map(level => (
            <option key={level} value={level}>HSK {level}</option>
          ))}
        </Select>
      ) : (
        <Select name="difficulty_level" label="CEFR уровень">
          {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(level => (
            <option key={level} value={level}>{level}</option>
          ))}
        </Select>
      )}
    </form>
  )
}
```

### 4. Обновить компонент для идиом

```typescript
const IdiomCard = ({ idiom }: { idiom: UserIdiom }) => {
  const { learningLanguage } = useUserProfile()
  
  return (
    <Card>
      <h3>{idiom.phrase}</h3>
      
      {learningLanguage === 'zh' && idiom.pinyin && (
        <p className="text-gray-500">{idiom.pinyin}</p>
      )}
      
      <p className="text-sm">{idiom.literal_translation}</p>
      <p className="text-base">{idiom.meaning}</p>
      
      {idiom.usage_examples?.map((example, i) => (
        <p key={i} className="text-sm italic">{example}</p>
      ))}
    </Card>
  )
}
```

### 5. Обновить API вызовы

API уже обновлен и автоматически использует `learning_language` из профиля пользователя. Дополнительных изменений в запросах не требуется, но нужно обновить типы:

```typescript
interface UserVocabulary {
  id: string
  user_id: string
  word: string
  language: 'en' | 'zh'
  pinyin?: string
  hsk_level?: number
  difficulty_level?: string
  translations: Translation[]
  contexts: Context[]
  mastery_level: number
  times_seen: number
  times_practiced: number
  notes?: string
  created_at: string
  last_reviewed_at?: string
  next_review_at?: string
  updated_at: string
}

interface UserIdiom {
  id: string
  user_id: string
  phrase: string
  language: 'en' | 'zh'
  pinyin?: string
  literal_translation?: string
  meaning?: string
  usage_examples: string[]
  source_video_id?: string
  created_at: string
  updated_at: string
}
```

### 6. Обновить компонент статистики

```typescript
const VocabularyStats = ({ stats }: { stats: any }) => {
  const { learningLanguage } = useUserProfile()
  
  return (
    <div>
      <h2>Статистика</h2>
      <p>Всего слов: {stats.total_words}</p>
      
      {learningLanguage === 'zh' ? (
        <>
          <h3>По уровням HSK:</h3>
          {[1, 2, 3, 4, 5, 6].map(level => (
            <p key={level}>
              HSK {level}: {stats[`hsk${level}_words`] || 0}
            </p>
          ))}
        </>
      ) : (
        <>
          <h3>По уровням CEFR:</h3>
          {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(level => (
            <p key={level}>
              {level}: {stats[`${level.toLowerCase()}_words`] || 0}
            </p>
          ))}
        </>
      )}
    </div>
  )
}
```

## Критерии готовности (из дорожной карты)

- [ ] Слово из китайского диалога попадает в китайский словарь
- [ ] Английский словарь не изменяется при работе в режиме 中文
- [ ] SRS-повторение работает отдельно по языку
- [ ] 成语 можно добавить и просмотреть

## Дополнительные рекомендации

1. **Переиспользование компонентов**: Создайте общие компоненты, которые адаптируются под язык:
   - `<LanguageAwareLevelFilter />`
   - `<LanguageAwareWordInput />`
   - `<LanguageAwareIdiomCard />`

2. **Локализация**: Добавьте переводы для UI элементов на китайский язык

3. **Тестирование**: 
   - Переключите язык в настройках профиля
   - Добавьте китайское слово и проверьте, что оно отображается с pinyin
   - Добавьте китайскую идиому (成语)
   - Проверьте, что английские слова не отображаются в китайском режиме

## Файлы для обновления

Примерный список файлов (путь может отличаться):
- `frontend/src/components/vocabulary/VocabularyList.tsx`
- `frontend/src/components/vocabulary/WordDetailsPanel.tsx`
- `frontend/src/components/vocabulary/VocabularyFilters.tsx`
- `frontend/src/components/vocabulary/AddWordModal.tsx`
- `frontend/src/components/vocabulary/IdiomCard.tsx`
- `frontend/src/types/vocabulary.ts`
- `frontend/src/hooks/useVocabulary.ts`

## Backend изменения (уже готово) ✅

### Миграция БД
✅ Создана миграция `20260905000000_add_language_support_vocabulary.sql`
- Добавлена колонка `language` во все таблицы словаря
- Обновлены unique constraints для учёта языка
- Добавлены поля `pinyin` и `hsk_level` для китайского

### Обновлённые эндпоинты
✅ Все эндпоинты автоматически используют язык из профиля:
- `POST /api/vocabulary/add` - добавление слова
- `GET /api/vocabulary/list` - список слов
- `GET /api/vocabulary/review-list` - слова на повторение
- `GET /api/vocabulary/export` - экспорт
- `POST /api/vocabulary/import` - импорт
- `POST /api/vocabulary/idioms/analyze` - анализ идиом/成语
- `POST /api/vocabulary/idioms/add` - добавление идиомы
- `GET /api/vocabulary/idioms/list` - список идиом

### AI промпты
✅ Обновлены для поддержки китайского:
- `getWordDefinitionFromAI()` - определения слов с pinyin и HSK
- `analyzeIdiomsWithAI()` - анализ 成语 с pinyin

## Следующие шаги

1. Запустите миграцию БД: `npm run migrate` (или команда для Supabase)
2. Обновите frontend компоненты согласно инструкциям выше
3. Протестируйте в режиме китайского языка
4. Проверьте, что английский режим работает как прежде
