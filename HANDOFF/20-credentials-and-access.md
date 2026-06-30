# 20 · Credentials and Access

The full inventory of every secret the system needs, where each lives,
how to obtain a new one, and how to rotate it.

> **None of this file contains actual secret values.** Real values live
> in Doppler. This is the schema + procedure.

---

## Where secrets live

| Tier                       | Location                                                                                   | Mirrors to |
| -------------------------- | ------------------------------------------------------------------------------------------ | ---------- |
| **Single source of truth** | **Doppler** (project: `coinfrenzy`; configs: `dev`, `staging`, `prod`)                     | —          |
| Local dev                  | `apps/web/.env.local` (gitignored; populated via `doppler secrets download`)               | —          |
| Web hosting                | Vercel project env (auto-synced from Doppler via the Doppler↔Vercel integration)           | —          |
| Worker hosting             | Fly.io `coinfrenzy-worker` app secrets (pushed via `doppler run -- flyctl secrets import`) | —          |
| CI/CD                      | GitHub Actions secrets (set manually; named the same as Doppler keys)                      | —          |

Rotation runbook: `runbooks/secret_rotation.md` (root).

---

## Inventory

### Database

| Var                                         | Used by                                               | How to obtain                                            | Rotation                                            |
| ------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------- |
| `DATABASE_URL`                              | All apps (pooled connection through Neon pgbouncer)   | Neon dashboard → Project → Connection string → Pooled    | Rotate the role password in Neon and update Doppler |
| `DATABASE_URL_DIRECT`                       | Migration runner only (un-pooled)                     | Neon dashboard → same project → Direct connection string | Same role; rotated together                         |
| `NEON_DATABASE_URL_MIGRATE` (GitHub secret) | `db-migrate.yml` workflow                             | Direct connection URL with the elevated migration role   | Rotate via Neon, update GitHub secret               |
| `REDIS_URL`                                 | Upstash Redis (cache + rate limits + ephemeral state) | Upstash dashboard → Database → "Connect" → Redis URL     | Rotate token in Upstash, update Doppler             |

### Auth secrets

