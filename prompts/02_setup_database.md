# Prompt 02 — Set Up the Database

Copy this entire file into Cursor's chat and hit enter. The user must
have already completed Prompt 01.

---

You are continuing the CoinFrenzy build. Read these documents in full
before starting:
- `docs/03_data_model.md` (the complete schema spec)
- `docs/04_ledger_and_wallet.md` §3 (the house_accounts table, immutability triggers)
- `docs/09_security_compliance_audit.md` §4 (RLS policies)

Also re-read `.cursorrules` if you haven't since starting Prompt 01.

## Your task

Implement the complete database schema in `packages/db` using Drizzle
ORM, then generate and run the initial migration against the user's Neon
Postgres database.

## Before you write code

Ask the user for their Neon connection string. They got this when they
signed up for Neon. The format looks like:
```
postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
```

The user should paste it into Doppler (their secrets manager) as
`DATABASE_URL`. For local dev you'll also need it in a local `.env`
file at the repo root (which `.gitignore` excludes).

## Specific requirements

1. **Implement every table from docs/03** as Drizzle schema files:
   - One file per logical group in `packages/db/src/schema/` (e.g.
     `players.ts`, `wallets.ts`, `ledger.ts`, `bonuses.ts`, etc.)
   - All enums per docs/03 (player_status, bonus_type, redemption_status, etc.)
   - All indexes per docs/03 (every FK indexed, every WHERE-clause column
     indexed, compound indexes where specified)
   - All foreign keys with proper `onDelete` per docs/03 conventions
   - Soft-delete columns (`deleted_at`) on tables that need them

2. **Implement the ledger immutability triggers** per docs/04 §4:
   - The `ledger_entries_update_guard` trigger function
   - The DELETE rule that prevents deletion
   - Apply via a raw SQL migration

3. **Implement RLS policies** per docs/09 §4:
   - Enable RLS on every table
   - Default deny-all policy
   - Open specific paths per the patterns in §4.2-§4.4
   - The `app.actor_id` / `app.actor_kind` setting mechanism

4. **Partitioning** per docs/03 conventions:
   - `ledger_entries` partitioned by month
   - `game_rounds` partitioned by month
   - `player_events` partitioned by month
   - Create the first 3 months of partitions explicitly
   - Create a Drizzle helper function (called from prompt 11's worker
     job) that creates future month partitions

5. **Seed data**:
   - The 11 `house_accounts` rows per docs/04 §2
   - One default admin role per docs/09 §3 (the "master" role)
   - A bootstrap master admin user (the user will provide their email +
     a temporary password they want — ASK for these before running the
     seed)
   - The `migration_column_mappings` seed rows per docs/13 §3.2

6. **The Drizzle client** at `packages/db/src/client.ts`:
   - Reads `DATABASE_URL` from env
   - Uses `drizzle-orm/postgres-js` with a connection pool
   - Exports `db` (the Drizzle client)
   - Exports a `withActor(actorId, actorKind, fn)` helper that wraps any
     callback in a transaction that sets `app.actor_id` and `app.actor_kind`
     per docs/09 §4.1

7. **Migration runner**:
   - `pnpm db:generate` runs `drizzle-kit generate` to produce SQL
   - `pnpm db:migrate` runs the generated migrations against the DATABASE_URL
   - `pnpm db:studio` opens Drizzle Studio for visual inspection

## Constraints

- Tables must match docs/03 exactly. If you find something ambiguous in
  the docs, ASK before deciding.
- DO NOT add tables not in docs/03 (admin_dashboard_layouts, etc. from
  docs/08 §15 ARE in docs/03 too — verify before adding).
- DO NOT modify the ledger immutability triggers — they're load-bearing
  for compliance.
- Use `numeric(20,4)` for all money columns. NEVER float.
- Use `bigint` in TypeScript types for money columns (Drizzle supports
  this via mode mapping).

## Verification steps

After running migrations:
1. `pnpm db:migrate` runs without errors
2. Open Drizzle Studio (`pnpm db:studio`) and visually confirm every
   table from docs/03 is present
3. Run a smoke test from the worker app: insert a row in `house_accounts`
   (should already be there from seed), then try to UPDATE it — should
   succeed for normal columns but DELETE should fail (the rule blocks it
   on ledger_entries, not house_accounts — confirm you understand which
   tables have which constraints)
4. Try to INSERT a row into `ledger_entries` directly via Drizzle Studio,
   then try to UPDATE the `amount` column on it — should fail with our
   immutability guard error

## When done

End with the standard "Done" report. Specifically include:
- A count of how many tables were created (should be ~40)
- A count of how many indexes were created
- A confirmation that the seed data inserted (11 house accounts, 1
  master admin, N migration column mappings)
- The output of `pnpm db:migrate` showing success

Tell the user to message Claude with the report. Claude will verify the
schema is correct before proceeding to prompt 03 (the ledger module).
