-- Библиотека словарей: списки слов пользователя.
-- Слова остаются в user_vocabulary; список только группирует их.
-- SRS и речь не меняются: recognition/production по-прежнему на vocab_senses.

-- ============================================================================
-- vocab_list_collections — группы списков (сайдбар «Коллекции»)
-- ============================================================================

CREATE TABLE IF NOT EXISTS vocab_list_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language TEXT NOT NULL CHECK (language IN ('en', 'zh')),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, language, name),
  UNIQUE (id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_vocab_list_collections_user_language
  ON vocab_list_collections (user_id, language);

DROP TRIGGER IF EXISTS update_vocab_list_collections_updated_at ON vocab_list_collections;
CREATE TRIGGER update_vocab_list_collections_updated_at
  BEFORE UPDATE ON vocab_list_collections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- vocab_list_tags — теги списков
-- ============================================================================

CREATE TABLE IF NOT EXISTS vocab_list_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language TEXT NOT NULL CHECK (language IN ('en', 'zh')),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, language, name),
  UNIQUE (id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_vocab_list_tags_user_language
  ON vocab_list_tags (user_id, language);

-- ============================================================================
-- vocab_lists — карточка словаря в библиотеке
-- ============================================================================

CREATE TABLE IF NOT EXISTS vocab_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language TEXT NOT NULL CHECK (language IN ('en', 'zh')),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  description TEXT CHECK (description IS NULL OR char_length(btrim(description)) <= 300),
  source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('system', 'user', 'custom')),
  system_key TEXT CHECK (system_key IS NULL OR char_length(btrim(system_key)) BETWEEN 1 AND 64),
  collection_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (id, user_id),
  UNIQUE (user_id, language, system_key),
  FOREIGN KEY (collection_id, user_id)
    REFERENCES vocab_list_collections (id, user_id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_vocab_lists_user_language
  ON vocab_lists (user_id, language, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_vocab_lists_collection
  ON vocab_lists (user_id, collection_id);

DROP TRIGGER IF EXISTS update_vocab_lists_updated_at ON vocab_lists;
CREATE TRIGGER update_vocab_lists_updated_at
  BEFORE UPDATE ON vocab_lists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Нужен составной ключ на user_vocabulary для FK (id, user_id), если его ещё нет.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_vocabulary_id_user_id_key'
  ) THEN
    ALTER TABLE user_vocabulary
      ADD CONSTRAINT user_vocabulary_id_user_id_key UNIQUE (id, user_id);
  END IF;
END $$;

-- ============================================================================
-- vocab_list_items — слова внутри списка
-- ============================================================================

CREATE TABLE IF NOT EXISTS vocab_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vocabulary_id UUID NOT NULL,
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (list_id, vocabulary_id),
  FOREIGN KEY (list_id, user_id) REFERENCES vocab_lists (id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (vocabulary_id, user_id) REFERENCES user_vocabulary (id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vocab_list_items_list
  ON vocab_list_items (list_id, position, created_at);

CREATE INDEX IF NOT EXISTS idx_vocab_list_items_user
  ON vocab_list_items (user_id, vocabulary_id);

-- ============================================================================
-- vocab_list_tag_links — теги на списке
-- ============================================================================

CREATE TABLE IF NOT EXISTS vocab_list_tag_links (
  list_id UUID NOT NULL,
  tag_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (list_id, tag_id),
  FOREIGN KEY (list_id, user_id) REFERENCES vocab_lists (id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id, user_id) REFERENCES vocab_list_tags (id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vocab_list_tag_links_tag
  ON vocab_list_tag_links (tag_id);

-- ============================================================================
-- RLS: чтение своих строк; запись через service_role на backend
-- ============================================================================

ALTER TABLE vocab_list_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocab_list_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocab_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocab_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocab_list_tag_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own vocab list collections" ON vocab_list_collections;
CREATE POLICY "Users can view own vocab list collections"
  ON vocab_list_collections FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own vocab list tags" ON vocab_list_tags;
CREATE POLICY "Users can view own vocab list tags"
  ON vocab_list_tags FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own vocab lists" ON vocab_lists;
CREATE POLICY "Users can view own vocab lists"
  ON vocab_lists FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own vocab list items" ON vocab_list_items;
CREATE POLICY "Users can view own vocab list items"
  ON vocab_list_items FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own vocab list tag links" ON vocab_list_tag_links;
CREATE POLICY "Users can view own vocab list tag links"
  ON vocab_list_tag_links FOR SELECT
  USING (auth.uid() = user_id);

REVOKE ALL ON TABLE vocab_list_collections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE vocab_list_tags FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE vocab_lists FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE vocab_list_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE vocab_list_tag_links FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE vocab_list_collections TO authenticated;
GRANT SELECT ON TABLE vocab_list_tags TO authenticated;
GRANT SELECT ON TABLE vocab_lists TO authenticated;
GRANT SELECT ON TABLE vocab_list_items TO authenticated;
GRANT SELECT ON TABLE vocab_list_tag_links TO authenticated;

GRANT ALL ON TABLE vocab_list_collections TO service_role;
GRANT ALL ON TABLE vocab_list_tags TO service_role;
GRANT ALL ON TABLE vocab_lists TO service_role;
GRANT ALL ON TABLE vocab_list_items TO service_role;
GRANT ALL ON TABLE vocab_list_tag_links TO service_role;

COMMENT ON TABLE vocab_lists IS
  'Пользовательский словарь-список. system_key помечает стартовый набор. Тренировка слов идёт через Послушать/Сказать сам, не через отдельные режимы в словаре.';
