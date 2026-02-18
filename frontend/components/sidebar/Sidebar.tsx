import React, { useState } from 'react';
import Link from 'next/link';

// Текст и волна в одном стиле для логотипа (полная и компактная версии)
const LOGO_FONT = '"Segoe UI", "SF Pro Display", system-ui, sans-serif';
const LOGO_TEXT_PROPS = { x: 24, y: 128, fontSize: 72, fontWeight: 700, fontFamily: LOGO_FONT };

// Выразительная звуковая волна: большая амплитуда, плавные кривые (центр ~100, амплитуда ~28)
const SOUND_WAVE_PATH_MAIN =
  'M0,100 C25,58 50,142 75,100 C100,58 125,142 150,100 C175,58 200,142 225,100 C250,58 275,142 300,100 C325,58 350,142 375,100 C400,58 425,142 450,100 C475,58 500,142 525,100 C550,58 575,142 600,100';
// Смещённые волны для объёма (разные фазы)
const SOUND_WAVE_PATH_UP =
  'M0,82 C30,52 60,112 90,82 C120,52 150,112 180,82 C210,52 240,112 270,82 C300,52 330,112 360,82 C390,52 420,112 450,82 C480,52 510,112 540,82 C570,52 600,82';
const SOUND_WAVE_PATH_DOWN =
  'M0,118 C30,88 60,148 90,118 C120,88 150,148 180,118 C210,88 240,148 270,118 C300,88 330,148 360,118 C390,88 420,148 450,118 C480,88 510,148 540,118 C570,88 600,118';

// Логотип Speakeasy: чёткий текст + звуковая волна, проходящая сквозь буквы (clipPath)
const SpeakeasyLogoFull: React.FC<{ width?: number }> = ({ width = 200 }) => {
  const height = (width / 600) * 200;
  return (
    <svg width={width} height={height} viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg" aria-label="Speakeasy" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="logoTextGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#2e8b57" />
          <stop offset="100%" stopColor="#3cb371" />
        </linearGradient>
        <linearGradient id="logoWaveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#b8ffb8" stopOpacity={0.95} />
          <stop offset="50%" stopColor="#e8fff0" stopOpacity={1} />
          <stop offset="100%" stopColor="#b8ffb8" stopOpacity={0.95} />
        </linearGradient>
        <clipPath id="logoLettersClip">
          <text {...LOGO_TEXT_PROPS}>Speakeasy</text>
        </clipPath>
      </defs>
      {/* Буквы — чёткий текст с градиентом */}
      <text {...LOGO_TEXT_PROPS} fill="url(#logoTextGrad)">Speakeasy</text>
      {/* Звуковая волна, обрезанная по форме букв — выразительный пучок волн */}
      <g clipPath="url(#logoLettersClip)">
        <path d={SOUND_WAVE_PATH_UP} fill="none" stroke="url(#logoWaveGrad)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
        <path d={SOUND_WAVE_PATH_MAIN} fill="none" stroke="url(#logoWaveGrad)" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
        <path d={SOUND_WAVE_PATH_DOWN} fill="none" stroke="url(#logoWaveGrad)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
      </g>
    </svg>
  );
};

// Компактный логотип: тот же дизайн, вписан в квадрат и отцентрирован для кубика свёрнутого сайдбара
const SpeakeasyLogoCompact: React.FC<{ size?: number }> = ({ size = 28 }) => {
  const scale = 32 / 600; // вписать ширину 600 в 32
  const logoH = 200 * scale; // ~10.67
  const offsetY = (32 - logoH) / 2;   // центр по вертикали
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-label="Speakeasy" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="logoTextGradC" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#2e8b57" />
          <stop offset="100%" stopColor="#3cb371" />
        </linearGradient>
        <linearGradient id="logoWaveGradC" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#b8ffb8" stopOpacity={0.95} />
          <stop offset="50%" stopColor="#e8fff0" stopOpacity={1} />
          <stop offset="100%" stopColor="#b8ffb8" stopOpacity={0.95} />
        </linearGradient>
        <clipPath id="logoLettersClipC">
          <text {...LOGO_TEXT_PROPS}>Speakeasy</text>
        </clipPath>
      </defs>
      <g transform={`translate(0, ${offsetY}) scale(${scale})`}>
        <text {...LOGO_TEXT_PROPS} fill="url(#logoTextGradC)">Speakeasy</text>
        <g clipPath="url(#logoLettersClipC)">
          <path d={SOUND_WAVE_PATH_UP} fill="none" stroke="url(#logoWaveGradC)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
          <path d={SOUND_WAVE_PATH_MAIN} fill="none" stroke="url(#logoWaveGradC)" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
          <path d={SOUND_WAVE_PATH_DOWN} fill="none" stroke="url(#logoWaveGradC)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
        </g>
      </g>
    </svg>
  );
};

const DashboardIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
  </svg>
);

export const KaraokeIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 1C10.62 1 9.5 2.12 9.5 3.5V10.5C9.5 11.88 10.62 13 12 13C13.38 13 14.5 11.88 14.5 10.5V3.5C14.5 2.12 13.38 1 12 1Z" />
    <path d="M12 13V16" />
    <path d="M12 16C12 16 8 16.5 8 19" />
    <path d="M12 16C12 16 16 16.5 16 19" />
    <path d="M6 19H18" />
    <path d="M9 7H10" opacity="0.5" />
    <path d="M9 10H10" opacity="0.5" />
  </svg>
);

export const DictionaryIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 19.5C4 18.1 5.1 17 6.5 17H20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M6.5 2H20V22H6.5C5.1 22 4 20.9 4 19.5V4.5C4 3.1 5.1 2 6.5 2Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M8 7H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M8 11H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const AgentIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C10.9 2 10 2.9 10 4V12C10 13.1 10.9 14 12 14C13.1 14 14 13.1 14 12V4C14 2.9 13.1 2 12 2Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M19 10V12C19 15.9 15.9 19 12 19C8.1 19 5 15.9 5 12V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    <path d="M12 19V22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const ProgressIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 3v18h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 14l4-4 4 4 5-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const BalanceIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const LogoutIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 21H5C4.47 21 3.96 20.79 3.59 20.41C3.21 20.04 3 19.53 3 19V5C3 4.47 3.21 3.96 3.59 3.59C3.96 3.21 4.47 3 5 3H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M16 17L21 12L16 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21 12H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

type SidebarTabKey = 'dashboard' | 'karaoke' | 'dictionary' | 'agent' | 'progress' | 'balance';

export interface SidebarProps {
  activeTab: SidebarTabKey;
  onTabChange: (tab: SidebarTabKey) => void;
  onLogout: () => void;
  userEmail?: string | null;
}

const PALETTE = {
  accent: '#68c995',
  accentStrong: '#46af7d',
  accentSoft: 'rgba(104, 201, 149, 0.16)',
  shadow: '0 12px 32px rgba(70, 175, 125, 0.18)',
  buttonShadow: '0 6px 18px rgba(70, 175, 125, 0.12)',
  hoverShadow: '0 4px 12px rgba(70, 175, 125, 0.1)',
};

const RADIUS = 16;

const tabs: { key: SidebarTabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'dashboard', label: 'Главная', icon: <DashboardIcon size={20} /> },
  { key: 'karaoke', label: 'Караоке', icon: <KaraokeIcon size={20} /> },
  { key: 'dictionary', label: 'Словарь', icon: <DictionaryIcon size={20} /> },
  { key: 'agent', label: 'Собеседник', icon: <AgentIcon size={20} /> },
  { key: 'progress', label: 'Прогресс', icon: <ProgressIcon size={20} /> },
  { key: 'balance', label: 'Баланс', icon: <BalanceIcon size={20} /> },
];


