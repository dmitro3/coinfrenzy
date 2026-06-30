// docs/05 / docs/11 — Cloudflare R2 object storage adapter.
//
// Used for cold/audit storage of artifacts that don't belong in a row
// in `crm_message_log` (full email HTML bodies, future: tax docs, KYC
// copies). R2 is S3-API-compatible so we use the AWS SDK against R2's
// account endpoint.

export interface PutObjectInput {
  /**
   * Logical key. Convention: `<domain>/<yyyy>/<mm>/<dd>/<id>.<ext>`
   * e.g. `email-bodies/2026/05/19/<messageId>.html`.
   */
  key: string
  /** Raw body bytes (string or Buffer). */
  body: string | Buffer
  /** MIME type; falls back to application/octet-stream. */
  contentType?: string
  /**
   * Optional cache control; appropriate for immutable archive content
   * is `private, max-age=31536000, immutable`.
   */
  cacheControl?: string
  /** Provider-side metadata (small KV map). */
  metadata?: Record<string, string>
}

export interface PutObjectResult {
  key: string
  /** `mock://` prefix in mock mode for transparency in logs/tests. */
  uri: string
  etag: string | null
}

export interface SignedGetUrlInput {
  key: string
  /** Seconds until the URL expires. Capped to 7 days by R2/S3. */
  expiresIn?: number
}

export interface R2Client {
  /** Upload a single object. Overwrites any existing key. */
  putObject(input: PutObjectInput): Promise<PutObjectResult>
  /** Returns a short-lived signed URL for GET. Default 5 min. */
  signedGetUrl(input: SignedGetUrlInput): Promise<string>
  readonly mode: 'mock' | 'real'
  readonly bucket: string | null
}
