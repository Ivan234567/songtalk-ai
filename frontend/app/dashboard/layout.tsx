'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { resolveAccountHome } from '@/lib/account-home'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    let cancel = false
    resolveAccountHome()
      .then((home) => {
        if (cancel) return
        if (home === 'partner') {
          router.replace('/partner')
          return
        }
        setAllowed(true)
      })
      .catch(() => {
        if (!cancel) setAllowed(true)
      })
    return () => {
      cancel = true
    }
  }, [router])

  if (!allowed) return null
  return children
}
