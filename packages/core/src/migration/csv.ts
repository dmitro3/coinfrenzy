// docs/13 §3.1 — CSV parser for Gamma snapshot files.
//
// Hand-rolled (no dependency) because the format is forgiving: Gamma's
// exports use RFC 4180 with double-quoted fields when a comma or
// newline appears inside the value. We DO NOT cast types here — every
// field is left as a string. Casting is the transform layer's job, so
// the parser stays uniform across every snapshot file.

import type { ParsedCsv } from './types'

/**
 * Parses a CSV string into headers + rows. Rules:
 *   - Comma is the field delimiter.
 *   - Fields may be wrapped in double quotes.
 *   - Inside a quoted field, "" represents an escaped double quote.
 *   - Quoted fields may contain newlines.
 *   - Empty trailing newlines are ignored.
 *
 * Throws on structural errors (unterminated quote, ragged row width).
 */
export function parseCsv(filename: string, contents: string): ParsedCsv {
  const normalized = stripBom(contents)
  const cells = tokenizeCsv(normalized)
  if (cells.length === 0) {
    return { filename, headers: [], rows: [] }
  }

  const headers = cells[0].map((h) => h.trim())
  const seen = new Set<string>()
  for (const h of headers) {
    if (h.length === 0) {
      throw new CsvParseError(`${filename}: header row has an empty cell`, 1)
    }
    if (seen.has(h)) {
      throw new CsvParseError(`${filename}: duplicate header "${h}"`, 1)
    }
    seen.add(h)
  }

  const rows: Record<string, string>[] = []
  for (let i = 1; i < cells.length; i++) {
    const raw = cells[i]
    if (raw.length === 0) continue
    if (raw.length === 1 && raw[0] === '') continue // trailing blank line
    if (raw.length !== headers.length) {
      throw new CsvParseError(
        `${filename}: row ${i + 1} has ${raw.length} cells, expected ${headers.length}`,
        i + 1,
      )
    }
    const row: Record<string, string> = {}
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = raw[c]
    }
    rows.push(row)
  }
  return { filename, headers, rows }
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

function tokenizeCsv(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const len = input.length

  while (i < len) {
    const ch = input[i]

    if (inQuotes) {
      if (ch === '"') {
        // Look ahead for escaped quote
        if (i + 1 < len && input[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i += 1
      continue
    }
    if (ch === '\r') {
      // CRLF or bare CR ends a row
      row.push(field)
      field = ''
      rows.push(row)
      row = []
      if (i + 1 < len && input[i + 1] === '\n') {
        i += 2
      } else {
        i += 1
      }
      continue
    }
    if (ch === '\n') {
      row.push(field)
      field = ''
      rows.push(row)
      row = []
      i += 1
      continue
    }
    field += ch
    i += 1
  }

  if (inQuotes) {
    throw new CsvParseError('unterminated quoted field', rows.length + 1)
  }

  // Final field/row if no trailing newline
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

export class CsvParseError extends Error {
  constructor(
    message: string,
    readonly lineNumber: number,
  ) {
    super(message)
    this.name = 'CsvParseError'
  }
}
