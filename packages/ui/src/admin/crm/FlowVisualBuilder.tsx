'use client'

import * as React from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
  type NodeChange,
  type EdgeChange,
  type Connection,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Mail,
  MessageSquare,
  Clock,
  GitBranch,
  Gift,
  PlusCircle,
  MinusCircle,
  Flag,
  Bell,
  Zap,
  PencilLine,
  X,
  Play,
  Square,
} from 'lucide-react'

import { Button } from '../../primitives/button'
import { Input } from '../../primitives/input'
import { cn } from '../../lib/utils'

export type FlowActionType =
  | 'trigger'
  | 'send_email'
  | 'send_sms'
  | 'send_push'
  | 'wait'
  | 'condition'
  | 'award_bonus'
  | 'add_to_segment'
  | 'remove_from_segment'
  | 'end'

export interface FlowStep {
  stepNumber: number
  actionType: FlowActionType
  config: Record<string, unknown>
  waitDurationSeconds?: number | null
  /** Optional live metrics for the running flow. */
  enrolled?: number
  avgDurationLabel?: string
}

export interface FlowMeta {
  name: string
  description: string | null
  triggerEvent: string
  maxEnrollmentsPerPlayer: number | null
  cooldownHoursBetweenEnrollments: number | null
  status: 'active' | 'paused' | 'archived'
  conversionEvent: string | null
}

export interface FlowVisualBuilderProps {
  flowId?: string
  initialMeta: FlowMeta
  initialSteps: FlowStep[]
  triggerEventOptions: string[]
  emailTemplates: Array<{ id: string; slug: string; displayName: string }>
  smsTemplates: Array<{ id: string; slug: string; displayName: string }>
  /** Save handler — return a Promise so the button shows a spinner. */
  onSave: (input: { meta: FlowMeta; steps: FlowStep[] }) => Promise<{ ok: boolean; error?: string }>
}

const ACTION_META: Record<
  FlowActionType,
  { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  trigger: { label: 'Trigger', icon: Zap, tone: 'text-violet-400' },
  send_email: { label: 'Send email', icon: Mail, tone: 'text-sky-400' },
  send_sms: { label: 'Send SMS', icon: MessageSquare, tone: 'text-emerald-400' },
  send_push: { label: 'Send push', icon: Bell, tone: 'text-emerald-400' },
  wait: { label: 'Wait', icon: Clock, tone: 'text-amber-400' },
  condition: { label: 'Branch', icon: GitBranch, tone: 'text-violet-400' },
  award_bonus: { label: 'Award bonus', icon: Gift, tone: 'text-amber-400' },
  add_to_segment: { label: 'Add to segment', icon: PlusCircle, tone: 'text-emerald-400' },
  remove_from_segment: { label: 'Remove from segment', icon: MinusCircle, tone: 'text-rose-400' },
  end: { label: 'End', icon: Flag, tone: 'text-ink-tertiary' },
}

// ---------------------------------------------------------------------------

export function FlowVisualBuilder(props: FlowVisualBuilderProps) {
  return (
    <ReactFlowProvider>
      <FlowVisualBuilderInner {...props} />
    </ReactFlowProvider>
  )
}

