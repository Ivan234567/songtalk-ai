'use client'

import AccountAuth from '@/components/auth/AccountAuth'

export default function LoginPage() {
  return <AccountAuth mode="login" nextPath="/dashboard" />
}
