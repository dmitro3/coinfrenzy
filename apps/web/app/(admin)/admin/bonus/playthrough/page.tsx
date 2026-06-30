import { redirect } from 'next/navigation'
import Link from 'next/link'
import { count, eq, sql } from 'drizzle-orm'

import { canViewBonuses } from '@coinfrenzy/core/auth'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { requireAdminSession } from '@/lib/admin-session'
import { formatCoins } from '@/lib/format'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams?: Promise<{ q?: string }>
}

export default async function Page({ searchParams }: Props) {
  const session = await requireAdminSession('/admin/bonus/playthrough')
  if (!canViewBonuses(session.payload.role)) {
    redirect('/admin')
  }

  const params = (await searchParams) ?? {}
  const q = params.q?.trim() ?? ''

  const db = getDb()

  // Insights: aggregate over all active bonus awards
  const [activeCount] = await db
    .select({ n: count() })
    .from(schema.bonusesAwarded)
    .where(eq(schema.bonusesAwarded.status, 'active'))

  const [completedRecent] = await db
    .select({ n: count() })
    .from(schema.bonusesAwarded)
    .where(
      sql`${schema.bonusesAwarded.status} = 'completed' and ${schema.bonusesAwarded.completedAt} > now() - interval '7 days'`,
    )

  const [expiredRecent] = await db
    .select({ n: count() })
    .from(schema.bonusesAwarded)
    .where(
      sql`${schema.bonusesAwarded.status} = 'expired' and ${schema.bonusesAwarded.expiresAt} > now() - interval '7 days'`,
    )

  const [totalActiveSc] = await db
    .select({
      sc: sql<string>`coalesce(sum(${schema.bonusesAwarded.scAmount}), 0)::text`,
    })
    .from(schema.bonusesAwarded)
    .where(eq(schema.bonusesAwarded.status, 'active'))

  const completionRate =
    completedRecent.n + expiredRecent.n > 0
      ? (completedRecent.n / (completedRecent.n + expiredRecent.n)) * 100
      : 0

  let player: { id: string; email: string } | null = null
  if (q) {
    const rows = await db
      .select({ id: schema.players.id, email: schema.players.email })
      .from(schema.players)
      .where(sql`${schema.players.email} ilike ${`%${q}%`} or ${schema.players.id}::text = ${q}`)
      .limit(1)
    player = rows[0] ?? null
  }

  return (
    <ListPageShell
      title="Playthrough tracking"
      subtitle="Per-player bonus state and wallet rollup"
      description="Look up a player to see their wallet rollup and per-bonus playthrough state."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Bonus' },
        { label: 'Playthrough' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        { label: 'Active awards', value: activeCount.n.toLocaleString(), tone: 'positive' },
        {
          label: 'SC bonded',
          value: `${formatCoins(totalActiveSc.sc)} SC`,
          tone: 'neutral',
        },
        {
          label: 'Completed (7d)',
          value: completedRecent.n.toLocaleString(),
          tone: 'positive',
        },
        {
          label: 'Expired (7d)',
          value: expiredRecent.n.toLocaleString(),
          tone: expiredRecent.n > completedRecent.n ? 'attention' : 'neutral',
        },
        {
          label: 'Completion rate',
          value: `${Math.round(completionRate)}%`,
          tone: completionRate >= 50 ? 'positive' : 'attention',
        },
      ]}
    >
      <form
        method="get"
        className="flex max-w-xl gap-2 rounded-md border border-line-subtle bg-surface p-3"
      >
        <input
          name="q"
          defaultValue={q}
          placeholder="Player email or UUID"
          className="flex h-9 flex-1 rounded-md border border-line-subtle bg-bg px-3 text-sm text-ink-primary placeholder:text-ink-tertiary focus:border-line-default focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90"
        >
          Find
        </button>
      </form>

      {q && !player && (
        <p className="text-sm text-critical">No player matches &ldquo;{q}&rdquo;.</p>
      )}

      {player && <PlayerPlaythroughView playerId={player.id} email={player.email} />}
    </ListPageShell>
  )
}

