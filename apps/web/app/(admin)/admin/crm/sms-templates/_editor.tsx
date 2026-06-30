'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Input } from '@coinfrenzy/ui/primitives/input'
import {
  TestSendButton,
  VariablePicker,
  type VariablePickerVariable,
} from '@coinfrenzy/ui/admin/crm'

interface SamplePlayer {
  id: string
  email: string
  displayName: string | null
}

interface Props {
  templateId?: string | null
  initial?: {
    slug: string
    displayName: string
    bodyTemplate: string
    senderId: string | null
    category: string | null
  }
  variables: VariablePickerVariable[]
  samplePlayers: SamplePlayer[]
}

const STOP_TAIL = ' Reply STOP to opt out.'

interface PreviewResponse {
  rendered: string
  variablesFound: string[]
  variablesMissing: string[]
}

export function SmsTemplateEditor({ templateId, initial, variables, samplePlayers }: Props) {
  const router = useRouter()
  const [slug, setSlug] = React.useState(initial?.slug ?? '')
  const [displayName, setDisplayName] = React.useState(initial?.displayName ?? '')
  const [body, setBody] = React.useState(initial?.bodyTemplate ?? 'Hi {{ player.displayName }}, ')
  const [senderId, setSenderId] = React.useState(initial?.senderId ?? '')
  const [category, setCategory] = React.useState(initial?.category ?? '')
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const [activeSampleIdx, setActiveSampleIdx] = React.useState(0)
  const [preview, setPreview] = React.useState<PreviewResponse | null>(null)
  const [previewLoading, setPreviewLoading] = React.useState(false)

  const ref = React.useRef<HTMLTextAreaElement | null>(null)
  function insert(key: string): void {
    const el = ref.current
    const v = `{{ ${key} }}`
    if (!el) {
      setBody((b) => b + v)
      return
    }
    const start = el.selectionStart
    const end = el.selectionEnd
    const next = body.slice(0, start) + v + body.slice(end)
    setBody(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + v.length, start + v.length)
    })
  }

  const totalLength = body.length + STOP_TAIL.length
  const segments = totalLength === 0 ? 0 : Math.ceil(totalLength / 160)
  const tooLong = totalLength > 160

  const activeSample = samplePlayers[activeSampleIdx]

  React.useEffect(() => {
    if (!activeSample) return
    const handle = window.setTimeout(async () => {
      setPreviewLoading(true)
      try {
        const res = await fetch('/api/admin/crm/variable-preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            template: body,
            playerId: activeSample.id,
            channel: 'sms',
          }),
        })
        if (res.ok) {
          const json = (await res.json()) as PreviewResponse
          setPreview(json)
        }
      } finally {
        setPreviewLoading(false)
      }
    }, 400)
    return () => window.clearTimeout(handle)
  }, [body, activeSample])

  async function save(): Promise<void> {
    setSaving(true)
    setSaveError(null)
    try {
      const url = templateId
        ? `/api/admin/crm/sms-templates/${templateId}`
        : `/api/admin/crm/sms-templates`
      const method = templateId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug,
          displayName,
          bodyTemplate: body,
          senderId: senderId || null,
          category: category || null,
        }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        setSaveError(err.error ?? 'failed_to_save')
        return
      }
      const json = (await res.json()) as { id?: string }
      if (!templateId && json.id) {
        router.push(`/admin/crm/sms-templates/${json.id}`)
      } else {
        router.refresh()
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <div className="rounded-lg border border-line-subtle bg-surface p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Slug">
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                disabled={!!templateId}
                placeholder="welcome_sms"
              />
            </Field>
            <Field label="Display name">
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </Field>
            <Field label="Sender ID (optional)">
              <Input
                value={senderId ?? ''}
                onChange={(e) => setSenderId(e.target.value)}
                placeholder="COINFRENZY"
              />
            </Field>
            <Field label="Category">
              <Input value={category ?? ''} onChange={(e) => setCategory(e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="rounded-lg border border-line-subtle bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs uppercase tracking-wide text-ink-tertiary">Body</div>
            <VariablePicker variables={variables} onPick={insert} />
          </div>
          <textarea
            ref={ref}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            className="w-full rounded-md border border-line-subtle bg-background p-2 font-mono text-sm"
          />
          <div className="mt-2 flex items-center justify-between text-xs">
            <div className="text-ink-tertiary">
              Tail appended: <span className="font-mono">{STOP_TAIL}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className={tooLong ? 'text-amber-400' : 'text-ink-tertiary'}>
                {totalLength} chars
              </span>
              <span className="rounded-full bg-surface-elevated px-2 py-0.5">
                {segments} segment{segments === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={save}
            disabled={saving || !slug.trim() || !displayName.trim() || !body.trim()}
          >
            {saving ? 'Saving…' : templateId ? 'Save new version' : 'Create template'}
          </Button>
          {templateId && activeSample ? (
            <TestSendButton
              channel="sms"
              templateId={templateId}
              samplePlayerId={activeSample.id}
            />
          ) : null}
          {saveError ? <span className="text-xs text-rose-400">Error: {saveError}</span> : null}
        </div>
      </div>

      <aside className="space-y-3">
        {samplePlayers.length > 0 ? (
          <div className="rounded-lg border border-line-subtle bg-surface p-3">
            <div className="text-xs uppercase tracking-wide text-ink-tertiary">Preview as</div>
            <div className="mt-2 flex flex-wrap gap-1">
              {samplePlayers.slice(0, 3).map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActiveSampleIdx(i)}
                  className={`rounded-md border px-2 py-1 text-xs transition ${
                    i === activeSampleIdx
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-line-subtle text-ink-secondary hover:border-accent/40'
                  }`}
                >
                  {p.displayName ?? p.email}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-lg border border-line-subtle bg-surface p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wide text-ink-tertiary">SMS preview</div>
            {previewLoading ? <span className="text-xs text-ink-tertiary">…</span> : null}
          </div>
          <div className="mt-2 rounded-md border border-line-subtle bg-background p-3 font-mono text-sm text-ink-primary">
            {preview?.rendered ?? '(loading…)'}
            <span className="text-ink-tertiary">{STOP_TAIL}</span>
          </div>
          {preview && preview.variablesMissing.length > 0 ? (
            <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-300">
              Missing: {preview.variablesMissing.join(', ')}
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-line-subtle bg-surface p-3 text-xs text-ink-tertiary">
          <strong className="font-semibold text-ink-primary">TCPA.</strong> All SMS sends include
          the opt-out tail. Players who reply STOP are auto-suppressed in
          <span className="font-mono"> crm_suppression</span>.
        </div>
      </aside>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-ink-tertiary">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  )
}
