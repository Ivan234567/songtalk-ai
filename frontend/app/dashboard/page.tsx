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
import { AccountTab } from '@/components/tabs/AccountTab';
import { logSecurityEvent } from '@/lib/securityEvents';
import { clearBackendToken } from '@/lib/backend-jwt';
type TabKey = 'dashboard' | 'karaoke' | 'dictionary' | 'agent' | 'progress' | 'balance' | 'account';

function isTabKey(value: string | null): value is TabKey {
  return value === 'dashboard' || value === 'karaoke' || value === 'dictionary' || value === 'agent' || value === 'progress' || value === 'balance' || value === 'account';
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [loggingOut, setLoggingOut] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const balanceNotice = searchParams.get('balance_notice');

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
    if (nextTab !== 'balance') {
      next.delete('balance_notice');
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;

        if (event === 'INITIAL_SESSION') {
          setAuthChecked(true);
          if (session?.user) {
            setUserEmail(session.user.email ?? null);
          } else {
            router.replace('/');
          }
        }

        if (event === 'USER_UPDATED') {
          setUserEmail(session?.user?.email ?? null);
        }

        if (event === 'SIGNED_OUT') {
          clearBackendToken();
          router.replace('/');
        }
      },
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logSecurityEvent('logout', { source: 'dashboard' });
      await supabase.auth.signOut();
      clearBackendToken();
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
        return <BalanceTab notice={balanceNotice} />;
      case 'account':
        return <AccountTab userEmail={userEmail} onLogout={handleLogout} />;
      case 'dashboard':
      default:
        return <DashboardTab />;
    }
  };

  const shouldEnableScroll = activeTab === 'dashboard' || activeTab === 'balance' || activeTab === 'account';
  const usernameFromEmail = userEmail?.split('@')[0];
  const displayName = usernameFromEmail
    ? usernameFromEmail.charAt(0).toUpperCase() + usernameFromEmail.slice(1).toLowerCase()
    : 'друг';
  const dateLabel = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    weekday: 'short',
  }).format(new Date());

  if (!authChecked || userEmail === null) {
    return (
      <div
        className={layoutStyles.loadingState}
        aria-busy="true"
        aria-label="Загрузка"
      >
        <span className={layoutStyles.loadingSpinner} />
      </div>
    );
  }

  return (
    <div className={layoutStyles.pageRoot}>
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onLogout={handleLogout}
        userEmail={userEmail}
      />

      <main className={layoutStyles.mainShell}>
        {activeTab === 'dashboard' && (
          <header className={layoutStyles.header}>
            <div className={layoutStyles.headerInner}>
              <span className={layoutStyles.greetingLabel}>Персональная зона обучения</span>
              <div className={layoutStyles.greetingRow}>
                <p className={layoutStyles.greeting}>Привет, {displayName}!</p>
                <span className={layoutStyles.greetingDot} aria-hidden="true" />
                <p className={layoutStyles.greetingHint}>Сфокусируйся на одной задаче и закрепи результат сегодня</p>
              </div>
            </div>
            <div className={layoutStyles.headerMeta}>
              <span className={layoutStyles.metaLabel}>Сегодня</span>
              <span className={layoutStyles.dateChip}>{dateLabel}</span>
            </div>
          </header>
        )}
        <section
          className={[
            layoutStyles.contentScroll,
            shouldEnableScroll ? `${layoutStyles.contentScrollEnabled} main-content-scroll` : layoutStyles.contentScrollDisabled,
          ].join(' ')}
        >
          {renderActiveTab()}
        </section>
      </main>
    </div>
  );
}
