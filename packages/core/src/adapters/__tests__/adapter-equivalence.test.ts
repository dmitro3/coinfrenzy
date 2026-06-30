import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { _resetEnvCacheForTests } from '@coinfrenzy/config'

import { adapters } from '../../index'

// Equivalence + instantiation tests for every vendor adapter.
//
// We assert two properties for each vendor:
//   1) Mock and real clients expose the same set of public methods
//      (interface equivalence) — so a swap is a pure config change.
//   2) The real client can be constructed (constructor side effects must
//      not require live secrets). We never call the real network.

const originalEnv = { ...process.env }

beforeEach(() => {
  // Each test toggles the relevant flag explicitly.
  process.env = { ...originalEnv }
  _resetEnvCacheForTests()
})

afterEach(() => {
  process.env = { ...originalEnv }
  _resetEnvCacheForTests()
})

interface VendorCase {
  name: string
  envFlag: string
  getClient: () => unknown
  realCtor: () => unknown
  mockCtor: () => unknown
  publicMethods: string[]
}

const vendors: VendorCase[] = [
  {
    name: 'finix',
    envFlag: 'USE_MOCK_FINIX',
    getClient: () => adapters.finix.getFinixClient(),
    realCtor: () => new adapters.finix.RealFinixClient(),
    mockCtor: () => new adapters.finix.MockFinixClient(),
    publicMethods: ['createTransfer', 'getTransfer', 'createPayout'],
  },
  {
    name: 'alea',
    envFlag: 'USE_MOCK_ALEA',
    getClient: () => adapters.alea.getAleaClient(),
    realCtor: () => new adapters.alea.RealAleaClient(),
    mockCtor: () => new adapters.alea.MockAleaClient(),
    publicMethods: ['createSession', 'listGames', 'listRounds'],
  },
  {
    name: 'footprint',
    envFlag: 'USE_MOCK_FOOTPRINT',
    getClient: () => adapters.footprint.getFootprintClient(),
    realCtor: () => new adapters.footprint.RealFootprintClient(),
    mockCtor: () => new adapters.footprint.MockFootprintClient(),
    publicMethods: ['createOnboardingSession', 'getUser'],
  },
  {
    name: 'radar',
    envFlag: 'USE_MOCK_RADAR',
    getClient: () => adapters.radar.getRadarClient(),
    realCtor: () => new adapters.radar.RealRadarClient(),
    mockCtor: () => new adapters.radar.MockRadarClient(),
    publicMethods: ['geocodeIp', 'track'],
  },
  {
    name: 'sendgrid',
    envFlag: 'USE_MOCK_SENDGRID',
    getClient: () => adapters.sendgrid.getSendGridClient(),
    realCtor: () => new adapters.sendgrid.RealSendGridClient(),
    mockCtor: () => new adapters.sendgrid.MockSendGridClient(),
    publicMethods: ['sendEmail'],
  },
  {
    name: 'twilio',
    envFlag: 'USE_MOCK_TWILIO',
    getClient: () => adapters.twilio.getTwilioClient(),
    realCtor: () => new adapters.twilio.RealTwilioClient(),
    mockCtor: () => new adapters.twilio.MockTwilioClient(),
    publicMethods: ['sendSms'],
  },
  {
    name: 'easyscam',
    envFlag: 'USE_MOCK_EASYSCAM',
    getClient: () => adapters.easyscam.getEasyScamClient(),
    realCtor: () => new adapters.easyscam.RealEasyScamClient(),
    mockCtor: () => new adapters.easyscam.MockEasyScamClient(),
    publicMethods: ['fetchNewEntries'],
  },
]

function methodNames(client: unknown): string[] {
  const out = new Set<string>()
  let proto = Object.getPrototypeOf(client)
  while (proto && proto !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === 'constructor') continue
      const descriptor = Object.getOwnPropertyDescriptor(proto, key)
      if (descriptor && typeof descriptor.value === 'function') {
        out.add(key)
      }
    }
    proto = Object.getPrototypeOf(proto)
  }
  return [...out].sort()
}

describe('vendor adapter interface equivalence', () => {
  for (const vendor of vendors) {
    describe(vendor.name, () => {
      it('mock and real clients expose the same public methods', () => {
        const real = vendor.realCtor()
        const mock = vendor.mockCtor()
        const realMethods = methodNames(real)
        const mockMethods = methodNames(mock)
        for (const method of vendor.publicMethods) {
          expect(realMethods, `real ${vendor.name} missing ${method}`).toContain(method)
          expect(mockMethods, `mock ${vendor.name} missing ${method}`).toContain(method)
        }
        // The mock must not expose extra public methods that the real
        // client does not have — that would break "swap the env flag, ship".
        // (Real may have extra private helpers like `request`; mock should
        // mimic the public surface only.)
        const extraOnMock = mockMethods.filter((m) => !realMethods.includes(m))
        expect(extraOnMock, `mock ${vendor.name} extra methods`).toEqual([])
      })

      it('real client is constructible without live credentials', () => {
        // Constructors must not throw; lazy validation happens at call time.
        expect(() => vendor.realCtor()).not.toThrow()
      })

      it(`flipping ${vendor.envFlag}=false selects the real client`, () => {
        process.env[vendor.envFlag] = 'false'
        const client = vendor.getClient() as { mode: 'mock' | 'real' }
        expect(client.mode).toBe('real')
      })

      it(`flipping ${vendor.envFlag}=true selects the mock client`, () => {
        process.env[vendor.envFlag] = 'true'
        const client = vendor.getClient() as { mode: 'mock' | 'real' }
        expect(client.mode).toBe('mock')
      })
    })
  }
})
