# 19 · Glossary

Every acronym and internal term you'll see in the codebase, in
conversation, or in the docs. Keep this open in another tab while you
ramp.

---

## Currencies + money

| Term              | Meaning                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| **GC**            | Gold Coins. Play-only currency. The headline number on every package. Not redeemable.                  |
| **SC**            | Sweeps Coins. Redeemable currency. Awarded as a free bonus with GC packages or via AMOE.               |
| **USD**           | US Dollars. The settlement currency for purchases (Finix) and redemptions.                             |
| **Minor units**   | The integer representation of money in the app. `1 USD = 10_000n`, `1 SC = 10_000n`, `1 GC = 10_000n`. |
| **Major units**   | The human-readable value. `1.00 USD`. We never compute in major units.                                 |
| **Wallet**        | A `(player × currency)` row holding `current_balance` + four sub-buckets.                              |
| **Sub-bucket**    | One of `purchased`, `bonus`, `promo`, `earned` — the four columns that sum to `current_balance`.       |
| **Drain order**   | The order sub-buckets are consumed during play: promo → bonus → purchased → earned.                    |
| **Earned bucket** | The only redeemable sub-bucket. Holds SC won at games (or via AMOE).                                   |

---

## Sweepstakes + legal

| Term                          | Meaning                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Sweepstakes social casino** | The legal model: free GC play + free SC bonus + AMOE + redemption gated by KYC. Not a real-money casino.                                               |
| **AMOE**                      | Alternative Method of Entry. The "no purchase necessary" path that makes the sweepstakes model legal. We use EasyScam to receive postal/email entries. |
| **Purchase**                  | What we call buying a coin package. NEVER "deposit".                                                                                                   |
| **Redemption**                | What we call cashing out SC for USD. NEVER "withdrawal" or "cashout".                                                                                  |
| **Play**                      | What we call wagering. NEVER "wager" or "bet" in user-facing copy.                                                                                     |
| **Blocked state**             | A US state where SC play and/or redemption is not permitted. Enforced at signup, lobby, and redemption.                                                |
| **Lucky Labz LLC**            | The operating entity. Named in all legal copy.                                                                                                         |
| **Sweepstakes Rules**         | The legal document describing the sweepstakes mechanics; CMS-managed at `/sweepstakes-rules`.                                                          |

---

## KYC + compliance

| Term                   | Meaning                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **KYC**                | Know Your Customer. Identity verification, required for redemption.                                                              |
| **KYC tier**           | 0 (unverified), 1 (email+phone), 2 (full Footprint), 3 (enhanced/AML).                                                           |
| **AML**                | Anti-Money Laundering. Flag-based system that holds suspicious redemptions for review.                                           |
| **AML hold**           | A redemption blocked pending manager review. `/admin/cashier/aml-hold`.                                                          |
| **SAR**                | Suspicious Activity Report. The regulatory filing if AML escalates. Out of scope for v1 implementation but the data is captured. |
| **Compliance flag**    | A row in `compliance_flags` representing a flagged event (rapid purchase+redeem, structuring, etc.).                             |
| **RG**                 | Responsible Gaming. The player-protection tools (limits, self-exclusion, session reminders).                                     |
| **Self-exclusion**     | A player-elected hard block on all gameplay for a chosen period.                                                                 |
| **Cooling-off period** | The mandatory wait before a self-exclusion can end OR before a looser RG limit takes effect.                                     |
| **Stealth lock**       | An admin action that disables a player account without notifying them (used for fraud investigation).                            |
| **Wipe**               | A master-only action that fully removes a player's data per GDPR/privacy request.                                                |

---

## Roles + people

| Term             | Meaning                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Player**       | The consumer. Better Auth sessions.                                                                                       |
| **Admin**        | Anyone with an `admins` row. Nine role slugs.                                                                             |
| **Master**       | Top admin role. Can do everything including staff CRUD.                                                                   |
| **Manager**      | Senior admin. Most edits including suppression overrides, redemptions ≤ $50k.                                             |
| **Marketing**    | Admin role for content + promos + campaigns.                                                                              |
| **Cashier**      | Admin role for redemption review. Approves up to $1k.                                                                     |
| **Cashier lead** | Cashier with $10k approval ceiling.                                                                                       |
| **Support**      | Read-only admin. Customer service surface.                                                                                |
| **KYC reviewer** | Admin role for Footprint / identity work.                                                                                 |
| **Game ops**     | Admin role for provider + game catalog work.                                                                              |
| **Host**         | Contractor admin role. Manages a small book of assigned VIPs in a dedicated portal. Rank 5 (intentionally below support). |
| **VIP**          | A player whose lifetime spend has crossed the qualification threshold ($1,000 default). Can be assigned to a host.        |
| **High roller**  | A higher VIP tier (the `high_roller` value of `players.vip_status`).                                                      |

