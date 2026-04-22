// Auth helpers — chrome.identity.launchWebAuthFlow() for Google API access.
// Works for both unpacked (dev) and Web Store extensions.
// Tokens are stored in chrome.storage.local; Chrome doesn't cache them automatically.
// OAuth client: Web application type with chromiumapp.org redirect URIs in GCP.

const CLIENT_ID = '475063314751-a6hl0vn7nbrf0fi5q2d26se8k66gq659.apps.googleusercontent.com'

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'openid',
  'email',
  'profile',
].join(' ')

const TOKEN_KEY = 'markdrive_access_token'

export async function getStoredToken(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(TOKEN_KEY, (result) => {
      resolve((result[TOKEN_KEY] as string | undefined) ?? null)
    })
  })
}

export async function signIn(): Promise<{ token: string } | { error: string }> {
  const redirectURL = chrome.identity.getRedirectURL()

  const authURL = new URL('https://accounts.google.com/o/oauth2/auth')
  authURL.searchParams.set('client_id', CLIENT_ID)
  authURL.searchParams.set('redirect_uri', redirectURL)
  authURL.searchParams.set('response_type', 'token')
  authURL.searchParams.set('scope', SCOPES)

  return new Promise((resolve) => {
    chrome.identity.launchWebAuthFlow(
      { url: authURL.toString(), interactive: true },
      (responseUrl) => {
        if (chrome.runtime.lastError || !responseUrl) {
          resolve({ error: chrome.runtime.lastError?.message ?? 'Auth failed' })
          return
        }
        // Token arrives in the URL hash: #access_token=...&token_type=Bearer&...
        const hash = new URL(responseUrl).hash.substring(1)
        const params = new URLSearchParams(hash)
        const token = params.get('access_token')
        if (!token) {
          resolve({ error: 'No access_token in response' })
          return
        }
        chrome.storage.local.set({ [TOKEN_KEY]: token })
        resolve({ token })
      },
    )
  })
}

export async function clearToken(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(TOKEN_KEY, () => resolve())
  })
}
