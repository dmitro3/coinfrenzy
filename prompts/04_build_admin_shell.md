# Prompt 04 — Build the Admin Shell

Copy this entire file into Cursor's chat and hit enter. Prompts 01-03
must be complete.

---

Continuing the CoinFrenzy build. Read these documents before starting:
- `docs/08_admin_panel.md` (especially §0 "design north star", §1 nav, §2 dashboard, §14 staff/audit)
- `docs/10_frontend_architecture.md` §5 (admin frontend patterns)
- `docs/09_security_compliance_audit.md` §3 (role permissions), §5.2 (admin HMAC sessions)

Re-read `.cursorrules`.

## Your task

Build the admin shell — the layout, navigation, auth, and dashboard
landing — so the user can log in and see the empty interior. Subsequent
prompts will fill in specific pages.

## Specific requirements

1. **Admin auth implementation** per docs/09 §5.2:
   - HMAC session pattern hardened with the 5 upgrades from §5.2
   - `packages/core/src/auth/admin-session.ts` — sign, verify, revoke
   - `packages/core/src/auth/admin-2fa.ts` — TOTP setup and verification
   - Session cookie (HTTP-only, secure, sameSite=lax)
   - The `admin_sessions` table is already in the schema from prompt 02
   - Login API at `apps/web/app/api/admin/auth/login/route.ts`
   - Logout API
   - Force-logout (admin revokes own or other sessions; master only for other)

2. **Admin login page** at `apps/web/app/(admin)/admin/login/page.tsx`:
   - Email + password
   - 2FA TOTP step (mandatory on first login per docs/09 §5.2)
   - Visual: clean dark theme per docs/08 §17
   - Brand: gold-on-dark per docs/10 §4.1 (use placeholder colors if user
     hasn't provided brand assets yet)

3. **Admin layout shell** at `apps/web/app/(admin)/admin/layout.tsx`:
   - Per docs/08 §2 navigation structure (the 21 sections in the sidebar)
   - Sidebar component at `packages/ui/admin/layout/AdminSidebar.tsx`
   - Top bar at `packages/ui/admin/layout/AdminTopBar.tsx`
   - Auth gate that redirects to /admin/login if not authenticated
   - All sections except Dashboard are stub pages with "Coming in
     prompt NN" placeholders

4. **The dashboard page** at `apps/web/app/(admin)/admin/page.tsx`:
   - Implement the master/manager dashboard per docs/08 §2.1
   - Top row: 8 tiles (today's SC staked, GGR, NGR, SC awarded, etc.)
   - Second row: 5 engagement tiles
   - Third row: 4 mini-chart cards with sparklines (use Recharts)
   - Fourth row: bonus breakdown + login matrix
   - Fifth row: integration health
   - All tiles read from `daily_operational_snapshots` (will be empty
     today; show zeros gracefully) and live ledger queries for today's
     numbers
   - Stub the integration health row to show all green for now (real
     health monitoring wires up in prompt 06)

5. **The `DataTable` component** at `packages/ui/admin/data/DataTable.tsx`:
   - Per docs/08 §5.3 interface
   - Built on TanStack Table v8
   - Virtualized rendering (use `@tanstack/react-virtual`)
   - Sortable, filterable, paginated
   - Saved views via `admin_saved_views` table
   - CSV export
   - This component will be used heavily in subsequent prompts; build it
     well

6. **The `StatCard` and `StatCardWithTrend` components**:
   - `packages/ui/admin/cards/StatCard.tsx`
   - `packages/ui/admin/cards/StatCardWithTrend.tsx`
   - Per the dashboard tile pattern in docs/08 §2

7. **Command palette** (Cmd+K):
   - `packages/ui/admin/interactive/CommandPalette.tsx`
   - Links to every admin section
   - Search across sections
   - Use `cmdk` library

8. **Keyboard shortcuts** per docs/08 §0 rule 7:
   - `/` focuses search
   - `g p` → Players
   - `g r` → Redemptions
   - `g d` → Dashboard
   - `cmd+k` → command palette
   - Use `react-hotkeys-hook`

9. **Staff management page** at `apps/web/app/(admin)/admin/staff/page.tsx`:
   - Per docs/08 §14.1
   - List of admins, edit role drawer, invite new admin, force password
     reset, revoke sessions

10. **Audit log page** at `apps/web/app/(admin)/admin/audit/page.tsx`:
    - Per docs/08 §14.2
    - DataTable rendering of `audit_log` entries
    - Filterable by actor, action, resource type, date range

11. **Real-time setup for dashboard**:
    - Pusher Channels client wired up per docs/10 §7
    - Dashboard tiles subscribe to `admin-dashboard-counters` channel
    - Worker job `apps/worker/src/jobs/publish-dashboard-counters.ts`
      runs every 5 seconds (per docs/12 §9) — stub it for now to
      publish dummy data; real data wires up after prompts 06, 08, 10

## Brand placeholder

If the user hasn't provided brand assets yet:
- Use placeholder "CoinFrenzy" wordmark in text
- Use `#FFD700` (gold) as primary, `#0A0A0F` as background per docs/10 §4.1
- Add a `apps/web/public/brand/README.md` note explaining where assets go

## Constraints

- Use shadcn/ui as the component base. Customize via Tailwind theme tokens.
- Every admin route is auth-gated. The middleware from `apps/web/middleware.ts`
  enforces this (you may need to extend it from prompt 01).
- Every admin action that mutates data must write to `audit_log` per
  `.cursorrules`. For this prompt, only the auth events (login, logout,
  2FA setup) write audit entries.
- The admin shell uses HMAC sessions per docs/09 §5.2 with all 5
  hardening upgrades.

## Verification

1. `pnpm typecheck` passes
2. `pnpm lint` passes
3. Manual test:
   - Visit `/admin` → redirected to `/admin/login`
   - Login as the master admin seeded in prompt 02
   - First-time 2FA setup flow appears → complete it with an authenticator app
   - Land on dashboard
   - All sidebar links work (show stub pages)
   - Command palette opens with Cmd+K
   - Logout, then verify cannot access `/admin` without re-auth

## When done

Report what was built. List:
- Admin pages created
- Components added to packages/ui
- Auth flow working end-to-end
- Dashboard tiles showing (with zeros for now)

Tell the user to login and verify the experience. They should message
Claude with: "Prompt 04 done — admin shell working, here's screenshot:
[optional screenshot]" + your report.
