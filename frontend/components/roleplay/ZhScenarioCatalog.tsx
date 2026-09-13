'use client';

import React, { useMemo, useState } from 'react';
import type { ZhHskLevel, ZhScenario } from '@/lib/zh-scenarios';
import { ZhPlayModeDots } from '@/components/roleplay/ZhPlayModeDots';

const HSK_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'Все HSK' },
  { value: '1', label: 'HSK 1' },
  { value: '2', label: 'HSK 2' },
  { value: '3', label: 'HSK 3' },
  { value: '4', label: 'HSK 4' },
  { value: '5', label: 'HSK 5' },
  { value: '6', label: 'HSK 6' },
];

type ThemeId = 'meet' | 'family' | 'time' | 'shop' | 'canteen' | 'taxi' | 'city' | 'weather' | 'other';

const THEME_ORDER: ThemeId[] = ['meet', 'family', 'time', 'shop', 'canteen', 'taxi', 'city', 'weather', 'other'];

const THEME_META: Record<ThemeId, { label: string; bar: string }> = {
  meet: { label: 'Знакомство', bar: '#7c3aed' },
  family: { label: 'Семья', bar: '#db2777' },
  time: { label: 'Время', bar: '#4f46e5' },
  shop: { label: 'Магазин', bar: '#ea580c' },
  canteen: { label: 'Столовая', bar: '#ca8a04' },
  taxi: { label: 'Такси', bar: '#0d9488' },
  city: { label: 'В городе', bar: '#2563eb' },
  weather: { label: 'Погода', bar: '#0284c7' },
  other: { label: 'Другие темы', bar: '#64748b' },
};

const iconProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const THEME_ICONS: Record<ThemeId, React.ReactNode> = {
  meet: (
    <svg {...iconProps}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  family: (
    <svg {...iconProps}>
      <path d="M4 21V7l8-5 8 5v14H4z" />
      <path d="M9 21v-6h6v6" />
    </svg>
  ),
  time: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  shop: (
    <svg {...iconProps}>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  ),
  canteen: (
    <svg {...iconProps}>
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h0" />
      <path d="M21 15v7" />
    </svg>
  ),
  taxi: (
    <svg {...iconProps}>
      <path d="M5 17h14v-4H5v4z" />
      <path d="M7 13h10" />
      <circle cx="7.5" cy="17" r="1.5" />
      <circle cx="16.5" cy="17" r="1.5" />
    </svg>
  ),
  city: (
    <svg {...iconProps}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  weather: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  ),
  other: (
    <svg {...iconProps}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
};

function themeIdFor(s: ZhScenario): ThemeId {
  const title = s.title.trim();
  if (title === 'Знакомство' || title === 'Страна и учёба') return 'meet';
  if (title === 'Моя семья' || title === 'Сколько тебе лет') return 'family';
  if (title === 'Который час') return 'time';
  if (title === 'В магазине') return 'shop';
  if (title === 'В столовой') return 'canteen';
  if (title === 'Такси до школы') return 'taxi';
  if (title === 'Где больница') return 'city';
  if (title === 'Какая сегодня погода') return 'weather';
  return 'other';
}

function hskBadge(hsk?: ZhHskLevel | null) {
  if (!hsk) return null;
  if (hsk <= 2) return { bg: 'rgba(34, 197, 94, 0.15)', color: 'rgb(22, 163, 74)' };
  if (hsk <= 4) return { bg: 'rgba(234, 179, 8, 0.15)', color: 'rgb(202, 138, 4)' };
  return { bg: 'rgba(239, 68, 68, 0.12)', color: 'rgb(185, 28, 28)' };
}

function CatalogCard({
  scenario,
  accent,
  onSelect,
  onSaveToMine,
  saving,
}: {
  scenario: ZhScenario;
  accent: string;
  onSelect: () => void;
  onSaveToMine?: () => void;
  saving?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const badge = hskBadge(scenario.hsk_level);
  const role = scenario.user_role;
  const shortInfo = scenario.description || scenario.goals?.[0] || null;

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '0.625rem',
        width: '100%',
        padding: '1.25rem 1.5rem',
        borderRadius: 14,
        border: '1px solid var(--sidebar-border)',
        borderLeftWidth: 5,
        borderLeftColor: accent,
        background: hover ? 'var(--sidebar-active)' : 'var(--sidebar-hover)',
        color: 'var(--sidebar-text)',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
        boxShadow: hover ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
        minHeight: 120,
      }}
    >
      <span style={{ display: 'block', fontSize: '1rem', fontWeight: 600, lineHeight: 1.3 }}>
        {scenario.title}
      </span>
      {scenario.mastered_modes && (scenario.completions_count ?? 0) > 0 && (
        <ZhPlayModeDots mastered={scenario.mastered_modes} compact />
      )}
      {shortInfo && (
        <span
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
            fontSize: '0.875rem',
            opacity: 0.78,
            lineHeight: 1.4,
          }}
        >
          {shortInfo}
        </span>
      )}
      {role && (
        <span
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
            fontSize: '0.8125rem',
            opacity: 0.7,
            lineHeight: 1.35,
            fontStyle: 'italic',
          }}
        >
          Ваша роль: {role}
        </span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 'auto', width: '100%', flexWrap: 'wrap' }}>
        {badge && scenario.hsk_level && (
          <span
            style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              padding: '0.2rem 0.5rem',
              borderRadius: 6,
              background: badge.bg,
              color: badge.color,
            }}
          >
            HSK {scenario.hsk_level}
          </span>
        )}
        {scenario.steps?.length ? (
          <span style={{ fontSize: '0.6875rem', fontWeight: 600, opacity: 0.65 }}>
            {scenario.steps.length} шаг.
          </span>
        ) : null}
        <span style={{ marginLeft: 'auto', fontSize: '0.8125rem', fontWeight: 500, opacity: 0.85 }}>
          Выбрать →
        </span>
        {onSaveToMine && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSaveToMine();
            }}
            disabled={saving}
            aria-label="Сохранить в мои сценарии"
            style={{
              padding: '0.35rem 0.6rem',
              borderRadius: 8,
              border: '1px solid var(--sidebar-border)',
              background: 'var(--sidebar-bg)',
              color: 'var(--sidebar-text)',
              fontSize: '0.75rem',
              fontWeight: 500,
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.7 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {saving ? 'Сохранение…' : 'Сохранить в мои'}
          </button>
        )}
      </div>
    </button>
  );
}

