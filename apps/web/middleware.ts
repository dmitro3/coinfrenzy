import { NextResponse, type NextRequest } from 'next/server'

// Must match `ADMIN_SESSION_COOKIE` exported from `@coinfrenzy/core/auth/admin-session`.
// We don't import the constant because edge middleware can't pull in
// bcryptjs / postgres / drizzle through the core package.
const ADMIN_SESSION_COOKIE = 'cf_admin_session'

// Paths a 'host' role admin is permitted to render at the edge. Anything
// else under /admin/* sends them back to /admin with ?restricted=1.
// Kept in sync with `HOST_PORTAL_PATH_PREFIXES` in
// `packages/core/src/auth/permissions.ts`; that constant is the canonical
// source but edge middleware can't import the package without dragging in
// postgres/bcrypt.
const HOST_ALLOWED_PATH_PREFIXES = [
  '/admin/vips',
  '/admin/messages',
  '/admin/bonus',
  '/admin/account',
] as const

const HOST_ALLOWED_API_PREFIXES = ['/api/admin/auth/', '/api/admin/host/'] as const

// Better Auth session cookie. The library names the cookie after the app
// by default; we read both possible names just in case the default ever
// flips. Edge middleware only checks presence; full verification (token
// signature + db row lookup) runs in the player layout via Better Auth's
// `auth.api.getSession`.
const BETTER_AUTH_COOKIES = ['better-auth.session_token', '__Secure-better-auth.session_token']

const PLAYER_GATED_PATHS = ['/account', '/cashier', '/bonuses', '/promotions', '/vip', '/referrals']
const PLAYER_GATED_PREFIXES = ['/games/']

function hasBetterAuthCookie(request: NextRequest): boolean {
  for (const name of BETTER_AUTH_COOKIES) {
    if (request.cookies.get(name)?.value) return true
  }
  return false
}

function needsPlayerSession(pathname: string): boolean {
  if (PLAYER_GATED_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return true
  }
  if (PLAYER_GATED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return true
  }
  return false
}

/**
 * Decode the admin session cookie payload WITHOUT verifying the HMAC.
 * Edge runtime can't pull in node:crypto / bcryptjs so we can't do full
 * verification here. The cookie shape is `<base64url(payload)>.<sig>` —
 * we peek at the payload only so we can route hosts to the right portal.
 *
 * Tampered cookies are caught later by the RSC layout's verifySession();
 * worst case a forged payload pretending to be 'host' downgrades the
 * attacker to a more-restricted UI than they'd get with a 'master' tamper,
 * so we fail closed.
 */
function peekAdminRole(token: string): string | null {
  const dot = token.indexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  try {
    const padded =
      body.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (body.length % 4)) % 4)
    const json = atob(padded)
    const parsed = JSON.parse(json) as { role?: unknown }
    return typeof parsed.role === 'string' ? parsed.role : null
  } catch {
    return null
  }
}

function isHostAllowedPath(pathname: string): boolean {
  if (pathname === '/admin' || pathname === '/admin/' || pathname === '/admin/logout') {
    return true
  }
  for (const prefix of HOST_ALLOWED_PATH_PREFIXES) {
    if (pathname === prefix) return true
    if (pathname.startsWith(prefix + '/')) return true
  }
  return false
}

function isHostAllowedApi(pathname: string): boolean {
  for (const prefix of HOST_ALLOWED_API_PREFIXES) {
    if (pathname.startsWith(prefix)) return true
  }
  return false
}

