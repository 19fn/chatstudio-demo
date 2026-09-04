async function completeAuthentication() {
  const response = await fetch('/api/config');
  if (!response.ok) throw new Error('Unable to load authentication configuration.');
  const { auth, logLevel } = await response.json();
  if (!auth.tenantId || !auth.clientId || !auth.scope) {
    throw new Error('Microsoft Entra authentication is not configured.');
  }

  const authClient = new msal.PublicClientApplication({
    auth: {
      clientId: auth.clientId,
      authority: `https://login.microsoftonline.com/${auth.tenantId}`,
      redirectUri: `${location.origin}/auth/callback.html`,
      navigateToLoginRequestUrl: false,
    },
    cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false },
    system: {
      loggerOptions: {
        logLevel: logLevel === 'debug' ? msal.LogLevel.Verbose : msal.LogLevel.Warning,
        loggerCallback(level, message, containsPii) {
          if (!containsPii && logLevel === 'debug') console.debug(`[MSAL:${level}] ${message}`);
        },
      },
    },
  });

  await authClient.initialize();
  const result = await authClient.handleRedirectPromise();
  if (result?.account) authClient.setActiveAccount(result.account);
  location.replace('/');
}

completeAuthentication().catch((error) => {
  console.error('[MSAL] Redirect completion failed.', error.errorCode || error.message);
  const status = document.getElementById('auth-status');
  status.textContent = 'Sign-in could not be completed. Return to Chat Studio and try again.';
  const link = document.getElementById('return-link');
  link.hidden = false;
});