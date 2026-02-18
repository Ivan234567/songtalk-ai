'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { DashboardTab } from '@/components/tabs/DashboardTab';
import layoutStyles from './dashboard.module.css';
import { KaraokeTab } from '@/components/tabs/KaraokeTab';
import { DictionaryTab } from '@/components/tabs/DictionaryTab';
import { AgentTab } from '@/components/tabs/AgentTab';
import { ProgressTab } from '@/components/tabs/ProgressTab';
import { BalanceTab } from '@/components/tabs/BalanceTab';
type TabKey = 'dashboard' | 'karaoke' | 'dictionary' | 'agent' | 'progress' | 'balance';

function isTabKey(value: string | null): value is TabKey {
  return value === 'dashboard' || value === 'karaoke' || value === 'dictionary' || value === 'agent' || value === 'progress' || value === 'balance';
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [loggingOut, setLoggingOut] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (isTabKey(tabParam)) {
      setActiveTab((prev) => (prev === tabParam ? prev : tabParam));
    } else {
      // Защита от некорректного значения: принудительно возвращаемся на дашборд.
      setActiveTab((prev) => (prev === 'dashboard' ? prev : 'dashboard'));
    }
  }, [searchParams]);

  const handleTabChange = (nextTab: TabKey) => {
    setActiveTab(nextTab);
    const currentTab = searchParams.get('tab');
    if (currentTab === nextTab) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set('tab', nextTab);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!isMounted) return;
        setAuthChecked(true);
        if (error || !data.user) {
          router.replace('/');
          return;
        }
        setUserEmail(data.user.email ?? null);
      } catch (e) {
        if (!isMounted) return;
        setAuthChecked(true);
        router.replace('/');
      }
    };

    loadUser();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      router.push('/');
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
      case 'agent':
        return <AgentTab />;
      case 'progress':
        return <ProgressTab />;
      case 'balance':
        return <BalanceTab />;
      case 'dashboard':
      default:
        return <DashboardTab />;
    }
  };

  if (!authChecked || userEmail === null) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-busy="true"
        aria-label="Загрузка"
      >
        <span
          style={{
            width: 24,
            height: 24,
            border: '2px solid var(--stroke)',
            borderTopColor: 'var(--accent)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100vh',
        minHeight: 0,
        overflow: 'hidden',
        display: 'flex',
        background: 'var(--bg)',
        color: 'var(--text-primary)',
      }}
    >
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onLogout={handleLogout}
        userEmail={userEmail}
      />

      <main
        style={{
          flex: 1,
          minHeight: 0,
          padding: '1rem 2rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          position: 'relative',
        }}
      >
        {activeTab === 'dashboard' && (
          <header className={layoutStyles.header}>
            <div className={layoutStyles.headerInner}>
              {userEmail && (
                <p className={layoutStyles.greeting}>
                  Привет, {userEmail.split('@')[0] ? userEmail.split('@')[0].charAt(0).toUpperCase() + userEmail.split('@')[0].slice(1).toLowerCase() : 'друг'}!
                </p>
              )}
              <h1 className={layoutStyles.title}>Главная</h1>
              <p className={layoutStyles.subtitle}>
                Обзор вашей практики и быстрый доступ к занятиям.
              </p>
            </div>
          </header>
        )}
        <section
          className={activeTab === 'dashboard' || activeTab === 'balance' ? 'main-content-scroll' : undefined}
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: activeTab === 'dashboard' || activeTab === 'balance' ? 'auto' : 'hidden',
          }}
        >
          {renderActiveTab()}
        </section>
      </main>
    </div>
  );
}
