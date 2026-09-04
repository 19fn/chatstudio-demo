const unavailable = 'Not available';

function valueOrUnavailable(value) {
  return typeof value === 'string' && value.trim() ? value : unavailable;
}

export function profileDetails(account, authConfig, verifiedProfile = {}) {
  const claims = account?.idTokenClaims || {};
  const roles = Array.isArray(verifiedProfile.roles)
    ? verifiedProfile.roles
    : Array.isArray(claims.roles) ? claims.roles : [];
  return [
    ['Name', valueOrUnavailable(verifiedProfile.displayName || account?.name || claims.name)],
    ['Email', valueOrUnavailable(account?.username || claims.preferred_username || claims.email)],
    ['Tenant ID', valueOrUnavailable(verifiedProfile.tenantId || claims.tid || authConfig?.tenantId)],
    ['Object ID', valueOrUnavailable(verifiedProfile.objectId || claims.oid || claims.sub || account?.homeAccountId)],
    ['Roles', roles.length ? roles.join(', ') : unavailable],
    ['Sign-in mode', authConfig?.disabled ? 'Local development' : 'Microsoft Entra ID'],
  ];
}