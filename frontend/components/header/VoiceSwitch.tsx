'use client';

import React from 'react';
import { TTS_VOICE_OPTIONS, useTtsVoice } from '@/context/TtsVoiceContext';
import styles from './language-switch.module.css';

export const VoiceSwitch: React.FC = () => {
  const { ttsVoice, setTtsVoice } = useTtsVoice();

  return (
    <div className={styles.switchRoot} role="group" aria-label="Голос озвучки">
      {TTS_VOICE_OPTIONS.map((option) => {
        const isActive = ttsVoice === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className={[styles.switchBtn, isActive ? styles.switchBtnActive : ''].filter(Boolean).join(' ')}
            aria-pressed={isActive}
            onClick={() => setTtsVoice(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};
