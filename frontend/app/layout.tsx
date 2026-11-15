import type { Metadata } from 'next'
import Script from 'next/script'
import { ReferralCapture } from '@/components/ReferralCapture'
import './globals.css'

export const metadata: Metadata = {
  title: 'Speakeasy',
  description: 'Практика с ИИ: слова, которым пора, возвращаются в сцену. Собеседник создаёт ситуацию и слово не подсказывает.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru" className="dark" style={{ colorScheme: 'dark' }}>
      <head>
        <meta name="color-scheme" content="dark" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Unbounded:wght@500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&family=Onest:wght@400;500;600;700&family=Lora:ital,wght@1,500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Script
          src="https://www.youtube.com/iframe_api"
          strategy="lazyOnload"
        />
        <ReferralCapture />
        {children}
      </body>
    </html>
  )
}
