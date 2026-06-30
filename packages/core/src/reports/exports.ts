import { sql } from 'drizzle-orm'

import type { DbExecutor } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { err, ok, type Result } from '../errors/result'

// docs/12 §7 + docs/08 §12 — the Export Center pipeline.
//
// API → row in `exports` (status='pending') → Inngest event
//   → worker generates CSV → uploads to R2 → updates row → emails admin.
//
// This file is the schema/IO surface; the worker job composes it.

export type ExportType =
  | 'players'
  | 'purchases'
  | 'redemptions'
  | 'bonuses_awarded'
  | 'daily_kpis'
  | 'audit_log'
  | 'crm_message_log'
  | 'affiliates'
  | 'ledger_entries'
  | 'game_rounds'
  | 'wallets_snapshot'
  | 'promo_redemptions'
  | 'kyc_status'
  | 'tier_history'
  | 'custom'

/**
 * Export types that are point-in-time snapshots (no date filter applies).
 * The UI should hide the From/To inputs when one of these is selected.
 */
export const SNAPSHOT_EXPORT_TYPES: ReadonlySet<ExportType> = new Set([
  'wallets_snapshot',
  'kyc_status',
  'affiliates',
])

export interface ExportFilter {
  /** Inclusive lower bound (ISO date). */
  fromDate?: string
  /** Inclusive upper bound (ISO date). */
  toDate?: string
  /** Free-form additional filters interpreted by the type-specific runner. */
  extra?: Record<string, unknown>
}

export interface CreateExportInput {
  adminId: string
  exportType: ExportType
  filter?: ExportFilter
  /** For `custom` exports: the CustomQuery spec verbatim. */
  customSpec?: unknown
  reason?: string
  /** Compliance exports require a review pass. */
  requiresReview?: boolean
}

export type CreateExportError = { code: 'invalid_type' } | { code: 'missing_spec' }

export async function createExportRequest(
  db: DbExecutor,
  input: CreateExportInput,
): Promise<Result<{ id: string; status: string }, CreateExportError>> {
  if (input.exportType === 'custom' && !input.customSpec) {
    return err({ code: 'missing_spec' })
  }

  const querySpec = {
    type: input.exportType,
    filter: input.filter ?? {},
    customSpec: input.customSpec ?? null,
  }

  const [row] = await db
    .insert(schema.dataExports)
    .values({
      adminId: input.adminId,
      exportType: input.exportType,
      querySpec,
      status: 'pending',
      requiresReview: input.requiresReview ?? false,
      reason: input.reason ?? null,
    })
    .returning({ id: schema.dataExports.id, status: schema.dataExports.status })

  if (!row) return err({ code: 'invalid_type' })
  return ok({ id: row.id, status: row.status })
}

export interface ExportRowDescriptor {
  exportType: ExportType
  /** SQL the worker streams. Already parameterised. */
  query: ReturnType<typeof sql>
  /** Stable column order written to the CSV header. */
  headers: string[]
}

