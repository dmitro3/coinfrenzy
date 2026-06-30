'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bold, Eye, Heading, Italic, Link2, List, ListOrdered, Pencil } from 'lucide-react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'
import { Input } from '@coinfrenzy/ui/primitives/input'
import { Label } from '@coinfrenzy/ui/primitives/label'

import { PageRenderer } from './_renderer'

export interface PageFormValues {
  slug: string
  title: string
  body: string
  category: string
  status: 'active' | 'draft' | 'archived'
  audience: string
  seoDescription: string
}

interface Props {
  mode: 'create' | 'edit'
  initial: PageFormValues
  pageId?: string
  /** When editing, lock the slug input by default to discourage breaking
   *  footer links — the user can still click the toggle to enable it. */
  slugWasGenerated?: boolean
}

const CATEGORY_OPTIONS = [
  { value: '', label: 'Uncategorised' },
  { value: 'legal', label: 'Legal' },
  { value: 'support', label: 'Support / FAQ' },
  { value: 'promotions', label: 'Promotions' },
  { value: 'jackpot', label: 'Jackpot' },
  { value: 'help', label: 'Help' },
]

const AUDIENCE_OPTIONS = [
  { value: '', label: 'Public (everyone)' },
  { value: 'logged_in', label: 'Logged-in players only' },
  { value: 'admin', label: 'Admin / staff only' },
]

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

