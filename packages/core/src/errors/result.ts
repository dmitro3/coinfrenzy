// Per docs/02 §4: every exported core function returns Promise<Result<T, E>>.
// Throwing across module boundaries makes the call graph unreadable and
// forces callers to remember which exceptions to catch. A Result type makes
// failure visible in the type system.
//
// We deliberately ship a minimal implementation (~20 lines) instead of pulling
// in `neverthrow` — keep dependencies minimal.

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok
}

export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok
}

/** Map the success value; pass error through. */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result
}

/** Throw if the result is an error — for places where failure is genuinely unexpected (tests, fixtures). */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value
  throw new Error(`unwrap called on Err: ${JSON.stringify(result.error)}`)
}
