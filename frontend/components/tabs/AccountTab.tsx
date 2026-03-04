'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchSecurityEvents, logSecurityEvent, SecurityEventRow } from '@/lib/securityEvents';
import styles from './account.module.css';

interface AccountTabProps {
  userEmail: string | null;
  onLogout: () => Promise<void> | void;
}

type ToastKind = 'success' | 'error';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export const AccountTab: React.FC<AccountTabProps> = ({ userEmail, onLogout }) => {
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [showEmailPassword, setShowEmailPassword] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [updatingEmail, setUpdatingEmail] = useState(false);
  const [sendingRecovery, setSendingRecovery] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [events, setEvents] = useState<SecurityEventRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const toastIdRef = useRef(1);

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const pushToast = (kind: ToastKind, message: string) => {
    const id = toastIdRef.current++;
    setToasts((prev) => [...prev, { id, kind, message }]);
    window.setTimeout(() => {
      removeToast(id);
    }, 4200);
  };

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setCreatedAt(data.user?.created_at ?? null);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const loadSecurityEvents = async () => {
    setEventsLoading(true);
    const rows = await fetchSecurityEvents(20);
    setEvents(rows);
    setEventsLoading(false);
  };

  useEffect(() => {
    loadSecurityEvents();
  }, []);

  const validatePassword = (pass: string): string | null => {
    if (!pass || pass.length < 8) return 'Минимум 8 символов';
    if (!/[a-zA-Zа-яА-ЯёЁ]/.test(pass)) return 'Добавьте хотя бы одну букву';
    if (!/[0-9]/.test(pass)) return 'Добавьте хотя бы одну цифру';
    return null;
  };

  const canSubmitPassword = useMemo(() => {
    return currentPassword.trim().length > 0 && validatePassword(newPassword) === null;
  }, [currentPassword, newPassword]);

  const canSubmitEmailChange = useMemo(() => {
    if (!newEmail.trim() || !emailPassword.trim() || !userEmail) return false;
    if (newEmail.trim().toLowerCase() === userEmail.trim().toLowerCase()) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim());
  }, [newEmail, emailPassword, userEmail]);

  const getPasswordStrength = (pass: string): { strength: number; label: string; color: string } => {
    if (!pass || pass.length === 0) return { strength: 0, label: '', color: 'var(--text-muted)' };
    let score = 0;
    const hasLetters = /[a-zA-Zа-яА-ЯёЁ]/.test(pass);
    const hasNumbers = /[0-9]/.test(pass);
    const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(pass);
    if (pass.length >= 8) score++;
    if (pass.length >= 12) score++;
    if (hasLetters) score++;
    if (hasNumbers) score++;
    if (hasSpecialChars) score++;
    if (hasLetters && hasNumbers && pass.length >= 10) score++;
    if (score <= 2) return { strength: 1, label: 'Слабый', color: '#f87171' };
    if (score <= 4) return { strength: 2, label: 'Средний', color: '#fbbf24' };
    return { strength: 3, label: 'Сильный', color: '#4ade80' };
  };

  const passwordRequirements = {
    minLength: newPassword.length >= 8,
    hasLetters: /[a-zA-Zа-яА-ЯёЁ]/.test(newPassword),
    hasNumbers: /[0-9]/.test(newPassword),
  };
  const passwordStrength = getPasswordStrength(newPassword);

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userEmail) {
      pushToast('error', 'Не удалось определить email пользователя.');
      return;
    }

    if (!currentPassword.trim()) {
      pushToast('error', 'Введите текущий пароль.');
      return;
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      pushToast('error', passwordError);
      return;
    }

    if (currentPassword === newPassword) {
      pushToast('error', 'Новый пароль должен отличаться от текущего.');
      return;
    }

    setUpdatingPassword(true);
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: currentPassword,
    });

    if (verifyError) {
      setUpdatingPassword(false);
      pushToast('error', 'Текущий пароль введен неверно.');
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setUpdatingPassword(false);

    if (updateError) {
      pushToast('error', updateError.message || 'Не удалось обновить пароль.');
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    pushToast('success', 'Пароль успешно обновлен.');
    await logSecurityEvent('password_change', { source: 'account_tab' });
    await loadSecurityEvents();
  };

  const handleRecovery = async () => {
    if (!userEmail) {
      pushToast('error', 'Не удалось определить email пользователя.');
      return;
    }

    setSendingRecovery(true);
    const redirectTo = `${window.location.origin}/auth/update-password`;
    const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(userEmail, { redirectTo });
    setSendingRecovery(false);

    if (recoveryError) {
      pushToast('error', recoveryError.message || 'Не удалось отправить письмо для восстановления.');
      return;
    }

    pushToast('success', 'Письмо для восстановления пароля отправлено.');
    await logSecurityEvent('password_reset_request', { source: 'account_tab' });
    await loadSecurityEvents();
  };

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userEmail) {
      pushToast('error', 'Не удалось определить текущий email пользователя.');
      return;
    }

    const normalizedNewEmail = newEmail.trim().toLowerCase();
    const normalizedCurrentEmail = userEmail.trim().toLowerCase();
    if (!normalizedNewEmail) {
      pushToast('error', 'Введите новый email.');
      return;
    }
    if (normalizedNewEmail === normalizedCurrentEmail) {
      pushToast('error', 'Новый email совпадает с текущим.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedNewEmail)) {
      pushToast('error', 'Введите корректный email.');
      return;
    }
    if (!emailPassword.trim()) {
      pushToast('error', 'Введите текущий пароль для подтверждения.');
      return;
    }

    setUpdatingEmail(true);
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: emailPassword,
    });
    if (verifyError) {
      setUpdatingEmail(false);
      pushToast('error', 'Текущий пароль введен неверно.');
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      email: normalizedNewEmail,
    });
    setUpdatingEmail(false);

    if (updateError) {
      pushToast('error', updateError.message || 'Не удалось инициировать смену email.');
      return;
    }

    setNewEmail('');
    setEmailPassword('');
    pushToast('success', `Письмо для подтверждения отправлено на ${normalizedNewEmail}.`);
    await logSecurityEvent('email_change', {
      source: 'account_tab',
      status: 'requested',
      to_email: normalizedNewEmail,
    });
    await loadSecurityEvents();
  };

  const handleLogoutConfirmed = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
      setConfirmLogout(false);
    }
  };

  const formatEventDateTime = (value: string): string => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getEventTitle = (eventType: string): string => {
    switch (eventType) {
      case 'login':
        return 'Вход в аккаунт';
      case 'logout':
        return 'Выход из аккаунта';
      case 'password_change':
        return 'Смена пароля';
      case 'password_reset_request':
        return 'Запрос восстановления пароля';
      case 'email_change':
        return 'Изменение email';
      default:
        return 'Событие безопасности';
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.toastStack} aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`${styles.toast} ${toast.kind === 'success' ? styles.toastSuccess : styles.toastError}`}
            role={toast.kind === 'error' ? 'alert' : 'status'}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className={styles.toastClose}
              aria-label="Закрыть уведомление"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <header>
        <h2 className={styles.title}>Аккаунт</h2>
        <p className={styles.subtitle}>Настройки безопасности и доступа</p>
      </header>

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>Профиль</h3>
        <div className={styles.infoGrid}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Email</span>
            <span className={styles.infoValue}>{userEmail || '—'}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Дата регистрации</span>
            <span className={styles.infoValue}>{formatDate(createdAt)}</span>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>Смена пароля</h3>
        <form onSubmit={handlePasswordUpdate} className={styles.form}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Старый пароль</span>
            <div className={`${styles.inputWrap} ${currentPassword ? styles.hasValue : ''}`}>
              <span className={styles.authInputIcon} aria-hidden>🔒</span>
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={`${styles.input} ${styles.inputPassword}`}
                placeholder="Введите текущий пароль"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword((v) => !v)}
                className={styles.authToggle}
                title={showCurrentPassword ? 'Скрыть пароль' : 'Показать пароль'}
                aria-label={showCurrentPassword ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showCurrentPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              Новый пароль
              <span className={styles.fieldLabelHint}>(мин. 8 символов, буквы и цифры)</span>
            </span>
            <div className={`${styles.inputWrap} ${newPassword ? styles.hasValue : ''}`}>
              <span className={styles.authInputIcon} aria-hidden>🔑</span>
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={`${styles.input} ${styles.inputPassword}`}
                placeholder="Введите новый пароль"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((v) => !v)}
                className={styles.authToggle}
                title={showNewPassword ? 'Скрыть пароль' : 'Показать пароль'}
                aria-label={showNewPassword ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showNewPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </label>
          {newPassword && (
            <div className={styles.authStrengthWrap}>
              <div className={styles.authStrengthBar}>
                <div className={styles.authStrengthTrack}>
                  <div
                    className={styles.authStrengthFill}
                    style={{
                      width:
                        passwordStrength.strength === 1
                          ? '33%'
                          : passwordStrength.strength === 2
                            ? '66%'
                            : '100%',
                      background: passwordStrength.color,
                    }}
                  />
                </div>
                <span className={styles.authStrengthLabel} style={{ color: passwordStrength.color }}>
                  {passwordStrength.label}
                </span>
              </div>
            </div>
          )}

          {newPassword && validatePassword(newPassword) !== null && (
            <div className={styles.authRequirements}>
              <div className={styles.authRequirementsTitle}>Требования к паролю:</div>
              <div className={`${styles.authRequirementItem} ${passwordRequirements.minLength ? styles.met : ''}`}>
                <span>{passwordRequirements.minLength ? '✓' : '○'}</span>
                <span>Минимум 8 символов</span>
              </div>
              <div className={`${styles.authRequirementItem} ${passwordRequirements.hasLetters ? styles.met : ''}`}>
                <span>{passwordRequirements.hasLetters ? '✓' : '○'}</span>
                <span>Содержит буквы</span>
              </div>
              <div className={`${styles.authRequirementItem} ${passwordRequirements.hasNumbers ? styles.met : ''}`}>
                <span>{passwordRequirements.hasNumbers ? '✓' : '○'}</span>
                <span>Содержит цифры</span>
              </div>
            </div>
          )}

          <button type="submit" disabled={!canSubmitPassword || updatingPassword} className={styles.primaryBtn}>
            {updatingPassword ? 'Сохраняем...' : 'Обновить пароль'}
          </button>
        </form>
      </section>

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>Восстановление доступа</h3>
        <p className={styles.mutedText}>
          Отправим письмо для сброса пароля на ваш текущий email.
        </p>
        <button type="button" onClick={handleRecovery} disabled={sendingRecovery} className={styles.secondaryBtn}>
          {sendingRecovery ? 'Отправляем...' : 'Отправить письмо для восстановления'}
        </button>
      </section>

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>Изменение email</h3>
        <p className={styles.mutedText}>
          Для смены email подтвердите действие текущим паролем. После отправки запроса нужно подтвердить новый адрес по ссылке из письма.
        </p>
        <form onSubmit={handleEmailChange} className={styles.form}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Новый email</span>
            <div className={`${styles.inputWrap} ${newEmail ? styles.hasValue : ''}`}>
              <span className={styles.authInputIcon} aria-hidden>✉️</span>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className={styles.input}
                placeholder="new-email@example.com"
                autoComplete="email"
              />
            </div>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Текущий пароль</span>
            <div className={`${styles.inputWrap} ${emailPassword ? styles.hasValue : ''}`}>
              <span className={styles.authInputIcon} aria-hidden>🔒</span>
              <input
                type={showEmailPassword ? 'text' : 'password'}
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                className={`${styles.input} ${styles.inputPassword}`}
                placeholder="Введите текущий пароль"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowEmailPassword((v) => !v)}
                className={styles.authToggle}
                title={showEmailPassword ? 'Скрыть пароль' : 'Показать пароль'}
                aria-label={showEmailPassword ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showEmailPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </label>
          <button type="submit" disabled={!canSubmitEmailChange || updatingEmail} className={styles.primaryBtn}>
            {updatingEmail ? 'Отправляем запрос...' : 'Изменить email'}
          </button>
        </form>
      </section>

      <section className={styles.card}>
        <div className={styles.securityHead}>
          <h3 className={styles.cardTitle}>Журнал безопасности</h3>
          <button type="button" onClick={loadSecurityEvents} className={styles.secondaryBtn} disabled={eventsLoading}>
            {eventsLoading ? 'Обновляем...' : 'Обновить'}
          </button>
        </div>
        <p className={styles.mutedText}>
          Последние действия аккаунта: вход, выход, смена пароля и запросы восстановления.
        </p>
        {eventsLoading ? (
          <p className={styles.historyEmpty}>Загрузка журнала...</p>
        ) : events.length === 0 ? (
          <p className={styles.historyEmpty}>Пока нет событий безопасности.</p>
        ) : (
          <ul className={styles.historyList}>
            {events.map((event) => (
              <li key={event.id} className={styles.historyItem}>
                <div className={styles.historyTitle}>{getEventTitle(event.event_type)}</div>
                <div className={styles.historyMeta}>
                  <span>{formatEventDateTime(event.created_at)}</span>
                  {event.metadata?.source && <span>Источник: {String(event.metadata.source)}</span>}
                  {event.metadata?.method && <span>Метод: {String(event.metadata.method)}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${styles.card} ${styles.dangerCard}`}>
        <h3 className={styles.cardTitle}>Опасные действия</h3>
        <p className={styles.mutedText}>
          Эти действия могут прервать текущую работу.
        </p>
        {!confirmLogout ? (
          <button
            type="button"
            onClick={() => setConfirmLogout(true)}
            disabled={loggingOut}
            className={styles.dangerBtn}
          >
            Выйти из аккаунта
          </button>
        ) : (
          <div className={styles.confirmBox}>
            <p className={styles.confirmText}>
              Подтвердите выход: текущая сессия завершится, и вы вернетесь на главную страницу.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                onClick={() => setConfirmLogout(false)}
                disabled={loggingOut}
                className={styles.secondaryBtn}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleLogoutConfirmed}
                disabled={loggingOut}
                className={styles.dangerBtn}
              >
                {loggingOut ? 'Выходим...' : 'Подтвердить выход'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
