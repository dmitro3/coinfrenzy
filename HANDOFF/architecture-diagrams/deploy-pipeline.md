# Deploy Pipeline

How code moves from a local branch to production.

---

## End-to-end deploy

```mermaid
flowchart TD
    Dev[Developer · git push] --> PR[Open PR against main]
    PR --> CI[GitHub Actions · ci.yml<br/>typecheck · lint · test]
    PR --> VP[Vercel · preview deploy]
    CI -->|pass| Review[PR review]
    VP --> Review
    Review -->|merge| Main[main branch]
    Main --> DepWeb[deploy.yml · deploy-web]
    Main --> DepWorker[deploy.yml · deploy-worker]
    DepWeb --> VercelProd[Vercel production]
    DepWorker --> FlyProd[Fly.io rolling deploy]
    Main -.|if schema changes| Migrate[db-migrate.yml · manual, dry-run default]
    Migrate -->|approve + run| Neon[Neon production branch]
    VercelProd --> Live[Live on coinfrenzy.com]
    FlyProd --> Live2[Live worker on Fly]
```

---

## Migration workflow

```mermaid
sequenceDiagram
    autonumber
    actor Dev
    participant GH as GitHub Actions
    participant Runner as migrate.ts
    participant DB as Neon

    Dev->>GH: Run db-migrate.yml<br/>dry_run = true
    GH->>Runner: pnpm db:migrate:status
    Runner->>DB: SELECT name FROM _app_migrations
    DB-->>Runner: applied
    Runner-->>GH: pending list
    GH-->>Dev: pending list

    Note over Dev,DB: Dev reviews · sanity check
    Dev->>GH: Re-run db-migrate.yml<br/>dry_run = false
    GH->>Runner: pnpm db:migrate:ci
    Runner->>DB: BEGIN
    loop pending migrations (lex-sorted)
        Runner->>DB: read 00NN_*.sql
        Runner->>DB: execute SQL
        Runner->>DB: INSERT _app_migrations (name, applied_at)
    end
    Runner->>DB: COMMIT
    Runner-->>GH: ok
```

---

## Rollback

```mermaid
flowchart TD
    Bad[Bad deploy detected] --> Sev{Sev?}
    Sev -->|web bug| W[Vercel · Deployments tab · Promote previous]
    Sev -->|worker bug| F["fly releases · fly releases rollback <v>"]
    Sev -->|migration regret| Migration[Code rollback first · forward-only DB]
    Migration --> NewMig[Write a reversing migration if breaking]
    W --> Verify[Smoke test · Sentry · Pusher tick]
    F --> Verify
    NewMig --> Verify
```

---

## Secrets propagation

```mermaid
flowchart LR
    Doppler[Doppler dev/staging/prod] -->|Vercel integration| Vercel
    Doppler -->|"doppler run -- flyctl secrets import"| Fly
    Doppler -.|manual mirror, set per key| GH[GitHub Actions secrets]
    Vercel --> WebRuntime[apps/web runtime env]
    Fly --> WorkerRuntime[apps/worker runtime env]
    GH --> CI[CI/CD pipelines]
```

---

## Promotion checklist

```mermaid
flowchart LR
    A[PR ready] --> B[CI pass]
    B --> C[Preview deploy reviewed]
    C --> D{Schema changes?}
    D -->|no| E[Merge]
    D -->|yes| F[Dry-run migrations on staging]
    F --> G[Code merged]
    G --> H[Auto-deploy fires]
    H --> I[Run db-migrate workflow with apply]
    I --> J[Smoke check /admin and player flow]
    J --> K[Done]
    E --> H
```
