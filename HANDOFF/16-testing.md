# 16 · Testing

## Framework

- **Unit + properties**: [Vitest](https://vitest.dev) + [fast-check](https://fast-check.dev).
- **Integration**: [Testcontainers](https://testcontainers.com) (Postgres in Docker).
- **E2E**: [Playwright](https://playwright.dev) — **not yet wired**. See
  `13-known-gaps.md`.

---

## Current numbers (as of handoff)

- `packages/core`: **246 tests passing**.
- `packages/db`: `echo 'no tests yet' && exit 0` placeholder.
- `packages/ui`: no tests.
- `packages/config`: no tests.
- `apps/web`: no tests.
- `apps/worker`: no tests.

The ledger + CRM compiler are the heaviest covered areas; ~1,900
fast-check property cases per default suite run for the ledger alone.

---

## How to run

```bash
# All packages
pnpm test

# One package
pnpm -F @coinfrenzy/core test

# Subset (paths)
pnpm -F @coinfrenzy/core test:unit         # src/ledger/__tests__/unit
pnpm -F @coinfrenzy/core test:properties   # src/ledger/__tests__/properties.test.ts

# Skip Docker-bound integration tests
SKIP_INTEGRATION_TESTS=1 pnpm -F @coinfrenzy/core test

# Single file
pnpm -F @coinfrenzy/core exec vitest run src/ledger/__tests__/properties.test.ts

# Watch mode
pnpm -F @coinfrenzy/core exec vitest
```

CI runs `pnpm test` (which fans out via Turbo) on every PR via
`.github/workflows/ci.yml`.

---

## Integration tests (Docker required)

`packages/core/src/ledger/__tests__/setup.ts` boots a Postgres
container via Testcontainers and applies the migrations. Sets
`TEST_DATABASE_URL` automatically.

Requirements:

- Docker Desktop (or compatible) running locally.
- ~2 GB free RAM for the container.

Skip by setting `SKIP_INTEGRATION_TESTS=1`.

---

## Coverage areas

| Area                     | Suite                                     | Notes                                                   |
| ------------------------ | ----------------------------------------- | ------------------------------------------------------- |
| Ledger write idempotency | `src/ledger/__tests__/properties.test.ts` | `write(spec) === write(spec) === write(spec)`           |
| Ledger conservation      | `properties.test.ts`                      | `SUM(legs) = 0` per currency for any sequence           |
| Drain order              | `unit/drain-order.test.ts`                | deterministic across sub-buckets                        |
| Wallet integrity         | `properties.test.ts`                      | `current_balance = sum(sub-buckets) = SUM(player legs)` |
| Money primitives         | `unit/money.test.ts`                      | bigint ↔ numeric string roundtrip                       |
| House accounts           | `unit/house-accounts.test.ts`             | resolution + classification                             |
| Bonus engine             | `src/bonus/__tests__/*`                   | game weights, playthrough math, expiry                  |
| Bonus integration        | `src/bonus/__tests__/integration.test.ts` | end-to-end with DB                                      |
| Redemption eligibility   | `src/redemption/__tests__/*`              | blocked states, KYC tier, playthrough                   |
| Cashier rules            | `src/cashier/__tests__/*`                 | auto-approve / hold thresholds                          |
| CRM compiler             | `src/crm/__tests__/*`                     | attribute → SQL translation, no injection               |
| CRM A/B stats            | `src/crm/__tests__/*`                     | significance under varied populations                   |
| Variable preview         | `src/crm/__tests__/*`                     | template rendering against real players                 |
| VIP qualification        | `src/vip/__tests__/*`                     | threshold scoring                                       |
| Permissions              | `src/auth/__tests__/*`                    | rank ladder, named helpers                              |
| Webhook idempotency      | `src/webhooks/__tests__/*`                | mock-Finix flow end-to-end                              |
| Migration transforms     | `src/migration/__tests__/*`               | CSV parse + transform helpers                           |
| Adapters                 | `src/adapters/__tests__/*`                | adapter factory + signature verify                      |

---

## How to add a new test

1. Drop the file in
   `packages/<pkg>/src/<area>/__tests__/<name>.test.ts`.
2. Use Vitest globals (`describe`, `test`, `expect`) without imports.
3. For property tests, `import * as fc from 'fast-check'` and use
   `fc.assert(fc.property(...))`.
4. For integration tests that need DB:
   - Pull the connection from `TEST_DATABASE_URL`.
   - Wrap in the helpers from `__tests__/setup.ts`.
   - Don't share state across tests; use `beforeEach` to reset.
5. Run `pnpm -F @coinfrenzy/core test:watch` (or your package).

---

## Conventions

- **Names**: `something.test.ts` (Vitest globs `*.test.ts`).
- **Folder**: `__tests__/` co-located with the module under test.
- **No mocks where a real implementation exists**: use the mock
  adapters (`USE_MOCK_*=true`) and the real ledger/db.
- **Property tests over case tests** for anything involving money,
  drain order, idempotency.
- **Avoid `Date.now()` in tests** — pass a `now` parameter through the
  Context or use fixed dates.
- **No flaky tests**: if it sometimes passes, it's broken. Either fix
  the determinism or skip it loudly.

---

## CI pipeline

`.github/workflows/ci.yml`:

```yaml
jobs:
  ci:
    name: typecheck · lint · test
    runs-on: ubuntu-latest
    steps:
      - Checkout
      - Setup pnpm@11.1.1 / Node 20 / pnpm cache
      - pnpm install --frozen-lockfile
      - pnpm typecheck
      - pnpm lint
      - pnpm test
```

Triggers: every push to `main` + every PR against `main`. Concurrency
group cancels in-progress runs on the same ref.

Typical wall time: 5-8 min warm, 12 min cold.

---

## E2E (planned)

Recommended layout when added:

```
apps/web/e2e/
├── tests/
│   ├── auth.spec.ts
│   ├── lobby.spec.ts
│   ├── shop-purchase.spec.ts
│   ├── game-launch.spec.ts
│   └── redemption.spec.ts
├── fixtures/
└── playwright.config.ts
```

Should run against a staging URL (gated on the staging env being
real — see `14-recommended-next-work.md` #5).

---

## What to read next

- `10-ledger-and-money.md` — the property-test domain.
- `13-known-gaps.md` — what's NOT tested.
- `17-conventions.md` — style + patterns.
