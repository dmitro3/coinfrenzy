# Runbook · Incident Response

What to do when production is broken. Pair with
`/runbooks/incident_response.md` at the repo root for the pre-handoff
version of this playbook.

---

## Severity classification

| Sev       | Definition                                                                                          | Page on-call?         | Status page?              |
| --------- | --------------------------------------------------------------------------------------------------- | --------------------- | ------------------------- |
| **Sev 1** | Production down, money at risk, regulatory exposure, security breach                                | **Yes — immediately** | Post incident immediately |
| **Sev 2** | Significant feature broken with no money risk (lobby broken, payments degraded, mass auth failures) | **Yes**               | Post if user-visible      |
| **Sev 3** | Minor feature broken, narrow blast radius                                                           | Slack notification    | Optional                  |
| **Sev 4** | Cosmetic only                                                                                       | Backlog ticket        | No                        |

When in doubt, escalate one level higher than your first instinct.

---

## First 5 minutes (any sev)

### 1. Acknowledge

- PagerDuty: acknowledge the page.
- Post in `#incidents` Slack: `Sev <N>: <one line>. I'm the IC.`
- Set yourself as Incident Commander (IC) until handoff or resolution.

### 2. Gather signal

Quick checks in parallel:

```
Sentry    → release tag of recent deploys, error spike?
Axiom     → log volume, error log?
Grafana   → latency dashboards, anything red?
PagerDuty → any other alerts firing?
Statuspage → any vendor incident?
```

Cmd-line:

```bash
# Worker liveness
flyctl status --app coinfrenzy-worker
flyctl logs --app coinfrenzy-worker | tail -100

# Web (Vercel) → use dashboard
# Database (Neon) → dashboard "Operations" tab

# Webhook intake
psql "$DATABASE_URL_DIRECT" -c "
  SELECT vendor, status, count(*)
  FROM pending_webhooks
  WHERE received_at > now() - interval '15 minutes'
  GROUP BY 1, 2 ORDER BY 1, 2;"
```

### 3. Decide

- Is this a **recent deploy** issue? → `runbooks/rollback.md`.
- Is this a **vendor outage**? → Check vendor status page; if mock-
  mode flip is an option (e.g. SendGrid down → temporarily disable
  CRM sends), do it.
- Is this **data corruption**? → Pause writes via maintenance flag (if
  available); start root cause; consider Neon PITR.
- Is this **abuse / fraud**? → Block at the WAF / Cloudflare layer;
  escalate to security.

---

## Sev 1 playbook

### Communicate up

- Page founder via configured channel.
- Open a Statuspage incident: "Investigating <component>".
- Update Statuspage every 30 min minimum.

### Stop the bleeding

In rough order of safety:

1. **Rollback** if recent deploy → `runbooks/rollback.md`.
2. **Pause writes** if data corruption suspected:
   - Flip the maintenance flag (if implemented).
   - Or rate-limit `/api/player/*` and `/api/admin/*` drastically.
3. **Block source** if abuse:
   - Cloudflare WAF rule.
   - Rate-limit per IP via Upstash.
4. **Disable feature** if a specific surface is broken:
   - Set the appropriate feature flag in Doppler.
   - Redeploy.

### Stabilise

- Confirm root cause (or hypothesis).
- Build a fix (or ensure the rollback is sufficient).
- Confirm rollout.

### Recovery

- Re-enable disabled features.
- Replay missed webhooks if applicable:
  ```bash
  pnpm -F @coinfrenzy/worker cutover:replay-window
  ```
- Reconcile balances:
  ```bash
  pnpm -F @coinfrenzy/worker cutover:balance-compare
  ```
- Resolve the Statuspage incident.

### Post-mortem

Within 48 hours, write a post-mortem covering:

- Timeline.
- Root cause.
- Why detection didn't catch it earlier.
- Why mitigation took the time it did.
- Action items (with owners + dates).

Post-mortem is blameless. The system failed, not the person.

---

## Sev 2 playbook

Same shape as Sev 1, fewer comms requirements:

- Acknowledge in Slack within 5 minutes.
- Decide & act within 30 minutes.
- Resolve or escalate within 2 hours.
- Statuspage if user-visible.
- Post-mortem optional but recommended.

---

## Sev 3 / Sev 4

- Open a ticket.
- Fix during normal hours.
- No post-mortem needed.

---

## Communication templates

### Statuspage — investigating

> We're investigating reports of <symptom> affecting <component>.
> Players may experience <impact>. Updates every 30 minutes.

### Statuspage — identified

> We've identified the cause as <one-line>. We're working on a fix
> and expect resolution within <ETA>.

### Statuspage — monitoring

> A fix has been deployed. We're monitoring to confirm the issue is
> resolved.

### Statuspage — resolved

> The incident is resolved. Players should no longer experience
> <impact>. A post-mortem will be posted within 48 hours.

### Internal — handoff

> I'm handing off this incident to <name>. Summary so far:
>
> - Sev: <N>
> - Started: <time>
> - Status: <investigating / mitigated / resolved>
> - Working hypothesis: <one-line>
> - Next steps: <one-line>

---

## Useful commands

```bash
# Tail worker logs
flyctl logs --app coinfrenzy-worker

# Recent webhook receipts
psql "$DATABASE_URL_DIRECT" -c "
  SELECT vendor, event_type, status, received_at
  FROM pending_webhooks
  ORDER BY received_at DESC LIMIT 50;"

# Recent ledger writes (sanity check the ledger is alive)
psql "$DATABASE_URL_DIRECT" -c "
  SELECT created_at, source, currency, count(*)
  FROM ledger_entries
  WHERE created_at > now() - interval '5 minutes'
  GROUP BY 1, 2, 3 ORDER BY 1 DESC;"

# Recent compliance flags
psql "$DATABASE_URL_DIRECT" -c "
  SELECT created_at, kind, severity, summary
  FROM compliance_flags
  ORDER BY created_at DESC LIMIT 20;"

# Force a wallet reconciliation now
# (also runs nightly automatically)
flyctl ssh console --app coinfrenzy-worker --command "node -e 'await fetch(\"http://localhost:3030/api/inngest?fnId=reconcile-wallets&trigger=manual\")'"
```

---

## After-action

- Update the Statuspage incident.
- Write the post-mortem (sev 1 / sev 2).
- Add action items to `14-recommended-next-work.md`.
- Update this runbook if you found a gap.
- Sleep.
