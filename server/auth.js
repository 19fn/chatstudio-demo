function createAuth(config, options = {}) {
  let verifierPromise;
  const logger = options.logger;

  async function getVerifier() {
    if (options.verifyToken) return options.verifyToken;
    if (!verifierPromise) {
      verifierPromise = import('jose').then(({ createRemoteJWKSet, jwtVerify }) => {
        const issuer = `https://login.microsoftonline.com/${config.tenantId}/v2.0`;
        const jwks = createRemoteJWKSet(new URL(
          `https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`,
        ));
        return async (token) => {
          const { payload } = await jwtVerify(token, jwks, {
            audience: config.apiClientId,
            issuer,
          });
          return payload;
        };
      });
    }
    return verifierPromise;
  }

  async function requireAuth(request, response, next) {
    if (config.disabled) {
      request.user = {
        tenantId: 'local-development',
        objectId: 'local-user',
        displayName: 'Local Developer',
        roles: [config.adminRole],
      };
      return next();
    }

    const authorization = request.get('authorization') || '';
    const [scheme, token] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return response.status(401).json({ error: 'authentication_required' });
    }

    try {
      const verifyToken = await getVerifier();
      const claims = await verifyToken(token);
      const scopes = typeof claims.scp === 'string' ? claims.scp.split(' ') : [];
      if (!scopes.includes(config.scope)) {
        return response.status(403).json({ error: 'insufficient_scope' });
      }

      request.user = {
        tenantId: claims.tid,
        objectId: claims.oid || claims.sub,
        displayName: claims.name || claims.preferred_username || 'Chat Studio user',
        roles: Array.isArray(claims.roles) ? claims.roles : [],
      };
      return next();
    } catch (error) {
      logger?.warn('auth.token.rejected', {
        errorCode: typeof error.code === 'string' ? error.code : 'verification_failed',
      });
      return response.status(401).json({ error: 'invalid_token' });
    }
  }

  function requireRole(role) {
    return (request, response, next) => {
      if (!request.user?.roles.includes(role)) {
        return response.status(403).json({ error: 'insufficient_role' });
      }
      return next();
    };
  }

  return { requireAuth, requireRole };
}

module.exports = { createAuth };