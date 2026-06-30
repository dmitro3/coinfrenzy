# Prompt 05 — Build the Player Shell

Copy this entire file into Cursor's chat and hit enter. Prompts 01-04
must be complete.

---

Continuing the CoinFrenzy build. Read these documents:
- `docs/10_frontend_architecture.md` §4 (player surface, including all
  player pages §4.2)
- `docs/09_security_compliance_audit.md` §5.1 (player sessions via
  Better Auth)
- `docs/06_bonus_engine_playthrough.md` §14 (redeemable balance display)

Re-read `.cursorrules`.

## Your task

Build the player-facing surface: signup, login, lobby (placeholder game
grid), account pages, navigation. No game integration yet (that's prompt 06).
No purchase flow yet (also prompt 06). No real bonus engine (prompt 07).

This prompt makes the player site visually exist and authenticatable.

## Specific requirements

1. **Player auth via Better Auth** per docs/09 §5.1:
   - Install and configure Better Auth in `apps/web/app/api/auth/[...all]/route.ts`
   - Email/password signup with email verification
   - Magic link login as alternative
   - Optional TOTP 2FA
   - Session cookie (14-day, HTTP-only, secure)
   - The middleware (from prompt 01) auth-gates `/account`, `/cashier`,
     `/bonuses`, `/games/[id]`

2. **Auth pages**:
   - `apps/web/app/(auth)/signup/page.tsx` — signup form with state
     picker. If state is in blocked list, allow signup but show banner
     "Your state allows only Gold Coin play, not Sweepstakes Coins"
   - `apps/web/app/(auth)/login/page.tsx`
   - `apps/web/app/(auth)/verify-email/page.tsx`
   - `apps/web/app/(auth)/reset-password/page.tsx`
   - `apps/web/app/(auth)/mfa/page.tsx`

3. **Signup flow specifics**:
   - On successful signup:
     - Create a `players` row
     - Create empty `wallets` row for GC and SC
     - Award the welcome bonus per docs/06 (stub for now — call
       `bonusEngine.award` which will be implemented in prompt 07, but
       the call site should exist)
     - Send verification email via SendGrid
     - Trigger Footprint KYC flow as next step (but don't make this
       blocking for signup — they can play GC immediately)
     - Emit `player.signup` CRM event (will be a no-op for now until
       prompt 09 wires up the event consumer)

4. **Player layout shell** at `apps/web/app/(player)/layout.tsx`:
   - Top: balance bar (sticky) per docs/10 §4.2 — shows GC and SC balance
     with toggle, quick buy CTA
   - Sidebar: collapsible navigation
   - Footer: legal + compliance + support widget
   - Notification bell in top right

5. **The pages** (placeholder for now, real content fills in via later prompts):
   - `app/(player)/page.tsx` — lobby with game grid placeholder ("Coming soon")
   - `app/(player)/games/page.tsx` — full game lobby placeholder
   - `app/(player)/games/[gameId]/page.tsx` — game launch placeholder
   - `app/(player)/cashier/buy/page.tsx` — buy flow placeholder
   - `app/(player)/cashier/redeem/page.tsx` — redeem flow placeholder
   - `app/(player)/account/page.tsx` — account home with the
     sub-bucket breakdown, lifetime stats (real, queried from DB)
   - `app/(player)/account/history/page.tsx` — purchase/redemption/bonus
     history tabs using DataTable
   - `app/(player)/account/kyc/page.tsx` — KYC status display + start-KYC
     button (Footprint integration in prompt 08)
   - `app/(player)/account/responsible-gaming/page.tsx` — RG controls
     per docs/09 §7 (deposit limits, session limits, self-exclusion)
   - `app/(player)/account/settings/page.tsx` — profile edit
   - `app/(player)/account/sessions/page.tsx` — active sessions list with revoke
   - `app/(player)/bonuses/page.tsx` — bonus list per docs/10 §4.2
     (will populate after prompt 07)
   - `app/(player)/promotions/page.tsx`
   - `app/(player)/vip/page.tsx` — tier progress
   - `app/(player)/support/page.tsx` — Intercom widget embed

6. **Marketing pages**:
   - `app/(marketing)/page.tsx` — home with hero, value props, "Sign up to play"
   - `app/(marketing)/about/page.tsx`
   - `app/(marketing)/faq/page.tsx`
   - `app/(marketing)/legal/terms/page.tsx` (placeholder content)
   - `app/(marketing)/legal/privacy/page.tsx` (placeholder)
   - `app/(marketing)/legal/sweepstakes-rules/page.tsx` (placeholder —
     user will provide real text from their legal team)
   - `app/(marketing)/amoe/page.tsx` — instructions for free mail-in
     entry method (real content from operations team later)

7. **Responsible Gaming controls** per docs/09 §7:
   - Self-exclusion flow with duration picker (1d/7d/30d/1y/permanent)
   - Deposit limit setter (daily/weekly/monthly)
   - Session limit setter
   - All controls write to `players` table + `compliance_flags` table
   - All changes audit_logged
   - Increasing a deposit limit takes 24h to take effect (delay
     mechanism: store pending limit changes in a queue, apply after 24h)

8. **Real-time wiring** for player:
   - Subscribe to `private-player-{playerId}` channel on Pusher
   - Listen for `balance-update`, `bonus-awarded`, `kyc-update`,
     `redemption-update` events
   - Update React Query cache on receipt

9. **Geo gating**:
   - At signup, capture user's state (form input + Radar IP geocode for
     verification)
   - If state is in blocked list, set a flag on the player record so SC
     play is disabled (but GC play is allowed)
   - Stub the Radar IP geocode call for now — real integration in prompt
     06 (it's part of the webhooks/adapter prompt)

10. **Brand placeholder** continued from prompt 04:
    - Use the same gold-on-dark theme
    - Replace placeholder logo with real one when user provides

## Constraints

- Better Auth uses its own session table; do NOT integrate it with the
  admin HMAC sessions. They're separate trust zones per docs/09 §2.
- All player-mutating endpoints call `withActor(playerId, 'player', ...)`
  per `.cursorrules`.
- Marketing pages are public — no auth gate, no actor context.
- Mobile responsive: every player page works on iPhone Safari, Android
  Chrome. Test in browser dev tools.

## Verification

1. `pnpm typecheck` passes
2. `pnpm lint` passes
3. Manual test:
   - Visit `/` (marketing home) — works without auth
   - Visit `/account` while logged out — redirected to `/login`
   - Sign up a test player → email verification arrives → click link → land in lobby
   - View balance bar (shows 0 SC, 0 GC since no purchases yet)
   - Visit each account page — they load without crashes
   - Try setting a daily deposit limit — confirm it saves
   - Try self-excluding for 1 day → log out → try to log back in → blocked
   - Log out, sign up a new player with a blocked state (e.g. NY) →
     verify the "Gold Coin only" banner appears

## When done

Report what was built. The user should be able to:
- Visit marketing home
- Sign up
- Log in
- See empty account pages
- Set RG controls

Tell the user to message Claude with the report after they've manually
verified by signing up a test account.
