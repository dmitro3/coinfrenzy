/**
 * Minimal CSV serializer. Handles strings, numbers, bigints, dates, null/undefined.
 * For full Excel-safe output we'd write a BOM; left out to keep deps zero.
 */
export function rowsToCsv<T>(
  rows: T[],
  columns: Array<{ id: string; header: string; accessor: (row: T) => unknown }>,
): string {
  const lines: string[] = []
  lines.push(columns.map((c) => csvField(c.header)).join(','))
  for (const row of rows) {
    lines.push(columns.map((c) => csvField(serialize(c.accessor(row)))).join(','))
  }
  return lines.join('\n')
}

function serialize(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Trigger a CSV download in the browser. Returns the produced Blob URL so
 * callers can revoke it later if they want.
 */
export function downloadCsv(filename: string, csv: string): string {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  return url
}
