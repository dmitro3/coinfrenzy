'use client'

import * as React from 'react'

interface Arm {
  sent: number
  opened: number
  clicked: number
}

interface Props {
  variantA: Arm
  variantB: Arm
  metric: 'open_rate' | 'click_rate' | 'conversion'
  declaredWinner: string | null
}

interface AbResult {
  metric: string
  liftPct: number
  pValue: number
  significant: boolean
  recommendedWinner: 'a' | 'b' | 'tie'
  summary: string
  rateA: number
  rateB: number
}

export function AbWinnerCard({ variantA, variantB, metric, declaredWinner }: Props) {
  const [result, setResult] = React.useState<AbResult | null>(null)

  React.useEffect(() => {
    const successesA =
      metric === 'open_rate' ? variantA.opened : metric === 'click_rate' ? variantA.clicked : 0
    const successesB =
      metric === 'open_rate' ? variantB.opened : metric === 'click_rate' ? variantB.clicked : 0
    const r = computeAbStats(
      { n: variantA.sent, successes: successesA },
      { n: variantB.sent, successes: successesB },
      metric,
    )
    setResult(r)
  }, [variantA, variantB, metric])

  if (!result) return null

  return (
    <div className="rounded-lg border border-line-subtle bg-surface p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-ink-primary">A/B test</h3>
        <span className="text-xs text-ink-tertiary">
          Optimizing for{' '}
          <span className="font-medium text-ink-secondary">{metric.replace('_', ' ')}</span>
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ArmTile
          name="Variant A"
          arm={variantA}
          rate={result.rateA}
          metric={metric}
          highlight={result.recommendedWinner === 'a'}
        />
        <ArmTile
          name="Variant B"
          arm={variantB}
          rate={result.rateB}
          metric={metric}
          highlight={result.recommendedWinner === 'b'}
        />
      </div>

      <div className="mt-4 rounded-md border border-line-subtle bg-surface-elevated p-3 text-sm">
        <div className="flex items-center gap-2">
          <span
            className={
              result.significant
                ? 'inline-flex h-2 w-2 rounded-full bg-emerald-400'
                : 'inline-flex h-2 w-2 rounded-full bg-amber-400'
            }
          />
          <span className="font-medium text-ink-primary">
            {result.significant
              ? `Statistically significant (p = ${result.pValue.toFixed(3)})`
              : `Not yet significant (p = ${result.pValue.toFixed(3)})`}
          </span>
        </div>
        <p className="mt-1 text-xs text-ink-secondary">{result.summary}</p>
        {declaredWinner ? (
          <p className="mt-1 text-xs text-positive">
            Declared winner: <span className="font-semibold uppercase">{declaredWinner}</span>
          </p>
        ) : null}
      </div>
    </div>
  )
}

function ArmTile({
  name,
  arm,
  rate,
  metric,
  highlight,
}: {
  name: string
  arm: Arm
  rate: number
  metric: string
  highlight: boolean
}) {
  return (
    <div
      className={`rounded-md border p-3 ${
        highlight ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-line-subtle bg-surface'
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-ink-tertiary">{name}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-ink-primary">
        {(rate * 100).toFixed(2)}%
      </div>
      <div className="mt-0.5 text-xs text-ink-secondary">
        {metric.replace('_', ' ')} · {arm.sent.toLocaleString()} sent
      </div>
      <div className="mt-2 text-xs text-ink-tertiary">
        Opens {arm.opened.toLocaleString()} · Clicks {arm.clicked.toLocaleString()}
      </div>
    </div>
  )
}

const MIN_N = 100

function computeAbStats(
  a: { n: number; successes: number },
  b: { n: number; successes: number },
  metric: string,
): AbResult {
  const rateA = a.n > 0 ? a.successes / a.n : 0
  const rateB = b.n > 0 ? b.successes / b.n : 0
  if (a.n < MIN_N || b.n < MIN_N) {
    return {
      metric,
      liftPct: 0,
      pValue: 1,
      significant: false,
      recommendedWinner: 'tie',
      summary: `Need at least ${MIN_N} per arm to read significance. Currently A=${a.n}, B=${b.n}.`,
      rateA,
      rateB,
    }
  }
  const p = (a.successes + b.successes) / (a.n + b.n)
  const se = Math.sqrt(p * (1 - p) * (1 / a.n + 1 / b.n))
  if (se === 0) {
    return {
      metric,
      liftPct: 0,
      pValue: 1,
      significant: false,
      recommendedWinner: 'tie',
      summary: 'Identical conversion rates so far.',
      rateA,
      rateB,
    }
  }
  const z = (rateB - rateA) / se
  const pValue = 2 * (1 - normalCdf(Math.abs(z)))
  const significant = pValue < 0.05
  const lift = rateA > 0 ? ((rateB - rateA) / rateA) * 100 : 0
  const winner: 'a' | 'b' | 'tie' = significant ? (rateB > rateA ? 'b' : 'a') : 'tie'
  return {
    metric,
    liftPct: lift,
    pValue,
    significant,
    recommendedWinner: winner,
    rateA,
    rateB,
    summary: significant
      ? `${winner === 'b' ? 'B' : 'A'} beats the other by ${Math.abs(lift).toFixed(1)}% on ${metric.replace('_', ' ')} with 95% confidence.`
      : `Lift currently ${lift.toFixed(1)}% — not enough evidence to call a winner.`,
  }
}

function normalCdf(x: number): number {
  return (1 + erf(x / Math.sqrt(2))) / 2
}

function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x))
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x)
  return x < 0 ? -y : y
}
