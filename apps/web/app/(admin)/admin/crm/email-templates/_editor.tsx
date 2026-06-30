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

// ---- Types ----------------------------------------------------------------

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

/** Field-level validation errors keyed by form field name. */
interface FieldErrors {
  slug?: string
  displayName?: string
  subjectTemplate?: string
  bodyHtmlTemplate?: string
  fromEmail?: string
  replyTo?: string
}

/** Shape of the Zod `flatten()` payload returned by the API on 400. */
interface ZodFlattenedErrors {
  formErrors?: string[]
  fieldErrors?: Record<string, string[] | undefined>
}

/** API error response shape. */
interface ApiErrorResponse {
  error?: string
  details?: ZodFlattenedErrors
}

// ---- Helpers ---------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value)
}

/** Returns true if the HTML is semantically empty (TipTap empty-paragraph etc.). */
function isHtmlEmpty(html: string): boolean {
  const stripped = html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, '')
    .trim()
  return stripped.length === 0
}

/** Slugify a display name into a valid template slug. */
function autoSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100)
}

/** Validate all fields client-side. Returns a map of field-level messages. */
function validateFields(fields: {
  slug: string
  displayName: string
  subject: string
  bodyHtml: string
  fromEmail: string
  replyTo: string
}): FieldErrors {
  const errors: FieldErrors = {}

  if (!fields.slug.trim()) {
    errors.slug = 'Slug is required.'
  } else if (!/^[a-z0-9_-]+$/.test(fields.slug.trim())) {
    errors.slug = 'Slug may only contain lowercase letters, numbers, underscores, and hyphens.'
  } else if (fields.slug.trim().length > 100) {
    errors.slug = 'Slug must be 100 characters or fewer.'
  }

  if (!fields.displayName.trim()) {
    errors.displayName = 'Display name is required.'
  } else if (fields.displayName.trim().length > 160) {
    errors.displayName = 'Display name must be 160 characters or fewer.'
  }

  if (!fields.subject.trim()) {
    errors.subjectTemplate = 'Subject is required.'
  } else if (fields.subject.trim().length > 500) {
    errors.subjectTemplate = 'Subject must be 500 characters or fewer.'
  }

  if (isHtmlEmpty(fields.bodyHtml)) {
    errors.bodyHtmlTemplate = 'Email body cannot be empty.'
  }

  if (fields.fromEmail.trim() && !isValidEmail(fields.fromEmail.trim())) {
    errors.fromEmail = 'Please enter a valid email address.'
  }

  if (fields.replyTo.trim() && !isValidEmail(fields.replyTo.trim())) {
    errors.replyTo = 'Please enter a valid email address.'
  }

  return errors
}

/** Map an API 400 response into user-facing field errors and/or a banner message. */
function parseApiError(
  errorCode: string,
  details: ZodFlattenedErrors | undefined,
): { fieldErrors: FieldErrors; banner: string | null } {
  const fieldErrors: FieldErrors = {}
  let banner: string | null = null

  if (errorCode === 'slug_conflict') {
    fieldErrors.slug = 'A template with this slug already exists. Choose a different slug.'
    return { fieldErrors, banner: null }
  }

  if (errorCode === 'unauthorized') {
    return { fieldErrors, banner: 'You are not authorised to perform this action.' }
  }

  if (errorCode === 'invalid_input' && details?.fieldErrors) {
    const fe = details.fieldErrors

    const pick = (key: string): string | undefined => fe[key]?.[0]

    const slugMsg = pick('slug')
    if (slugMsg) fieldErrors.slug = slugMsg

    const nameMsg = pick('displayName')
    if (nameMsg) fieldErrors.displayName = nameMsg

    const subjectMsg = pick('subjectTemplate')
    if (subjectMsg) fieldErrors.subjectTemplate = subjectMsg

    const bodyMsg = pick('bodyHtmlTemplate')
    if (bodyMsg) fieldErrors.bodyHtmlTemplate = bodyMsg

    const fromMsg = pick('fromEmail')
    if (fromMsg) fieldErrors.fromEmail = 'Please enter a valid email address.'

    const replyMsg = pick('replyTo')
    if (replyMsg) fieldErrors.replyTo = 'Please enter a valid email address.'

    if (Object.keys(fieldErrors).length === 0) {
      banner = 'Some fields contain invalid values. Please review and try again.'
    }
    return { fieldErrors, banner }
  }

  banner = 'Something went wrong while saving the template. Please try again.'
  return { fieldErrors, banner }
}

