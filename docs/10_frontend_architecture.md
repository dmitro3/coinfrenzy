# CoinFrenzy Platform — Frontend Architecture

**Document:** 10 of 13
**Reads:** Doc 01-03, Doc 08 (admin spec), Doc 09 (security)
**Read alongside:** Doc 02 (the transport layer), Doc 12 (Reporting widgets)
**Purpose:** How the player and admin frontends are actually built. Component hierarchy, routing, state, real-time, performance.

---

## 1. The three frontends

There are three distinct frontends in this monorepo:

| Frontend | Path | Audience | URL |
| --- | --- | --- | --- |
| **Player** | `apps/web/(player)/` | Real users playing | coinfrenzy.com |
| **Admin** | `apps/web/(admin)/` | Staff backoffice | admin.coinfrenzy.com |
| **Marketing** | `apps/web/(marketing)/` | Anonymous visitors | coinfrenzy.com (public pages) |

All three live in one Next.js 15 App Router project (one Vercel
deployment, one build) but render at different URLs via host-based
routing in middleware. This matters because:

- One auth provider serves both player and admin (different session models)
- Shared component library across all three
- Single CI/CD pipeline, single deploy target
- Player and admin can share code (e.g. transaction history renderer)

Two reasons we could be tempted to split them, and why we don't:
1. "The admin doesn't need all the player code in its bundle" — Next.js code-splits per route. Admin routes don't ship player code. Solved.
2. "Different teams own them" — at 9-person staff this is one team. If the team grows past 30, split then.

---

## 2. Stack reminder (from Doc 01 §3)

- **Next.js 15** App Router with React Server Components
- **TypeScript strict mode** — no `any`, no `as` without justification
- **Tailwind v3** for styling (v4 still alpha; we wait)
- **shadcn/ui** as the component base (radix-ui under the hood)
- **lucide-react** for icons (consistent stroke)
- **TanStack Query (React Query)** for client-side data fetching against APIs
- **Server Actions** for mutations from RSC
- **Better Auth** for player auth
- **HMAC sessions** for admin auth (Doc 09 §5.2)
- **Recharts** for data viz
- **react-grid-layout** for the customizable admin dashboard
- **Tiptap** for the email template WYSIWYG
- **Inngest dev server** for local flow testing
- **Pusher Channels** or **Ably** for real-time (final choice in §7)

---

## 3. The routing model

```
apps/web/
  middleware.ts              ← host-based routing + auth gates
  
  app/
    (marketing)/             ← Marketing routes — public, anonymous
      page.tsx               (home page)
      about/page.tsx
      faq/page.tsx
      legal/
        terms/page.tsx
        privacy/page.tsx
        sweepstakes-rules/page.tsx
      amoe/page.tsx          (free SC entry — EasyScam handoff)
      blog/[slug]/page.tsx
    
    (auth)/                  ← Auth routes — public
      login/page.tsx
      signup/page.tsx
      verify-email/page.tsx
      reset-password/page.tsx
      mfa/page.tsx
    
    (player)/                ← Player routes — requires player session
      page.tsx               (lobby)
      games/
        page.tsx             (full lobby)
        [gameId]/page.tsx    (game launch)
      cashier/
        buy/page.tsx
        redeem/page.tsx
      account/
        page.tsx
        history/page.tsx
        kyc/page.tsx
        responsible-gaming/page.tsx
        settings/page.tsx
        sessions/page.tsx
      bonuses/page.tsx
      promotions/page.tsx
      vip/page.tsx
      support/page.tsx
    
    (admin)/                 ← Admin routes — requires admin session
      admin/
        page.tsx              (dashboard)
        players/...
        casino/...
        reports/...
        ...                   (all sections from Doc 08)
    
    api/                      ← API routes — see Doc 02 §6
      player/...
      admin/...
      webhooks/...
      cron/...
```

**Route groups (the `(parens)`)** are Next.js syntax for grouping
without affecting URL paths. `(player)` routes don't have `/player/`
in their URL.

### 3.1 Middleware — the routing brain

