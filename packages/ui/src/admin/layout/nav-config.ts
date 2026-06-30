import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  AlertOctagon,
  Banknote,
  Bell,
  BookOpenText,
  Building2,
  Coins,
  Database,
  Download,
  Files,
  Gauge,
  Gift,
  GitBranch,
  Hammer,
  LayoutDashboard,
  Layers,
  Mail,
  Megaphone,
  Package,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Star,
  Tag,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react'

export type AdminRoleSlug =
  | 'support'
  | 'host'
  | 'kyc_reviewer'
  | 'cashier'
  | 'cashier_lead'
  | 'marketing'
  | 'game_ops'
  | 'manager'
  | 'master'

export interface NavLeaf {
  kind: 'leaf'
  label: string
  href: string
  icon?: LucideIcon
  /** Roles that may see this link. `null` = visible to all roles. */
  roles: AdminRoleSlug[] | null
  /** Optional keyboard shortcut (e.g. ["g", "p"]). */
  shortcut?: string[]
  /** Optional badge text (e.g. "Coming in prompt 05") for stubs. */
  comingIn?: string
  /** Mark stub pages so the sidebar can render a dim style. */
  stub?: boolean
}

export interface NavGroup {
  kind: 'group'
  label: string
  icon?: LucideIcon
  roles: AdminRoleSlug[] | null
  children: NavLeaf[]
}

export type NavNode = NavLeaf | NavGroup

const ALL: AdminRoleSlug[] | null = null
const MANAGER_PLUS: AdminRoleSlug[] = ['manager', 'master']
const MASTER_ONLY: AdminRoleSlug[] = ['master']

/**
 * The admin navigation graph. Per docs/08 §1.
 *
 * The order, labels, and grouping match the doc exactly — do not reorder
 * without updating docs/08.
 */
