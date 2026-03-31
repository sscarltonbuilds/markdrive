import type { MarkdownFileDetected } from './types'

// ─── URL / file-ID extraction ────────────────────────────────────────────────

/**
 * Extract a Drive file ID from the current URL.
 * Handles:
 *   /file/d/FILE_ID/view          ← direct file view
 *   /open?id=FILE_ID               ← legacy open link
 *   ?usp=sharing&id=FILE_ID        ← sharing URL variant
 */
function extractFileIdFromUrl(url: string): string | null {
  const directMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (directMatch) return directMatch[1]

  const queryMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (queryMatch) return queryMatch[1]

  return null
}

/**
 * Extract the file name from the page title.
 * Drive sets the title to "<filename> - Google Drive" when a file is open.
 */
function extractFileNameFromTitle(): string | null {
  const title = document.title
  const match = title.match(/^(.+?)\s+-\s+Google Drive$/)
  return match ? match[1] : null
}

/**
 * Returns true if the file name suggests a Markdown file.
 */
function isMarkdownFileName(name: string): boolean {
  return /\.md$/i.test(name)
}

// ─── Preview container detection ─────────────────────────────────────────────
//
// Drive is a minified SPA — class names change on every deploy.
// We only target structural / ARIA attributes that Google must maintain
// for accessibility. Ordered from most to least specific.
//
// ⚠️  These selectors WILL need updating if Drive changes its DOM structure.
//     When a selector stops working, open DevTools, right-click the raw text
//     in the preview → Inspect, and update the list below.
//
const PREVIEW_CONTAINER_SELECTORS = [
  // Inline preview pane: aria-label = "Displaying <filename>"
  '[aria-label^="Displaying "]',
  // Text-file preview: Drive renders raw content inside a scrollable region
  '[role="main"] [role="document"]',
  '[role="main"] [data-id]',
  // Generic fallback: the labelled region that wraps the file preview
  '[aria-label*="Preview"]',
  '[aria-label*="preview"]',
  // Last-resort: the broadest stable landmark
  '[role="main"]',
]

function findPreviewContainer(): HTMLElement | null {
  for (const selector of PREVIEW_CONTAINER_SELECTORS) {
    const el = document.querySelector<HTMLElement>(selector)
    if (el) {
      console.debug(`[MarkDrive] preview container found via selector: "${selector}"`)
      return el
    }
  }
  return null
}

// ─── Preview pane detection (folder view with inline preview open) ────────────
//
// When a file is previewed inline (Drive folder view, not opened in its own tab)
// the URL stays on the folder — no file ID in the URL.
// We read the file name from the preview container's aria-label instead, and
// try to recover the file ID from nearby DOM data-id attributes.
//

interface PreviewPaneInfo {
  fileId: string    // real Drive file ID, or a synthetic "preview:<name>" key
  fileName: string
  container: HTMLElement
}

/**
 * Try to find the real Drive file ID from the DOM when it isn't in the URL.
 * Drive's file-list rows carry data-id attributes; the selected row is our target.
 */
function extractFileIdFromDom(container: HTMLElement): string | null {
  // Walk up from the preview container — sometimes the ID is on an ancestor
  let el: HTMLElement | null = container
  while (el && el !== document.body) {
    const id = el.dataset.id ?? el.getAttribute('data-fileid') ?? el.getAttribute('data-itemid')
    if (id && /^[a-zA-Z0-9_-]{10,}$/.test(id)) return id
    el = el.parentElement
  }

  // Look for the selected/focused file row in the file list
  const candidates = [
    '[aria-selected="true"][data-id]',
    '[tabindex="0"][data-id]',
    '[data-id][aria-label*=".md"]',
  ]
  for (const sel of candidates) {
    const row = document.querySelector<HTMLElement>(sel)
    if (row?.dataset.id) return row.dataset.id
  }

  return null
}

/**
 * Detect a Markdown file being shown in Drive's inline preview pane.
 * Returns null if no preview pane is open or the file isn't Markdown.
 */
function findPreviewPaneInfo(): PreviewPaneInfo | null {
  // The preview container's aria-label = "Displaying <filename>"
  const container = document.querySelector<HTMLElement>('[aria-label^="Displaying "]')
  if (!container) return null

  const ariaLabel = container.getAttribute('aria-label') ?? ''
  const match = ariaLabel.match(/^Displaying\s+(.+)$/)
  if (!match) return null

  const fileName = match[1].trim()
  if (!isMarkdownFileName(fileName)) return null

  // Best effort: find the real file ID. If we can't, use the name as a
  // dedup key — Strategy A reads from the <pre> in the DOM so never needs it.
  const realId = extractFileIdFromDom(container)
  const fileId = realId ?? `preview:${fileName}`

  return { fileId, fileName, container }
}

