'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { AuthModal, GoldButton } from '@coinfrenzy/ui/player'

import { sendVerificationEmail, useSession } from '@/lib/auth-client'

export default function VerifyEmailPage() {
  const router = useRouter()
  const session = useSession()
  const [resending, setResending] = React.useState(false)
  const [resent, setResent] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const verified = Boolean(session.data?.user?.emailVerified)

  React.useEffect(() => {
    if (!verified) return
    const t = setTimeout(() => router.push('/lobby'), 1500)
    return () => clearTimeout(t)
  }, [verified, router])

  async function resend() {
    setError(null)
    const email = session.data?.user?.email
    if (!email) {
      setError('Please log in first')
      return
    }
    setResending(true)
    try {
      const result = await sendVerificationEmail({
        email,
        callbackURL: '/lobby',
      })
      if (result.error) {
        setError(result.error.message ?? 'Could not resend the email')
        return
      }
      setResent(true)
    } finally {
      setResending(false)
    }
  }

  return (
    <AuthModal closeHref="/lobby" foxVariant="coins-half">
      <h1 className="cf-headline text-xl font-bold uppercase tracking-wider text-white">
        Verify your email
      </h1>
      {verified ? (
        <p className="mt-1 text-sm text-[var(--cf-green-bright)]">
          Your email is verified. Redirecting…
        </p>
      ) : (
        <p className="mt-1 text-sm text-[var(--cf-gray-light)]">
          We sent a verification link to{' '}
          <span className="font-semibold text-white">
            {session.data?.user?.email ?? 'your email'}
          </span>
          . Open it to unlock Sweepstakes Coin redemptions.
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-[var(--cf-red-dark)] bg-[var(--cf-red-deep)]/40 p-3 text-sm text-[var(--cf-red-primary)]">
          {error}
        </div>
      )}
      {resent && (
        <div className="mt-4 rounded-md border border-[var(--cf-gold-deep)] bg-black/40 p-3 text-sm text-[var(--cf-gold-light)]">
          Verification email re-sent.
        </div>
      )}

      <div className="mt-6 space-y-3">
        <GoldButton onClick={resend} disabled={resending} fullWidth size="md">
          {resending ? 'Sending…' : 'Resend verification email'}
        </GoldButton>
        <Link
          href="/lobby"
          className="block text-center text-sm text-[var(--cf-gray-light)] underline hover:text-white"
        >
          Skip for now
        </Link>
      </div>
    </AuthModal>
  )
}
