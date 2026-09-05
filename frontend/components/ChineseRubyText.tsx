'use client';

import React from 'react';

export type ChineseSegment = { hanzi: string; pinyin: string };

export type StructuredChineseResult = {
  segments: ChineseSegment[];
  translation?: string;
};

export function parseStructuredChineseResponse(raw: string): StructuredChineseResult | null {
  try {
    let jsonText = raw.trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) jsonText = jsonMatch[1];
    const start = jsonText.indexOf('{');
    const end = jsonText.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(jsonText.slice(start, end + 1));
    if (!Array.isArray(parsed.segments)) return null;
    const segments = parsed.segments
      .filter((s: ChineseSegment) => s?.hanzi)
      .map((s: ChineseSegment) => ({ hanzi: String(s.hanzi), pinyin: typeof s?.pinyin === 'string' ? String(s.pinyin) : '' }));
    if (segments.length === 0) return null;
    return {
      segments,
      translation: typeof parsed.translation === 'string' ? parsed.translation : '',
    };
  } catch {
    return null;
  }
}

type ChineseRubyTextProps = {
  segments: ChineseSegment[];
  size?: 'md' | 'lg';
  onTextSelect?: () => void;
};

type SegmentUnit = {
  hanzi: string;
  pinyin: string;
};

function normalizePinyinSyllables(pinyin: string): string[] {
  return pinyin
    .replace(/-/g, ' ')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function expandSegments(segments: ChineseSegment[]): SegmentUnit[] {
  const units: SegmentUnit[] = [];

  segments.forEach((seg) => {
    const hanzi = (seg.hanzi || '').trim();
    const pinyin = (seg.pinyin || '').trim();
    if (!hanzi) return;

    const chars = Array.from(hanzi);
    const syllables = normalizePinyinSyllables(pinyin);

    if (chars.length > 1 && syllables.length === chars.length) {
      chars.forEach((char, index) => {
        units.push({
          hanzi: char,
          pinyin: syllables[index] || '',
        });
      });
      return;
    }

    units.push({ hanzi, pinyin });
  });

  return units;
}

function getToneColor(pinyin: string): string {
  if (/[āēīōūǖĀĒĪŌŪǕ]/.test(pinyin)) return '#ef4444';
  if (/[áéíóúǘÁÉÍÓÚǗ]/.test(pinyin)) return '#f59e0b';
  if (/[ǎěǐǒǔǚǍĚǏǑǓǙ]/.test(pinyin)) return '#10b981';
  if (/[àèìòùǜÀÈÌÒÙǛ]/.test(pinyin)) return '#3b82f6';
  return 'var(--sidebar-text)';
}

export function ChineseRubyText({ segments, size = 'md', onTextSelect }: ChineseRubyTextProps) {
  const units = expandSegments(segments);
  const hanziSize = size === 'lg' ? '1.75rem' : '1.375rem';
  const pinyinSize = size === 'lg' ? '0.78rem' : '0.72rem';

  return (
    <div
      onMouseUp={onTextSelect}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        gap: '0.45rem 0.45rem',
        userSelect: 'text',
        cursor: 'text',
      }}
    >
      {units.map((unit, i) => (
        <span
          key={`${unit.hanzi}-${unit.pinyin}-${i}`}
          style={{
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-end',
            minWidth: size === 'lg' ? '2.25rem' : '1.95rem',
            borderRadius: 10,
            border: '1px solid rgba(148, 163, 184, 0.25)',
            background: 'rgba(15, 23, 42, 0.3)',
            padding: size === 'lg' ? '0.25rem 0.35rem 0.35rem' : '0.2rem 0.3rem 0.3rem',
          }}
        >
          <span
            style={{
              fontSize: pinyinSize,
              color: getToneColor(unit.pinyin),
              fontFamily: 'system-ui, -apple-system, sans-serif',
              letterSpacing: '0.01em',
              opacity: unit.pinyin ? 0.95 : 0.35,
              userSelect: 'none',
              lineHeight: 1.15,
              minHeight: '0.9rem',
              marginBottom: '0.12rem',
            }}
          >
            {unit.pinyin || '·'}
          </span>
          <span
            style={{
              fontSize: hanziSize,
              fontFamily: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
              lineHeight: 1.2,
              color: 'var(--sidebar-text)',
            }}
          >
            {unit.hanzi}
          </span>
        </span>
      ))}
    </div>
  );
}
