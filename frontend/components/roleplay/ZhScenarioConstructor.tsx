'use client';

import React, { useState } from 'react';
import {
  applyGeneratePartPatch,
  canSaveZhScenario,
  generateZhScenarioPart,
  toZhWritePayload,
  ZH_AI_PERSONALITIES,
  ZH_GRAMMAR_CHIPS,
  type ZhFormality,
  type ZhGeneratePart,
  type ZhHskLevel,
  type ZhScenario,
  type ZhScenarioStep,
  type ZhSlangMode,
  type ZhStarter,
  type ZhVocabUsage,
} from '@/lib/zh-scenarios';
import { LevelDropdown } from '@/components/ui/LevelDropdown';
import { ZhScenarioBriefing } from '@/components/roleplay/ZhScenarioBriefing';

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

type Props = {
  draft: ZhScenario;
  onChange: (next: ZhScenario) => void;
  onBack: () => void;
  onSave: (andPlay: boolean) => void;
  saving: boolean;
  saveError: string | null;
  onAddToDictionary?: () => void;
  vocabBusy?: boolean;
  vocabMessage?: string | null;
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

export function ZhScenarioConstructor({
  draft,
  onChange,
  onBack,
  onSave,
  saving,
  saveError,
  onAddToDictionary,
  vocabBusy,
  vocabMessage,
}: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [advanced, setAdvanced] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [regenPart, setRegenPart] = useState<ZhGeneratePart | null>(null);
  const [regenError, setRegenError] = useState<string | null>(null);
  const steps = draft.steps?.length ? draft.steps : [];
  const safeIndex = steps.length ? Math.min(stepIndex, steps.length - 1) : 0;
  const selected = steps[safeIndex];
  const canSave = canSaveZhScenario(draft);

  const patch = (partial: Partial<ZhScenario>) => onChange({ ...draft, ...partial });

  const updateStep = (index: number, partial: Partial<ZhScenarioStep>) => {
    const next = steps.map((s, i) => (i === index ? { ...s, ...partial } : s));
    patch({ steps: next });
  };

  const addStep = () => {
    const next = [
      ...steps,
      {
        id: `step-${Date.now()}`,
        order: steps.length + 1,
        title_ru: '',
        expected_user_action: '',
        keywords: [] as string[],
      },
    ];
    patch({ steps: next });
    setStepIndex(next.length - 1);
  };

  const removeStep = (index: number) => {
    const next = steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 }));
    patch({ steps: next.length ? next : steps });
    setStepIndex((i) => Math.max(0, Math.min(i, next.length - 1)));
  };

  const addVocab = () => {
    patch({
      vocabulary: [...(draft.vocabulary || []), { hanzi: '', pinyin: '', translation_ru: '', usage: 'must_say' }],
    });
  };

  const updateVocab = (
    index: number,
    field: 'hanzi' | 'pinyin' | 'translation_ru' | 'usage',
    value: string
  ) => {
    const next = (draft.vocabulary || []).map((v, i) => (i === index ? { ...v, [field]: value } : v));
    patch({ vocabulary: next });
  };

  const removeVocab = (index: number) => {
    patch({ vocabulary: (draft.vocabulary || []).filter((_, i) => i !== index) });
  };

  const toggleGrammarChip = (chip: string) => {
    const current = draft.grammar_focus || '';
    if (current.includes(chip)) {
      patch({
        grammar_focus: current
          .split(',')
          .map((p) => p.trim())
          .filter((p) => p && p !== chip)
          .join(', '),
      });
      return;
    }
    patch({ grammar_focus: current.trim() ? `${current.trim()}, ${chip}` : chip });
  };

  const handleRegenerate = async (part: ZhGeneratePart) => {
    setRegenPart(part);
    setRegenError(null);
    try {
      const result = await generateZhScenarioPart({
        part,
        scenario: toZhWritePayload({ ...draft, title: draft.title || 'Сценарий' }),
      });
      onChange(applyGeneratePartPatch(draft, result.part, result.patch));
      if (part === 'steps') setStepIndex(0);
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : 'Не удалось перегенерировать');
    } finally {
      setRegenPart(null);
    }
  };

  const goals = draft.goals?.length ? draft.goals : [''];
  const regenBusy = Boolean(regenPart);

  return (
    <div style={{ padding: '1rem 1.25rem', overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <Section title="Сцена">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: 8 }}>
          <label>
            <span style={labelStyle}>Название</span>
            <input value={draft.title} onChange={(e) => patch({ title: e.target.value })} style={inputStyle} placeholder="Название сценария" />
          </label>
          <label>
            <span style={labelStyle}>Учебник</span>
            <input
              value={draft.textbook?.title || ''}
              onChange={(e) => patch({ textbook: { ...draft.textbook, title: e.target.value } })}
              style={inputStyle}
              placeholder="необязательно"
            />
          </label>
          <label>
            <span style={labelStyle}>HSK</span>
            <LevelDropdown
              value={String(draft.hsk_level ?? 3)}
              onChange={(v) => patch({ hsk_level: Number(v) as ZhHskLevel })}
              options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `HSK ${n}` }))}
              openUpward={false}
              ariaLabel="Уровень HSK"
              style={inputStyle}
            />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label>
            <span style={labelStyle}>Урок</span>
            <input
              value={draft.textbook?.lesson_no || ''}
              onChange={(e) => patch({ textbook: { ...draft.textbook, lesson_no: e.target.value } })}
              style={inputStyle}
            />
          </label>
          <label>
            <span style={labelStyle}>Описание</span>
            <input value={draft.description || ''} onChange={(e) => patch({ description: e.target.value })} style={inputStyle} />
          </label>
        </div>
        <label>
          <span style={labelStyle}>Место</span>
          <input value={draft.setting_ru || ''} onChange={(e) => patch({ setting_ru: e.target.value })} style={inputStyle} placeholder="магазин одежды, клиника…" />
        </label>
        <label>
          <span style={labelStyle}>Ситуация</span>
          <textarea
            value={draft.scenario_text_ru || ''}
            onChange={(e) => patch({ scenario_text_ru: e.target.value })}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
            placeholder="Что происходит в сцене"
          />
        </label>
      </Section>

      <Section title="Роли и тон">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label>
            <span style={labelStyle}>Ваша роль</span>
            <input value={draft.user_role || ''} onChange={(e) => patch({ user_role: e.target.value })} style={inputStyle} />
          </label>
          <label>
            <span style={labelStyle}>Роль ИИ</span>
            <input value={draft.ai_role || ''} onChange={(e) => patch({ ai_role: e.target.value })} style={inputStyle} />
          </label>
        </div>
        <div>
          <span style={labelStyle}>Характер собеседника</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ZH_AI_PERSONALITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                title={p.hint}
                onClick={() => patch({ ai_personality: p.value })}
                style={{
                  ...btnSecondary,
                  background: (draft.ai_personality || 'warm') === p.value ? 'var(--sidebar-active)' : 'transparent',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p style={{ margin: '6px 0 0', fontSize: '0.8rem', opacity: 0.65 }}>
            {ZH_AI_PERSONALITIES.find((p) => p.value === (draft.ai_personality || 'warm'))?.hint}
          </p>
        </div>
        <label>
          <span style={labelStyle}>Уточнение характера</span>
          <input
            value={draft.ai_personality_note || ''}
            onChange={(e) => patch({ ai_personality_note: e.target.value })}
            style={inputStyle}
            placeholder="необязательно: слегка ворчливый, очень вежливый…"
          />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, position: 'relative', zIndex: 4, overflow: 'visible' }}>
          <label>
            <span style={labelStyle}>Кто начинает</span>
            <LevelDropdown
              value={draft.starter}
              onChange={(v) => patch({ starter: v as ZhStarter })}
              options={[
                { value: 'ai', label: 'Собеседник' },
                { value: 'user', label: 'Вы' },
              ]}
              openUpward={false}
              ariaLabel="Кто начинает"
              style={inputStyle}
            />
          </label>
          <label>
            <span style={labelStyle}>Формальность</span>
            <LevelDropdown
              value={draft.formality}
              onChange={(v) => patch({ formality: v as ZhFormality })}
              options={[
                { value: 'nin', label: '您' },
                { value: 'ni', label: '你' },
                { value: 'mixed', label: 'Смесь' },
              ]}
              openUpward={false}
              ariaLabel="Формальность"
              style={inputStyle}
            />
          </label>
          <label>
            <span style={labelStyle}>Сленг</span>
            <LevelDropdown
              value={draft.slang_mode}
              onChange={(v) => patch({ slang_mode: v as ZhSlangMode })}
              options={[
                { value: 'off', label: 'Без сленга' },
                { value: 'light', label: 'Лёгкий' },
              ]}
              openUpward={false}
              ariaLabel="Сленг"
              style={inputStyle}
            />
          </label>
        </div>
        <label>
          <span style={labelStyle}>Первая реплика собеседника</span>
          <input value={draft.character_opening || ''} onChange={(e) => patch({ character_opening: e.target.value })} style={inputStyle} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label>
            <span style={labelStyle}>Подсказка первой фразы ученику</span>
            <input value={draft.suggested_first_line || ''} onChange={(e) => patch({ suggested_first_line: e.target.value })} style={inputStyle} />
          </label>
          <label>
            <span style={labelStyle}>Пиньинь первой фразы</span>
            <input
              value={draft.suggested_first_line_pinyin || ''}
              onChange={(e) => patch({ suggested_first_line_pinyin: e.target.value })}
              style={inputStyle}
            />
          </label>
        </div>
        <button type="button" disabled={regenBusy} onClick={() => handleRegenerate('openings')} style={btnSecondary}>
          {regenPart === 'openings' ? 'Пересобираем фразы…' : 'Перегенерировать первые фразы'}
        </button>
      </Section>

      <Section
        title="Урок"
        action={
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" disabled={regenBusy} onClick={() => handleRegenerate('steps')} style={btnSecondary}>
              {regenPart === 'steps' ? 'Шаги…' : 'Пересобрать шаги'}
            </button>
            <button type="button" disabled={regenBusy} onClick={() => handleRegenerate('vocabulary')} style={btnSecondary}>
              {regenPart === 'vocabulary' ? 'Словарь…' : 'Пересобрать словарь'}
            </button>
          </div>
        }
      >
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={labelStyle}>Цели</span>
            <button type="button" onClick={() => patch({ goals: [...goals, ''] })} style={btnSecondary}>Добавить цель</button>
          </div>
          {goals.map((g, i) => (
            <div key={`goal-${i}`} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input
                value={g}
                onChange={(e) => {
                  const next = [...goals];
                  next[i] = e.target.value;
                  patch({ goals: next });
                }}
                style={inputStyle}
                placeholder="Цель на русском"
              />
              {goals.length > 1 && (
                <button type="button" onClick={() => patch({ goals: goals.filter((_, j) => j !== i) })} style={btnSecondary}>×</button>
              )}
            </div>
          ))}
        </div>

        <div>
          <span style={labelStyle}>Грамматический фокус</span>
          <input
            value={draft.grammar_focus || ''}
            onChange={(e) => patch({ grammar_focus: e.target.value })}
            style={inputStyle}
            placeholder="например: 了 для завершённого действия"
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {ZH_GRAMMAR_CHIPS.map((chip) => {
              const on = (draft.grammar_focus || '').includes(chip);
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => toggleGrammarChip(chip)}
                  style={{
                    ...btnSecondary,
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.8rem',
                    background: on ? 'var(--sidebar-active)' : 'transparent',
                  }}
                >
                  {chip}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 280px) 1fr', gap: 12, minHeight: 280 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={labelStyle}>Шаги</span>
              <button type="button" onClick={addStep} style={btnSecondary}>+ шаг</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {steps.map((s, i) => (
                <button
                  key={s.id || i}
                  type="button"
                  onClick={() => setStepIndex(i)}
                  style={{
                    ...btnSecondary,
                    textAlign: 'left',
                    background: i === stepIndex ? 'var(--sidebar-active)' : 'transparent',
                  }}
                >
                  {i + 1}. {s.title_ru || 'Без названия'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ border: '1px solid var(--sidebar-border)', borderRadius: 12, padding: '0.85rem', background: 'var(--sidebar-bg)', position: 'relative', zIndex: 2, isolation: 'isolate' }}>
            {selected ? (
              <>
                <label>
                  <span style={labelStyle}>Название шага</span>
                  <input
                    value={selected.title_ru}
                    onChange={(e) => updateStep(safeIndex, { title_ru: e.target.value })}
                    style={inputStyle}
                  />
                </label>
                <label style={{ display: 'block', marginTop: 10 }}>
                  <span style={labelStyle}>Ожидаемое действие ученика</span>
                  <textarea
                    value={selected.expected_user_action}
                    onChange={(e) => updateStep(safeIndex, { expected_user_action: e.target.value })}
                    rows={2}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </label>
                <button type="button" onClick={() => setAdvanced((v) => !v)} style={{ ...btnSecondary, marginTop: 10 }}>
                  {advanced ? 'Скрыть точную настройку' : 'Точная настройка'}
                </button>
                {advanced && (
                  <div
                    style={{
                      marginTop: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      padding: '0.75rem',
                      borderRadius: 10,
                      border: '1px solid var(--sidebar-border)',
                      background: 'var(--sidebar-bg)',
                    }}
                  >
                    <label>
                      <span style={labelStyle}>Контекст для ИИ</span>
                      <textarea
                        value={selected.ai_context || ''}
                        onChange={(e) => updateStep(safeIndex, { ai_context: e.target.value })}
                        rows={2}
                        style={{ ...inputStyle, resize: 'vertical' }}
                      />
                    </label>
                    <label>
                      <span style={labelStyle}>Ключевые слова (через запятую)</span>
                      <input
                        value={(selected.keywords || []).join(', ')}
                        onChange={(e) =>
                          updateStep(safeIndex, {
                            keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean),
                          })
                        }
                        style={inputStyle}
                      />
                    </label>
                    <label>
                      <span style={labelStyle}>Пример фразы (ZH)</span>
                      <input
                        value={selected.example_zh || ''}
                        onChange={(e) => updateStep(safeIndex, { example_zh: e.target.value })}
                        style={inputStyle}
                      />
                    </label>
                  </div>
                )}
                {steps.length > 1 && (
                  <button type="button" onClick={() => removeStep(safeIndex)} style={{ ...btnSecondary, marginTop: 10 }}>
                    Удалить шаг
                  </button>
                )}
              </>
            ) : (
              <p style={{ opacity: 0.7 }}>Добавьте шаг</p>
            )}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={labelStyle}>Словарь</span>
            <button type="button" onClick={addVocab} style={btnSecondary}>+ слово</button>
          </div>
          <p style={{ margin: '0 0 8px', fontSize: '0.8rem', opacity: 0.7 }}>
            «Сказать» — ученик должен произнести сам. «Показать» — ИИ использует в своих репликах.
          </p>
          {(draft.vocabulary || []).map((v, i) => (
            <div key={`v-${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 132px auto', gap: 6, marginBottom: 6 }}>
              <input value={v.hanzi} onChange={(e) => updateVocab(i, 'hanzi', e.target.value)} placeholder="汉字" style={inputStyle} />
              <input value={v.pinyin} onChange={(e) => updateVocab(i, 'pinyin', e.target.value)} placeholder="pinyin" style={inputStyle} />
              <input value={v.translation_ru} onChange={(e) => updateVocab(i, 'translation_ru', e.target.value)} placeholder="перевод" style={inputStyle} />
              <select
                className="roleplay-modern-select"
                value={v.usage === 'must_say' ? 'must_say' : 'model'}
                onChange={(e) => updateVocab(i, 'usage', e.target.value as ZhVocabUsage)}
                style={{ ...inputStyle, paddingRight: 8 }}
              >
                <option value="must_say">Сказать</option>
                <option value="model">Показать</option>
              </select>
              <button type="button" onClick={() => removeVocab(i)} style={btnSecondary}>×</button>
            </div>
          ))}
          {onAddToDictionary && draft.id && (draft.vocabulary || []).length > 0 && (
            <button type="button" onClick={onAddToDictionary} disabled={vocabBusy} style={{ ...btnSecondary, marginTop: 4 }}>
              {vocabBusy ? 'Добавляем…' : 'В мой словарь'}
            </button>
          )}
          {vocabMessage && <p style={{ margin: '6px 0 0', fontSize: '0.85rem', opacity: 0.8 }}>{vocabMessage}</p>}
        </div>
      </Section>

      <Section title="Как играть">
        <label>
          <span style={labelStyle}>Как набрать максимум</span>
          <textarea
            value={draft.max_score_tips_ru || ''}
            onChange={(e) => patch({ max_score_tips_ru: e.target.value })}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
            placeholder="Короткие советы ученику перед стартом"
          />
        </label>
      </Section>

      {regenError && <p style={{ margin: 0, color: 'rgb(185, 28, 28)' }}>{regenError}</p>}
      {saveError && <p style={{ margin: 0, color: 'rgb(185, 28, 28)' }}>{saveError}</p>}
      {!canSave && (
        <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.7 }}>
          Чтобы сохранить, заполните название, хотя бы одну цель и ожидаемое действие в шаге.
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => onSave(false)} disabled={saving || !canSave} style={{ ...btnPrimary, opacity: saving || !canSave ? 0.7 : 1 }}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
        <button type="button" onClick={() => onSave(true)} disabled={saving || !canSave} style={btnSecondary}>
          Сохранить и пройти
        </button>
        <button type="button" onClick={() => setShowPreview((v) => !v)} style={btnSecondary}>
          {showPreview ? 'Скрыть превью брифинга' : 'Превью брифинга'}
        </button>
        <button type="button" onClick={onBack} style={btnSecondary}>Назад</button>
      </div>

      {showPreview && (
        <div
          style={{
            border: '1px solid var(--sidebar-border)',
            borderRadius: 14,
            padding: '0.9rem 1rem',
            background: 'var(--sidebar-hover)',
          }}
        >
          <ZhScenarioBriefing scenario={draft} variant="preview" />
        </div>
      )}
    </div>
  );
}
