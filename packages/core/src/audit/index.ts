import { type DbExecutor } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

/**
 * Append a row to `audit_log`. The table is append-only — UPDATE/DELETE
 * are rejected by Postgres rules (docs/09 §6).
 *
 * Use this from every admin-facing API route that mutates state. For
 * auth events (login, logout, 2FA enable), the API routes call this
 * directly. For business-domain mutations, call from the relevant
 * service-layer function.
 */
export interface AuditEntryInput {
  actorKind: 'admin' | 'player' | 'system'
  actorId?: string | null
  actorRole?: string | null
  action: string
  resourceKind?: string | null
  resourceId?: string | null
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  reason?: string | null
  ip?: string | null
  userAgent?: string | null
  requestId?: string | null
  metadata?: Record<string, unknown>
}

export async function writeAuditEntry(db: DbExecutor, entry: AuditEntryInput): Promise<void> {
  await db.insert(schema.auditLog).values({
    actorKind: entry.actorKind,
    actorId: entry.actorId ?? null,
    actorRole: entry.actorRole ?? null,
    action: entry.action,
    resourceKind: entry.resourceKind ?? null,
    resourceId: entry.resourceId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
    ip: entry.ip ?? null,
    userAgent: entry.userAgent ?? null,
    requestId: entry.requestId ?? null,
    metadata: entry.metadata ?? {},
  })
}
