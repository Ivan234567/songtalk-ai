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
      .filter((s: ChineseSegment) => s?.hanzi && s?.pinyin)
      .map((s: ChineseSegment) => ({ hanzi: String(s.hanzi), pinyin: String(s.pinyin) }));
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

export function ChineseRubyText({ segments, size = 'md', onTextSelect }: ChineseRubyTextProps) {
  const hanziSize = size === 'lg' ? '1.75rem' : '1.375rem';
  const pinyinSize = size === 'lg' ? '0.8125rem' : '0.75rem';

  return (
    <div
      onMouseUp={onTextSelect}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        gap: '0.25rem 0.35rem',
        userSelect: 'text',
        cursor: 'text',
      }}
    >
      {segments.map((seg, i) => (
        <ruby
          key={`${seg.hanzi}-${i}`}
          style={{
            rubyAlign: 'center',
            fontSize: hanziSize,
            fontFamily: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
            lineHeight: 1.3,
          }}
        >
          {seg.hanzi}
          <rt
            style={{
              fontSize: pinyinSize,
              color: 'var(--sidebar-text)',
              opacity: 0.7,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              letterSpacing: '0.01em',
            }}
          >
            {seg.pinyin}
          </rt>
        </ruby>
      ))}
    </div>
  );
}
