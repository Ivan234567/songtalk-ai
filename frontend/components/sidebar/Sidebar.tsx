import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';

const AppLogoIcon: React.FC<{ size?: number }> = ({ size = 32 }) => (
  <img src="/logo-head.svg" alt="Speakeasy" width={size} height={size} style={{ display: 'block', objectFit: 'contain' }} />
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

const SupportIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3C7.03 3 3 6.58 3 11C3 13.2 3.98 15.2 5.6 16.68C5.44 18.08 4.86 19.44 4 20.5C5.66 20.12 7.16 19.42 8.4 18.5C9.52 18.84 10.73 19 12 19C16.97 19 21 15.42 21 11C21 6.58 16.97 3 12 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9.5 10.5H9.51" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M12 10.5H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M14.5 10.5H14.51" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
  { key: 'agent', label: 'Практика', icon: <AgentIcon size={20} /> },
  { key: 'dictionary', label: 'Словарь', icon: <DictionaryIcon size={20} /> },
  { key: 'karaoke', label: 'Караоке', icon: <KaraokeIcon size={20} /> },
  { key: 'progress', label: 'Прогресс', icon: <ProgressIcon size={20} /> },
  { key: 'balance', label: 'Баланс', icon: <BalanceIcon size={20} /> },
];

const TELEGRAM_SUPPORT = 'https://t.me/SPEAKEASY_SUPPORT';


