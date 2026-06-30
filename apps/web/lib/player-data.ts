import { cache } from 'react'

import { and, eq } from 'drizzle-orm'

import { auth as coreAuth, compliance, ledger } from '@coinfrenzy/core'
import { withActor, type DbExecutor } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

// docs/04 §3 + docs/06 §14 — per-player wallet view used across the
// player surface (balance bar, account home, cashier).
//
// `getPlayerWallets` + `getShopModalData` are wrapped in `React.cache`
// so multiple consumers (layout, page, nested components) share a
// single DB roundtrip per request — without this, a /lobby render was
// doing the wallet read twice because both the player layout and the
// lobby page asked for it independently.

export interface WalletView {
  currency: 'GC' | 'SC'
  totalBalance: bigint
  balancePurchased: bigint
  balanceBonus: bigint
  balancePromo: bigint
  balanceEarned: bigint
  /** Redeemable = purchased + earned (docs/06 §14). */
  redeemable: bigint
  playthroughRequired: bigint
  playthroughProgress: bigint
}

export const getPlayerWallets = cache(async (playerId: string): Promise<WalletView[]> => {
  return withActor(playerId, 'player', null, async (tx) => walletsForPlayer(tx, playerId))
})

async function walletsForPlayer(db: DbExecutor, playerId: string): Promise<WalletView[]> {
  const rows = await db.select().from(schema.wallets).where(eq(schema.wallets.playerId, playerId))

  const byCurrency = new Map<'GC' | 'SC', WalletView>()
  for (const row of rows) {
    const view: WalletView = {
      currency: row.currency as 'GC' | 'SC',
      totalBalance: row.currentBalance,
      balancePurchased: row.balancePurchased,
      balanceBonus: row.balanceBonus,
      balancePromo: row.balancePromo,
      balanceEarned: row.balanceEarned,
      redeemable: row.balancePurchased + row.balanceEarned,
      playthroughRequired: row.playthroughRequired,
      playthroughProgress: row.playthroughProgress,
    }
    byCurrency.set(view.currency, view)
  }
  // Ensure both currencies are always present even if a wallet row is missing.
  if (!byCurrency.has('GC')) byCurrency.set('GC', emptyWallet('GC'))
  if (!byCurrency.has('SC')) byCurrency.set('SC', emptyWallet('SC'))
  return [byCurrency.get('GC')!, byCurrency.get('SC')!]
}

function emptyWallet(currency: 'GC' | 'SC'): WalletView {
  const zero = 0n
  return {
    currency,
    totalBalance: zero,
    balancePurchased: zero,
    balanceBonus: zero,
    balancePromo: zero,
    balanceEarned: zero,
    redeemable: zero,
    playthroughRequired: zero,
    playthroughProgress: zero,
  }
}

// Serialized form for transport — bigint isn't JSON-safe.
export interface SerializedWallet {
  currency: 'GC' | 'SC'
  totalBalance: string
  balancePurchased: string
  balanceBonus: string
  balancePromo: string
  balanceEarned: string
  redeemable: string
  playthroughRequired: string
  playthroughProgress: string
}

export function serializeWallet(w: WalletView): SerializedWallet {
  return {
    currency: w.currency,
    totalBalance: w.totalBalance.toString(),
    balancePurchased: w.balancePurchased.toString(),
    balanceBonus: w.balanceBonus.toString(),
    balancePromo: w.balancePromo.toString(),
    balanceEarned: w.balanceEarned.toString(),
    redeemable: w.redeemable.toString(),
    playthroughRequired: w.playthroughRequired.toString(),
    playthroughProgress: w.playthroughProgress.toString(),
  }
}

// Re-export the compliance helpers so the layout can resolve player gating
// without a deep import.
export { coreAuth, compliance, ledger }

// docs/10 §4.2 — pre-fetched data for the Shop modal's Redeem tab. The
// modal is rendered eagerly inside the shell, so we fetch the KYC
// status + linked instruments + SC redeemable in the layout once. The
// Buy tab loads its own package list on first open via
// `/api/player/packages`.

