'use client'

import { useState } from 'react'
import type { User } from '@supabase/supabase-js'

interface SidebarProps {
  user: User
  onLogout: () => void
  nodeCount: number
  onCollapseChange?: (collapsed: boolean) => void
}

export default function Sidebar({ user, onLogout, nodeCount, onCollapseChange }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  const handleToggle = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    onCollapseChange?.(newState)
  }

  return (
    <aside
      style={{
        width: isCollapsed ? '80px' : '280px',
        minHeight: '100vh',
        background: '#1f2937',
        color: 'white',
        padding: '1.5rem',
        transition: 'width 0.3s ease',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 100
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          {!isCollapsed && (
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700' }}>
              Knowledge Graph
            </h1>
          )}
          <button
            onClick={handleToggle}
            style={{
              background: 'transparent',
              border: '1px solid #4b5563',
              color: 'white',
              borderRadius: '6px',
              padding: '0.5rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px'
            }}
            title={isCollapsed ? 'Развернуть' : 'Свернуть'}
          >
            {isCollapsed ? '→' : '←'}
          </button>
        </div>
        {!isCollapsed && (
          <p style={{ margin: 0, color: '#9ca3af', fontSize: '0.875rem' }}>
            Управление идеями
          </p>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1 }}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          <li style={{ marginBottom: '0.5rem' }}>
            <a
              href="#"
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.75rem',
                borderRadius: '8px',
                color: 'white',
                textDecoration: 'none',
                background: '#374151',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#4b5563'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#374151'
              }}
            >
              <span style={{ marginRight: isCollapsed ? 0 : '0.75rem', fontSize: '1.25rem' }}>📝</span>
              {!isCollapsed && <span>Все заметки</span>}
            </a>
          </li>
          <li style={{ marginBottom: '0.5rem' }}>
            <a
              href="#"
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.75rem',
                borderRadius: '8px',
                color: '#9ca3af',
                textDecoration: 'none',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#374151'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <span style={{ marginRight: isCollapsed ? 0 : '0.75rem', fontSize: '1.25rem' }}>🔗</span>
              {!isCollapsed && <span>Связи</span>}
            </a>
          </li>
          <li style={{ marginBottom: '0.5rem' }}>
            <a
              href="#"
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.75rem',
                borderRadius: '8px',
                color: '#9ca3af',
                textDecoration: 'none',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#374151'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <span style={{ marginRight: isCollapsed ? 0 : '0.75rem', fontSize: '1.25rem' }}>🏷️</span>
              {!isCollapsed && <span>Теги</span>}
            </a>
          </li>
          <li style={{ marginBottom: '0.5rem' }}>
            <a
              href="#"
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.75rem',
                borderRadius: '8px',
                color: '#9ca3af',
                textDecoration: 'none',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#374151'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <span style={{ marginRight: isCollapsed ? 0 : '0.75rem', fontSize: '1.25rem' }}>🔍</span>
              {!isCollapsed && <span>Поиск</span>}
            </a>
          </li>
        </ul>
      </nav>

      {/* Stats */}
      {!isCollapsed && (
        <div style={{
          padding: '1rem',
          background: '#374151',
          borderRadius: '8px',
          marginBottom: '1rem'
        }}>
          <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
            Статистика
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: '600' }}>
            {nodeCount} заметок
          </div>
        </div>
      )}

      {/* User section */}
      <div style={{
        paddingTop: '1rem',
        borderTop: '1px solid #374151'
      }}>
        {!isCollapsed && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
              Пользователь
            </div>
            <div style={{ fontSize: '0.875rem', wordBreak: 'break-all' }}>
              {user.email}
            </div>
          </div>
        )}
        <button
          onClick={onLogout}
          style={{
            width: '100%',
            padding: '0.75rem',
            background: '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem'
          }}
        >
          {!isCollapsed && <span>🚪</span>}
          {isCollapsed ? '🚪' : 'Выйти'}
        </button>
      </div>
    </aside>
  )
}
