import { eq } from 'drizzle-orm'

import { adapters, bonus as bonusEngine } from '@coinfrenzy/core'
import { schema } from '@coinfrenzy/db'

import { inngest } from '../inngest/client'
import { buildWorkerContext } from '../lib/context'

// docs/06 §11 — EasyScam (AMOE) poller. Runs every 15 minutes. Each new
// entry is attributed to a player (by email or phone) and awarded the
// singleton `amoe_default` bonus template.

export const pollEasyScam = inngest.createFunction(
  { id: 'poll-easyscam' },
  { cron: '*/15 * * * *' },
  async ({ step }) => {
    const { ctx, flushAfterCommit } = buildWorkerContext({
      loggerBindings: { job: 'poll-easyscam' },
    })
    const client = adapters.easyscam.getEasyScamClient()

    const result = await step.run('fetch', async () => client.fetchNewEntries({ limit: 50 }))

    if (result.entries.length === 0) {
      ctx.logger.info('easyscam_poll_empty', { mode: client.mode })
      return { fetched: 0, awarded: 0, mode: client.mode }
    }

    let awarded = 0
    for (const entry of result.entries) {
      const player = await findPlayerByIdentifier(ctx, entry.identifier)
      if (!player) {
        ctx.logger.warn('easyscam_entry_unmatched', {
          externalId: entry.externalId,
          identifier: entry.identifier,
        })
        continue
      }

      const awardResult = await bonusEngine.awardBySlug(ctx, bonusEngine.BONUS_SLUGS.amoe, {
        playerId: player.id,
        sourceKind: 'easyscam',
        sourceId: entry.externalId,
        reason: `AMOE entry postmarked ${entry.postmarkedAt}`,
      })

      if (!awardResult.ok) {
        ctx.logger.info('easyscam_award_skipped', {
          externalId: entry.externalId,
          playerId: player.id,
          code: awardResult.error.code,
        })
        continue
      }
      if (awardResult.value.status === 'awarded') awarded += 1
    }

    await flushAfterCommit()
    return { fetched: result.entries.length, awarded, mode: client.mode }
  },
)

async function findPlayerByIdentifier(
  ctx: ReturnType<typeof buildWorkerContext>['ctx'],
  identifier: string,
): Promise<{ id: string } | null> {
  const ident = identifier.trim()
  if (!ident) return null
  // Email path first (most common).
  if (ident.includes('@')) {
    const rows = await ctx.db
      .select({ id: schema.players.id })
      .from(schema.players)
      .where(eq(schema.players.email, ident.toLowerCase()))
      .limit(1)
    return rows[0] ?? null
  }
  // Phone path (E.164 ideally).
  const rows = await ctx.db
    .select({ id: schema.players.id })
    .from(schema.players)
    .where(eq(schema.players.phone, ident))
    .limit(1)
  return rows[0] ?? null
}
