/**
 * Module: Standalone viewer page (new-tab mode)
 *
 * Fetches a Drive file via the background worker and renders it as Markdown.
 * Runs as a full Chrome extension page — normal browser scroll, no Drive CSS.
 */

import { renderMarkdown, decorateViewer } from './renderer'
import { renderMermaidBlocks } from './mermaid-renderer'
import { createNavbar } from './navbar'
import { buildToc } from './toc'
import { clampTallTables } from './table-features'
import { initKeyboardShortcuts, closeShortcutsOverlay } from './keyboard'
import { initSearch } from './search'
import { escapeHtml } from './utils'
import './styles/viewer-page.css'
import './styles/search.css'
import './styles/shortcuts.css'

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const params      = new URLSearchParams(location.search)
const fileId      = params.get('fileId')      ?? ''
const fileName    = params.get('fileName')    ?? 'Untitled.md'
const driveTabId  = parseInt(params.get('driveTabId') ?? '', 10)

// ─── Auto-refresh ─────────────────────────────────────────────────────────────

const POLL_INTERVAL = 45_000 // ms
let lastModifiedTime: string | null = null

type CheckModifiedResponse = { ok: true; modifiedTime: string } | { ok: false; error: string }

function startAutoRefresh(): void {
  if (!fileId) return

  // Capture baseline modifiedTime
  chrome.runtime.sendMessage(
    { type: 'CHECK_MODIFIED', payload: { fileId } },
    (res: CheckModifiedResponse) => {
      if (res?.ok) lastModifiedTime = res.modifiedTime
    }
  )

  setInterval(() => {
    chrome.runtime.sendMessage(
      { type: 'CHECK_MODIFIED', payload: { fileId } },
      (res: CheckModifiedResponse) => {
        if (!res?.ok || !lastModifiedTime) return
        if (res.modifiedTime !== lastModifiedTime) {
          lastModifiedTime = res.modifiedTime
          showRefreshBanner()
        }
      }
    )
  }, POLL_INTERVAL)
}

function showRefreshBanner(): void {
  if (document.querySelector('.mdp-refresh-banner')) return

  const banner = document.createElement('div')
  banner.className = 'mdp-refresh-banner'
  banner.innerHTML = `
    <span>File updated in Drive</span>
    <button class="mdp-refresh-banner__btn">Refresh</button>
    <button class="mdp-refresh-banner__dismiss" aria-label="Dismiss">✕</button>
  `
  banner.querySelector('.mdp-refresh-banner__btn')!
    .addEventListener('click', () => location.reload())
  banner.querySelector('.mdp-refresh-banner__dismiss')!
    .addEventListener('click', () => banner.remove())

  document.body.appendChild(banner)
}

document.title = `${fileName} — MarkDrive`

const root = document.getElementById('viewer-root')!

// Show skeleton while fetching
root.innerHTML = buildSkeleton()

// ─── Fetch ────────────────────────────────────────────────────────────────────

chrome.runtime.sendMessage(
  { type: 'FETCH_FILE', payload: { fileId } },
  (response: { ok: true; content: string } | { ok: false; error: string }) => {
    if (chrome.runtime.lastError) {
      renderError(chrome.runtime.lastError.message ?? 'Extension error')
      return
    }
    if (!response.ok) {
      renderError(response.error)
      return
    }
    void renderContent(response.content)
  }
)

// ─── Persistent scroll ────────────────────────────────────────────────────────

const SCROLL_KEY = `mdp-scroll-${fileId}`
let scrollSaveTimer: ReturnType<typeof setTimeout>

function saveScroll() {
  clearTimeout(scrollSaveTimer)
  scrollSaveTimer = setTimeout(() => {
    sessionStorage.setItem(SCROLL_KEY, String(window.scrollY))
  }, 300)
}

function restoreScroll() {
  const saved = sessionStorage.getItem(SCROLL_KEY)
  if (saved) {
    requestAnimationFrame(() => {
      window.scrollTo({ top: parseInt(saved, 10), behavior: 'instant' })
    })
  }
}

// ─── Read time ────────────────────────────────────────────────────────────────

function calcReadTime(source: string): string {
  const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  const words = body.trim().split(/\s+/).filter(Boolean).length
  const minutes = Math.max(1, Math.round(words / 200))
  return `${minutes} min read`
}

function getShowReadTime(): Promise<boolean> {
  return new Promise(resolve => {
    chrome.storage.local.get('markdrive_show_readtime', res => {
      resolve(res['markdrive_show_readtime'] === true)
    })
  })
}

