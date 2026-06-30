// docs/09 §5.1 — player auth surface.
//
// Players authenticate via Better Auth (configured in apps/web/lib/auth.ts).
// This module exposes the typed bits the rest of `core` and the web app
// need, but stays free of Better Auth-specific server imports so callers
// outside the web boundary (worker jobs, scripts) can still import it.

export * from './rg'

// Jurisdiction constants (BLOCKED_STATES, US_STATES, isBlockedState) live in
// @coinfrenzy/config so the player-facing client bundle can import them
// without dragging server-only deps (postgres, node:crypto) along.
// Re-exported here for convenience inside `core`.
export { BLOCKED_STATES, US_STATES, isBlockedState } from '@coinfrenzy/config'

export const PLAYER_SESSION_COOKIE = 'cf_player_session'

export interface JurisdictionCheck {
  allowed: boolean
  /**
   * When `allowed` is false: 'unknown_state' | 'state_blocked' | a specific
   * restriction reason. When `allowed` is true the field is null.
   */
  reason: string | null
}

/**
 * Lightweight jurisdiction check (docs/09 §8). Returns whether the player
 * can perform `action` from `state`. Real Radar geocoding lives in
 * `core/adapters/radar` (prompt 06).
 */
import { BLOCKED_STATES } from '@coinfrenzy/config'

export function checkJurisdiction(
  state: string | null | undefined,
  action: 'signup' | 'play_sc' | 'play_gc' | 'redeem' | 'purchase',
): JurisdictionCheck {
  if (!state) {
    if (action === 'play_gc') return { allowed: true, reason: null }
    return { allowed: false, reason: 'unknown_state' }
  }
  const upper = state.toUpperCase()
  if (BLOCKED_STATES.has(upper)) {
    if (action === 'play_gc' || action === 'signup') {
      // Allowed to sign up + play GC even from blocked states, but SC is
      // gated. The blocked-state flag on the player record drives the gate.
      return { allowed: true, reason: action === 'signup' ? 'gold_coin_only' : null }
    }
    return { allowed: false, reason: 'state_blocked' }
  }
  return { allowed: true, reason: null }
}
