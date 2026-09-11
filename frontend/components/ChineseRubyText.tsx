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

const HANZI_CHAR_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;

const PROMPT_LEAK_RE =
  /(?:let'?s go\s*[:：]|let us go\s*[:：]|your task\s*:|the above is context|now generate the response|dialogue checkpoints|learner'?s last message|progress:\s*all checkpoints|that is for the character|keep it hsk|use model vocabulary)/i;

const INSTRUCTION_LINE_RE =
  /^(?:character|personality|situation|place|goals? of this scene|learner'?s role|your task|progress|do not|do:|that is for|the above is context|now generate|spoken character|hsk level|must-say|model vocabulary|grammar focus|output format)\s*:/i;

function looksLikePromptLeak(text: string): boolean {
  if (PROMPT_LEAK_RE.test(text)) return true;
  const firstHanzi = text.search(HANZI_CHAR_RE);
  if (firstHanzi < 0) return false;
  const prefix = text.slice(0, firstHanzi);
  if (firstHanzi > 40 && /[A-Za-z]{12,}/.test(prefix)) return true;
  return /(?:character|personality|situation|goals of this scene|learner'?s role)\s*:/i.test(prefix);
}

function isSpokenChineseLine(line: string): boolean {
  let s = line.trim();
  if (!s) return false;
  s = s.replace(/^(?:let'?s go|let us go)\s*[:：]\s*/i, '');
  if (!s) return false;
  if (/^\s*✏️/.test(line) || /^\s*Исправление\s*:/i.test(line)) return true;
  if (!HANZI_CHAR_RE.test(s)) return false;
  if (INSTRUCTION_LINE_RE.test(s)) return false;
  if (/Learner (?:said|asked)\s*:/i.test(s)) return false;
  if (/learner'?s last message/i.test(s)) return false;
  if (/^\d+\.\s*\[X\]/i.test(s)) return false;
  const latin = (s.match(/[A-Za-z]/g) || []).length;
  const cyrillic = (s.match(/[\u0400-\u04FF]/g) || []).length;
  const hanzi = (s.match(HANZI_CHAR_RE) || []).length;
  if (latin + cyrillic > 24 && latin + cyrillic > hanzi) return false;
  return true;
}

/** Если модель сначала пересказала промпт, оставляем хвост с настоящей репликой. */
function isolateAssistantPayload(raw: string): string {
  const t = (raw || '').replace(/\r\n/g, '\n');
  if (!t.trim()) return t;

  const letsGo = [...t.matchAll(/(?:let'?s go|let us go)\s*[:：]\s*/gi)];
  if (letsGo.length) {
    const last = letsGo[letsGo.length - 1];
    return t.slice((last.index || 0) + last[0].length);
  }

  if (!looksLikePromptLeak(t)) return t;

  const lines = t.split('\n');
  let blockStart = -1;
  let prevSpoken = -2;
  for (let i = 0; i < lines.length; i++) {
    if (!isSpokenChineseLine(lines[i])) continue;
    if (i !== prevSpoken + 1) blockStart = i;
    prevSpoken = i;
  }
  if (blockStart === -1) return t;
  return lines.slice(blockStart).join('\n');
}

function splitSpokenAndMetadata(raw: string): { spoken: string; metadata: string } {
  let spoken = (raw || '').replace(/\r\n/g, '\n');
  let metadata = '';

  const metaIdx = firstMetadataIndex(spoken);
  if (metaIdx !== -1) {
    metadata = spoken.slice(metaIdx).trim();
    spoken = spoken.slice(0, metaIdx);
  }

  const pinyinStart = spoken.indexOf('PINYIN:');
  if (pinyinStart !== -1) {
    const endIdx = spoken.indexOf('END:', pinyinStart);
    if (endIdx !== -1) {
      const after = spoken.slice(endIdx + 4).trim();
      const block = spoken.slice(pinyinStart, endIdx + 4).trim();
      spoken = after || spoken.slice(0, pinyinStart);
      if (!metadata) metadata = block;
    } else {
      if (!metadata) metadata = spoken.slice(pinyinStart).trim();
      spoken = spoken.slice(0, pinyinStart);
    }
  }

  return { spoken, metadata };
}

function spokenLinesOnly(spoken: string): string {
  const kept = spoken
    .split('\n')
    .map((line) => line.replace(/^(?:let'?s go|let us go)\s*[:：]\s*/i, '').trim())
    .filter(isSpokenChineseLine);
  return (kept.length ? kept.join('\n') : spoken).trim();
}

/**
 * Для сохранения ответа ассистента: китайская реплика + metadata, без dump промпта.
 */
export function sanitizeChineseAssistantReply(raw: string): string {
  const original = (raw || '').replace(/\r\n/g, '\n');
  if (!original.trim()) return original.trim();

  const payload = isolateAssistantPayload(original);
  const { spoken, metadata } = splitSpokenAndMetadata(payload);
  const leaked = looksLikePromptLeak(original) || looksLikePromptLeak(payload);
  const cleanSpoken = (leaked ? spokenLinesOnly(spoken) : spoken.trim());
  if (!cleanSpoken) {
    return leaked ? '' : original.trim();
  }
  return metadata ? `${cleanSpoken}\n${metadata}` : cleanSpoken;
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
  const text = isolateAssistantPayload(raw || '').trim();
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
 * Служебный dump промпта (Character / checkpoints / Let's go) тоже отрезается.
 */
export function extractCleanChineseText(raw: string): string {
  const payload = isolateAssistantPayload(raw || '');
  const { spoken } = splitSpokenAndMetadata(payload);
  const leaked = looksLikePromptLeak(raw || '') || looksLikePromptLeak(payload);
  return (leaked ? spokenLinesOnly(spoken) : spoken.trim());
}

/**
 * Извлекает перевод из ответа ИИ — только блок TRANSLATION, без пиньинь.
 */
export function extractTranslation(raw: string): string | null {
  const value = extractMarkedValue(isolateAssistantPayload(raw || ''), TRANSLATION_MARKER);
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
  onWordClick?: (segment: ChineseSegment) => void;
  savedWords?: ReadonlySet<string>;
  savingWord?: string | null;
};

type SegmentUnit = {
  hanzi: string;
  pinyin: string;
  wordHanzi: string;
  wordPinyin: string;
  clickable: boolean;
};

const HANZI_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;

function wordKey(hanzi: string): string {
  return Array.from(hanzi || '')
    .filter((ch) => HANZI_RE.test(ch))
    .join('');
}

function expandSegments(segments: ChineseSegment[]): SegmentUnit[] {
  const units: SegmentUnit[] = [];

  segments.forEach((seg) => {
    const hanzi = (seg.hanzi || '').trim();
    const pinyin = (seg.pinyin || '').trim();
    if (!hanzi || looksLikeStructuredJson(hanzi)) return;

    const key = wordKey(hanzi);
    const clickable = Boolean(key);
    const chars = Array.from(hanzi);
    const syllables = normalizePinyinSyllables(pinyin);

    if (chars.length > 1 && syllables.length === chars.length) {
      chars.forEach((char, index) => {
        units.push({
          hanzi: char,
          pinyin: syllables[index] || '',
          wordHanzi: hanzi,
          wordPinyin: pinyin,
          clickable: clickable && HANZI_RE.test(char),
        });
      });
      return;
    }

    units.push({ hanzi, pinyin, wordHanzi: hanzi, wordPinyin: pinyin, clickable });
  });

  return units;
}

export function ChineseRubyText({
  segments,
  size = 'md',
  onTextSelect,
  onWordClick,
  savedWords,
  savingWord,
}: ChineseRubyTextProps) {
  const units = expandSegments(segments);
  const hanziSize = size === 'lg' ? '1.75rem' : '1.375rem';
  const pinyinSize = size === 'lg' ? '0.78rem' : '0.72rem';
  const [hoveredWord, setHoveredWord] = React.useState<string | null>(null);

  if (units.length === 0) return null;

  const interactive = Boolean(onWordClick);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <div
        onMouseUp={onTextSelect}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          gap: '0.45rem 0.45rem',
          userSelect: interactive ? 'none' : 'text',
          cursor: interactive ? 'default' : 'text',
        }}
      >
        {units.map((unit, i) => {
          const key = wordKey(unit.wordHanzi);
          const isHovered = interactive && unit.clickable && hoveredWord === key;
          const isSaved = Boolean(key && savedWords?.has(key));
          const isSaving = Boolean(key && savingWord === key);
          const canClick = interactive && unit.clickable && !isSaving;

          return (
            <span
              key={`${unit.wordHanzi}-${unit.hanzi}-${unit.pinyin}-${i}`}
              role={canClick ? 'button' : undefined}
              tabIndex={canClick ? 0 : undefined}
              title={canClick ? `Сохранить «${key}» в словарь` : undefined}
              onMouseEnter={() => {
                if (unit.clickable && interactive) setHoveredWord(key);
              }}
              onMouseLeave={() => {
                if (hoveredWord === key) setHoveredWord(null);
              }}
              onClick={() => {
                if (!canClick || !onWordClick) return;
                onWordClick({ hanzi: unit.wordHanzi, pinyin: unit.wordPinyin });
              }}
              onKeyDown={(e) => {
                if (!canClick || !onWordClick) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onWordClick({ hanzi: unit.wordHanzi, pinyin: unit.wordPinyin });
                }
              }}
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                minWidth: size === 'lg' ? '2.25rem' : '1.95rem',
                borderRadius: 10,
                border: isSaved
                  ? '1px solid rgba(34, 197, 94, 0.55)'
                  : isHovered
                    ? '1px solid rgba(99, 102, 241, 0.55)'
                    : '1px solid rgba(148, 163, 184, 0.25)',
                background: isSaved
                  ? 'rgba(34, 197, 94, 0.14)'
                  : isHovered
                    ? 'rgba(99, 102, 241, 0.16)'
                    : 'rgba(15, 23, 42, 0.3)',
                padding: size === 'lg' ? '0.25rem 0.35rem 0.35rem' : '0.2rem 0.3rem 0.3rem',
                cursor: canClick ? 'pointer' : interactive ? 'default' : 'text',
                opacity: isSaving ? 0.65 : 1,
                transition: 'border-color 0.15s ease, background 0.15s ease, transform 0.15s ease',
                transform: isHovered ? 'translateY(-1px)' : 'none',
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
          );
        })}
      </div>
      {interactive && (
        <p style={{ margin: 0, fontSize: '0.6875rem', opacity: 0.5, lineHeight: 1.35 }}>
          Нажмите на слово — сразу в словарь
        </p>
      )}
    </div>
  );
}
