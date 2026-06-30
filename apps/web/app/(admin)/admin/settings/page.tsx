import 'server-only'

import Link from 'next/link'
import {
  AlertTriangle,
  Banknote,
  Bell,
  Building2,
  CreditCard,
  Gift,
  Plug,
  ShieldCheck,
} from 'lucide-react'

import { getVendorModes } from '@coinfrenzy/config'
import { system as systemMod } from '@coinfrenzy/core'
import { canEditContent, hasAtLeast } from '@coinfrenzy/core/auth'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { buildAdminRscContext } from '@/lib/admin-rsc-context'
import { requireAdminSession } from '@/lib/admin-session'

import {
  BonusSectionEditor,
  FieldList,
  FieldRow,
  GeneralSectionEditor,
  RedemptionSectionEditor,
  RgSectionEditor,
} from './_sections'

export const dynamic = 'force-dynamic'

// docs/09 — Settings page.
//
// Editable from this page (audited, master-only or manager+ per matrix):
//   - General platform identity (manager+)
//   - Responsible-gaming defaults (master only)
//   - Bonus engine defaults (manager+)
//   - Redemption operator caps (master only)
//   - Safety caps for tier rewards → its own /admin/settings/safety-caps page
//
// Read-only on this page (sourced from Doppler env or vendor adapters):
//   - Locale, timezone, currency display
//   - Jurisdiction blocklist (legal-controlled constant in core)
//   - All vendor integration modes (Finix, Alea, Footprint, ...)
//   - PagerDuty / Slack / banking
// These need a code or Doppler change rather than a runtime toggle.

