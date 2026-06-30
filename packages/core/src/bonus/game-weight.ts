// docs/06 §7 — per-bonus override > game category > specific game id > bonus
// default > game default. Weight is a decimal 0.0 .. 1.0.

export interface GameForWeight {
  id: string
  category: string
  playthroughWeight: number
}

export interface AwardForWeight {
  /** `bonuses_awarded.game_weight_overrides_snapshot` (JSONB). */
  gameWeightOverridesSnapshot: Record<string, unknown> | null | undefined
}

/**
 * Per docs/06 §7. Override keys, in order of precedence:
 *   1. `game:<game.id>` — exact game id
 *   2. `<category>` — game category (e.g. `slots`, `table`)
 *   3. `default` — fallback for this bonus only
 *
 * If no override applies, the game's own `playthroughWeight` is used.
 *
 * Weights outside [0, 1] are clamped to that range to keep contribution math
 * from going negative or exceeding the bet.
 */
export function computeGameWeight(award: AwardForWeight, game: GameForWeight): number {
  const overrides = award.gameWeightOverridesSnapshot
  if (overrides && typeof overrides === 'object') {
    const map = overrides as Record<string, unknown>
    const byGame = map[`game:${game.id}`]
    if (typeof byGame === 'number' || typeof byGame === 'string') {
      return clamp(Number(byGame))
    }
    const byCategory = map[game.category]
    if (typeof byCategory === 'number' || typeof byCategory === 'string') {
      return clamp(Number(byCategory))
    }
    const fallback = map.default
    if (typeof fallback === 'number' || typeof fallback === 'string') {
      return clamp(Number(fallback))
    }
  }
  return clamp(game.playthroughWeight)
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/**
 * Apply a 0..1 weight to a money-minor-unit bet. Per docs/06 §7 we use 4
 * decimals of weight precision (multiply by 10_000 then divide); that gives
 * us a max rounding error of <1 minor unit per bet which is acceptable
 * (and conservative — the rounding always biases against the player, so a
 * playthrough completion is genuine).
 */
export function applyWeightToAmount(amount: bigint, weight: number): bigint {
  if (weight <= 0) return 0n
  if (weight >= 1) return amount
  const scaled = BigInt(Math.floor(weight * 10_000))
  return (amount * scaled) / 10_000n
}