function FlowVisualBuilderInner({
  flowId,
  initialMeta,
  initialSteps,
  triggerEventOptions,
  emailTemplates,
  smsTemplates,
  onSave,
}: FlowVisualBuilderProps) {
  const [meta, setMeta] = React.useState<FlowMeta>(initialMeta)
  const [steps, setSteps] = React.useState<FlowStep[]>(initialSteps)
  const [selected, setSelected] = React.useState<number | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const [testMode, setTestMode] = React.useState(false)
  const [testCursor, setTestCursor] = React.useState<number | null>(null)

  const nodeTypes = React.useMemo(() => ({ flow: StepNode }), [])

  const initialNodes = React.useMemo<Node[]>(
    () =>
      steps.map((s, i) => ({
        id: `step-${s.stepNumber}`,
        type: 'flow',
        position: { x: 60, y: 30 + i * 120 },
        data: {
          step: s,
          selected: false,
          testActive: false,
          onSelect: () => setSelected(s.stepNumber),
          onRemove: () => removeStep(s.stepNumber),
        },
        // M3 — snap-to-grid (32px). xyflow handles this via `snapToGrid`.
      })),
    // Intentional snapshot — the canvas takes the initial layout, then the
    // user owns it. We sync labels/selection separately in the effect below.
    [],
  )
  const initialEdges = React.useMemo<Edge[]>(
    () =>
      steps.slice(0, -1).map((s, i) => ({
        id: `e-${s.stepNumber}-${steps[i + 1]!.stepNumber}`,
        source: `step-${s.stepNumber}`,
        target: `step-${steps[i + 1]!.stepNumber}`,
        animated: false,
        style: { stroke: 'hsl(var(--ink-tertiary))', strokeWidth: 1.5 },
      })),
    [],
  )

  const [nodes, setNodes] = React.useState<Node[]>(initialNodes)
  const [edges, setEdges] = React.useState<Edge[]>(initialEdges)

  // Sync nodes' visual state (selection / test cursor) when those change.
  React.useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        const step = steps.find((s) => `step-${s.stepNumber}` === n.id)
        if (!step) return n
        return {
          ...n,
          data: {
            step,
            selected: selected === step.stepNumber,
            testActive: testCursor === step.stepNumber,
            onSelect: () => setSelected(step.stepNumber),
            onRemove: () => removeStep(step.stepNumber),
          },
        }
      }),
    )
  }, [selected, steps, testCursor])

  function onNodesChange(changes: NodeChange[]) {
    setNodes((nds) => applyNodeChanges(changes, nds))
  }
  function onEdgesChange(changes: EdgeChange[]) {
    setEdges((eds) => applyEdgeChanges(changes, eds))
  }
  function onConnect(connection: Connection) {
    setEdges((eds) =>
      addEdge({ ...connection, style: { stroke: '#a78bfa', strokeWidth: 1.5 } }, eds),
    )
  }

  function addStep(actionType: FlowActionType) {
    const next = Math.max(0, ...steps.map((s) => s.stepNumber)) + 1
    const newStep: FlowStep = {
      stepNumber: next,
      actionType,
      config: {},
      waitDurationSeconds: actionType === 'wait' ? 3600 : null,
    }
    setSteps((prev) => [...prev, newStep])
    setNodes((nds) => [
      ...nds,
      {
        id: `step-${next}`,
        type: 'flow',
        position: { x: 60, y: 30 + nds.length * 120 },
        data: {
          step: newStep,
          selected: false,
          testActive: false,
          onSelect: () => setSelected(next),
          onRemove: () => removeStep(next),
        },
      },
    ])
  }

  function updateStep(stepNumber: number, patch: Partial<FlowStep>) {
    setSteps((prev) => prev.map((s) => (s.stepNumber === stepNumber ? { ...s, ...patch } : s)))
  }

  function removeStep(stepNumber: number) {
    setSteps((prev) => prev.filter((s) => s.stepNumber !== stepNumber))
    setNodes((nds) => nds.filter((n) => n.id !== `step-${stepNumber}`))
    setEdges((eds) =>
      eds.filter((e) => e.source !== `step-${stepNumber}` && e.target !== `step-${stepNumber}`),
    )
    if (selected === stepNumber) setSelected(null)
  }

  async function save() {
    setSaving(true)
    setSaveError(null)
    try {
      const result = await onSave({ meta, steps })
      if (!result.ok) setSaveError(result.error ?? 'failed_to_save')
    } finally {
      setSaving(false)
    }
  }

  // Test mode walks forward 1 step every 1.2s.
  React.useEffect(() => {
    if (!testMode) {
      setTestCursor(null)
      return
    }
    const ordered = [...steps].sort((a, b) => a.stepNumber - b.stepNumber)
    if (ordered.length === 0) return
    let i = 0
    setTestCursor(ordered[0]!.stepNumber)
    const id = window.setInterval(() => {
      i += 1
      if (i >= ordered.length) {
        window.clearInterval(id)
        setTestMode(false)
        return
      }
      setTestCursor(ordered[i]!.stepNumber)
    }, 1200)
    return () => window.clearInterval(id)
  }, [testMode, steps])

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="grid gap-3 rounded-lg border border-line-subtle bg-surface p-4 sm:grid-cols-2 mb-3">
          <Field label="Name">
            <Input
              value={meta.name}
              onChange={(e) => setMeta({ ...meta, name: e.target.value })}
              placeholder="Welcome series"
            />
          </Field>
          <Field label="Status">
            <select
              value={meta.status}
              onChange={(e) =>
                setMeta({ ...meta, status: e.target.value as 'active' | 'paused' | 'archived' })
              }
              className="h-9 rounded-md border border-line-subtle bg-elevated px-2 text-sm text-ink-primary"
            >
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="archived">archived</option>
            </select>
          </Field>
          <Field label="Trigger event">
            <Input
              list="trigger-events"
              value={meta.triggerEvent}
              onChange={(e) => setMeta({ ...meta, triggerEvent: e.target.value })}
              placeholder="player.signup"
            />
            <datalist id="trigger-events">
              {triggerEventOptions.map((e) => (
                <option key={e} value={e} />
              ))}
            </datalist>
          </Field>
          <Field label="Conversion event (optional)">
            <Input
              value={meta.conversionEvent ?? ''}
              onChange={(e) => setMeta({ ...meta, conversionEvent: e.target.value || null })}
              placeholder="player.purchase.succeeded"
            />
          </Field>
        </div>

        <div className="rounded-lg border border-line-subtle bg-surface" style={{ height: 540 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            snapToGrid
            snapGrid={[16, 16]}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} color="hsl(0 0% 100% / 0.04)" />
            <Controls className="text-ink-secondary" />
            <MiniMap
              maskColor="hsl(220 13% 8% / 0.7)"
              nodeColor={() => '#a78bfa'}
              style={{ background: 'hsl(220 13% 8%)' }}
            />
          </ReactFlow>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(
            [
              'send_email',
              'send_sms',
              'wait',
              'condition',
              'award_bonus',
              'add_to_segment',
              'remove_from_segment',
              'end',
            ] as FlowActionType[]
          ).map((t) => {
            const m = ACTION_META[t]
            const Icon = m.icon
            return (
              <Button
                key={t}
                size="sm"
                variant="outline"
                onClick={() => addStep(t)}
                className="h-8"
              >
                <Icon className={cn('mr-1.5 h-3 w-3', m.tone)} />
                {m.label}
              </Button>
            )
          })}
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant={testMode ? 'default' : 'outline'}
              onClick={() => setTestMode((b) => !b)}
              className="h-8"
            >
              {testMode ? (
                <Square className="mr-1.5 h-3 w-3" />
              ) : (
                <Play className="mr-1.5 h-3 w-3" />
              )}
              {testMode ? 'Stop test' : 'Test mode'}
            </Button>
            <Button size="sm" onClick={save} disabled={saving || !meta.name.trim()} className="h-8">
              {saving ? 'Saving…' : flowId ? 'Save flow' : 'Create flow'}
            </Button>
          </div>
        </div>
        {saveError ? <div className="mt-2 text-xs text-rose-400">Error: {saveError}</div> : null}
      </div>

      <aside className="rounded-lg border border-line-subtle bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs font-medium text-ink-secondary">
            {selected !== null ? 'Step properties' : 'No step selected'}
          </div>
          {selected !== null ? (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-ink-tertiary hover:text-ink-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        {selected !== null ? (
          <StepConfigPanel
            step={steps.find((s) => s.stepNumber === selected) ?? null}
            emailTemplates={emailTemplates}
            smsTemplates={smsTemplates}
            onChange={(patch) => updateStep(selected, patch)}
          />
        ) : (
          <div className="text-xs text-ink-tertiary">Click a node to edit its configuration.</div>
        )}
      </aside>
    </div>
  )
}

