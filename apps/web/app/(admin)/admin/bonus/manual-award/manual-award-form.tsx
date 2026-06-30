'use client'

import * as React from 'react'
import {
  CheckCircle2,
  Gift,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Ticket,
  User,
  X,
  Zap,
} from 'lucide-react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Input } from '@coinfrenzy/ui/primitives/input'
import { Label } from '@coinfrenzy/ui/primitives/label'

import { formatCoins } from '@/lib/format'

/**
 * Manual award — the operator-side equivalent of the on-card
 * "Send funds" flow, but built for the "player after player" cadence:
 *   1. Search a player by email / username / UUID.
 *   2. Confirm it's the right person via a compact card.
 *   3. Pick a bonus template (visual cards with award + playthrough).
 *   4. Optional reason; submit; auto-clears the template+reason so the
 *      next award can go out fast (player stays selected).
 */

export interface Template {
  id: string
  slug: string
  displayName: string
  bonusType: string
  awardSc: string // minor units, stringified
  awardGc: string
  playthroughMultiplier: string
  /** UI category — purchase / gift / signup code / free code. */
  category: 'purchase' | 'player_gift' | 'promo_code_signup' | 'promo_code_free'
}

interface PlayerHit {
  id: string
  email: string
  username: string | null
  displayName: string | null
  kycLevel: number
  status: string
}

interface ResultBanner {
  ok: boolean
  message: string
}