export function ZhScenarioCatalog({
  scenarios,
  loading,
  searchQuery,
  onSearchQuery,
  hskFilter,
  onHskFilter,
  onSelect,
  onSaveToMine,
  savingId,
  copyMessage,
}: {
  scenarios: ZhScenario[];
  loading: boolean;
  searchQuery: string;
  onSearchQuery: (value: string) => void;
  hskFilter: string;
  onHskFilter: (value: string) => void;
  onSelect: (scenario: ZhScenario) => void;
  onSaveToMine?: (scenario: ZhScenario) => void;
  savingId?: string | null;
  copyMessage?: string | null;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const sections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const grouped = new Map<ThemeId, ZhScenario[]>();
    for (const s of scenarios) {
      const hay = `${s.title} ${s.description || ''} ${s.textbook?.title || ''} ${s.user_role || ''}`.toLowerCase();
      if (q && !hay.includes(q)) continue;
      const id = themeIdFor(s);
      const list = grouped.get(id) || [];
      list.push(s);
      grouped.set(id, list);
    }
    return THEME_ORDER.map((themeId) => ({
      themeId,
      ...THEME_META[themeId],
      scenarios: grouped.get(themeId) || [],
    })).filter((section) => section.scenarios.length > 0);
  }, [scenarios, searchQuery]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {copyMessage && (
        <div
          role="status"
          style={{
            flexShrink: 0,
            padding: '0.75rem 1.25rem',
            background: 'rgba(34, 197, 94, 0.12)',
            borderBottom: '1px solid rgba(34, 197, 94, 0.3)',
            color: 'var(--sidebar-text)',
            fontSize: '0.9375rem',
            fontWeight: 500,
          }}
        >
          {copyMessage}
        </div>
      )}
      <div
        style={{
          flexShrink: 0,
          padding: '1.5rem 1.75rem 1rem',
          borderBottom: '1px solid var(--sidebar-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, color: 'var(--sidebar-text)' }}>
            Ситуативные диалоги
          </h2>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.9375rem', color: 'var(--sidebar-text)', opacity: 0.7 }}>
            Выберите тему — ИИ говорит на упрощённом китайском на уровне карточки
          </p>
        </div>
        <label style={{ position: 'relative', display: 'block' }}>
          <input
            type="search"
            aria-label="Поиск сценария"
            placeholder="Поиск по названию или теме..."
            value={searchQuery}
            onChange={(e) => onSearchQuery(e.target.value)}
            autoComplete="off"
            className="roleplay-scenario-search"
            style={{
              width: '100%',
              padding: '0.625rem 0.875rem 0.625rem 2.5rem',
              borderRadius: 12,
              border: '1px solid var(--sidebar-border)',
              background: 'var(--sidebar-hover)',
              color: 'var(--sidebar-text)',
              fontSize: '0.9375rem',
              outline: 'none',
            }}
            onKeyDown={(e) => e.key === 'Escape' && (onSearchQuery(''), e.currentTarget.blur())}
          />
          <svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              position: 'absolute',
              left: '0.875rem',
              top: '50%',
              transform: 'translateY(-50%)',
              opacity: 0.5,
              pointerEvents: 'none',
            }}
          >
            <circle cx={11} cy={11} r={8} />
            <line x1={21} y1={21} x2={16.65} y2={16.65} />
          </svg>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }} role="group" aria-label="Уровень HSK">
          {HSK_FILTERS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onHskFilter(opt.value)}
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: 10,
                border: '1px solid var(--sidebar-border)',
                background: hskFilter === opt.value ? 'var(--sidebar-active)' : 'transparent',
                color: 'var(--sidebar-text)',
                fontSize: '0.8125rem',
                fontWeight: 500,
                cursor: 'pointer',
                opacity: hskFilter === opt.value ? 1 : 0.85,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '1.5rem 1.75rem',
        }}
      >
        {loading ? (
          <p style={{ margin: 0, fontSize: '0.9375rem', opacity: 0.7 }}>Загрузка…</p>
        ) : sections.length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.9375rem', color: 'var(--sidebar-text)', opacity: 0.7, textAlign: 'center' }}>
            {scenarios.length === 0 ? 'В каталоге пока нет сценариев.' : 'Ничего не найдено. Измените запрос.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {sections.map(({ themeId, label, bar, scenarios: list }) => {
            const isExpanded = expanded.has(themeId);
            return (
              <section
                key={themeId}
                aria-labelledby={`zh-theme-${themeId}`}
                style={{
                  flexShrink: 0,
                  borderRadius: 12,
                  border: '1px solid var(--sidebar-border)',
                  overflow: 'hidden',
                  background: isExpanded ? 'var(--sidebar-hover)' : 'transparent',
                }}
              >
                <button
                  type="button"
                  id={`zh-theme-${themeId}`}
                  onClick={() => {
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(themeId)) next.delete(themeId);
                      else next.add(themeId);
                      return next;
                    });
                  }}
                  aria-expanded={isExpanded}
                  style={{
                    width: '100%',
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--sidebar-text)',
                    fontSize: '1rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--sidebar-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isExpanded) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: 0.95 }}>
                    <span style={{ display: 'flex', color: bar, opacity: 0.95 }}>{THEME_ICONS[themeId]}</span>
                    {label}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.8125rem', opacity: 0.6, lineHeight: 1 }}>{list.length} сценар.</span>
                    <svg
                      width={18}
                      height={18}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        flexShrink: 0,
                        opacity: 0.7,
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                        transition: 'transform 0.2s ease',
                      }}
                      aria-hidden
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                </button>
                {isExpanded && (
                  <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '1px solid var(--sidebar-border)' }}>
                    <ul
                      style={{
                        listStyle: 'none',
                        margin: '1rem 0 0',
                        padding: 0,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                        gap: '1rem',
                      }}
                    >
                      {list.map((scenario) => (
                        <li key={scenario.id}>
                          <CatalogCard
                            scenario={scenario}
                            accent={bar}
                            onSelect={() => onSelect(scenario)}
                            onSaveToMine={onSaveToMine ? () => onSaveToMine(scenario) : undefined}
                            saving={savingId === scenario.id}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            );
          })}
          </div>
        )}
      </div>
    </div>
  );
}
