import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Speakeasy',
  description: 'Speakeasy - платформа для общения и взаимодействия',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <script src="https://www.youtube.com/iframe_api" async></script>
      </head>
      <body>{children}</body>
    </html>
  )
}