---

## Money + ledger machinery

| Term                    | Meaning                                                                                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ledger entry**        | One row in `ledger_entries`. Immutable. Carries `(source, source_id, leg, account_kind, account_id, amount, currency, sub_bucket)`.                                                                                   |
| **Leg**                 | `credit` or `debit`. Every transaction has at least two legs that sum to zero per currency.                                                                                                                           |
| **Source**              | The category of the movement: `purchase`, `bet`, `win`, `bonus_award`, `playthrough_release`, `redemption_request`, `redemption_paid`, `redemption_rejected`, `purchase_refund`, `manual_adjust`, `affiliate_payout`. |
| **House account**       | The counterparty to every player wallet movement. One per `(kind × currency)`: `revenue_purchases`, `payout_redemptions`, `bonus_pool`, `play_pool`, `affiliate_pool`, `adjustments`.                                 |
| **Manual adjust**       | An admin-initiated balance correction. Role-gated by `APPROVAL_THRESHOLDS`, audited, ledger-recorded.                                                                                                                 |
| **Playthrough**         | The wagering requirement attached to a bonus. SC starts in the `bonus` bucket; once playthrough is met, it moves to `earned` (and becomes redeemable).                                                                |
| **Playthrough release** | The ledger entry that moves SC from `bonus` to `earned`.                                                                                                                                                              |
| **Reconciliation**      | The nightly job that asserts `wallet.current_balance = SUM(player ledger legs)` per currency. Drift writes a compliance flag.                                                                                         |
| **Idempotency key**     | `(source, source_id)`. Re-applying the same transaction is a no-op.                                                                                                                                                   |

---

## Bonuses + promos

| Term                    | Meaning                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Bonus template**      | A reusable definition in `bonuses`. Categories: `purchase`, `player_gift`, `promo_code_signup`, `promo_code_free`. |
| **Bonus award**         | An instance of a bonus granted to a player; lives in `bonuses_awarded`.                                            |
| **Pending claim**       | A manually awarded bonus waiting for the player to click "Claim".                                                  |
| **Daily bonus drip**    | A daily-login bonus mechanic.                                                                                      |
| **Lightning-bolt code** | A promo code that grants a small SC/GC instantly (UX nickname).                                                    |
| **Welcome package**     | A first-purchase-only coin package, enforced server-side via `firstPurchaseOnly` flag.                             |
| **Featured slot**       | The single highlighted coin package in the shop. Enforced by a partial unique index.                               |

---

## CRM

| Term                      | Meaning                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Segment**               | A saved set of players matching a filter tree.                                                          |
| **Filter tree**           | The JSONB-serialised AND/OR boolean tree used to define a segment.                                      |
| **Attribute**             | A queryable property of a player (lifetime SC won, days since signup, current tier, …). 90+ registered. |
| **Campaign**              | A one-time or scheduled send to a segment.                                                              |
| **Flow**                  | A multi-step automation triggered by an event (welcome series, dormant winback).                        |
| **Enrollment**            | A player's current position inside a flow.                                                              |
| **Recipe**                | A pre-built flow template available in the library.                                                     |
| **Suppression list**      | The opt-out / hard-bounce list. Compliance-hard.                                                        |
| **Test send to me**       | A "send this template to my own admin account" button on every template editor.                         |
| **A/B winner**            | The variant that statistically beat the others; sent to the remaining audience after the decider runs.  |
| **Conversion event**      | The event used to attribute a campaign/flow win (default: `player.purchase.completed`).                 |
| **Message log**           | `crm_message_log` — partitioned table with one row per dispatched message.                              |
| **Variable substitution** | Handlebars-style replacement in templates: `{{firstName}}`, `{{balance.sc}}`.                           |

---

## Casino + games

