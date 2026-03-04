import React, { useState } from 'react';
import Link from 'next/link';

// Иконка приложения (как во вкладке браузера — favicon)
const AppLogoIcon: React.FC<{ size?: number }> = ({ size = 32 }) => (
  <img src="/favicon.svg" alt="Speakeasy" width={size} height={size} style={{ display: 'block' }} />
);

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

type SidebarTabKey = 'dashboard' | 'karaoke' | 'dictionary' | 'agent' | 'progress' | 'balance' | 'account';

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

function getEmailHue(email: string): number {
  let hash = 0;
  for (let i = 0; i < email.length; i += 1) {
    hash = (hash << 5) - hash + email.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

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
  const emailHue = getEmailHue((userEmail || 'guest').toLowerCase());
  const [expanded, setExpanded] = useState(false);
  const isAccountActive = activeTab === 'account';

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
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  width: '100%',
                  justifyContent: 'center',
                }}
              >
                <AppLogoIcon size={32} />
                <span
                  style={{
                    fontSize: '1rem',
                    fontWeight: 700,
                    letterSpacing: '-0.01em',
                    color: 'var(--sidebar-text)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Speakeasy
                </span>
              </div>
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
                <AppLogoIcon size={24} />
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
          <button
            type="button"
            onClick={() => onTabChange('account')}
            style={{
              padding: '0.55rem 0.7rem',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              gap: '0.7rem',
              background: isAccountActive
                ? `linear-gradient(145deg, hsl(${emailHue} 78% 62% / 0.24), hsl(${emailHue} 68% 38% / 0.14))`
                : `linear-gradient(145deg, hsl(${emailHue} 78% 62% / 0.14), hsl(${emailHue} 68% 38% / 0.08))`,
              border: isAccountActive
                ? `1px solid hsl(${emailHue} 88% 72% / 0.72)`
                : `1px solid hsl(${emailHue} 82% 66% / 0.42)`,
              boxShadow: isAccountActive
                ? '0 12px 28px rgba(0, 0, 0, 0.25)'
                : '0 8px 22px rgba(0, 0, 0, 0.2)',
              transition: 'all 0.25s ease, filter 0.2s ease',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = `linear-gradient(145deg, hsl(${emailHue} 78% 62% / 0.2), hsl(${emailHue} 68% 38% / 0.12))`;
              e.currentTarget.style.borderColor = `hsl(${emailHue} 88% 72% / 0.72)`;
              e.currentTarget.style.filter = 'saturate(1.06)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = `linear-gradient(145deg, hsl(${emailHue} 78% 62% / 0.14), hsl(${emailHue} 68% 38% / 0.08))`;
              e.currentTarget.style.borderColor = isAccountActive
                ? `hsl(${emailHue} 88% 72% / 0.72)`
                : `hsl(${emailHue} 82% 66% / 0.42)`;
              e.currentTarget.style.filter = 'none';
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                background: `radial-gradient(circle at 28% 22%, hsl(${emailHue} 96% 86% / 0.42), transparent 55%), linear-gradient(145deg, hsl(${emailHue} 82% 64% / 0.32), hsl(${emailHue} 68% 38% / 0.2))`,
                border: `1px solid hsl(${emailHue} 82% 66% / 0.46)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8125rem',
                fontWeight: 700,
                color: '#f4fff8',
                flexShrink: 0,
                position: 'relative',
              }}
            >
              {emailInitial}
              <span
                style={{
                  position: 'absolute',
                  right: -1,
                  bottom: -1,
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: `hsl(${emailHue} 86% 66%)`,
                  border: '2px solid rgba(8, 8, 8, 0.95)',
                  boxShadow: `0 0 10px hsl(${emailHue} 86% 66% / 0.82)`,
                }}
              />
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
                  fontWeight: 600,
                  color: 'rgba(255, 255, 255, 0.95)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={userEmail || undefined}
              >
                {userEmail || 'Гость'}
              </div>
            </div>
          </button>
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
