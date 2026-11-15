'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { useLearningLanguage } from '@/context/LearningLanguageContext';
import { CHINESE_PRACTICE_OPEN, LearningLanguage, LEARNING_LANGUAGE_LABELS } from '@/lib/learning-language';
import { getStoredBackendToken } from '@/lib/backend-jwt';
import styles from './language-switch.module.css';

const OPTIONS: LearningLanguage[] = ['en', 'zh'];

export const LanguageSwitch: React.FC = () => {
  const { learningLanguage, setLearningLanguage, isLanguageReady, isSavingLanguage } = useLearningLanguage();
  const isDisabled = !isLanguageReady || isSavingLanguage;
  const [hintOpen, setHintOpen] = useState(false);
  const [zhNoticeOpen, setZhNoticeOpen] = useState(false);
  const [vote, setVote] = useState<'yes' | 'no' | null>(null);
  const [voteState, setVoteState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const clusterRef = useRef<HTMLDivElement>(null);
  const hintId = useId();

  useEffect(() => {
    if (!hintOpen && !zhNoticeOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!clusterRef.current?.contains(event.target as Node)) {
        setHintOpen(false);
        setZhNoticeOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setHintOpen(false);
        setZhNoticeOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [hintOpen, zhNoticeOpen]);

  const chooseZh = () => {
    setHintOpen(false);
    setZhNoticeOpen(true);
  };

  const sendVote = async (want: boolean) => {
    const token = getStoredBackendToken();
    if (!token) {
      setVoteState('error');
      return;
    }
    setVoteState('saving');
    setVote(want ? 'yes' : 'no');
    try {
      const api = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
      const response = await fetch(`${api}/api/interest/chinese`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ want }),
      });
      setVoteState(response.ok ? 'saved' : 'error');
    } catch {
      setVoteState('error');
    }
  };

  return (
    <div
      ref={clusterRef}
      className={styles.cluster}
      onMouseEnter={() => setHintOpen(true)}
      onMouseLeave={() => setHintOpen(false)}
    >
      <button
        type="button"
        className={styles.cue}
        aria-expanded={hintOpen}
        aria-controls={hintId}
        onClick={() => {
          if (window.matchMedia('(hover: hover)').matches) return;
          setHintOpen((open) => !open);
        }}
      >
        <span className={styles.dots} aria-hidden="true">
          <i className={styles.dotEn} />
          <i className={styles.dotZh} />
        </span>
        <span className={styles.cueLabel}>два языка</span>
      </button>

      <div
        className={styles.switchRoot}
        role="group"
        aria-label="Язык практики"
        aria-describedby={hintId}
        aria-busy={isSavingLanguage}
        data-language={learningLanguage}
      >
        {OPTIONS.map((lang) => {
          const isActive = learningLanguage === lang;
          return (
            <button
              key={lang}
              type="button"
              className={[styles.switchBtn, isActive ? styles.switchBtnActive : ''].filter(Boolean).join(' ')}
              aria-pressed={isActive}
              disabled={isDisabled && lang === 'en'}
              onClick={() => {
                if (lang === 'zh' && !CHINESE_PRACTICE_OPEN) {
                  chooseZh();
                  return;
                }
                setZhNoticeOpen(false);
                setLearningLanguage(lang);
              }}
            >
              {LEARNING_LANGUAGE_LABELS[lang]}
            </button>
          );
        })}
      </div>

      <div
        id={hintId}
        className={[styles.card, hintOpen ? styles.cardOpen : ''].filter(Boolean).join(' ')}
        role="note"
        hidden={!hintOpen}
      >
        <span className={styles.cardKicker}>Не перевод сайта</span>
        <p className={styles.cardText}>
          Сейчас занятие на English. Китайский скоро откроем.
        </p>
      </div>

      <div
        className={[styles.card, styles.notice, zhNoticeOpen ? styles.cardOpen : ''].filter(Boolean).join(' ')}
        role="dialog"
        aria-label="Китайский скоро"
        hidden={!zhNoticeOpen}
      >
        <span className={styles.cardKicker}>Скоро</span>
        <p className={styles.cardText}>Скоро запустим и китайский.</p>
        <p className={styles.ask}>Хотели бы вы им пользоваться?</p>
        <div className={styles.votes}>
          <button type="button" className={vote === 'yes' ? styles.voteOn : styles.vote} disabled={voteState === 'saving'} onClick={() => void sendVote(true)}>Хочу</button>
          <button type="button" className={vote === 'no' ? styles.voteOn : styles.vote} disabled={voteState === 'saving'} onClick={() => void sendVote(false)}>Пока нет</button>
        </div>
        {voteState === 'saved' ? <p className={styles.saved}>Ответ записан. Спасибо.</p> : null}
        {voteState === 'error' ? <p className={styles.saved}>Не удалось записать ответ. Нажмите ещё раз.</p> : null}
      </div>
    </div>
  );
};
