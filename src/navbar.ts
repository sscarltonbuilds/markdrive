/**
 * Top navigation bar for the standalone viewer page.
 *
 * Layout (Read mode):
 *   [≡]  filename  Back to Drive          [Read | Edit]  ☾
 *
 * Layout (Edit mode):
 *   [≡]  filename ●  Back to Drive        [Read | Edit]  ☾  [Save]
 */

import './styles/navbar.css'

type Theme = 'light' | 'dark' | 'system'
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export interface NavbarOptions {
  fileName:       string
  readTime?:      string        // e.g. "4 min read" — only shown when set
  onBack:         () => void
  onModeChange:   (mode: 'read' | 'edit') => void
  onSave:         () => void
  tocToggle:      (() => void) | null
}

export interface NavbarController {
  toggleView:    () => void
  setActiveMode: (mode: 'read' | 'edit') => void
  setSaveState:  (state: SaveState) => void
  setUnsaved:    (hasChanges: boolean) => void
  getTheme:      () => 'light' | 'dark'
}

const HAMBURGER_SVG = `
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="2" y="3.5" width="12" height="1.5" rx="0.75" fill="currentColor"/>
    <rect x="2" y="7.25" width="12" height="1.5" rx="0.75" fill="currentColor"/>
    <rect x="2" y="11" width="12" height="1.5" rx="0.75" fill="currentColor"/>
  </svg>`

const SPINNER_SVG = `<span class="mdp-nav__save-spinner" aria-hidden="true"></span>`