async function PlayerPlaythroughView({ playerId, email }: { playerId: string; email: string }) {
  const db = getDb()

  const [wallets, awards] = await Promise.all([
    db.select().from(schema.wallets).where(eq(schema.wallets.playerId, playerId)),
    db
      .select({
        id: schema.bonusesAwarded.id,
        bonusName: schema.bonuses.displayName,
        bonusType: schema.bonuses.bonusType,
        scAmount: schema.bonusesAwarded.scAmount,
        gcAmount: schema.bonusesAwarded.gcAmount,
        playthroughRequired: schema.bonusesAwarded.playthroughRequired,
        playthroughProgress: schema.bonusesAwarded.playthroughProgress,
        playthroughComplete: schema.bonusesAwarded.playthroughComplete,
        status: schema.bonusesAwarded.status,
        expiresAt: schema.bonusesAwarded.expiresAt,
        createdAt: schema.bonusesAwarded.createdAt,
        completedAt: schema.bonusesAwarded.completedAt,
      })
      .from(schema.bonusesAwarded)
      .innerJoin(schema.bonuses, eq(schema.bonusesAwarded.bonusId, schema.bonuses.id))
      .where(eq(schema.bonusesAwarded.playerId, playerId))
      .orderBy(sql`${schema.bonusesAwarded.createdAt} desc`)
      .limit(50),
  ])

  const sc = wallets.find((w) => w.currency === 'SC')
  const gc = wallets.find((w) => w.currency === 'GC')
  const active = awards.filter((a) => a.status === 'active')
  const history = awards.filter((a) => a.status !== 'active')

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-line-subtle bg-surface p-4">
        <h2 className="text-sm font-medium text-ink-primary">{email}</h2>
        <p className="font-mono text-xs text-ink-tertiary">{playerId}</p>
        {sc && (
          <div className="mt-3 space-y-1 text-xs">
            <div className="font-mono text-ink-secondary">
              SC balance: <span className="text-ink-primary">{formatCoins(sc.currentBalance)}</span>{' '}
              <span className="text-ink-tertiary">
                (bonus {formatCoins(sc.balanceBonus)}, promo {formatCoins(sc.balancePromo)}, earned{' '}
                {formatCoins(sc.balanceEarned)}, purchased {formatCoins(sc.balancePurchased)})
              </span>
            </div>
            <div className="font-mono text-ink-secondary">
              Playthrough rollup:{' '}
              <span className="text-ink-primary">{formatCoins(sc.playthroughProgress)}</span> /{' '}
              {formatCoins(sc.playthroughRequired)} SC
            </div>
          </div>
        )}
        {gc && (
          <div className="mt-1 font-mono text-xs text-ink-tertiary">
            GC balance: {formatCoins(gc.currentBalance)}
          </div>
        )}
      </div>

      <BonusList title="Active" awards={active} />
      <BonusList title="History" awards={history} />
    </section>
  )
}

interface AwardCard {
  id: string
  bonusName: string
  bonusType: string
  scAmount: bigint
  gcAmount: bigint
  playthroughRequired: bigint
  playthroughProgress: bigint
  playthroughComplete: boolean
  status: string
  expiresAt: Date | null
  createdAt: Date
  completedAt: Date | null
}

function BonusList({ title, awards }: { title: string; awards: AwardCard[] }) {
  if (awards.length === 0) {
    return (
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-tertiary">
          {title}
        </h3>
        <p className="text-sm text-ink-tertiary">None.</p>
      </div>
    )
  }
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-tertiary">
        {title}
      </h3>
      <ul className="space-y-2">
        {awards.map((a) => {
          const pct =
            a.playthroughRequired === 0n
              ? 100
              : Math.min(100, Number((a.playthroughProgress * 100n) / a.playthroughRequired))
          return (
            <li key={a.id} className="rounded-md border border-line-subtle bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-ink-primary">{a.bonusName}</div>
                  <div className="text-xs uppercase tracking-wide text-ink-tertiary">
                    {a.bonusType}
                  </div>
                </div>
                <div className="font-mono text-xs text-ink-primary">
                  {formatCoins(a.scAmount)} SC
                  {a.gcAmount > 0n && ` + ${formatCoins(a.gcAmount)} GC`}
                </div>
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-subtle">
                  <div
                    className={`h-full ${a.playthroughComplete || a.status === 'completed' ? 'bg-positive' : a.status === 'expired' ? 'bg-ink-tertiary' : 'bg-accent'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="font-mono text-ink-secondary">{pct}%</span>
              </div>
              <div className="mt-1 font-mono text-[10px] text-ink-tertiary">
                {formatCoins(a.playthroughProgress)} / {formatCoins(a.playthroughRequired)} ·{' '}
                {a.status}
                {a.expiresAt && ` · expires ${a.expiresAt.toLocaleString()}`}
                {a.completedAt && ` · completed ${a.completedAt.toLocaleString()}`}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
