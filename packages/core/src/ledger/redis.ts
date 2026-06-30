// Minimal Redis abstraction for the ledger cache. Per .cursorrules we use
// Upstash Redis in production; pulling the Upstash SDK is deferred to the
// observability/cache prompt, so this module ships with an in-memory
// implementation that the cache reader/invalidator use. Swap-in is one file.

export interface RedisLike {
  get(key: string): Promise<string | null>
  setex(key: string, ttlSeconds: number, value: string): Promise<void>
  del(...keys: string[]): Promise<void>
}

interface Entry {
  value: string
  expiresAt: number
}

class InMemoryRedis implements RedisLike {
  private store = new Map<string, Entry>()

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key)
    if (!entry) return null
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key)
      return null
    }
    return entry.value
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
  }

  async del(...keys: string[]): Promise<void> {
    for (const key of keys) this.store.delete(key)
  }

  /** Test-only utility. */
  _size(): number {
    return this.store.size
  }

  _clear(): void {
    this.store.clear()
  }
}

let cachedClient: RedisLike | undefined

export function getRedis(): RedisLike {
  if (!cachedClient) cachedClient = new InMemoryRedis()
  return cachedClient
}

/** Tests / hot-reloads: replace the cache backend with a custom one. */
export function setRedis(client: RedisLike): void {
  cachedClient = client
}

/** Tests: wipe the default in-memory cache between cases. */
export function clearRedis(): void {
  if (cachedClient && cachedClient instanceof InMemoryRedis) cachedClient._clear()
}
