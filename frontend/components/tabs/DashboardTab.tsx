import React from 'react';

export const DashboardTab: React.FC = () => {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1.5rem',
      }}
    >
      <section
        style={{
          padding: '1.5rem',
          borderRadius: '1.5rem',
          background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,64,175,0.9))',
          border: '1px solid rgba(129,140,248,0.6)',
          boxShadow: '0 18px 45px rgba(15,23,42,0.85)',
        }}
      >
        <h2
          style={{
            fontSize: '1rem',
            marginBottom: '0.75rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'rgba(191, 219, 254, 0.95)',
          }}
        >
          Обзор прогресса
        </h2>
        <p style={{ fontSize: '0.9rem', color: 'rgba(209, 213, 219, 0.9)' }}>
          Здесь будет сводка по вашим занятиям: время в разговорах, выученные слова и активность в
          караоке.
        </p>
      </section>

      <section
        style={{
          padding: '1.5rem',
          borderRadius: '1.5rem',
          background: 'radial-gradient(circle at 0% 0%, rgba(236,72,153,0.18), rgba(15,23,42,0.98))',
          border: '1px solid rgba(248, 250, 252, 0.05)',
        }}
      >
        <h2
          style={{
            fontSize: '1rem',
            marginBottom: '0.75rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'rgba(251, 207, 232, 0.95)',
          }}
        >
          Следующий шаг
        </h2>
        <p style={{ fontSize: '0.9rem', color: 'rgba(209, 213, 219, 0.92)' }}>
          SongTalk AI подскажет, что лучше сделать сейчас: созвониться с репетитором, попрактиковать
          песню или повторить словарь.
        </p>
      </section>
    </div>
  );
};

