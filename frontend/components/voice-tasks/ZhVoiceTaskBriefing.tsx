'use client';

import React from 'react';
import {
  zhVoiceTaskTypeLabel,
  type ZhVoiceTask,
} from '@/lib/zh-voice-tasks';

const btnPrimary: React.CSSProperties = {
  padding: '0.75rem 1.5rem',
  borderRadius: 12,
  border: 'none',
  background: 'rgba(79, 168, 134, 0.9)',
  color: '#fff',
  fontSize: '1.0625rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '0.7rem 1.25rem',
  borderRadius: 12,
  border: '1px solid var(--sidebar-border)',
  background: 'transparent',
  color: 'var(--sidebar-text)',
  fontSize: '1rem',
  cursor: 'pointer',
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '0.85rem 1rem', borderRadius: 12, border: '1px solid var(--sidebar-border)', background: 'var(--sidebar-hover)' }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

type Props = {
  task: ZhVoiceTask;
  variant?: 'play' | 'preview';
  onBack?: () => void;
  onStart?: (task: ZhVoiceTask) => void;
};

export function ZhVoiceTaskBriefing({ task, variant = 'play', onBack, onStart }: Props) {
  const isPreview = variant === 'preview';
  const checklist = (task.checklist || []).filter((item) => item.label_ru?.trim());
  const vocab = (task.vocabulary || []).filter((v) => v.hanzi?.trim());
  const isRetell = task.type === 'retell';

  return (
    <div style={{ padding: isPreview ? '0.25rem 0' : '1.25rem 1.5rem', overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {!isPreview && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          <button type="button" onClick={onBack} style={btnSecondary}>
            Назад
          </button>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, opacity: 0.55, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Перед записью
          </span>
        </div>
      )}

      <div>
        <h2 style={{ margin: 0, fontSize: isPreview ? '1.1rem' : '1.35rem', fontWeight: 700, color: 'var(--sidebar-text)' }}>
          {task.title || 'Без названия'}
        </h2>
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 6, background: 'var(--sidebar-active)' }}>
            {zhVoiceTaskTypeLabel(task.type)}
          </span>
          {task.hsk_level && (
            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 6, background: 'var(--sidebar-active)' }}>
              HSK {task.hsk_level}
            </span>
          )}
          <span style={{ fontSize: '0.8125rem', opacity: 0.75 }}>
            ориентир {task.time_target_sec} сек
          </span>
        </div>
      </div>

      {task.situation_ru?.trim() && (
        <Card title="Ситуация">
          <div>{task.situation_ru}</div>
        </Card>
      )}

      {task.instruction_ru?.trim() && (
        <Card title="Что сказать">
          <div>{task.instruction_ru}</div>
        </Card>
      )}

      {isRetell && task.stimulus_zh?.trim() && (
        <Card title="Сначала послушай">
          <div style={{ fontSize: '1.05rem', marginBottom: 6 }}>{task.stimulus_zh}</div>
          {task.stimulus_pinyin && (
            <div style={{ fontSize: '0.9rem', opacity: 0.75 }}>{task.stimulus_pinyin}</div>
          )}
          {task.stimulus_ru && (
            <div style={{ fontSize: '0.9rem', opacity: 0.8, marginTop: 6 }}>{task.stimulus_ru}</div>
          )}
        </Card>
      )}

      {checklist.length > 0 && (
        <Card title="Чеклист">
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {checklist.map((item) => (
              <li key={item.id} style={{ marginBottom: 4 }}>{item.label_ru}</li>
            ))}
          </ul>
        </Card>
      )}

      {vocab.length > 0 && (
        <Card title="Опорные слова">
          {vocab.map((v) => (
            <div key={v.hanzi} style={{ fontSize: '0.9375rem' }}>
              <strong>{v.hanzi}</strong>
              <span style={{ opacity: 0.7 }}> {v.pinyin}</span>
              <span style={{ opacity: 0.85 }}> — {v.translation_ru}</span>
            </div>
          ))}
        </Card>
      )}

      <p style={{ margin: 0, fontSize: '0.8125rem', opacity: 0.65, lineHeight: 1.4 }}>
        Один дубль, без диалога. Эталон покажем после проверки — не подглядывай заранее.
      </p>

      {!isPreview && onStart && (
        <button type="button" onClick={() => onStart(task)} style={btnPrimary}>
          Начать минутку
        </button>
      )}
    </div>
  );
}
