import { describe, expect, it } from 'vitest'

import {
  canAccessHostPortal,
  canAssignBonusAsHost,
  canCreateHost,
  canDeactivateHost,
  canManageVipAssignments,
  canViewAllVips,
  hasAtLeast,
  HOST_PORTAL_API_PREFIXES,
  HOST_PORTAL_PATH_PREFIXES,
  HOST_WEEKLY_BONUS_CAP_SC,
  isHost,
  isHostAllowedAdminPath,
  isHostAllowedApiPath,
} from '../../auth/permissions'

// M4 — host permission helpers. Tight on the negative cases since these
// drive both middleware and layout gating.

describe('host permission predicates', () => {
  it('isHost is true only for the dedicated host role', () => {
    expect(isHost('host')).toBe(true)
    expect(isHost('master')).toBe(false)
    expect(isHost('manager')).toBe(false)
    expect(isHost('support')).toBe(false)
  })

  it('hasAtLeast() does not promote hosts to support+', () => {
    // This is the key security boundary — a host must NOT satisfy
    // hasAtLeast(role, 'support') by accident.
    expect(hasAtLeast('host', 'support')).toBe(false)
    expect(hasAtLeast('host', 'manager')).toBe(false)
    expect(hasAtLeast('host', 'master')).toBe(false)
  })

  it('canAccessHostPortal allows host, manager, master', () => {
    expect(canAccessHostPortal('host')).toBe(true)
    expect(canAccessHostPortal('manager')).toBe(true)
    expect(canAccessHostPortal('master')).toBe(true)
    expect(canAccessHostPortal('support')).toBe(false)
    expect(canAccessHostPortal('cashier')).toBe(false)
  })

  it('canViewAllVips and canManageVipAssignments are manager+ only', () => {
    expect(canViewAllVips('master')).toBe(true)
    expect(canViewAllVips('manager')).toBe(true)
    expect(canViewAllVips('host')).toBe(false)
    expect(canManageVipAssignments('host')).toBe(false)
    expect(canManageVipAssignments('manager')).toBe(true)
  })

  it('canCreateHost / canDeactivateHost are master only', () => {
    expect(canCreateHost('master')).toBe(true)
    expect(canCreateHost('manager')).toBe(false)
    expect(canDeactivateHost('manager')).toBe(false)
    expect(canDeactivateHost('master')).toBe(true)
  })

  it('canAssignBonusAsHost is host or master only', () => {
    expect(canAssignBonusAsHost('host')).toBe(true)
    expect(canAssignBonusAsHost('master')).toBe(true)
    expect(canAssignBonusAsHost('manager')).toBe(false)
    expect(canAssignBonusAsHost('marketing')).toBe(false)
  })
})

describe('host portal route gating', () => {
  it('allows /admin and /admin/logout', () => {
    expect(isHostAllowedAdminPath('/admin')).toBe(true)
    expect(isHostAllowedAdminPath('/admin/')).toBe(true)
    expect(isHostAllowedAdminPath('/admin/logout')).toBe(true)
  })

  it('allows host portal sub-paths', () => {
    expect(isHostAllowedAdminPath('/admin/vips')).toBe(true)
    expect(isHostAllowedAdminPath('/admin/vips/abc-123')).toBe(true)
    expect(isHostAllowedAdminPath('/admin/messages')).toBe(true)
    expect(isHostAllowedAdminPath('/admin/bonus')).toBe(true)
    expect(isHostAllowedAdminPath('/admin/account')).toBe(true)
  })

  it('blocks every non-host admin path', () => {
    expect(isHostAllowedAdminPath('/admin/players')).toBe(false)
    expect(isHostAllowedAdminPath('/admin/players/abc')).toBe(false)
    expect(isHostAllowedAdminPath('/admin/casino/providers')).toBe(false)
    expect(isHostAllowedAdminPath('/admin/reports/redemptions')).toBe(false)
    expect(isHostAllowedAdminPath('/admin/crm/segments')).toBe(false)
    expect(isHostAllowedAdminPath('/admin/integrity')).toBe(false)
    expect(isHostAllowedAdminPath('/admin/staff')).toBe(false)
    expect(isHostAllowedAdminPath('/admin/settings')).toBe(false)
    expect(isHostAllowedAdminPath('/admin/audit')).toBe(false)
    // /admin/vip (the admin-side VIP overview) must NOT be host-allowed.
    expect(isHostAllowedAdminPath('/admin/vip')).toBe(false)
    expect(isHostAllowedAdminPath('/admin/vip/all-vips')).toBe(false)
  })

  it('allows host-allowed API prefixes only', () => {
    expect(isHostAllowedApiPath('/api/admin/auth/logout')).toBe(true)
    expect(isHostAllowedApiPath('/api/admin/host/bonus')).toBe(true)
    expect(isHostAllowedApiPath('/api/admin/host/message')).toBe(true)
    expect(isHostAllowedApiPath('/api/admin/host/interaction')).toBe(true)
    expect(isHostAllowedApiPath('/api/admin/players/abc')).toBe(false)
    expect(isHostAllowedApiPath('/api/admin/casino/providers')).toBe(false)
    expect(isHostAllowedApiPath('/api/admin/reports/exports')).toBe(false)
  })
})

describe('host portal constants', () => {
  it('weekly cap is $500 SC in minor units', () => {
    // 500 major * 10_000 minor/major
    expect(HOST_WEEKLY_BONUS_CAP_SC).toBe(5_000_000n)
  })

  it('exposes a portal-prefix list', () => {
    expect(HOST_PORTAL_PATH_PREFIXES).toContain('/admin/vips')
    expect(HOST_PORTAL_PATH_PREFIXES).toContain('/admin/messages')
    expect(HOST_PORTAL_PATH_PREFIXES).toContain('/admin/bonus')
    expect(HOST_PORTAL_API_PREFIXES).toContain('/api/admin/host/')
  })
})
