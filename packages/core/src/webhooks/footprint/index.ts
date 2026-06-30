import type { Context } from '../../context'

import { handleFootprintManualReview } from './handlers/manual-review'
import { handleFootprintOnboardingCompleted } from './handlers/onboarding-completed'
import { handleFootprintWatchlistCheck } from './handlers/watchlist-check'

type HandlerFn = (payload: unknown, ctx2: { rawBody: string }) => Promise<void>

export function buildFootprintHandlers(ctx: Context): Record<string, HandlerFn> {
  return {
    'footprint.onboarding.completed': (payload) =>
      handleFootprintOnboardingCompleted(
        ctx,
        payload as Parameters<typeof handleFootprintOnboardingCompleted>[1],
      ),
    'footprint.user.manual_review': (payload) =>
      handleFootprintManualReview(
        ctx,
        payload as Parameters<typeof handleFootprintManualReview>[1],
      ),
    'footprint.watchlist_check.completed': (payload) =>
      handleFootprintWatchlistCheck(
        ctx,
        payload as Parameters<typeof handleFootprintWatchlistCheck>[1],
      ),
  }
}