export function createNavbar(opts: NavbarOptions): NavbarController {
  const nav = document.createElement('header')
  nav.className = 'mdp-nav'

  // ── Left ─────────────────────────────────────────────────────────────────────

  const left = document.createElement('div')
  left.className = 'mdp-nav__left'

  // Hamburger / TOC toggle
  if (opts.tocToggle) {
    const tocBtn = document.createElement('button')
    tocBtn.className = 'mdp-nav__icon-btn'
    tocBtn.setAttribute('aria-label', 'Toggle table of contents')
    tocBtn.title = 'Toggle table of contents'
    tocBtn.innerHTML = HAMBURGER_SVG
    tocBtn.addEventListener('click', opts.tocToggle)
    left.appendChild(tocBtn)
  }

  // File name as title
  const title = document.createElement('span')
  title.className = 'mdp-nav__title'
  title.textContent = opts.fileName.replace(/\.(md|markdown|mdown|mkd)$/i, '')
  title.title = opts.fileName
  left.appendChild(title)

  // Unsaved dot (hidden until there are unsaved changes)
  const unsavedDot = document.createElement('span')
  unsavedDot.className = 'mdp-nav__unsaved-dot'
  unsavedDot.setAttribute('aria-label', 'Unsaved changes')
  unsavedDot.title = 'Unsaved changes'
  left.appendChild(unsavedDot)

  // Read time badge
  if (opts.readTime) {
    const badge = document.createElement('span')
    badge.className = 'mdp-nav__readtime'
    badge.textContent = opts.readTime
    left.appendChild(badge)
  }

  // Back to Drive
  const backBtn = document.createElement('button')
  backBtn.className = 'mdp-nav__back'
  backBtn.textContent = 'Back to Drive'
  backBtn.addEventListener('click', opts.onBack)
  left.appendChild(backBtn)

  // ── Right ────────────────────────────────────────────────────────────────────

  const right = document.createElement('div')
  right.className = 'mdp-nav__right'

  // Read / Edit segmented control
  const segment = document.createElement('div')
  segment.className = 'mdp-nav__segment'
  segment.setAttribute('role', 'group')
  segment.setAttribute('aria-label', 'View mode')

  const readBtn = document.createElement('button')
  readBtn.className = 'mdp-nav__seg mdp-nav__seg--active'
  readBtn.textContent = 'Read'

  const editBtn = document.createElement('button')
  editBtn.className = 'mdp-nav__seg'
  editBtn.textContent = 'Edit'

  let currentMode: 'read' | 'edit' = 'read'

  // Updates UI only — no callback (used for cancel/revert from viewer-page)
  function applyModeUI(mode: 'read' | 'edit') {
    currentMode = mode
    readBtn.classList.toggle('mdp-nav__seg--active', mode === 'read')
    editBtn.classList.toggle('mdp-nav__seg--active', mode === 'edit')
    saveBtn.classList.toggle('mdp-nav__save--visible', mode === 'edit')
  }

  function setMode(mode: 'read' | 'edit') {
    applyModeUI(mode)
    opts.onModeChange(mode)
  }

  readBtn.addEventListener('click', () => setMode('read'))
  editBtn.addEventListener('click', () => setMode('edit'))

  segment.appendChild(readBtn)
  segment.appendChild(editBtn)
  right.appendChild(segment)

  // Theme toggle
  const themeBtn = document.createElement('button')
  themeBtn.className = 'mdp-nav__icon-btn mdp-nav__theme-btn'
  themeBtn.setAttribute('aria-label', 'Toggle light/dark mode')

  let effectiveTheme: 'light' | 'dark' = 'light'

  function getSystemTheme(): 'light' | 'dark' {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  function resolveTheme(stored: Theme): 'light' | 'dark' {
    return stored === 'system' ? getSystemTheme() : stored
  }

  function applyTheme(stored: Theme) {
    effectiveTheme = resolveTheme(stored)
    const isDark = effectiveTheme === 'dark'
    document.documentElement.dataset.theme = effectiveTheme
    document.querySelectorAll<HTMLElement>('.markdrive-viewer').forEach(v => {
      v.setAttribute('data-theme', effectiveTheme)
    })
    nav.classList.toggle('mdp-nav--dark',  isDark)
    nav.classList.toggle('mdp-nav--light', !isDark)
    themeBtn.textContent = isDark ? '☀' : '☾'
    themeBtn.title       = isDark ? 'Switch to light mode' : 'Switch to dark mode'
  }

  chrome.storage.local.get('markdrive_theme', (result) => {
    applyTheme((result['markdrive_theme'] as Theme | undefined) ?? 'system')
  })

  themeBtn.addEventListener('click', () => {
    const next: 'light' | 'dark' = effectiveTheme === 'dark' ? 'light' : 'dark'
    chrome.storage.local.set({ markdrive_theme: next })
    applyTheme(next)
  })

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes['markdrive_theme']) {
      applyTheme(changes['markdrive_theme'].newValue as Theme)
    }
  })

  right.appendChild(themeBtn)

  // Save button (only visible in Edit mode)
  const saveBtn = document.createElement('button')
  saveBtn.className = 'mdp-nav__save'
  saveBtn.textContent = 'Save'
  saveBtn.setAttribute('aria-label', 'Save file (Ctrl+S)')
  saveBtn.addEventListener('click', opts.onSave)
  right.appendChild(saveBtn)

  nav.appendChild(left)
  nav.appendChild(right)
  document.body.insertBefore(nav, document.body.firstChild)

  // ── Controller ───────────────────────────────────────────────────────────────

  let savedTimer: ReturnType<typeof setTimeout>

  return {
    toggleView() {
      setMode(currentMode === 'read' ? 'edit' : 'read')
    },

    setActiveMode(mode) {
      applyModeUI(mode)
    },

    setSaveState(state: SaveState) {
      clearTimeout(savedTimer)
      saveBtn.className = `mdp-nav__save mdp-nav__save--visible`
      switch (state) {
        case 'idle':
          saveBtn.innerHTML = 'Save'
          break
        case 'saving':
          saveBtn.innerHTML = `${SPINNER_SVG} Saving…`
          saveBtn.classList.add('mdp-nav__save--saving')
          break
        case 'saved':
          saveBtn.innerHTML = 'Saved ✓'
          saveBtn.classList.add('mdp-nav__save--saved')
          savedTimer = setTimeout(() => {
            saveBtn.innerHTML = 'Save'
            saveBtn.className = `mdp-nav__save mdp-nav__save--visible`
          }, 2000)
          break
        case 'error':
          saveBtn.innerHTML = 'Save failed'
          saveBtn.classList.add('mdp-nav__save--error')
          break
      }
    },

    setUnsaved(hasChanges: boolean) {
      unsavedDot.classList.toggle('mdp-nav__unsaved-dot--visible', hasChanges)
      saveBtn.classList.toggle('mdp-nav__save--primary', hasChanges)
    },

    getTheme() {
      return effectiveTheme
    },
  }
}
