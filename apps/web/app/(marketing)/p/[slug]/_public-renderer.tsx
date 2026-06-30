// Server-rendered version of the page-body renderer used by the admin
// preview. Styling matches the existing legal pages (Terms, Privacy)
// so dynamic CMS pages slot in next to the hardcoded ones seamlessly.
//
// IMPORTANT: NEVER use `dangerouslySetInnerHTML`. Inline markers are
// tokenised into real React nodes.

import * as React from 'react'

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

export function PublicPageBody({ body }: { body: string }): React.ReactElement {
  const parsed = parsePageBody(body)
  return (
    <>
      {parsed.intro.length > 0 ? <BlockList blocks={parsed.intro} /> : null}
      {parsed.sections.map((s, i) => (
        <section key={i}>
          <h2 className="cf-headline text-xl font-bold uppercase tracking-wider text-white">
            {s.title}
          </h2>
          <div className="mt-2 space-y-2">
            <BlockList blocks={s.blocks} />
          </div>
        </section>
      ))}
    </>
  )
}

function BlockList({ blocks }: { blocks: ParsedBlock[] }): React.ReactElement {
  return (
    <>
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
    </>
  )
}

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
        className="text-[var(--cf-gold-light)] underline-offset-2 hover:underline"
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
