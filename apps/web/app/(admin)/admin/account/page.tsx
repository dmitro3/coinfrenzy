import 'server-only'

import Link from 'next/link'
import {
  ClipboardList,
  Gift,
  KeyRound,
  Mail,
  MessageCircle,
  ShieldCheck,
  UserCircle,
  Users,
} from 'lucide-react'

import { isHost } from '@coinfrenzy/core/auth'
import { PageHeader } from '@coinfrenzy/ui/admin/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@coinfrenzy/ui/primitives/card'

import { requireAdminSession } from '@/lib/admin-session'
import { formatUsd } from '@/lib/format'

import { fetchHostStats } from './_host-stats'
import { PasswordChangeForm } from './_password-form'
import { TotpSetup } from './_totp-setup'

export const dynamic = 'force-dynamic'

// Admin account page (docs/09 §5.2). Self-service identity, password
// rotation, and TOTP enrollment / backup-code regeneration. Linked from
// the HostSidebar's "Account" entry and the admin user menu's "Profile".

export default async function AdminAccountPage() {
  const session = await requireAdminSession()
  const { admin, payload } = session

  const isHostRole = isHost(payload.role)
  const hostStats = isHostRole ? await fetchHostStats(admin.id) : null

  return (
    <div className="space-y-8 px-8 py-8">
      <PageHeader
        title="My account"
        subtitle="Your profile, security, and activity on the CoinFrenzy admin platform."
        breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Account' }]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCircle className="h-4 w-4 text-ink-tertiary" /> Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Display name" value={admin.displayName} />
            <Row label="Email" value={admin.email} icon={<Mail className="h-3.5 w-3.5" />} />
            <Row label="Account ID" value={admin.id} mono />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-ink-tertiary" /> Access
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Role" value={payload.role} />
            <Row label="Session expires" value={new Date(payload.exp * 1000).toLocaleString()} />
            <Row label="2FA" value={admin.totpEnabled ? 'Enabled' : 'Not enabled'} />
          </CardContent>
        </Card>
      </div>

      {hostStats ? <HostStatsCard stats={hostStats} /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-ink-tertiary" />
            Change password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordChangeForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-ink-tertiary" />
            Two-factor authentication
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TotpSetup enabled={admin.totpEnabled} />
        </CardContent>
      </Card>
    </div>
  )
}

function HostStatsCard({
  stats,
}: {
  stats: {
    vipCount: number
    newVipsThisWeek: number
    interactions7d: number
    interactions30d: number
    bonusesSent7d: number
    bonusesSent30d: number
    messagesSent30d: number
    scAwarded30dMinor: bigint
  }
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity snapshot</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="VIPs"
            value={stats.vipCount.toString()}
            sub={`${stats.newVipsThisWeek} new this week`}
            icon={<Users className="h-4 w-4 text-ink-tertiary" />}
          />
          <Stat
            label="Interactions (30d)"
            value={stats.interactions30d.toString()}
            sub={`${stats.interactions7d} in the last 7 days`}
            icon={<ClipboardList className="h-4 w-4 text-ink-tertiary" />}
          />
          <Stat
            label="Bonuses sent (30d)"
            value={stats.bonusesSent30d.toString()}
            sub={`${formatUsd(stats.scAwarded30dMinor)} SC awarded`}
            icon={<Gift className="h-4 w-4 text-ink-tertiary" />}
          />
          <Stat
            label="Messages (30d)"
            value={stats.messagesSent30d.toString()}
            sub="Email + SMS"
            icon={<MessageCircle className="h-4 w-4 text-ink-tertiary" />}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function Stat({
  label,
  value,
  sub,
  icon,
}: {
  label: string
  value: string
  sub: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-md border border-line-subtle bg-surface px-3 py-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-ink-tertiary">{label}</p>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-ink-primary">{value}</p>
      <p className="mt-1 text-xs text-ink-tertiary">{sub}</p>
    </div>
  )
}

function Row({
  label,
  value,
  mono,
  icon,
}: {
  label: string
  value: string
  mono?: boolean
  icon?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wider text-ink-tertiary">
        {label}
      </span>
      <span
        className={`flex items-center gap-1.5 text-ink-primary ${mono ? 'font-mono text-xs' : ''}`}
      >
        {icon} {value}
      </span>
    </div>
  )
}