/** Build the SQL fragment + header list for a pre-built export type. */
export function buildPrebuiltExport(
  exportType: ExportType,
  filter: ExportFilter | undefined,
): ExportRowDescriptor | null {
  const from = filter?.fromDate
    ? sql`${filter.fromDate}::timestamptz`
    : sql`'-infinity'::timestamptz`
  const to = filter?.toDate
    ? sql`(${filter.toDate}::timestamptz + INTERVAL '1 day')`
    : sql`'infinity'::timestamptz`

  switch (exportType) {
    case 'players':
      return {
        exportType,
        query: sql`
          SELECT id, email, username, display_name, state, country, status,
                 kyc_level, first_seen_at, last_seen_at, last_login_at, created_at
          FROM players
          WHERE created_at >= ${from} AND created_at < ${to}
            AND deleted_at IS NULL
          ORDER BY created_at DESC
        `,
        headers: [
          'id',
          'email',
          'username',
          'display_name',
          'state',
          'country',
          'status',
          'kyc_level',
          'first_seen_at',
          'last_seen_at',
          'last_login_at',
          'created_at',
        ],
      }
    case 'purchases':
      return {
        exportType,
        query: sql`
          SELECT id, player_id, package_id, amount_usd, amount_cents, status,
                 promo_code, finix_card_brand, finix_card_last4, finix_3ds_result,
                 finix_avs_result, state_at_purchase, created_at, completed_at
          FROM purchases
          WHERE created_at >= ${from} AND created_at < ${to}
          ORDER BY created_at DESC
        `,
        headers: [
          'id',
          'player_id',
          'package_id',
          'amount_usd',
          'amount_cents',
          'status',
          'promo_code',
          'finix_card_brand',
          'finix_card_last4',
          'finix_3ds_result',
          'finix_avs_result',
          'state_at_purchase',
          'created_at',
          'completed_at',
        ],
      }
    case 'redemptions':
      return {
        exportType,
        query: sql`
          SELECT id, player_id, amount_sc, amount_usd, method, status,
                 rejection_category, state_at_request, submitted_to_finix_at,
                 paid_at, requested_at
          FROM redemptions
          WHERE requested_at >= ${from} AND requested_at < ${to}
          ORDER BY requested_at DESC
        `,
        headers: [
          'id',
          'player_id',
          'amount_sc',
          'amount_usd',
          'method',
          'status',
          'rejection_category',
          'state_at_request',
          'submitted_to_finix_at',
          'paid_at',
          'requested_at',
        ],
      }
    case 'bonuses_awarded':
      return {
        exportType,
        query: sql`
          SELECT ba.id, ba.player_id, ba.bonus_id, b.bonus_type, ba.gc_amount, ba.sc_amount,
                 ba.playthrough_required, ba.playthrough_progress, ba.playthrough_complete,
                 ba.expires_at, ba.status, ba.source_kind, ba.created_at, ba.completed_at
          FROM bonuses_awarded ba
          JOIN bonuses b ON b.id = ba.bonus_id
          WHERE ba.created_at >= ${from} AND ba.created_at < ${to}
          ORDER BY ba.created_at DESC
        `,
        headers: [
          'id',
          'player_id',
          'bonus_id',
          'bonus_type',
          'gc_amount',
          'sc_amount',
          'playthrough_required',
          'playthrough_progress',
          'playthrough_complete',
          'expires_at',
          'status',
          'source_kind',
          'created_at',
          'completed_at',
        ],
      }
    case 'daily_kpis':
      return {
        exportType,
        query: sql`
          SELECT date, day_of_week, dau, unique_logins, new_registered_players,
                 total_sc_staked, total_sc_won, total_ggr_sc, total_ngr_sc,
                 total_deposits_usd, depositors_count, first_time_purchasers,
                 withdrawals_completed_usd, bonus_total
          FROM daily_operational_snapshots
          WHERE date >= ${filter?.fromDate ?? '0001-01-01'}::date
            AND date <= ${filter?.toDate ?? '9999-12-31'}::date
          ORDER BY date DESC
        `,
        headers: [
          'date',
          'day_of_week',
          'dau',
          'unique_logins',
          'new_registered_players',
          'total_sc_staked',
          'total_sc_won',
          'total_ggr_sc',
          'total_ngr_sc',
          'total_deposits_usd',
          'depositors_count',
          'first_time_purchasers',
          'withdrawals_completed_usd',
          'bonus_total',
        ],
      }
    case 'audit_log':
      return {
        exportType,
        query: sql`
          SELECT id, actor_kind, actor_id, actor_role, action, resource_kind, resource_id,
                 reason, ip, user_agent, occurred_at
          FROM audit_log
          WHERE occurred_at >= ${from} AND occurred_at < ${to}
          ORDER BY occurred_at DESC
        `,
        headers: [
          'id',
          'actor_kind',
          'actor_id',
          'actor_role',
          'action',
          'resource_kind',
          'resource_id',
          'reason',
          'ip',
          'user_agent',
          'occurred_at',
        ],
      }
    case 'crm_message_log':
      return {
        exportType,
        query: sql`
          SELECT id, player_id, channel, status, template_id, campaign_id, subject,
                 sent_at, delivered_at, opened_at, clicked_at, created_at
          FROM crm_message_log
          WHERE created_at >= ${from} AND created_at < ${to}
          ORDER BY created_at DESC
        `,
        headers: [
          'id',
          'player_id',
          'channel',
          'status',
          'template_id',
          'campaign_id',
          'subject',
          'sent_at',
          'delivered_at',
          'opened_at',
          'clicked_at',
          'created_at',
        ],
      }
    case 'affiliates':
      return {
        exportType,
        query: sql`
          SELECT id, username, email, display_name, status, revenue_share_pct,
                 total_signups_attributed, total_active_attributed,
                 total_ngr_attributed_sc, total_payouts_sc, pending_payout_sc,
                 created_at
          FROM affiliates
          ORDER BY total_ngr_attributed_sc DESC
        `,
        headers: [
          'id',
          'username',
          'email',
          'display_name',
          'status',
          'revenue_share_pct',
          'total_signups_attributed',
          'total_active_attributed',
          'total_ngr_attributed_sc',
          'total_payouts_sc',
          'pending_payout_sc',
          'created_at',
        ],
      }
    case 'ledger_entries':
      // docs/04 — every coin movement. Required for auditors and AML reviews.
      // Filter on created_at hits the monthly partition pruning.
      return {
        exportType,
        query: sql`
          SELECT id, source, source_id, pair_id, leg, account_kind, account_id,
                 player_id, amount, currency, sub_bucket, balance_after, created_at
          FROM ledger_entries
          WHERE created_at >= ${from} AND created_at < ${to}
          ORDER BY created_at DESC
        `,
        headers: [
          'id',
          'source',
          'source_id',
          'pair_id',
          'leg',
          'account_kind',
          'account_id',
          'player_id',
          'amount',
          'currency',
          'sub_bucket',
          'balance_after',
          'created_at',
        ],
      }
    case 'game_rounds':
      // docs/04 — bet + outcome history. Used by game-integrity and RTP audits.
      return {
        exportType,
        query: sql`
          SELECT id, session_id, player_id, game_id, external_round_id,
                 bet_amount, win_amount, currency, status,
                 bet_at, won_at, created_at
          FROM game_rounds
          WHERE created_at >= ${from} AND created_at < ${to}
          ORDER BY created_at DESC
        `,
        headers: [
          'id',
          'session_id',
          'player_id',
          'game_id',
          'external_round_id',
          'bet_amount',
          'win_amount',
          'currency',
          'status',
          'bet_at',
          'won_at',
          'created_at',
        ],
      }
    case 'wallets_snapshot':
      // Point-in-time dump of every wallet. No date filter (current balance only).
      // Use this for end-of-period reconciliation against the ledger.
      return {
        exportType,
        query: sql`
          SELECT player_id, currency, current_balance, balance_purchased,
                 balance_bonus, balance_promo, balance_earned,
                 playthrough_required, playthrough_progress, updated_at
          FROM wallets
          ORDER BY player_id, currency
        `,
        headers: [
          'player_id',
          'currency',
          'current_balance',
          'balance_purchased',
          'balance_bonus',
          'balance_promo',
          'balance_earned',
          'playthrough_required',
          'playthrough_progress',
          'updated_at',
        ],
      }
    case 'promo_redemptions':
      // Marketing reporting — how often each code was used, by whom, for what.
      return {
        exportType,
        query: sql`
          SELECT pr.id, pc.code, pc.kind AS promo_kind, pr.player_id,
                 pr.bonus_award_id, pr.context, pr.redeemed_at
          FROM promo_redemptions pr
          JOIN promo_codes pc ON pc.id = pr.promo_code_id
          WHERE pr.redeemed_at >= ${from} AND pr.redeemed_at < ${to}
          ORDER BY pr.redeemed_at DESC
        `,
        headers: [
          'id',
          'code',
          'promo_kind',
          'player_id',
          'bonus_award_id',
          'context',
          'redeemed_at',
        ],
      }
    case 'kyc_status':
      // Snapshot of current KYC state per player. No date filter — current state only.
      return {
        exportType,
        query: sql`
          SELECT player_id, footprint_user_id, footprint_status,
                 footprint_manual_review_status, footprint_completed_at,
                 watchlist_last_check_at, watchlist_last_status,
                 manual_decision_at, manual_decision_reason,
                 created_at, updated_at
          FROM kyc_status
          ORDER BY updated_at DESC
        `,
        headers: [
          'player_id',
          'footprint_user_id',
          'footprint_status',
          'footprint_manual_review_status',
          'footprint_completed_at',
          'watchlist_last_check_at',
          'watchlist_last_status',
          'manual_decision_at',
          'manual_decision_reason',
          'created_at',
          'updated_at',
        ],
      }
    case 'tier_history':
      // Player VIP movements over time. Joins tier display names for readability.
      return {
        exportType,
        query: sql`
          SELECT th.id, th.player_id,
                 th.from_tier_id, ft.display_name AS from_tier,
                 th.to_tier_id,   tt.display_name AS to_tier,
                 th.reason, th.xp_at_change, th.created_at
          FROM tier_history th
          LEFT JOIN tiers ft ON ft.id = th.from_tier_id
          JOIN tiers tt       ON tt.id = th.to_tier_id
          WHERE th.created_at >= ${from} AND th.created_at < ${to}
          ORDER BY th.created_at DESC
        `,
        headers: [
          'id',
          'player_id',
          'from_tier_id',
          'from_tier',
          'to_tier_id',
          'to_tier',
          'reason',
          'xp_at_change',
          'created_at',
        ],
      }
    case 'custom':
      return null
    default:
      return null
  }
}

/**
 * Convert a row of unknown-typed values to a CSV-safe string array. JSON
 * values, Dates, BigInts, nulls all need different handling.
 */
export function rowToCsvCells(row: Record<string, unknown>, headers: string[]): string[] {
  return headers.map((h) => {
    const v = row[h]
    if (v === null || v === undefined) return ''
    if (v instanceof Date) return v.toISOString()
    if (typeof v === 'bigint') return v.toString()
    if (typeof v === 'object') return JSON.stringify(v)
    const s = String(v)
    // Quote if contains , " or newline.
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  })
}

export function escapeCsvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}
