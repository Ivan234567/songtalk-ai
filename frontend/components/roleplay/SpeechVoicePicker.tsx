'use client';

import { ensureAdultConfirmation } from '@/lib/adultConfirmation';

export type SpeechSlangMode = 'off' | 'light' | 'heavy';
export type SpeechProfanityIntensity = 'light' | 'medium' | 'hard';
export type SpeechVoiceId = 'calm' | 'friend' | 'raw';

export type SpeechVoiceSettings = {
  slangMode: SpeechSlangMode;
  allowProfanity: boolean;
  aiMayUseProfanity: boolean;
  profanityIntensity: SpeechProfanityIntensity;
};

export const SPEECH_VOICES: Array<SpeechVoiceSettings & { id: SpeechVoiceId; title: string; sample: string }> = [
  {
    id: 'calm',
    title: 'Спокойный',
    sample: 'That\u2019s annoying. Want to talk about it?',
    slangMode: 'off',
    allowProfanity: false,
    aiMayUseProfanity: false,
    profanityIntensity: 'light',
  },
  {
    id: 'friend',
    title: 'Как друг',
    sample: 'Yeah, that\u2019s kinda annoying. What happened?',
    slangMode: 'light',
    allowProfanity: false,
    aiMayUseProfanity: false,
    profanityIntensity: 'light',
  },
  {
    id: 'raw',
    title: 'Может материться',
    sample: 'Oh for fuck\u2019s sake. What happened?',
    slangMode: 'heavy',
    allowProfanity: true,
    aiMayUseProfanity: true,
    profanityIntensity: 'medium',
  },
];

export function matchSpeechVoice(settings: {
  slangMode?: string | null;
  allowProfanity?: boolean | null;
  aiMayUseProfanity?: boolean | null;
  profanityIntensity?: string | null;
}): (typeof SPEECH_VOICES)[number] | null {
  const slang = settings.slangMode === 'off' || settings.slangMode === 'heavy' ? settings.slangMode : 'light';
  const intensity = settings.profanityIntensity === 'medium' || settings.profanityIntensity === 'hard'
    ? settings.profanityIntensity
    : 'light';
  return SPEECH_VOICES.find((voice) =>
    voice.slangMode === slang &&
    voice.allowProfanity === Boolean(settings.allowProfanity) &&
    voice.aiMayUseProfanity === Boolean(settings.allowProfanity) && Boolean(settings.aiMayUseProfanity) &&
    voice.profanityIntensity === intensity
  ) ?? null;
}

export function SpeechVoicePicker({
  slangMode,
  allowProfanity,
  aiMayUseProfanity,
  profanityIntensity,
  onChange,
  confirmSource,
}: SpeechVoiceSettings & {
  onChange: (next: SpeechVoiceSettings) => void;
  confirmSource: string;
}) {
  const active = matchSpeechVoice({ slangMode, allowProfanity, aiMayUseProfanity, profanityIntensity });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', position: 'relative', zIndex: 5, pointerEvents: 'auto' }}>
      <span style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.55 }}>
        Как говорит персонаж
      </span>
      {SPEECH_VOICES.map((voice) => {
        const isActive = active?.id === voice.id;
        return (
          <button
            key={voice.id}
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (voice.allowProfanity) {
                const confirmed = await ensureAdultConfirmation(confirmSource);
                if (!confirmed) return;
              }
              onChange({
                slangMode: voice.slangMode,
                allowProfanity: voice.allowProfanity,
                aiMayUseProfanity: voice.aiMayUseProfanity,
                profanityIntensity: voice.profanityIntensity,
              });
            }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 2,
              width: '100%',
              textAlign: 'left',
              border: isActive ? '1px solid rgba(99, 102, 241, 0.5)' : '1px solid var(--sidebar-border)',
              background: isActive ? 'rgba(99, 102, 241, 0.12)' : 'var(--sidebar-hover)',
              color: 'var(--sidebar-text)',
              borderRadius: 10,
              padding: '0.5rem 0.65rem',
              cursor: 'pointer',
              pointerEvents: 'auto',
              position: 'relative',
              zIndex: 5,
            }}
          >
            <span style={{ fontSize: '0.8125rem', fontWeight: isActive ? 700 : 600, color: isActive ? 'rgb(129, 140, 248)' : 'var(--sidebar-text)' }}>
              {voice.title}
            </span>
            <span style={{ fontSize: '0.75rem', opacity: 0.7, lineHeight: 1.35 }}>
              {voice.sample}
            </span>
          </button>
        );
      })}
    </div>
  );
}
