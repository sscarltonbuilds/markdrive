// Auth helpers — chrome.identity.getAuthToken() for Google API access.
// Chrome manages token caching and refresh automatically.
// OAuth client ID and scopes are declared in manifest.json under "oauth2".

export async function getStoredToken(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) {
        resolve(null)
        return
      }
      resolve(token)
    })
  })
}

export async function signIn(): Promise<{ token: string } | { error: string }> {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError || !token) {
        resolve({ error: chrome.runtime.lastError?.message ?? 'Sign in failed' })
        return
      }
      resolve({ token })
    })
  })
}

export async function clearToken(): Promise<void> {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) {
        resolve()
        return
      }
      chrome.identity.removeCachedAuthToken({ token }, () => resolve())
    })
  })
}
