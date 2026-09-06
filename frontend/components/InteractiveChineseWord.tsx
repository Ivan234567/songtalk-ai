'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  CHINESE_FONT,
  ChineseCharUnit,
  TONE_INFO,
  getToneColor,
  isHanziChar,
  splitChineseWord,
} from '@/lib/chinese-display';

export type CharacterGloss = {
  translation?: string | null;
  pinyin?: string | null;
};

type InteractiveChineseWordProps = {
  word: string;
  pinyin?: string | null;
  /** Полный перевод слова (RU) */
  translation?: string | null;
  /** Подсказки по отдельным иероглифам (из словаря пользователя и т.п.) */
  characterGlosses?: Record<string, CharacterGloss>;
  size?: 'sm' | 'md' | 'lg';
  /** Показывать легенду тонов */
  showToneLegend?: boolean;
  /** Автовыбор первого иероглифа */
  autoSelectFirst?: boolean;
  className?: string;
};

function CharTile({
  unit,
  selected,
  size,
  onSelect,
}: {
  unit: ChineseCharUnit;
  selected: boolean;
  size: 'sm' | 'md' | 'lg';
  onSelect: () => void;
}) {
  const clickable = isHanziChar(unit.hanzi);
  const toneColor = unit.pinyin ? getToneColor(unit.pinyin) : TONE_INFO[5].color;

  const pad =
    size === 'lg' ? '0.35rem 0.45rem 0.4rem' : size === 'sm' ? '0.15rem 0.22rem 0.2rem' : '0.25rem 0.35rem 0.3rem';
  const hanziSize = size === 'lg' ? '2.15rem' : size === 'sm' ? '1.15rem' : '1.65rem';
  const pinyinSize = size === 'lg' ? '0.82rem' : size === 'sm' ? '0.65rem' : '0.74rem';
  const minW = size === 'lg' ? '2.6rem' : size === 'sm' ? '1.7rem' : '2.15rem';

  if (!clickable) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'flex-end',
          paddingBottom: size === 'sm' ? '0.15rem' : '0.35rem',
          fontSize: hanziSize,
          color: 'var(--text-muted)',
          opacity: 0.7,
        }}
      >
        {unit.hanzi}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`zh-char-tile${selected ? ' zh-char-tile--selected' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      aria-pressed={selected}
      aria-label={`${unit.hanzi}${unit.pinyin ? `, ${unit.pinyin}` : ''}`}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        minWidth: minW,
        padding: pad,
        borderRadius: size === 'sm' ? 8 : 12,
        border: selected
          ? `1.5px solid ${toneColor}`
          : '1px solid rgba(148, 163, 184, 0.22)',
        background: selected
          ? `linear-gradient(180deg, ${toneColor}22 0%, rgba(15, 23, 42, 0.55) 100%)`
          : 'rgba(15, 23, 42, 0.35)',
        boxShadow: selected ? `0 0 0 3px ${toneColor}33` : 'none',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s, transform 0.12s',
        transform: selected ? 'translateY(-1px)' : 'none',
      }}
    >
      <span
        style={{
          fontSize: pinyinSize,
          color: toneColor,
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          letterSpacing: '0.01em',
          opacity: unit.pinyin ? 0.98 : 0.35,
          lineHeight: 1.15,
          minHeight: size === 'sm' ? '0.75rem' : '0.95rem',
          marginBottom: '0.1rem',
          fontWeight: 600,
          userSelect: 'none',
        }}
      >
        {unit.pinyin || '·'}
      </span>
      <span
        style={{
          fontSize: hanziSize,
          fontFamily: CHINESE_FONT,
          lineHeight: 1.15,
          color: 'var(--sidebar-text, #f9fafb)',
          fontWeight: selected ? 700 : 500,
        }}
      >
        {unit.hanzi}
      </span>
    </button>
  );
}

export function InteractiveChineseWord({
  word,
  pinyin,
  translation,
  characterGlosses,
  size = 'md',
  showToneLegend = true,
  autoSelectFirst = true,
  className,
}: InteractiveChineseWordProps) {
  const units = useMemo(() => splitChineseWord(word, pinyin), [word, pinyin]);
  const hanziUnits = useMemo(() => units.filter((u) => isHanziChar(u.hanzi)), [units]);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!autoSelectFirst) {
      setSelectedIndex(null);
      return;
    }
    const first = units.find((u) => isHanziChar(u.hanzi));
    setSelectedIndex(first ? first.index : null);
  }, [word, pinyin, autoSelectFirst, units]);

  const selected = selectedIndex != null ? units.find((u) => u.index === selectedIndex) : null;
  const gloss = selected ? characterGlosses?.[selected.hanzi] : undefined;
  const toneMeta = selected ? TONE_INFO[selected.tone] : null;

  if (units.length === 0) return null;

  return (
    <div className={`zh-interactive-word${className ? ` ${className}` : ''}`}>
      <div
        className="zh-char-row"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          gap: size === 'sm' ? '0.28rem' : '0.45rem',
        }}
      >
        {units.map((unit) => (
          <CharTile
            key={`${unit.index}-${unit.hanzi}`}
            unit={unit}
            selected={selectedIndex === unit.index}
            size={size}
            onSelect={() =>
              setSelectedIndex((prev) => (prev === unit.index ? null : unit.index))
            }
          />
        ))}
      </div>

      {hanziUnits.length > 1 && (
        <p
          style={{
            margin: '0.55rem 0 0',
            fontSize: '0.72rem',
            color: 'rgba(148,163,184,0.85)',
          }}
        >
          Нажмите на иероглиф — разберём произношение и значение
        </p>
      )}

      {selected && toneMeta && (
        <div
          className="zh-char-insight"
          style={{
            marginTop: '0.75rem',
            borderRadius: '1rem',
            border: `1px solid ${toneMeta.color}44`,
            background: `linear-gradient(135deg, ${toneMeta.color}14 0%, rgba(24,24,27,0.9) 55%)`,
            padding: '0.85rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.55rem',
            animation: 'zh-insight-in 0.18s ease-out',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: '3.25rem',
                height: '3.25rem',
                borderRadius: '0.85rem',
                border: `1.5px solid ${toneMeta.color}66`,
                background: 'rgba(15,23,42,0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: CHINESE_FONT,
                fontSize: '1.85rem',
                color: '#f9fafb',
                flexShrink: 0,
              }}
            >
              {selected.hanzi}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  color: toneMeta.color,
                  letterSpacing: '0.02em',
                }}
              >
                {selected.pinyin || '—'}
              </div>
              <div
                style={{
                  marginTop: '0.2rem',
                  fontSize: '0.8rem',
                  color: 'rgba(226,232,240,0.92)',
                }}
              >
                {toneMeta.label}
              </div>
              {hanziUnits.length > 1 && (
                <div
                  style={{
                    marginTop: '0.35rem',
                    fontSize: '0.75rem',
                    color: 'rgba(148,163,184,0.95)',
                  }}
                >
                  Иероглиф {hanziUnits.findIndex((u) => u.index === selected.index) + 1} из{' '}
                  {hanziUnits.length} в слове{' '}
                  <span style={{ fontFamily: CHINESE_FONT, color: '#e2e8f0' }}>{word}</span>
                </div>
              )}
            </div>
          </div>

          {(gloss?.translation || translation) && (
            <div
              style={{
                borderTop: '1px solid rgba(148,163,184,0.18)',
                paddingTop: '0.55rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
              }}
            >
              {gloss?.translation ? (
                <div style={{ fontSize: '0.9rem', color: '#f1f5f9' }}>
                  <span style={{ color: 'rgba(148,163,184,0.95)', fontSize: '0.75rem' }}>
                    Значение иероглифа:{' '}
                  </span>
                  {gloss.translation}
                </div>
              ) : null}
              {translation ? (
                <div style={{ fontSize: '0.9rem', color: '#e2e8f0' }}>
                  <span style={{ color: 'rgba(148,163,184,0.95)', fontSize: '0.75rem' }}>
                    {gloss?.translation ? 'Слово целиком: ' : 'Перевод: '}
                  </span>
                  <span
                    style={{
                      background: 'rgba(17,98,47,0.35)',
                      borderRadius: '0.35rem',
                      padding: '0.05rem 0.35rem',
                      border: '1px solid rgba(17,98,47,0.45)',
                    }}
                  >
                    {translation}
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {showToneLegend && size !== 'sm' && (
        <div
          className="zh-tone-legend"
          style={{
            marginTop: '0.75rem',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.4rem',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '0.7rem', color: 'rgba(148,163,184,0.8)', marginRight: '0.15rem' }}>
            Тоны:
          </span>
          {([1, 2, 3, 4, 5] as const).map((t) => (
            <span
              key={t}
              style={{
                fontSize: '0.68rem',
                padding: '0.15rem 0.4rem',
                borderRadius: 999,
                border: `1px solid ${TONE_INFO[t].color}55`,
                color: TONE_INFO[t].color,
                background: `${TONE_INFO[t].color}12`,
                fontWeight: 600,
              }}
              title={TONE_INFO[t].label}
            >
              {TONE_INFO[t].short}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Компактная ruby-строка для списка (без панели разбора). */
export function ChineseRubyInline({
  word,
  pinyin,
  size = 'sm',
}: {
  word: string;
  pinyin?: string | null;
  size?: 'sm' | 'md';
}) {
  const units = useMemo(() => splitChineseWord(word, pinyin), [word, pinyin]);
  if (units.length === 0) {
    return <span style={{ fontFamily: CHINESE_FONT }}>{word}</span>;
  }

  const hanziSize = size === 'md' ? '1.05rem' : '0.98rem';
  const pinyinSize = size === 'md' ? '0.68rem' : '0.62rem';

  return (
    <span
      style={{
        display: 'inline-flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        gap: '0.2rem 0.28rem',
        fontFamily: CHINESE_FONT,
      }}
    >
      {units.map((unit) => (
        <span
          key={`${unit.index}-${unit.hanzi}`}
          style={{
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'center',
            lineHeight: 1.1,
          }}
        >
          {unit.pinyin ? (
            <span
              style={{
                fontSize: pinyinSize,
                color: getToneColor(unit.pinyin),
                fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                fontWeight: 600,
                marginBottom: 1,
              }}
            >
              {unit.pinyin}
            </span>
          ) : null}
          <span style={{ fontSize: hanziSize, fontWeight: 600, color: '#f9fafb' }}>{unit.hanzi}</span>
        </span>
      ))}
    </span>
  );
}