export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  onLogout,
  userEmail,
}) => {
  const emailInitial = (userEmail || '').trim().charAt(0).toUpperCase() || '?';
  const emailHue = getEmailHue((userEmail || 'guest').toLowerCase());
  const [expanded, setExpanded] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const isAccountActive = activeTab === 'account';

  useEffect(() => {
    if (!qrModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setQrModalOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [qrModalOpen]);

  return (
    <aside
      style={{
        width: expanded ? 280 : 76,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        padding: '0.7rem 0.55rem',
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
      <div style={{ marginBottom: '0.95rem', padding: '0 0.6rem', position: 'relative', zIndex: 1 }}>
        <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: expanded ? '0.3rem 0.65rem' : '0.35rem',
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
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                  }}
                >
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
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: 16,
                      minWidth: 34,
                      padding: '0 0.34rem',
                      borderRadius: 999,
                      border: '1px solid rgba(245, 158, 11, 0.55)',
                      background: 'rgba(245, 158, 11, 0.18)',
                      color: 'rgba(255, 233, 183, 0.95)',
                      fontSize: '0.55rem',
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      lineHeight: 1,
                    }}
                    title="Beta"
                    aria-label="Beta"
                  >
                    Beta
                  </span>
                </div>
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
                  position: 'relative',
                }}
              >
                <AppLogoIcon size={24} />
                <span
                  style={{
                    position: 'absolute',
                    top: -5,
                    right: -6,
                    width: 14,
                    height: 14,
                    borderRadius: 999,
                    border: '1px solid rgba(245, 158, 11, 0.55)',
                    background: 'rgba(245, 158, 11, 0.18)',
                    color: 'rgba(255, 233, 183, 0.95)',
                    fontSize: '0.46rem',
                    fontWeight: 700,
                    letterSpacing: '0.03em',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                  }}
                  title="Beta"
                  aria-label="Beta"
                >
                  B
                </span>
              </div>
            )}
          </div>
        </Link>
      </div>

      {/* Навигация */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '0 0.6rem', position: 'relative', zIndex: 1, minHeight: 0 }}>
        {expanded && (
          <div
            style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--sidebar-text)',
              opacity: 0.6,
              padding: '0 0.85rem',
              marginBottom: 6,
            }}
          >
            Навигация
          </div>
        )}
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const collapsed = !expanded;
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
                padding: expanded ? '0.58rem 0.85rem' : '0.58rem',
                justifyContent: expanded ? 'flex-start' : 'center',
                borderRadius: 8,
                border: 'none',
                background: expanded && isActive ? 'var(--sidebar-active)' : 'transparent',
                color: isActive ? 'var(--sidebar-text)' : 'var(--sidebar-text)',
                opacity: isActive ? 1 : 0.7,
                cursor: 'pointer',
                fontSize: '0.9375rem',
                fontWeight: isActive ? 600 : 500,
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                textAlign: 'left',
                position: 'relative',
                boxShadow: expanded && isActive ? '0 2px 8px rgba(0, 0, 0, 0.1)' : 'none',
                outline: 'none',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--sidebar-hover)';
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.transform = expanded ? 'translateX(4px)' : 'translateX(0)';
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
              {isActive && expanded && (
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
                  boxSizing: 'border-box',
                  borderRadius: 8,
                  background: isActive ? 'var(--sidebar-active)' : 'var(--sidebar-hover)',
                  border: '1px solid transparent',
                  outline: isActive && collapsed ? '1px solid var(--sidebar-accent)' : 'none',
                  outlineOffset: 0,
                  color: 'inherit',
                  boxShadow: 'none',
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
          gap: 6,
          padding: '0.7rem 0.6rem 0.7rem',
          marginTop: '0.45rem',
          borderTop: `1px solid var(--sidebar-border)`,
          position: 'relative',
          zIndex: 1,
          flexShrink: 0,
        }}
      >
        {expanded && (
          <button
            type="button"
            onClick={() => onTabChange('account')}
            style={{
              padding: '0.42rem 0.58rem',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              gap: '0.55rem',
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
                  fontSize: '0.76rem',
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

        {expanded ? (
          <div
            style={{
              width: '100%',
              borderRadius: 10,
              border: '1px solid rgba(107, 240, 176, 0.26)',
              background: 'linear-gradient(145deg, rgba(107, 240, 176, 0.14), rgba(107, 240, 176, 0.06))',
              padding: '0.4rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.34rem',
            }}
          >
            <button
              type="button"
              onClick={() => setSupportOpen((prev) => !prev)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem',
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'inherit',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 7,
                    background: 'rgba(107, 240, 176, 0.16)',
                    border: '1px solid rgba(107, 240, 176, 0.35)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'rgba(107, 240, 176, 0.95)',
                    flexShrink: 0,
                  }}
                >
                  <SupportIcon size={16} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '0.55rem',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--sidebar-text)',
                      opacity: 0.7,
                    }}
                  >
                    Поддержка и идеи
                  </div>
                  <div
                    style={{
                      fontSize: '0.62rem',
                      color: 'var(--sidebar-text)',
                      opacity: 0.85,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title="@SPEAKEASY_SUPPORT"
                  >
                    @SPEAKEASY_SUPPORT
                  </div>
                </div>
              </div>
              <span
                aria-hidden="true"
                style={{
                  fontSize: '0.78rem',
                  color: 'rgba(255,255,255,0.7)',
                  transform: supportOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                  lineHeight: 1,
                  paddingRight: 2,
                }}
              >
                ▾
              </span>
            </button>

            <div
              style={{
                maxHeight: supportOpen ? 160 : 0,
                opacity: supportOpen ? 1 : 0,
                overflow: 'hidden',
                transition: 'max-height 0.24s ease, opacity 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.34rem',
              }}
            >
              <div
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                }}
              >
                <a
                  href={TELEGRAM_SUPPORT}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: 1,
                    borderRadius: 8,
                    border: '1px solid rgba(107, 240, 176, 0.35)',
                    background: 'rgba(107, 240, 176, 0.12)',
                    color: 'rgba(223, 255, 237, 0.98)',
                    fontSize: '0.66rem',
                    fontWeight: 600,
                    padding: '0.31rem 0.44rem',
                    textDecoration: 'none',
                  }}
                  title="Открыть поддержку в Telegram"
                >
                  Написать
                </a>
                <button
                  type="button"
                  onClick={() => setQrModalOpen(true)}
                  style={{
                    width: 44,
                    borderRadius: 8,
                    border: '1px solid rgba(255, 255, 255, 0.18)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'rgba(255, 255, 255, 0.9)',
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    padding: '0.3rem 0',
                    cursor: 'pointer',
                  }}
                  title="Показать QR-код Telegram"
                >
                  QR
                </button>
              </div>

              <a
                href={TELEGRAM_SUPPORT}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  borderRadius: 8,
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  background: 'rgba(255, 255, 255, 0.04)',
                  color: 'rgba(255, 255, 255, 0.88)',
                  fontSize: '0.64rem',
                  fontWeight: 600,
                  padding: '0.29rem 0.42rem',
                  textDecoration: 'none',
                }}
                title="Предложить идею в Telegram"
              >
                Предложить идею
              </a>
            </div>
          </div>
        ) : (
          <a
            href={TELEGRAM_SUPPORT}
            target="_blank"
            rel="noopener noreferrer"
            title="Поддержка и идеи"
            aria-label="Поддержка и идеи"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.65rem',
              padding: '0.5rem',
              borderRadius: 8,
              border: '1px solid rgba(107, 240, 176, 0.3)',
              background: 'rgba(107, 240, 176, 0.12)',
              color: 'rgba(107, 240, 176, 0.95)',
              textDecoration: 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(107, 240, 176, 0.16)',
                border: '1px solid rgba(107, 240, 176, 0.3)',
              }}
            >
              <SupportIcon size={18} />
            </span>
          </a>
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
            padding: expanded ? '0.58rem 0.85rem' : '0.58rem',
            borderRadius: 8,
            border: 'none',
            background: 'transparent',
            color: 'rgba(241, 241, 244, 0.6)',
            cursor: 'pointer',
            fontSize: '0.9375rem',
            fontSize: '0.88rem',
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

      {qrModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="QR-код Telegram поддержки"
          onClick={() => setQrModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.62)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(92vw, 420px)',
              borderRadius: 16,
              border: '1px solid rgba(107, 240, 176, 0.35)',
              background: 'linear-gradient(165deg, rgba(17, 24, 22, 0.96), rgba(10, 15, 14, 0.96))',
              padding: '1rem',
              boxShadow: '0 24px 80px rgba(0, 0, 0, 0.55)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.85rem',
            }}
          >
            <div
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem',
              }}
            >
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'rgba(223, 255, 237, 0.96)' }}>
                Поддержка и идеи
              </div>
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  background: 'rgba(255, 255, 255, 0.06)',
                  color: 'rgba(255, 255, 255, 0.9)',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  lineHeight: 1,
                }}
                aria-label="Закрыть модалку QR"
              >
                ×
              </button>
            </div>

            <a
              href={TELEGRAM_SUPPORT}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                width: 220,
                height: 220,
                borderRadius: 14,
                border: '1px solid rgba(107, 240, 176, 0.35)',
                background: 'rgba(0, 0, 0, 0.24)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 10,
                boxSizing: 'border-box',
              }}
              title="Открыть Telegram поддержку"
            >
              <QRCodeSVG
                value={TELEGRAM_SUPPORT}
                size={200}
                level="M"
                marginSize={1}
                fgColor="#6bf0b0"
                bgColor="transparent"
              />
            </a>

            <a
              href={TELEGRAM_SUPPORT}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '0.82rem',
                color: 'rgba(107, 240, 176, 0.95)',
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              @SPEAKEASY_SUPPORT
            </a>
          </div>
        </div>
      )}
    </aside>
  );
};
