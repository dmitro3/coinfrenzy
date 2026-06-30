import { desc, eq } from 'drizzle-orm'
import { Monitor } from 'lucide-react'

import { withActor } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { requirePlayerSession } from '@/lib/player-session'

import { AccountSubnav } from '../_subnav'
import { RevokeButton } from './_revoke'

export const dynamic = 'force-dynamic'

export default async function SessionsPage() {
  const session = await requirePlayerSession('/account/sessions')

  const rows = await withActor(session.player.id, 'player', null, (tx) =>
    tx
      .select({
        id: schema.authSession.id,
        ip: schema.authSession.ipAddress,
        userAgent: schema.authSession.userAgent,
        createdAt: schema.authSession.createdAt,
        expiresAt: schema.authSession.expiresAt,
        updatedAt: schema.authSession.updatedAt,
      })
      .from(schema.authSession)
      .where(eq(schema.authSession.userId, session.player.id))
      .orderBy(desc(schema.authSession.updatedAt))
      .limit(20),
  )

  return (
    <div className="mx-auto max-w-4xl py-4">
      <header className="mb-4">
        <h1 className="cf-headline flex items-center gap-2 text-2xl font-bold uppercase tracking-wider text-white">
          <Monitor className="h-6 w-6 text-[var(--cf-gold-light)]" />
          Active sessions
        </h1>
      </header>
      <AccountSubnav />

      <div className="mt-6 space-y-2">
        {rows.length === 0 && (
          <div className="rounded-lg border border-[var(--cf-border-default)] bg-[var(--cf-bg-card)] p-6 text-center text-sm text-[var(--cf-gray-light)]">
            No active sessions recorded yet.
          </div>
        )}
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--cf-border-default)] bg-[var(--cf-bg-card)] p-4 text-sm"
          >
            <div>
              <div className="font-medium text-white">{shortUa(row.userAgent ?? '')}</div>
              <div className="text-xs text-[var(--cf-gray-light)]">
                IP {row.ip ?? '—'} · Last active {new Date(row.updatedAt).toLocaleString()}
              </div>
            </div>
            <RevokeButton sessionId={row.id} />
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-[var(--cf-gray-light)]">
        Sessions auto-expire after 14 days. Revoking signs that device out immediately.
      </p>
    </div>
  )
}

function shortUa(ua: string): string {
  if (!ua) return 'Unknown device'
  const m = /(Chrome|Firefox|Safari|Edge|Opera)\/[\d.]+/.exec(ua)
  const browser = m?.[1] ?? 'Browser'
  if (/Mac/.test(ua)) return `${browser} on Mac`
  if (/Windows/.test(ua)) return `${browser} on Windows`
  if (/Android/.test(ua)) return `${browser} on Android`
  if (/iPhone|iPad|iOS/.test(ua)) return `${browser} on iOS`
  if (/Linux/.test(ua)) return `${browser} on Linux`
  return browser
}
