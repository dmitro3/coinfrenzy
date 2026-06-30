# Architecture Docs — Index & Lookup

This is the canonical list of architecture documents for the CoinFrenzy
casino platform. Use the lookup tables below to find the right doc for
your current task.

---

## All 13 docs

| # | Filename | What it covers | Lines |
| --- | --- | --- | --- |
| 01 | architecture_overview | System map, stack lock, integration map, performance budgets | 482 |
| 02 | core_service_layer | Monorepo layout, Context object, Result type, adapter pattern, the "all logic in packages/core" rule | 647 |
| 03 | data_model | Complete Drizzle/SQL schema, RLS policies, indexes, partitioning, size projections | 888 |
| 04 | ledger_and_wallet | The 4 laws of the ledger, 12 transaction types, write path, idempotency, reconciliation | 959 |
| 05 | webhooks | Receiver pattern, Finix events, Footprint via Svix, Alea, Radar, SendGrid/Twilio | 1399 |
| 06 | bonus_engine_playthrough | The 14 bonus types, variable playthrough, EasyScam AMOE, drain order, anti-abuse | 978 |
| 07 | redemption_and_kyc | Redemption state machine, Footprint onboarding, Finix ACH push, APT Debit, AML hold, 1099-MISC | 1244 |
| 08 | admin_panel | Page-by-page admin spec, 21 sections, dashboard tiles, cashier queue, integrity page | 838 |
| 09 | security_compliance_audit | Threat model, trust zones, role matrix, RLS patterns, session model, audit log, RG, jurisdictions, secrets | 764 |
| 10 | frontend_architecture | Three frontends in one app, routing, components, state, real-time, performance, testing | 770 |
| 11 | crm | Event taxonomy, segment compiler, campaign engine, flow state machine, compliance moat | 738 |
| 12 | reporting_dashboards_exports | 3-layer aggregation, daily snapshots, custom queries, exports, scheduled reports | 775 |
| 13 | migration_from_gamma | Cutover runbook, daily snapshots, dual-webhook capture, contingency planning | 792 |

---

## Lookup by task

### "I need to build the database"
→ docs/03_data_model.md (start here for schema)
→ docs/04_ledger_and_wallet.md (for ledger-specific tables)
→ docs/09_security_compliance_audit.md §4 (for RLS policies)

### "I need to write a webhook handler"
→ docs/05_webhooks.md (receiver pattern, provider-specific event handlers)
→ docs/04_ledger_and_wallet.md (ledger calls invoked by webhook handlers)

### "I need to build an admin page"
→ docs/08_admin_panel.md (page-by-page specs)
→ docs/10_frontend_architecture.md (component patterns)
→ docs/09_security_compliance_audit.md §3 (role permissions)

### "I need to build a player page"
→ docs/10_frontend_architecture.md §4 (player surface specs)

### "I need to write business logic"
→ docs/02_core_service_layer.md (Context, Result, adapter patterns)
→ The relevant domain doc (04, 06, 07, 11 depending on what)

### "I need to add a new database column or table"
→ docs/03_data_model.md (must be updated first, then migrations follow)

### "I need to set up auth"
→ docs/09_security_compliance_audit.md §5 (sessions, 2FA, HMAC pattern)

### "I need to deploy"
→ runbooks/deploy.md
→ docs/10_frontend_architecture.md §12

### "Something is broken in production"
→ runbooks/incident_response.md
→ docs/09_security_compliance_audit.md §11 (incident classification)

### "I need to handle Gamma data"
→ docs/13_migration_from_gamma.md

### "I need to set up the CRM"
→ docs/11_crm.md

### "I need to build a report or dashboard"
→ docs/12_reporting_dashboards_exports.md

### "I need to integrate a third-party API"
→ docs/02_core_service_layer.md §7 (adapter pattern)
→ docs/05_webhooks.md (if it has webhooks)

---

## Lookup by domain object

| Object | Primary doc | Schema location |
| --- | --- | --- |
| Player | docs/03 §2 | `players` table |
| Wallet | docs/03 §2, docs/04 | `wallets` table |
| Ledger entry | docs/04 | `ledger_entries` table (partitioned) |
| House account | docs/04 §2 | `house_accounts` table |
| Purchase | docs/05 §3 (Finix flow) | `purchases` table |
| Redemption | docs/07 | `redemptions` table |
| Bonus template | docs/06 §2 | `bonuses` table |
| Bonus award | docs/06 §4 | `bonuses_awarded` table |
| Game session | docs/05 §5.2 | `game_sessions` table |
| Game round | docs/05 §5.5 | `game_rounds` table (partitioned) |
| KYC record | docs/07 §6 | `kyc_status` table |
| Compliance flag | docs/09 §7 | `compliance_flags` table |
| Audit entry | docs/09 §6 | `audit_log` table |
| Admin user | docs/09 §3 | `admins` table |
| CRM segment | docs/11 §3 | `crm_segments` table |
| Campaign | docs/11 §4 | `crm_campaigns` table |
| Flow | docs/11 §5 | `crm_flows`, `crm_flow_steps`, `crm_flow_enrollments` |
| Player event | docs/11 §1 | `player_events` table (partitioned) |
| Daily snapshot | docs/12 §3 | `daily_operational_snapshots` table |
| Webhook event | docs/05 §2.1 | `pending_webhooks` table |

---

## Cross-cutting concerns

These topics span multiple docs. Use this index when you're unsure where something lives.

| Concern | Where |
| --- | --- |
| Idempotency | docs/04 §5, docs/05 §2 |
| Real-time updates | docs/10 §7 (Pusher Channels), docs/12 §9 |
| Background jobs | docs/02 §8 (Inngest), each domain doc has specific jobs |
| Secrets | docs/09 §9 (Doppler config) |
| Rate limits | docs/09 §10.5 |
| Performance budgets | docs/01 §8, docs/04 §8, docs/11 §9, docs/12 §11 |
| Migrations from Gamma | docs/13 (whole doc) |
| Testing strategy | docs/04 §10 (ledger), docs/10 §11 (general) |
| Deployment | docs/10 §12 |
| Health monitoring | docs/05 §8, docs/08 §13 (Integrity page) |
| Tax reporting | docs/07 §10 |
| AMOE (free SC entry) | docs/06 §11 (EasyScam adapter) |
| Jurisdiction blocking | docs/09 §8 |
| Responsible gaming | docs/09 §7 |

---

## What to do when in doubt

1. Read the doc that the lookup table points to
2. Search for keywords across all docs: `grep -r "your_topic" docs/`
3. Read the architecture overview (docs/01) — it has a "what's covered where" section
4. Ask the user — they have access to Claude, who wrote these docs and remembers context

Never improvise architecture. Always ground in a doc.
