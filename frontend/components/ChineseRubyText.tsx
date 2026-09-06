'use client';

import React from 'react';
import { CHINESE_FONT, getToneColor, normalizePinyinSyllables } from '@/lib/chinese-display';

export type ChineseSegment = { hanzi: string; pinyin: string };

export type StructuredChineseResult = {
  segments: ChineseSegment[];
  translation?: string;
};

function decodeJsonLikeString(value: string): string {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t');
  }
}

/** True if text looks like model JSON / code dump — must never be shown to user. */
export function looksLikeStructuredJson(raw: string): boolean {
  const text = (raw || '').trim();
  if (!text) return false;
  if (/```/.test(text)) return true;
  if (/^\s*[{[]/.test(text)) return true;
  if (/[{[]/.test(text) && /("|')?(segments|translation|hanzi|pinyin)("|')?\s*:/.test(text)) {
    return true;
  }
  if (/"hanzi"\s*:|"pinyin"\s*:|"segments"\s*:/.test(text)) return true;
  return false;
}

export function sanitizeDisplayText(raw: string | null | undefined): string {
  const value = (raw || '').trim();
  if (!value) return '';
  if (looksLikeStructuredJson(value)) return '';
  return value;
}

function extractQuotedField(raw: string, field: string): string {
  const re = new RegExp(`["']${field}["']\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`);
  const match = raw.match(re);
  return match?.[1] ? decodeJsonLikeString(match[1]).trim() : '';
}

function extractSegmentsFallback(raw: string): ChineseSegment[] {
  const segments: ChineseSegment[] = [];
  const re =
    /\{\s*["']hanzi["']\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*["']pinyin["']\s*:\s*"((?:\\.|[^"\\])*)"\s*\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const hanzi = decodeJsonLikeString(match[1] || '');
    if (!hanzi.replace(/\s+/g, '') || looksLikeStructuredJson(hanzi)) continue;
    segments.push({
      hanzi,
      pinyin: decodeJsonLikeString(match[2] || '').trim(),
    });
  }

  if (segments.length > 0) return segments;

  const looseHanzi = [...raw.matchAll(/["']hanzi["']\s*:\s*"((?:\\.|[^"\\])*)"/g)];
  const loosePinyin = [...raw.matchAll(/["']pinyin["']\s*:\s*"((?:\\.|[^"\\])*)"/g)].map((m) =>
    decodeJsonLikeString(m[1] || '').trim(),
  );
  let i = 0;
  for (const m of looseHanzi) {
    const hanzi = decodeJsonLikeString(m[1] || '');
    if (!hanzi.replace(/\s+/g, '') || looksLikeStructuredJson(hanzi)) continue;
    segments.push({ hanzi, pinyin: loosePinyin[i] || '' });
    i += 1;
  }
  return segments;
}

function parseDelimiterFormat(raw: string): StructuredChineseResult | null {
  const text = raw.replace(/\r\n/g, '\n').trim();
  if (!/TRANSLATION:|PINYIN:|SEGMENTS:/i.test(text)) return null;

  let translation = '';
  const translationMatch = text.match(
    /TRANSLATION:\s*([\s\S]*?)(?=\n\s*(?:PINYIN:|SEGMENTS:|END:)|$)/i,
  );
  if (translationMatch) {
    translation = translationMatch[1].trim();
  }

  const segments: ChineseSegment[] = [];
  const pinyinBlockMatch = text.match(
    /(?:PINYIN|SEGMENTS):\s*([\s\S]*?)(?=\n\s*END:|$)/i,
  );
  const block = (pinyinBlockMatch?.[1] || '').trim();
  if (block) {
    for (const line of block.split('\n')) {
      const cleaned = line.trim();
      if (!cleaned || /^END:?$/i.test(cleaned)) continue;
      // Formats: 你好 = nǐ hǎo   OR   你好|nǐ hǎo   OR   你好\tnǐ hǎo
      const parts = cleaned.split(/\s*=\s*|\s*\|\s*|\t+/);
      const hanzi = (parts[0] || '').trim();
      const pinyin = (parts.slice(1).join(' ').trim()) || '';
      if (!hanzi || looksLikeStructuredJson(hanzi)) continue;
      segments.push({ hanzi, pinyin });
    }
  }

  translation = sanitizeDisplayText(translation);
  if (!translation && segments.length === 0) return null;

  return { translation, segments };
}

function normalizeSegmentList(items: any[]): ChineseSegment[] {
  return items
    .map((s) => ({
      hanzi: typeof s?.hanzi === 'string' ? String(s.hanzi) : '',
      pinyin: typeof s?.pinyin === 'string' ? String(s.pinyin) : '',
    }))
    .filter((s) => {
      const hanzi = (s.hanzi || '').replace(/\s+/g, '');
      return Boolean(hanzi) && !looksLikeStructuredJson(s.hanzi);
    });
}

/** Best-effort parse for truncated model JSON (common when segments precede translation). */
function tryParsePossiblyTruncatedJson(jsonText: string): any | null {
  const attempts: string[] = [];
  const end = jsonText.lastIndexOf('}');
  if (end !== -1) attempts.push(jsonText.slice(0, end + 1));
  attempts.push(jsonText);

  for (const original of attempts) {
    let candidate = original.trim();
    // Drop trailing incomplete object / field after the last complete element.
    candidate = candidate.replace(/,\s*\{[\s\S]*$/, '');
    candidate = candidate.replace(/,\s*"[^"]*$/, '');
    candidate = candidate.replace(/,\s*$/, '');

    const stack: string[] = [];
    let inString = false;
    let escape = false;
    for (const ch of candidate) {
      if (inString) {
        if (escape) escape = false;
        else if (ch === '\\') escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{' || ch === '[') stack.push(ch);
      else if ((ch === '}' || ch === ']') && stack.length) stack.pop();
    }
    if (inString) candidate += '"';
    while (stack.length) {
      const open = stack.pop();
      candidate += open === '{' ? '}' : ']';
    }

    try {
      return JSON.parse(candidate);
    } catch {
      /* try next */
    }
  }
  return null;
}

function parseJsonFormat(raw: string): StructuredChineseResult | null {
  try {
    let jsonText = (raw || '').trim();
    if (!jsonText) return null;

    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (jsonMatch) jsonText = jsonMatch[1].trim();

    const start = jsonText.indexOf('{');
    if (start === -1) return null;
    jsonText = jsonText.slice(start);

    const parsed = tryParsePossiblyTruncatedJson(jsonText);

    let segments: ChineseSegment[] = [];
    let translation = '';

    if (parsed && typeof parsed === 'object') {
      translation = typeof parsed.translation === 'string' ? parsed.translation.trim() : '';
      if (Array.isArray(parsed.segments)) {
        segments = normalizeSegmentList(parsed.segments);
      }
    }

    if (!translation) {
      translation = extractQuotedField(jsonText, 'translation');
    }
    if (segments.length === 0) {
      segments = extractSegmentsFallback(jsonText);
    }

    translation = sanitizeDisplayText(translation);
    if (segments.length === 0 && !translation) return null;

    return { segments, translation };
  } catch {
    return null;
  }
}

const PINYIN_MARKER = '««PINYIN»»';
const TRANSLATION_MARKER = '««TRANSLATION»»';
const NEXT_META_MARKER_RE = /««[A-Z]+»»/;

function extractMarkedValue(raw: string, marker: string): string | null {
  const idx = raw.indexOf(marker);
  if (idx === -1) return null;
  const after = raw.slice(idx + marker.length);
  const next = after.search(NEXT_META_MARKER_RE);
  const value = (next === -1 ? after : after.slice(0, next)).trim();
  return value || null;
}

function firstMetadataIndex(raw: string): number {
  const indices = [raw.indexOf(PINYIN_MARKER), raw.indexOf(TRANSLATION_MARKER)].filter((i) => i !== -1);
  return indices.length ? Math.min(...indices) : -1;
}

function normalizePinyinItem(item: any): ChineseSegment | null {
  if (!item || typeof item !== 'object') return null;
  const hanzi = typeof item.h === 'string' ? item.h : typeof item.hanzi === 'string' ? item.hanzi : '';
  const pinyin = typeof item.p === 'string' ? item.p : typeof item.pinyin === 'string' ? item.pinyin : '';
  if (!hanzi.trim() || looksLikeStructuredJson(hanzi)) return null;
  return { hanzi, pinyin };
}

function parsePinyinJsonBlock(raw: string): ChineseSegment[] {
  const start = raw.indexOf('[');
  if (start === -1) return [];

  const jsonText = raw.slice(start).trim();
  const attempts = [jsonText];
  const end = jsonText.lastIndexOf(']');
  if (end !== -1) attempts.unshift(jsonText.slice(0, end + 1));

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (!Array.isArray(parsed)) continue;
      const segments = parsed.map(normalizePinyinItem).filter((s): s is ChineseSegment => Boolean(s));
      if (segments.length > 0) return segments;
    } catch {
      /* try next */
    }
  }

  const recovered = tryParsePossiblyTruncatedJson(jsonText);
  if (Array.isArray(recovered)) {
    return recovered.map(normalizePinyinItem).filter((s): s is ChineseSegment => Boolean(s));
  }
  if (recovered && Array.isArray(recovered.segments)) {
    return normalizeSegmentList(recovered.segments);
  }
  return extractSegmentsFallback(raw);
}

/** Парсит ««PINYIN»» / ««TRANSLATION»» независимо от порядка маркеров. */
function parsePinyinMarkerFormat(raw: string): StructuredChineseResult | null {
  if (!raw.includes(PINYIN_MARKER) && !raw.includes(TRANSLATION_MARKER)) return null;

  const pinyinBlock = extractMarkedValue(raw, PINYIN_MARKER);
  const translation = sanitizeDisplayText(extractMarkedValue(raw, TRANSLATION_MARKER) || '');
  const segments = pinyinBlock ? parsePinyinJsonBlock(pinyinBlock) : [];

  if (segments.length === 0 && !translation) return null;
  return { segments, translation };
}

export function parseStructuredChineseResponse(raw: string): StructuredChineseResult | null {
  const text = (raw || '').trim();
  if (!text) return null;

  // Сначала пробуем новый формат ««PINYIN»»
  const fromMarker = parsePinyinMarkerFormat(text);
  if (fromMarker) return fromMarker;

  const fromDelimiter = parseDelimiterFormat(text);
  if (fromDelimiter) return fromDelimiter;

  return parseJsonFormat(text);
}

/**
 * Извлекает чистый текст без метаданных пиньинь и перевода.
 */
export function extractCleanChineseText(raw: string): string {
  let text = raw || '';

  const metaIdx = firstMetadataIndex(text);
  if (metaIdx !== -1) {
    text = text.slice(0, metaIdx);
  }

  const pinyinStart = text.indexOf('PINYIN:');
  if (pinyinStart !== -1) {
    const endIdx = text.indexOf('END:', pinyinStart);
    if (endIdx !== -1) {
      const after = text.slice(endIdx + 4).trim();
      return after || text.slice(0, pinyinStart).trim();
    }
    text = text.slice(0, pinyinStart);
  }

  return text.trim();
}

/**
 * Извлекает перевод из ответа ИИ — только блок TRANSLATION, без пиньинь.
 */
export function extractTranslation(raw: string): string | null {
  const value = extractMarkedValue(raw || '', TRANSLATION_MARKER);
  const translation = sanitizeDisplayText(value || '');
  return translation || null;
}

/** Текст для озвучки: только китайская реплика, без перевода и метаданных. */
export function extractSpeakableChineseText(raw: string): string {
  return extractCleanChineseText(raw)
    .split('\n')
    .filter((line) => !/^\s*✏️/.test(line) && !/^\s*Исправление\s*:/i.test(line))
    .join('\n')
    .trim();
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

function expandSegments(segments: ChineseSegment[]): SegmentUnit[] {
  const units: SegmentUnit[] = [];

  segments.forEach((seg) => {
    const hanzi = (seg.hanzi || '').trim();
    const pinyin = (seg.pinyin || '').trim();
    if (!hanzi || looksLikeStructuredJson(hanzi)) return;

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

export function ChineseRubyText({ segments, size = 'md', onTextSelect }: ChineseRubyTextProps) {
  const units = expandSegments(segments);
  const hanziSize = size === 'lg' ? '1.75rem' : '1.375rem';
  const pinyinSize = size === 'lg' ? '0.78rem' : '0.72rem';

  if (units.length === 0) return null;

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
              fontFamily: CHINESE_FONT,
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
