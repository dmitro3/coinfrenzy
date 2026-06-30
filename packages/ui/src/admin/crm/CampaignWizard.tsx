'use client'

import * as React from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  FlaskConical,
  Loader2,
  Mail,
  MessageSquare,
  Send,
  Smartphone,
  Bell,
  Users,
  Zap,
} from 'lucide-react'

import { Button } from '../../primitives/button'
import { Input } from '../../primitives/input'
import { cn } from '../../lib/utils'

import { SegmentBuilder, type FilterGroup } from './SegmentBuilder'
import { TestSendButton } from './TestSendButton'
import { VariablePicker, type VariablePickerVariable } from './VariablePicker'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

type Channel = 'email' | 'sms' | 'in_app'

interface SegmentOption {
  id: string
  name: string
  cachedCount: number | null
}
interface TemplateOption {
  id: string
  slug: string
  displayName: string
  subjectTemplate?: string
  bodyTemplate?: string
}
interface SamplePlayer {
  id: string
  email: string
  displayName: string | null
}

export interface CampaignConversionEventOption {
  name: string
  label: string
}

export interface CampaignWizardProps {
  segments: SegmentOption[]
  emailTemplates: TemplateOption[]
  smsTemplates: TemplateOption[]
  variables: VariablePickerVariable[]
  /** Curated list shown as autocomplete options for conversion tracking. */
  conversionEventOptions?: CampaignConversionEventOption[]
  /** Optional starter data (e.g. when cloning). */
  initial?: Partial<WizardState>
  onCreate: (input: CampaignWizardSubmit) => Promise<{ ok: boolean; error?: string; id?: string }>
}

export interface CampaignWizardSubmit {
  name: string
  description: string | null
  segmentId: string | null
  audienceTree: FilterGroup | null
  channel: Channel
  templateId: string
  scheduledFor: string | null
  conversionEvent: string | null
  abEnabled: boolean
  abSplit: number
  abTemplateId: string | null
  abWinnerCriteria: 'open_rate' | 'click_rate' | 'conversion_rate'
  throttlePerMinute: number | null
  sendWindowStart: string | null
  sendWindowEnd: string | null
  holdoutPct: number
}

interface WizardState {
  step: 1 | 2 | 3 | 4 | 5
  audienceMode: 'segment' | 'inline'
  segmentId: string | null
  inlineTree: FilterGroup
  channel: Channel
  templateId: string
  abEnabled: boolean
  abSplit: number
  abTemplateId: string | null
  abWinnerCriteria: 'open_rate' | 'click_rate' | 'conversion_rate'
  scheduleMode: 'now' | 'at'
  scheduledFor: string
  throttlePerMinute: number
  sendWindowStart: string
  sendWindowEnd: string
  holdoutPct: number
  conversionEvent: string
  name: string
  description: string
  samplePlayer: SamplePlayer | null
}

