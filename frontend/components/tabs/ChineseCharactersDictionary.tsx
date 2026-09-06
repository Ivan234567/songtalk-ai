'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChineseRubyInline,
  InteractiveChineseWord,
} from '@/components/InteractiveChineseWord';
import { CHINESE_FONT, getToneColor, getToneFromPinyin, TONE_INFO } from '@/lib/chinese-display';
import { isHskLevelValue } from '@/lib/vocabulary';

export type ChineseCharacterRow = {
  id: string;
  character: string;
  pinyin?: string | null;
  translations?: { translation: string; source?: string }[] | null;
  radical?: string | null;
  stroke_count?: number | null;
  hsk_level?: number | null;
  notes?: string | null;
  mastery_level?: number | null;
  times_seen?: number | null;
  created_at?: string;
  contexts?: { video_id?: string; text?: string; timestamp?: string }[];
};

type ChineseCharactersDictionaryProps = {
  accessToken: string | null;
  apiUrl: string;
  search: string;
  hskFilter: string;
  onCountChange?: (count: number) => void;
};

function getApiUrl(apiUrl: string) {
  return apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
}

function translationText(row: ChineseCharacterRow | null): string | null {
  if (!row?.translations?.length) return null;
  return row.translations.map((t) => t.translation).join(', ');
}

// Группы похожих иероглифов (визуально)
const SIMILAR_CHARS: Record<string, string[]> = {
  '人': ['入', '八', '大', '天'],
  '入': ['人', '八'],
  '八': ['人', '入', '六'],
  '大': ['人', '天', '太', '犬'],
  '天': ['大', '夫', '太'],
  '太': ['大', '天', '犬'],
  '犬': ['大', '太'],
  '日': ['目', '白', '田', '曰'],
  '目': ['日', '自', '白'],
  '白': ['日', '目', '百', '自'],
  '田': ['日', '由', '甲', '申'],
  '由': ['田', '甲', '申', '曲'],
  '甲': ['田', '由', '申'],
  '申': ['田', '由', '甲', '电'],
  '电': ['申', '雷'],
  '口': ['日', '回', '囗'],
  '回': ['口', '囗', '因'],
  '土': ['士', '工', '王'],
  '士': ['土', '工'],
  '工': ['土', '士', '王'],
  '王': ['土', '工', '玉', '主'],
  '玉': ['王', '主'],
  '主': ['王', '玉', '注'],
  '干': ['千', '于', '午'],
  '千': ['干', '午'],
  '于': ['干', '子'],
  '午': ['干', '千', '牛'],
  '牛': ['午', '生', '年'],
  '生': ['牛', '年'],
  '年': ['牛', '生'],
  '木': ['本', '末', '未', '林'],
  '本': ['木', '末', '体'],
  '末': ['木', '本', '未'],
  '未': ['木', '末', '味'],
  '林': ['木', '森'],
  '森': ['林', '木'],
  '水': ['氷', '永', '泳'],
  '火': ['灭', '炎'],
  '炎': ['火', '談'],
  '山': ['出', '岳'],
  '出': ['山'],
  '手': ['毛', '手'],
  '毛': ['手', '尾'],
  '子': ['于', '孑', '孔'],
  '女': ['母', '妈', '好'],
  '母': ['女', '毋'],
  '心': ['必', '忄'],
  '月': ['用', '同', '肉'],
  '用': ['月', '同'],
  '同': ['用', '月', '向'],
  '向': ['同', '尚'],
  '见': ['贝', '观'],
  '贝': ['见', '员'],
  '车': ['东', '军'],
  '东': ['车', '冬'],
  '冬': ['东', '各'],
  '己': ['已', '巳'],
  '已': ['己', '巳'],
  '巳': ['己', '已'],
  '买': ['卖'],
  '卖': ['买'],
  '开': ['井', '升'],
  '井': ['开', '升'],
  '升': ['开', '井'],
  '只': ['叫', '另'],
  '力': ['刀', '办'],
  '刀': ['力', '刃'],
  '办': ['力', '为'],
  '为': ['办'],
  '马': ['鸟', '乌'],
  '鸟': ['马', '乌'],
  '乌': ['马', '鸟'],
  '住': ['往', '柱'],
  '往': ['住'],
  '明': ['朋', '期'],
  '朋': ['明', '期'],
  '期': ['明', '朋'],
  '话': ['活', '语'],
  '活': ['话'],
  '语': ['话', '说'],
  '说': ['语', '读'],
  '读': ['说'],
  '问': ['间', '闻'],
  '间': ['问', '闻', '闪'],
  '闻': ['问', '间'],
  '闪': ['间', '门'],
  '门': ['闪', '问'],
};

