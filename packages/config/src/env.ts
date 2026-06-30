import { z } from 'zod'

// Validated environment variables. Per docs/02 §10 and docs/09 §9.2.
// Imported at every entry point (web, worker, scripts) so the app
// crashes on startup if a required env var is missing or malformed.

// USE_MOCK_* flags drive the adapter factory in @coinfrenzy/core/adapters.
// They default to "true" so a fresh checkout boots without real vendor
// credentials. Flip a single flag to false (in Doppler or .env.local) when
// the corresponding live vendor account is wired up.
const boolFromEnv = z
  .union([z.boolean(), z.string()])
  .transform((v) => {
    if (typeof v === 'boolean') return v
    return !['false', '0', 'no', 'off', ''].includes(v.trim().toLowerCase())
  })
  .pipe(z.boolean())

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),

  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_URL_DIRECT: z.string().min(1).optional(),
  REDIS_URL: z.string().url().optional(),

  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  ADMIN_SESSION_SECRET: z.string().min(32).optional(),
  ADMIN_SESSION_SECRET_PREV: z.string().min(32).optional(),
  // DEV-ONLY: when true, password-only login is allowed for admins whose
  // `totp_enabled = false`. The login route issues a real session immediately
  // after a successful password check instead of forcing the 2FA setup
  // wizard. Hard-rejected at runtime when NODE_ENV='production'. See
  // /api/admin/auth/login. Default false.
  ADMIN_2FA_OPTIONAL: boolFromEnv.default(false),

  ALEA_API_BASE: z.string().url().optional(),
  ALEA_API_KEY: z.string().optional(),
  ALEA_WEBHOOK_SECRET: z.string().min(16).optional(),

  FINIX_API_KEY: z.string().optional(),
  FINIX_APPLICATION_ID: z.string().optional(),
  FINIX_WEBHOOK_SECRET: z.string().min(16).optional(),
  // Public values used by Finix Hosted Fields' client-side script. The
  // application id MUST match FINIX_APPLICATION_ID; the environment is
  // 'sandbox' until we go live, then 'live'. Per docs/05 §3.
  NEXT_PUBLIC_FINIX_APPLICATION_ID: z.string().optional(),
  NEXT_PUBLIC_FINIX_ENVIRONMENT: z.enum(['sandbox', 'live']).default('sandbox'),

  FOOTPRINT_API_KEY: z.string().optional(),
  FOOTPRINT_WEBHOOK_SECRET: z.string().min(16).optional(),
  FOOTPRINT_PLAYBOOK_ID: z.string().optional(),

  RADAR_API_KEY: z.string().optional(),

  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM_EMAIL: z.string().email().optional(),
  SENDGRID_WEBHOOK_SECRET: z.string().min(16).optional(),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WEBHOOK_SECRET: z.string().min(16).optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),

  EASYSCAM_API_KEY: z.string().optional(),
  EASYSCAM_API_BASE: z.string().url().optional(),
  INTERCOM_ACCESS_TOKEN: z.string().optional(),

  // Vendor-mock toggles. Default true everywhere so dev / CI never hits a
  // real vendor account. Flip to false in Doppler when going live.
  USE_MOCK_FINIX: boolFromEnv.default(true),
  USE_MOCK_ALEA: boolFromEnv.default(true),
  USE_MOCK_FOOTPRINT: boolFromEnv.default(true),
  USE_MOCK_RADAR: boolFromEnv.default(true),
  USE_MOCK_SENDGRID: boolFromEnv.default(true),
  USE_MOCK_TWILIO: boolFromEnv.default(true),
  USE_MOCK_EASYSCAM: boolFromEnv.default(true),

  // App base URLs used by mock-vendor pages to call back into our own
  // webhook receivers, and by real adapters to set return URLs.
  PLAYER_BASE_URL: z.string().url().optional(),
  WEBHOOK_BASE_URL: z.string().url().optional(),

  // Real-time (docs/10 §7).
  PUSHER_APP_ID: z.string().optional(),
  PUSHER_KEY: z.string().optional(),
  PUSHER_SECRET: z.string().optional(),
  PUSHER_CLUSTER: z.string().optional(),
  NEXT_PUBLIC_PUSHER_KEY: z.string().optional(),
  NEXT_PUBLIC_PUSHER_CLUSTER: z.string().optional(),

  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),

  // Cloudflare Turnstile (docs: https://developers.cloudflare.com/turnstile/)
  // NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY is read by the browser widget.
  // CF_TURNSTILE_SECRET_KEY is used server-side to verify challenge tokens.
  // Both are optional so dev environments boot without real Cloudflare credentials.
  // When CF_TURNSTILE_SECRET_KEY is absent the API route skips verification (dev only).
  NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY: z.string().optional(),
  CF_TURNSTILE_SECRET_KEY: z.string().optional(),

  SENTRY_DSN: z.string().optional(),
  AXIOM_TOKEN: z.string().optional(),
  GRAFANA_API_KEY: z.string().optional(),
  PAGERDUTY_ROUTING_KEY: z.string().optional(),

  ENCRYPTION_KEY_CURRENT: z.string().optional(),
  ENCRYPTION_KEY_PREVIOUS: z.string().optional(),

  // Feature flag: when true, the player lobby reads its rails (sections
  // + per-section game ordering) from `casino_sub_categories` instead
  // of the hardcoded `lib/player-categories.ts` mapping. The migration
  // 0012 backfill seeds the same five sections so it's safe to flip on
  // by default in dev/staging, and admin Game Lobby edits will be
  // immediately visible to players. Off in prod by default until a
  // smoke test confirms backfill integrity. See docs/08 §4.3.
  USE_DB_LOBBY_LAYOUT: boolFromEnv.default(true),
})

export type Env = z.infer<typeof envSchema>

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Docker env_file (and most .env loaders) set absent vars to "" rather than
  // leaving them undefined. Zod's .optional() accepts undefined but rejects ""
  // for validators like .url() and .email(). Normalise before parsing so that
  // any var left blank in .env.docker is treated as "not set".
  const normalised = Object.fromEntries(
    Object.entries(source).map(([k, v]) => [k, v === '' ? undefined : v]),
  )
  const parsed = envSchema.safeParse(normalised)
  if (!parsed.success) {
    // Fail loudly at startup rather than mid-request.
    const issues = parsed.error.issues
      .map((i) => `  ? ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }
  return parsed.data
}

// Lazily evaluated so importing this module in tooling (Drizzle CLI, codegen)
// doesn't require a full environment.
let cached: Env | undefined
export function env(): Env {
  if (!cached) cached = parseEnv()
  return cached
}

/**
 * Drop the cached environment snapshot. Used by tests that need to flip
 * vendor-mock flags mid-suite; production code never calls this.
 */
export function _resetEnvCacheForTests(): void {
  cached = undefined
}
