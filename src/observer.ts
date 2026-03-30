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
    const url = window.location.href
    const fileId = extractFileIdFromUrl(url)
    const fileName = extractFileNameFromTitle()

    if (!fileId) {
      // Not a direct file URL — might be folder view; nothing to do yet
      return
    }

    if (!fileName || !isMarkdownFileName(fileName)) {
      // File open but it's not a .md file
      console.debug(`[MarkDrive] file detected but not Markdown: "${fileName ?? 'unknown'}"`)
      return
    }

    // Don't re-fire for a file we already handled — Drive mutations keep coming
    // after the preview settles, and we only need one detection per file.
    if (fileId === this.lastDetectedFileId) return

    const container = findPreviewContainer()
    if (!container) {
      // File is .md but preview container not in DOM yet — mutations will retry
      console.debug('[MarkDrive] .md file detected, waiting for preview container…')
      return
    }

    this.lastDetectedFileId = fileId
    const event: MarkdownFileDetected = { fileId, fileName, previewContainer: container }
    console.log('[MarkDrive] MarkdownFileDetected', {
      fileId,
      fileName,
      previewContainer: container,
    })
    this.onDetected(event)
  }
}
