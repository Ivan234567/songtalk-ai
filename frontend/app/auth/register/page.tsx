'use client'

import AccountAuth from '@/components/auth/AccountAuth'

export default function RegisterPage() {
  return (
    <AccountAuth
      mode="register"
      nextPath="/"
    />
  )
}
