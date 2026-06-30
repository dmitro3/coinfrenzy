import 'server-only'

import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { magicLink, twoFactor } from 'better-auth/plugins'
import { eq } from 'drizzle-orm'

import { env } from '@coinfrenzy/config'
import { adapters, auth as coreAuth, consoleLogger } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

// docs/09 §5.1 — Better Auth configuration for player auth.
//
// We mount this from `apps/web/app/api/auth/[...all]/route.ts`. The
// drizzle adapter uses the four `auth_*` tables (see packages/db/src/schema/auth.ts).
//
// On the post-signup hook we call `coreAuth.provisionPlayer` so the
// players row + GC/SC wallets land in the same transaction context.

function getAuthSecret(): string {
  const e = env()
  if (!e.BETTER_AUTH_SECRET) {
    if (e.NODE_ENV === 'production') {
      throw new Error('BETTER_AUTH_SECRET is required in production')
    }
    // Dev fallback so the app boots without forcing the user to generate
    // a key on first run. Anything signed with this key cannot be used in
    // any other environment.
    return 'dev-only-better-auth-secret-not-for-production-use-1234567890'
  }
  return e.BETTER_AUTH_SECRET
}

export const auth = betterAuth({
  appName: 'CoinFrenzy',
  secret: getAuthSecret(),

  advanced: {
    // Generate RFC 4122 UUIDs so the auth_user.id matches the format
    // required by players.id (uuid). We pass a CUSTOM FUNCTION rather
    // than the literal "uuid" string, because Better Auth's drizzle-pg
    // adapter treats `generateId: "uuid"` as "let the database fill it
    // via DEFAULT gen_random_uuid()", which our auth_user.id (text, no
    // default) does not do. With a custom function, Better Auth
    // generates the value and passes it to the INSERT explicitly.
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },

  database: drizzleAdapter(getDb(), {
    provider: 'pg',
    schema: {
      user: schema.authUser,
      session: schema.authSession,
      account: schema.authAccount,
      verification: schema.authVerification,
      twoFactor: schema.authTwoFactor,
    },
  }),

  session: {
    expiresIn: 60 * 60 * 24 * 14, // 14 days per docs/09 §5.1
    updateAge: 60 * 60 * 24, // refresh once per day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    autoSignIn: true,
    sendResetPassword: async ({ user, url }) => {
      await adapters.sendgrid.sendEmail({
        to: user.email,
        subject: 'Reset your CoinFrenzy password',
        text: `Reset your password: ${url}\n\nThis link expires in 1 hour. If you didn't request a reset you can ignore this email.`,
        category: 'transactional.password_reset',
      })
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24, // 24 hours
    sendVerificationEmail: async ({ user, url }) => {
      await adapters.sendgrid.sendEmail({
        to: user.email,
        subject: 'Verify your CoinFrenzy email',
        text: `Welcome to CoinFrenzy. Verify your email address to unlock SC redemptions:\n\n${url}\n\nThis link expires in 24 hours.`,
        category: 'transactional.email_verification',
      })
    },
  },

  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await adapters.sendgrid.sendEmail({
          to: email,
          subject: 'Your CoinFrenzy sign-in link',
          text: `Tap to sign in to CoinFrenzy:\n\n${url}\n\nThis link expires in 10 minutes.`,
          category: 'transactional.magic_link',
        })
      },
      expiresIn: 60 * 10,
    }),
    twoFactor({
      issuer: 'CoinFrenzy',
    }),
  ],

  // Domain profile data (firstName, lastName, state, dateOfBirth, consent
  // flags) lives on `players`, not `auth_user`, to keep the two trust zones
  // separated per docs/09 §2. So we intentionally don't declare
  // `user.additionalFields`. Instead, the custom `/api/player/signup`
  // endpoint wraps `auth.api.signUpEmail` and then calls
  // `coreAuth.completePlayerProfile` with the profile extras.
  //
  // The post-create hook below creates the minimal players row + GC/SC
  // wallets so the (auth_user, players) 1:1 invariant always holds — even
  // for users who sign in via magic link before the signup form completes.
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          // docs/09 §6.1 — stealth lock enforcement. If an admin has set
          // `players.metadata.stealth_lock` on this account, refuse new
          // sessions with a generic credential error so the actor cannot
          // tell whether they mistyped or were locked. The lock metadata
          // is written by /api/admin/players/[id]/stealth-lock and
          // cleared by the same endpoint with action: 'unlock'.
          try {
            const rows = await getDb()
              .select({ metadata: schema.players.metadata, status: schema.players.status })
              .from(schema.players)
              .where(eq(schema.players.id, session.userId))
              .limit(1)
            const row = rows[0]
            if (!row) return
            const meta = (row.metadata ?? {}) as Record<string, unknown>
            const lock = meta.stealth_lock as { locked_at?: string } | undefined
            if (lock?.locked_at) {
              throw new APIError('UNAUTHORIZED', {
                message: 'Invalid email or password',
              })
            }
          } catch (e) {
            if (e instanceof APIError) throw e
            // Defensive: never block real logins because the lookup failed.
            console.error('[auth] stealth-lock check failed', {
              userId: session.userId,
              error: e instanceof Error ? e.message : String(e),
            })
          }
        },
      },
    },
    user: {
      create: {
        after: async (user) => {
          // Best-effort. We never throw out of this hook: Better Auth
          // commits the auth_user row before running the after-hook, so a
          // throw here would orphan an auth_user without a matching
          // players row. The custom /api/player/signup route is the
          // signup-time path; this hook also catches magic-link first
          // sign-ins. If it fails we log loudly so the admin tooling can
          // reconcile.
          try {
            const result = await coreAuth.provisionPlayer(
              getDb(),
              {
                id: user.id,
                email: user.email,
                displayName: user.name ?? null,
                extras: {},
              },
              consoleLogger,
            )
            if (!result.ok && result.error.kind !== 'already_exists') {
              console.error('[auth] provisionPlayer failed for new user', {
                userId: user.id,
                error: result.error,
              })
            }
          } catch (e) {
            console.error('[auth] provisionPlayer threw for new user', {
              userId: user.id,
              error: e instanceof Error ? e.message : String(e),
            })
          }
        },
      },
    },
  },
})

export type Auth = typeof auth