| Var                             | Used by                                      | Generate                                       | Rotation                                                                                    |
| ------------------------------- | -------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`            | Better Auth (player sessions). Min 32 chars. | `openssl rand -hex 32`                         | 7-day overlap not currently supported by Better Auth — issue forces all players to re-login |
| `BETTER_AUTH_URL`               | Better Auth callback base URL                | Public URL of the deployed app                 | When domain changes                                                                         |
| `ADMIN_SESSION_SECRET`          | Admin HMAC session signing                   | `openssl rand -hex 32`                         | 7-day overlap via `ADMIN_SESSION_SECRET_PREV`                                               |
| `ADMIN_SESSION_SECRET_PREV`     | Verify legacy admin tokens during rotation   | The previous value of `ADMIN_SESSION_SECRET`   | Remove after 7 days                                                                         |
| `ADMIN_2FA_OPTIONAL` (dev only) | Bypass 2FA enrollment for local UI work      | `true` to enable; hard-rejected in prod        | n/a — must be `false` (or unset) in prod                                                    |
| `ENCRYPTION_KEY_CURRENT`        | App-layer AES-256-GCM for sensitive fields   | `openssl rand -hex 32`                         | 7-day overlap via `ENCRYPTION_KEY_PREVIOUS`                                                 |
| `ENCRYPTION_KEY_PREVIOUS`       | Decrypt fields encrypted with prior key      | The previous value of `ENCRYPTION_KEY_CURRENT` | Remove after re-encryption sweep                                                            |

### Alea (game aggregator)

| Var                   | Where                                            | Obtain                                            |
| --------------------- | ------------------------------------------------ | ------------------------------------------------- |
| `ALEA_API_BASE`       | `packages/core/src/adapters/alea/client-real.ts` | Alea operator portal                              |
| `ALEA_API_KEY`        | Same                                             | Alea portal                                       |
| `ALEA_WEBHOOK_SECRET` | `verify-webhook.ts`                              | Alea portal (matches webhook config)              |
| `USE_MOCK_ALEA`       | Adapter factory                                  | `true` in dev/staging until live; `false` in prod |

Rotation: rotate via Alea portal, update Doppler, redeploy.

### Finix (payments)

| Var                                | Where                   | Obtain                                                |
| ---------------------------------- | ----------------------- | ----------------------------------------------------- |
| `FINIX_API_KEY`                    | Adapter (server)        | Finix dashboard                                       |
| `FINIX_APPLICATION_ID`             | Adapter + Hosted Fields | Finix dashboard                                       |
| `FINIX_WEBHOOK_SECRET`             | Webhook verify          | Finix dashboard (matches webhook config)              |
| `NEXT_PUBLIC_FINIX_APPLICATION_ID` | Browser Hosted Fields   | Same as `FINIX_APPLICATION_ID` (intentionally public) |
| `NEXT_PUBLIC_FINIX_ENVIRONMENT`    | Browser                 | `sandbox` or `live`                                   |
| `USE_MOCK_FINIX`                   | Adapter factory         | `false` once live                                     |

### Footprint (KYC)

| Var                        | Where                  | Obtain              |
| -------------------------- | ---------------------- | ------------------- |
| `FOOTPRINT_API_KEY`        | Adapter                | Footprint dashboard |
| `FOOTPRINT_WEBHOOK_SECRET` | Svix-style verify      | Footprint dashboard |
| `FOOTPRINT_PLAYBOOK_ID`    | Adapter (defines flow) | Footprint dashboard |
| `USE_MOCK_FOOTPRINT`       | Adapter factory        | `false` once live   |

### Radar (geo)

| Var              | Where                 | Obtain            |
| ---------------- | --------------------- | ----------------- |
| `RADAR_API_KEY`  | Adapter (server-side) | Radar dashboard   |
| `USE_MOCK_RADAR` | Adapter factory       | `false` once live |

### Messaging — SendGrid + Twilio

| Var                       | Where           | Obtain                                    |
| ------------------------- | --------------- | ----------------------------------------- |
| `SENDGRID_API_KEY`        | Adapter         | SendGrid → Settings → API Keys            |
| `SENDGRID_FROM_EMAIL`     | Adapter         | Verified sender in SendGrid               |
| `SENDGRID_WEBHOOK_SECRET` | Webhook verify  | SendGrid → Event Webhook → Verification   |
| `USE_MOCK_SENDGRID`       | Adapter factory | `false` once live                         |
| `TWILIO_ACCOUNT_SID`      | Adapter         | Twilio console                            |
| `TWILIO_AUTH_TOKEN`       | Adapter         | Twilio console                            |
| `TWILIO_WEBHOOK_SECRET`   | Webhook verify  | Twilio → Phone Numbers → Webhook settings |
| `TWILIO_FROM_NUMBER`      | Adapter         | Twilio-purchased phone number             |
| `USE_MOCK_TWILIO`         | Adapter factory | `false` once live                         |

### EasyScam (AMOE)

| Var                 | Where           | Obtain            |
| ------------------- | --------------- | ----------------- |
| `EASYSCAM_API_KEY`  | Adapter         | EasyScam portal   |
| `EASYSCAM_API_BASE` | Adapter         | EasyScam portal   |
| `USE_MOCK_EASYSCAM` | Adapter factory | `false` once live |

### Intercom (planned — live chat)

| Var                     | Where                         | Obtain                      |
| ----------------------- | ----------------------------- | --------------------------- |
| `INTERCOM_ACCESS_TOKEN` | `/live-support` widget script | Intercom workspace settings |

### Cloudflare R2

| Var                    | Where   | Obtain                    |
| ---------------------- | ------- | ------------------------- |
| `R2_ACCOUNT_ID`        | Adapter | Cloudflare dashboard → R2 |
| `R2_ACCESS_KEY_ID`     | Adapter | R2 API Token              |
| `R2_SECRET_ACCESS_KEY` | Adapter | R2 API Token              |
| `R2_BUCKET`            | Adapter | Bucket name               |

### Inngest

| Var                   | Where                                  | Obtain                                    |
| --------------------- | -------------------------------------- | ----------------------------------------- |
| `INNGEST_EVENT_KEY`   | Web app (sender)                       | Inngest dashboard → Manage → Event keys   |
| `INNGEST_SIGNING_KEY` | Worker (receiver, verifies signatures) | Inngest dashboard → Manage → Signing keys |

### Pusher (Channels)

| Var                          | Where                                 | Obtain                                      |
| ---------------------------- | ------------------------------------- | ------------------------------------------- |
| `PUSHER_APP_ID`              | Server publisher                      | Pusher dashboard                            |
| `PUSHER_KEY`                 | Server publisher                      | Pusher dashboard                            |
| `PUSHER_SECRET`              | Server publisher (signs channel auth) | Pusher dashboard                            |
| `PUSHER_CLUSTER`             | Both sides                            | Pusher dashboard                            |
| `NEXT_PUBLIC_PUSHER_KEY`     | Browser                               | Same as `PUSHER_KEY` (intentionally public) |
| `NEXT_PUBLIC_PUSHER_CLUSTER` | Browser                               | Same as `PUSHER_CLUSTER`                    |

### Observability

| Var                     | Where                       | Obtain                           |
| ----------------------- | --------------------------- | -------------------------------- |
| `SENTRY_DSN`            | Web + worker                | Sentry project settings          |
| `AXIOM_TOKEN`           | Web + worker logger         | Axiom workspace settings         |
| `GRAFANA_API_KEY`       | Metric publisher (optional) | Grafana Cloud API key            |
| `PAGERDUTY_ROUTING_KEY` | Worker alerts               | PagerDuty Events API integration |

### Deployment (GitHub Actions secrets only)

| Var                        | Used by                                         | Obtain                       |
| -------------------------- | ----------------------------------------------- | ---------------------------- |
| `VERCEL_TOKEN`             | `deploy-web` job                                | Vercel → Account → Tokens    |
| `VERCEL_ORG_ID`            | Same                                            | Vercel → Team Settings       |
| `VERCEL_PROJECT_ID`        | Same                                            | Vercel → Project Settings    |
| `FLY_API_TOKEN`            | `deploy-worker` job                             | Fly → Personal Access Tokens |
| `DOPPLER_TOKEN` (optional) | If you want CI to push Fly secrets from Doppler | Doppler service token        |

### Base URLs

| Var                | Where                                         | Notes                                                                         |
| ------------------ | --------------------------------------------- | ----------------------------------------------------------------------------- |
| `PLAYER_BASE_URL`  | Mock-vendor pages, real adapters' return URLs | `http://localhost:3000` locally; full prod URL in prod                        |
| `WEBHOOK_BASE_URL` | Same                                          | Should match `PLAYER_BASE_URL` unless you split webhooks onto a separate host |

