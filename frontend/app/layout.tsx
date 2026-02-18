import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: 'Speakeasy',
  description: 'Speakeasy - платформа для общения и взаимодействия',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru" className="dark">
      <body>
        <Script
          src="https://www.youtube.com/iframe_api"
          strategy="lazyOnload"
        />
        {children}
      </body>
    </html>
  )
}
