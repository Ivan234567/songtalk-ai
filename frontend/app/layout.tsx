import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SongTalk AI - Learn English with Songs',
  description: 'Learn English through interactive song experiences',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