// ─── Render ───────────────────────────────────────────────────────────────────

async function renderContent(source: string): Promise<void> {
  root.innerHTML = ''

  const viewer = document.createElement('div')
  viewer.className = 'markdrive-viewer'
  viewer.dataset.mode = 'page'
  viewer.dataset.rawSource = source
  viewer.innerHTML = renderMarkdown(source)
  decorateViewer(viewer)
  root.appendChild(viewer)

  // Clamp tall tables — must run after append so scrollHeight is available
  clampTallTables(viewer)

  // Raw source pre (hidden by default, toggled by nav)
  const rawPre = document.createElement('pre')
  rawPre.className = 'mdp-raw-source'
  rawPre.style.display = 'none'
  rawPre.textContent = source
  root.appendChild(rawPre)

  // TOC — must build after decorateViewer so heading IDs exist
  const tocToggle = buildToc(viewer)

  // Read time (optional setting)
  const showReadTime = await getShowReadTime()
  const readTime = showReadTime ? calcReadTime(source) : undefined

  // Search
  const { open: openSearch, close: closeSearch } = initSearch(viewer)

  // Navbar
  const navbar = createNavbar({
    fileName,
    readTime,
    onBack() {
      if (!isNaN(driveTabId)) {
        chrome.runtime.sendMessage({ type: 'SWITCH_TO_TAB', payload: { tabId: driveTabId } })
      }
      window.close()
    },
    onSourceToggle(showingRaw) {
      crossfade(showingRaw ? viewer : rawPre, showingRaw ? rawPre : viewer)
    },
    tocToggle,
  })

  // Keyboard shortcuts
  initKeyboardShortcuts({
    onToggleRaw:  () => navbar.toggleView(),
    onToggleToc:  tocToggle,
    onOpenSearch: openSearch,
    onEscape: () => {
      closeShortcutsOverlay()
      closeSearch()
    },
  })

  // Persistent scroll
  restoreScroll()
  window.addEventListener('scroll', saveScroll, { passive: true })

  void renderMermaidBlocks(viewer)

  startAutoRefresh()
}

function renderError(message: string): void {
  root.innerHTML = `
    <div class="mdp-error">
      <div class="mdp-error__box">
        <span class="mdp-error__icon">&#9888;</span>
        <p class="mdp-error__msg">MarkDrive: ${escapeHtml(message)}</p>
      </div>
    </div>
  `
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function buildSkeleton(): string {
  const lines = [
    { w: '55%', h: '28px', mb: '24px' },  // h1
    { w: '100%', h: '14px', mb: '10px' }, // p
    { w: '100%', h: '14px', mb: '10px' },
    { w: '80%',  h: '14px', mb: '24px' },
    { w: '40%',  h: '20px', mb: '16px' }, // h2
    { w: '100%', h: '14px', mb: '10px' },
    { w: '100%', h: '14px', mb: '10px' },
    { w: '60%',  h: '14px', mb: '24px' },
    { w: '100%', h: '80px', mb: '24px' }, // code block
    { w: '35%',  h: '20px', mb: '16px' },
    { w: '100%', h: '14px', mb: '10px' },
    { w: '75%',  h: '14px', mb: '10px' },
  ]

  const inner = lines.map(({ w, h, mb }) =>
    `<div class="mdp-skel" style="width:${w};height:${h};margin-bottom:${mb}"></div>`
  ).join('')

  return `<div class="mdp-loading">${inner}</div>`
}

// ─── View crossfade ───────────────────────────────────────────────────────────
// Smoothly swaps two elements: fades outgoing out, then fades incoming in.

function crossfade(outEl: HTMLElement, inEl: HTMLElement): void {
  const DURATION = 120 // ms per half

  // Fade out
  outEl.style.transition = `opacity ${DURATION}ms ease`
  outEl.style.opacity = '0'

  setTimeout(() => {
    outEl.style.display = 'none'
    outEl.style.transition = ''
    outEl.style.opacity = ''

    // Show and fade in
    inEl.style.opacity = '0'
    inEl.style.display = inEl.tagName === 'PRE' ? 'block' : ''
    // force reflow so transition fires
    void inEl.offsetHeight
    inEl.style.transition = `opacity ${DURATION}ms ease`
    inEl.style.opacity = '1'

    setTimeout(() => {
      inEl.style.transition = ''
      inEl.style.opacity = ''
    }, DURATION)
  }, DURATION)
}