| Term             | Meaning                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| **Alea**         | Our game aggregator. ~20 studios under one iframe + webhook contract.                                 |
| **Aggregator**   | A vendor that aggregates multiple game providers. Alea is one.                                        |
| **Provider**     | A game studio.                                                                                        |
| **Sub-category** | An operator-defined section of the lobby (e.g. "Hot now", "New from Pragmatic").                      |
| **Lobby layout** | The DB-backed ordering of sections + games shown to players. Edited at `/admin/casino/lobby`.         |
| **RTP**          | Return to Player. The expected payout percentage of a game.                                           |
| **GGR**          | Gross Gaming Revenue. Bets minus wins, before bonuses.                                                |
| **NGR**          | Net Gaming Revenue. GGR minus bonus cost.                                                             |
| **Hold**         | Same idea as GGR; sometimes expressed as a percentage.                                                |
| **Big win**      | A win above a configured threshold; triggers the BigWinReveal overlay and a `live-wins` ticker entry. |

---

## Operations

| Term                  | Meaning                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Integrity page**    | `/admin/integrity` — vendor health + reconciliation + mock-mode badges.                                            |
| **Mock mode**         | The state of an adapter when `USE_MOCK_<VENDOR>=true`. Local fixtures instead of a real vendor.                    |
| **Doppler**           | Our secret manager. Source of truth; mirrors to Vercel + Fly + GitHub Actions.                                     |
| **Inngest**           | Our queue + cron engine. Web emits events; worker consumes.                                                        |
| **PagerDuty**         | On-call alerting. Sev-1/sev-2 pages on-call immediately.                                                           |
| **Sev 1 / 2 / 3 / 4** | Incident severity. See `runbooks/incident-response.md`.                                                            |
| **Snapshot**          | A row in `daily_operational_snapshots` — pre-aggregated metrics for dashboards.                                    |
| **Layer 3**           | The aggregation layer in the dashboard architecture; `daily_operational_snapshots` is "Layer 3" per docs/12 §3-§4. |
| **Cutover**           | The Gamma → CoinFrenzy migration moment. Runbook: `runbooks/cutover_night.md`.                                     |

---

## Auth + sessions

| Term                  | Meaning                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| **Better Auth**       | Our player auth library. Cookie-based sessions.                                                       |
| **HMAC session**      | The admin cookie scheme. `<base64url(payload)>.<base64url(hmac-sha256(payload))>` with IP+UA binding. |
| **Session id**        | The UUID inside the admin HMAC payload that lets us revoke.                                           |
| **TOTP**              | Time-based One-Time Password. RFC 6238. Our admin 2FA.                                                |
| **Backup code**       | One-time 2FA recovery code. Generated 10 per admin at enrolment.                                      |
| **Pending 2FA token** | Short-lived token issued between password verify and TOTP submit.                                     |
| **Forced reset**      | The `must_reset_password = true` flag on a newly-created admin.                                       |
| **5-layer defense**   | The host portal's overlapping access controls: middleware, layout, page, API, RLS.                    |

---

## Database

| Term                  | Meaning                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| **Drizzle**           | Our ORM. SQL-first, type-safe, no Prisma.                                                         |
| **Neon**              | Our Postgres host. Serverless branching.                                                          |
| **RLS**               | Row Level Security. Postgres-native policies that gate rows by `app.actor_*` settings.            |
| **Partition**         | A monthly range partition on `ledger_entries`, `player_events`, `game_rounds`, `crm_message_log`. |
| **`_app_migrations`** | The table our migration runner uses to track applied migrations.                                  |
| **Soft delete**       | `status = 'archived'` or `deleted_at = now()` instead of `DELETE`.                                |
| **Append-only**       | A table where `UPDATE`/`DELETE` are rejected by trigger (`audit_log`, `ledger_entries`).          |

---

## Other

| Term                           | Meaning                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **Gamma**                      | The legacy operator we're migrating from.                                                                |
| **Migration pipeline**         | The pipeline for importing Gamma data into CoinFrenzy (`apps/worker/src/jobs/gamma-import.ts`, docs/13). |
| **Cutover night**              | The night we flip DNS from Gamma to CoinFrenzy. Detailed in `runbooks/cutover_night.md`.                 |
| **DAU**                        | Daily Active Users.                                                                                      |
| **LTV**                        | Lifetime Value (USD per player).                                                                         |
| **Founder**                    | The product owner / project manager. He's not the engineer.                                              |
| **Composer / Cursor / Claude** | The engineers (AI) that wrote this codebase. The handoff goes to humans.                                 |

---

## What to read next

- `01-project-overview.md` — these terms in context.
- `04-database.md` — table names + relationships.
- `08-crm-system.md` — CRM terminology in practice.
