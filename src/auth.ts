// Auth helpers — PKCE OAuth 2.0 via chrome.identity.launchWebAuthFlow.
// Token stored in session storage so it survives service-worker restarts
// but is cleared when the browser closes.

const TOKEN_KEY   = 'markdriveToken'
const EXPIRY_KEY  = 'markdriveTokenExpiry'

const CLIENT_ID     = '608826245761-unnnqsbloll8nj0iabjllftaoontcnsd.apps.googleusercontent.com'
const CLIENT_SECRET = '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'
const SCOPES        = 'https://www.googleapis.com/auth/drive openid email profile'
const TOKEN_URL     = 'https://oauth2.googleapis.com/token'

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const raw = crypto.getRandomValues(new Uint8Array(32))
  const verifier = base64url(raw.buffer)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const challenge = base64url(digest)
  return { verifier, challenge }
}

// ─── Token storage ─────────────────────────────────────────────────────────────

export async function getStoredToken(): Promise<string | null> {
  const data = await chrome.storage.session.get([TOKEN_KEY, EXPIRY_KEY])
  const token  = data[TOKEN_KEY]  as string | undefined
  const expiry = data[EXPIRY_KEY] as number | undefined
  if (token && expiry && Date.now() < expiry - 60_000) return token
  return null
}

export async function storeToken(token: string, expiresIn: number): Promise<void> {
  await chrome.storage.session.set({
    [TOKEN_KEY]:  token,
    [EXPIRY_KEY]: Date.now() + expiresIn * 1000,
  })
}

export async function clearToken(): Promise<void> {
  await chrome.storage.session.remove([TOKEN_KEY, EXPIRY_KEY])
}

// ─── OAuth flow ────────────────────────────────────────────────────────────────

export async function signIn(): Promise<{ token: string } | { error: string }> {
  const redirectUri = chrome.identity.getRedirectURL()
  const { verifier, challenge } = await generatePKCE()

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id',             CLIENT_ID)
  authUrl.searchParams.set('response_type',         'code')
  authUrl.searchParams.set('redirect_uri',          redirectUri)
  authUrl.searchParams.set('scope',                 SCOPES)
  authUrl.searchParams.set('code_challenge',        challenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('access_type',           'online')

  return new Promise((resolve) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl.toString(), interactive: true, width: 520, height: 680 },
      async (callbackUrl) => {
        if (chrome.runtime.lastError || !callbackUrl) {
          resolve({ error: chrome.runtime.lastError?.message ?? 'Auth flow cancelled' })
          return
        }

        const code = new URL(callbackUrl).searchParams.get('code')
        if (!code) {
          resolve({ error: 'No authorization code in redirect' })
          return
        }

        try {
          const res = await fetch(TOKEN_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id:     CLIENT_ID,
              client_secret: CLIENT_SECRET,
              code,
              code_verifier: verifier,
              grant_type:    'authorization_code',
              redirect_uri:  redirectUri,
            }),
          })

          if (!res.ok) {
            const text = await res.text()
            resolve({ error: `Token exchange failed: ${text}` })
            return
          }

          const json = await res.json() as { access_token: string; expires_in: number }
          await storeToken(json.access_token, json.expires_in)
          resolve({ token: json.access_token })
        } catch (err) {
          resolve({ error: err instanceof Error ? err.message : 'Token exchange error' })
        }
      }
    )
  })
}
