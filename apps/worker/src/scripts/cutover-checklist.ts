/* eslint-disable no-console */
/**
 * docs/13 §7 — cutover-night checklist generator.
 *
 * Materializes a concrete, datetime-stamped runbook from the abstract
 * timeline in docs/13 §7.3. The output is a markdown file the on-call
 * team prints (or pastes into the war-room channel) for the cutover.
 *
 * Every row gets:
 *   - the wall-clock time relative to T-0
 *   - a manual checkbox
 *   - the command or admin link to invoke
 *
 * Usage:
 *   pnpm cutover:checklist --start="2026-06-15T22:00:00-04:00" [--out=runbook.md]
 *                          [--domain=coinfrenzy.com] [--admin=https://admin.coinfrenzy.com]
 *                          [--snapshot-date=YYYY-MM-DD]
 *                          [--capture-from=ISO] [--capture-to=ISO]
 *
 * If --out is omitted, prints to stdout.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

interface Args {
  start: Date
  out?: string
  domain: string
  admin: string
  snapshotDate?: string
  captureFrom?: string
  captureTo?: string
}

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string>()
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue
    const eq = arg.indexOf('=')
    if (eq === -1) continue
    flags.set(arg.slice(2, eq), arg.slice(eq + 1))
  }
  const start = flags.get('start')
  if (!start) {
    console.error('ERROR: --start=<ISO-with-offset> is required.')
    console.error('Example: --start="2026-06-15T22:00:00-04:00"')
    process.exit(2)
  }
  const startD = new Date(start)
  if (Number.isNaN(startD.getTime())) {
    console.error('ERROR: --start must be parseable as an ISO timestamp.')
    process.exit(2)
  }
  return {
    start: startD,
    out: flags.get('out'),
    domain: flags.get('domain') ?? 'coinfrenzy.com',
    admin: flags.get('admin') ?? 'https://admin.coinfrenzy.com',
    snapshotDate: flags.get('snapshot-date'),
    captureFrom: flags.get('capture-from'),
    captureTo: flags.get('capture-to'),
  }
}

function plus(start: Date, h: number, m: number): string {
  const t = new Date(start.getTime() + (h * 60 + m) * 60_000)
  return t.toISOString().replace('T', ' ').slice(0, 16) + 'Z'
}

function buildChecklist(args: Args): string {
  const { start, domain, admin } = args
  const snapshot = args.snapshotDate ?? '<snapshot-date>'
  const capFrom = args.captureFrom ?? '<dual-capture-start-ISO>'
  const capTo = args.captureTo ?? '<cutover-start-ISO>'

  const lines: string[] = []
  const push = (s: string): void => {
    lines.push(s)
  }

  push(`# CoinFrenzy Cutover Runbook — generated ${new Date().toISOString()}`)
  push('')
  push(`> Authoritative source: docs/13 §7. This document materializes the timeline`)
  push(`> for cutover starting **${start.toISOString()}**. If anything in this`)
  push(`> file disagrees with the live doc, the doc wins.`)
  push('')
  push('## Pre-cutover (T-7 days)')
  push("- [ ] Final dry run with this week's snapshot — all hard validations pass")
  push(`- [ ] Communication sent to players (maintenance window ${start.toUTCString()})`)
  push('- [ ] Hot-standby Vercel deployment ready (smoke-tested against staging DB)')
  push(`- [ ] DNS TTL for ${domain} lowered to 60 seconds (from default 3600)`)
  push('- [ ] On-call rotation set: 4 engineers on standby + 1 manager')
  push('- [ ] War room Slack channel created and pinned')
  push(`- [ ] Webhook dual-capture confirmed ON in [${admin}/migration](${admin}/migration)`)
  push('')
  push('## T-24 hours')
  push(`- [ ] Final daily snapshot pulled (date: ${snapshot}) and validated as complete`)
  push('- [ ] Final webhook routing check: are we capturing?')
  push('- [ ] Status page set to "Scheduled maintenance" with countdown')
  push('- [ ] Run `pnpm cutover:balance-compare <snapshot>` on staging — drift = 0')
  push('')
  push('## T-0 (cutover begins)')
  push('Window: estimated 4 hours.')
  push('')
  push('| Time (UTC) | Step | Action |')
  push('| --- | --- | --- |')
  push(
    `| ${plus(start, 0, 0)} | T+0:00 | [ ] Set maintenance mode on ${domain} (via Gamma) → all writes blocked |`,
  )
  push(
    `| ${plus(start, 0, 5)} | T+0:05 | [ ] Pull final Gamma snapshot (upload to R2 via admin migration UI) |`,
  )
  push(
    `| ${plus(start, 0, 15)} | T+0:15 | [ ] Begin import on production Neon: ${admin}/migration → "Start run" |`,
  )
  push(`| ${plus(start, 0, 45)} | T+0:45 | [ ] Import complete; reconciliation begins |`)
  push(
    `| ${plus(start, 1, 0)} | T+1:00 | [ ] Run hard validations: ${admin}/migration/<run-id> → "Re-run validation" |`,
  )
  push(
    `| ${plus(start, 1, 15)} | T+1:15 | [ ] Spot-check 20 random players in admin (search by gammaUserId) |`,
  )
  push(
    `| ${plus(start, 1, 30)} | T+1:30 | [ ] Replay captured webhooks: \`pnpm cutover:replay-window --from=${capFrom} --to=${capTo}\` |`,
  )
  push(
    `| ${plus(start, 1, 45)} | T+1:45 | [ ] Run reconciliation again: \`pnpm cutover:balance-compare ${snapshot} --drift-only\` |`,
  )
  push(`| ${plus(start, 2, 0)} | T+2:00 | [ ] DNS flip: ${domain} → new Vercel deployment |`)
  push(`| ${plus(start, 2, 5)} | T+2:05 | [ ] Smoke test (see below) |`)
  push(
    `| ${plus(start, 2, 15)} | T+2:15 | [ ] Open to 10% of traffic via gradual ramp (Vercel edge config) |`,
  )
  push(`| ${plus(start, 2, 30)} | T+2:30 | [ ] Open to 50% |`)
  push(`| ${plus(start, 2, 45)} | T+2:45 | [ ] Open to 100% |`)
  push(`| ${plus(start, 3, 0)} | T+3:00 | [ ] Monitor for 1 hour with all hands |`)
  push(`| ${plus(start, 4, 0)} | T+4:00 | [ ] Maintenance window ends; war room stays staffed |`)
  push('')
  push('## T+2:05 — Smoke test checklist')
  push('Before opening to traffic, EVERY box must be checked. If any fails: ABORT and rollback.')
  push('')
  push('- [ ] Test player login works')
  push('- [ ] Test player sees correct SC balance (matches snapshot)')
  push('- [ ] Test player sees full purchase history')
  push('- [ ] Test player sees full redemption history')
  push('- [ ] Test player can browse games')
  push('- [ ] Test player launches a game (Alea integration live)')
  push('- [ ] Test player places a real-money bet (verify ledger writes)')
  push('- [ ] Admin login works')
  push(`- [ ] Admin can search players (${admin}/players)`)
  push(`- [ ] Admin can see real-time dashboard (${admin}/dashboard)`)
  push(`- [ ] CRM dashboard shows current numbers (${admin}/crm)`)
  push('- [ ] Self-excluded user is blocked from login (test with one)')
  push('- [ ] Footprint webhook arrives and processes')
  push('- [ ] Finix webhook arrives and processes')
  push('- [ ] Alea webhook arrives and processes')
  push(`- [ ] Integrity dashboard shows no critical alerts (${admin}/integrity)`)
  push('')
  push('## Rollback plan')
  push('If cutover fails any validation:')
  push('')
  push(`1. DNS flips back to Gamma (60-second TTL means recovery within 1 min)`)
  push('2. Gamma maintenance mode is lifted (Gamma handles this)')
  push('3. Our captured webhooks remain captured; no harm')
  push('4. Post-mortem; fix; retry in a future window')
  push('')
  push('Players see ~5 minutes of "site is down" and then Gamma is back.')
  push('')
  push('## Post-cutover (T+24h)')
  push('- [ ] All-hands monitoring')
  push('- [ ] Hourly reconciliation checks (not nightly)')
  push('- [ ] SEV-1 in 5 minutes for any anomaly')
  push("- [ ] Daily reconciliation reports compared to Gamma's last-known totals")
  push('- [ ] Daily report on top-50 players')
  push('- [ ] Support ticket categorization for patterns')
  push('')
  push('---')
  push('')
  push('## Sign-off')
  push('| Role | Name | Time | Signature |')
  push('| --- | --- | --- | --- |')
  push('| Incident commander | | | |')
  push('| Engineering lead | | | |')
  push('| Compliance | | | |')
  push('| CEO / Founder | | | |')
  push('')
  return lines.join('\n') + '\n'
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const md = buildChecklist(args)
  if (args.out) {
    const full = resolve(process.cwd(), args.out)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, md, 'utf-8')
    console.log(`Wrote cutover checklist → ${full}`)
  } else {
    process.stdout.write(md)
  }
}

main()
