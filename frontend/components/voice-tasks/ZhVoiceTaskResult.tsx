'use client';

import React from 'react';
import {
  zhChecklistStatusLabel,
  zhVoiceTaskTypeLabel,
  zhVoiceTaskVerdictLabel,
  type ZhChecklistItemStatus,
  type ZhVoiceTask,
  type ZhVoiceTaskEvaluateResult,
  type ZhVoiceTaskVerdict,
} from '@/lib/zh-voice-tasks';

const btnPrimary: React.CSSProperties = {
  padding: '0.75rem 1.35rem',
  borderRadius: 12,
  border: 'none',
  background: 'rgba(79, 168, 134, 0.9)',
  color: '#fff',
  fontSize: '1rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '0.7rem 1.2rem',
  borderRadius: 12,
  border: '1px solid var(--sidebar-border)',
  background: 'transparent',
  color: 'var(--sidebar-text)',
  fontSize: '0.9375rem',
  cursor: 'pointer',
};

function verdictColor(verdict: ZhVoiceTaskVerdict): string {
  if (verdict === 'done') return 'rgba(34, 197, 94, 0.95)';
  if (verdict === 'almost') return 'rgba(245, 158, 11, 0.95)';
  return 'rgba(239, 68, 68, 0.9)';
}

function statusTint(status: ZhChecklistItemStatus): { border: string; background: string } {
  if (status === 'done') {
    return { border: '1px solid rgba(34, 197, 94, 0.35)', background: 'rgba(34, 197, 94, 0.08)' };
  }
  if (status === 'almost') {
    return { border: '1px solid rgba(245, 158, 11, 0.35)', background: 'rgba(245, 158, 11, 0.08)' };
  }
  return { border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.08)' };
}

type Props = {
  task: ZhVoiceTask;
  result: ZhVoiceTaskEvaluateResult;
  showPinyin: boolean;
  showTranslation: boolean;
  onPlayModel: () => void;
  onPlayNextTry: () => void;
  onRetry: () => void;
  onList: () => void;
};

export function ZhVoiceTaskResult({
  task,
  result,
  showPinyin,
  showTranslation,
  onPlayModel,
  onPlayNextTry,
  onRetry,
  onList,
}: Props) {
  const checklist = (task.checklist || [])
    .filter((item) => item.label_ru?.trim())
    .map((item) => {
      const hit = result.checklist.find((row) => row.id === item.id);
      return {
        id: item.id,
        label_ru: item.label_ru,
        status: (hit?.status || 'missed') as ZhChecklistItemStatus,
        note_ru: hit?.note_ru || '',
      };
    });

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 520,
        maxHeight: 'min(78vh, 760px)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
        textAlign: 'left',
        padding: '0.25rem 0.15rem 0.5rem',
      }}
    >
      <div>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.55, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
          {zhVoiceTaskTypeLabel(task.type)}
          {task.hsk_level ? ` · HSK ${task.hsk_level}` : ''}
        </div>
        <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700 }}>{task.title}</h2>
        <p
          style={{
            margin: '0.65rem 0 0',
            fontSize: '1.5rem',
            fontWeight: 800,
            color: verdictColor(result.verdict),
          }}
        >
          {zhVoiceTaskVerdictLabel(result.verdict)}
        </p>
      </div>

      {checklist.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {checklist.map((item) => {
            const tint = statusTint(item.status);
            return (
              <div key={item.id} style={{ padding: '0.7rem 0.85rem', borderRadius: 12, ...tint }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{item.label_ru}</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: verdictColor(item.status) }}>
                    {zhChecklistStatusLabel(item.status)}
                  </span>
                </div>
                {item.note_ru ? (
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.8125rem', lineHeight: 1.4, opacity: 0.85 }}>
                    {item.note_ru}
                  </p>
                ) : null}
              </div>
            );
          })}
        </section>
      )}

      {result.strength_ru?.trim() && (
        <section
          style={{
            padding: '0.75rem 0.9rem',
            borderRadius: 12,
            border: '1px solid var(--sidebar-border)',
            background: 'var(--sidebar-hover)',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.55, marginBottom: 6 }}>
            Что получилось
          </div>
          <p style={{ margin: 0, fontSize: '0.9375rem', lineHeight: 1.45 }}>{result.strength_ru}</p>
        </section>
      )}

      {(result.next_try_zh?.trim() || result.next_try_ru?.trim()) && (
        <section
          style={{
            padding: '0.75rem 0.9rem',
            borderRadius: 12,
            border: '1px solid var(--sidebar-border)',
            background: 'var(--sidebar-bg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.55 }}>
              В следующий раз
            </div>
            {result.next_try_zh?.trim() && (
              <button type="button" onClick={onPlayNextTry} style={{ ...btnSecondary, padding: '0.3rem 0.65rem', fontSize: '0.75rem', fontWeight: 600 }}>
                Прослушать
              </button>
            )}
          </div>
          {result.next_try_zh?.trim() && (
            <p style={{ margin: 0, fontSize: '1.05rem', lineHeight: 1.45 }}>{result.next_try_zh}</p>
          )}
          {showPinyin && result.next_try_pinyin?.trim() && (
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.8125rem', opacity: 0.7 }}>{result.next_try_pinyin}</p>
          )}
          {showTranslation && result.next_try_ru?.trim() && (
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.875rem', opacity: 0.85, fontStyle: 'italic' }}>{result.next_try_ru}</p>
          )}
        </section>
      )}

      {(result.model_answer_zh?.trim() || task.model_answer_zh?.trim()) && (
        <section
          style={{
            padding: '0.75rem 0.9rem',
            borderRadius: 12,
            border: '1px solid rgba(99, 102, 241, 0.3)',
            background: 'rgba(99, 102, 241, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.7 }}>
              Эталон
            </div>
            <button type="button" onClick={onPlayModel} style={{ ...btnSecondary, padding: '0.3rem 0.65rem', fontSize: '0.75rem', fontWeight: 600 }}>
              Прослушать
            </button>
          </div>
          <p style={{ margin: 0, fontSize: '1.1rem', lineHeight: 1.45, fontWeight: 600 }}>
            {result.model_answer_zh || task.model_answer_zh}
          </p>
          {showPinyin && (result.model_answer_pinyin || task.model_answer_pinyin) && (
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.8125rem', opacity: 0.75 }}>
              {result.model_answer_pinyin || task.model_answer_pinyin}
            </p>
          )}
          {showTranslation && (result.model_answer_ru || task.model_answer_ru) && (
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.875rem', opacity: 0.9, fontStyle: 'italic' }}>
              {result.model_answer_ru || task.model_answer_ru}
            </p>
          )}
        </section>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', marginTop: 4 }}>
        <button type="button" onClick={onRetry} style={btnPrimary}>
          Ещё одну
        </button>
        <button type="button" onClick={onList} style={btnSecondary}>
          К списку
        </button>
      </div>
    </div>
  );
}
