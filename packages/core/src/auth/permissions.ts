import type { AdminRoleSlug } from './admin-session'

export type { AdminRoleSlug }

/**
 * Approval thresholds per docs/09 §3. The matrix is the SOURCE OF TRUTH for
 * money-bounded admin actions. Code paths that mutate funds must consult
 * `canApprove*` rather than hard-coding their own threshold.
 */
export const APPROVAL_THRESHOLDS = {
  cashier_redemption_approve: {
    cashier: { max_usd: 1_000 },
    cashier_lead: { max_usd: 10_000 },
    manager: { max_usd: 50_000 },
    master: { max_usd: Number.POSITIVE_INFINITY },
  },
  admin_adjustment_grant: {
    manager: { max_usd_equivalent: 1_000 },
    master: { max_usd_equivalent: Number.POSITIVE_INFINITY },
  },
  player_suspend: {
    manager: { allowed: true },
    master: { allowed: true },
  },
} as const

const ROLE_RANK: Record<AdminRoleSlug, number> = {
  // 'host' is a contractor — restricted access. Rank is intentionally BELOW
  // 'support' so `hasAtLeast(role, 'support')` returns false for hosts and
  // hosts do not accidentally inherit support-or-above permissions through
  // any helper that uses the rank ladder. All host routing flows through
  // the dedicated host-portal predicates below.
  host: 5,
  support: 10,
  kyc_reviewer: 20,
  cashier: 30,
  cashier_lead: 40,
  marketing: 50,
  game_ops: 60,
  manager: 100,
  master: 1000,
}

export function roleRank(role: AdminRoleSlug): number {
  return ROLE_RANK[role]
}

export function hasAtLeast(role: AdminRoleSlug, atLeast: AdminRoleSlug): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[atLeast]
}

export function canManageStaff(role: AdminRoleSlug): boolean {
  return role === 'master'
}

export function canReadAuditLog(role: AdminRoleSlug): boolean {
  return hasAtLeast(role, 'manager')
}

export function canViewIntegrations(role: AdminRoleSlug): boolean {
  return hasAtLeast(role, 'manager')
}

export function canViewSettings(role: AdminRoleSlug): boolean {
  return role === 'master'
}

/**
 * docs/06 §16 / docs/08 §8 — bonus management. Marketing and managers can
 * read and edit bonus templates, manually award bonuses to players, and
 * inspect playthrough state. Support and cashier roles get read-only access
 * to the active list (e.g. when fielding a question about a player's
 * outstanding playthrough).
 */
export function canManageBonuses(role: AdminRoleSlug): boolean {
  return role === 'marketing' || hasAtLeast(role, 'manager')
}

export function canViewBonuses(role: AdminRoleSlug): boolean {
  return hasAtLeast(role, 'support')
}

/**
 * docs/11 §7.4 — adding entries to the CRM suppression list is a
 * compliance-significant action (it permanently blocks marketing to a
 * recipient), so it's gated to manager+. Removing entries is even more
 * sensitive and stays master-only via `canDeleteSuppression`.
 */
export function canManageSuppression(role: AdminRoleSlug): boolean {
  return hasAtLeast(role, 'manager')
}

export function canDeleteSuppression(role: AdminRoleSlug): boolean {
  return role === 'master'
}

/* -------------------------------------------------------------------------- */
/* Content + commercial surfaces — consolidated from the open-coded checks    */
/* that used to live in API route handlers. The matrix below is the SOURCE    */
/* OF TRUTH; routes must call these by name rather than re-evaluating roles.  */
/* -------------------------------------------------------------------------- */

/**
 * Dynamic CMS pages (Terms, Privacy, Sweepstakes Rules, …). Marketing
 * and managers can create / edit / archive. Lower roles read-only.
 */
export function canEditContent(role: AdminRoleSlug): boolean {
  return role === 'marketing' || hasAtLeast(role, 'manager')
}

/**
 * Email Center one-off compose. Same matrix as content editing.
 */
export function canSendOneOffEmail(role: AdminRoleSlug): boolean {
  return role === 'marketing' || hasAtLeast(role, 'manager')
}

/**
 * In-app Notification Center compose. Same matrix as email compose.
 */
export function canSendNotification(role: AdminRoleSlug): boolean {
  return role === 'marketing' || hasAtLeast(role, 'manager')
}

/**
 * Bypass the suppression list when composing a one-off email — only ever
 * legitimate for genuinely transactional / compliance-mandated sends
 * (account closure confirmation, KYC outcome). Audited regardless.
 */
export function canOverrideSuppression(role: AdminRoleSlug): boolean {
  return hasAtLeast(role, 'manager')
}

/**
 * Packages: pricing, bonus structure, banner promos. These move real
 * money so we gate to manager+. Marketing can request changes via the
 * "+ New package" form proposal flow once that lands (TODO).
 */
export function canEditPackages(role: AdminRoleSlug): boolean {
  return hasAtLeast(role, 'manager')
}

/**
 * Loyalty tiers: weekly/monthly SC payouts, login multipliers, cashback %.
 * Manager+ only — same blast radius as packages.
 */