const STEPS = [
  { num: 1, label: 'Audience', Icon: Users },
  { num: 2, label: 'Channel', Icon: Mail },
  { num: 3, label: 'Content', Icon: FlaskConical },
  { num: 4, label: 'Delivery', Icon: Clock },
  { num: 5, label: 'Review', Icon: Check },
] as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CampaignWizard({
  segments,
  emailTemplates,
  smsTemplates,
  variables,
  conversionEventOptions,
  initial,
  onCreate,
}: CampaignWizardProps) {
  const [state, setState] = React.useState<WizardState>(() => ({
    step: 1,
    audienceMode: 'segment',
    segmentId: segments[0]?.id ?? null,
    inlineTree: { operator: 'AND', conditions: [] },
    channel: 'email',
    templateId: '',
    abEnabled: false,
    abSplit: 50,
    abTemplateId: null,
    abWinnerCriteria: 'open_rate',
    scheduleMode: 'now',
    scheduledFor: '',
    throttlePerMinute: 0,
    sendWindowStart: '',
    sendWindowEnd: '',
    holdoutPct: 0,
    conversionEvent: '',
    name: '',
    description: '',
    samplePlayer: null,
    ...initial,
  }))

  const [audienceCount, setAudienceCount] = React.useState<number | null>(null)
  const [audienceLoading, setAudienceLoading] = React.useState(false)

  const [creating, setCreating] = React.useState(false)
  const [createError, setCreateError] = React.useState<string | null>(null)

  const templates = state.channel === 'sms' ? smsTemplates : emailTemplates
  const selectedTemplate = templates.find((t) => t.id === state.templateId) ?? null
  const abTemplate = templates.find((t) => t.id === state.abTemplateId) ?? null

  // Resolve audience count + ensure we have a sample player for previewing.
  React.useEffect(() => {
    let cancelled = false
    async function tick() {
      setAudienceLoading(true)
      const tree = await resolveTree(state.audienceMode, state.segmentId, state.inlineTree)
      try {
        const [countRes, sampleRes] = await Promise.all([
          fetch('/api/admin/crm/segments/count', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ filterTree: tree }),
          }),
          fetch('/api/admin/crm/segments/preview', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ filterTree: tree, limit: 3 }),
          }),
        ])
        if (cancelled) return
        if (countRes.ok) {
          const j = (await countRes.json()) as { count: number }
          setAudienceCount(j.count)
        }
        if (sampleRes.ok) {
          const j = (await sampleRes.json()) as { players: SamplePlayer[] }
          if (j.players.length > 0 && !state.samplePlayer) {
            setState((s) => ({ ...s, samplePlayer: j.players[0]! }))
          }
        }
      } finally {
        if (!cancelled) setAudienceLoading(false)
      }
    }
    void tick()
    return () => {
      cancelled = true
    }
  }, [state.audienceMode, state.segmentId, state.inlineTree])

  function set<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setState((s) => ({ ...s, [key]: value }))
  }

  function go(delta: 1 | -1) {
    setState((s) => ({
      ...s,
      step: Math.max(1, Math.min(5, s.step + delta)) as 1 | 2 | 3 | 4 | 5,
    }))
  }

  async function submit() {
    if (audienceCount && audienceCount > 1000) {
      const ok = window.confirm(
        `This will send to ${audienceCount.toLocaleString()} recipients. Continue?`,
      )
      if (!ok) return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const tree = await resolveTree(state.audienceMode, state.segmentId, state.inlineTree)
      const result = await onCreate({
        name: state.name,
        description: state.description || null,
        segmentId: state.audienceMode === 'segment' ? state.segmentId : null,
        audienceTree: state.audienceMode === 'inline' ? state.inlineTree : (tree as FilterGroup),
        channel: state.channel,
        templateId: state.templateId,
        scheduledFor:
          state.scheduleMode === 'at' && state.scheduledFor
            ? new Date(state.scheduledFor).toISOString()
            : null,
        conversionEvent: state.conversionEvent || null,
        abEnabled: state.abEnabled,
        abSplit: state.abSplit,
        abTemplateId: state.abEnabled ? state.abTemplateId : null,
        abWinnerCriteria: state.abWinnerCriteria,
        throttlePerMinute: state.throttlePerMinute || null,
        sendWindowStart: state.sendWindowStart || null,
        sendWindowEnd: state.sendWindowEnd || null,
        holdoutPct: state.holdoutPct,
      })
      if (!result.ok) setCreateError(result.error ?? 'failed_to_create')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-5">
      <Stepper currentStep={state.step} />

      {state.step === 1 ? (
        <AudienceStep
          state={state}
          setState={setState}
          set={set}
          segments={segments}
          audienceCount={audienceCount}
          audienceLoading={audienceLoading}
        />
      ) : null}
      {state.step === 2 ? <ChannelStep set={set} state={state} /> : null}
      {state.step === 3 ? (
        <ContentStep state={state} set={set} templates={templates} variables={variables} />
      ) : null}
      {state.step === 4 ? (
        <DeliveryStep
          state={state}
          set={set}
          templates={templates}
          conversionEventOptions={conversionEventOptions}
        />
      ) : null}
      {state.step === 5 ? (
        <ReviewStep
          state={state}
          audienceCount={audienceCount}
          selectedTemplate={selectedTemplate}
          abTemplate={abTemplate}
          createError={createError}
          creating={creating}
          onSubmit={submit}
          set={set}
        />
      ) : null}

      <div className="flex items-center justify-between border-t border-line-subtle pt-4">
        <Button variant="outline" onClick={() => go(-1)} disabled={state.step === 1 || creating}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        {state.step < 5 ? (
          <Button onClick={() => go(1)} disabled={!stepIsComplete(state)}>
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={submit}
            disabled={creating || !state.name.trim() || !state.templateId || !audienceCount}
          >
            {creating ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-4 w-4" />
            )}
            {state.scheduleMode === 'at' ? 'Schedule send' : 'Send now'}
          </Button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

function Stepper({ currentStep }: { currentStep: number }) {
  return (
    <ol className="flex items-center gap-1">
      {STEPS.map((s, i) => {
        const active = currentStep === s.num
        const done = currentStep > s.num
        const Icon = s.Icon
        return (
          <React.Fragment key={s.num}>
            <li
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-1.5 text-xs',
                active
                  ? 'bg-violet-500/10 text-violet-300'
                  : done
                    ? 'text-emerald-400'
                    : 'text-ink-tertiary',
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold',
                  active
                    ? 'border-violet-400 bg-violet-500/20'
                    : done
                      ? 'border-emerald-500/40 bg-emerald-500/10'
                      : 'border-line-subtle',
                )}
              >
                {done ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
              </span>
              <span className="font-medium">{s.label}</span>
            </li>
            {i < STEPS.length - 1 ? <li className="h-px w-6 bg-line-subtle" /> : null}
          </React.Fragment>
        )
      })}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// Step 1 — Audience
// ---------------------------------------------------------------------------

function AudienceStep({
  state,
  setState,
  set,
  segments,
  audienceCount,
  audienceLoading,
}: {
  state: WizardState
  setState: React.Dispatch<React.SetStateAction<WizardState>>
  set: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void
  segments: SegmentOption[]
  audienceCount: number | null
  audienceLoading: boolean
}) {
  return (
    <Card title="Audience" subtitle="Define who receives this campaign.">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tab
          active={state.audienceMode === 'segment'}
          onClick={() => set('audienceMode', 'segment')}
          label="Saved segment"
        />
        <Tab
          active={state.audienceMode === 'inline'}
          onClick={() => set('audienceMode', 'inline')}
          label="Define ad-hoc"
        />
        <div className="ml-auto flex items-center gap-2 rounded-md border border-line-subtle bg-elevated px-3 py-1.5 text-xs">
          <Zap className="h-3.5 w-3.5 text-violet-400" />
          <span className="text-ink-tertiary">Audience size</span>
          <span className="font-semibold tabular-nums text-ink-primary">
            {audienceLoading ? '…' : (audienceCount?.toLocaleString() ?? '—')}
          </span>
        </div>
      </div>

      {state.audienceMode === 'segment' ? (
        <select
          value={state.segmentId ?? ''}
          onChange={(e) => set('segmentId', e.target.value || null)}
          className="h-10 w-full rounded-md border border-line-subtle bg-elevated px-3 text-sm text-ink-primary"
        >
          <option value="">Choose a segment…</option>
          {segments.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.cachedCount !== null ? ` (${s.cachedCount.toLocaleString()})` : ''}
            </option>
          ))}
        </select>
      ) : (
        <SegmentBuilder
          initialTree={state.inlineTree}
          onChange={(t) => setState((s) => ({ ...s, inlineTree: t }))}
          hideSidebar
          title="Build the audience"
        />
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Step 2 — Channel
// ---------------------------------------------------------------------------

function ChannelStep({
  state,
  set,
}: {
  state: WizardState
  set: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void
}) {
  const tiles: Array<{
    key: Channel
    label: string
    Icon: React.ComponentType<{ className?: string }>
    subtitle: string
  }> = [
    { key: 'email', label: 'Email', Icon: Mail, subtitle: 'Long-form, links, attachments' },
    { key: 'sms', label: 'SMS', Icon: Smartphone, subtitle: '160 chars, instant' },
    { key: 'in_app', label: 'In-app', Icon: Bell, subtitle: 'Renders inside the player UI' },
  ]
  return (
    <Card title="Channel" subtitle="How players will receive this campaign.">
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map((t) => {
          const active = state.channel === t.key
          const Icon = t.Icon
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => set('channel', t.key)}
              className={cn(
                'rounded-lg border p-4 text-left transition-colors',
                active
                  ? 'border-violet-500/50 bg-violet-500/5'
                  : 'border-line-subtle bg-elevated hover:bg-surface-hover',
              )}
            >
              <Icon
                className={cn('mb-2 h-5 w-5', active ? 'text-violet-400' : 'text-ink-secondary')}
              />
              <div className="text-sm font-semibold text-ink-primary">{t.label}</div>
              <div className="text-xs text-ink-tertiary">{t.subtitle}</div>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Step 3 — Content
// ---------------------------------------------------------------------------

interface RenderedPreview {
  rendered: string
  variablesMissing: string[]
  warnings: string[]
  metrics: { bytes: number; smsSegments?: number; spamScore?: number }
  player?: {
    id: string
    email: string
    displayName: string
    tierName?: string
    lifetimeSpendUsd?: string
  }
}

function ContentStep({
  state,
  set,
  templates,
  variables,
}: {
  state: WizardState
  set: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void
  templates: TemplateOption[]
  variables: VariablePickerVariable[]
}) {
  const [preview, setPreview] = React.useState<RenderedPreview | null>(null)
  const [previewIdx, setPreviewIdx] = React.useState(0)
  const [samples, setSamples] = React.useState<SamplePlayer[]>([])

  React.useEffect(() => {
    fetch('/api/admin/crm/segments/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filterTree: { operator: 'AND', conditions: [] }, limit: 3 }),
    })
      .then((r) => r.json())
      .then((j: { players: SamplePlayer[] }) => setSamples(j.players ?? []))
      .catch(() => setSamples([]))
  }, [])

  const tpl = templates.find((t) => t.id === state.templateId)
  const samplePlayer = samples[previewIdx] ?? null

  React.useEffect(() => {
    if (!tpl || !samplePlayer) {
      setPreview(null)
      return
    }
    const body =
      (tpl.bodyTemplate as string | undefined) ??
      `Subject: ${tpl.subjectTemplate ?? '—'}\n\n(Live render placeholder — fetch full template body to preview.)`
    fetch('/api/admin/crm/variable-preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        template: body,
        playerId: samplePlayer.id,
        channel: state.channel === 'in_app' ? 'email' : state.channel,
      }),
    })
      .then((r) => r.json())
      .then((j: RenderedPreview) => setPreview(j))
      .catch(() => setPreview(null))
  }, [tpl, samplePlayer, state.channel])

  return (
    <Card title="Content" subtitle="Pick the template and preview against real player data.">
      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wide text-ink-tertiary">
              Template
            </label>
            <select
              value={state.templateId}
              onChange={(e) => set('templateId', e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-line-subtle bg-elevated px-3 text-sm text-ink-primary"
            >
              <option value="">Choose a template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName} ({t.slug})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <VariablePicker
              variables={variables}
              onPick={(key) => {
                navigator.clipboard?.writeText(`{{${key}}}`).catch(() => {})
              }}
              buttonLabel="Copy variable"
            />
            <TestSendButton
              channel={state.channel === 'in_app' ? 'email' : state.channel}
              templateId={state.templateId || null}
              samplePlayerId={samplePlayer?.id ?? null}
            />
          </div>

          <div className="rounded-lg border border-line-subtle bg-elevated p-3">
            <div className="text-[10px] uppercase tracking-wide text-ink-tertiary">A/B test</div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={state.abEnabled}
                onChange={(e) => set('abEnabled', e.target.checked)}
              />
              <span className="text-xs">Enable A/B</span>
            </div>
            {state.abEnabled ? (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] uppercase text-ink-tertiary">
                      Variant B template
                    </label>
                    <select
                      value={state.abTemplateId ?? ''}
                      onChange={(e) => set('abTemplateId', e.target.value || null)}
                      className="mt-1 h-9 w-full rounded-md border border-line-subtle bg-surface px-2 text-xs"
                    >
                      <option value="">choose…</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-ink-tertiary">Split (A/B)</label>
                    <Input
                      type="number"
                      value={state.abSplit}
                      min={1}
                      max={99}
                      onChange={(e) => set('abSplit', Number(e.target.value))}
                      className="mt-1 h-9 text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase text-ink-tertiary">Winner criteria</label>
                  <select
                    value={state.abWinnerCriteria}
                    onChange={(e) =>
                      set('abWinnerCriteria', e.target.value as WizardState['abWinnerCriteria'])
                    }
                    className="mt-1 h-9 w-full rounded-md border border-line-subtle bg-surface px-2 text-xs"
                  >
                    <option value="open_rate">Open rate</option>
                    <option value="click_rate">Click rate</option>
                    <option value="conversion_rate">Conversion rate</option>
                  </select>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-line-subtle bg-elevated p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-medium text-ink-secondary">Live preview</div>
            <div className="flex items-center gap-1 text-[10px] text-ink-tertiary">
              {samples.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPreviewIdx(i)}
                  className={cn(
                    'rounded-md border px-1.5 py-0.5',
                    i === previewIdx
                      ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
                      : 'border-line-subtle text-ink-tertiary',
                  )}
                >
                  Player {i + 1}
                </button>
              ))}
            </div>
          </div>
          {preview ? (
            <>
              <div className="mb-2 text-[10px] text-ink-tertiary">
                Rendered for {preview.player?.displayName ?? preview.player?.email ?? '—'}
              </div>
              <div className="max-h-72 overflow-auto rounded-md border border-line-subtle bg-surface p-3 text-xs text-ink-primary">
                <pre className="whitespace-pre-wrap font-sans">{preview.rendered}</pre>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                <Metric label="Bytes" value={preview.metrics.bytes.toString()} />
                {preview.metrics.smsSegments !== undefined ? (
                  <Metric label="SMS segs" value={String(preview.metrics.smsSegments)} />
                ) : null}
                {preview.metrics.spamScore !== undefined ? (
                  <Metric
                    label="Spam"
                    value={`${preview.metrics.spamScore}/100`}
                    tone={preview.metrics.spamScore > 30 ? 'critical' : 'neutral'}
                  />
                ) : null}
              </div>
              {preview.warnings.length > 0 ? (
                <div className="mt-2 space-y-1 text-[10px] text-amber-400">
                  {preview.warnings.map((w, i) => (
                    <div key={i}>• {w}</div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="px-2 py-8 text-center text-xs text-ink-tertiary">
              Pick a template to preview.
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Step 4 — Delivery
// ---------------------------------------------------------------------------

function DeliveryStep({
  state,
  set,
  conversionEventOptions,
}: {
  state: WizardState
  set: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void
  templates: TemplateOption[]
  conversionEventOptions?: CampaignConversionEventOption[]
}) {
  return (
    <Card title="Delivery" subtitle="When and how to send.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Send mode">
          <select
            value={state.scheduleMode}
            onChange={(e) => set('scheduleMode', e.target.value as 'now' | 'at')}
            className="h-9 w-full rounded-md border border-line-subtle bg-elevated px-2 text-sm"
          >
            <option value="now">Send immediately on Save</option>
            <option value="at">Schedule for specific time</option>
          </select>
        </Field>
        {state.scheduleMode === 'at' ? (
          <Field label="Send at">
            <Input
              type="datetime-local"
              value={state.scheduledFor}
              onChange={(e) => set('scheduledFor', e.target.value)}
            />
          </Field>
        ) : null}
        <Field label="Throttle (max per minute)">
          <Input
            type="number"
            min={0}
            value={state.throttlePerMinute}
            onChange={(e) => set('throttlePerMinute', Number(e.target.value))}
            placeholder="0 = no throttle"
          />
        </Field>
        <Field label="Hold-out (% to never send)">
          <Input
            type="number"
            min={0}
            max={50}
            value={state.holdoutPct}
            onChange={(e) => set('holdoutPct', Number(e.target.value))}
            placeholder="0"
          />
        </Field>
        <Field label="Send window start (player local)">
          <Input
            type="time"
            value={state.sendWindowStart}
            onChange={(e) => set('sendWindowStart', e.target.value)}
          />
        </Field>
        <Field label="Send window end (player local)">
          <Input
            type="time"
            value={state.sendWindowEnd}
            onChange={(e) => set('sendWindowEnd', e.target.value)}
          />
        </Field>
        <Field label="Conversion event (optional)">
          <Input
            list="campaign-conversion-events"
            value={state.conversionEvent}
            onChange={(e) => set('conversionEvent', e.target.value)}
            placeholder="player.purchase.succeeded"
          />
          {conversionEventOptions && conversionEventOptions.length > 0 ? (
            <datalist id="campaign-conversion-events">
              {conversionEventOptions.map((e) => (
                <option key={e.name} value={e.name}>
                  {e.label}
                </option>
              ))}
            </datalist>
          ) : null}
          <p className="mt-1 text-xs text-ink-tertiary">
            We track which recipients fire this event within 7 days of receiving the campaign. Leave
            blank to track open + click only.
          </p>
        </Field>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Step 5 — Review
// ---------------------------------------------------------------------------

function ReviewStep({
  state,
  audienceCount,
  selectedTemplate,
  abTemplate,
  createError,
  creating,
  onSubmit,
  set,
}: {
  state: WizardState
  audienceCount: number | null
  selectedTemplate: TemplateOption | null
  abTemplate: TemplateOption | null
  createError: string | null
  creating: boolean
  onSubmit: () => void
  set: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void
}) {
  return (
    <Card title="Review" subtitle="Verify everything before sending.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Detail label="Name">
          <Input
            value={state.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Welcome series — week 1"
          />
        </Detail>
        <Detail label="Description">
          <Input
            value={state.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="optional"
          />
        </Detail>
        <Detail label="Audience">
          <span className="font-medium text-ink-primary">
            {audienceCount?.toLocaleString() ?? '—'} players
          </span>
        </Detail>
        <Detail label="Channel">{state.channel}</Detail>
        <Detail label="Template">{selectedTemplate?.displayName ?? '—'}</Detail>
        <Detail label="A/B">
          {state.abEnabled ? (
            <span>
              {state.abSplit}/{100 - state.abSplit} split, winner by{' '}
              {state.abWinnerCriteria.replace('_', ' ')}, B = {abTemplate?.displayName ?? '—'}
            </span>
          ) : (
            'off'
          )}
        </Detail>
        <Detail label="Send">
          {state.scheduleMode === 'at' && state.scheduledFor
            ? `at ${new Date(state.scheduledFor).toLocaleString()}`
            : 'immediately on submit'}
        </Detail>
        <Detail label="Throttle">
          {state.throttlePerMinute > 0 ? `${state.throttlePerMinute}/min` : 'no throttle'}
        </Detail>
        <Detail label="Hold-out">
          {state.holdoutPct > 0 ? `${state.holdoutPct}% never sent` : 'none'}
        </Detail>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-subtle pt-3">
        <TestSendButton
          channel={state.channel === 'in_app' ? 'email' : state.channel}
          templateId={state.templateId || null}
          samplePlayerId={state.samplePlayer?.id ?? null}
          label="Send to me first"
        />
        <Button onClick={onSubmit} disabled={creating || !state.name.trim() || !state.templateId}>
          {creating ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-1.5 h-4 w-4" />
          )}
          {state.scheduleMode === 'at' ? 'Schedule send' : 'Send now'}
        </Button>
        {createError ? <span className="text-xs text-rose-400">Error: {createError}</span> : null}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveTree(
  mode: 'segment' | 'inline',
  segmentId: string | null,
  inline: FilterGroup,
): Promise<unknown> {
  if (mode === 'segment' && segmentId) {
    const res = await fetch(`/api/admin/crm/segments/${segmentId}`, { cache: 'no-store' })
    if (!res.ok) return { operator: 'AND', conditions: [] }
    const json = (await res.json()) as { segment: { filterTree: unknown } }
    return json.segment?.filterTree ?? { operator: 'AND', conditions: [] }
  }
  return inline
}

function stepIsComplete(s: WizardState): boolean {
  if (s.step === 1) return s.audienceMode === 'segment' ? !!s.segmentId : true
  if (s.step === 3) return !!s.templateId
  return true
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-line-subtle bg-surface p-4">
      <div className="mb-3">
        <div className="text-sm font-semibold text-ink-primary">{title}</div>
        {subtitle ? <div className="text-xs text-ink-tertiary">{subtitle}</div> : null}
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-ink-tertiary">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-ink-tertiary">{label}</div>
      <div className="mt-1 text-sm text-ink-primary">{children}</div>
    </div>
  )
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'critical' | 'neutral'
}) {
  return (
    <div
      className={cn(
        'rounded-md border bg-surface px-2 py-1.5',
        tone === 'critical' ? 'border-rose-500/30 text-rose-400' : 'border-line-subtle',
      )}
    >
      <div className="text-[9px] uppercase text-ink-tertiary">{label}</div>
      <div className="text-xs font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function Tab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-3 py-1.5 text-xs transition-colors',
        active ? 'bg-elevated text-ink-primary' : 'text-ink-tertiary hover:text-ink-secondary',
      )}
    >
      {label}
    </button>
  )
}

void MessageSquare
