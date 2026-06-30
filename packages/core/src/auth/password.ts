import bcrypt from 'bcryptjs'

/**
 * Verify a plaintext password against a stored bcrypt hash. Returns false on
 * mismatch or malformed hash; never throws on bad input. Cost factor 12 by
 * default (matches `seed-admin.ts`).
 */
export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  if (!plaintext || !hash) return false
  try {
    return await bcrypt.compare(plaintext, hash)
  } catch {
    return false
  }
}

export async function hashPassword(plaintext: string, cost = 12): Promise<string> {
  return bcrypt.hash(plaintext, cost)
}
