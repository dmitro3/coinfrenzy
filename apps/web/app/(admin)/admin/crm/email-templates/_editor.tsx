'use client'

import * as React from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import LinkExt from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
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
    subjectTemplate: string
    bodyHtmlTemplate: string
    bodyTextTemplate: string | null
    fromEmail: string | null
    replyTo: string | null
    category: string | null
  }
  variables: VariablePickerVariable[]
  samplePlayers: SamplePlayer[]
}

interface PreviewResponse {
  rendered: string
  variablesFound: string[]
  variablesMissing: string[]
  spamScore?: number
  estimatedSizeKb?: number
}

export function EmailTemplateEditor({ templateId, initial, variables, samplePlayers }: Props) {
  const router = useRouter()
  const [slug, setSlug] = React.useState(initial?.slug ?? '')
  const [displayName, setDisplayName] = React.useState(initial?.displayName ?? '')
  const [subject, setSubject] = React.useState(initial?.subjectTemplate ?? '')
  const [fromEmail, setFromEmail] = React.useState(initial?.fromEmail ?? '')
  const [replyTo, setReplyTo] = React.useState(initial?.replyTo ?? '')
  const [category, setCategory] = React.useState(initial?.category ?? '')
  const [bodyText, setBodyText] = React.useState(initial?.bodyTextTemplate ?? '')
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const [activeSampleIdx, setActiveSampleIdx] = React.useState(0)
  const [preview, setPreview] = React.useState<PreviewResponse | null>(null)
  const [previewLoading, setPreviewLoading] = React.useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({}),
      LinkExt.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Write your email body…' }),
    ],
    content: initial?.bodyHtmlTemplate ?? '<p>Hello {{player.displayName}},</p>',
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none min-h-[260px] rounded-md border border-line-subtle bg-background p-3 focus:outline-none',
      },
    },
    immediatelyRender: false,
  })

  function insertVariable(key: string): void {
    if (!editor) return
    editor.chain().focus().insertContent(`{{ ${key} }}`).run()
  }

  const activeSample = samplePlayers[activeSampleIdx]

  // Live preview re-render when subject/body/sample changes (debounced).
  React.useEffect(() => {
    if (!activeSample) return
    const html = editor?.getHTML() ?? ''
    const handle = window.setTimeout(async () => {
      setPreviewLoading(true)
      try {
        const res = await fetch('/api/admin/crm/variable-preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            template: html,
            playerId: activeSample.id,
            channel: 'email',
            noEscape: true,
          }),
        })
        if (res.ok) {
          const json = (await res.json()) as PreviewResponse
          setPreview(json)
        }
      } finally {
        setPreviewLoading(false)
      }
    }, 500)
    return () => window.clearTimeout(handle)
  }, [editor, activeSample, subject])

  async function save(): Promise<void> {
    setSaving(true)
    setSaveError(null)
    try {
      const html = editor?.getHTML() ?? ''
      const url = templateId
        ? `/api/admin/crm/email-templates/${templateId}`
        : `/api/admin/crm/email-templates`
      const method = templateId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug,
          displayName,
          subjectTemplate: subject,
          bodyHtmlTemplate: html,
          bodyTextTemplate: bodyText || null,
          fromEmail: fromEmail || null,
          replyTo: replyTo || null,
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
        router.push(`/admin/crm/email-templates/${json.id}`)
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
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        <div className="rounded-lg border border-line-subtle bg-surface p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Slug">
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                disabled={!!templateId}
                placeholder="welcome_intro"
              />
            </Field>
            <Field label="Display name">
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </Field>
            <Field label="From email">
              <Input
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="noreply@coinfrenzy.com"
              />
            </Field>
            <Field label="Reply-to">
              <Input
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                placeholder="support@coinfrenzy.com"
              />
            </Field>
            <Field label="Category">
              <Input value={category} onChange={(e) => setCategory(e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="rounded-lg border border-line-subtle bg-surface p-4">
          <div className="flex items-center justify-between">
            <Field label="Subject">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="rounded-lg border border-line-subtle bg-surface p-4">
          <div className="mb-2 flex flex-wrap items-center gap-1">
            {editor ? <Toolbar editor={editor} /> : null}
            <div className="ml-auto">
              <VariablePicker variables={variables} onPick={insertVariable} />
            </div>
          </div>
          <EditorContent editor={editor} />
        </div>

        <div className="rounded-lg border border-line-subtle bg-surface p-4">
          <Field label="Plain-text fallback (optional)">
            <textarea
              value={bodyText ?? ''}
              onChange={(e) => setBodyText(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-line-subtle bg-background p-2 text-sm"
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={save}
            disabled={saving || !slug.trim() || !displayName.trim() || !subject.trim()}
          >
            {saving ? 'Saving…' : templateId ? 'Save new version' : 'Create template'}
          </Button>
          {templateId && activeSample ? (
            <TestSendButton
              channel="email"
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
            <div className="text-xs uppercase tracking-wide text-ink-tertiary">Live preview</div>
            {previewLoading ? <span className="text-xs text-ink-tertiary">…</span> : null}
          </div>
          <div className="mt-2 max-h-[400px] overflow-auto rounded-md border border-line-subtle bg-background p-3 text-sm">
            <div className="mb-2 text-xs text-ink-tertiary">
              Subject: <span className="text-ink-primary">{subject || '(no subject)'}</span>
            </div>
            <div
              className="prose prose-sm max-w-none text-ink-primary"
              dangerouslySetInnerHTML={{ __html: preview?.rendered ?? '<em>No preview yet.</em>' }}
            />
          </div>
          {preview && preview.variablesMissing.length > 0 ? (
            <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-300">
              Missing variables: {preview.variablesMissing.join(', ')}
            </div>
          ) : null}
          {preview?.spamScore !== undefined ? (
            <div className="mt-2 text-xs text-ink-tertiary">
              Spam score: {preview.spamScore.toFixed(1)} / 10
              {preview.estimatedSizeKb !== undefined
                ? ` · ~${preview.estimatedSizeKb.toFixed(1)}kb`
                : ''}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  )
}

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null
  const Btn = ({ on, label, action }: { on: boolean; label: string; action: () => void }) => (
    <button
      type="button"
      onClick={action}
      className={`rounded-md border px-2 py-1 text-xs ${on ? 'border-accent bg-accent/10' : 'border-line-subtle'}`}
    >
      {label}
    </button>
  )
  return (
    <>
      <Btn
        on={editor.isActive('bold')}
        label="Bold"
        action={() => editor.chain().focus().toggleBold().run()}
      />
      <Btn
        on={editor.isActive('italic')}
        label="Italic"
        action={() => editor.chain().focus().toggleItalic().run()}
      />
      <Btn
        on={editor.isActive('heading', { level: 2 })}
        label="H2"
        action={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <Btn
        on={editor.isActive('bulletList')}
        label="• List"
        action={() => editor.chain().focus().toggleBulletList().run()}
      />
      <Btn
        on={editor.isActive('orderedList')}
        label="1. List"
        action={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <Btn
        on={editor.isActive('link')}
        label="Link"
        action={() => {
          const prev = editor.getAttributes('link').href as string | undefined
          const next = window.prompt('URL', prev ?? 'https://')
          if (next === null) return
          if (next === '') {
            editor.chain().focus().unsetLink().run()
            return
          }
          editor.chain().focus().setLink({ href: next }).run()
        }}
      />
    </>
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
