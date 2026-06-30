export const OPTIONS = [
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '180d', label: '180 days' },
  { value: '1y', label: '1 year' },
  { value: 'all', label: 'All time' },
] as const

export type WindowValue = (typeof OPTIONS)[number]['value']

const VALID: ReadonlySet<string> = new Set(OPTIONS.map((o) => o.value))

export function parseWindow(value: string | string[] | undefined): WindowValue {
  if (typeof value === 'string' && VALID.has(value)) return value as WindowValue
  return '30d'
}
