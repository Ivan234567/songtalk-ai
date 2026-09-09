'use client';

import React from 'react';
import type { RoleplayScenario } from '@/lib/roleplay';
import {
  getLessonTrackerState,
  getMustSayVocab,
  type ZhTrackerVocabItem,
} from '@/lib/zh-lesson-tracker';

const headerBtn: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  border: 'none',
  background: 'transparent',
  color: 'var(--sidebar-text)',
  fontSize: '0.75rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  cursor: 'pointer',
  padding: 0,
};

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" style={{ flexShrink: 0 }} aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function OpenDot() {
  return <span style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid var(--sidebar-border)', flexShrink: 0 }} aria-hidden />;
}

export function RoleplayScenarioProgress({
  scenario,
  completedStepIds,
  saidMustSayHanzi,
  selectedSessionId,
  learningLanguage,
  stepsOpen,
  onToggleSteps,
  onSaveProgress,
  boxed = false,
}: {
  scenario: RoleplayScenario;
  completedStepIds: string[];
  saidMustSayHanzi: string[];
  selectedSessionId: string | null;
  learningLanguage: string;
  stepsOpen: boolean;
  onToggleSteps: () => void;
  onSaveProgress: () => void;
  boxed?: boolean;
}) {
  const steps = (scenario.steps || [])
    .slice()
    .sort((a, b) => a.order - b.order);
  const mustSay: ZhTrackerVocabItem[] =
    learningLanguage === 'zh' && !selectedSessionId
      ? getMustSayVocab(scenario.scenarioVocabulary)
      : [];
  const tracker = getLessonTrackerState({
    steps,
    completedStepIds,
    mustSay,
    saidHanzi: saidMustSayHanzi,
  });
  const hasSteps = steps.length > 0;
  const showZhVocab = mustSay.length > 0;
  const canMarkGoal = !selectedSessionId && tracker.plotReady;
  const isZh = learningLanguage === 'zh';

  const sectionStyle: React.CSSProperties = boxed
    ? {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        border: '1px solid var(--sidebar-border)',
        borderRadius: 10,
        padding: '0.75rem',
        background: 'var(--sidebar-bg)',
      }
    : { display: 'flex', flexDirection: 'column', gap: '0.35rem' };

  return (
    <section style={sectionStyle}>
      {!hasSteps && !showZhVocab ? (
        <span style={{ ...headerBtn, cursor: 'default' }}>Задание</span>
      ) : null}
      {hasSteps && (
        <>
          <button
            type="button"
            onClick={onToggleSteps}
            aria-expanded={stepsOpen}
            style={{ ...headerBtn, marginBottom: stepsOpen ? '0.5rem' : 0 }}
          >
            {isZh ? `Сцена ${tracker.stepsDone}/${tracker.stepsTotal}` : 'Задание'}
            <span style={{ opacity: 0.7 }}>{stepsOpen ? '▼' : '▶'}</span>
          </button>
          {stepsOpen &&
            steps.map((step) => {
              const done = completedStepIds.includes(step.id);
              const current = !done && tracker.currentStepId === step.id;
              return (
                <div
                  key={step.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.875rem',
                    lineHeight: 1.4,
                    color: 'var(--sidebar-text)',
                    opacity: done ? 0.7 : current ? 1 : 0.88,
                    fontWeight: current ? 600 : 400,
                    marginTop: '0.35rem',
                  }}
                >
                  {done ? <CheckIcon /> : <OpenDot />}
                  <span>{step.titleRu}</span>
                </div>
              );
            })}
        </>
      )}

      {showZhVocab && (
        <div style={{ marginTop: hasSteps ? '0.65rem' : 0 }}>
          <div style={{ ...headerBtn, cursor: 'default', marginBottom: '0.45rem' }}>
            Слова урока {tracker.vocabDone}/{tracker.vocabTotal}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {mustSay.map((item) => {
              const said = saidMustSayHanzi.includes(item.hanzi);
              return (
                <span
                  key={item.hanzi}
                  title={item.translation_ru || item.pinyin || item.hanzi}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '0.28rem 0.55rem',
                    borderRadius: 999,
                    fontSize: '0.8125rem',
                    lineHeight: 1.2,
                    border: said ? '1px solid rgba(34, 197, 94, 0.35)' : '1px solid var(--sidebar-border)',
                    background: said ? 'rgba(34, 197, 94, 0.12)' : 'transparent',
                    color: 'var(--sidebar-text)',
                    opacity: said ? 1 : 0.55,
                    fontWeight: said ? 600 : 500,
                  }}
                >
                  {said ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : null}
                  {item.hanzi}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {selectedSessionId ? (
        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--sidebar-text)', opacity: 0.6 }}>
          Просмотр истории — кнопка недоступна
        </div>
      ) : null}

      {!selectedSessionId && hasSteps && !tracker.plotReady ? (
        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--sidebar-text)', opacity: 0.6 }}>
          Осталось выполнить: {tracker.stepsTotal - tracker.stepsDone} из {tracker.stepsTotal} шаг(ов)
        </div>
      ) : null}

      {canMarkGoal && showZhVocab && !tracker.lessonReady ? (
        <div style={{ marginTop: '0.55rem', fontSize: '0.75rem', color: 'var(--sidebar-text)', opacity: 0.8, lineHeight: 1.4 }}>
          Сцену можно закончить. Ещё можно сказать {tracker.missingMustSay.map((v) => v.hanzi).join('、')}.
        </div>
      ) : null}

      {canMarkGoal && showZhVocab && tracker.lessonReady ? (
        <div style={{ marginTop: '0.55rem', fontSize: '0.75rem', fontWeight: 600, color: 'rgba(34, 197, 94, 0.95)' }}>
          Урок сказан
        </div>
      ) : null}

      {canMarkGoal ? (
        <button
          type="button"
          onClick={onSaveProgress}
          style={{
            marginTop: '0.75rem',
            width: '100%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0.75rem',
            borderRadius: 8,
            border: '1px solid rgba(34, 197, 94, 0.4)',
            background: 'rgba(34, 197, 94, 0.12)',
            color: 'rgba(34, 197, 94, 0.95)',
            fontSize: '0.8125rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <CheckIcon />
          Сохранить прогресс
        </button>
      ) : null}
    </section>
  );
}
