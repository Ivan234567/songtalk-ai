'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { DashboardTab } from '@/components/tabs/DashboardTab';
import { KaraokeTab } from '@/components/tabs/KaraokeTab';
import { DictionaryTab } from '@/components/tabs/DictionaryTab';
import { CallTab } from '@/components/tabs/CallTab';

type TabKey = 'dashboard' | 'karaoke' | 'dictionary' | 'call';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [loggingOut, setLoggingOut] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!isMounted) return;
      if (error) {
        console.error('Failed to load user', error);
        setUserEmail(null);
        return;
      }
      setUserEmail(data.user?.email ?? null);
    };

    loadUser();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      router.push('/auth/login');
      router.refresh();
      setLoggingOut(false);
    }
  };

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'karaoke':
        return <KaraokeTab />;
      case 'dictionary':
        return <DictionaryTab />;
      case 'call':
        return <CallTab />;
      case 'dashboard':
      default:
        return <DashboardTab />;
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        background: '#1f1f1f',
        color: '#f9fafb',
      }}
    >
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onLogout={handleLogout}
        userEmail={userEmail}
      />

      <main
        style={{
          flex: 1,
          padding: '2.25rem 2.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.75rem',
        }}
      >
        {activeTab !== 'karaoke' && (
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1
                style={{
                  fontSize: '1.75rem',
                  marginBottom: '0.4rem',
                  letterSpacing: '-0.03em',
                }}
              >
                {activeTab === 'dashboard' && 'Панель управления'}
                {activeTab === 'dictionary' && 'Словарь'}
                {activeTab === 'call' && 'Звонок с AI'}
              </h1>
              <p
                style={{
                  fontSize: '0.9rem',
                  color: 'rgba(148,163,184,0.95)',
                }}
              >
                Управляйте занятиями в одном месте, не складывая все яйца в одну корзину — каждый
                режим вынесен в отдельный компонент.
              </p>
            </div>
          </header>
        )}

        <section>{renderActiveTab()}</section>
      </main>
    </div>
  );
}