export function canEditTiers(role: AdminRoleSlug): boolean {
  return hasAtLeast(role, 'manager')
}

/**
 * Redemption auto-approve / hold rules.
 */
export function canManageRedemptionRules(role: AdminRoleSlug): boolean {
  return hasAtLeast(role, 'manager')
}

/**
 * Promo code creation + edit. Marketing-friendly surface.
 */
export function canManagePromoCodes(role: AdminRoleSlug): boolean {
  return role === 'marketing' || hasAtLeast(role, 'manager')
}

/**
 * System safety caps (TIER_CAPS sourced from system_config). Master-only
 * because the caps are the last line of defense against misconfiguration
 * giving away the platform.
 */
export function canEditSafetyCaps(role: AdminRoleSlug): boolean {
  return role === 'master'
}

/**
 * Adding entries to any blocklist (email, domain, IP, promo code). Manager+
 * because blocking signups is a customer-impact action. Removing entries
 * is more sensitive and stays master-only via `canDeleteBlocklists`.
 */
export function canManageBlocklists(role: AdminRoleSlug): boolean {
  return hasAtLeast(role, 'manager')
}

export function canDeleteBlocklists(role: AdminRoleSlug): boolean {
  return role === 'master'
}

/* -------------------------------------------------------------------------- */
/* M4 — VIP / Host predicates                                                  */
/* -------------------------------------------------------------------------- */

/**
 * True when the role is the dedicated contractor 'host' role. Hosts have a
 * separate portal entirely (HostShell) and may only see/act on their
 * assigned VIPs. They cannot access the rest of the admin surface.
 */
export function isHost(role: AdminRoleSlug): boolean {
  return role === 'host'
}

/**
 * True when the role is allowed inside the host portal. Hosts get in by
 * definition; master and manager can shadow the experience for support.
 */
export function canAccessHostPortal(role: AdminRoleSlug): boolean {
  return role === 'host' || role === 'manager' || role === 'master'
}

/**
 * True when the role can read every VIP (master / manager admin views).
 * Hosts only see their own — enforced via WHERE clauses, not this helper.
 */
export function canViewAllVips(role: AdminRoleSlug): boolean {
  return role === 'master' || role === 'manager'
}

/**
 * True when the role can change VIP→host assignments (admin VIP pages).
 */
export function canManageVipAssignments(role: AdminRoleSlug): boolean {
  return role === 'master' || role === 'manager'
}

/**
 * True when the role can create a new host account.
 */
export function canCreateHost(role: AdminRoleSlug): boolean {
  return role === 'master'
}

/**
 * True when the role can deactivate / reassign a host's VIPs.
 */
export function canDeactivateHost(role: AdminRoleSlug): boolean {
  return role === 'master'
}

/**
 * True when the role can award a bonus through the host portal entry-point
 * (limited templates + weekly cap enforced separately).
 */
export function canAssignBonusAsHost(role: AdminRoleSlug): boolean {
  return role === 'host' || role === 'master'
}

/**
 * Set of /admin/* prefixes a host can navigate to. Used by both the edge
 * middleware (to gate at the network boundary) and the layout (so the
 * server-rendered shell can short-circuit). Anything not matched is sent
 * to /admin?restricted=1 by the middleware.
 *
 * Keep this list in sync with HostSidebar and the routes that actually exist.
 */
export const HOST_PORTAL_PATH_PREFIXES: readonly string[] = [
  '/admin',
  '/admin/vips',
  '/admin/messages',
  '/admin/bonus',
  '/admin/account',
]

export const HOST_PORTAL_API_PREFIXES: readonly string[] = ['/api/admin/auth/', '/api/admin/host/']

/**
 * Returns true if the path is one a host is allowed to render. We allow
 * `/admin` exactly, `/admin/logout`, and any of the configured prefixes
 * extended with `/`. Sub-paths under non-host areas (e.g. `/admin/players`)
 * return false and trigger a redirect.
 */
export function isHostAllowedAdminPath(pathname: string): boolean {
  if (pathname === '/admin' || pathname === '/admin/') return true
  if (pathname === '/admin/logout') return true
  for (const prefix of HOST_PORTAL_PATH_PREFIXES) {
    if (prefix === '/admin') continue
    if (pathname === prefix) return true
    if (pathname.startsWith(prefix + '/')) return true
  }
  return false
}

export function isHostAllowedApiPath(pathname: string): boolean {
  for (const prefix of HOST_PORTAL_API_PREFIXES) {
    if (pathname.startsWith(prefix)) return true
  }
  return false
}

/**
 * Cap applied to host-initiated bonus awards. Per spec: each host may
 * award up to $500 SC equivalent per VIP per rolling 7 days. Anything
 * larger requires a manager.
 *
 * The cap is expressed in minor units (the bigint scale used everywhere
 * else in the platform). 500 USD * 10_000 minor/major = 5_000_000.
 */
export const HOST_WEEKLY_BONUS_CAP_SC: bigint = 5_000_000n
