'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [nodes, setNodes] = useState<any[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [newNodeTitle, setNewNodeTitle] = useState('')
  const [newNodeContent, setNewNodeContent] = useState('')
  const [editNodeTitle, setEditNodeTitle] = useState('')
  const [editNodeContent, setEditNodeContent] = useState('')
  const router = useRouter()

  const loadNodes = useCallback(async () => {
    if (!user) return

    const { data, error } = await supabase
      .from('nodes')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading nodes:', error)
    } else {
      setNodes(data || [])
    }
  }, [user])

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
    setLoading(false)

    if (!user) {
      router.push('/auth/login')
    }
  }

  useEffect(() => {
    checkUser()
  }, [])

  useEffect(() => {
    if (user) {
      loadNodes()

      // Подписка на изменения в nodes
      const channel = supabase
        .channel('nodes-changes')
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'nodes' },
          () => {
            loadNodes()
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [user, loadNodes])

  const handleCreateNode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !newNodeTitle.trim()) return

    const { data, error } = await supabase
      .from('nodes')
      .insert([
        {
          title: newNodeTitle,
          content: newNodeContent,
          user_id: user.id
        }
      ])
      .select()
      .single()

    if (error) {
      console.error('Error creating node:', error)
      alert('Ошибка при создании заметки: ' + error.message)
    } else {
      setNewNodeTitle('')
      setNewNodeContent('')
      setShowCreateForm(false)
      loadNodes()
    }
  }

  const handleEditNode = (node: any) => {
    setEditingNodeId(node.id)
    setEditNodeTitle(node.title)
    setEditNodeContent(node.content || '')
  }

  const handleUpdateNode = async (id: string) => {
    if (!editNodeTitle.trim()) return

    const { error } = await supabase
      .from('nodes')
      .update({
        title: editNodeTitle,
        content: editNodeContent
      })
      .eq('id', id)

    if (error) {
      console.error('Error updating node:', error)
      alert('Ошибка при обновлении заметки: ' + error.message)
    } else {
      setEditingNodeId(null)
      setEditNodeTitle('')
      setEditNodeContent('')
      loadNodes()
    }
  }

  const handleCancelEdit = () => {
    setEditingNodeId(null)
    setEditNodeTitle('')
    setEditNodeContent('')
  }

  const handleDeleteNode = async (id: string) => {
    if (!confirm('Удалить эту заметку?')) return

    const { error } = await supabase
      .from('nodes')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting node:', error)
      alert('Ошибка при удалении заметки')
    } else {
      loadNodes()
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Загрузка...</p>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: '#f9fafb',
      padding: '2rem'
    }}>
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem',
        paddingBottom: '1rem',
        borderBottom: '2px solid #e5e7eb'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem', color: '#1f2937' }}>
            Knowledge Graph
          </h1>
          <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
            Управление идеями и заметками
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ color: '#6b7280' }}>{user.email}</span>
          <button
            onClick={handleLogout}
            style={{
              padding: '0.5rem 1rem',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Выйти
          </button>
        </div>
      </header>

      <div style={{ marginBottom: '2rem' }}>
        {!showCreateForm ? (
          <button
            onClick={() => setShowCreateForm(true)}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            + Создать заметку
          </button>
        ) : (
          <form onSubmit={handleCreateNode} style={{
            background: 'white',
            padding: '1.5rem',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="Название заметки"
                value={newNodeTitle}
                onChange={(e) => setNewNodeTitle(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '1rem'
                }}
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <textarea
                placeholder="Содержание заметки"
                value={newNodeContent}
                onChange={(e) => setNewNodeContent(e.target.value)}
                rows={4}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  fontFamily: 'inherit',
                  resize: 'vertical'
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="submit"
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Создать
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false)
                  setNewNodeTitle('')
                  setNewNodeContent('')
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#e5e7eb',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Отмена
              </button>
            </div>
          </form>
        )}
      </div>

      <div>
        <h2 style={{ marginBottom: '1rem', color: '#1f2937' }}>
          Мои заметки ({nodes.length})
        </h2>

        {nodes.length === 0 ? (
          <div style={{
            background: 'white',
            padding: '3rem',
            borderRadius: '8px',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            <p>У вас пока нет заметок. Создайте первую!</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {nodes.map((node) => (
              <div
                key={node.id}
                style={{
                  background: 'white',
                  padding: '1.5rem',
                  borderRadius: '8px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  transition: 'box-shadow 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'
                }}
              >
                {editingNodeId === node.id ? (
                  <form onSubmit={(e) => {
                    e.preventDefault()
                    handleUpdateNode(node.id)
                  }}>
                    <div style={{ marginBottom: '1rem' }}>
                      <input
                        type="text"
                        value={editNodeTitle}
                        onChange={(e) => setEditNodeTitle(e.target.value)}
                        required
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '1rem',
                          fontWeight: '600'
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: '1rem' }}>
                      <textarea
                        value={editNodeContent}
                        onChange={(e) => setEditNodeContent(e.target.value)}
                        rows={4}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '1rem',
                          fontFamily: 'inherit',
                          resize: 'vertical'
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="submit"
                        style={{
                          padding: '0.5rem 1rem',
                          background: '#667eea',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        Сохранить
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        style={{
                          padding: '0.5rem 1rem',
                          background: '#e5e7eb',
                          color: '#374151',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        Отмена
                      </button>
                    </div>
                  </form>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ margin: '0 0 0.5rem 0', color: '#1f2937' }}>
                        {node.title}
                      </h3>
                      {node.content && (
                        <p style={{ margin: '0 0 0.5rem 0', color: '#6b7280', whiteSpace: 'pre-wrap' }}>
                          {node.content}
                        </p>
                      )}
                      <p style={{ margin: 0, fontSize: '0.875rem', color: '#9ca3af' }}>
                        {new Date(node.created_at).toLocaleString('ru-RU')}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleEditNode(node)}
                        style={{
                          padding: '0.5rem',
                          background: '#dbeafe',
                          color: '#2563eb',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.875rem'
                        }}
                      >
                        Редактировать
                      </button>
                      <button
                        onClick={() => handleDeleteNode(node.id)}
                        style={{
                          padding: '0.5rem',
                          background: '#fee2e2',
                          color: '#dc2626',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.875rem'
                        }}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