export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  onLogout,
  userEmail,
}) => {
  const emailInitial = (userEmail || '').trim().charAt(0).toUpperCase() || '?';
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      style={{
        width: expanded ? 280 : 76,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        padding: '1rem 0.65rem',
        background: 'var(--sidebar-bg)',
        color: 'var(--sidebar-text)',
        boxSizing: 'border-box',
        transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s ease, color 0.3s ease, box-shadow 0.3s ease',
        overflow: 'hidden',
        position: 'relative',
        borderRight: `1px solid var(--sidebar-border)`,
        boxShadow: '4px 0 24px rgba(0, 0, 0, 0.1)',
      }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* Акцентная полоска справа */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 1,
          height: '100%',
          background: `var(--sidebar-accent)`,
          pointerEvents: 'none',
          opacity: 0.5,
        }}
      />

      {/* Логотип */}
      <div style={{ marginBottom: '1.4rem', padding: '0 0.75rem', position: 'relative', zIndex: 1 }}>
        <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: expanded ? '0.35rem 0.75rem' : '0.4rem',
              borderRadius: 8,
              transition: 'background 0.2s ease, transform 0.18s ease',
              position: 'relative',
              border: 'none',
              background: expanded ? 'var(--card)' : 'transparent',
              width: expanded ? '100%' : undefined,
              boxSizing: 'border-box',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = PALETTE.accentSoft;
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = PALETTE.hoverShadow;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = expanded ? 'var(--card)' : 'transparent';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {expanded ? (
              <SpeakeasyLogoFull width={168} />
            ) : (
              <div
                style={{
                  width: 36,
                  height: 36,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--sidebar-active)',
                  borderRadius: 8,
                  border: 'none',
                  flexShrink: 0,
                  transition: 'all 0.25s ease',
                }}
              >
                <SpeakeasyLogoCompact size={24} />
              </div>
            )}
          </div>
        </Link>
      </div>

      {/* Навигация */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, padding: '0 0.75rem', position: 'relative', zIndex: 1 }}>
        {expanded && (
          <div
            style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--sidebar-text)',
              opacity: 0.6,
              padding: '0 1rem',
              marginBottom: 8,
            }}
          >
            Навигация
          </div>
        )}
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              title={!expanded ? tab.label : undefined}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: expanded ? '0.875rem' : 0,
                padding: expanded ? '0.75rem 1rem' : '0.75rem',
                justifyContent: expanded ? 'flex-start' : 'center',
                borderRadius: 8,
                border: 'none',
                background: isActive
                  ? 'var(--sidebar-active)'
                  : 'transparent',
                color: isActive ? 'var(--sidebar-text)' : 'var(--sidebar-text)',
                opacity: isActive ? 1 : 0.7,
                cursor: 'pointer',
                fontSize: '0.9375rem',
                fontWeight: isActive ? 600 : 500,
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                textAlign: 'left',
                position: 'relative',
                boxShadow: isActive ? '0 2px 8px rgba(0, 0, 0, 0.1)' : 'none',
                outline: 'none',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--sidebar-hover)';
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.transform = 'translateX(4px)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.opacity = '0.7';
                  e.currentTarget.style.transform = 'translateX(0)';
                }
              }}
            >
              {isActive && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 4,
                    height: '56%',
                    background: 'var(--sidebar-accent)',
                    borderRadius: '0 4px 4px 0',
                  }}
                />
              )}
              <span
                style={{
                  width: 40,
                  height: 40,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  borderRadius: 8,
                  background: isActive ? 'var(--sidebar-active)' : 'var(--sidebar-hover)',
                  color: 'inherit',
                  transition: 'all 0.2s ease',
                }}
              >
                {tab.icon}
              </span>
              {expanded && (
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {tab.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Нижний блок: пользователь и выход */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '1.5rem 0.75rem 1.25rem',
          marginTop: '0.75rem',
          borderTop: `1px solid var(--sidebar-border)`,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {expanded && (
          <div
            style={{
              padding: '0.65rem 0.75rem',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              background: 'var(--sidebar-hover)',
              border: `1px solid var(--sidebar-border)`,
              transition: 'all 0.25s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--sidebar-active)';
              e.currentTarget.style.borderColor = 'var(--sidebar-accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--sidebar-hover)';
              e.currentTarget.style.borderColor = 'var(--sidebar-border)';
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 6,
                background: 'var(--sidebar-active)',
                border: `1px solid var(--sidebar-border)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8125rem',
                fontWeight: 700,
                color: 'var(--sidebar-text)',
                flexShrink: 0,
              }}
            >
              {emailInitial}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: '0.625rem',
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--sidebar-text)',
                  opacity: 0.6,
                  marginBottom: 2,
                }}
              >
                Аккаунт
              </div>
              <div
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  color: 'var(--sidebar-text)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={userEmail || undefined}
              >
                {userEmail || 'Гость'}
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onLogout}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: expanded ? 'flex-start' : 'center',
            gap: expanded ? '0.875rem' : 0,
            padding: expanded ? '0.75rem 1rem' : '0.75rem',
            borderRadius: 8,
            border: 'none',
            background: 'transparent',
            color: 'rgba(241, 241, 244, 0.6)',
            cursor: 'pointer',
            fontSize: '0.9375rem',
            fontWeight: 500,
            transition: 'all 0.25s ease',
            outline: 'none',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
            e.currentTarget.style.opacity = '1';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.opacity = '0.7';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <span
            style={{
              width: 40,
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              borderRadius: 8,
              background: 'var(--sidebar-hover)',
              color: 'inherit',
              transition: 'all 0.2s ease',
            }}
          >
            <LogoutIcon size={20} />
          </span>
          {expanded && <span>Выйти</span>}
        </button>
      </div>
    </aside>
  );
};
