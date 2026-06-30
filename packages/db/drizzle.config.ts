import type { Config } from 'drizzle-kit'

// Drizzle CLI config. Migrations are committed to ./src/migrations.
// Per docs/03 and the prompt: tables are added in prompt 02.

export default {
  schema: './src/schema/index.ts',
  out: './src/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
} satisfies Config
