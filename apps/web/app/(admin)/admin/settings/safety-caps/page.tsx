import 'server-only'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'

import { system as systemMod } from '@coinfrenzy/core'
import { canEditSafetyCaps } from '@coinfrenzy/core/auth'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { buildAdminRscContext } from '@/lib/admin-rsc-context'
import { requireAdminSession } from '@/lib/admin-session'

import { SafetyCapsClient } from './_client'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await requireAdminSession('/admin/settings/safety-caps')
  if (!canEditSafetyCaps(session.payload.role)) {
    redirect('/admin/settings')
  }

  const caps = await systemMod.getTierCaps(buildAdminRscContext())

  const initial = {
    weeklyScMaxMajor: Number(caps.weeklyScMax / 10_000n),
    monthlyScMaxMajor: Number(caps.monthlyScMax / 10_000n),
    loginMultMax: caps.loginMultMax,
    cashbackPctMax: caps.cashbackPctMax,
  }

  const ceilings = {
    weeklyScMaxMajor: Number(systemMod.HARD_TIER_CEILINGS.weeklyScMax / 10_000n),
    monthlyScMaxMajor: Number(systemMod.HARD_TIER_CEILINGS.monthlyScMax / 10_000n),
    loginMultMax: systemMod.HARD_TIER_CEILINGS.loginMultMax,
    cashbackPctMax: systemMod.HARD_TIER_CEILINGS.cashbackPctMax,
  }

  return (
    <ListPageShell
      title="Safety caps"
      subtitle="Master-only operator ceilings"
      description="These caps prevent a misconfigured tier from giving away the platform. They apply on every tier write. Engineering-set hard ceilings (in code, not editable here) clamp every value below."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Settings', href: '/admin/settings' },
        { label: 'Safety caps' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        {
          label: 'Weekly SC max',
          value: `${initial.weeklyScMaxMajor.toLocaleString()} SC`,
          tone: 'neutral',
        },
        {
          label: 'Monthly SC max',
          value: `${initial.monthlyScMaxMajor.toLocaleString()} SC`,
          tone: 'neutral',
        },
        { label: 'Login mult max', value: `${initial.loginMultMax.toFixed(2)}×`, tone: 'neutral' },
        {
          label: 'Cashback max',
          value: `${(initial.cashbackPctMax * 100).toFixed(0)}%`,
          tone: 'neutral',
        },
      ]}
    >
      <Card>
        <CardContent className="space-y-4 p-5">
          <header className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
            <div>
              <div className="text-sm font-medium text-ink-primary">Tier safety caps</div>
              <div className="text-xs text-ink-tertiary">
                Every tier create/update is rejected if it exceeds these values. Changing them is
                audited. You cannot raise above the engineering ceiling shown next to each field.
              </div>
            </div>
          </header>

          <SafetyCapsClient initial={initial} ceilings={ceilings} />
        </CardContent>
      </Card>
    </ListPageShell>
  )
}
