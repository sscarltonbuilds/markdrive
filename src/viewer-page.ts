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
import { escapeHtml } from './utils'
import './styles/viewer-page.css'

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
    renderContent(response.content)
  }
)

// ─── Render ───────────────────────────────────────────────────────────────────

function renderContent(source: string): void {
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

  // Raw source pre (hidden by default, toggled by toolbar)
  const rawPre = document.createElement('pre')
  rawPre.className = 'mdp-raw-source'
  rawPre.style.display = 'none'
  rawPre.textContent = source
  root.appendChild(rawPre)

  // TOC — must build after decorateViewer so heading IDs exist
  const tocToggle = buildToc(viewer)

  // Navbar — replaces back button + floating toolbar
  createNavbar({
    fileName,
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

