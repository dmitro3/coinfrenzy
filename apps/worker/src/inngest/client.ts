import { Inngest } from 'inngest'

// Shared Inngest client for the worker app.
// Per docs/02 §9: event keys + signing keys come from Doppler via env().
export const inngest = new Inngest({ id: 'coinfrenzy-worker' })
