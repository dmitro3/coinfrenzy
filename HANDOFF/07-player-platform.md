# 07 · Player Platform

The player-facing site. Built in milestone M5 to match the established
coinfrenzy.com aesthetic. Mobile-first, premium-feel, dark + gold.

---

## Where the code lives

```
apps/web/app/(player)/
├── _shell.tsx          Sidebar + topbar + balance pill
├── _providers.tsx      TanStack Query + ShopModalContext + RewardsContext
├── _realtime.tsx       Pusher subscription wiring (balance, big wins)
├── _terms-banner.tsx   "Updated terms" banner (drives the terms
│                       acceptance modal)
├── layout.tsx          Root for the player route group
├── error.tsx           Player-specific error boundary
├── loading.tsx         Player-specific suspense fallback
├── account/            Profile, KYC, RG, transactions, settings
├── bonuses/            Active + pending + history
├── cashier/            Shop + redeem flows
├── casino-games/       Category landing (e.g. /casino-games/slots)
├── favorites/          Favorited games
├── games/              [slug] game launch (Alea iframe)
├── live-support/       Live chat (Intercom hook)
├── lobby/              The main lobby (hero, grid, ticker)
├── promotions/         Active offers + AMOE
├── recent-games/       Recently played
├── referrals/          Referral program
├── shop/               Shop redirect (mostly into lobby modal)
├── support/            FAQ / contact / open ticket
└── vip/                VIP perks + tier ladder
```

Marketing + legal pages live in a separate route group:
`app/(marketing)/` — `/`, `/about`, `/contact`, `/faq`, `/amoe`,
`/terms`, `/privacy`, `/sweepstakes-rules`, `/responsible-gaming`, and
generic `/p/[slug]` (CMS pages).

Auth pages live in `app/(auth)/`: `/login`, `/signup`, `/mfa`,
`/reset-password`, `/verify-email`.

---

## Visual identity

- **Logo**: gold script "Coin Frenzy" — see
  `packages/ui/src/player/CoinFrenzyLogo.tsx`.
- **Mascot**: a fox — `packages/ui/src/player/FoxIllustration.tsx`.
- **Brand tokens** (live in `packages/ui/src/styles/`):
  - `--cf-red-*` — red ramp (background gradient anchor).
  - `--cf-gold-*` — gold ramp (CTAs, accents).
  - Custom gradients for the gold script + hero treatments.
- **Fonts**:
  - Display: **Cinzel** (with Thunder Demo as a fallback).
  - Body: **Montserrat**.
- **Motion**: framer-motion for UI delight (big-win reveals, ticker,
  popovers). Helpers in `packages/ui/src/player/motion-primitives.ts`
  and `celebrations.ts`.

---

## Surface inventory

### Marketing landing (`/`)

Public, fast, conversion-focused. Shows the "Get free coins" CTA, brand
story, top games carousel, AMOE explainer, FAQ. Auth-aware: if a
session cookie is present, the lobby is a click away.

### Signup + login

Modal-first design via `packages/ui/src/player/AuthModal.tsx`. Includes
the fox illustration. Can also be visited at `/signup` and `/login`
directly. Validates 18+, US state, email, password complexity.

### Lobby (`/lobby`)

The hub. Three slabs:

1. **Hero / TopOfferStrip** — current offer + countdown.
2. **Category tabs + grid** — `CategoryTabs.tsx`, `GameGrid.tsx`,
   `GameTile.tsx`. Tiles show GC/SC indicator, RTP, and launch on
   click.
3. **LiveWinsTicker** — anonymised live wins streamed via Pusher
   `live-wins` channel. Animated ticker (`TickerNumber.tsx`).

Lobby rails (sections + per-section game ordering) are read from the
DB when `USE_DB_LOBBY_LAYOUT=true` (default), backed by
`casino_sub_categories` + `casino_sub_category_games`. Operators edit
the layout in admin (`/admin/casino/lobby`).