// Тоновая статистика компонент
function ToneStats({ characters }: { characters: ChineseCharacterRow[] }) {
  const stats = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const c of characters) {
      if (c.pinyin) {
        const tone = getToneFromPinyin(c.pinyin);
        counts[tone]++;
      } else {
        counts[5]++;
      }
    }
    return counts;
  }, [characters]);

  const total = characters.length || 1;

  return (
    <div className="zh-tone-stats">
      <div className="zh-tone-stats-title">Тоны в словаре</div>
      <div className="zh-tone-stats-bars">
        {([1, 2, 3, 4, 5] as const).map((tone) => {
          const info = TONE_INFO[tone];
          const pct = Math.round((stats[tone] / total) * 100);
          return (
            <div key={tone} className="zh-tone-bar-wrap">
              <div className="zh-tone-bar-label" style={{ color: info.color }}>
                {tone === 5 ? '轻' : tone}
              </div>
              <div className="zh-tone-bar-track">
                <div
                  className="zh-tone-bar-fill"
                  style={{ width: `${pct}%`, background: info.color }}
                />
              </div>
              <div className="zh-tone-bar-count">{stats[tone]}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Похожие иероглифы компонент
function SimilarChars({
  character,
  userChars,
  onSelect,
}: {
  character: string;
  userChars: ChineseCharacterRow[];
  onSelect: (id: string) => void;
}) {
  const similar = SIMILAR_CHARS[character] || [];
  const userMap = useMemo(() => {
    const m: Record<string, ChineseCharacterRow> = {};
    for (const c of userChars) m[c.character] = c;
    return m;
  }, [userChars]);

  if (similar.length === 0) return null;

  return (
    <div className="zh-similar-section">
      <div className="zh-similar-title">Похожие иероглифы</div>
      <div className="zh-similar-grid">
        {similar.map((ch) => {
          const inDict = userMap[ch];
          return (
            <button
              key={ch}
              type="button"
              className={`zh-similar-chip${inDict ? ' zh-similar-chip--known' : ''}`}
              onClick={() => inDict && onSelect(inDict.id)}
              disabled={!inDict}
              title={inDict ? `${ch} — ${inDict.pinyin || ''}` : `${ch} — не в словаре`}
            >
              <span className="zh-similar-hanzi" style={{ fontFamily: CHINESE_FONT }}>
                {ch}
              </span>
              {inDict && (
                <span className="zh-similar-py" style={{ color: getToneColor(inDict.pinyin || '') }}>
                  {inDict.pinyin || ''}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="zh-similar-hint">
        Выделены те, которые уже есть в вашем словаре
      </p>
    </div>
  );
}

// Заметки/мнемоники компонент
function CharacterNotes({
  character,
  notes,
  accessToken,
  apiUrl,
  onUpdate,
}: {
  character: ChineseCharacterRow;
  notes: string | null;
  accessToken: string | null;
  apiUrl: string;
  onUpdate: (newNotes: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(notes || '');
    setEditing(false);
  }, [notes, character.id]);

  const handleSave = async () => {
    if (!accessToken) return;
    setSaving(true);
    try {
      const resp = await fetch(`${getApiUrl(apiUrl)}/api/vocabulary/characters/update-notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ id: character.id, notes: draft.trim() }),
      });
      if (resp.ok) {
        onUpdate(draft.trim());
        setEditing(false);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="zh-notes-section">
      <div className="zh-notes-header">
        <span className="zh-notes-title">Мнемоника / заметка</span>
        {!editing && (
          <button type="button" className="zh-notes-edit-btn" onClick={() => setEditing(true)}>
            {notes ? 'Изменить' : 'Добавить'}
          </button>
        )}
      </div>
      {editing ? (
        <div className="zh-notes-editor">
          <textarea
            className="zh-notes-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Напишите ассоциацию, чтобы запомнить иероглиф..."
            rows={3}
          />
          <div className="zh-notes-actions">
            <button
              type="button"
              className="zh-notes-cancel"
              onClick={() => {
                setDraft(notes || '');
                setEditing(false);
              }}
            >
              Отмена
            </button>
            <button
              type="button"
              className="zh-notes-save"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </div>
      ) : notes ? (
        <div className="zh-notes-content">{notes}</div>
      ) : (
        <div className="zh-notes-empty">
          Добавьте мнемонику — ассоциацию, которая поможет запомнить иероглиф
        </div>
      )}
    </div>
  );
}

export function ChineseCharactersDictionary({
  accessToken,
  apiUrl,
  search,
  hskFilter,
  onCountChange,
}: ChineseCharactersDictionaryProps) {
  const [characters, setCharacters] = useState<ChineseCharacterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [toneFilter, setToneFilter] = useState<number | null>(null);

  const loadCharacters = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (isHskLevelValue(hskFilter)) params.set('hsk_level', hskFilter);

      const resp = await fetch(
        `${getApiUrl(apiUrl)}/api/vocabulary/characters/list?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || `Ошибка ${resp.status}`);
      }
      const list: ChineseCharacterRow[] = data.characters || [];
      setCharacters(list);
      onCountChange?.(list.length);
      setSelectedId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return list[0]?.id || null;
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Не удалось загрузить иероглифы';
      setError(message);
      setCharacters([]);
      onCountChange?.(0);
    } finally {
      setLoading(false);
    }
  }, [accessToken, apiUrl, search, hskFilter, onCountChange]);

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  // Фильтрация по тону
  const filteredCharacters = useMemo(() => {
    if (toneFilter === null) return characters;
    return characters.filter((c) => {
      const tone = c.pinyin ? getToneFromPinyin(c.pinyin) : 5;
      return tone === toneFilter;
    });
  }, [characters, toneFilter]);

  const selected = useMemo(
    () => filteredCharacters.find((c) => c.id === selectedId) || filteredCharacters[0] || null,
    [filteredCharacters, selectedId],
  );

  const selectedTranslation = translationText(selected);
  const tone = selected?.pinyin ? getToneFromPinyin(selected.pinyin) : null;
  const toneMeta = tone ? TONE_INFO[tone] : null;

  const handleBulkDelete = async () => {
    if (!accessToken || selectedIds.size === 0) return;
    setDeleting(true);
    try {
      const resp = await fetch(`${getApiUrl(apiUrl)}/api/vocabulary/characters/bulk-delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || `Ошибка ${resp.status}`);
      }
      setSelectedIds(new Set());
      await loadCharacters();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Не удалось удалить';
      setError(message);
    } finally {
      setDeleting(false);
    }
  };

  const handleNotesUpdate = (newNotes: string) => {
    if (!selected) return;
    setCharacters((prev) =>
      prev.map((c) => (c.id === selected.id ? { ...c, notes: newNotes } : c)),
    );
  };

  return (
    <div className="zh-chars-layout">
      <div className="zh-chars-list-panel">
        {/* Тоновая статистика */}
        {characters.length > 0 && <ToneStats characters={characters} />}

        {/* Фильтр по тону */}
        {characters.length > 0 && (
          <div className="zh-tone-filter">
            <span className="zh-tone-filter-label">Фильтр по тону:</span>
            <div className="zh-tone-filter-chips">
              <button
                type="button"
                className={`zh-tone-chip${toneFilter === null ? ' zh-tone-chip--active' : ''}`}
                onClick={() => setToneFilter(null)}
              >
                Все
              </button>
              {([1, 2, 3, 4, 5] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`zh-tone-chip${toneFilter === t ? ' zh-tone-chip--active' : ''}`}
                  style={{
                    borderColor: TONE_INFO[t].color,
                    color: toneFilter === t ? '#fff' : TONE_INFO[t].color,
                    background: toneFilter === t ? TONE_INFO[t].color : 'transparent',
                  }}
                  onClick={() => setToneFilter(t)}
                >
                  {t === 5 ? '轻' : t}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="zh-chars-list-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={filteredCharacters.length > 0 && selectedIds.size === filteredCharacters.length}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedIds(new Set(filteredCharacters.map((c) => c.id)));
                } else {
                  setSelectedIds(new Set());
                }
              }}
              style={{ accentColor: 'var(--accent)' }}
            />
            <span>
              汉字 ({filteredCharacters.length}
              {toneFilter !== null && ` / ${characters.length}`})
            </span>
          </div>
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={deleting}
              className="zh-chars-delete-btn"
            >
              {deleting ? 'Удаление…' : `Удалить (${selectedIds.size})`}
            </button>
          )}
        </div>

        {error && <div className="zh-chars-error">{error}</div>}

        {loading ? (
          <div className="zh-chars-empty">Загрузка иероглифов…</div>
        ) : filteredCharacters.length === 0 ? (
          <div className="zh-chars-empty">
            {characters.length === 0
              ? 'Пока нет иероглифов. Добавляйте из переводчика или при сохранении слов.'
              : 'Нет иероглифов с выбранным тоном.'}
          </div>
        ) : (
          <div className="zh-chars-grid">
            {filteredCharacters.map((row) => {
              const isSelected = selected?.id === row.id;
              const isChecked = selectedIds.has(row.id);
              const pyColor = row.pinyin ? getToneColor(row.pinyin) : 'rgba(148,163,184,0.85)';
              const gloss = translationText(row);

              return (
                <button
                  key={row.id}
                  type="button"
                  className={`zh-char-card${isSelected ? ' zh-char-card--selected' : ''}`}
                  onClick={() => setSelectedId(row.id)}
                  style={
                    isSelected && row.pinyin
                      ? { borderColor: `${pyColor}99`, boxShadow: `0 0 0 3px ${pyColor}22` }
                      : undefined
                  }
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      e.stopPropagation();
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(row.id);
                        else next.delete(row.id);
                        return next;
                      });
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="zh-char-card-check"
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <span className="zh-char-card-pinyin" style={{ color: pyColor }}>
                    {row.pinyin || '·'}
                  </span>
                  <span className="zh-char-card-hanzi" style={{ fontFamily: CHINESE_FONT }}>
                    {row.character}
                  </span>
                  {gloss && <span className="zh-char-card-gloss">{gloss}</span>}
                  {row.hsk_level ? (
                    <span className="zh-char-card-hsk">HSK {row.hsk_level}</span>
                  ) : null}
                  {row.notes && <span className="zh-char-card-note-icon">📝</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="zh-chars-detail-panel">
        {selected ? (
          <div className="zh-detail-panel">
            <div className="zh-detail-hero">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  flexWrap: 'wrap',
                }}
              >
                <div
                  style={{
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'rgba(148,163,184,0.9)',
                  }}
                >
                  Разбор иероглифа
                </div>
                <div className="zh-detail-meta">
                  {selected.hsk_level ? (
                    <span className="zh-detail-meta-chip">HSK {selected.hsk_level}</span>
                  ) : null}
                  {toneMeta ? (
                    <span
                      className="zh-detail-meta-chip"
                      style={{ background: `${toneMeta.color}33`, color: toneMeta.color }}
                    >
                      {toneMeta.short}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="zh-char-hero-stage">
                <div
                  className="zh-char-hero-glyph"
                  style={{
                    fontFamily: CHINESE_FONT,
                    borderColor: toneMeta ? `${toneMeta.color}66` : 'rgba(148,163,184,0.25)',
                    color: '#f8fafc',
                  }}
                >
                  {selected.character}
                </div>
                <div className="zh-char-hero-side">
                  <ChineseRubyInline word={selected.character} pinyin={selected.pinyin} size="md" />
                  <div
                    className="zh-char-hero-pinyin"
                    style={{ color: toneMeta?.color || 'rgba(226,232,240,0.95)' }}
                  >
                    {selected.pinyin || 'пиньинь не указан'}
                  </div>
                  {toneMeta && (
                    <div style={{ fontSize: '0.82rem', color: 'rgba(226,232,240,0.88)' }}>
                      {toneMeta.label}
                    </div>
                  )}
                </div>
              </div>

              <InteractiveChineseWord
                key={selected.id}
                word={selected.character}
                pinyin={selected.pinyin}
                translation={selectedTranslation}
                characterGlosses={{
                  [selected.character]: {
                    translation: selectedTranslation,
                    pinyin: selected.pinyin,
                  },
                }}
                size="md"
                showToneLegend={false}
                autoSelectFirst
              />
            </div>

            {selectedTranslation && (
              <div className="zh-translation-block">
                <div className="zh-translation-label">Перевод</div>
                <div className="zh-translation-text">{selectedTranslation}</div>
              </div>
            )}

            <div className="zh-char-facts">
              <div className="zh-char-fact">
                <span className="zh-char-fact-label">Радикал 部首</span>
                <span className="zh-char-fact-value" style={{ fontFamily: CHINESE_FONT }}>
                  {selected.radical || '—'}
                </span>
              </div>
              <div className="zh-char-fact">
                <span className="zh-char-fact-label">Черты 笔画</span>
                <span className="zh-char-fact-value">{selected.stroke_count ?? '—'}</span>
              </div>
              <div className="zh-char-fact">
                <span className="zh-char-fact-label">Встречалось</span>
                <span className="zh-char-fact-value">{selected.times_seen ?? 0}</span>
              </div>
            </div>

            {/* Похожие иероглифы */}
            <SimilarChars
              character={selected.character}
              userChars={characters}
              onSelect={setSelectedId}
            />

            {/* Мнемоника / заметки */}
            <CharacterNotes
              character={selected}
              notes={selected.notes || null}
              accessToken={accessToken}
              apiUrl={apiUrl}
              onUpdate={handleNotesUpdate}
            />
          </div>
        ) : (
          <div className="zh-chars-empty" style={{ padding: '2rem 1rem' }}>
            Выберите иероглиф слева, чтобы увидеть разбор
          </div>
        )}
      </div>
    </div>
  );
}
