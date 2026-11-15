'use client'

import { PartnerFrame } from '@/components/partner/PartnerFrame'

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return <PartnerFrame>{children}</PartnerFrame>
}