// ---------------------------------------------------------------------------
// StepNode — Linear-style card rendered for each xyflow node
// ---------------------------------------------------------------------------

interface StepNodeData {
  step: FlowStep
  selected: boolean
  testActive: boolean
  onSelect: () => void
  onRemove: () => void
}

function StepNode(props: NodeProps) {
  const data = (props.data ?? {
    step: { stepNumber: 0, actionType: 'end', config: {} },
    selected: false,
    testActive: false,
    onSelect: () => {},
    onRemove: () => {},
  }) as unknown as StepNodeData
  const { step, selected, testActive, onSelect, onRemove } = data
  const meta = ACTION_META[step.actionType] ?? ACTION_META.end
  const Icon = meta.icon

  const summary = stepSummary(step)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect()
      }}
      className={cn(
        'group relative w-[200px] rounded-lg border bg-elevated/95 px-3 py-2 text-xs shadow-sm transition-all',
        selected
          ? 'border-violet-500 ring-1 ring-violet-500/40'
          : testActive
            ? 'border-emerald-400 ring-1 ring-emerald-400/40'
            : 'border-line-subtle hover:border-ink-tertiary',
      )}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#a78bfa' }} />

      <div className="flex items-center gap-1.5">
        <Icon className={cn('h-3.5 w-3.5', meta.tone)} />
        <span className="font-medium text-ink-primary">
          #{step.stepNumber} {meta.label}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="ml-auto text-ink-tertiary opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
          aria-label="Remove step"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {summary ? (
        <div className="mt-1 truncate text-[10px] text-ink-tertiary" title={summary}>
          {summary}
        </div>
      ) : null}

      <div className="mt-1.5 flex items-center justify-between text-[10px] text-ink-tertiary">
        <span>{step.enrolled !== undefined ? `${step.enrolled} here` : '—'}</span>
        <span>{step.avgDurationLabel ?? ''}</span>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onSelect()
        }}
        className="absolute -right-1 -top-1 hidden rounded-full border border-line-subtle bg-elevated p-1 group-hover:block"
        aria-label="Edit step"
      >
        <PencilLine className="h-2.5 w-2.5 text-ink-secondary" />
      </button>

      <Handle type="source" position={Position.Bottom} style={{ background: '#a78bfa' }} />
    </div>
  )
}

