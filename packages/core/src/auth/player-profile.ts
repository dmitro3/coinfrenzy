// Player self-service profile updates (personal details on /account).

import { eq } from 'drizzle-orm'

import { GENDER_OPTIONS, type GenderOption } from '@coinfrenzy/config'
import { type DbExecutor } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { writeAuditEntry } from '../audit/index'
import { err, ok, type Result } from '../errors/result'

export { GENDER_OPTIONS, type GenderOption }

export interface PersonalDetailsInput {
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: GenderOption | null
  addressLine1: string
  city: string
  postalCode: string
  state: string
}

export type PersonalDetailsError =
  | { kind: 'not_found' }
  | { kind: 'invalid_input'; field: string; message: string }

export interface PersonalDetailsSnapshot {
  firstName: string | null
  lastName: string | null
  dateOfBirth: string | null
  gender: string | null
  addressLine1: string | null
  city: string | null
  postalCode: string | null
  state: string | null
}

const NAME_RE = /^[\p{L}\p{M}' -]{1,100}$/u
const POSTAL_RE = /^[A-Za-z0-9 -]{3,12}$/
const STATE_RE = /^[A-Z]{2}$/

/** Parse MM/DD/YYYY into ISO date (YYYY-MM-DD). */
export function parseUsDateOfBirth(raw: string): string | null {
  const trimmed = raw.trim()
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return null

  const month = Number(match[1])
  const day = Number(match[2])
  const year = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return null

  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const parsed = new Date(`${iso}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return null
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null
  }

  return iso
}

/** Format ISO date (YYYY-MM-DD) for the legacy MM/DD/YYYY input. */
export function formatUsDateOfBirth(iso: string | null | undefined): string {
  if (!iso) return ''
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return ''
  return `${month}/${day}/${year}`
}

export function validatePersonalDetails(
  input: PersonalDetailsInput,
): Result<PersonalDetailsInput & { dateOfBirthIso: string }, PersonalDetailsError> {
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()
  const addressLine1 = input.addressLine1.trim()
  const city = input.city.trim()
  const postalCode = input.postalCode.trim()
  const state = input.state.trim().toUpperCase()

  if (!firstName || !NAME_RE.test(firstName)) {
    return err({ kind: 'invalid_input', field: 'firstName', message: 'Enter a valid first name.' })
  }
  if (!lastName || !NAME_RE.test(lastName)) {
    return err({ kind: 'invalid_input', field: 'lastName', message: 'Enter a valid last name.' })
  }

  const dateOfBirthIso = parseUsDateOfBirth(input.dateOfBirth)
  if (!dateOfBirthIso) {
    return err({
      kind: 'invalid_input',
      field: 'dateOfBirth',
      message: 'Enter a valid date of birth (MM/DD/YYYY).',
    })
  }

  const dob = new Date(`${dateOfBirthIso}T00:00:00.000Z`)
  const ageMs = Date.now() - dob.getTime()
  const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000)
  if (ageYears < 18) {
    return err({
      kind: 'invalid_input',
      field: 'dateOfBirth',
      message: 'You must be at least 18 years old.',
    })
  }

  if (!input.gender || !GENDER_OPTIONS.includes(input.gender)) {
    return err({ kind: 'invalid_input', field: 'gender', message: 'Select a gender.' })
  }

  if (!addressLine1 || addressLine1.length > 200) {
    return err({
      kind: 'invalid_input',
      field: 'addressLine1',
      message: 'Enter a valid street address.',
    })
  }
  if (!city || city.length > 100) {
    return err({ kind: 'invalid_input', field: 'city', message: 'Enter a valid city.' })
  }
  if (!postalCode || !POSTAL_RE.test(postalCode)) {
    return err({
      kind: 'invalid_input',
      field: 'postalCode',
      message: 'Enter a valid postal code.',
    })
  }
  if (!STATE_RE.test(state)) {
    return err({
      kind: 'invalid_input',
      field: 'state',
      message: 'Select a valid state.',
    })
  }

  return ok({
    ...input,
    firstName,
    lastName,
    addressLine1,
    city,
    postalCode,
    state,
    dateOfBirthIso,
  })
}

export function readGenderFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  const gender = (metadata as Record<string, unknown>).gender
  return typeof gender === 'string' ? gender : null
}

export async function updatePersonalDetails(
  db: DbExecutor,
  input: {
    playerId: string
    details: PersonalDetailsInput
    ip?: string | null
    userAgent?: string | null
  },
): Promise<Result<PersonalDetailsSnapshot, PersonalDetailsError>> {
  const validated = validatePersonalDetails(input.details)
  if (!validated.ok) return validated

  const [player] = await db
    .select({
      firstName: schema.players.firstName,
      lastName: schema.players.lastName,
      dateOfBirth: schema.players.dateOfBirth,
      addressLine1: schema.players.addressLine1,
      city: schema.players.city,
      postalCode: schema.players.postalCode,
      state: schema.players.state,
      metadata: schema.players.metadata,
    })
    .from(schema.players)
    .where(eq(schema.players.id, input.playerId))
    .limit(1)

  if (!player) return err({ kind: 'not_found' })

  const before: PersonalDetailsSnapshot = {
    firstName: player.firstName,
    lastName: player.lastName,
    dateOfBirth: player.dateOfBirth,
    gender: readGenderFromMetadata(player.metadata),
    addressLine1: player.addressLine1,
    city: player.city,
    postalCode: player.postalCode,
    state: player.state,
  }

  const nextMetadata =
    typeof player.metadata === 'object' && player.metadata !== null
      ? { ...(player.metadata as Record<string, unknown>) }
      : {}

  if (validated.value.gender) {
    nextMetadata.gender = validated.value.gender
  } else {
    delete nextMetadata.gender
  }

  const after: PersonalDetailsSnapshot = {
    firstName: validated.value.firstName,
    lastName: validated.value.lastName,
    dateOfBirth: validated.value.dateOfBirthIso,
    gender: validated.value.gender,
    addressLine1: validated.value.addressLine1,
    city: validated.value.city,
    postalCode: validated.value.postalCode,
    state: validated.value.state,
  }

  await db
    .update(schema.players)
    .set({
      firstName: after.firstName,
      lastName: after.lastName,
      displayName: `${after.firstName} ${after.lastName}`.trim(),
      dateOfBirth: after.dateOfBirth,
      addressLine1: after.addressLine1,
      city: after.city,
      postalCode: after.postalCode,
      state: after.state,
      metadata: nextMetadata,
      updatedAt: new Date(),
    })
    .where(eq(schema.players.id, input.playerId))

  await writeAuditEntry(db, {
    actorKind: 'player',
    actorId: input.playerId,
    action: 'player.profile.personal_details_updated',
    resourceKind: 'player',
    resourceId: input.playerId,
    before: before as unknown as Record<string, unknown>,
    after: after as unknown as Record<string, unknown>,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  })

  return ok(after)
}
