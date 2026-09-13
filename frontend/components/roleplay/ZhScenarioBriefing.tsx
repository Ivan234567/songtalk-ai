'use client';

import React, { useState } from 'react';
import type { RoleplayScenario } from '@/lib/roleplay';
import {
  ZH_PLAY_MODES,
  ZH_PLAY_MODE_HINTS,
  ZH_PLAY_MODE_LABELS,
  defaultStressTwist,
  parseZhPlayMode,
  type ZhPlayMode,
} from '@/lib/zh-play-mode';
import {
  getZhScenarioMemory,
  personalityLabel,
  zhScenarioToRoleplay,
  type ZhScenario,
  type ZhStarter,
} from '@/lib/zh-scenarios';

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

function textbookLine(s: ZhScenario): string {
  const title = typeof s.textbook?.title === 'string' ? s.textbook.title : '';
  const lesson = typeof s.textbook?.lesson_no === 'string' ? s.textbook.lesson_no : '';
  return [title, lesson].filter(Boolean).join(' · ');
}

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

type ZhScenarioBriefingProps = {
  scenario: ZhScenario;
  variant?: 'play' | 'preview';
  onBack?: () => void;
  onStart?: (playable: RoleplayScenario) => void;
  onAddToDictionary?: () => void;
  vocabBusy?: boolean;
  vocabMessage?: string | null;
  initialPlayMode?: ZhPlayMode;
};

