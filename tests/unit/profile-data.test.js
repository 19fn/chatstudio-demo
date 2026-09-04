import { describe, expect, it } from 'vitest';

import { profileDetails } from '../../public/js/profile-data.js';

describe('profileDetails', () => {
  it('maps available account and claim metadata to profile rows', () => {
    expect(profileDetails({
      name: 'Ada Lovelace',
      username: 'ada@example.com',
      homeAccountId: 'home-account',
      idTokenClaims: { tid: 'tenant-id', oid: 'object-id', roles: ['ChatStudio.Admin'] },
    }, { disabled: false, tenantId: 'configured-tenant' })).toEqual([
      ['Name', 'Ada Lovelace'],
      ['Email', 'ada@example.com'],
      ['Tenant ID', 'tenant-id'],
      ['Object ID', 'object-id'],
      ['Roles', 'ChatStudio.Admin'],
      ['Sign-in mode', 'Microsoft Entra ID'],
    ]);
  });

  it('renders safe fallbacks when identity metadata is unavailable', () => {
    expect(profileDetails({ name: 'Local Developer', idTokenClaims: {} }, {
      disabled: true,
    })).toEqual([
      ['Name', 'Local Developer'],
      ['Email', 'Not available'],
      ['Tenant ID', 'Not available'],
      ['Object ID', 'Not available'],
      ['Roles', 'Not available'],
      ['Sign-in mode', 'Local development'],
    ]);
  });

  it('uses roles verified from the API access token when ID-token roles are absent', () => {
    expect(profileDetails({
      name: 'Ada Lovelace', idTokenClaims: {},
    }, { disabled: false }, {
      displayName: 'Ada Lovelace', tenantId: 'tenant-id', objectId: 'object-id', roles: ['ChatStudio.Admin'],
    })).toEqual(expect.arrayContaining([
      ['Roles', 'ChatStudio.Admin'],
    ]));
  });
});