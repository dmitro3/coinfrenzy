// docs/11 §4.5 — A/B winner statistical significance.
//
// Given two arms of a campaign (sent + conversions for variant A and
// variant B), compute the lift, the z-score, the two-sided p-value, and
// whether the result clears the 95% threshold. Used by the campaign
// detail performance panel to surface a "Significant at 95%" pill.
//
// We use the standard two-proportion z-test with a pooled estimate.
// This is fine for the rates we deal with (open/click/conversion);
// for very small N (< 30) the test is unreliable so we report
// "Not enough data" instead of a number.

export interface AbArmStats {
  /** How many recipients in this arm. */
  n: number
  /** How many of them converted on the metric. */
  successes: number
}

export interface AbSignificanceResult {
  rateA: number
  rateB: number
  lift: number
  /** When defined, two-sided p-value of the difference. */
  pValue: number | null
  zScore: number | null
  significantAt95: boolean
  /** Plain-English summary; safe to render verbatim. */
  summary: string
  winner: 'A' | 'B' | 'tie' | null
}

const MIN_N_PER_ARM = 30

export function abSignificance(a: AbArmStats, b: AbArmStats): AbSignificanceResult {
  const rateA = a.n > 0 ? a.successes / a.n : 0
  const rateB = b.n > 0 ? b.successes / b.n : 0
  const lift = rateA > 0 ? (rateB - rateA) / rateA : 0

  if (a.n < MIN_N_PER_ARM || b.n < MIN_N_PER_ARM) {
    return {
      rateA,
      rateB,
      lift,
      pValue: null,
      zScore: null,
      significantAt95: false,
      summary:
        a.n < MIN_N_PER_ARM || b.n < MIN_N_PER_ARM
          ? `Need at least ${MIN_N_PER_ARM} per arm — currently A=${a.n}, B=${b.n}`
          : 'Insufficient data',
      winner: null,
    }
  }

  // Pooled proportion
  const pooled = (a.successes + b.successes) / (a.n + b.n)
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.n + 1 / b.n))
  if (se === 0) {
    return {
      rateA,
      rateB,
      lift,
      pValue: null,
      zScore: null,
      significantAt95: false,
      summary: 'No variance — both arms identical',
      winner: rateA === rateB ? 'tie' : rateA > rateB ? 'A' : 'B',
    }
  }

  const z = (rateB - rateA) / se
  const p = 2 * (1 - normalCdf(Math.abs(z)))
  const significant = p < 0.05

  let winner: 'A' | 'B' | 'tie' | null = null
  if (rateA === rateB) winner = 'tie'
  else if (rateB > rateA) winner = 'B'
  else winner = 'A'

  const pct = (n: number) => `${(n * 100).toFixed(2)}%`
  const summary = significant
    ? `${winner === 'B' ? 'B' : 'A'} wins (${pct(rateB)} vs ${pct(rateA)}, p=${p.toFixed(3)})`
    : `Not significant (${pct(rateB)} vs ${pct(rateA)}, p=${p.toFixed(3)})`

  return {
    rateA,
    rateB,
    lift,
    pValue: p,
    zScore: z,
    significantAt95: significant,
    summary,
    winner,
  }
}

/** Standard normal cumulative distribution function (Abramowitz & Stegun 7.1.26). */
function normalCdf(x: number): number {
  // Constants for the approximation.
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911

  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x) / Math.sqrt(2)

  const t = 1 / (1 + p * ax)
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax)
  return 0.5 * (1 + sign * y)
}