/**
 * Edge middleware — first line of defense for both admin and player
 * surfaces. We do NOT verify signatures here (edge runtime can't pull in
 * bcryptjs / postgres). Instead we check cookie presence and bounce the
 * unauthenticated visitor to login. The route's RSC layout then does the
 * full verification.
 *
 * For the 'host' contractor role we also gate routes: hosts can only see
 * their VIP queue. Any other /admin/* request is bounced back to /admin
 * with `?restricted=1` so the host shell renders a flash banner.
 *
 * Surface routing: the Docker Compose setup runs the same Next.js image
 * as two separate containers differentiated by APP_SURFACE ('player' |
 * 'admin'). We read APP_SURFACE — NOT NEXT_PUBLIC_APP_SURFACE — because
 * NEXT_PUBLIC_* vars are statically inlined by the Next.js compiler at
 * build time; since both containers share one image, the build-time value
 * would be undefined. Plain APP_SURFACE is always evaluated at runtime.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Cloudflare Turnstile gate — player sign-in ──────────────────────
  // The client sends the challenge token via X-CF-Turnstile-Token header
  // (set in fetchOptions.headers inside signIn.email()). We verify it here
  // before Better Auth ever processes the credential, so a bot that skips
  // the widget never reaches the password-check path.
  // Skipped entirely when CF_TURNSTILE_SECRET_KEY is absent (dev / CI).
  if (pathname === '/api/auth/sign-in/email' && request.method === 'POST') {
    const secretKey = process.env.CF_TURNSTILE_SECRET_KEY
    if (secretKey) {
      const token = request.headers.get('x-cf-turnstile-token')
      if (!token) {
        return NextResponse.json(
          { message: 'Security challenge required.', code: 'TURNSTILE_REQUIRED' },
          { status: 400 },
        )
      }
      const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        request.headers.get('x-real-ip') ??
        ''
      try {
        const verifyBody = new URLSearchParams({ secret: secretKey, response: token })
        if (ip) verifyBody.set('remoteip', ip)
        const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: verifyBody.toString(),
        })
        const json = (await verifyRes.json()) as { success?: boolean }
        if (!json.success) {
          return NextResponse.json(
            { message: 'Security challenge failed. Please try again.', code: 'TURNSTILE_FAILED' },
            { status: 400 },
          )
        }
      } catch {
        // Fail open: if Cloudflare is unreachable, let the request through
        // rather than blocking all logins. Alert/monitor on this path.
        console.warn('[turnstile] siteverify unreachable — failing open')
      }
    }
  }

  // ── Surface root redirect ────────────────────────────────────────────
  // Admin container: redirect / (and /login, /signup) to /admin so
  // operators hitting the container root land on the admin panel.
  if (process.env.APP_SURFACE === 'admin') {
    if (pathname === '/') {
      const url = request.nextUrl.clone()
      url.pathname = '/admin'
      url.search = ''
      return NextResponse.redirect(url)
    }
  }

  // ── Admin API surface (excluding auth) — also needs host gating.
  if (pathname.startsWith('/api/admin/')) {
    if (pathname.startsWith('/api/admin/auth/')) {
      return NextResponse.next()
    }
    const cookie = request.cookies.get(ADMIN_SESSION_COOKIE)
    const token = cookie?.value
    if (!token) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const role = peekAdminRole(token)
    if (role === 'host' && !isHostAllowedApi(pathname)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    return NextResponse.next()
  }

  // ── Admin surface ───────────────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login' || pathname.startsWith('/admin/login/')) {
      return NextResponse.next()
    }

    const cookie = request.cookies.get(ADMIN_SESSION_COOKIE)
    if (!cookie?.value) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin/login'
      url.search = ''
      url.searchParams.set('next', pathname)
      return NextResponse.redirect(url)
    }

    const role = peekAdminRole(cookie.value)
    if (role === 'host' && !isHostAllowedPath(pathname)) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin'
      url.search = ''
      url.searchParams.set('restricted', '1')
      url.searchParams.set('from', pathname)
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }

  // ── Player surface ──────────────────────────────────────────────────
  if (needsPlayerSession(pathname)) {
    // DEV-ONLY: when DEV_PLAYER_AUTOLOGIN=true and we aren't in production,
    // the RSC layout impersonates the first seeded player. Skip the cookie
    // gate so the founder can browse /lobby etc. without a real signup.
    // The hard NODE_ENV check below mirrors the one in player-session.ts so
    // production can never engage this path even if the flag leaks.
    const devBypass =
      process.env.NODE_ENV !== 'production' && process.env.DEV_PLAYER_AUTOLOGIN === 'true'
    if (!devBypass && !hasBetterAuthCookie(request)) {
      const url = request.nextUrl.clone()
      url.pathname = '/lobby'
      url.search = ''
      url.searchParams.set('auth', 'login')
      url.searchParams.set('next', pathname)
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Surface root redirect (admin container: / → /admin).
    // /login and /signup are now server-side redirect pages — no middleware needed.
    '/',
    // Admin surface protection.
    '/admin/:path*',
    '/api/admin/:path*',
    // Turnstile gate for player sign-in (Better Auth endpoint).
    '/api/auth/sign-in/email',
    // Player surface protection.
    '/account/:path*',
    '/cashier/:path*',
    '/bonuses/:path*',
    '/promotions/:path*',
    '/vip/:path*',
    '/games/:path*',
    '/referrals',
    '/referrals/:path*',
  ],
}
