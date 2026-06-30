// docs/13 §6.1 — webhook dual-capture flag.
//
// During the T-30 to T-0 window we want webhooks persisted in
// pending_webhooks but NOT dispatched to Inngest. This module reads the
// system_config.webhook_dual_capture row and exposes a typed view of
// "is dual-capture on right now, and for which providers?" so the
// webhook receiver routes can branch on it.

import { eq } from 'drizzle-orm'

import { schema, type DbExecutor } from '@coinfrenzy/db'

export type DualCaptureProvider = 'finix' | 'alea' | 'footprint'

export interface DualCaptureConfig {
  enabled: boolean
  /** ISO timestamp when capture began. null = not currently active. */
  since: string | null
  providers: DualCaptureProvider[]
  notes?: string
}

const DEFAULT: DualCaptureConfig = {
  enabled: false,
  since: null,
  providers: ['finix', 'alea', 'footprint'],
}

const VALID_PROVIDERS: DualCaptureProvider[] = ['finix', 'alea', 'footprint']

export async function getDualCaptureConfig(db: DbExecutor): Promise<DualCaptureConfig> {
  const rows = await db
    .select({ value: schema.systemConfig.value })
    .from(schema.systemConfig)
    .where(eq(schema.systemConfig.key, 'webhook_dual_capture'))
    .limit(1)
  if (!rows[0]) return DEFAULT
  const raw = (rows[0].value ?? {}) as Record<string, unknown>
  const enabled = raw['enabled'] === true
  const since = typeof raw['since'] === 'string' ? (raw['since'] as string) : null
  const providers = Array.isArray(raw['providers'])
    ? (raw['providers'] as unknown[]).filter((p): p is DualCaptureProvider =>
        VALID_PROVIDERS.includes(p as DualCaptureProvider),
      )
    : DEFAULT.providers
  return {
    enabled,
    since,
    providers,
    notes: typeof raw['notes'] === 'string' ? (raw['notes'] as string) : undefined,
  }
}

export async function setDualCaptureConfig(
  db: DbExecutor,
  next: { enabled: boolean; providers?: DualCaptureProvider[] },
  actorId?: string,
): Promise<DualCaptureConfig> {
  const current = await getDualCaptureConfig(db)
  const updated: DualCaptureConfig = {
    enabled: next.enabled,
    since: next.enabled ? (current.since ?? new Date().toISOString()) : null,
    providers: next.providers ?? current.providers,
    notes: current.notes,
  }
  await db
    .update(schema.systemConfig)
    .set({
      value: updated as unknown as Record<string, unknown>,
      updatedAt: new Date(),
      updatedBy: actorId ?? null,
    })
    .where(eq(schema.systemConfig.key, 'webhook_dual_capture'))
  return updated
}

/**
 * Returns true if the receiver should SKIP Inngest dispatch for the
 * given provider. Used by every webhook route handler.
 */
export async function shouldSuppressDispatch(db: DbExecutor, provider: string): Promise<boolean> {
  if (!VALID_PROVIDERS.includes(provider as DualCaptureProvider)) return false
  const cfg = await getDualCaptureConfig(db)
  if (!cfg.enabled) return false
  return cfg.providers.includes(provider as DualCaptureProvider)
}
