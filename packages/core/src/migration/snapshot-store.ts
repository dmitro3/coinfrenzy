// docs/13 §3.1 — R2-backed snapshot store.
//
// A "snapshot" is a date-keyed directory in R2 holding every CSV Gamma
// exported on that day:
//   gamma-snapshots/2026-05-19/players_data.csv
//   gamma-snapshots/2026-05-19/purchase_report.csv
//   etc.
//
// In production, the daily snapshot job pushes a fresh set into R2. For
// dev / staging the operator can upload files manually through the
// /admin/migration UI; that route POSTs to the same store.
//
// We never read the entire snapshot into memory at once if we don't have
// to — but Gamma's exports today are < 100 MB total, so a single full
// fetch is fine. Sub-MB CSVs are read as utf-8 strings.

import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

import { env } from '@coinfrenzy/config'

import { SNAPSHOT_PREFIX } from './constants'
import { SNAPSHOT_FILE_NAMES, type SnapshotFileKey } from './types'

export interface SnapshotStore {
  /** List snapshot dates currently available. Most recent first. */
  listSnapshots(): Promise<string[]>
  /** List the files present in a snapshot date. */
  listFiles(date: string): Promise<string[]>
  /** Read one file as a UTF-8 string. Returns null if absent. */
  readFile(date: string, filename: string): Promise<string | null>
  /** Write a file (used by the upload endpoint). */
  writeFile(date: string, filename: string, body: string | Buffer): Promise<void>
  /** Convenience — read a logical file (by SnapshotFileKey). */
  readLogical(date: string, key: SnapshotFileKey): Promise<string | null>
  readonly mode: 'real' | 'memory'
}

/**
 * R2-backed implementation. Uses the same env vars as packages/core/src/adapters/r2.
 */
class R2SnapshotStore implements SnapshotStore {
  readonly mode = 'real' as const
  private readonly client: S3Client
  private readonly bucket: string

  constructor() {
    const cfg = env()
    if (
      !cfg.R2_ACCOUNT_ID ||
      !cfg.R2_ACCESS_KEY_ID ||
      !cfg.R2_SECRET_ACCESS_KEY ||
      !cfg.R2_BUCKET
    ) {
      throw new Error('R2 snapshot store requested but R2_* env vars are not all configured')
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

  async listSnapshots(): Promise<string[]> {
    const res = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: `${SNAPSHOT_PREFIX}/`,
        Delimiter: '/',
      }),
    )
    const prefixes = res.CommonPrefixes ?? []
    const dates = prefixes
      .map((p) => p.Prefix ?? '')
      .map((p) => p.replace(`${SNAPSHOT_PREFIX}/`, '').replace(/\/$/, ''))
      .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p))
      .sort()
      .reverse()
    return dates
  }

  async listFiles(date: string): Promise<string[]> {
    const res = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: `${SNAPSHOT_PREFIX}/${date}/`,
      }),
    )
    return (res.Contents ?? []).map((o) => (o.Key ?? '').split('/').pop() ?? '').filter(Boolean)
  }

  async readFile(date: string, filename: string): Promise<string | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: `${SNAPSHOT_PREFIX}/${date}/${filename}`,
        }),
      )
      const body = res.Body as { transformToString?: () => Promise<string> } | undefined
      if (!body?.transformToString) return null
      return await body.transformToString()
    } catch (e) {
      const code = (e as { Code?: string; name?: string }).Code ?? (e as { name?: string }).name
      if (code === 'NoSuchKey' || code === 'NotFound') return null
      throw e
    }
  }

  async writeFile(date: string, filename: string, body: string | Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: `${SNAPSHOT_PREFIX}/${date}/${filename}`,
        Body: body,
        ContentType: filename.endsWith('.csv') ? 'text/csv' : 'application/octet-stream',
      }),
    )
  }

  readLogical(date: string, key: SnapshotFileKey): Promise<string | null> {
    return this.readFile(date, SNAPSHOT_FILE_NAMES[key])
  }
}

/**
 * In-memory store for tests / when R2 env vars are unset. Keeps the
 * import pipeline runnable in CI without ever hitting Cloudflare.
 */
export class MemorySnapshotStore implements SnapshotStore {
  readonly mode = 'memory' as const
  private readonly files = new Map<string, string>()

  private key(date: string, filename: string): string {
    return `${date}/${filename}`
  }

  async listSnapshots(): Promise<string[]> {
    const dates = new Set<string>()
    for (const k of this.files.keys()) {
      const d = k.split('/')[0]
      dates.add(d)
    }
    return Array.from(dates).sort().reverse()
  }

  async listFiles(date: string): Promise<string[]> {
    return Array.from(this.files.keys())
      .filter((k) => k.startsWith(`${date}/`))
      .map((k) => k.slice(date.length + 1))
  }

  async readFile(date: string, filename: string): Promise<string | null> {
    return this.files.get(this.key(date, filename)) ?? null
  }

  async writeFile(date: string, filename: string, body: string | Buffer): Promise<void> {
    const content = typeof body === 'string' ? body : body.toString('utf8')
    this.files.set(this.key(date, filename), content)
  }

  readLogical(date: string, key: SnapshotFileKey): Promise<string | null> {
    return this.readFile(date, SNAPSHOT_FILE_NAMES[key])
  }
}

export function getSnapshotStore(): SnapshotStore {
  if (process.env.NODE_ENV === 'test') return new MemorySnapshotStore()
  const cfg = env()
  if (!cfg.R2_ACCOUNT_ID || !cfg.R2_ACCESS_KEY_ID || !cfg.R2_SECRET_ACCESS_KEY || !cfg.R2_BUCKET) {
    return new MemorySnapshotStore()
  }
  return new R2SnapshotStore()
}
