'use client';

import React, { useState } from 'react';
import {
  applyGeneratePartPatch,
  canSaveZhVoiceTask,
  clampTimeTargetSec,
  defaultTimeTargetSec,
  generateZhVoiceTaskPart,
  toZhVoiceTaskWritePayload,
  ZH_VOICE_TASK_MAX_SEC,
  ZH_VOICE_TASK_MIN_SEC,
  ZH_VOICE_TASK_V1_TYPES,
  zhVoiceTaskTypeLabel,
  type ZhHskLevel,
  type ZhVoiceTask,
  type ZhVoiceTaskGeneratePart,
  type ZhVoiceTaskType,
} from '@/lib/zh-voice-tasks';
import { HskLevelPicker } from '@/components/ui/HskLevelPicker';
import { ZhVoiceTaskBriefing } from '@/components/voice-tasks/ZhVoiceTaskBriefing';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.6rem 0.85rem',
  borderRadius: 10,
  border: '1px solid var(--sidebar-border)',
  background: 'var(--sidebar-bg)',
  color: 'var(--sidebar-text)',
  fontSize: '0.95rem',
  outline: 'none',
};

const btnPrimary: React.CSSProperties = {
  padding: '0.7rem 1.25rem',
  borderRadius: 12,
  border: 'none',
  background: 'rgba(79, 168, 134, 0.9)',
  color: '#fff',
  fontSize: '1rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '0.55rem 0.9rem',
  borderRadius: 10,
  border: '1px solid var(--sidebar-border)',
  background: 'transparent',
  color: 'var(--sidebar-text)',
  fontSize: '0.875rem',
  cursor: 'pointer',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontSize: '0.75rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  opacity: 0.7,
};

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: '1px solid var(--sidebar-border)',
        borderRadius: 14,
        padding: '0.9rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        background: 'var(--sidebar-hover)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.75 }}>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

type Props = {
  draft: ZhVoiceTask;
  onChange: (next: ZhVoiceTask) => void;
  onBack: () => void;
  onSave: (andPlay: boolean) => void;
  saving: boolean;
  saveError: string | null;
};