### Bootstrap (one-time only)

| Var                        | Used by                | Notes                                           |
| -------------------------- | ---------------------- | ----------------------------------------------- |
| `BOOTSTRAP_ADMIN_EMAIL`    | `db:seed-admin` script | Set ONCE; remove afterward                      |
| `BOOTSTRAP_ADMIN_PASSWORD` | Same                   | Used to bcrypt-hash the seeded admin's password |
| `BOOTSTRAP_ADMIN_NAME`     | Same                   | Display name                                    |

### Feature flags

| Var                   | Default | Purpose                                                                                                               |
| --------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| `USE_DB_LOBBY_LAYOUT` | `true`  | Lobby reads rails from `casino_sub_categories`; flip to `false` to fall back to hardcoded `lib/player-categories.ts`. |

---

## Rotation procedures

### Standard secret rotation (vendor-issued key)

1. Issue a new key in the vendor portal.
2. Update Doppler `prod` with the new value.
3. Watch Vercel auto-resync (or trigger a redeploy).
4. Push to Fly: `doppler run -- flyctl secrets set <KEY>=$<KEY> --app coinfrenzy-worker`.
5. Confirm no errors in Sentry for 5 minutes.
6. Revoke the old key in the vendor portal.

### HMAC session secret rotation (7-day overlap)

1. Generate the new secret: `openssl rand -hex 32`.
2. In Doppler `prod`:
   - Move the current `ADMIN_SESSION_SECRET` value to
     `ADMIN_SESSION_SECRET_PREV`.
   - Set `ADMIN_SESSION_SECRET` to the new value.
3. Redeploy web + worker. Existing admin sessions still verify via
   `PREV`.
4. After 7 days (or once all sessions naturally expire), clear
   `ADMIN_SESSION_SECRET_PREV` and redeploy.

Same pattern for `ENCRYPTION_KEY_CURRENT` / `ENCRYPTION_KEY_PREVIOUS`.

### Better Auth secret rotation

Better Auth does not currently support the overlap pattern. Rotation =
all players re-login. Schedule a low-traffic window and announce.

---

## Access control

**[FILL ME IN — founder]**

| Person     | Doppler | Vercel | Fly    | GitHub | Sentry | Notes |
| ---------- | ------- | ------ | ------ | ------ | ------ | ----- |
| Founder    | admin   | admin  | admin  | owner  | admin  |       |
| ****\_**** | **\_**  | **\_** | **\_** | **\_** | **\_** |       |
| ****\_**** | **\_**  | **\_** | **\_** | **\_** | **\_** |       |
| ****\_**** | **\_**  | **\_** | **\_** | **\_** | **\_** |       |

Track and review every quarter. Use Doppler's "Activity" log to audit
changes.

---

## What to read next

- `runbooks/secret_rotation.md` (root) — detailed rotation steps.
- `12-deployment.md` — how secrets flow into Vercel + Fly.
- `15-security-and-compliance.md` — encryption + auth model.
