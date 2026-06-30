/** @type {import('next').NextConfig} */
const isWindows = process.platform === 'win32'

const nextConfig = {
  // Next's standalone trace copier creates symlinks for pnpm packages.
  // Local Windows builds usually lack symlink privileges, which causes
  // EPERM during "Collecting build traces". Docker/Vercel run on Linux
  // and still need standalone output for the web container.
  output: isWindows ? undefined : 'standalone',
  reactStrictMode: true,
  // Workspace packages are TypeScript source; let Next.js transpile them.
  transpilePackages: [
    '@coinfrenzy/core',
    '@coinfrenzy/db',
    '@coinfrenzy/ui',
    '@coinfrenzy/config',
  ],
  // CommonJS-only packages that misbehave under Webpack bundling — load them
  // via Node's native resolver instead. `handlebars` uses `require.extensions`
  // which Webpack can't model; bundling it corrupts the dev RSC client manifest
  // after a few HMR cycles, producing
  // `Cannot read properties of undefined (reading 'call')` on /admin pages
  // that transitively touch `@coinfrenzy/core` (which re-exports `crm`,
  // which uses handlebars for email templating).
  serverExternalPackages: [
    'handlebars',
    'pg',
    'postgres',
    'twilio',
    'pusher',
    '@sendgrid/mail',
  ],
  async rewrites() {
    return [
      {
        source: '/api/v1/auth/sign-up',
        destination: '/api/player/signup',
      },
      {
        source: '/api/v1/auth/verifyEmail',
        destination: '/api/player/verify-otp',
      },
      {
        source: '/api/v1/auth/resendVerifyEmail',
        destination: '/api/player/resend-otp',
      },
      {
        source: '/api/v1/auth/username',
        destination: '/api/player/username-check',
        has: [{ type: 'query', key: 'username' }]
      },
      {
        source: '/api/v1/auth/username',
        destination: '/api/player/username',
      },
      {
        source: '/api/v1/user/profile',
        destination: '/api/player/profile',
      },
    ]
  },
}

export default nextConfig