export interface ShopModalServerData {
  /** Pre-formatted SC balance available to redeem (`balance_purchased + balance_earned`). */
  redeemableSc: string
  /** Pre-formatted USD equivalent of redeemableSc (1 SC = $1). */
  redeemableUsd: string
  /** Pre-formatted *total* SC balance including locked-in-bonus amounts.
   * Surfaced on the Shop modal's Redeem panel balance strip so the
   * player sees "SC: 5,236.66 SC | Redeemable: 807.26 SC" the same way
   * the live coinfrenzy.com Shop popup does. */
  totalSc: string
  kycVerified: boolean
  blockedScState: boolean
  /** All active payment instruments — both bank accounts (for ACH) and
   * debit cards (for APT). The Redeem panel groups them by `type` so
   * each method tile can preview the available instruments. */
  instruments: Array<{
    id: string
    type: 'bank_account' | 'debit_card'
    displayName: string
    bankName: string | null
    accountLast4: string | null
    cardBrand: string | null
    cardLast4: string | null
  }>
}

export const getShopModalData = cache(
  async (
    playerId: string,
    blockedScState: boolean,
    scWallet: WalletView | undefined,
  ): Promise<ShopModalServerData> => {
    return withActor(playerId, 'player', null, async (tx) => {
      const [playerRow] = await tx
        .select({ kycLevel: schema.players.kycLevel })
        .from(schema.players)
        .where(eq(schema.players.id, playerId))
        .limit(1)

      const instruments = await tx
        .select({
          id: schema.paymentInstruments.id,
          type: schema.paymentInstruments.type,
          displayName: schema.paymentInstruments.displayName,
          bankName: schema.paymentInstruments.bankName,
          accountLast4: schema.paymentInstruments.accountLast4,
          cardBrand: schema.paymentInstruments.cardBrand,
          cardLast4: schema.paymentInstruments.cardLast4,
        })
        .from(schema.paymentInstruments)
        .where(
          and(
            eq(schema.paymentInstruments.playerId, playerId),
            eq(schema.paymentInstruments.status, 'active'),
          ),
        )

      const kycVerified = (playerRow?.kycLevel ?? 0) >= 2
      const redeemable = scWallet?.redeemable ?? 0n
      const total = scWallet?.totalBalance ?? 0n
      // The format helpers live in apps/web/lib/format; keep types simple
      // here and serialise to plain decimals.
      const niceSc = formatScDecimal(redeemable)
      const niceUsd = `$${niceSc}`
      const niceTotalSc = formatScDecimal(total)

      return {
        redeemableSc: niceSc,
        redeemableUsd: niceUsd,
        totalSc: niceTotalSc,
        kycVerified,
        blockedScState,
        instruments: instruments
          .filter((i) => i.id)
          .filter(
            (i): i is typeof i & { type: 'bank_account' | 'debit_card' } =>
              i.type === 'bank_account' || i.type === 'debit_card',
          )
          .map((i) => ({
            id: i.id,
            type: i.type,
            displayName: i.displayName ?? (i.type === 'debit_card' ? 'Debit Card' : 'Bank Account'),
            bankName: i.bankName,
            accountLast4: i.accountLast4,
            cardBrand: i.cardBrand,
            cardLast4: i.cardLast4,
          })),
      }
    })
  },
)

// SC is stored as bigint scaled by 10^4. The Shop modal renders human-
// friendly two-decimal strings — "1,234.56" — so split into whole and
// truncated-to-cents fractional parts and stitch with thousands.
function formatScDecimal(scaled: bigint): string {
  const major = Number(scaled / 10_000n)
  const fractional = Number(scaled % 10_000n)
  const cents = String(fractional).padStart(4, '0').slice(0, 2)
  return `${major.toLocaleString('en-US')}.${cents}`
}
