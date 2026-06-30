import { Suspense } from 'react'
import { redirect } from 'next/navigation'

import { getAdminSession } from '@/lib/admin-session'
import { LoginForm } from './login-form'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ next?: string }>
}

export default async function AdminLoginPage({ searchParams }: PageProps) {
  // If already signed in, bounce straight to wherever we were headed.
  const existing = await getAdminSession()
  const params = await searchParams
  const next = params.next && params.next.startsWith('/admin') ? params.next : '/admin'

  if (existing) redirect(next)

  return (
    <main className="admin-surface dark relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,215,0,0.08),transparent_55%)]" />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2">
          <span aria-hidden="true" className="text-3xl text-primary">
            ⬢
          </span>
          <span className="font-mono text-xl font-semibold tracking-wider">CoinFrenzy</span>
          <span className="rounded-sm border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            admin
          </span>
        </div>
        <Suspense fallback={null}>
          <LoginForm nextPath={next} />
        </Suspense>
        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          Authorized personnel only. All sessions are HMAC-signed and audit-logged
          <span className="block opacity-60">docs/09 §5.2</span>
        </p>
      </div>
    </main>
  )
}
