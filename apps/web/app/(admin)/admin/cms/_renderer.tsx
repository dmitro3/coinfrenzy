// Renderer for the tiny in-house markdown dialect — pure, no hooks,
// runs in both admin (client) preview and the public `/p/[slug]` route
// (server). We inline the parser here so the client bundle doesn't pull
// in `@coinfrenzy/core` (which has Drizzle / Postgres side effects).
//
// IMPORTANT: NEVER use `dangerouslySetInnerHTML`. Inline markers (bold,
// italic, link) are tokenised and rendered as React nodes directly.

import * as React from 'react'

// -------------------------------------------------------------------------
// Parser (duplicate of `@coinfrenzy/core/cms/markdown` — kept inline so
// the client bundle stays lean). Update both sides if you change syntax.
// -------------------------------------------------------------------------

interface ParsedSection {
  title: string
  blocks: ParsedBlock[]
}

type ParsedBlock = { kind: 'paragraph'; text: string } | { kind: 'list'; items: string[] }

interface ParsedPage {
  intro: ParsedBlock[]
  sections: ParsedSection[]
}

function parsePageBody(body: string): ParsedPage {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const chunks: { title: string | null; text: string }[] = []
  let current: { title: string | null; text: string } = { title: null, text: '' }
  for (const raw of lines) {
    const m = raw.match(/^##\s+(.+)/)
    if (m) {
      chunks.push(current)
      current = { title: m[1]!.trim(), text: '' }
    } else {
      current.text += raw + '\n'
    }
  }
  chunks.push(current)

  const intro = parseBlocks(chunks[0]?.text ?? '')
  const sections: ParsedSection[] = []
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i]!
    if (!chunk.title) continue
    sections.push({ title: chunk.title, blocks: parseBlocks(chunk.text) })
  }
  return { intro, sections }
}

function parseBlocks(text: string): ParsedBlock[] {
  const groups = text
    .split(/\n\s*\n/)
    .map((g) => g.trim())
    .filter(Boolean)
  const blocks: ParsedBlock[] = []
  for (const g of groups) {
    const lines = g
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    const isList = lines.every((l) => l.startsWith('- ') || l.startsWith('* '))
    if (isList && lines.length > 0) {
      blocks.push({ kind: 'list', items: lines.map((l) => l.replace(/^[-*]\s+/, '')) })
    } else {
      blocks.push({ kind: 'paragraph', text: lines.join(' ') })
    }
  }
  return blocks
}

// -------------------------------------------------------------------------
// Renderer
// -------------------------------------------------------------------------

export function PageRenderer({ body }: { body: string }): React.ReactElement {
  const parsed = parsePageBody(body || '')
  return (
    <div className="space-y-6 text-sm leading-relaxed text-ink-secondary">
      {parsed.intro.length > 0 ? <BlockList blocks={parsed.intro} /> : null}
      {parsed.sections.map((s, i) => (
        <section key={i}>
          <h2 className="mb-2 text-base font-semibold uppercase tracking-wide text-ink-primary">
            {s.title}
          </h2>
          <BlockList blocks={s.blocks} />
        </section>
      ))}
      {parsed.intro.length === 0 && parsed.sections.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-subtle px-3 py-6 text-center text-xs text-ink-tertiary">
          Empty page — add some content above.
        </p>
      ) : null}
    </div>
  )
}

function BlockList({ blocks }: { blocks: ParsedBlock[] }): React.ReactElement {
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => {
        if (b.kind === 'list') {
          return (
            <ul key={i} className="list-inside list-disc space-y-1 pl-2">
              {b.items.map((item, j) => (
                <li key={j}>
                  <Inline text={item} />
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p key={i}>
            <Inline text={b.text} />
          </p>
        )
      })}
    </div>
  )
}

// Tokenises **bold**, _italic_, and [label](url) into React nodes. The
// matcher does one pass per inline rule and recurses through fragments
// so the order is link → bold → italic.

function Inline({ text }: { text: string }): React.ReactElement {
  const nodes: React.ReactNode[] = []
  parseLinks(text, nodes)
  return <>{nodes}</>
}

function parseLinks(text: string, out: React.ReactNode[]): void {
  const re = /\[([^\]]+)\]\(([^)]+)\)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parseBold(text.slice(last, m.index), out)
    const label = m[1]!
    const href = sanitizeHref(m[2]!)
    out.push(
      <a
        key={`a-${m.index}`}
        href={href}
        className="text-brand underline-offset-2 hover:underline"
        rel="noopener noreferrer"
        target={href.startsWith('http') ? '_blank' : undefined}
      >
        {label}
      </a>,
    )
    last = re.lastIndex
  }
  if (last < text.length) parseBold(text.slice(last), out)
}

function parseBold(text: string, out: React.ReactNode[]): void {
  const re = /\*\*([^*]+)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parseItalic(text.slice(last, m.index), out)
    out.push(<strong key={`b-${m.index}`}>{m[1]}</strong>)
    last = re.lastIndex
  }
  if (last < text.length) parseItalic(text.slice(last), out)
}

function parseItalic(text: string, out: React.ReactNode[]): void {
  const re = /_([^_]+)_/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(<em key={`i-${m.index}`}>{m[1]}</em>)
    last = re.lastIndex
  }
  if (last < text.length) out.push(text.slice(last))
}

function sanitizeHref(href: string): string {
  const trimmed = href.trim()
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('vbscript:')
  ) {
    return '#'
  }
  return trimmed
}