// ---- Component -------------------------------------------------------------

export function EmailTemplateEditor({ templateId, initial, variables, samplePlayers }: Props) {
  const router = useRouter()

  const [slug, setSlug] = React.useState(initial?.slug ?? '')
  const [slugTouched, setSlugTouched] = React.useState(false)
  const [displayName, setDisplayName] = React.useState(initial?.displayName ?? '')
  const [subject, setSubject] = React.useState(initial?.subjectTemplate ?? '')
  const [fromEmail, setFromEmail] = React.useState(initial?.fromEmail ?? '')
  const [replyTo, setReplyTo] = React.useState(initial?.replyTo ?? '')
  const [category, setCategory] = React.useState(initial?.category ?? '')
  const [bodyText, setBodyText] = React.useState(initial?.bodyTextTemplate ?? '')

  const [saving, setSaving] = React.useState(false)
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({})
  const [bannerError, setBannerError] = React.useState<string | null>(null)
  const [bannerSuccess, setBannerSuccess] = React.useState<string | null>(null)

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

  // Auto-generate slug from display name when creating a new template and the
  // slug has not been manually edited by the user.
  React.useEffect(() => {
    if (templateId || slugTouched || !displayName) return
    setSlug(autoSlug(displayName))
  }, [displayName, slugTouched, templateId])

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

  // Clear a specific field error once the user starts correcting it.
  function clearFieldError(field: keyof FieldErrors) {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  async function save(): Promise<void> {
    if (saving) return

    setBannerError(null)
    setBannerSuccess(null)

    const html = editor?.getHTML() ?? ''

    // Client-side validation — prevent a bad request from ever leaving the browser.
    const clientErrors = validateFields({
      slug,
      displayName,
      subject,
      bodyHtml: html,
      fromEmail,
      replyTo,
    })

    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors)
      return
    }

    setFieldErrors({})
    setSaving(true)

    try {
      const url = templateId
        ? `/api/admin/crm/email-templates/${templateId}`
        : `/api/admin/crm/email-templates`
      const method = templateId ? 'PUT' : 'POST'

      // Sanitize payload — trim strings, omit empty optionals as null.
      const payload = {
        slug: slug.trim(),
        displayName: displayName.trim(),
        subjectTemplate: subject.trim(),
        bodyHtmlTemplate: html,
        bodyTextTemplate: bodyText.trim() || null,
        fromEmail: fromEmail.trim() || null,
        replyTo: replyTo.trim() || null,
        category: category.trim() || null,
      }

      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = (await res.json().catch(() => null)) as
        | ApiErrorResponse
        | { id?: string; version?: number }
        | null

      if (!res.ok) {
        const errData = data as ApiErrorResponse | null
        const errorCode = errData?.error ?? 'unknown_error'
        const details = errData?.details

        if (res.status === 401) {
          setBannerError('Session expired. Please log in again.')
          return
        }
        if (res.status === 403) {
          setBannerError('You do not have permission to manage email templates.')
          return
        }
        if (res.status === 429) {
          setBannerError('Too many requests. Please wait a moment and try again.')
          return
        }
        if (res.status >= 500) {
          setBannerError('A server error occurred. Please try again or contact support.')
          return
        }

        const { fieldErrors: fe, banner } = parseApiError(errorCode, details)
        if (Object.keys(fe).length > 0) setFieldErrors(fe)
        if (banner) setBannerError(banner)
        return
      }

      const successData = data as { id?: string } | null
      if (!templateId && successData?.id) {
        router.push(`/admin/crm/email-templates/${successData.id}`)
      } else {
        setBannerSuccess('Template saved successfully.')
        router.refresh()
      }
    } catch {
      setBannerError('Network error — please check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  const hasFieldErrors = Object.keys(fieldErrors).length > 0
  const canSubmit =
    !saving && slug.trim().length > 0 && displayName.trim().length > 0 && subject.trim().length > 0

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        {bannerError ? (
          <div className="rounded-md border border-critical/40 bg-critical/10 px-4 py-3 text-sm text-critical">
            {bannerError}
          </div>
        ) : null}
        {bannerSuccess ? (
          <div className="rounded-md border border-positive/40 bg-positive/10 px-4 py-3 text-sm text-positive">
            {bannerSuccess}
          </div>
        ) : null}

        <div className="rounded-lg border border-line-subtle bg-surface p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Slug" required error={fieldErrors.slug}>
              <Input
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value)
                  setSlugTouched(true)
                  clearFieldError('slug')
                }}
                disabled={!!templateId}
                placeholder="welcome_intro"
                aria-invalid={!!fieldErrors.slug}
              />
            </Field>
            <Field label="Display name" required error={fieldErrors.displayName}>
              <Input
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value)
                  clearFieldError('displayName')
                }}
                placeholder="Welcome email"
                aria-invalid={!!fieldErrors.displayName}
              />
            </Field>
            <Field label="From email" error={fieldErrors.fromEmail}>
              <Input
                value={fromEmail}
                onChange={(e) => {
                  setFromEmail(e.target.value)
                  clearFieldError('fromEmail')
                }}
                placeholder="noreply@coinfrenzy.com"
                inputMode="email"
                aria-invalid={!!fieldErrors.fromEmail}
              />
            </Field>
            <Field label="Reply-to" error={fieldErrors.replyTo}>
              <Input
                value={replyTo}
                onChange={(e) => {
                  setReplyTo(e.target.value)
                  clearFieldError('replyTo')
                }}
                placeholder="support@coinfrenzy.com"
                inputMode="email"
                aria-invalid={!!fieldErrors.replyTo}
              />
            </Field>
            <Field label="Category">
              <Input value={category} onChange={(e) => setCategory(e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="rounded-lg border border-line-subtle bg-surface p-4">
          <Field label="Subject" required error={fieldErrors.subjectTemplate}>
            <Input
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value)
                clearFieldError('subjectTemplate')
              }}
              aria-invalid={!!fieldErrors.subjectTemplate}
            />
          </Field>
        </div>

        <div
          className={`rounded-lg border bg-surface p-4 ${
            fieldErrors.bodyHtmlTemplate ? 'border-critical/60' : 'border-line-subtle'
          }`}
        >
          <div className="mb-2 flex flex-wrap items-center gap-1">
            {editor ? <Toolbar editor={editor} /> : null}
            <div className="ml-auto">
              <VariablePicker variables={variables} onPick={insertVariable} />
            </div>
          </div>
          <EditorContent editor={editor} onInput={() => clearFieldError('bodyHtmlTemplate')} />
          {fieldErrors.bodyHtmlTemplate ? (
            <p className="mt-1 text-xs text-critical">{fieldErrors.bodyHtmlTemplate}</p>
          ) : null}
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
          <Button onClick={save} disabled={!canSubmit}>
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Saving…
              </span>
            ) : templateId ? (
              'Save new version'
            ) : (
              'Create template'
            )}
          </Button>
          {templateId && activeSample ? (
            <TestSendButton
              channel="email"
              templateId={templateId}
              samplePlayerId={activeSample.id}
            />
          ) : null}
          {hasFieldErrors && !bannerError ? (
            <span className="text-xs text-critical">
              Please fix the errors above before saving.
            </span>
          ) : null}
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

// ---- Toolbar ---------------------------------------------------------------

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

// ---- Field -----------------------------------------------------------------

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-ink-tertiary">
        {label}
        {required ? <span className="ml-0.5 text-critical">*</span> : null}
      </div>
      <div className="mt-1">{children}</div>
      {error ? <p className="mt-1 text-xs text-critical">{error}</p> : null}
    </div>
  )
}
