import { signIn, getStoredToken, clearToken } from './auth'

const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

interface UserInfo {
  email: string
  name:  string
  picture: string
}

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const loadingEl   = document.getElementById('loading')    as HTMLElement
const signedInEl  = document.getElementById('signed-in')  as HTMLElement
const signedOutEl = document.getElementById('signed-out') as HTMLElement
const avatarEl    = document.getElementById('avatar')     as HTMLImageElement
const nameEl      = document.getElementById('user-name')  as HTMLElement
const emailEl     = document.getElementById('user-email') as HTMLElement
const signInBtn   = document.getElementById('sign-in-btn')  as HTMLButtonElement
const signOutBtn  = document.getElementById('sign-out-btn') as HTMLButtonElement
const errorEl     = document.getElementById('error')      as HTMLElement

const themeSegEl       = document.getElementById('theme-seg')       as HTMLElement
const tocToggleEl      = document.getElementById('toc-toggle')      as HTMLInputElement
const readTimeToggleEl = document.getElementById('readtime-toggle') as HTMLInputElement
const autosaveToggleEl = document.getElementById('autosave-toggle') as HTMLInputElement

// ─── Helpers ──────────────────────────────────────────────────────────────────

function show(el: HTMLElement, displayValue = 'block') { el.style.display = displayValue }
function hide(el: HTMLElement) { el.style.display = 'none' }

function showError(msg: string) {
  errorEl.textContent = msg
  show(errorEl)
}

// ─── Segmented control helper ─────────────────────────────────────────────────

function initSeg(container: HTMLElement, storageKey: string, defaultValue: string, onChange?: (val: string) => void) {
  const btns = [...container.querySelectorAll<HTMLButtonElement>('.seg__btn')]
  // Guard against the async storage read clobbering a click that arrived
  // before the callback fired (the popup opens fast but storage is async).
  let interacted = false

  function setActive(value: string) {
    btns.forEach(b => b.classList.toggle('seg__btn--active', b.dataset.value === value))
  }

  // Load stored value
  chrome.storage.local.get(storageKey, (result) => {
    if (interacted) return   // user already made a choice — don't overwrite it
    const stored = (result[storageKey] as string | undefined) ?? defaultValue
    setActive(stored)
    onChange?.(stored)
  })

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      interacted = true
      const value = btn.dataset.value ?? defaultValue
      setActive(value)
      const toStore: Record<string, string> = {}
      toStore[storageKey] = value
      chrome.storage.local.set(toStore)
      onChange?.(value)
    })
  })
}

// ─── Settings init ─────────────────────────────────────────────────────────────

function initSettings() {
  // Theme: system / light / dark
  initSeg(themeSegEl, 'markdrive_theme', 'system')

  // TOC open by default
  chrome.storage.local.get('markdrive_toc_open', (result) => {
    tocToggleEl.checked = (result['markdrive_toc_open'] as boolean | undefined) ?? false
  })

  tocToggleEl.addEventListener('change', () => {
    chrome.storage.local.set({ markdrive_toc_open: tocToggleEl.checked })
  })

  // Show reading time
  chrome.storage.local.get('markdrive_show_readtime', (result) => {
    readTimeToggleEl.checked = (result['markdrive_show_readtime'] as boolean | undefined) ?? false
  })
  readTimeToggleEl.addEventListener('change', () => {
    chrome.storage.local.set({ markdrive_show_readtime: readTimeToggleEl.checked })
  })

  // Autosave while editing
  chrome.storage.local.get('markdrive_autosave', (result) => {
    autosaveToggleEl.checked = (result['markdrive_autosave'] as boolean | undefined) ?? false
  })
  autosaveToggleEl.addEventListener('change', () => {
    chrome.storage.local.set({ markdrive_autosave: autosaveToggleEl.checked })
  })
}

// ─── Account helpers ──────────────────────────────────────────────────────────

async function fetchUserInfo(token: string): Promise<UserInfo | { error: string }> {
  try {
    const res = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { error: `Userinfo ${res.status}: ${body.slice(0, 120)}` }
    }
    return await res.json() as UserInfo
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' }
  }
}

function renderSignedIn(info: UserInfo) {
  if (info.picture) {
    avatarEl.src = info.picture
    show(avatarEl)
  }
  nameEl.textContent  = info.name  || ''
  emailEl.textContent = info.email || ''
  hide(loadingEl)
  hide(signedOutEl)
  show(signedInEl)
}

function renderSignedOut() {
  hide(loadingEl)
  hide(signedInEl)
  show(signedOutEl, 'block')
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  initSettings()

  const token = await getStoredToken()
  if (token) {
    const info = await fetchUserInfo(token)
    if ('error' in info) {
      await clearToken()
      renderSignedOut()
    } else {
      renderSignedIn(info)
    }
  } else {
    renderSignedOut()
  }
}

// ─── Button handlers ──────────────────────────────────────────────────────────

const GOOGLE_ICON_SVG = `
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>`

signInBtn.addEventListener('click', async () => {
  signInBtn.disabled = true
  signInBtn.textContent = 'Signing in\u2026'
  hide(errorEl)

  const result = await signIn()

  if ('error' in result) {
    signInBtn.disabled = false
    signInBtn.innerHTML = `${GOOGLE_ICON_SVG} Sign in with Google`
    showError(result.error)
    return
  }

  const info = await fetchUserInfo(result.token)
  if ('error' in info) {
    signInBtn.disabled = false
    signInBtn.innerHTML = `${GOOGLE_ICON_SVG} Sign in with Google`
    showError(info.error)
  } else {
    renderSignedIn(info)
  }
})

signOutBtn.addEventListener('click', async () => {
  await clearToken()
  renderSignedOut()
})

init()