`apps/web/middleware.ts` runs on every request before the route handler:

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function middleware(req: NextRequest) {
  const host = req.headers.get('host') || '';
  const pathname = req.nextUrl.pathname;
  
  // 1. Host-based routing
  if (host === 'admin.coinfrenzy.com') {
    // Only admin routes accessible
    if (!pathname.startsWith('/admin') && !pathname.startsWith('/api/admin')) {
      return NextResponse.redirect(new URL('/admin', req.url));
    }
    return verifyAdminSession(req);
  }
  
  // 2. Player routes need auth
  if (pathname.startsWith('/account') ||
      pathname.startsWith('/cashier') ||
      pathname.startsWith('/bonuses') ||
      pathname.startsWith('/games/')) {
    return verifyPlayerSession(req);
  }
  
  // 3. Geo gating for sensitive paths
  if (pathname.startsWith('/cashier/buy')) {
    const geo = await getGeoFromRequest(req);
    if (BLOCKED_STATES.has(geo.state)) {
      return NextResponse.redirect(new URL('/legal/blocked-state', req.url));
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
};
```

Auth verification reads the session cookie, checks against database
(via edge-compatible Drizzle queries), and either lets the request
through or redirects to login.

### 3.2 Why one app, not two Next.js apps

Keeps deploys atomic. The shared `packages/ui` and `packages/core`
versions are guaranteed identical across player and admin (no version
skew between separately-deployed apps). The build cache is shared.
Vercel only deploys what changed.

---

## 4. The player frontend

### 4.1 The visual character

Player surface is the casino's brand surface. It needs to feel
premium without trying too hard. Reference points from your taste:
clean dark theme, energetic-but-controlled motion, big visible
balance, fast game grid. NOT Vegas-strip-2010 (gold-on-purple-flames).

Design tokens (in `tailwind.config.ts`):

```typescript
// Brand colors
brand: {
  primary:   '#FFD700',   // gold (CoinFrenzy yellow)
  primaryHover: '#FFC700',
  bg:        '#0A0A0F',   // deep dark
  surface:   '#15151D',   // card background
  surfaceHi: '#1F1F2A',   // elevated card
  border:    '#2A2A38',
},

// Semantic colors
positive: '#10B981',  // wins, credits
negative: '#EF4444',  // losses, debits
warning:  '#F59E0B',  // playthrough remaining, geo notices
info:     '#3B82F6',  // notifications
vip:      '#A855F7',  // premium / VIP markers

// Text
text: {
  primary:   '#FFFFFF',
  secondary: '#A8A8B5',
  muted:     '#6E6E7D',
}
```

Typography:
- UI text: Inter (system fallback)
- Numbers: JetBrains Mono (right-aligned in tables, balance displays)
- Marketing headers: a custom premium font (TBD with design pass)

### 4.2 Page-by-page (player surface)

**Lobby (`/`)** — landing for authenticated players.
- Top: balance bar (sticky), with GC/SC toggle, big quick-buy CTA
- Hero: featured games carousel
- Sections: continue playing (last 6 games), most played, new, all categories
- Bottom: support widget, responsible gaming reminder

**Game Launch (`/games/[gameId]`)** — full-screen game with chrome
- Top bar: back, balance (sticky), session timer, leave button
- Iframe: the game itself, served from Alea
- Side panel (collapsible): chat with support, recent rounds, game info

Game iframe is sandboxed with restricted permissions (`sandbox="allow-scripts allow-same-origin"`). PostMessage protocol for player balance updates back from Alea.

**Cashier — Buy (`/cashier/buy`)**
- Package grid (top): all available packages with prices
- Selected package detail: GC + bonus SC breakdown, total
- Promo code field (optional)
- Payment method picker (cards / Apple Pay / Google Pay)
- Finix-hosted card iframe (we never see PAN)
- 3DS challenge handled in-iframe
- Confirmation page with receipt
- Auto-credit fires via webhook; UI polls for balance update

**Cashier — Redeem (`/cashier/redeem`)**
- Redeemable SC amount (= balance_purchased + balance_earned, NOT bonus or promo)
- Outstanding playthrough message if applicable
- Amount entry
- Method picker: ACH or APT Debit
- Bank account picker (saved + add new flow via Plaid)
- KYC gate if level < required
- Confirmation page with timing expectation ("typically 3-5 business days")

**Account — Home (`/account`)**
- Sub-bucket breakdown of SC: how much is purchased, bonus, promo, earned
- Outstanding playthrough per bonus (list)
- Quick stats: lifetime deposited, lifetime won, current tier
- Sub-nav: History, KYC, Responsible Gaming, Settings, Sessions

**Account — History (`/account/history`)**
- Tabs: All / Purchases / Redemptions / Bonuses / Game Sessions
- Infinite-scroll table per tab
- Filter: date range, type, status
- Each row clickable to drill into full detail
- Export to CSV button (Master compliance feature — proves we offer player data access)

**Account — KYC (`/account/kyc`)**
- Current level: 0/1/2/3
- What's required for next level (per Footprint playbook)
- Footprint embed: SDK launches inline iframe for verification
- Document upload status if applicable

**Account — Responsible Gaming (`/account/responsible-gaming`)**
- Current limits (daily/weekly/monthly deposit + session length)
- Self-exclusion options
- Cooling-off period option (24h, 7d, 30d)
- Resources (helplines per state)

**Bonuses (`/bonuses`)**
- Active bonuses card list
- Each card: name, amount, playthrough progress bar with %, expiry countdown, terms link
- Available bonuses (claimable now): daily login, etc.
- Bonus history

**Promotions (`/promotions`)**
- Active promo banners (from `banners` table, targeting matched)
- Current campaigns visible to this player
- Promo code redemption field

**VIP (`/vip`)**
- Current tier + benefits
- Next tier + requirements + progress bar
- Tier history
- Personal account manager contact (for top tiers)

**Support (`/support`)**
- Intercom widget embedded (per your existing Fin AI setup)
- Top FAQs
- Contact form fallback

### 4.3 The player component hierarchy

```
PlayerLayout                 ← outer shell, balance bar, geo check
  PlayerSidebar              ← lobby quicknav (collapsible)
  PlayerContent              ← page contents
  PlayerFooter               ← compliance, links, support widget
  PlayerNotificationPanel    ← bell icon, dropdown of notifications

BalanceBar                   ← real-time balance with SC/GC toggle, quick buy
GameCard                     ← reused across lobby and history
PackageCard                  ← reused across buy flow and admin packages preview
BonusCard                    ← reused across player bonuses and admin bonus award
PlaythroughProgressBar       ← reused everywhere bonus state shown
TransactionRow               ← reused across player history and admin transactions
```

### 4.4 The mobile question

Player UI must work on mobile. ~70% of casino traffic is mobile. Approach:
- Mobile-first responsive CSS (Tailwind makes this easy)
- Touch-friendly tap targets (44px minimum)
- Bottom navigation bar on narrow screens (lobby / cashier / account / support)
- No hover-only interactions
- PWA support eventually (year 2 — not needed for launch)

Mobile testing checklist before any release:
- [ ] iPhone Safari (current and current-1 iOS)
- [ ] Android Chrome (current)
- [ ] iPad (landscape primarily)
- [ ] Touch targets all ≥44px
- [ ] No iOS scroll-bounce on game launch
- [ ] PWA install prompt triggers correctly (when we add it)

---

## 5. The admin frontend

Doc 08 specs every admin page. This section covers the implementation
patterns.

### 5.1 The admin shell

`apps/web/(admin)/admin/layout.tsx`:

```tsx
<AdminAuthGate requiredRole={null}>
  <div className="flex h-screen bg-admin-bg">
    <AdminSidebar>
      <SidebarNav />
      <SidebarFooter>
        <AdminUserMenu />
      </SidebarFooter>
    </AdminSidebar>
    
    <main className="flex-1 overflow-y-auto">
      <AdminTopBar>
        <BreadcrumbTrail />
        <SearchInput shortcut="/" />
        <RealtimeStatusIndicator />
        <NotificationBell />
      </AdminTopBar>
      
      <div className="p-6">
        {children}
      </div>
    </main>
    
    <CommandPalette />          {/* Cmd+K opens, links to every page */}
    <KeyboardShortcuts />       {/* listens for g/p, g/r, etc */}
  </div>
</AdminAuthGate>
```

### 5.2 The admin component library

`packages/ui/admin/`:

```
admin/
  layout/
    AdminSidebar.tsx
    AdminTopBar.tsx
    PageHeader.tsx
    PageContainer.tsx
  
  data/
    DataTable.tsx              ← the centerpiece: sortable, filterable, paginated table
    DataTableColumnVisibility.tsx
    DataTableFilters.tsx
    DataTableExport.tsx
    DataTableSavedViews.tsx
    DataTableBulkActions.tsx
  
  cards/
    StatCard.tsx               ← the dashboard tile
    StatCardWithTrend.tsx      ← stat + sparkline
    PlayerCard.tsx             ← the 6-card player view block
    QuickActionsCard.tsx
  
  forms/
    PlayerEditDrawer.tsx
    RedemptionActionPanel.tsx
    BonusAwardForm.tsx
    AdminAdjustmentForm.tsx
    SegmentBuilder.tsx         ← the visual segment editor
    FlowBuilder.tsx            ← node-graph flow editor
    EmailTemplateEditor.tsx
  
  display/
    LedgerEntryRow.tsx
    AuditLogEntryRow.tsx
    PlaythroughProgressBar.tsx
    TierBadge.tsx
    StatusBadge.tsx
    IntegrationHealthTile.tsx
  
  interactive/
    CommandPalette.tsx         ← Cmd+K everywhere
    KeyboardShortcuts.tsx
    InlineConfirm.tsx          ← used for destructive actions
    DrawerStack.tsx            ← nested drawers (open player → open ledger entry)
```

### 5.3 The DataTable component

This is the single most-reused admin component. It powers Players,
Transactions, Redemptions, Reports, every list view. The interface:

```typescript
interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[] | (() => Promise<T[]>);
  
  // Pagination
  pagination?: 'cursor' | 'offset' | 'none';
  pageSize?: number;
  
  // Filters
  filterConfig?: FilterConfig[];
  defaultFilters?: Record<string, any>;
  
  // Sorting
  defaultSort?: { column: string; direction: 'asc' | 'desc' };
  
  // Saved views
  scope: string;  // 'players' | 'transactions' | etc.
  
  // Real-time
  realtimeChannel?: string;
  realtimeKey?: string;
  
  // Actions
  rowActions?: (row: T) => RowAction[];
  bulkActions?: BulkAction<T>[];
  
  // Export
  exportEnabled?: boolean;
  
  // Density (compact for power users)
  density?: 'comfortable' | 'compact';
}
```

Built on TanStack Table v8. Performance: virtualized rendering
(only DOM-renders visible rows + buffer) means a 10,000-row table is
as fast as a 50-row one.

### 5.4 The visual segment builder

The single most interesting admin component to build. Spec:

```tsx
<SegmentBuilder
  initialTree={segment.filter_tree}
  onChange={(tree) => debouncedRecount(tree)}
  onSave={(tree) => saveSegment(tree)}
/>
```

Internally:
- Tree visualization: nested boxes representing AND/OR/NOT groups
- Each leaf condition is a row: [type dropdown] [field dropdown] [operator] [value]
- "+ Condition" and "+ Group" buttons at each group level
- Live count: as user changes the tree, debounced 500ms call to `/api/admin/crm/segments/count` returns the matching player count
- "Preview matching players" expandable section shows the first 10

The drag-and-drop within groups uses `dnd-kit`. The condition builder
uses dynamic forms based on the condition type registry.

### 5.5 The flow builder

Node-graph UI using `reactflow`. Nodes are step types from Doc 11 §5
(`send_email`, `wait`, `condition`, `award_bonus`, etc.). Edges are
control-flow connections.

The compiler converts the visual graph to `crm_flow_steps` rows on
save. Inverse: opens existing flow as graph.

### 5.6 Performance for admin pages

Admin users are power users. The single most-noticed performance
problem is "the table re-renders when I'm typing in a filter."

Solutions:
- TanStack Query for data fetching (with staleness + caching)
- React.memo on row components
- Virtualization for tables > 100 rows
- Debounce filter inputs (300ms)
- Optimistic updates for mutations (status changes immediately, server confirms in background)

Real-time updates (e.g. new redemption appears in the queue) are
handled via Pusher Channels (see §7). The admin subscribes to
relevant channels; new events push down updates without polling.

---

## 6. State management

There are five distinct state concerns. Each has a clear home.

### 6.1 Server state — TanStack Query

Anything from the server. Player balance, lists, single resources.
TanStack Query handles caching, refetching, optimistic updates.

```typescript
const { data: player } = useQuery({
  queryKey: ['player', playerId],
  queryFn: () => fetch(`/api/admin/players/${playerId}`).then(r => r.json()),
  staleTime: 30_000,   // re-fetch after 30s if stale
});
```

We use TanStack Query in admin pages and in client-component parts of
the player surface. RSC pages don't need it — they fetch server-side.

### 6.2 Form state — react-hook-form

All forms. Validation via Zod schemas (shared with API routes — see
Doc 02 §6.4).

### 6.3 URL state — Next.js searchParams

Filters, pagination, selected views. The URL is the source of truth for
what's visible. This makes admin views shareable as URLs ("here's the
players page filtered to this exact view").

```typescript
// In admin page
const searchParams = useSearchParams();
const filterState = parseFilters(searchParams);

// On filter change
router.push(`?${serializeFilters(newFilterState)}`);
```

### 6.4 UI state — useState / useReducer

Drawer open/closed, dropdown open/closed, modal visible. Local component
state.

### 6.5 Cross-cutting client state — Zustand (where needed)

Only for things that genuinely cross many components: theme preference,
keyboard shortcuts enabled, command palette open. Most things don't need
this — Zustand stores stay small.

**We do NOT use Redux.** It is over-engineered for our needs. TanStack
Query handles server state; Zustand handles client state; URL handles
shareable state.

---

## 7. Real-time

Two real-time needs:

1. **Player surface:** balance updates, notification arrival, bonus award. Pretty important — a player who just bought coins wants to see them appear.
2. **Admin surface:** new redemption arrives, integration health changes, dashboard counters tick. Important for the live-ops feel.

### 7.1 Tooling choice

We use **Pusher Channels** (or Ably — both are equivalent for our needs).

Why not WebSockets directly: Pusher gives us managed infrastructure
(connection scaling, channel auth, message replay) without operating
our own real-time server. Cost is ~$50-200/month at our scale; way
cheaper than running socket servers.

Why not Server-Sent Events: SSE works fine for one-way push but not
for the bidirectional needs (e.g. presence — "who's online"). Pusher
handles both.

### 7.2 Channel structure

```
private-player-{playerId}            ← per-player updates (balance, bonus, notification)
private-admin-{adminId}              ← per-admin (their queue updates)
admin-redemption-queue               ← all-admin (new redemption appears)
admin-integration-health             ← all-admin (provider health changes)
admin-dashboard-counters             ← all-admin (live KPI counter ticks)
```

`private-*` channels require auth. The auth endpoint
(`/api/realtime/auth`) verifies the requester's session and signs the
subscription request for Pusher.

### 7.3 Publishing events

The worker and webhook handlers publish:

```typescript
// After a successful ledger write affecting a player's wallet
await pusher.trigger(
  `private-player-${playerId}`,
  'balance-update',
  { currency: 'SC', balance: newBalance }
);
```

The frontend subscribes:

```typescript
useEffect(() => {
  const channel = pusher.subscribe(`private-player-${playerId}`);
  channel.bind('balance-update', (data) => {
    queryClient.setQueryData(['wallet', playerId], data);
  });
  return () => channel.unsubscribe();
}, [playerId]);
```

### 7.4 The graceful-degradation rule

If Pusher is down, the UI must still work. TanStack Query refetches
on window focus by default. If the real-time channel is down, balance
updates happen on next interaction (1-10 second delay vs. instant).
Acceptable.

---

## 8. Performance — what we measure

| Metric | Player surface target | Admin target |
| --- | --- | --- |
| LCP (Largest Contentful Paint) | < 1.8s | < 2.0s |
| FID (First Input Delay) | < 100ms | < 100ms |
| CLS (Cumulative Layout Shift) | < 0.1 | < 0.1 |
| TTFB (Time to First Byte) | < 400ms | < 400ms |
| Bundle size (gzipped, per route) | < 200KB | < 350KB |
| API response time (p95) | < 200ms | < 300ms |

Measured continuously via Vercel Analytics + Sentry Performance.
Regressions block deploys (set as Vercel checks).

### 8.1 Image optimization

All player-facing images go through Next.js Image. Game thumbnails,
banners, package images, avatars. Stored in R2 with public read.

Game thumbnails: WebP with AVIF fallback. Lazy loaded below the fold.

### 8.2 Code splitting

Next.js handles per-route automatically. Additional manual splitting:
- Admin pages don't ship player code (separate route group)
- Heavy charts (Recharts) lazy-loaded only on Reports pages
- The Tiptap editor lazy-loaded only on template editing pages
- The flow builder (reactflow) lazy-loaded only on flow editor

### 8.3 Caching

CDN-cached:
- Marketing pages (revalidate every hour)
- Legal pages (revalidate every day)
- Game thumbnails (revalidate every week, cache-busted by URL)
- Static assets (cache forever, hashed filenames)

Not CDN-cached:
- Player pages (require auth)
- Admin pages (always)
- API responses (always)

---

## 9. Internationalization (deferred)

CoinFrenzy is US-only for v1. No i18n setup needed at launch.

When we expand:
- next-intl is the migration path
- Strings extracted to `messages/en.json` first
- New locales added without code changes

This is a year-2+ consideration.

---

## 10. Accessibility

Non-negotiable basics:
- All interactive elements keyboard-accessible
- Focus rings visible on focus
- Form labels properly associated
- ARIA labels where icons are buttons
- Color contrast meets WCAG AA (4.5:1 for text, 3:1 for UI)
- Reduced motion respected (`prefers-reduced-motion`)
- Screen reader testing on critical flows (signup, purchase, redemption)

Lighthouse accessibility score ≥ 95 on every commit (CI check).

---

## 11. Testing strategy

### 11.1 Unit tests

- Logic in `packages/core` — Jest, 80% coverage minimum
- UI components in `packages/ui` — Vitest + React Testing Library
- Test pyramids: many unit, fewer integration, fewest E2E

### 11.2 Integration tests

- API routes — test against a real Postgres test DB (Testcontainers)
- Worker jobs — test with a mocked Inngest harness

### 11.3 E2E tests

- Playwright
- Cover critical paths:
  - Player signup → email verify → first login
  - Purchase a package → see balance update → play a game
  - Redemption request → admin approves → see status update
  - Self-exclusion → can't log in
  - Admin login with 2FA → search player → adjust coins
- Run on every PR against staging
- Daily run against production (read-only paths only)

### 11.4 Visual regression tests

- Chromatic via Storybook for `packages/ui`
- Catches CSS regressions automatically

---

## 12. Deployment

Vercel:
- Production: every push to `main` → preview build → manual promotion
- Preview: every PR → preview URL
- Staging: a long-lived branch that mirrors prod env vars

Inngest:
- Functions deploy with the Vercel build
- Inngest dev server for local testing

Fly.io (workers):
- Worker app deploys via GitHub Actions on push to `main`
- Health checks ensure traffic only goes to ready instances

Doppler:
- Three configs (dev, staging, prod)
- Vercel and Fly both pull at build time
- Rotation runbook in Doc 09 §9.4

---

## 13. What's next

Doc 12 (Reporting & Exports) covers the data visualization patterns
used by the Reports section of admin. Doc 05/06/07 (when API docs
arrive) cover the integration adapters that the frontend talks to.
