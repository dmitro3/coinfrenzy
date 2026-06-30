// Shared player profile constants safe for client + server imports.

export const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'] as const
export type GenderOption = (typeof GENDER_OPTIONS)[number]
