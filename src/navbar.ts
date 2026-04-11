/**
 * Top navigation bar for the standalone viewer page.
 * Replaces the floating toolbar + back button with a single coherent header.
 *
 * Layout:
 *   [≡]  MarkDrive  Back to Drive          [Rendered | Raw]  [☀/☾]
 */

import './styles/navbar.css'

type Theme = 'light' | 'dark' | 'system'

export interface NavbarOptions {
  fileName:       string
  readTime?:      string        // e.g. "4 min read" — only shown when set
  onBack:         () => void
  onSourceToggle: (showingRaw: boolean) => void
  tocToggle:      (() => void) | null
}

export interface NavbarController {
  toggleView: () => void
}

const HAMBURGER_SVG = `
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="2" y="3.5" width="12" height="1.5" rx="0.75" fill="currentColor"/>
    <rect x="2" y="7.25" width="12" height="1.5" rx="0.75" fill="currentColor"/>
    <rect x="2" y="11" width="12" height="1.5" rx="0.75" fill="currentColor"/>
  </svg>`

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
  // Strip common markdown extensions for cleaner display
  title.textContent = opts.fileName.replace(/\.(md|markdown|mdown|mkd)$/i, '')
  title.title = opts.fileName
  left.appendChild(title)

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

  // Rendered / Raw segmented control
  const segment = document.createElement('div')
  segment.className = 'mdp-nav__segment'
  segment.setAttribute('role', 'group')
  segment.setAttribute('aria-label', 'View mode')

  const renderedBtn = document.createElement('button')
  renderedBtn.className = 'mdp-nav__seg mdp-nav__seg--active'
  renderedBtn.textContent = 'Rendered'

  const rawBtn = document.createElement('button')
  rawBtn.className = 'mdp-nav__seg'
  rawBtn.textContent = 'Raw'

  let showingRaw = false
  function setView(raw: boolean) {
    showingRaw = raw
    renderedBtn.classList.toggle('mdp-nav__seg--active', !raw)
    rawBtn.classList.toggle('mdp-nav__seg--active', raw)
    opts.onSourceToggle(raw)
  }
  renderedBtn.addEventListener('click', () => setView(false))
  rawBtn.addEventListener('click',      () => setView(true))
  function toggleView() { setView(!showingRaw) }

  segment.appendChild(renderedBtn)
  segment.appendChild(rawBtn)
  right.appendChild(segment)

  // Theme toggle
  const themeBtn = document.createElement('button')
  themeBtn.className = 'mdp-nav__icon-btn mdp-nav__theme-btn'
  themeBtn.setAttribute('aria-label', 'Toggle light/dark mode')

  function getSystemTheme(): 'light' | 'dark' {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  function resolveTheme(stored: Theme): 'light' | 'dark' {
    return stored === 'system' ? getSystemTheme() : stored
  }

  function applyTheme(stored: Theme) {
    const effective = resolveTheme(stored)
    const isDark = effective === 'dark'
    document.documentElement.dataset.theme = effective
    // Also set on the viewer element for its own CSS vars
    document.querySelector<HTMLElement>('.markdrive-viewer')?.setAttribute('data-theme', effective)
    nav.classList.toggle('mdp-nav--dark',  isDark)
    nav.classList.toggle('mdp-nav--light', !isDark)
    themeBtn.textContent = isDark ? '☀' : '☾'
    themeBtn.title       = isDark ? 'Switch to light mode' : 'Switch to dark mode'
  }

  chrome.storage.local.get('markdrive_theme', (result) => {
    applyTheme((result['markdrive_theme'] as Theme | undefined) ?? 'system')
  })

  themeBtn.addEventListener('click', () => {
    const current = (document.documentElement.dataset.theme ?? 'light') as 'light' | 'dark'
    const next: 'light' | 'dark' = current === 'dark' ? 'light' : 'dark'
    chrome.storage.local.set({ markdrive_theme: next })
    applyTheme(next)
  })

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes['markdrive_theme']) {
      applyTheme(changes['markdrive_theme'].newValue as Theme)
    }
  })

  right.appendChild(themeBtn)

  nav.appendChild(left)
  nav.appendChild(right)
  document.body.insertBefore(nav, document.body.firstChild)

  return { toggleView }
}