export function ManualAwardForm({ templates }: { templates: Template[] }) {
  const [selectedPlayer, setSelectedPlayer] = React.useState<PlayerHit | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string | null>(null)
  const [reason, setReason] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [result, setResult] = React.useState<ResultBanner | null>(null)
  const [categoryFilter, setCategoryFilter] = React.useState<Template['category'] | 'all'>('all')

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null

  const filtered = templates.filter(
    (t) => categoryFilter === 'all' || t.category === categoryFilter,
  )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedPlayer || !selectedTemplate) return
    setSubmitting(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/bonus/manual-award', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          bonusId: selectedTemplate.id,
          playerId: selectedPlayer.id,
          reason: reason.trim() || null,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        reason?: string
        awardId?: string
        status?: string
      }
      if (!res.ok) {
        setResult({ ok: false, message: body.reason ?? body.error ?? `Failed (${res.status})` })
      } else {
        const who = playerDisplayLabel(selectedPlayer)
        setResult({
          ok: true,
          message: `Sent ${selectedTemplate.displayName} to ${who} — status ${body.status ?? 'awarded'}.`,
        })
        setSelectedTemplateId(null)
        setReason('')
      }
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'Network error' })
    } finally {
      setSubmitting(false)
    }
  }

  function startOver() {
    setSelectedPlayer(null)
    setSelectedTemplateId(null)
    setReason('')
    setResult(null)
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* Step 1 — find a player */}
      <section className="rounded-lg border bg-card">
        <header className="border-b px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">Step 1</p>
          <h2 className="text-base font-medium text-ink-secondary">Find a player</h2>
        </header>
        <div className="p-5">
          {selectedPlayer ? (
            <SelectedPlayerCard player={selectedPlayer} onClear={() => setSelectedPlayer(null)} />
          ) : (
            <PlayerSearch onPick={setSelectedPlayer} />
          )}
        </div>
      </section>

      {/* Step 2 — pick a template */}
      <section
        className={`rounded-lg border bg-card transition-opacity ${
          selectedPlayer ? '' : 'pointer-events-none opacity-50'
        }`}
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">Step 2</p>
            <h2 className="text-base font-medium text-foreground">Pick a bonus</h2>
          </div>
          <CategoryTabs value={categoryFilter} onChange={setCategoryFilter} />
        </header>
        <div className="max-h-[480px] overflow-y-auto p-5">
          {filtered.length === 0 ? (
            <p className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              No active bonus templates in this category. Create one in{' '}
              <a href="/admin/bonus/templates" className="text-foreground underline">
                Bonus templates
              </a>
              .
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  selected={selectedTemplateId === t.id}
                  onSelect={() => setSelectedTemplateId(t.id)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Step 3 — reason + submit */}
      <section
        className={`rounded-lg border bg-card transition-opacity ${
          selectedPlayer && selectedTemplate ? '' : 'pointer-events-none opacity-50'
        }`}
      >
        <header className="border-b px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">Step 3</p>
          <h2 className="text-base font-medium text-foreground">Confirm &amp; send</h2>
        </header>
        <div className="space-y-4 p-5">
          <div className="space-y-1">
            <Label htmlFor="reason">Reason (audit-logged, optional)</Label>
            <textarea
              id="reason"
              className="border-input bg-background min-h-[64px] w-full rounded-md border px-3 py-2 text-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional — visible in audit log, e.g. 'Loss-back for $4.2k weekly net loss'"
            />
          </div>

          {selectedTemplate && selectedPlayer && (
            <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">{selectedTemplate.displayName}</span>{' '}
                · {formatCoins(selectedTemplate.awardSc)} SC ·{' '}
                {formatCoins(selectedTemplate.awardGc)} GC ·{' '}
                {Number(selectedTemplate.playthroughMultiplier).toFixed(2)}× playthrough
              </p>
              <p className="mt-1">
                Sending to{' '}
                <span className="font-medium text-foreground">
                  {playerDisplayLabel(selectedPlayer)}
                </span>{' '}
                ({selectedPlayer.email}).
              </p>
            </div>
          )}

          {result && (
            <div
              className={
                'flex items-start gap-2 rounded-md px-3 py-2 text-sm ' +
                (result.ok
                  ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
                  : 'border border-destructive/30 bg-destructive/10 text-destructive')
              }
            >
              {result.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <X className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <p>{result.message}</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={startOver}>
              Start over
            </Button>
            <Button type="submit" disabled={submitting || !selectedPlayer || !selectedTemplate}>
              {submitting ? (
                'Sending…'
              ) : (
                <>
                  <Zap className="h-4 w-4" /> Send bonus
                </>
              )}
            </Button>
          </div>
        </div>
      </section>
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/* Player search                                                              */
/* -------------------------------------------------------------------------- */

function PlayerSearch({ onPick }: { onPick: (p: PlayerHit) => void }) {
  const [query, setQuery] = React.useState('')
  const [hits, setHits] = React.useState<PlayerHit[]>([])
  const [loading, setLoading] = React.useState(false)
  const [touched, setTouched] = React.useState(false)
  const debounceRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current)
    }
    if (query.trim().length < 2) {
      setHits([])
      return
    }
    setLoading(true)
    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/players/search?q=${encodeURIComponent(query.trim())}`)
        const body = (await res.json().catch(() => ({}))) as { results?: PlayerHit[] }
        setHits(body.results ?? [])
      } finally {
        setLoading(false)
        setTouched(true)
      }
    }, 200)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [query])

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by email, username, or player ID"
          className="pl-9"
        />
      </div>
      {query.trim().length >= 2 && (
        <div className="max-h-64 overflow-y-auto rounded-md border bg-popover">
          {loading && <p className="p-3 text-center text-xs text-muted-foreground">Searching…</p>}
          {!loading && hits.length === 0 && touched && (
            <p className="p-3 text-center text-xs text-muted-foreground">
              No players match &ldquo;{query.trim()}&rdquo;.
            </p>
          )}
          {!loading &&
            hits.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p)}
                className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{playerDisplayLabel(p)}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                  <KycBadge level={p.kycLevel} />
                  <StatusPill status={p.status} />
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

function SelectedPlayerCard({ player, onClear }: { player: PlayerHit; onClear: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-foreground">
          <User className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{playerDisplayLabel(player)}</p>
          <p className="truncate text-xs text-muted-foreground">{player.email}</p>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">{player.id}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <KycBadge level={player.kycLevel} />
        <StatusPill status={player.status} />
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Change
        </Button>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Category tabs + template cards                                             */
/* -------------------------------------------------------------------------- */

const CATEGORY_META: Record<Template['category'], { label: string; icon: typeof Gift }> = {
  purchase: { label: 'Purchase', icon: ShoppingCart },
  player_gift: { label: 'Gift', icon: Sparkles },
  promo_code_signup: { label: 'Signup code', icon: Ticket },
  promo_code_free: { label: 'Free code', icon: Gift },
}

function CategoryTabs({
  value,
  onChange,
}: {
  value: Template['category'] | 'all'
  onChange: (v: Template['category'] | 'all') => void
}) {
  const tabs: { id: Template['category'] | 'all'; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'player_gift', label: 'Gifts' },
    { id: 'purchase', label: 'Purchase' },
    { id: 'promo_code_signup', label: 'Signup codes' },
    { id: 'promo_code_free', label: 'Free codes' },
  ]
  return (
    <div className="inline-flex rounded-md bg-muted p-0.5 text-xs">
      {tabs.map((t) => {
        const active = value === t.id
        return (
          <button
            type="button"
            key={t.id}
            onClick={() => onChange(t.id)}
            className={
              'rounded px-2.5 py-1 transition-colors ' +
              (active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground')
            }
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: Template
  selected: boolean
  onSelect: () => void
}) {
  const Icon = CATEGORY_META[template.category].icon
  const sc = formatCoins(template.awardSc)
  const gc = formatCoins(template.awardGc)
  const isFreeCode = template.category === 'promo_code_free'
  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        'flex flex-col items-stretch gap-2 rounded-md border p-4 text-left transition-colors ' +
        (selected
          ? 'border-yellow-500/70 bg-yellow-500/10'
          : 'border-border hover:border-yellow-400/50 hover:bg-yellow-500/5')
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={
              'flex h-7 w-7 items-center justify-center rounded-md ' +
              (selected ? 'bg-yellow-500/20 text-yellow-400' : 'bg-muted text-muted-foreground')
            }
          >
            <Icon className="h-4 w-4" />
          </span>
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {CATEGORY_META[template.category].label}
          </span>
        </div>
        {selected && <CheckCircle2 className="h-4 w-4 text-yellow-400" />}
      </div>
      <p className="text-sm font-medium leading-tight">{template.displayName}</p>
      <p className="font-mono text-[10px] text-muted-foreground">{template.slug}</p>
      <div className="mt-1 flex items-end justify-between">
        <div>
          <p className="text-base font-semibold tabular-nums">{sc} SC</p>
          <p className="text-xs text-muted-foreground tabular-nums">{gc} GC</p>
        </div>
        <div className="text-right text-[11px] text-muted-foreground">
          <p className="font-mono">{Number(template.playthroughMultiplier).toFixed(1)}×</p>
          <p>playthrough</p>
        </div>
      </div>
      {isFreeCode && (
        <p className="mt-1 rounded bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
          Manual award bypasses the code redemption flow.
        </p>
      )}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

function KycBadge({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      <ShieldCheck className="h-3 w-3" /> L{level}
    </span>
  )
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'active'
      ? 'bg-emerald-500/10 text-emerald-600'
      : status === 'suspended' || status === 'banned'
        ? 'bg-destructive/10 text-destructive'
        : 'bg-muted text-muted-foreground'
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] capitalize ${tone}`}>{status}</span>
  )
}

function playerDisplayLabel(p: PlayerHit): string {
  return p.displayName || p.username || p.email
}