export function PageForm({ mode, initial, pageId, slugWasGenerated }: Props) {
  const router = useRouter()
  const [v, setV] = React.useState<PageFormValues>(initial)
  const [slugLocked, setSlugLocked] = React.useState(mode === 'edit' && !slugWasGenerated)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [view, setView] = React.useState<'edit' | 'preview' | 'split'>('split')
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)

  function set<K extends keyof PageFormValues>(key: K, value: PageFormValues[K]) {
    setV((prev) => ({ ...prev, [key]: value }))
  }

  // Auto-slug on title typing (only when slug hasn't been touched manually
  // — we treat the slug as "locked" once the user edits it directly).
  function onTitleChange(next: string) {
    setV((prev) => {
      const wasAutoSlug = slugify(prev.title) === prev.slug || prev.slug.length === 0
      return {
        ...prev,
        title: next,
        slug: wasAutoSlug && !slugLocked ? slugify(next) : prev.slug,
      }
    })
  }

  // Mini-toolbar inserts markdown markers around the current selection.
  function wrapSelection(before: string, after: string = before) {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart ?? 0
    const end = ta.selectionEnd ?? 0
    const body = v.body
    const next = body.slice(0, start) + before + body.slice(start, end) + after + body.slice(end)
    set('body', next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + before.length, end + before.length)
    })
  }

  function insertAtLineStart(prefix: string) {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart ?? 0
    const body = v.body
    const lineStart = body.lastIndexOf('\n', start - 1) + 1
    const next = body.slice(0, lineStart) + prefix + body.slice(lineStart)
    set('body', next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + prefix.length, start + prefix.length)
    })
  }

  function insertLink() {
    wrapSelection('[', '](https://example.com)')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const payload = {
        slug: v.slug,
        title: v.title,
        body: v.body,
        category: v.category || null,
        status: v.status,
        audience: v.audience || null,
        seoDescription: v.seoDescription || null,
      }
      const url = mode === 'create' ? '/api/admin/cms/pages' : `/api/admin/cms/pages/${pageId}`
      const method = mode === 'create' ? 'POST' : 'PATCH'
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json().catch(() => null)) as {
        id?: string
        error?: string
        details?: { reason?: string }
      } | null
      if (!res.ok) {
        if (data?.error === 'slug_conflict')
          setError('That slug is already in use. Pick a different one.')
        else if (data?.error === 'invalid')
          setError(`Invalid input: ${data.details?.reason ?? 'check the values'}.`)
        else setError(data?.error ?? 'Request failed.')
        return
      }
      router.push('/admin/cms')
      router.refresh()
    } catch {
      setError('Connection problem. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {error ? (
        <div className="rounded-md border border-critical/40 bg-critical/10 px-4 py-3 text-sm text-critical">
          {error}
        </div>
      ) : null}

      {/* Title + slug strip — always visible on top */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-ink-secondary">
              Title <span className="text-critical">*</span>
            </Label>
            <Input
              required
              maxLength={160}
              value={v.title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Terms of Service"
              className="text-lg"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-ink-secondary">
                Slug <span className="text-critical">*</span>
              </Label>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-ink-tertiary">/p/</span>
                <Input
                  required
                  disabled={slugLocked}
                  pattern="[a-z0-9][a-z0-9-]*"
                  maxLength={64}
                  value={v.slug}
                  onChange={(e) => set('slug', e.target.value)}
                  placeholder="terms-of-service"
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSlugLocked((p) => !p)}
                  title="Editing the slug breaks existing footer / external links pointing here"
                >
                  {slugLocked ? 'Unlock' : 'Lock'}
                </Button>
              </div>
              <p className="text-xs text-ink-tertiary">
                Slug becomes the public URL <span className="font-mono">/p/{v.slug || '…'}</span>.
                Changing it after publish will break inbound links — keep stable for legal pages.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Editor toolbar + content */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-secondary">
              Body content
            </h2>
            <div className="flex items-center gap-1 rounded-md border border-line-subtle bg-surface p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setView('edit')}
                className={`flex items-center gap-1 rounded px-2 py-1 ${
                  view === 'edit'
                    ? 'bg-elevated text-ink-primary'
                    : 'text-ink-tertiary hover:text-ink-primary'
                }`}
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
              <button
                type="button"
                onClick={() => setView('split')}
                className={`flex items-center gap-1 rounded px-2 py-1 ${
                  view === 'split'
                    ? 'bg-elevated text-ink-primary'
                    : 'text-ink-tertiary hover:text-ink-primary'
                }`}
              >
                Split
              </button>
              <button
                type="button"
                onClick={() => setView('preview')}
                className={`flex items-center gap-1 rounded px-2 py-1 ${
                  view === 'preview'
                    ? 'bg-elevated text-ink-primary'
                    : 'text-ink-tertiary hover:text-ink-primary'
                }`}
              >
                <Eye className="h-3 w-3" /> Preview
              </button>
            </div>
          </header>

          {view !== 'preview' ? (
            <div className="flex flex-wrap items-center gap-1 rounded-md border border-line-subtle bg-surface px-2 py-1.5">
              <ToolButton onClick={() => insertAtLineStart('## ')} label="Section heading">
                <Heading className="h-3.5 w-3.5" />
              </ToolButton>
              <ToolButton onClick={() => wrapSelection('**')} label="Bold">
                <Bold className="h-3.5 w-3.5" />
              </ToolButton>
              <ToolButton onClick={() => wrapSelection('_')} label="Italic">
                <Italic className="h-3.5 w-3.5" />
              </ToolButton>
              <ToolButton onClick={() => insertAtLineStart('- ')} label="Bulleted list">
                <List className="h-3.5 w-3.5" />
              </ToolButton>
              <ToolButton onClick={() => insertAtLineStart('1. ')} label="Numbered list">
                <ListOrdered className="h-3.5 w-3.5" />
              </ToolButton>
              <ToolButton onClick={insertLink} label="Link">
                <Link2 className="h-3.5 w-3.5" />
              </ToolButton>
              <span className="ml-auto text-[10px] text-ink-tertiary">
                Tiny markdown: <span className="font-mono">##</span> heading,{' '}
                <span className="font-mono">**bold**</span>,{' '}
                <span className="font-mono">[text](url)</span>, lines starting{' '}
                <span className="font-mono">-</span> for lists.
              </span>
            </div>
          ) : null}

          <div
            className={
              view === 'split' ? 'grid grid-cols-1 gap-3 lg:grid-cols-2' : 'grid grid-cols-1 gap-3'
            }
          >
            {view !== 'preview' ? (
              <textarea
                ref={textareaRef}
                value={v.body}
                onChange={(e) => set('body', e.target.value)}
                spellCheck
                className="min-h-[480px] w-full rounded-md border border-line-default bg-surface px-3 py-2 font-mono text-sm leading-relaxed text-ink-primary"
                placeholder={
                  'Use "## Section title" lines to break the page into sections.\n\nLeave blank lines between paragraphs. Lines starting with "-" become bullets.'
                }
              />
            ) : null}
            {view !== 'edit' ? (
              <div className="min-h-[480px] overflow-hidden rounded-md border border-line-subtle bg-surface">
                <div className="border-b border-line-subtle bg-elevated px-3 py-1.5 text-[10px] uppercase tracking-wider text-ink-tertiary">
                  Live preview
                </div>
                <div className="max-h-[600px] overflow-y-auto p-4">
                  <h1 className="text-2xl font-semibold text-ink-primary">
                    {v.title || 'Untitled page'}
                  </h1>
                  {v.seoDescription ? (
                    <p className="mt-1 text-sm text-ink-tertiary">{v.seoDescription}</p>
                  ) : null}
                  <div className="mt-4">
                    <PageRenderer body={v.body} />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Publishing + metadata */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-secondary">
              Publishing
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Status">
                <select
                  value={v.status}
                  onChange={(e) => set('status', e.target.value as PageFormValues['status'])}
                  className="h-9 w-full rounded-md border border-line-default bg-surface px-3 text-sm text-ink-primary"
                >
                  <option value="active">Active (live)</option>
                  <option value="draft">Draft (hidden)</option>
                  <option value="archived">Archived (hidden, kept for audit)</option>
                </select>
              </Field>
              <Field label="Category">
                <select
                  value={v.category}
                  onChange={(e) => set('category', e.target.value)}
                  className="h-9 w-full rounded-md border border-line-default bg-surface px-3 text-sm text-ink-primary"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Audience">
                <select
                  value={v.audience}
                  onChange={(e) => set('audience', e.target.value)}
                  className="h-9 w-full rounded-md border border-line-default bg-surface px-3 text-sm text-ink-primary"
                >
                  {AUDIENCE_OPTIONS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-secondary">
              SEO
            </h2>
            <Field label="Meta description (1–2 sentences)">
              <textarea
                value={v.seoDescription}
                onChange={(e) => set('seoDescription', e.target.value)}
                maxLength={300}
                rows={3}
                className="w-full rounded-md border border-line-default bg-surface px-3 py-2 text-sm text-ink-primary"
                placeholder="Optional. Shows in Google results and the page <meta description>."
              />
              <div className="text-right text-[10px] text-ink-tertiary">
                {v.seoDescription.length} / 300
              </div>
            </Field>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button asChild variant="ghost" type="button">
          <Link href="/admin/cms">Cancel</Link>
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : mode === 'create' ? 'Create page' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}

function ToolButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="rounded p-1.5 text-ink-secondary hover:bg-elevated hover:text-ink-primary"
    >
      {children}
    </button>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: React.ReactNode
  required?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-ink-secondary">
        {label}
        {required ? <span className="ml-0.5 text-critical">*</span> : null}
      </Label>
      {children}
    </div>
  )
}

export const DEFAULT_PAGE_VALUES: PageFormValues = {
  slug: '',
  title: '',
  body: '',
  category: 'legal',
  status: 'draft',
  audience: '',
  seoDescription: '',
}