export function ZhVoiceTaskConstructor({ draft, onChange, onBack, onSave, saving, saveError }: Props) {
  const [showPreview, setShowPreview] = useState(true);
  const [regenPart, setRegenPart] = useState<ZhVoiceTaskGeneratePart | null>(null);
  const [regenError, setRegenError] = useState<string | null>(null);
  const canSave = canSaveZhVoiceTask(draft);
  const hsk = (draft.hsk_level || 2) as ZhHskLevel;

  const patch = (partial: Partial<ZhVoiceTask>) => onChange({ ...draft, ...partial });

  const handleType = (type: ZhVoiceTaskType) => {
    patch({
      type,
      stimulus_zh: type === 'retell' ? draft.stimulus_zh : null,
      stimulus_pinyin: type === 'retell' ? draft.stimulus_pinyin : null,
      stimulus_ru: type === 'retell' ? draft.stimulus_ru : null,
      scene_ru: null,
    });
  };

  const updateChecklist = (index: number, label_ru: string) => {
    const next = (draft.checklist || []).map((item, i) => (i === index ? { ...item, label_ru } : item));
    patch({ checklist: next });
  };

  const addChecklist = () => {
    const list = draft.checklist || [];
    if (list.length >= 4) return;
    patch({
      checklist: [...list, { id: `item-${Date.now()}`, label_ru: '' }],
    });
  };

  const removeChecklist = (index: number) => {
    const next = (draft.checklist || []).filter((_, i) => i !== index);
    if (next.length < 2) return;
    patch({ checklist: next });
  };

  const addVocab = () => {
    patch({
      vocabulary: [...(draft.vocabulary || []), { hanzi: '', pinyin: '', translation_ru: '' }],
    });
  };

  const updateVocab = (index: number, field: 'hanzi' | 'pinyin' | 'translation_ru', value: string) => {
    const next = (draft.vocabulary || []).map((v, i) => (i === index ? { ...v, [field]: value } : v));
    patch({ vocabulary: next });
  };

  const removeVocab = (index: number) => {
    patch({ vocabulary: (draft.vocabulary || []).filter((_, i) => i !== index) });
  };

  const handleRegenerate = async (part: ZhVoiceTaskGeneratePart) => {
    if (part === 'stimulus' && draft.type !== 'retell') return;
    setRegenPart(part);
    setRegenError(null);
    try {
      const result = await generateZhVoiceTaskPart({
        part,
        task: toZhVoiceTaskWritePayload({ ...draft, title: draft.title || 'Задание' }),
      });
      onChange(applyGeneratePartPatch(draft, part, result.patch));
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : 'Не удалось перегенерировать');
    } finally {
      setRegenPart(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, overflow: 'hidden' }}>
      <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--sidebar-border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={onBack} style={btnSecondary}>Назад</button>
        <button type="button" onClick={() => setShowPreview((v) => !v)} style={btnSecondary}>
          {showPreview ? 'Скрыть превью' : 'Превью брифинга'}
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" disabled={saving || !canSave} onClick={() => onSave(false)} style={{ ...btnSecondary, opacity: saving || !canSave ? 0.6 : 1 }}>
            {saving ? 'Сохраняем…' : 'Сохранить'}
          </button>
          <button type="button" disabled={saving || !canSave} onClick={() => onSave(true)} style={{ ...btnPrimary, opacity: saving || !canSave ? 0.7 : 1 }}>
            Сохранить и пройти
          </button>
        </div>
      </div>

      {!canSave && (
        <p style={{ margin: 0, padding: '0.65rem 1.25rem', fontSize: '0.8125rem', opacity: 0.75 }}>
          Чтобы сохранить: название, тип, HSK, инструкция и минимум два пункта чеклиста.
        </p>
      )}
      {saveError && (
        <p style={{ margin: 0, padding: '0.65rem 1.25rem', color: 'rgb(185, 28, 28)' }}>{saveError}</p>
      )}
      {regenError && (
        <p style={{ margin: 0, padding: '0.65rem 1.25rem', color: 'rgb(185, 28, 28)' }}>{regenError}</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: showPreview ? '1.1fr 0.9fr' : '1fr', minHeight: 0, flex: 1 }}>
        <div style={{ padding: '1rem 1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <Section title="Карточка">
            <label>
              <span style={labelStyle}>Название</span>
              <input value={draft.title} onChange={(e) => patch({ title: e.target.value })} style={inputStyle} />
            </label>
            <div>
              <span style={labelStyle}>Тип</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ZH_VOICE_TASK_V1_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleType(type)}
                    style={{ ...btnSecondary, background: draft.type === type ? 'var(--sidebar-active)' : 'transparent' }}
                  >
                    {zhVoiceTaskTypeLabel(type)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span style={labelStyle}>HSK</span>
              <HskLevelPicker
                value={hsk}
                onChange={(next) => patch({ hsk_level: next, time_target_sec: defaultTimeTargetSec(next) })}
              />
            </div>
            <label>
              <span style={labelStyle}>Ориентир, сек ({ZH_VOICE_TASK_MIN_SEC}–{ZH_VOICE_TASK_MAX_SEC})</span>
              <input
                type="number"
                min={ZH_VOICE_TASK_MIN_SEC}
                max={ZH_VOICE_TASK_MAX_SEC}
                value={draft.time_target_sec}
                onChange={(e) => patch({ time_target_sec: clampTimeTargetSec(e.target.value, hsk) })}
                style={inputStyle}
              />
            </label>
          </Section>

          <Section title="Задание">
            <label>
              <span style={labelStyle}>Ситуация</span>
              <textarea value={draft.situation_ru || ''} onChange={(e) => patch({ situation_ru: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </label>
            <label>
              <span style={labelStyle}>Что сказать</span>
              <textarea value={draft.instruction_ru} onChange={(e) => patch({ instruction_ru: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            </label>
          </Section>

          <Section
            title="Чеклист"
            action={
              <button type="button" disabled={regenPart === 'checklist'} onClick={() => handleRegenerate('checklist')} style={btnSecondary}>
                {regenPart === 'checklist' ? 'Генерация…' : 'Пересобрать'}
              </button>
            }
          >
            {(draft.checklist || []).map((item, i) => (
              <div key={item.id || i} style={{ display: 'flex', gap: 8 }}>
                <input value={item.label_ru} onChange={(e) => updateChecklist(i, e.target.value)} placeholder={`Пункт ${i + 1}`} style={inputStyle} />
                <button type="button" onClick={() => removeChecklist(i)} style={btnSecondary}>×</button>
              </div>
            ))}
            {(draft.checklist || []).length < 4 && (
              <button type="button" onClick={addChecklist} style={btnSecondary}>Добавить пункт</button>
            )}
          </Section>

          <Section
            title="Опорные слова"
            action={
              <button type="button" disabled={regenPart === 'vocabulary'} onClick={() => handleRegenerate('vocabulary')} style={btnSecondary}>
                {regenPart === 'vocabulary' ? 'Генерация…' : 'Пересобрать'}
              </button>
            }
          >
            {(draft.vocabulary || []).map((v, i) => (
              <div key={`${v.hanzi}-${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8 }}>
                <input value={v.hanzi} onChange={(e) => updateVocab(i, 'hanzi', e.target.value)} placeholder="汉字" style={inputStyle} />
                <input value={v.pinyin} onChange={(e) => updateVocab(i, 'pinyin', e.target.value)} placeholder="pinyin" style={inputStyle} />
                <input value={v.translation_ru} onChange={(e) => updateVocab(i, 'translation_ru', e.target.value)} placeholder="перевод" style={inputStyle} />
                <button type="button" onClick={() => removeVocab(i)} style={btnSecondary}>×</button>
              </div>
            ))}
            <button type="button" onClick={addVocab} style={btnSecondary}>Добавить слово</button>
          </Section>

          {draft.type === 'retell' && (
            <Section
              title="Стимул"
              action={
                <button type="button" disabled={regenPart === 'stimulus'} onClick={() => handleRegenerate('stimulus')} style={btnSecondary}>
                  {regenPart === 'stimulus' ? 'Генерация…' : 'Пересобрать'}
                </button>
              }
            >
              <textarea value={draft.stimulus_zh || ''} onChange={(e) => patch({ stimulus_zh: e.target.value })} rows={2} placeholder="中文" style={{ ...inputStyle, resize: 'vertical' }} />
              <input value={draft.stimulus_pinyin || ''} onChange={(e) => patch({ stimulus_pinyin: e.target.value })} placeholder="пиньинь" style={inputStyle} />
              <input value={draft.stimulus_ru || ''} onChange={(e) => patch({ stimulus_ru: e.target.value })} placeholder="перевод" style={inputStyle} />
            </Section>
          )}

          <Section
            title="Эталон (после проверки)"
            action={
              <button type="button" disabled={regenPart === 'model_answer'} onClick={() => handleRegenerate('model_answer')} style={btnSecondary}>
                {regenPart === 'model_answer' ? 'Генерация…' : 'Пересобрать'}
              </button>
            }
          >
            <textarea value={draft.model_answer_zh || ''} onChange={(e) => patch({ model_answer_zh: e.target.value })} rows={2} placeholder="中文" style={{ ...inputStyle, resize: 'vertical' }} />
            <input value={draft.model_answer_pinyin || ''} onChange={(e) => patch({ model_answer_pinyin: e.target.value })} placeholder="пиньинь" style={inputStyle} />
            <input value={draft.model_answer_ru || ''} onChange={(e) => patch({ model_answer_ru: e.target.value })} placeholder="перевод" style={inputStyle} />
          </Section>
        </div>

        {showPreview && (
          <div style={{ borderLeft: '1px solid var(--sidebar-border)', padding: '1rem 1.25rem', overflowY: 'auto' }}>
            <ZhVoiceTaskBriefing task={draft} variant="preview" />
          </div>
        )}
      </div>
    </div>
  );
}