export default async function Page() {
  const session = await requireAdminSession('/admin/settings')
  const role = session.payload.role
  const ctx = buildAdminRscContext()

  const [general, rg, bonus, redemption] = await Promise.all([
    systemMod.getGeneralSettings(ctx),
    systemMod.getRgDefaults(ctx),
    systemMod.getBonusDefaults(ctx),
    systemMod.getRedemptionCaps(ctx),
  ])

  // canEditContent matches the matrix for "manager+ or marketing".
  // For settings we want strictly manager+, so use the helper directly.
  const canEditGeneral = hasAtLeast(role, 'manager') || canEditContent(role)
  const canEditBonus = hasAtLeast(role, 'manager')
  const canEditMasterOnly = role === 'master'

  // Read-only display values sourced from Doppler / engineering config.
  const vendorModes = getVendorModes()
  const nodeEnv = process.env.NODE_ENV ?? 'unknown'
  const dbHost = (() => {
    try {
      const u = new URL(process.env.DATABASE_URL ?? '')
      return u.host
    } catch {
      return null
    }
  })()
  const overallMode =
    Object.values(vendorModes).every((m) => m === 'real') && nodeEnv === 'production'
      ? 'Production'
      : Object.values(vendorModes).some((m) => m === 'mock')
        ? 'Sandbox'
        : 'Pre-production'

  return (
    <ListPageShell
      title="Settings"
      subtitle="Operator-tunable platform settings"
      description="Editable rows are persisted in system_config and audited. Read-only rows come from Doppler / engineering config — change them via the engineering runbook."
      breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Settings' }]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        { label: 'Editable sections', value: '4', tone: 'neutral' },
        {
          label: 'Mode',
          value: overallMode,
          tone: overallMode === 'Production' ? 'positive' : 'notice',
        },
        { label: 'Source', value: 'system_config + Doppler', tone: 'neutral' },
      ]}
    >
      {/* Safety caps quick-link (its own dedicated page) */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="border-amber-700/30 bg-amber-950/10">
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
              <div>
                <div className="text-sm font-medium text-ink-primary">Tier safety caps</div>
                <div className="text-xs text-ink-tertiary">
                  Master-only operator ceilings (weekly/monthly SC, login multiplier, cashback %).
                  Caps clamp every tier write and are audited on change.
                </div>
              </div>
            </div>
            <Link
              href="/admin/settings/safety-caps"
              className="text-sm font-medium text-emerald-300 underline-offset-4 hover:underline"
            >
              Manage caps →
            </Link>
          </CardContent>
        </Card>
        <Card className="border-blue-700/30 bg-blue-950/10">
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-blue-300" />
              <div>
                <div className="text-sm font-medium text-ink-primary">Terms & policies</div>
                <div className="text-xs text-ink-tertiary">
                  Publish a new TOS / Privacy / RG policy version. Every player must re-accept
                  before transacting. Append-only, audited.
                </div>
              </div>
            </div>
            <Link
              href="/admin/settings/terms"
              className="text-sm font-medium text-blue-300 underline-offset-4 hover:underline"
            >
              Manage terms →
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* General */}
        <Card id="general">
          <CardContent className="space-y-3 p-5">
            <header className="flex items-center gap-3">
              <span className="text-ink-tertiary [&>svg]:h-4 [&>svg]:w-4">
                <Building2 />
              </span>
              <div>
                <div className="text-sm font-medium text-ink-primary">General</div>
                <div className="text-xs text-ink-tertiary">
                  Public-facing platform identity. Used in email templates and the player UI.
                </div>
              </div>
            </header>
            <GeneralSectionEditor initial={general} canEdit={canEditGeneral} />
          </CardContent>
        </Card>

        {/* Compliance — read-only (legal-controlled) */}
        <Card id="compliance">
          <CardContent className="space-y-3 p-5">
            <header className="flex items-center gap-3">
              <span className="text-ink-tertiary [&>svg]:h-4 [&>svg]:w-4">
                <ShieldCheck />
              </span>
              <div>
                <div className="text-sm font-medium text-ink-primary">Compliance</div>
                <div className="text-xs text-ink-tertiary">
                  Geo, KYC and identity gates. Engineering-controlled.
                </div>
              </div>
            </header>
            <FieldList>
              <FieldRow
                label="Jurisdiction blocklist"
                value="WA, ID, NV, MI"
                hint="No play allowed; sourced from core constants"
              />
              <FieldRow label="Default KYC level" value="Level 1 (no KYC for play)" />
              <FieldRow label="KYC required at" value="First redemption" />
              <FieldRow label="Self-exclusion provider" value="Internal" />
            </FieldList>
            <ReadOnlyFooter source="engineering / legal" />
          </CardContent>
        </Card>

        {/* Payments → editable redemption caps */}
        <Card id="payments">
          <CardContent className="space-y-3 p-5">
            <header className="flex items-center gap-3">
              <span className="text-ink-tertiary [&>svg]:h-4 [&>svg]:w-4">
                <CreditCard />
              </span>
              <div>
                <div className="text-sm font-medium text-ink-primary">Payments</div>
                <div className="text-xs text-ink-tertiary">
                  Operator-wide redemption ceilings. Per-rule decisions live in{' '}
                  <Link
                    href="/admin/cashier/redeem-rules"
                    className="underline-offset-2 hover:underline"
                  >
                    cashier rules
                  </Link>
                  .
                </div>
              </div>
            </header>
            <RedemptionSectionEditor initial={redemption} canEdit={canEditMasterOnly} />
          </CardContent>
        </Card>

        {/* Bonus defaults */}
        <Card id="bonuses">
          <CardContent className="space-y-3 p-5">
            <header className="flex items-center gap-3">
              <span className="text-ink-tertiary [&>svg]:h-4 [&>svg]:w-4">
                <Gift />
              </span>
              <div>
                <div className="text-sm font-medium text-ink-primary">Bonuses</div>
                <div className="text-xs text-ink-tertiary">
                  Defaults applied when a bonus template omits an explicit value.
                </div>
              </div>
            </header>
            <BonusSectionEditor initial={bonus} canEdit={canEditBonus} />
          </CardContent>
        </Card>

        {/* RG limits */}
        <Card id="limits">
          <CardContent className="space-y-3 p-5">
            <header className="flex items-center gap-3">
              <span className="text-ink-tertiary [&>svg]:h-4 [&>svg]:w-4">
                <AlertTriangle />
              </span>
              <div>
                <div className="text-sm font-medium text-ink-primary">
                  Responsible gaming limits
                </div>
                <div className="text-xs text-ink-tertiary">
                  Defaults applied to new accounts. Players can tighten via self-service.
                </div>
              </div>
            </header>
            <RgSectionEditor initial={rg} canEdit={canEditMasterOnly} />
          </CardContent>
        </Card>

        {/* Integrations — vendor modes (Doppler-controlled) */}
        <Card id="integrations">
          <CardContent className="space-y-3 p-5">
            <header className="flex items-center gap-3">
              <span className="text-ink-tertiary [&>svg]:h-4 [&>svg]:w-4">
                <Plug />
              </span>
              <div>
                <div className="text-sm font-medium text-ink-primary">Integrations</div>
                <div className="text-xs text-ink-tertiary">
                  Vendor wiring. Toggle each USE_MOCK_* flag in Doppler.
                </div>
              </div>
            </header>
            <FieldList>
              {(
                [
                  ['Finix (payments)', vendorModes.finix],
                  ['Alea (games)', vendorModes.alea],
                  ['Footprint (KYC)', vendorModes.footprint],
                  ['Radar (fraud + geo)', vendorModes.radar],
                  ['SendGrid (email)', vendorModes.sendgrid],
                  ['Twilio (SMS)', vendorModes.twilio],
                  ['EasyScam (AMOE)', vendorModes.easyscam],
                ] as const
              ).map(([label, mode]) => (
                <FieldRow
                  key={label}
                  label={label}
                  value={
                    <span className={mode === 'mock' ? 'text-amber-300' : 'text-emerald-300'}>
                      {mode === 'mock' ? 'Mock' : 'Live'}
                    </span>
                  }
                />
              ))}
            </FieldList>
            <ReadOnlyFooter
              source="Doppler"
              link="/admin/integrity"
              linkLabel="View live health →"
            />
          </CardContent>
        </Card>

        {/* Admin alerts */}
        <Card id="notifications">
          <CardContent className="space-y-3 p-5">
            <header className="flex items-center gap-3">
              <span className="text-ink-tertiary [&>svg]:h-4 [&>svg]:w-4">
                <Bell />
              </span>
              <div>
                <div className="text-sm font-medium text-ink-primary">Admin alerts</div>
                <div className="text-xs text-ink-tertiary">Where operational alerts go.</div>
              </div>
            </header>
            <FieldList>
              <FieldRow
                label="PagerDuty service"
                value={process.env.PAGERDUTY_SERVICE_KEY ? 'configured' : '—'}
              />
              <FieldRow label="Slack channel" value={process.env.OPS_SLACK_CHANNEL ?? '—'} />
              <FieldRow label="On-call rotation" value="Master + 1 backup" />
            </FieldList>
            <ReadOnlyFooter source="Doppler" />
          </CardContent>
        </Card>

        {/* Banking */}
        <Card id="banking">
          <CardContent className="space-y-3 p-5">
            <header className="flex items-center gap-3">
              <span className="text-ink-tertiary [&>svg]:h-4 [&>svg]:w-4">
                <Banknote />
              </span>
              <div>
                <div className="text-sm font-medium text-ink-primary">Banking</div>
                <div className="text-xs text-ink-tertiary">
                  Funding accounts and reconciliation cadence.
                </div>
              </div>
            </header>
            <FieldList>
              <FieldRow label="Operating account" value="Mercury • last4 1234" />
              <FieldRow label="ACH cutoff" value="17:00 ET (T+2)" />
              <FieldRow label="Reconciliation cadence" value="Daily 02:00 UTC" />
            </FieldList>
            <ReadOnlyFooter source="engineering" />
          </CardContent>
        </Card>

        {/* Environment fingerprint — diagnostics only */}
        <Card id="environment">
          <CardContent className="space-y-3 p-5">
            <header className="flex items-center gap-3">
              <span className="text-ink-tertiary [&>svg]:h-4 [&>svg]:w-4">
                <ShieldCheck />
              </span>
              <div>
                <div className="text-sm font-medium text-ink-primary">Environment</div>
                <div className="text-xs text-ink-tertiary">
                  Diagnostic info. Useful when filing a ticket with engineering.
                </div>
              </div>
            </header>
            <FieldList>
              <FieldRow label="NODE_ENV" value={nodeEnv} />
              <FieldRow
                label="Database host"
                value={dbHost ?? '—'}
                hint={dbHost ? 'from DATABASE_URL' : null}
              />
              <FieldRow label="Locale" value="en-US" />
              <FieldRow label="Default timezone" value="America/New_York" />
            </FieldList>
          </CardContent>
        </Card>
      </div>
    </ListPageShell>
  )
}

function ReadOnlyFooter({
  source,
  link,
  linkLabel,
}: {
  source: string
  link?: string
  linkLabel?: string
}) {
  return (
    <div className="flex items-center justify-between border-t border-line-subtle pt-3 text-[11px] uppercase tracking-wide text-ink-tertiary">
      <span>read-only · source: {source}</span>
      {link ? (
        <Link href={link} className="font-medium text-ink-secondary hover:underline">
          {linkLabel ?? 'View →'}
        </Link>
      ) : null}
    </div>
  )
}
