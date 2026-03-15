import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

const faviconSvg =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="80 30 240 210" width="32" height="32">' +
    '<rect x="124" y="148" width="152" height="76" rx="14" fill="#a8edd4"/>' +
    '<ellipse cx="200" cy="148" rx="76" ry="68" fill="#d4f5e8"/>' +
    '<circle cx="200" cy="148" r="32" fill="#1e4a38"/>' +
    '<circle cx="200" cy="148" r="26" fill="#3dba80"/>' +
    '<circle cx="200" cy="148" r="18" fill="#0d2e1c"/>' +
    '<circle cx="200" cy="148" r="13" fill="#1a7a50"/>' +
    '<circle cx="191" cy="139" r="5.5" fill="white" opacity="0.9"/>' +
    '<circle cx="248" cy="155" r="12" fill="#1e4a38"/>' +
    '<circle cx="248" cy="155" r="9" fill="#3dba80"/>' +
    '<circle cx="248" cy="155" r="5.5" fill="#0d2e1c"/>' +
    '<circle cx="245" cy="151" r="2.5" fill="white" opacity="0.85"/>' +
    '<path d="M152 112 Q200 72 248 112" fill="none" stroke="#2d8a58" stroke-width="7" stroke-linecap="round"/>' +
    '<ellipse cx="148" cy="116" rx="14" ry="17" fill="#2d8a58"/>' +
    '<ellipse cx="148" cy="116" rx="8" ry="10" fill="#3dab74"/>' +
    '<path d="M155 104 Q168 84 172 64" fill="none" stroke="#2d8a58" stroke-width="3.5" stroke-linecap="round"/>' +
    '<rect x="165" y="50" width="14" height="20" rx="7" fill="#1e6640"/>' +
    '<rect x="164" y="196" width="72" height="16" rx="8" fill="white" opacity="0.3"/>' +
    '</svg>'
  )

export const metadata: Metadata = {
  title: 'Speakeasy',
  description: 'Speakeasy - платформа для общения и взаимодействия',
  icons: {
    icon: faviconSvg,
    shortcut: faviconSvg,
    apple: faviconSvg,
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
