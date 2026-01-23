import React, { useState } from 'react';
import Link from 'next/link';

type SidebarTabKey = 'dashboard' | 'karaoke' | 'dictionary' | 'call';

export interface SidebarProps {
  activeTab: SidebarTabKey;
  onTabChange: (tab: SidebarTabKey) => void;
  onLogout: () => void;
  userEmail?: string | null;
}

// Цветовые схемы для каждой вкладки
const tabColors: Record<SidebarTabKey, {
  primary: string;
  secondary: string;
  gradient: string;
  glow: string;
  border: string;
  bg: string;
}> = {
  dashboard: {
    primary: '#6366f1', // Индиго
    secondary: '#818cf8',
    gradient: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(129, 140, 248, 0.15) 100%)',
    glow: 'rgba(99, 102, 241, 0.4)',
    border: 'rgba(99, 102, 241, 0.4)',
    bg: 'rgba(99, 102, 241, 0.12)',
  },
  karaoke: {
    primary: '#ec4899', // Розовый
    secondary: '#f472b6',
    gradient: 'linear-gradient(135deg, rgba(236, 72, 153, 0.2) 0%, rgba(244, 114, 182, 0.15) 100%)',
    glow: 'rgba(236, 72, 153, 0.4)',
    border: 'rgba(236, 72, 153, 0.4)',
    bg: 'rgba(236, 72, 153, 0.12)',
  },
  dictionary: {
    primary: '#10b981', // Изумрудный
    secondary: '#34d399',
    gradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(52, 211, 153, 0.15) 100%)',
    glow: 'rgba(16, 185, 129, 0.4)',
    border: 'rgba(16, 185, 129, 0.4)',
    bg: 'rgba(16, 185, 129, 0.12)',
  },
  call: {
    primary: '#f59e0b', // Янтарный
    secondary: '#fbbf24',
    gradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(251, 191, 36, 0.15) 100%)',
    glow: 'rgba(245, 158, 11, 0.4)',
    border: 'rgba(245, 158, 11, 0.4)',
    bg: 'rgba(245, 158, 11, 0.12)',
  },
};

