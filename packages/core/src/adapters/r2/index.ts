import { env } from '@coinfrenzy/config'

import { MockR2Client } from './client-mock'
import { RealR2Client } from './client-real'
import type { R2Client } from './types'

/**
 * Returns a configured R2 client. The mock is used in two cases:
 *   1. NODE_ENV is 'test' (we never want tests hitting Cloudflare).
 *   2. R2 env vars are not all present (mock keeps local dev unblocked).
 *
 * Production code paths should never see the mock — the deploy
 * environment must provide all four R2_* env vars.
 */
export function getR2Client(): R2Client {
  if (process.env.NODE_ENV === 'test') return new MockR2Client()
  const cfg = env()
  if (!cfg.R2_ACCOUNT_ID || !cfg.R2_ACCESS_KEY_ID || !cfg.R2_SECRET_ACCESS_KEY || !cfg.R2_BUCKET) {
    return new MockR2Client()
  }
  return new RealR2Client()
}

export type { PutObjectInput, PutObjectResult, R2Client, SignedGetUrlInput } from './types'

export { MockR2Client, getMockR2Object, _resetMockR2 } from './client-mock'
export { RealR2Client } from './client-real'
