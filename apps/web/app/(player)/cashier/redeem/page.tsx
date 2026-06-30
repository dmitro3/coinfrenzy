import Link from 'next/link'
import { and, desc, eq } from 'drizzle-orm'

import { getDb, schema } from '@coinfrenzy/db'

import { CoinFrenzyLogo } from '@coinfrenzy/ui/player'

import { getPlayerWallets } from '@/lib/player-data'
import { requirePlayerSession } from '@/lib/player-session'
import { formatCoins, formatUsd } from '@/lib/format'

import { RedeemForm } from './_form'
import { RedemptionList } from './_history'
import { CashierKycNotice } from './_kyc-notice'

export const dynamic = 'force-dynamic'

// docs/10 §4.2 — Cashier Redeem page. Shows sub-bucket display, the active
// payment instruments, the in-flight redemption form, and the player's
// recent redemption history with live status.

export default async function CashierRedeemPage() {
  const session = await requirePlayerSession('/cashier/redeem')
  const wallets = await getPlayerWallets(session.player.id)
  const sc = wallets.find((w) => w.currency === 'SC')

  const db = getDb()
  const [playerRow] = await db
    .select({
      kycLevel: schema.players.kycLevel,
      state: schema.players.state,
      status: schema.players.status,
    })
    .from(schema.players)
    .where(eq(schema.players.id, session.player.id))
    .limit(1)

  const [activeBonuses, instruments, recent] = await Promise.all([
    db
      .select({
        id: schema.bonusesAwarded.id,
        bonusName: schema.bonuses.displayName,
        playthroughRequired: schema.bonusesAwarded.playthroughRequired,
        playthroughProgress: schema.bonusesAwarded.playthroughProgress,
      })
      .from(schema.bonusesAwarded)
      .innerJoin(schema.bonuses, eq(schema.bonuses.id, schema.bonusesAwarded.bonusId))
      .where(
        and(
          eq(schema.bonusesAwarded.playerId, session.player.id),
          eq(schema.bonusesAwarded.status, 'active'),
        ),
      )
      .limit(10),
    db
      .select({
        id: schema.paymentInstruments.id,
        type: schema.paymentInstruments.type,
        displayName: schema.paymentInstruments.displayName,
        bankName: schema.paymentInstruments.bankName,
        accountLast4: schema.paymentInstruments.accountLast4,
        cardBrand: schema.paymentInstruments.cardBrand,
        cardLast4: schema.paymentInstruments.cardLast4,
        plaidValidationStatus: schema.paymentInstruments.plaidValidationStatus,
      })
      .from(schema.paymentInstruments)
      .where(
        and(
          eq(schema.paymentInstruments.playerId, session.player.id),
          eq(schema.paymentInstruments.status, 'active'),
        ),
      ),
    db
      .select({
        id: schema.redemptions.id,
        status: schema.redemptions.status,
        amountSc: schema.redemptions.amountSc,
        amountUsd: schema.redemptions.amountUsd,
        method: schema.redemptions.method,
        rejectionReason: schema.redemptions.rejectionReason,
        createdAt: schema.redemptions.createdAt,
        paidAt: schema.redemptions.paidAt,
      })
      .from(schema.redemptions)
      .where(eq(schema.redemptions.playerId, session.player.id))
      .orderBy(desc(schema.redemptions.createdAt))
      .limit(10),
  ])

  const total = sc?.totalBalance ?? 0n
  const redeemable = sc?.redeemable ?? 0n
  const locked = total - redeemable
  const blockedSC = session.player.blockedStateGcOnly
  const kycLevel = playerRow?.kycLevel ?? 0
  const kycVerified = kycLevel >= 2

  return (
    <div className="mx-auto max-w-3xl py-4">
      <div className="rounded-lg border border-[var(--cf-border-default)] bg-[var(--cf-bg-card)] p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h1 className="cf-headline text-xl font-bold uppercase tracking-wider text-white">
            Shop
          </h1>
          <CoinFrenzyLogo variant="wordmark" width={110} height={40} />
        </div>

        <div className="mt-4 grid grid-cols-2 rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] p-1 text-sm font-bold uppercase tracking-wider">
          <Link
            href="/lobby?shop=1"
            className="rounded-sm py-2 text-center text-white hover:text-[var(--cf-gold-light)]"
          >
            Buy Coins
          </Link>
          <span className="cf-gold-gradient rounded-sm py-2 text-center text-[#1a1a1a]">
            Redeem
          </span>
        </div>

        <p className="mt-4 text-sm text-[var(--cf-gray-light)]">
          Bank ACH typically settles in 1–3 business days. Debit-card payouts via APT are instant
          where supported.
        </p>

        {blockedSC && (
          <div className="mt-4 rounded-md border border-[var(--cf-gold-deep)] bg-[#231804] p-3 text-sm text-[var(--cf-gold-light)]">
            Your state allows Gold Coin play only — SC redemption is disabled in this jurisdiction.
          </div>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat label="Total SC" value={formatCoins(total)} />
          <Stat label="Available to redeem" value={formatCoins(redeemable)} accent="primary" />
          <Stat label="Locked in bonuses" value={formatCoins(locked < 0n ? 0n : locked)} />
        </div>

        {activeBonuses.length > 0 ? (
          <div className="mt-4 rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] p-4 text-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--cf-gold-light)]">
              Active bonuses
            </h2>
            <ul className="mt-2 space-y-1">
              {activeBonuses.map((b) => {
                const remaining =
                  b.playthroughRequired - b.playthroughProgress < 0n
                    ? 0n
                    : b.playthroughRequired - b.playthroughProgress
                return (
                  <li key={b.id} className="flex items-center justify-between gap-2 text-xs">
                    <span>{b.bonusName}</span>
                    <span className="font-mono text-[var(--cf-gray-light)]">
                      {formatCoins(remaining)} SC remaining
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        <CashierKycNotice kycVerified={kycVerified} kycLevel={kycLevel} />

        <RedeemForm
          kycVerified={kycVerified}
          blockedSC={blockedSC}
          redeemable={redeemable}
          instruments={instruments}
        />

        <section className="mt-8 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--cf-gold-light)]">
            Recent redemptions
          </h2>
          <RedemptionList
            rows={recent.map((r) => ({
              id: r.id,
              status: r.status,
              amountSc: r.amountSc.toString(),
              amountUsd: r.amountUsd.toString(),
              method: r.method,
              rejectionReason: r.rejectionReason,
              createdAt: r.createdAt.toISOString(),
              paidAt: r.paidAt?.toISOString() ?? null,
            }))}
            summary={{
              redeemable: redeemable.toString(),
              redeemableUsd: formatUsd(redeemable),
            }}
          />
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: 'primary' }) {
  return (
    <div className="rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] p-4">
      <div className="text-xs uppercase tracking-wider text-[var(--cf-gray-light)]">{label}</div>
      <div
        className={`mt-1 font-mono text-2xl font-semibold ${accent === 'primary' ? 'cf-sc-shine' : 'text-white'}`}
        data-numeric="true"
      >
        {value}
      </div>
    </div>
  )
}
