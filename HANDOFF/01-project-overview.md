# 01 · Project Overview

## What CoinFrenzy is

CoinFrenzy is a US-legal **sweepstakes social casino** owned and operated by
**Lucky Labz LLC**. Players sign up for free, buy "Gold Coin packages" for
entertainment-only play, and receive a free promotional currency
("Sweeps Coins") that — if won at games — can be redeemed for real cash.

This v2 codebase is a from-scratch rebuild that replaces the operator's
existing Gamma-hosted casino. The functional surface area mirrors what
Gamma offered, plus a much deeper admin, an in-house CRM, a VIP/Host
manager portal, and a full ledger system.

The brand consumers see is **Coin Frenzy** (gold script logo, fox
mascot, dark red/gold visual identity). The operator entity behind it
is Lucky Labz LLC.

---

## Why "sweepstakes" and not "casino"

Real-money online casino is illegal in almost every US state. The
sweepstakes model is a different legal animal:

1. Players can play forever **for free** using the play-only currency
   (Gold Coins).
2. The redeemable currency (Sweeps Coins) is awarded **as a free bonus**
   when a player buys a Gold Coin package — or via a no-purchase entry
   path (AMOE).
3. SC won at games can be redeemed for cash once the player has played
   them through the wagering requirement and passed KYC.

Because the redeemable currency is never sold and an AMOE always exists,
the model qualifies as a promotional sweepstakes in most US jurisdictions.
A few states (e.g. WA, ID, MI, NY for SC play) are still blocked at the
geo layer.

This is why **wording matters everywhere in this codebase**:

| Don't say             | Do say         |
| --------------------- | -------------- |
| deposit               | **purchase**   |
| withdraw / withdrawal | **redemption** |
| wager                 | **play**       |
| bet                   | **play**       |
| cashout               | **redemption** |

The CMS, email templates, and player UI all enforce this. If a copy
change uses the wrong word, the legal exposure is real.

---

## The two currencies

| Currency     | Symbol | What it does                                                                                                                | Redeemable?                                |
| ------------ | ------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Gold Coins   | **GC** | Play-only currency. The headline number on every coin package.                                                              | No.                                        |
| Sweeps Coins | **SC** | Bonus currency awarded with package purchases or via AMOE. Played at the same games as GC. Won SC can be redeemed for cash. | Yes, after KYC + playthrough is satisfied. |

Wallets are dual-currency. Every player has exactly one `GC` wallet row
and one `SC` wallet row. Each wallet decomposes into four sub-buckets
that fund-drain in a specific order on every play (see
`10-ledger-and-money.md` §"Drain Order"):

1. `purchased` — SC awarded with a paid GC package.
2. `bonus` — SC granted by ops (manual bonuses, promotional credits).
3. `promo` — SC redeemed via lightning-bolt promo codes.
4. `earned` — SC won at games (or via AMOE).

Only the `earned` sub-bucket is redeemable. The drain order ensures
non-redeemable buckets are spent first.

---

## Who the users are

The codebase has four distinct user populations, each with their own
surfaces and auth model:

| User type    | Auth                                         | Where they live                           | Examples                                        |
| ------------ | -------------------------------------------- | ----------------------------------------- | ----------------------------------------------- |
| **Players**  | Better Auth (cookies)                        | `apps/web/app/(player)`                   | the public — sign up, play, redeem              |
| **Admins**   | HMAC sessions + TOTP 2FA                     | `apps/web/app/(admin)`                    | operations, marketing, cashier, manager, master |
| **Hosts**    | Admin auth, role=`host`                      | `apps/web/app/(admin)` (host-only subset) | contractors who manage VIP players 1:1          |
| **Cashiers** | Admin auth, role=`cashier` or `cashier_lead` | admin app                                 | review/approve redemptions, AML                 |

