'use client';

import React from 'react';
import { TTS_VOICE_OPTIONS, useTtsVoice } from '@/context/TtsVoiceContext';
import styles from './language-switch.module.css';

function SpeakerIcon() {
  return (
    <svg className={styles.voiceIcon} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2.2 6.2h2.1L7.4 3.6v8.8L4.3 9.8H2.2V6.2z"
        fill="currentColor"
      />
      <path
        d="M9.2 5.4a3.2 3.2 0 0 1 0 5.2M11 3.7a5.4 5.4 0 0 1 0 8.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PersonIcon({ variant }: { variant: 'male' | 'female' }) {
  return (
    <svg className={styles.voiceGlyph} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="3.7" r="2.05" fill="currentColor" />
      {variant === 'female' ? (
        <path d="M8 6.3 12.1 13.6H3.9L8 6.3z" fill="currentColor" />
      ) : (
        <path d="M4.1 7.2h7.8v2.1c0 2.5-1.6 4.3-3.9 4.3s-3.9-1.8-3.9-4.3V7.2z" fill="currentColor" />
      )}
    </svg>
  );
}

export const VoiceSwitch: React.FC = () => {
  const { ttsVoice, setTtsVoice } = useTtsVoice();

  return (
    <div className={styles.voiceCluster}>
      <span className={styles.voiceCue}>
        <SpeakerIcon />
        <span>Голос бота</span>
      </span>
      <div className={styles.switchRoot} role="group" aria-label="Голос бота">
        {TTS_VOICE_OPTIONS.map((option) => {
          const isActive = ttsVoice === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={[styles.switchBtn, isActive ? styles.switchBtnActive : ''].filter(Boolean).join(' ')}
              aria-pressed={isActive}
              title={option.value === 'onyx' ? 'Бот говорит мужским голосом' : 'Бот говорит женским голосом'}
              onClick={() => setTtsVoice(option.value)}
            >
              <PersonIcon variant={option.value === 'onyx' ? 'male' : 'female'} />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
