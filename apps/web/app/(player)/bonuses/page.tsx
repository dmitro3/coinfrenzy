import { Clock, Gift, Sparkles } from 'lucide-react'
import { and, eq, ne, sql } from 'drizzle-orm'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { formatCoins } from '@/lib/format'
import { requirePlayerSession } from '@/lib/player-session'

import { PromoCodeRedeemForm } from './_promo-form'

export const dynamic = 'force-dynamic'

interface AwardRow {
  id: string
  bonusName: string
  bonusType: string
  bonusTerms: string | null
  scAmount: bigint
  gcAmount: bigint
  playthroughRequired: bigint
  playthroughProgress: bigint
  playthroughComplete: boolean
  status: string
  awardReason: string | null
  expiresAt: Date | null
  createdAt: Date
  completedAt: Date | null
}

async function loadActiveAwards(playerId: string): Promise<AwardRow[]> {
  return loadAwards(playerId, 'active')
}

async function loadHistoryAwards(playerId: string): Promise<AwardRow[]> {
  return loadAwards(playerId, 'history', 25)
}

async function loadAwards(
  playerId: string,
  scope: 'active' | 'history',
  limit = 50,
): Promise<AwardRow[]> {
  const db = getDb()
  const where =
    scope === 'active'
      ? and(
          eq(schema.bonusesAwarded.playerId, playerId),
          eq(schema.bonusesAwarded.status, 'active'),
        )
      : and(
          eq(schema.bonusesAwarded.playerId, playerId),
          ne(schema.bonusesAwarded.status, 'active'),
        )
  const rows = await db
    .select({
      id: schema.bonusesAwarded.id,
      bonusName: schema.bonuses.displayName,
      bonusType: schema.bonuses.bonusType,
      bonusTerms: schema.bonuses.terms,
      scAmount: schema.bonusesAwarded.scAmount,
      gcAmount: schema.bonusesAwarded.gcAmount,
      playthroughRequired: schema.bonusesAwarded.playthroughRequired,
      playthroughProgress: schema.bonusesAwarded.playthroughProgress,
      playthroughComplete: schema.bonusesAwarded.playthroughComplete,
      status: schema.bonusesAwarded.status,
      awardReason: schema.bonusesAwarded.awardReason,
      expiresAt: schema.bonusesAwarded.expiresAt,
      createdAt: schema.bonusesAwarded.createdAt,
      completedAt: schema.bonusesAwarded.completedAt,
    })
    .from(schema.bonusesAwarded)
    .innerJoin(schema.bonuses, eq(schema.bonusesAwarded.bonusId, schema.bonuses.id))
    .where(where)
    .orderBy(sql`${schema.bonusesAwarded.createdAt} desc`)
    .limit(limit)

  return rows
}

export default async function BonusesPage() {
  const session = await requirePlayerSession('/bonuses')
  const [active, history] = await Promise.all([
    loadActiveAwards(session.player.id),
    loadHistoryAwards(session.player.id),
  ])

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Gift className="h-6 w-6 text-primary" />
          Bonuses
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Active offers, playthrough progress, and bonus history.
        </p>
      </header>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Got a promo code?
        </h2>
        <PromoCodeRedeemForm />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Active bonuses
        </h2>
        {active.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-card/40 p-6 text-center text-sm text-muted-foreground">
            No active bonuses right now. Make a purchase or check back tomorrow for the daily login
            bonus.
          </div>
        ) : (
          <ul className="space-y-3">
            {active.map((award) => (
              <li key={award.id}>
                <ActiveBonusCard award={award} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          History
        </h2>
        {history.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-card/40 p-6 text-center text-sm text-muted-foreground">
            Completed and expired bonuses appear here.
          </div>
        ) : (
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60 bg-card text-sm">
            {history.map((award) => (
              <li
                key={award.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <div className="font-medium">{award.bonusName}</div>
                  <div className="text-xs text-muted-foreground">
                    {award.scAmount > 0n && `${formatCoins(award.scAmount)} SC `}
                    {award.gcAmount > 0n && `${formatCoins(award.gcAmount)} GC `}·{' '}
                    {humanStatus(award.status)} ·{' '}
                    {(award.completedAt ?? award.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    award.status === 'completed'
                      ? 'bg-emerald-500/10 text-emerald-500'
                      : award.status === 'expired'
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-destructive/10 text-destructive'
                  }`}
                >
                  {humanStatus(award.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function ActiveBonusCard({ award }: { award: AwardRow }) {
  const required = Number(award.playthroughRequired)
  const progress = Number(award.playthroughProgress)
  const pct = required === 0 ? 100 : Math.min(100, Math.round((progress / required) * 100))
  const remainingHours = award.expiresAt
    ? Math.max(0, Math.round((award.expiresAt.getTime() - Date.now()) / 3_600_000))
    : null

  return (
    <article className="rounded-lg border border-border/60 bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            {award.bonusName}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {award.scAmount > 0n && `${formatCoins(award.scAmount)} SC`}
            {award.gcAmount > 0n && award.scAmount > 0n && ' + '}
            {award.gcAmount > 0n && `${formatCoins(award.gcAmount)} GC`}
            {award.awardReason ? ` · ${award.awardReason}` : ''}
          </div>
        </div>
        {remainingHours != null && (
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
            <Clock className="h-3 w-3" />
            {remainingHours < 1 ? 'expiring soon' : `${remainingHours}h left`}
          </span>
        )}
      </div>

      {award.scAmount > 0n && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">
              Playthrough {formatCoins(award.playthroughProgress)} /{' '}
              {formatCoins(award.playthroughRequired)} SC wagered
            </span>
            <span className="font-mono font-medium">{pct}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          {award.playthroughComplete && (
            <p className="mt-2 text-xs text-emerald-500">
              Playthrough complete — the SC is now redeemable.
            </p>
          )}
        </div>
      )}

      {award.bonusTerms && (
        <details className="mt-4 text-xs text-muted-foreground">
          <summary className="cursor-pointer underline-offset-2 hover:underline">Terms</summary>
          <p className="mt-2 whitespace-pre-line">{award.bonusTerms}</p>
        </details>
      )}
    </article>
  )
}

function humanStatus(status: string): string {
  switch (status) {
    case 'active':
      return 'Active'
    case 'completed':
      return 'Completed'
    case 'expired':
      return 'Expired'
    case 'forfeited':
      return 'Forfeited'
    case 'reversed':
      return 'Reversed'
    default:
      return status
  }
}
