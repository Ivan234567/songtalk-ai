import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

// Прозрачная 1x1 иконка — вкладка без видимого логотипа
const transparentIcon =
  'data:image/svg+xml,' +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" fill="transparent"/></svg>')

export const metadata: Metadata = {
  title: 'Speakeasy',
  description: 'Speakeasy - платформа для общения и взаимодействия',
  icons: {
    icon: transparentIcon,
    shortcut: transparentIcon,
    apple: transparentIcon,
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