// ─── SPA navigation interception ─────────────────────────────────────────────
//
// Drive uses History API push/replaceState for navigation.
// `popstate` alone is not enough — we also need to patch pushState/replaceState.

type NavCallback = (url: string) => void

function interceptNavigation(onNavigate: NavCallback): () => void {
  const original = {
    pushState: history.pushState.bind(history),
    replaceState: history.replaceState.bind(history),
  }

  history.pushState = function (...args) {
    original.pushState(...args)
    onNavigate(window.location.href)
  }
  history.replaceState = function (...args) {
    original.replaceState(...args)
    onNavigate(window.location.href)
  }

  const popHandler = () => onNavigate(window.location.href)
  window.addEventListener('popstate', popHandler)

  return () => {
    history.pushState = original.pushState
    history.replaceState = original.replaceState
    window.removeEventListener('popstate', popHandler)
  }
}

// ─── DriveObserver ────────────────────────────────────────────────────────────

export type DetectionCallback = (event: MarkdownFileDetected) => void

export class DriveObserver {
  private mutationObserver: MutationObserver | null = null
  private teardownNav: (() => void) | null = null
  private lastUrl: string = ''
  private lastDetectedFileId: string = ''
  private pendingCheck: ReturnType<typeof setTimeout> | null = null
  private readonly onDetected: DetectionCallback

  constructor(onDetected: DetectionCallback) {
    this.onDetected = onDetected
  }

  start(): void {
    console.log('[MarkDrive] DriveObserver starting')

    // Intercept SPA navigation
    this.teardownNav = interceptNavigation((url) => {
      if (url !== this.lastUrl) {
        this.lastUrl = url
        this.lastDetectedFileId = '' // reset so navigating back to same file re-fires
        this.scheduleCheck()
      }
    })

    // MutationObserver watches for DOM changes that signal a file preview has loaded
    this.mutationObserver = new MutationObserver(() => {
      this.scheduleCheck()
    })
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label', 'role', 'data-id'],
    })

    // Also watch the title — Drive updates it when a file opens
    const titleObserver = new MutationObserver(() => {
      this.scheduleCheck()
    })
    const titleEl = document.querySelector('title')
    if (titleEl) titleObserver.observe(titleEl, { childList: true })

    // Run an initial check in case the page already shows a file
    this.lastUrl = window.location.href
    this.scheduleCheck()
  }

  stop(): void {
    this.mutationObserver?.disconnect()
    this.mutationObserver = null
    this.teardownNav?.()
    this.teardownNav = null
    if (this.pendingCheck !== null) {
      clearTimeout(this.pendingCheck)
      this.pendingCheck = null
    }
  }

  /**
   * Debounce checks: Drive fires many mutations in rapid succession.
   * We wait 300ms after the last mutation before running detection.
   */
  private scheduleCheck(): void {
    if (this.pendingCheck !== null) clearTimeout(this.pendingCheck)
    this.pendingCheck = setTimeout(() => {
      this.pendingCheck = null
      this.check()
    }, 300)
  }

  private check(): void {
    // ── Path 1: Direct file URL (opened in its own tab / full-page preview) ──
    const url = window.location.href
    const urlFileId = extractFileIdFromUrl(url)
    const titleFileName = extractFileNameFromTitle()

    if (urlFileId && titleFileName && isMarkdownFileName(titleFileName)) {
      if (urlFileId === this.lastDetectedFileId) return

      const container = findPreviewContainer()
      if (!container) {
        console.debug('[MarkDrive] .md file detected via URL, waiting for preview container…')
        return
      }

      this.lastDetectedFileId = urlFileId
      this.emit({ fileId: urlFileId, fileName: titleFileName, previewContainer: container })
      return
    }

    // ── Path 2: Inline preview pane (folder view, URL stays on folder) ───────
    const pane = findPreviewPaneInfo()
    if (!pane) return

    if (pane.fileId === this.lastDetectedFileId) return

    this.lastDetectedFileId = pane.fileId
    this.emit({ fileId: pane.fileId, fileName: pane.fileName, previewContainer: pane.container })
  }

  private emit(event: MarkdownFileDetected): void {
    console.log('[MarkDrive] MarkdownFileDetected', {
      fileId: event.fileId,
      fileName: event.fileName,
      previewContainer: event.previewContainer,
    })
    this.onDetected(event)
  }
}