export const ADMIN_NAV: NavNode[] = [
  {
    kind: 'leaf',
    label: 'Dashboard',
    href: '/admin',
    icon: LayoutDashboard,
    roles: ALL,
    shortcut: ['g', 'd'],
  },
  {
    kind: 'leaf',
    label: 'Players',
    href: '/admin/players',
    icon: Users,
    roles: ALL,
    shortcut: ['g', 'p'],
  },
  {
    kind: 'group',
    label: 'Casino Management',
    icon: Gauge,
    roles: ALL,
    children: [
      {
        kind: 'leaf',
        label: 'Providers',
        href: '/admin/casino/providers',
        roles: ALL,
      },
      {
        kind: 'leaf',
        label: 'Games',
        href: '/admin/casino/games',
        roles: ALL,
      },
      {
        kind: 'leaf',
        label: 'Game Lobby',
        href: '/admin/casino/lobby',
        roles: ALL,
      },
      {
        kind: 'leaf',
        label: 'Sub Categories',
        href: '/admin/casino/sub-categories',
        roles: ALL,
      },
      {
        kind: 'leaf',
        label: 'Aggregators',
        href: '/admin/casino/aggregators',
        roles: ALL,
      },
    ],
  },
  {
    kind: 'group',
    label: 'Reports',
    icon: BookOpenText,
    roles: MANAGER_PLUS,
    children: [
      { kind: 'leaf', label: 'All Reports', href: '/admin/reports', roles: MANAGER_PLUS },
      { kind: 'leaf', label: 'Daily KPIs', href: '/admin/reports/daily-kpis', roles: MANAGER_PLUS },
      {
        kind: 'leaf',
        label: 'Purchase Report',
        href: '/admin/reports/purchase',
        roles: MANAGER_PLUS,
      },
      { kind: 'leaf', label: 'Bonus Report', href: '/admin/reports/bonus', roles: MANAGER_PLUS },
      {
        kind: 'leaf',
        label: 'Users Daily Report',
        href: '/admin/reports/users-daily',
        roles: MANAGER_PLUS,
      },
      {
        kind: 'leaf',
        label: 'Redeem Rate Report',
        href: '/admin/reports/redeem-rate',
        roles: MANAGER_PLUS,
      },
      {
        kind: 'leaf',
        label: 'Playthrough Report',
        href: '/admin/reports/playthrough',
        roles: MANAGER_PLUS,
      },
      {
        kind: 'leaf',
        label: 'Affiliate Report',
        href: '/admin/reports/affiliate',
        roles: MANAGER_PLUS,
      },
      {
        kind: 'leaf',
        label: 'Custom Query',
        href: '/admin/reports/custom-query',
        roles: MASTER_ONLY,
      },
    ],
  },
  {
    kind: 'group',
    label: 'Transactions',
    icon: Coins,
    roles: ALL,
    children: [
      {
        kind: 'leaf',
        label: 'Purchases',
        href: '/admin/transactions/purchases',
        roles: ALL,
      },
      {
        kind: 'leaf',
        label: 'Redemptions',
        href: '/admin/transactions/redemptions',
        roles: ALL,
        shortcut: ['g', 'r'],
      },
      {
        kind: 'leaf',
        label: 'Bonus Awards',
        href: '/admin/transactions/bonus-awards',
        roles: ALL,
      },
      {
        kind: 'leaf',
        label: 'Casino Activity',
        href: '/admin/transactions/casino',
        roles: ALL,
      },
    ],
  },
  {
    kind: 'group',
    label: 'Cashier Management',
    icon: Wallet,
    roles: ALL,
    children: [
      {
        kind: 'leaf',
        label: 'Pending Redemptions',
        href: '/admin/cashier/pending',
        roles: ALL,
      },
      {
        kind: 'leaf',
        label: 'Approved Redemptions',
        href: '/admin/cashier/approved',
        roles: ALL,
      },
      {
        kind: 'leaf',
        label: 'Cancelled Redemptions',
        href: '/admin/cashier/cancelled',
        roles: ALL,
      },
      {
        kind: 'leaf',
        label: 'Redeem Rules',
        href: '/admin/cashier/redeem-rules',
        roles: ALL,
      },
      {
        kind: 'leaf',
        label: 'AML Hold Queue',
        href: '/admin/cashier/aml-hold',
        roles: MANAGER_PLUS,
      },
    ],
  },
  {
    kind: 'group',
    label: 'Bonus',
    icon: Gift,
    roles: ALL,
    children: [
      {
        kind: 'leaf',
        label: 'Active Bonuses',
        href: '/admin/bonus/active',
        roles: ALL,
      },
      {
        kind: 'leaf',
        label: 'Bonus Templates',
        href: '/admin/bonus/templates',
        roles: ALL,
      },
      {
        kind: 'leaf',
        label: 'Playthrough Tracking',
        href: '/admin/bonus/playthrough',
        roles: ALL,
      },
      {
        kind: 'leaf',
        label: 'Manual Award',
        href: '/admin/bonus/manual-award',
        roles: ALL,
      },
    ],
  },
  {
    kind: 'group',
    label: 'Promo Codes',
    icon: Tag,
    roles: ALL,
    children: [
      {
        kind: 'leaf',
        label: 'Active',
        href: '/admin/promo-codes/active',
        roles: ALL,
      },
      {
        kind: 'leaf',
        label: 'Bonus Mapping',
        href: '/admin/promo-codes/bonus',
        roles: ALL,
      },
      {
        kind: 'leaf',
        label: 'Restrictions',
        href: '/admin/promo-codes/restrictions',
        roles: ALL,
      },
      {
        kind: 'leaf',
        label: 'Archived',
        href: '/admin/promo-codes/archived',
        roles: ALL,
      },
    ],
  },
  {
    kind: 'group',
    label: 'VIP / Hosts',
    icon: Trophy,
    roles: MANAGER_PLUS,
    children: [
      { kind: 'leaf', label: 'Overview', href: '/admin/vip', roles: MANAGER_PLUS },
      { kind: 'leaf', label: 'All VIPs', href: '/admin/vip/all-vips', roles: MANAGER_PLUS },
      { kind: 'leaf', label: 'Hosts', href: '/admin/vip/hosts', roles: MANAGER_PLUS },
      { kind: 'leaf', label: 'Assignments', href: '/admin/vip/assignments', roles: MANAGER_PLUS },
    ],
  },
  {
    kind: 'group',
    label: 'CRM',
    icon: Megaphone,
    roles: ALL,
    children: [
      { kind: 'leaf', label: 'Overview', href: '/admin/crm', roles: ALL },
      { kind: 'leaf', label: 'Segments', href: '/admin/crm/segments', roles: ALL },
      { kind: 'leaf', label: 'Campaigns', href: '/admin/crm/campaigns', roles: ALL },
      { kind: 'leaf', label: 'Flows', href: '/admin/crm/flows', roles: ALL },
      { kind: 'leaf', label: 'Cohorts', href: '/admin/crm/cohorts', roles: ALL },
      { kind: 'leaf', label: 'Performance', href: '/admin/crm/performance', roles: ALL },
      { kind: 'leaf', label: 'Live Events', href: '/admin/crm/events', roles: ALL },
      { kind: 'leaf', label: 'Email Templates', href: '/admin/crm/email-templates', roles: ALL },
      { kind: 'leaf', label: 'SMS Templates', href: '/admin/crm/sms-templates', roles: ALL },
      { kind: 'leaf', label: 'Library', href: '/admin/crm/library', roles: ALL },
      { kind: 'leaf', label: 'Message Log', href: '/admin/crm/message-log', roles: ALL },
      { kind: 'leaf', label: 'Suppression', href: '/admin/crm/suppression', roles: MANAGER_PLUS },
    ],
  },
  {
    kind: 'leaf',
    label: 'Packages',
    href: '/admin/packages',
    icon: Package,
    roles: ALL,
  },
  {
    kind: 'leaf',
    label: 'Tiers',
    href: '/admin/tiers',
    icon: Star,
    roles: ALL,
  },
  {
    kind: 'leaf',
    label: 'CMS',
    href: '/admin/cms',
    icon: Files,
    roles: ALL,
  },
  {
    kind: 'leaf',
    label: 'Email Center',
    href: '/admin/email-center',
    icon: Mail,
    roles: ALL,
  },
  {
    kind: 'leaf',
    label: 'Banner Management',
    href: '/admin/banners',
    icon: Layers,
    roles: ALL,
  },
  {
    kind: 'leaf',
    label: 'Notification Center',
    href: '/admin/notifications',
    icon: Bell,
    roles: ALL,
  },
  {
    kind: 'leaf',
    label: 'Export Center',
    href: '/admin/exports',
    icon: Download,
    roles: ALL,
  },
  {
    kind: 'leaf',
    label: 'Domain Blocking',
    href: '/admin/domain-blocking',
    icon: ShieldAlert,
    roles: MANAGER_PLUS,
  },
  {
    kind: 'leaf',
    label: 'Promocode Blocking',
    href: '/admin/promocode-blocking',
    icon: ShieldAlert,
    roles: MANAGER_PLUS,
  },
  {
    kind: 'leaf',
    label: 'Admin Added Coins',
    href: '/admin/admin-added-coins',
    icon: Coins,
    roles: MANAGER_PLUS,
  },
  {
    kind: 'leaf',
    label: 'Integrity',
    href: '/admin/integrity',
    icon: AlertOctagon,
    roles: MANAGER_PLUS,
  },
  {
    kind: 'group',
    label: 'Administration',
    icon: ShieldCheck,
    roles: MANAGER_PLUS,
    children: [
      { kind: 'leaf', label: 'Staff', href: '/admin/staff', roles: MASTER_ONLY },
      { kind: 'leaf', label: 'Audit Log', href: '/admin/audit', roles: MANAGER_PLUS },
      {
        kind: 'leaf',
        label: 'Settings',
        href: '/admin/settings',
        roles: MASTER_ONLY,
      },
      {
        kind: 'leaf',
        label: 'Gamma Migration',
        href: '/admin/migration',
        icon: GitBranch,
        roles: MASTER_ONLY,
      },
    ],
  },
]

const _otherIcons = {
  Activity,
  Banknote,
  Building2,
  Database,
  Hammer,
  ScrollText,
  Settings,
  Tag,
} satisfies Record<string, LucideIcon>
void _otherIcons

/**
 * Filter nav by a role slug. Returns nodes the role is permitted to see.
 */
export function navForRole(role: AdminRoleSlug | null): NavNode[] {
  if (role == null) return ADMIN_NAV
  const out: NavNode[] = []
  for (const node of ADMIN_NAV) {
    if (node.kind === 'leaf') {
      if (node.roles == null || node.roles.includes(role)) out.push(node)
      continue
    }
    const visible = node.children.filter((c) => c.roles == null || c.roles.includes(role))
    if (visible.length === 0) continue
    out.push({ ...node, children: visible })
  }
  return out
}

/**
 * Flatten the nav into leaves only. Used by the command palette.
 */
export function flattenNav(nodes: NavNode[] = ADMIN_NAV): NavLeaf[] {
  const out: NavLeaf[] = []
  for (const n of nodes) {
    if (n.kind === 'leaf') {
      out.push(n)
    } else {
      out.push(...n.children)
    }
  }
  return out
}