Inside the admin role family there are nine slugs with a clear hierarchy
of permissions: `host` (5), `support` (10), `kyc_reviewer` (20),
`cashier` (30), `cashier_lead` (40), `marketing` (50), `game_ops` (60),
`manager` (100), `master` (1000). See
`packages/core/src/auth/permissions.ts` for the full matrix; named
helpers like `canEditPackages`, `canManageBonuses`,
`canOverrideSuppression` etc. are the source of truth for what each
role can do.

---

## Brand positioning

- **Premium**, not flashy-cheap. Tailored to the established
  sweepstakes-social-casino aesthetic (Chumba/Stake.us tier visual
  polish, but with a distinct Coin Frenzy red/gold mark and fox
  mascot).
- **Mobile-first**. The lobby, cashier, and game launch flows are all
  designed for a phone before a desktop.
- The logo is the gold "Coin Frenzy" script you'll see in
  `packages/ui/src/player/CoinFrenzyLogo.tsx`. The fox illustration is
  the mascot (`FoxIllustration.tsx`). Cinzel (with Thunder Demo as a
  fallback) is the display font; Montserrat is the body font.
- Player surface visual tokens live in
  `packages/ui/src/styles/` (`--cf-red-*`, `--cf-gold-*`, gradients).
  The admin uses a separate Linear/Stripe-inspired dark theme defined
  in `apps/web/app/globals.css` and the admin layout.

---

## Operator + legal entity

- **Lucky Labz LLC** — the operating entity. All player-facing legal
  copy (Terms, Privacy, Sweepstakes Rules, RG, Bonus Terms) names
  Lucky Labz as operator. Versioned terms live in the `terms_versions`
  table and surface in the CMS.
- **Blocked US states**: tracked in `packages/core/src/compliance` —
  `BLOCKED_STATES` and `isBlockedState()` are imported at the player
  layer and re-checked at the cashier layer for SC redemption.

---

## What makes this codebase different from the Gamma platform

1. **Full ledger.** Every coin movement is an immutable double-entry
   row. Gamma's accounting was a black box; here every dollar of GGR /
   bonus / payout can be traced.
2. **Built-in CRM.** No Customer.io / Klaviyo dependency. Segment
   builder, campaign engine, flow designer, A/B testing, suppression
   list — all in-house, in `packages/core/src/crm`. See
   `08-crm-system.md`.
3. **Host portal.** A dedicated contractor portal so VIP managers can
   communicate with their assigned players and award bonuses within
   weekly caps — without ever seeing the rest of the admin. See
   `09-vip-host-system.md`.
4. **Real RLS + audit.** Postgres Row Level Security is enabled on every
   sensitive table, and every admin action writes to an immutable
   `audit_log`. See `15-security-and-compliance.md`.
5. **Mock-first vendor adapters.** Every external vendor (Alea, Finix,
   Footprint, Radar, SendGrid, Twilio, EasyScam, R2) has a fully
   functioning local mock. A fresh checkout runs end-to-end without a
   single real-vendor credential. Flip one `USE_MOCK_*` flag per vendor
   when you wire the real one in.

---

## What "done" means for v1 launch

The build sequence (prompts 01 → 12) implements every doc-spec'd
feature. The admin back-office hardening pass on 2026-05-18/19 closed
out the polish round. Still pending for v1 launch:

- Vendor credentials in Doppler (we have sandbox/test for all; live
  for some).
- Domain + DNS cutover from Gamma's host to Vercel + custom domain.
- Real-mode flip for `USE_MOCK_FINIX` and `USE_MOCK_ALEA` once
  contracts are signed.
- Migration of existing Gamma players (see `docs/13_migration_from_gamma.md`
  and `prompts/11_migration_pipeline.md`).
- 1099-MISC vendor selection (Track1099 vs TaxBandits) — UI is built,
  PDF generation is stubbed.

Full list of pending work: `13-known-gaps.md`.

---

## What to read next

- `02-architecture.md` — the technical shape of all this.
- `19-glossary.md` — every acronym you'll see in code and conversation.