Players see the lobby through the player shell (sidebar with category
nav + balance pill + shop button).

### Game launch (`/games/[slug]`)

Server-side fetches the game + session-creates against Alea, then
renders an iframe to Alea's player URL. We cannot animate or instrument
inside the iframe; the launch chrome (close button, fullscreen, big-win
overlay that fires on the win webhook) is ours.

### Cashier (`/cashier`)

Two tabs:

1. **Shop** — coin package picker. Featured slot at the top (single
   highlighted package). Welcome packages auto-filter pre-first-
   purchase players. Clicking a package opens `ShopModalRoot.tsx` which
   walks through Finix Hosted Fields (or the mock-vendor flow).
2. **Redeem** — SC redemption start. Shows the redeemable balance
   (`balance_earned` only). Player picks ACH / debit / paper check;
   amount; KYC gate fires if `kyc_level < 2`; eligibility checks
   (blocked state, playthrough complete) run server-side.

The redemption form posts to `/api/player/redemptions` which calls
`core.redemption.create(ctx, input)`. The resulting redemption shows
in the player's account page until the cashier acts on it.

### Bonuses (`/bonuses`)

Three tabs: `Active`, `Pending`, `History`.

- Active = bonus templates the player is currently eligible to claim
  or that are working off playthrough.
- Pending = manual awards waiting for the player to claim.
- History = past bonuses (granted, expired, forfeited).

### Promotions (`/promotions`)

Marketing surface for active offers. Same `banners` data that drives
the lobby hero, plus an AMOE explainer card.

### VIP (`/vip`)

Shows the player's current tier + the ladder. Tiers come from `tiers`.

### Account (`/account`)

Tabs:

- **Profile** — name, email, phone, password, 2FA (optional for
  players).
- **KYC** — current tier + verify flow (kicks into Footprint).
- **Responsible Gaming** — limits, self-exclusion.
- **Transactions** — purchases, redemptions, ledger.
- **Settings** — email/SMS consent, marketing preferences.

### Support / FAQ / Live Support

`/support` is the entry point with sections for `/faq`, `/contact`,
`/live-support`. `/live-support` currently uses an Intercom widget
script (gated by `INTERCOM_ACCESS_TOKEN`). If the env var is unset, the
page shows a static "Chat soon" placeholder.

### Recent / Favorites

`/recent-games` and `/favorites` — simple lists driven by the player's
`game_sessions` + a per-player favorites table.

### Referrals

`/referrals` — referral program landing. Generates a unique code per
player and tracks attribution via `attributed_promo_code` /
`attributed_affiliate_id` columns on `players`.

---

## Shared player components

`packages/ui/src/player/`:

| Component                                    | What                                                        |
| -------------------------------------------- | ----------------------------------------------------------- |
| `AuthModal.tsx`                              | Login / signup modal with fox.                              |
| `BalancePill.tsx`                            | The persistent top-bar balance widget with currency toggle. |
| `BigWinReveal.tsx`                           | Animated overlay fired by Pusher `big-win` events.          |
| `CategoryTabs.tsx`                           | Lobby category nav.                                         |
| `CfChromaKeyDef.tsx`                         | SVG filter for gold script logo.                            |
| `CfFormFields.tsx`                           | Branded form inputs.                                        |
| `CoinClickPop.tsx`                           | Micro-interaction on coin clicks.                           |
| `CoinFrenzyLogo.tsx`                         | The gold script logo.                                       |
| `CoinPackageCard.tsx`                        | Package tile in the shop.                                   |
| `EmptyState.tsx`                             | Empty-list placeholder.                                     |
| `ErrorChip.tsx`                              | Inline form error.                                          |
| `FoxIllustration.tsx`                        | The fox mascot.                                             |
| `GameGrid.tsx` + `GameTile.tsx`              | Lobby grid.                                                 |
| `GoldButton.tsx`                             | Primary CTA.                                                |
| `LiveWinsTicker.tsx`                         | The realtime ticker.                                        |
| `LobbyHero.tsx`                              | Hero slot.                                                  |
| `PlayerFooter.tsx`                           | Footer.                                                     |
| `PlayerSidebar.tsx`                          | Left nav.                                                   |
| `PlayerTopBar.tsx`                           | Top bar (logo + balance + shop).                            |
| `PromoBanner.tsx`                            | Inline promo banner.                                        |
| `RewardsContext.tsx` + `RewardsPopover.tsx`  | Tier rewards UI.                                            |
| `ShopButton.tsx`                             | Top-bar shop button.                                        |
| `ShopModalContext.tsx` + `ShopModalRoot.tsx` | Shop modal with Finix flow.                                 |
| `SpotlightSearch.tsx`                        | Game search overlay.                                        |
| `SuccessCelebration.tsx`                     | Confetti + sound on success.                                |
| `TickerNumber.tsx`                           | Animated counting number.                                   |
| `Toast.tsx`                                  | Lightweight toast.                                          |
| `TopOfferStrip.tsx`                          | Sticky top offer banner.                                    |

