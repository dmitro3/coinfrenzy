'use client'

import * as React from 'react'
import { AlertTriangle, ChevronRight, HelpCircle, Info } from 'lucide-react'

import type { Vendor } from '@coinfrenzy/config'
import {
  IntegrationHealthTile,
  type IntegrationHealthState,
} from '@coinfrenzy/ui/admin/display/IntegrationHealthTile'

import type { IntegrityFrame, IntegrityVendorTile, IntegrityWebhookQueueBucket } from './_snapshot'

const VENDOR_LABEL: Record<Vendor, string> = {
  finix: 'Finix (payments)',
  alea: 'Alea (games)',
  footprint: 'Footprint (KYC)',
  radar: 'Radar (geo + fraud)',
  sendgrid: 'SendGrid (email)',
  twilio: 'Twilio (SMS)',
  easyscam: 'EasyScam (AMOE)',
}

const STATUS_COPY: Record<'green' | 'yellow' | 'red' | 'unknown' | 'mock', string> = {
  green: 'Healthy',
  yellow: 'Degraded',
  red: 'Down',
  unknown: 'No traffic yet',
  mock: 'Mock mode',
}

export function IntegrityClient({ initialFrame }: { initialFrame: IntegrityFrame }) {
  const [frame, setFrame] = React.useState<IntegrityFrame>(initialFrame)
  const [connected, setConnected] = React.useState<boolean>(false)
  const [showAbout, setShowAbout] = React.useState<boolean>(false)

  React.useEffect(() => {
    const source = new EventSource('/api/admin/integrity/stream')
    source.onopen = () => setConnected(true)
    source.onerror = () => setConnected(false)
    source.onmessage = (e) => {
      try {
        const next = JSON.parse(e.data) as IntegrityFrame
        setFrame(next)
      } catch {
        // ignore non-JSON heartbeat lines
      }
    }
    return () => {
      source.close()
    }
  }, [])

  const anyMock = frame.vendors.some((v) => v.mode === 'mock')
  const anyDown = frame.vendors.some((v) => v.mode !== 'mock' && v.status === 'red')
  const anyDegraded = frame.vendors.some((v) => v.mode !== 'mock' && v.status === 'yellow')

  return (
    <div className="space-y-6">
      {/* Stream + actions row */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-ink-tertiary">
        <div className="flex items-center gap-3">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              connected ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
            aria-hidden
          />
          <span>{connected ? 'Live stream connected' : 'Stream reconnecting…'}</span>
          <span className="font-mono">last update: {new Date(frame.ts).toLocaleTimeString()}</span>
        </div>
        <button
          type="button"
          onClick={() => setShowAbout((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md border border-line-subtle px-2 py-1 text-ink-secondary hover:bg-surface-hover"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          About this page
        </button>
      </div>

      {showAbout ? <AboutPanel /> : null}

      {/* Top banners */}
      {anyMock ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>Mock mode active.</strong> One or more vendor adapters are running off
            in-process mocks. Flip the corresponding <code className="font-mono">USE_MOCK_*</code>{' '}
            flag in Doppler to <code className="font-mono">false</code> when ready to go live.
          </div>
        </div>
      ) : null}
      {anyDown ? (
        <div className="flex items-start gap-2 rounded-md border border-red-300/60 bg-red-50 px-4 py-3 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>Vendor down.</strong> At least one live integration has tripped the failure
            threshold. Check the red tile below and the vendor&apos;s own status page.
          </div>
        </div>
      ) : null}
      {!anyDown && anyDegraded ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>Vendor degraded.</strong> Elevated error rate or stale success on a live
            integration. Watch the tile — auto-recovers when traffic returns.
          </div>
        </div>
      ) : null}

      {/* Vendor tiles */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-tertiary">
          Vendor tiles
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {frame.vendors.map((v) => (
            <VendorCard key={v.vendor} v={v} />
          ))}
        </div>
      </section>

      {/* Webhook queue */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-tertiary">
          Webhook queue
        </h2>
        <WebhookQueuePanel
          total={frame.pendingWebhooks.total}
          buckets={frame.pendingWebhooks.buckets}
        />
      </section>

      {/* AML review queue */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-tertiary">
          KYC / AML review queue
        </h2>
        <AmlPanel open={frame.amlReviewQueue.open} oldest={frame.amlReviewQueue.oldestOpenedAt} />
      </section>

      {/* Alea reconciliation */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-tertiary">
          Alea round reconciliation
        </h2>
        <AleaReconPanel
          openFindings={frame.aleaReconciliation.openFindings}
          openCritical={frame.aleaReconciliation.openCritical}
          lastRunStartedAt={frame.aleaReconciliation.lastRunStartedAt}
        />
      </section>

      {/* Vendor mode flags */}
      <details className="rounded-md border border-line-subtle bg-surface/60 p-3 text-xs text-ink-tertiary">
        <summary className="cursor-pointer text-sm font-medium text-ink-primary">
          Vendor mode flags
        </summary>
        <table className="mt-3 w-full table-fixed text-left font-mono">
          <thead>
            <tr>
              <th className="w-1/3 font-semibold">Vendor</th>
              <th className="w-1/3 font-semibold">Mode</th>
              <th className="w-1/3 font-semibold">Doppler flag</th>
            </tr>
          </thead>
          <tbody>
            {frame.vendors.map((v) => (
              <tr key={v.vendor}>
                <td>{v.vendor}</td>
                <td className={v.mode === 'mock' ? 'text-amber-600' : 'text-emerald-600'}>
                  {v.mode}
                </td>
                <td className="text-ink-tertiary">USE_MOCK_{v.vendor.toUpperCase()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )

  function AboutPanel() {
    return (
      <div className="rounded-md border border-line-subtle bg-surface/60 px-4 py-3 text-sm text-ink-secondary">
        <p className="font-medium text-ink-primary">What is this page?</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>Vendor tiles</strong> roll up the last hour of webhook traffic per provider.{' '}
            <span className="text-emerald-600">Green</span> = healthy,{' '}
            <span className="text-amber-600">yellow</span> = degraded (5m+ since last success or
            &gt;1% errors), <span className="text-red-600">red</span> = down (3+ consecutive
            failures or 30m+ since last success), <span className="text-amber-600">mock</span> =
            running off an in-process mock; not a live integration.
          </li>
          <li>
            <strong>Webhook queue</strong> is the count of <code>pending_webhooks</code> rows still
            in <code>received</code> / <code>processing</code> / <code>failed</code>. A non-zero
            number after a few minutes means dispatch is backed up — check the worker.
          </li>
          <li>
            <strong>KYC / AML review queue</strong> is the count of open Footprint watch-list hits
            that need manual cashier review before redemption can proceed.
          </li>
          <li>
            <strong>Tiles auto-refresh every 30s</strong> via SSE. Hourly counters reset on the :05
            cron — values you see are always within the last 60 minutes.
          </li>
        </ul>
      </div>
    )
  }
}

function VendorCard({ v }: { v: IntegrityVendorTile }) {
  const state: IntegrationHealthState =
    v.mode === 'mock' ? 'mock' : (v.status as IntegrationHealthState)
  const totalEvents = v.successCount1h + v.errorCount1h
  const successRate =
    totalEvents > 0 ? Math.round((v.successCount1h / totalEvents) * 1000) / 10 : null
  return (
    <div className="space-y-2">
      <IntegrationHealthTile
        name={VENDOR_LABEL[v.vendor]}
        state={state}
        lastSeenAt={v.lastSeenAt}
        errorCount1h={v.errorCount1h}
      />
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-md border border-line-subtle bg-card/40 px-3 py-2 text-[11px] text-ink-tertiary">
        <dt>State</dt>
        <dd className="text-right text-ink-secondary">{STATUS_COPY[state]}</dd>
        <dt>Success / err (1h)</dt>
        <dd className="text-right font-mono text-ink-secondary">
          {v.successCount1h.toLocaleString()} / {v.errorCount1h.toLocaleString()}
          {successRate != null ? (
            <span className="ml-1 text-ink-tertiary">({successRate}%)</span>
          ) : null}
        </dd>
        <dt>Consecutive fails</dt>
        <dd
          className={
            'text-right font-mono ' +
            (v.consecutiveFailures >= 3
              ? 'text-red-600'
              : v.consecutiveFailures > 0
                ? 'text-amber-600'
                : 'text-ink-secondary')
          }
        >
          {v.consecutiveFailures}
        </dd>
        <dt>p99 latency (1h)</dt>
        <dd className="text-right font-mono text-ink-secondary">
          {v.p99LatencyMs1h != null ? `${v.p99LatencyMs1h} ms` : '—'}
        </dd>
        <dt>Last failure</dt>
        <dd className="text-right font-mono text-ink-secondary" title={v.lastFailureAt ?? ''}>
          {v.lastFailureAt ? formatRelative(v.lastFailureAt) : 'never'}
        </dd>
      </dl>
    </div>
  )
}

function WebhookQueuePanel({
  total,
  buckets,
}: {
  total: number
  buckets: IntegrityWebhookQueueBucket[]
}) {
  if (buckets.length === 0) {
    return (
      <div className="rounded-md border border-line-subtle bg-card/60 px-4 py-3 text-sm text-ink-secondary">
        <span className="text-ink-tertiary">Pending webhooks: </span>
        <span className="font-mono font-medium text-ink-primary">0</span>
        <span className="ml-2 text-ink-tertiary">— dispatch is keeping up.</span>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <div className="rounded-md border border-line-subtle bg-card/60 px-4 py-3 text-sm">
        <span className="text-ink-tertiary">Pending webhooks: </span>
        <span
          className={'font-mono font-medium ' + (total > 0 ? 'text-amber-600' : 'text-ink-primary')}
        >
          {total.toLocaleString()}
        </span>
      </div>
      <div className="overflow-hidden rounded-md border border-line-subtle">
        <table className="w-full text-xs">
          <thead className="bg-surface/60 text-ink-tertiary">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Provider</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Count</th>
              <th className="px-3 py-2 text-right font-medium">Oldest waiting</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={`${b.provider}:${b.status}`} className="border-t border-line-subtle">
                <td className="px-3 py-1.5 font-mono text-ink-secondary">{b.provider}</td>
                <td className="px-3 py-1.5">
                  <span
                    className={
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ' +
                      (b.status === 'failed'
                        ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                        : b.status === 'processing'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                          : 'bg-surface text-ink-secondary')
                    }
                  >
                    {b.status}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right font-mono">{b.count.toLocaleString()}</td>
                <td
                  className="px-3 py-1.5 text-right text-ink-tertiary"
                  title={b.oldestReceivedAt ?? ''}
                >
                  {b.oldestReceivedAt ? formatRelative(b.oldestReceivedAt) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AleaReconPanel({
  openFindings,
  openCritical,
  lastRunStartedAt,
}: {
  openFindings: number
  openCritical: number
  lastRunStartedAt: string | null
}) {
  const tone = openCritical > 0 ? 'critical' : openFindings > 0 ? 'warn' : 'ok'
  const toneClass =
    tone === 'critical' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-ink-primary'
  return (
    <div className="flex items-center justify-between rounded-md border border-line-subtle bg-card/60 px-4 py-3 text-sm">
      <div className="flex items-center gap-4">
        <div>
          <span className="text-ink-tertiary">Open findings: </span>
          <span className={'font-mono font-medium ' + toneClass}>
            {openFindings.toLocaleString()}
          </span>
        </div>
        <div>
          <span className="text-ink-tertiary">Critical: </span>
          <span
            className={
              'font-mono font-medium ' + (openCritical > 0 ? 'text-red-600' : 'text-ink-primary')
            }
          >
            {openCritical.toLocaleString()}
          </span>
        </div>
        {lastRunStartedAt ? (
          <span className="text-xs text-ink-tertiary" title={lastRunStartedAt}>
            last run: {formatRelative(lastRunStartedAt)}
          </span>
        ) : (
          <span className="text-xs text-ink-tertiary">no runs yet</span>
        )}
      </div>
      <a
        href="/admin/integrity/alea"
        className="inline-flex items-center gap-1 text-xs font-medium text-ink-primary hover:underline"
      >
        Open findings list
        <ChevronRight className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}

function AmlPanel({ open, oldest }: { open: number; oldest: string | null }) {
  const tone = open === 0 ? 'ok' : 'warn'
  return (
    <div className="flex items-center justify-between rounded-md border border-line-subtle bg-card/60 px-4 py-3 text-sm">
      <div>
        <span className="text-ink-tertiary">Open AML escalations: </span>
        <span
          className={
            'font-mono font-medium ' + (tone === 'ok' ? 'text-ink-primary' : 'text-amber-600')
          }
        >
          {open.toLocaleString()}
        </span>
        {oldest ? (
          <span className="ml-3 text-xs text-ink-tertiary" title={oldest}>
            oldest: {formatRelative(oldest)}
          </span>
        ) : null}
      </div>
      <a
        href="/admin/redemptions"
        className="inline-flex items-center gap-1 text-xs font-medium text-ink-primary hover:underline"
      >
        Open cashier review
        <ChevronRight className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'never'
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 60 * 60_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 24 * 60 * 60_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}
