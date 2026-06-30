import { createHash } from 'node:crypto'

import type { PutObjectInput, PutObjectResult, R2Client, SignedGetUrlInput } from './types'

/**
 * In-memory R2 mock — keeps the most recent N objects so tests can
 * assert on what was uploaded and signed URLs can round-trip.
 * Production code paths never instantiate this; the factory in
 * `./index.ts` decides between mock and real.
 */
const STORE = new Map<string, { body: string | Buffer; contentType: string }>()
const MAX_OBJECTS = 200

export class MockR2Client implements R2Client {
  readonly mode = 'mock' as const
  readonly bucket = 'mock-bucket'

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    if (STORE.size >= MAX_OBJECTS) {
      // Drop oldest insertion. Map preserves insertion order.
      const oldest = STORE.keys().next().value
      if (oldest) STORE.delete(oldest)
    }
    STORE.set(input.key, {
      body: input.body,
      contentType: input.contentType ?? 'application/octet-stream',
    })
    const bodyStr = typeof input.body === 'string' ? input.body : input.body.toString('utf8')
    const etag = createHash('md5').update(bodyStr).digest('hex')
    return {
      key: input.key,
      uri: `mock://${this.bucket}/${input.key}`,
      etag: `"${etag}"`,
    }
  }

  async signedGetUrl(input: SignedGetUrlInput): Promise<string> {
    const expiresIn = input.expiresIn ?? 300
    // Encoded the URL deterministically so callers/tests can compare.
    return `mock://${this.bucket}/${encodeURIComponent(input.key)}?expires=${expiresIn}`
  }
}

/** Read a mock object back (test-only). */
export function getMockR2Object(
  key: string,
): { body: string | Buffer; contentType: string } | undefined {
  return STORE.get(key)
}

/** Reset the in-memory store (test-only). */
export function _resetMockR2(): void {
  STORE.clear()
}