const tabs: { key: SidebarTabKey; label: string; description: string; icon: string }[] = [
  {
    key: 'dashboard',
    label: 'Панель управления',
    description: 'Общая сводка и быстрый доступ',
    icon: '📊',
  },
  {
    key: 'karaoke',
    label: 'Караоке',
    description: 'Пойте и улучшайте произношение',
    icon: '🎤',
  },
  {
    key: 'dictionary',
    label: 'Словарь',
    description: 'Ваши слова и выражения',
    icon: '📚',
  },
  {
    key: 'call',
    label: 'Звонок с AI',
    description: 'Практикуйте разговорный английский',
    icon: '📞',
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  onLogout,
  userEmail,
}) => {
  const emailInitial = (userEmail || '').trim().charAt(0).toUpperCase() || '?';
  const [expanded, setExpanded] = useState(false);
  const [hoveredTab, setHoveredTab] = useState<SidebarTabKey | null>(null);

  return (
    <aside
      style={{
        width: expanded ? '280px' : '80px',
        minWidth: expanded ? '260px' : '80px',
        maxWidth: expanded ? '300px' : '80px',
        height: '100vh',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        padding: expanded ? '1.5rem 1rem' : '1.5rem 0.75rem',
        background: 'linear-gradient(180deg, #1a1a1a 0%, #1f1f1f 100%)',
        color: '#f9fafb',
        boxShadow: '2px 0 24px rgba(0, 0, 0, 0.4), inset -1px 0 0 rgba(255, 255, 255, 0.05)',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        boxSizing: 'border-box',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
      }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => {
        setExpanded(false);
        setHoveredTab(null);
      }}
    >
      {/* Декоративные градиенты сверху - многослойные для глубины */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '200px',
          background: `linear-gradient(180deg, 
            rgba(139, 92, 246, 0.12) 0%, 
            rgba(99, 102, 241, 0.08) 25%,
            rgba(236, 72, 153, 0.06) 50%,
            rgba(16, 185, 129, 0.04) 75%,
            transparent 100%)`,
          pointerEvents: 'none',
          opacity: expanded ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      />
      {/* Дополнительный цветной акцент для активной вкладки */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '80px',
          background: tabColors[activeTab].gradient,
          pointerEvents: 'none',
          opacity: expanded ? 0.6 : 0,
          transition: 'opacity 0.3s ease',
          filter: 'blur(20px)',
        }}
      />

      {/* Верхний блок логотипа / брендинга */}
      <div style={{ marginBottom: '2.5rem', position: 'relative', zIndex: 1 }}>
        <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: expanded ? '0.875rem' : 0,
              cursor: 'pointer',
              transition: 'transform 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.02)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: `linear-gradient(135deg, 
                  rgba(139, 92, 246, 0.25) 0%, 
                  rgba(99, 102, 241, 0.2) 30%,
                  rgba(236, 72, 153, 0.2) 60%,
                  rgba(16, 185, 129, 0.2) 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(139, 92, 246, 0.4)',
                boxShadow: `0 4px 16px rgba(139, 92, 246, 0.2), 
                  0 2px 8px rgba(99, 102, 241, 0.15),
                  inset 0 1px 0 rgba(255, 255, 255, 0.15)`,
                transition: 'all 0.2s ease',
              }}
            >
              <span style={{ fontSize: '1.5rem', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}>♪</span>
            </div>
            {expanded && (
              <div>
                <div
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    background: 'linear-gradient(135deg, #f9fafb 0%, #e5e7eb 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Speakeasy
                </div>
                <div
                  style={{
                    fontSize: '0.7rem',
                    color: 'rgba(148, 163, 184, 0.7)',
                    marginTop: '0.1rem',
                    letterSpacing: '0.05em',
                  }}
                >
                  Language Learning
                </div>
              </div>
            )}
          </div>
        </Link>
      </div>

      {/* Раздел навигации по вкладкам */}
      <div style={{ marginBottom: '1.5rem', position: 'relative', zIndex: 1 }}>
        {expanded && (
          <p
            style={{
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              color: 'rgba(148, 163, 184, 0.6)',
              marginBottom: '1rem',
              paddingLeft: '0.5rem',
              fontWeight: 600,
            }}
          >
            Разделы
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const isHovered = hoveredTab === tab.key;
            const colors = tabColors[tab.key];
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTabChange(tab.key)}
                onMouseEnter={() => setHoveredTab(tab.key)}
                onMouseLeave={() => setHoveredTab(null)}
                title={!expanded ? tab.label : undefined}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: expanded ? '0.875rem' : 0,
                  padding: expanded ? '0.875rem 0.75rem' : '0.875rem 0',
                  justifyContent: expanded ? 'flex-start' : 'center',
                  marginBottom: 0,
                  borderRadius: '12px',
                  border: isActive
                    ? `1px solid ${colors.border}`
                    : isHovered
                    ? `1px solid ${colors.border.replace('0.4', '0.25')}`
                    : '1px solid transparent',
                  background: isActive
                    ? colors.gradient
                    : isHovered
                    ? colors.bg
                    : 'transparent',
                  color: isActive ? '#f9fafb' : isHovered ? 'rgba(229, 231, 235, 0.95)' : 'rgba(209, 213, 219, 0.8)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative',
                  boxShadow: isActive
                    ? `0 4px 16px ${colors.glow}, 0 2px 8px ${colors.glow.replace('0.4', '0.2')}, inset 0 1px 0 rgba(255, 255, 255, 0.15)`
                    : isHovered
                    ? `0 2px 12px ${colors.glow.replace('0.4', '0.15')}`
                    : 'none',
                  transform: isHovered ? 'translateX(2px)' : 'translateX(0)',
                }}
              >
                {/* Активный индикатор слева с цветом вкладки */}
                {isActive && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '4px',
                      height: '70%',
                      background: `linear-gradient(180deg, ${colors.primary} 0%, ${colors.secondary} 100%)`,
                      borderRadius: '0 4px 4px 0',
                      boxShadow: `0 0 12px ${colors.glow}, 0 0 6px ${colors.primary}`,
                    }}
                  />
                )}
                {/* Цветной индикатор при hover (если не активен) */}
                {!isActive && isHovered && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '2px',
                      height: '50%',
                      background: colors.primary,
                      borderRadius: '0 2px 2px 0',
                      opacity: 0.6,
                    }}
                  />
                )}
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    minWidth: '36px',
                    borderRadius: '10px',
                    background: isActive
                      ? `linear-gradient(135deg, ${colors.primary}22 0%, ${colors.secondary}1a 100%)`
                      : isHovered
                      ? colors.bg
                      : 'rgba(39, 39, 42, 0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.3rem',
                    border: isActive
                      ? `1px solid ${colors.border}`
                      : isHovered
                      ? `1px solid ${colors.border.replace('0.4', '0.2')}`
                      : '1px solid rgba(255, 255, 255, 0.05)',
                    boxShadow: isActive
                      ? `0 2px 10px ${colors.glow.replace('0.4', '0.25')}, inset 0 1px 0 rgba(255, 255, 255, 0.15)`
                      : isHovered
                      ? `0 1px 6px ${colors.glow.replace('0.4', '0.15')}, inset 0 1px 0 rgba(255, 255, 255, 0.08)`
                      : 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                    transition: 'all 0.2s ease',
                    transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                  }}
                >
                  {tab.icon}
                </div>
                {expanded && (
                  <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '0.95rem',
                        fontWeight: isActive ? 600 : 500,
                        lineHeight: 1.4,
                        marginBottom: '0.15rem',
                      }}
                    >
                      {tab.label}
                    </div>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: isActive 
                          ? `${colors.secondary}dd` 
                          : isHovered 
                          ? `${colors.primary}aa` 
                          : 'rgba(148, 163, 184, 0.5)',
                        lineHeight: 1.3,
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                        transition: 'color 0.2s ease',
                      }}
                    >
                      {tab.description}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Заполнитель, чтобы вытолкнуть нижний блок вниз */}
      <div style={{ flex: 1 }} />

      {/* Информация о текущем пользователе */}
      <div
        style={{
          marginBottom: '1rem',
          padding: expanded ? '1rem 0.75rem' : '0.75rem 0.5rem',
          borderRadius: '14px',
          background: expanded
            ? 'linear-gradient(135deg, rgba(39, 39, 42, 0.8) 0%, rgba(24, 24, 27, 0.9) 100%)'
            : 'rgba(39, 39, 42, 0.4)',
          border: expanded ? '1px solid rgba(139, 92, 246, 0.2)' : '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: expanded ? 'flex-start' : 'center',
          gap: expanded ? '0.75rem' : 0,
          boxShadow: expanded
            ? '0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
            : 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
          transition: 'all 0.25s ease',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: '36px',
            height: '36px',
            minWidth: '36px',
            borderRadius: '10px',
            background: `linear-gradient(135deg, 
              rgba(139, 92, 246, 0.35) 0%, 
              rgba(99, 102, 241, 0.3) 30%,
              rgba(236, 72, 153, 0.25) 60%,
              rgba(16, 185, 129, 0.25) 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(139, 92, 246, 0.5)',
            fontSize: '0.9rem',
            fontWeight: 700,
            color: '#f9fafb',
            boxShadow: `0 2px 10px rgba(139, 92, 246, 0.25), 
              0 1px 4px rgba(99, 102, 241, 0.2),
              inset 0 1px 0 rgba(255, 255, 255, 0.25)`,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Декоративное свечение внутри аватара */}
          <div
            style={{
              position: 'absolute',
              top: '-50%',
              left: '-50%',
              width: '200%',
              height: '200%',
              background: `radial-gradient(circle, 
                rgba(139, 92, 246, 0.3) 0%, 
                transparent 70%)`,
              opacity: 0.6,
            }}
          />
          <span style={{ position: 'relative', zIndex: 1 }}>{emailInitial}</span>
        </div>
        {expanded && (
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: '0.7rem',
                color: 'rgba(148, 163, 184, 0.7)',
                marginBottom: '0.25rem',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                fontWeight: 600,
              }}
            >
              Аккаунт
            </div>
            <div
              style={{
                fontSize: '0.85rem',
                fontWeight: 500,
                color: '#e5e7eb',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                overflow: 'hidden',
              }}
              title={userEmail || undefined}
            >
              {userEmail || 'Неизвестный пользователь'}
            </div>
          </div>
        )}
      </div>

      {/* Кнопка выхода внизу сайдбара */}
      <div
        style={{
          paddingTop: '1rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <button
          type="button"
          onClick={onLogout}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(239, 68, 68, 0.3), 0 2px 8px rgba(220, 38, 38, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(239, 68, 68, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)';
          }}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: expanded ? 'space-between' : 'center',
            padding: expanded ? '0.875rem 1rem' : '0.75rem 0.5rem',
            borderRadius: '12px',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(220, 38, 38, 0.12) 50%, rgba(185, 28, 28, 0.1) 100%)',
            color: '#fca5a5',
            fontSize: '0.9rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 2px 8px rgba(239, 68, 68, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Декоративный градиент при hover */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, transparent 100%)',
              opacity: 0,
              transition: 'opacity 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0';
            }}
          />
          {expanded && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, position: 'relative', zIndex: 1 }}>
              <span>Выйти</span>
            </span>
          )}
          <span style={{ fontSize: '1.2rem', filter: 'drop-shadow(0 1px 3px rgba(239, 68, 68, 0.4))', position: 'relative', zIndex: 1 }}>⏏</span>
        </button>
      </div>
    </aside>
  );
};

