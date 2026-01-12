-- Схема базы данных для Tana-аналог (Knowledge Graph Platform)
-- Выполните этот SQL в Supabase SQL Editor

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ============================================
-- ОСНОВНЫЕ ТАБЛИЦЫ
-- ============================================

-- Таблица узлов (заметок)
CREATE TABLE IF NOT EXISTS nodes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  parent_id UUID REFERENCES nodes(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Таблица связей между узлами
CREATE TABLE IF NOT EXISTS node_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  link_type TEXT DEFAULT 'related',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(source_node_id, target_node_id)
);

-- Таблица тегов
CREATE TABLE IF NOT EXISTS tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Таблица связи узлов с тегами
CREATE TABLE IF NOT EXISTS node_tags (
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (node_id, tag_id)
);

-- ============================================
-- ИНДЕКСЫ
-- ============================================

-- Индексы для nodes
CREATE INDEX IF NOT EXISTS idx_nodes_user_id ON nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_nodes_parent_id ON nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_nodes_created_at ON nodes(created_at);
CREATE INDEX IF NOT EXISTS idx_nodes_title ON nodes USING gin(to_tsvector('russian', title));

-- Индексы для node_links
CREATE INDEX IF NOT EXISTS idx_node_links_source ON node_links(source_node_id);
CREATE INDEX IF NOT EXISTS idx_node_links_target ON node_links(target_node_id);

-- Индексы для tags
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);

-- Индексы для node_tags
CREATE INDEX IF NOT EXISTS idx_node_tags_node_id ON node_tags(node_id);
CREATE INDEX IF NOT EXISTS idx_node_tags_tag_id ON node_tags(tag_id);

-- ============================================
-- ТРИГГЕРЫ
-- ============================================

-- Триггер для автоматического обновления updated_at в nodes
CREATE TRIGGER update_nodes_updated_at 
    BEFORE UPDATE ON nodes 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Включаем RLS для всех таблиц
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE node_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE node_tags ENABLE ROW LEVEL SECURITY;

-- Политики для nodes
CREATE POLICY "Users can view their own nodes"
  ON nodes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own nodes"
  ON nodes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own nodes"
  ON nodes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own nodes"
  ON nodes FOR DELETE
  USING (auth.uid() = user_id);

-- Политики для node_links
CREATE POLICY "Users can view links of their nodes"
  ON node_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM nodes 
      WHERE nodes.id = node_links.source_node_id 
      AND nodes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create links for their nodes"
  ON node_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nodes 
      WHERE nodes.id = node_links.source_node_id 
      AND nodes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete links of their nodes"
  ON node_links FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM nodes 
      WHERE nodes.id = node_links.source_node_id 
      AND nodes.user_id = auth.uid()
    )
  );

-- Политики для tags
CREATE POLICY "Users can view their own tags"
  ON tags FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tags"
  ON tags FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tags"
  ON tags FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tags"
  ON tags FOR DELETE
  USING (auth.uid() = user_id);

-- Политики для node_tags
CREATE POLICY "Users can view node_tags of their nodes"
  ON node_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM nodes 
      WHERE nodes.id = node_tags.node_id 
      AND nodes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create node_tags for their nodes"
  ON node_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nodes 
      WHERE nodes.id = node_tags.node_id 
      AND nodes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete node_tags of their nodes"
  ON node_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM nodes 
      WHERE nodes.id = node_tags.node_id 
      AND nodes.user_id = auth.uid()
    )
  );

-- ============================================
-- REALTIME
-- ============================================

-- Включаем Realtime для основных таблиц
ALTER PUBLICATION supabase_realtime ADD TABLE nodes;
ALTER PUBLICATION supabase_realtime ADD TABLE node_links;
ALTER PUBLICATION supabase_realtime ADD TABLE tags;
ALTER PUBLICATION supabase_realtime ADD TABLE node_tags;
