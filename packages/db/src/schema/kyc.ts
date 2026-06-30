import { sql } from 'drizzle-orm'
import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'

import { createdAt, tstz, updatedAt } from './_shared'
import { players } from './players'

// docs/03 §2.3 — kyc_status.
// `manual_decision_by` FK to admins added in cross-FK migration (step 24).

export const kycStatus = pgTable(
  'kyc_status',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .unique()
      .references(() => players.id, { onDelete: 'restrict' }),

    footprintUserId: text('footprint_user_id').unique(),
    footprintStatus: text('footprint_status'),
    footprintManualReviewStatus: text('footprint_manual_review_status'),
    footprintCompletedAt: tstz('footprint_completed_at'),
    footprintStatusLastSynced: tstz('footprint_status_last_synced'),

    watchlistLastCheckAt: tstz('watchlist_last_check_at'),
    watchlistLastStatus: text('watchlist_last_status'),

    documentsUploaded: jsonb('documents_uploaded'),

    manualDecisionBy: uuid('manual_decision_by'),
    manualDecisionAt: tstz('manual_decision_at'),
    manualDecisionReason: text('manual_decision_reason'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('kyc_status_footprint_id_idx')
      .on(t.footprintUserId)
      .where(sql`${t.footprintUserId} is not null`),
    index('kyc_status_status_idx').on(t.footprintStatus),
    index('kyc_status_watchlist_idx').on(
      t.watchlistLastStatus,
      sql`${t.watchlistLastCheckAt} desc`,
    ),
  ],
)
