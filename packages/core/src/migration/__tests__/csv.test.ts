import { describe, expect, it } from 'vitest'

import { CsvParseError, parseCsv } from '../csv'

describe('parseCsv', () => {
  it('parses a simple csv', () => {
    const csv = 'a,b,c\n1,2,3\n4,5,6\n'
    const parsed = parseCsv('test.csv', csv)
    expect(parsed.headers).toEqual(['a', 'b', 'c'])
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0]).toEqual({ a: '1', b: '2', c: '3' })
    expect(parsed.rows[1]).toEqual({ a: '4', b: '5', c: '6' })
  })

  it('handles quoted fields with commas', () => {
    const csv = 'name,note\n"Doe, Jane","comma inside"\n'
    const parsed = parseCsv('test.csv', csv)
    expect(parsed.rows[0].name).toBe('Doe, Jane')
    expect(parsed.rows[0].note).toBe('comma inside')
  })

  it('handles escaped double quotes inside fields', () => {
    const csv = 'name\n"She said ""hi"""\n'
    const parsed = parseCsv('test.csv', csv)
    expect(parsed.rows[0].name).toBe('She said "hi"')
  })

  it('handles CRLF line endings', () => {
    const csv = 'a,b\r\n1,2\r\n3,4\r\n'
    const parsed = parseCsv('test.csv', csv)
    expect(parsed.rows).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ])
  })

  it('handles UTF-8 BOM', () => {
    const csv = '\ufeffa,b\n1,2\n'
    const parsed = parseCsv('test.csv', csv)
    expect(parsed.headers).toEqual(['a', 'b'])
    expect(parsed.rows[0]).toEqual({ a: '1', b: '2' })
  })

  it('throws on ragged rows', () => {
    const csv = 'a,b,c\n1,2\n'
    expect(() => parseCsv('test.csv', csv)).toThrow(CsvParseError)
  })

  it('throws on unterminated quotes', () => {
    const csv = 'a\n"unclosed\n'
    expect(() => parseCsv('test.csv', csv)).toThrow(CsvParseError)
  })

  it('ignores trailing newlines', () => {
    const csv = 'a\n1\n\n'
    const parsed = parseCsv('test.csv', csv)
    expect(parsed.rows).toEqual([{ a: '1' }])
  })

  it('throws on duplicate headers', () => {
    const csv = 'a,a\n1,2\n'
    expect(() => parseCsv('test.csv', csv)).toThrow(CsvParseError)
  })
})
