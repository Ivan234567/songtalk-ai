'use client'

import { useEffect } from 'react'
import { ensureReferralClickRecorded } from '@/lib/referral'

export function ReferralCapture() {
  useEffect(() => {
    ensureReferralClickRecorded().catch(() => {})
  }, [])

  return null
}