---

## Real-time

Subscriptions are set up in `_realtime.tsx`:

- `private-player-<uuid>` — balance updates, bonus claim
  notifications, big-win events targeting this player.
- `live-wins` — anonymised public wins (drives the ticker).

The Pusher client wraps a tiny abstraction that batches updates into
the relevant React contexts (`RewardsContext`, balance, ticker state).

---

## Performance notes

- The lobby is server-rendered with the game grid pre-fetched; client
  takeover for the ticker + balance pill.
- The Alea iframe is lazy-loaded only when the game tile is clicked
  (no prefetch).
- Big-win overlays are pre-mounted but hidden until a Pusher event
  arrives (zero perceived latency).
- The shop modal uses a deferred mount: opens with a placeholder, lazy-
  loads the Finix Hosted Fields script on first open.

Budget targets per `02-architecture.md` §Performance budgets — lobby
cold load < 800 ms p75.

---

## Mobile considerations

- All player components are designed mobile-first; the sidebar
  collapses into a top drawer below `md`.
- The shop modal goes full-screen on mobile.
- The game iframe respects the device aspect ratio (Alea handles its
  own responsive layout inside the iframe).
- The big-win overlay scales by viewport.

There are still a couple of mobile-polish gaps; see `13-known-gaps.md`.

---

## Accessibility

- Color contrast meets AA on body text; CTAs are AAA on gold-on-dark.
- All interactive components have keyboard support via the shadcn
  primitives.
- Focus management on modals (Auth, Shop, ShopModal) uses Radix's
  focus trap.
- Audit pending — there are likely gaps. See `13-known-gaps.md`.

---

## Player API surface

Under `apps/web/app/api/player/`. 13 sub-areas:

| Sub-route        | What                                                 |
| ---------------- | ---------------------------------------------------- |
| `bonus/`         | Claim, list pending, list active.                    |
| `kyc/`           | Footprint flow start, status.                        |
| `notifications/` | List / mark-read.                                    |
| `packages/`      | List eligible packages (welcome-aware).              |
| `promo/`         | Redeem promo code.                                   |
| `purchase/`      | Start (Finix Hosted Fields intent), confirm, cancel. |
| `redemptions/`   | Create, list, cancel-pending.                        |
| `rg/`            | Update RG limits, request self-exclusion.            |
| `search-index/`  | Game search backend.                                 |
| `sessions/`      | Game launch session creation.                        |
| `signup/`        | Initial signup endpoint.                             |
| `terms/`         | Accept current terms version.                        |
| `wallets/`       | Get balance snapshot.                                |

Every handler requires a Better Auth session and calls into
`packages/core` for the actual work.

---

## What to read next

- `08-crm-system.md` — how marketing acts on the player surface.
- `11-integrations.md` — Alea, Finix, Footprint plumbing.
- `15-security-and-compliance.md` — RG, KYC, blocked-state gates.
