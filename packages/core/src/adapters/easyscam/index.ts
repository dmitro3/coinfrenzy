import { isMockEnabled } from '@coinfrenzy/config'

import { MockEasyScamClient } from './client-mock'
import { RealEasyScamClient } from './client-real'
import type { EasyScamClient } from './types'

export function getEasyScamClient(): EasyScamClient {
  return isMockEnabled('easyscam') ? new MockEasyScamClient() : new RealEasyScamClient()
}

export type { EasyScamClient, EasyScamEntry } from './types'
export {
  MockEasyScamClient,
  _seedMockEasyScamEntries,
  _resetMockEasyScamEntries,
} from './client-mock'
export { RealEasyScamClient } from './client-real'
