import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { env } from '@coinfrenzy/config'

import type { PutObjectInput, PutObjectResult, R2Client, SignedGetUrlInput } from './types'

/**
 * Cloudflare R2 client using the AWS S3 SDK. R2 is fully S3-API
 * compatible at the bucket level; only the endpoint and region need
 * special handling.
 *
 * Endpoint convention: `https://<account_id>.r2.cloudflarestorage.com`.
 * Region: must be `auto` per R2 docs.
 */
export class RealR2Client implements R2Client {
  readonly mode = 'real' as const
  readonly bucket: string

  private readonly client: S3Client

  constructor() {
    const cfg = env()
    if (
      !cfg.R2_ACCOUNT_ID ||
      !cfg.R2_ACCESS_KEY_ID ||
      !cfg.R2_SECRET_ACCESS_KEY ||
      !cfg.R2_BUCKET
    ) {
      throw new Error(
        'R2 client requested but R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET are not all configured',
      )
    }
    this.bucket = cfg.R2_BUCKET
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${cfg.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: cfg.R2_ACCESS_KEY_ID,
        secretAccessKey: cfg.R2_SECRET_ACCESS_KEY,
      },
    })
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const result = await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType ?? 'application/octet-stream',
        CacheControl: input.cacheControl,
        Metadata: input.metadata,
      }),
    )
    return {
      key: input.key,
      uri: `r2://${this.bucket}/${input.key}`,
      etag: result.ETag ?? null,
    }
  }

  async signedGetUrl(input: SignedGetUrlInput): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: input.key })
    return getSignedUrl(this.client, cmd, { expiresIn: input.expiresIn ?? 300 })
  }
}
