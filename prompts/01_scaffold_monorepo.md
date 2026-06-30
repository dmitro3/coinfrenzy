# Prompt 01 — Scaffold the Monorepo

Copy this entire file into Cursor's chat (Cmd+L or Ctrl+L) and hit enter.

---

You are starting a new project. Read `docs/01_architecture_overview.md`
and `docs/02_core_service_layer.md` in full before proceeding. Also
read `.cursorrules` to understand the rules of this codebase.

## Your task

Scaffold the monorepo structure for the CoinFrenzy casino platform.

## Specific requirements

1. **Initialize a pnpm workspace** (we use pnpm, not npm or yarn) with
   the following structure per docs/02 §2:
   ```
   apps/
     web/           (Next.js 15 App Router, TypeScript strict)
     worker/        (Node.js app for Fly.io, Inngest functions + cron)
   packages/
     core/          (TypeScript library — all business logic)
     db/            (Drizzle schema + migrations)
     ui/            (Shared React components + Tailwind config)
     config/        (Shared types, Zod schemas, constants)
   ```

2. **Initialize the Next.js app in `apps/web`** with:
   - Next.js 15 App Router
   - TypeScript strict mode (no `any` without justification)
   - Tailwind v3 (not v4)
   - shadcn/ui set up with the default theme initially (we'll customize later)
   - The three route groups from docs/10 §3: `(marketing)`, `(auth)`,
     `(player)`, `(admin)` — empty placeholder pages in each

3. **Initialize the worker app in `apps/worker`** with:
   - TypeScript, no Next.js
   - Inngest SDK installed and configured
   - A `src/index.ts` entry point that starts Inngest
   - A placeholder Inngest function `apps/worker/src/jobs/hello.ts` to
     verify Inngest is wired correctly

4. **Set up the core package in `packages/core`**:
   - TypeScript library, no React
   - Folder structure per docs/02 §2:
     ```
     packages/core/src/
       ledger/          (placeholder — will be filled in prompt 03)
       bonus/           (placeholder)
       redemption/      (placeholder)
       crm/             (placeholder)
       webhooks/        (placeholder)
       adapters/        (placeholder — will hold finix/, alea/, footprint/, radar/, easyscam/ subfolders)
       events/          (placeholder)
       auth/            (placeholder)
       audit/           (placeholder)
       compliance/      (placeholder)
       migration/       (placeholder)
       index.ts         (re-exports everything)
     ```
   - Each subfolder should have a placeholder `index.ts` with a comment
     like `// Implementation in prompt NN`

5. **Set up the db package in `packages/db`**:
   - Drizzle ORM configured
   - `drizzle.config.ts` pointing at `./src/schema/index.ts`
   - Folder structure:
     ```
     packages/db/src/
       schema/
         index.ts       (exports all tables)
         players.ts     (placeholder)
         wallets.ts     (placeholder)
         ... etc
       client.ts        (creates the Drizzle client from DATABASE_URL)
       migrations/      (empty — will be populated in prompt 02)
     ```
   - DO NOT create the actual table schemas yet — that's prompt 02

6. **Set up the ui package in `packages/ui`**:
   - shadcn/ui base components
   - Shared Tailwind config (in `packages/ui/tailwind.config.ts`)
   - The component structure from docs/10 §5.2 — but only create the
     folder structure with placeholder files, not the implementations
     (those come in prompts 04+)

7. **Set up the config package in `packages/config`**:
   - Shared Zod schemas
   - Shared TypeScript types
   - Shared constants (currency types, jurisdiction blocked states, etc.)
   - Folder structure:
     ```
     packages/config/src/
       env.ts          (Zod-validated environment variables)
       constants/
         jurisdictions.ts  (the 11 blocked states per docs/09 §8)
         currencies.ts     (GC, SC, USD enums)
       types/
         money.ts          (bigint money types)
       index.ts        (re-exports)
     ```

8. **Root files**:
   - `package.json` with workspace config
   - `pnpm-workspace.yaml`
   - `tsconfig.base.json` (shared TS config)
   - `.gitignore` (node_modules, .env, .next, dist, etc.)
   - `.env.example` listing every env var per docs/09 §9.2 — values blank
   - `README.md` at the repo root pointing at `/README.md` (the user's start-here doc)
   - `.cursorrules` already exists at the root — do NOT modify it
   - Configure pnpm workspace TypeScript path aliases so we can import:
     `@coinfrenzy/core`, `@coinfrenzy/db`, `@coinfrenzy/ui`, `@coinfrenzy/config`

9. **Tooling setup**:
   - ESLint with TypeScript + React + Next.js plugins
   - Prettier
   - Husky + lint-staged for pre-commit hooks (typecheck + lint on staged files)
   - GitHub Actions workflow file at `.github/workflows/ci.yml` that runs
     typecheck, lint, and test on every push (it'll be no-op for now since
     there are no tests yet)

10. **Verify**:
    - `pnpm install` runs clean
    - `pnpm typecheck` passes (with empty placeholder files)
    - `pnpm lint` passes
    - `pnpm --filter web dev` starts Next.js dev server successfully (just shows a Hello World on the placeholder home page)

## Constraints

- DO NOT install any dependencies beyond what's needed for the scaffold.
  We'll add things as prompts call for them.
- DO NOT create any actual business logic in the placeholder folders.
  Their content should be `// Will be implemented in prompt NN` comments
  and stub exports.
- DO NOT customize Tailwind beyond the shadcn/ui defaults yet — brand
  customization happens in prompt 04.
- DO NOT create database tables — that's prompt 02.
- DO follow the file naming conventions from `.cursorrules` (kebab-case
  for files, PascalCase for React components).

## When done

End with the standard "Done" report per `.cursorrules`. Specifically
list every folder created and confirm:
- `pnpm install` succeeded
- `pnpm typecheck` passes
- `pnpm lint` passes
- `pnpm --filter web dev` starts and serves a page at localhost:3000

Then tell the user to message Claude with: "Prompt 01 done — here's
Cursor's report: [paste your report]". Claude will verify and approve
moving to prompt 02.