export function ZhScenarioBriefing({
  scenario,
  variant = 'play',
  onBack,
  onStart,
  onAddToDictionary,
  vocabBusy,
  vocabMessage,
  initialPlayMode,
}: ZhScenarioBriefingProps) {
  const isPreview = variant === 'preview';
  const [starter, setStarter] = useState<ZhStarter>(scenario.starter || 'ai');
  const [playMode, setPlayMode] = useState<ZhPlayMode>(parseZhPlayMode(initialPlayMode));
  const [starting, setStarting] = useState(false);
  const vocab = Array.isArray(scenario.vocabulary) ? scenario.vocabulary : [];
  const mustSay = vocab.filter((v) => v && v.usage === 'must_say');
  const modelVocab = vocab.filter((v) => v && v.usage !== 'must_say');
  const userLine = [scenario.suggested_first_line, scenario.suggested_first_line_pinyin]
    .filter((v) => typeof v === 'string' && v.trim())
    .join('  ·  ');
  const steps = (Array.isArray(scenario.steps) ? [...scenario.steps] : []).sort(
    (a, b) => (Number(a?.order) || 0) - (Number(b?.order) || 0)
  );
  const effectiveStarter = isPreview ? scenario.starter || 'ai' : starter;
  const dense = isPreview || playMode === 'rehearsal';
  const lifeMode = !isPreview && playMode === 'life';
  const stressMode = !isPreview && playMode === 'stress';
  const goalItems = (Array.isArray(scenario.goals) ? scenario.goals : []).filter(
    (g): g is string => typeof g === 'string' && Boolean(g.trim())
  );
  const goalLine = goalItems.join(' · ');
  const grammarFocus = typeof scenario.grammar_focus === 'string' ? scenario.grammar_focus.trim() : '';
  const twist =
    (typeof scenario.stress_twist_ru === 'string' && scenario.stress_twist_ru.trim()) ||
    defaultStressTwist(typeof scenario.setting_ru === 'string' ? scenario.setting_ru : undefined);

  const handleStart = async () => {
    if (!onStart) return;
    setStarting(true);
    try {
      const memoryFacts = scenario.id ? await getZhScenarioMemory(scenario.id) : [];
      onStart(zhScenarioToRoleplay(scenario, starter, { playMode, memoryFacts }));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div style={{ padding: isPreview ? '0.25rem 0' : '1.25rem 1.5rem', overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {!isPreview && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          <button type="button" onClick={onBack} style={btnSecondary}>
            Назад
          </button>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, opacity: 0.55, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Перед началом диалога
          </span>
        </div>
      )}

      <div>
        <h2 style={{ margin: 0, fontSize: isPreview ? '1.1rem' : '1.35rem', fontWeight: 700, color: 'var(--sidebar-text)' }}>{scenario.title || 'Без названия'}</h2>
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {scenario.hsk_level && (
            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 6, background: 'var(--sidebar-active)' }}>
              HSK {scenario.hsk_level}
            </span>
          )}
          {scenario.from_life && (
            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 6, background: 'rgba(79, 168, 134, 0.18)' }}>
              Из жизни
            </span>
          )}
          {textbookLine(scenario) && (
            <span style={{ fontSize: '0.8125rem', opacity: 0.75 }}>{textbookLine(scenario)}</span>
          )}
          {scenario.ai_personality && dense && (
            <span style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.75 }}>
              Собеседник: {personalityLabel(scenario.ai_personality)}
            </span>
          )}
        </div>
      </div>

      {!isPreview && (
        <div style={{ padding: '0.85rem 1rem', borderRadius: 12, border: '1px solid var(--sidebar-border)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Режим этой попытки
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ZH_PLAY_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setPlayMode(mode)}
                style={{
                  ...btnSecondary,
                  background: playMode === mode ? 'var(--sidebar-active)' : 'transparent',
                  fontSize: '0.875rem',
                  padding: '0.55rem 0.85rem',
                }}
              >
                {ZH_PLAY_MODE_LABELS[mode]}
              </button>
            ))}
          </div>
          <p style={{ margin: '0.65rem 0 0', fontSize: '0.8125rem', opacity: 0.75, lineHeight: 1.4 }}>
            {ZH_PLAY_MODE_HINTS[playMode]} Только для этой попытки, карточка не меняется.
          </p>
        </div>
      )}

      {dense && typeof scenario.setting_ru === 'string' && scenario.setting_ru && (
        <Card title="Место">
          <div>{scenario.setting_ru}</div>
        </Card>
      )}

      {dense && typeof (scenario.scenario_text_ru || scenario.description) === 'string' && (scenario.scenario_text_ru || scenario.description) && (
        <Card title="Ситуация">
          <div>{scenario.scenario_text_ru || scenario.description}</div>
        </Card>
      )}

      {lifeMode && (
        <Card title="Цель сцены">
          <div>{goalLine || scenario.scenario_text_ru || scenario.description || scenario.title}</div>
        </Card>
      )}

      {stressMode && (
        <>
          <Card title="Цель сцены">
            <div>{goalLine || scenario.title}</div>
          </Card>
          <Card title="Осложнение">
            <div>{twist}</div>
          </Card>
        </>
      )}

      {dense && (scenario.user_role || scenario.ai_role) && (
        <Card title="Роли">
          {scenario.user_role && typeof scenario.user_role === 'string' && <div>Вы — {scenario.user_role}</div>}
          {scenario.ai_role && typeof scenario.ai_role === 'string' && (
            <div style={{ marginTop: scenario.user_role ? 4 : 0 }}>ИИ — {scenario.ai_role}</div>
          )}
          {typeof scenario.ai_personality_note === 'string' && scenario.ai_personality_note && (
            <div style={{ marginTop: 6, fontSize: '0.875rem', opacity: 0.8 }}>{scenario.ai_personality_note}</div>
          )}
        </Card>
      )}

      {dense && goalItems.length > 0 && (
        <Card title="Цели">
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {goalItems.map((g, i) => (
              <li key={`${i}-${g}`} style={{ marginBottom: 4 }}>{g}</li>
            ))}
          </ul>
        </Card>
      )}

      {dense && grammarFocus && (
        <Card title="Грамматика урока">
          <div>{grammarFocus}</div>
        </Card>
      )}

      {dense && steps.length > 0 && (
        <Card title="Шаги">
          <ol style={{ margin: 0, paddingLeft: '1.15rem' }}>
            {steps.map((s) => (
              <li key={s.id || s.order} style={{ marginBottom: 4 }}>
                {typeof s.title_ru === 'string' && s.title_ru
                  ? s.title_ru
                  : typeof s.expected_user_action === 'string'
                    ? s.expected_user_action
                    : 'Шаг'}
              </li>
            ))}
          </ol>
        </Card>
      )}

      {dense && (mustSay.length > 0 || modelVocab.length > 0) && (
        <Card title="Слова урока">
          {mustSay.length > 0 && (
            <div style={{ marginBottom: modelVocab.length ? 10 : 0 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.7, marginBottom: 4 }}>Сказать самому</div>
              {mustSay.map((v) => (
                <div key={`m-${v.hanzi}`} style={{ fontSize: '0.9375rem' }}>
                  <strong>{v.hanzi}</strong>
                  <span style={{ opacity: 0.7 }}> {v.pinyin}</span>
                  <span style={{ opacity: 0.85 }}> — {v.translation_ru}</span>
                </div>
              ))}
            </div>
          )}
          {modelVocab.length > 0 && (
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.7, marginBottom: 4 }}>ИИ покажет в речи</div>
              {modelVocab.slice(0, isPreview ? 6 : 8).map((v) => (
                <div key={`o-${v.hanzi}`} style={{ fontSize: '0.9375rem' }}>
                  <strong>{v.hanzi}</strong>
                  <span style={{ opacity: 0.7 }}> {v.pinyin}</span>
                  <span style={{ opacity: 0.85 }}> — {v.translation_ru}</span>
                </div>
              ))}
            </div>
          )}
          {!isPreview && onAddToDictionary && (
            <button
              type="button"
              onClick={onAddToDictionary}
              disabled={vocabBusy}
              style={{ ...btnSecondary, marginTop: 10, padding: '0.45rem 0.75rem', fontSize: '0.8125rem' }}
            >
              {vocabBusy ? 'Добавляем…' : 'В мой словарь'}
            </button>
          )}
          {!isPreview && vocabMessage && <p style={{ margin: '8px 0 0', fontSize: '0.8125rem', opacity: 0.75 }}>{vocabMessage}</p>}
        </Card>
      )}

      {dense && typeof scenario.max_score_tips_ru === 'string' && scenario.max_score_tips_ru && (
        <Card title="Как набрать максимум">
          <div style={{ fontSize: '0.9375rem', lineHeight: 1.45 }}>{scenario.max_score_tips_ru}</div>
        </Card>
      )}

      <div style={{ padding: '0.85rem 1rem', borderRadius: 12, border: '1px solid var(--sidebar-border)' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Кто начинает
        </div>
        {isPreview ? (
          <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.85 }}>
            По умолчанию: {effectiveStarter === 'ai' ? 'собеседник' : 'вы'}
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setStarter('ai')}
              style={{ ...btnSecondary, background: starter === 'ai' ? 'var(--sidebar-active)' : 'transparent' }}
            >
              Собеседник начинает
            </button>
            <button
              type="button"
              onClick={() => setStarter('user')}
              style={{ ...btnSecondary, background: starter === 'user' ? 'var(--sidebar-active)' : 'transparent' }}
            >
              Вы начинаете
            </button>
          </div>
        )}
        {!isPreview && (
          <p style={{ margin: '0.65rem 0 0', fontSize: '0.8125rem', opacity: 0.7 }}>
            {starter === 'ai'
              ? 'Как в диалоге учебника: вам говорят первую фразу. Только для этой попытки.'
              : 'Вы подходите и говорите первым. Только для этой попытки.'}
          </p>
        )}
        {dense && effectiveStarter === 'ai' && typeof scenario.character_opening === 'string' && scenario.character_opening && (
          <p style={{ margin: '0.75rem 0 0', fontSize: '1rem', fontStyle: 'italic' }}>
            «{scenario.character_opening}»
          </p>
        )}
        {dense && effectiveStarter === 'user' && userLine && (
          <p style={{ margin: '0.75rem 0 0', fontSize: '1rem', fontStyle: 'italic' }}>
            Начните с: «{userLine}»
          </p>
        )}
      </div>

      {!isPreview && onStart && (
        <button
          type="button"
          onClick={() => void handleStart()}
          disabled={starting}
          style={{ ...btnPrimary, opacity: starting ? 0.7 : 1 }}
        >
          {starting ? 'Готовим…' : 'Начать диалог'}
        </button>
      )}
    </div>
  );
}
