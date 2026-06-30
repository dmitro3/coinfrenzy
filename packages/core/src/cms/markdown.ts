// Tiny in-house markdown dialect — browser-safe, ZERO dependencies.
// Both the admin live preview and the public `/p/[slug]` renderer pull
// from this file. It deliberately does NOT import Drizzle, Postgres,
// or anything else server-only.
//
// Syntax (intentionally tiny):
//
//   ## Section heading
//   Paragraph text on one or more lines.
//
//   Another paragraph.
//
//   - List item
//   - Another item
//
//   ## Next section
//   ...

export interface ParsedSection {
  title: string
  blocks: ParsedBlock[]
}

export type ParsedBlock = { kind: 'paragraph'; text: string } | { kind: 'list'; items: string[] }

export interface ParsedPage {
  intro: ParsedBlock[]
  sections: ParsedSection[]
}

export function parsePageBody(body: string): ParsedPage {
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

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}
