import { env } from './env'

// Single source of truth for "is this vendor wired to a real account or a
// mock?". Per the founder's instructions during prompt 06:
//
//   The Gamma team currently has admin access to my Finix, Alea, Footprint
//   and Radar accounts. I don't want them to see new IPs, webhook URLs, or
//   test transactions appear there.
//
// Every adapter factory consults `isMockEnabled(vendor)` to decide which
// implementation to return. Every webhook receiver also consults it so it
// can mark integration_health with `status='yellow'` + `mock_mode=true`
// when running off mocks.

export type Vendor = 'finix' | 'alea' | 'footprint' | 'radar' | 'sendgrid' | 'twilio' | 'easyscam'

const FLAG_BY_VENDOR: Record<Vendor, keyof ReturnType<typeof env>> = {
  finix: 'USE_MOCK_FINIX',
  alea: 'USE_MOCK_ALEA',
  footprint: 'USE_MOCK_FOOTPRINT',
  radar: 'USE_MOCK_RADAR',
  sendgrid: 'USE_MOCK_SENDGRID',
  twilio: 'USE_MOCK_TWILIO',
  easyscam: 'USE_MOCK_EASYSCAM',
}

export function isMockEnabled(vendor: Vendor): boolean {
  return Boolean(env()[FLAG_BY_VENDOR[vendor]])
}

export function getVendorModes(): Record<Vendor, 'mock' | 'real'> {
  return {
    finix: isMockEnabled('finix') ? 'mock' : 'real',
    alea: isMockEnabled('alea') ? 'mock' : 'real',
    footprint: isMockEnabled('footprint') ? 'mock' : 'real',
    radar: isMockEnabled('radar') ? 'mock' : 'real',
    sendgrid: isMockEnabled('sendgrid') ? 'mock' : 'real',
    twilio: isMockEnabled('twilio') ? 'mock' : 'real',
    easyscam: isMockEnabled('easyscam') ? 'mock' : 'real',
  }
}
