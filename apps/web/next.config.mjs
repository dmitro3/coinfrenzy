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
}

export default nextConfig
