import {
  auth as coreAuth,
  cashier as cashierMod,
  consoleLogger,
  type Actor,
  type Context,
} from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { requireAdminSession } from '@/lib/admin-session'

import { RedeemRulesPanel } from './_rules-panel'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// docs/07 §5.1 — Redeem Rules.
//
// One-stop shop for the operator to tune which redemptions auto-approve
// and which get queued for cashier review. Mirrors the rule list +
// builder UX from gamma (see attached screenshots in the May 2026
// product brief) but with our own primitives so it lives in the same
// design system as the rest of the admin shell.

export default async function CashierRedeemRulesPage() {
  const session = await requireAdminSession('/admin/cashier/redeem-rules')

  // Read is open to every authenticated admin; write actions are gated
  // manager+ inside the API + the client panel disables the buttons.
  const actor: Actor = {
    kind: 'admin',
    adminId: session.admin.id,
    role: session.payload.role,
    ip: '',
  }
  const ctx: Context = {
    db: getDb(),
    logger: consoleLogger,
    actor,
    reqId: 'cashier-redeem-rules-page',
    afterCommit: async () => {
      /* page-level reads only */
    },
  }

  const rules = await cashierMod.listRedemptionRules(ctx)
  const active = rules.filter((r) => r.isActive && !r.archivedAt)
  const archived = rules.filter((r) => r.archivedAt !== null).length
  const autoApproveCount = active.filter((r) => r.action === 'auto_approve').length
  const reviewCount = active.filter((r) => r.action === 'route_to_review').length
  const topAutoApproveCap = active
    .filter((r) => r.action === 'auto_approve' && r.maxAmountUsd !== null)
    .map((r) => r.maxAmountUsd as bigint)
    .reduce<bigint | null>((best, v) => (best === null || v > best ? v : best), null)

  return (
    <ListPageShell
      title="Redeem rules"
      subtitle="Auto-approval policy for redemption requests"
      description="Rules run in priority order on every new redemption. The first match wins. If nothing matches, the request goes to the cashier queue for manual review."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Cashier' },
        { label: 'Redeem rules' },
      ]}
      insights={[
        {
          label: 'Active rules',
          value: active.length.toLocaleString(),
          tone: active.length > 0 ? 'positive' : 'attention',
          delta: archived > 0 ? `${archived} archived` : undefined,
        },
        {
          label: 'Auto-approve',
          value: autoApproveCount.toLocaleString(),
          tone: 'positive',
        },
        {
          label: 'Force review',
          value: reviewCount.toLocaleString(),
          tone: 'neutral',
        },
        {
          label: 'Auto-approve ceiling',
          value:
            topAutoApproveCap !== null ? `$${formatMajor(topAutoApproveCap)}` : 'No cap configured',
          tone: topAutoApproveCap !== null ? 'positive' : 'attention',
        },
        {
          label: 'Manager+ to edit',
          value: 'Yes',
          tone: 'neutral',
        },
      ]}
    >
      <RedeemRulesPanel
        canEdit={coreAuth.hasAtLeast(session.payload.role, 'manager')}
        rules={rules.map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          priority: r.priority,
          isActive: r.isActive,
          action: r.action,
          maxAmountUsd: r.maxAmountUsd?.toString() ?? null,
          minAmountUsd: r.minAmountUsd?.toString() ?? null,
          requiredKycLevels: r.requiredKycLevels,
          blockedStates: r.blockedStates,
          requirePriorPaidRedemption: r.requirePriorPaidRedemption,
          completionHours: r.completionHours,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
          archivedAt: r.archivedAt?.toISOString() ?? null,
        }))}
      />
    </ListPageShell>
  )
}

function formatMajor(value: bigint): string {
  const negative = value < 0n
  const abs = negative ? -value : value
  const major = abs / 10_000n
  const minor = abs % 10_000n
  const minorTwo = (minor * 100n + 5_000n) / 10_000n
  const sign = negative ? '-' : ''
  const groupedMajor = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}${groupedMajor}.${minorTwo.toString().padStart(2, '0')}`
}