function stepSummary(step: FlowStep): string {
  switch (step.actionType) {
    case 'send_email': {
      const slug = (step.config as { templateSlug?: string }).templateSlug
      return slug ? `template: ${slug}` : 'no template selected'
    }
    case 'send_sms': {
      const slug = (step.config as { templateSlug?: string }).templateSlug
      return slug ? `template: ${slug}` : 'no template selected'
    }
    case 'wait': {
      const s = step.waitDurationSeconds ?? 0
      if (s >= 86400) return `${Math.round(s / 86400)} days`
      if (s >= 3600) return `${Math.round(s / 3600)} hours`
      return `${s} seconds`
    }
    case 'condition': {
      const c = step.config as { thenStep?: number; elseStep?: number }
      return `if true → #${c.thenStep ?? '?'}, else → #${c.elseStep ?? '?'}`
    }
    case 'award_bonus': {
      const slug = (step.config as { bonusSlug?: string }).bonusSlug
      return slug ? `bonus: ${slug}` : 'no bonus selected'
    }
    default:
      return ''
  }
}

// ---------------------------------------------------------------------------
// Step config panel (sidebar)
// ---------------------------------------------------------------------------

function StepConfigPanel({
  step,
  emailTemplates,
  smsTemplates,
  onChange,
}: {
  step: FlowStep | null
  emailTemplates: Array<{ id: string; slug: string; displayName: string }>
  smsTemplates: Array<{ id: string; slug: string; displayName: string }>
  onChange: (patch: Partial<FlowStep>) => void
}) {
  if (!step) return null

  if (step.actionType === 'send_email') {
    const slug = (step.config as { templateSlug?: string }).templateSlug ?? ''
    return (
      <Field label="Email template">
        <select
          value={slug}
          onChange={(e) => onChange({ config: { ...step.config, templateSlug: e.target.value } })}
          className="h-9 rounded-md border border-line-subtle bg-elevated px-2 text-sm text-ink-primary"
        >
          <option value="">choose…</option>
          {emailTemplates.map((t) => (
            <option key={t.id} value={t.slug}>
              {t.displayName}
            </option>
          ))}
        </select>
      </Field>
    )
  }

  if (step.actionType === 'send_sms') {
    const slug = (step.config as { templateSlug?: string }).templateSlug ?? ''
    return (
      <Field label="SMS template">
        <select
          value={slug}
          onChange={(e) => onChange({ config: { ...step.config, templateSlug: e.target.value } })}
          className="h-9 rounded-md border border-line-subtle bg-elevated px-2 text-sm text-ink-primary"
        >
          <option value="">choose…</option>
          {smsTemplates.map((t) => (
            <option key={t.id} value={t.slug}>
              {t.displayName}
            </option>
          ))}
        </select>
      </Field>
    )
  }

  if (step.actionType === 'wait') {
    return (
      <Field label="Wait seconds">
        <Input
          type="number"
          value={step.waitDurationSeconds ?? 0}
          onChange={(e) => onChange({ waitDurationSeconds: Number(e.target.value) })}
        />
      </Field>
    )
  }

  if (step.actionType === 'condition') {
    return (
      <div className="space-y-2">
        <Field label="Condition tree (JSON)">
          <textarea
            rows={4}
            defaultValue={JSON.stringify(
              (step.config as { conditionTree?: unknown }).conditionTree ?? {},
              null,
              2,
            )}
            onBlur={(e) => {
              try {
                const parsed = JSON.parse(e.target.value)
                onChange({ config: { ...step.config, conditionTree: parsed } })
              } catch {
                /* keep editing */
              }
            }}
            className="w-full rounded-md border border-line-subtle bg-elevated p-2 font-mono text-[10px] text-ink-primary"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Then step">
            <Input
              type="number"
              value={(step.config as { thenStep?: number }).thenStep ?? ''}
              onChange={(e) =>
                onChange({ config: { ...step.config, thenStep: Number(e.target.value) } })
              }
            />
          </Field>
          <Field label="Else step">
            <Input
              type="number"
              value={(step.config as { elseStep?: number }).elseStep ?? ''}
              onChange={(e) =>
                onChange({ config: { ...step.config, elseStep: Number(e.target.value) } })
              }
            />
          </Field>
        </div>
      </div>
    )
  }

  if (step.actionType === 'award_bonus') {
    return (
      <Field label="Bonus slug">
        <Input
          value={(step.config as { bonusSlug?: string }).bonusSlug ?? ''}
          onChange={(e) => onChange({ config: { ...step.config, bonusSlug: e.target.value } })}
          placeholder="e.g. welcome-100"
        />
      </Field>
    )
  }

  if (step.actionType === 'end') {
    return (
      <div className="text-xs text-ink-tertiary">
        End step — players exit the flow when they reach this.
      </div>
    )
  }

  return null
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-ink-tertiary">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  )
}
