import type { MarkdownFileDetected } from './types'

// ─── Mode detection ───────────────────────────────────────────────────────────
//
// Drive's preview container uses [aria-label^="Displaying <filename>"].
// The trailing period is the exact discriminator between the two modes:
//
//   "Displaying foo.md"   → full-tab (/file/d/ID/view) — <pre> has content
//   "Displaying foo.md."  → inline preview pane        — container is always empty
//

interface PreviewInfo {
  fileName: string
  fileId: string
  mode: 'inline' | 'full-tab'
  container: HTMLElement
}

/**
 * Parse the aria-label from [aria-label^="Displaying "] and return mode + filename.
 * Returns null if the label doesn't match or the file isn't Markdown.
 */
function parseDisplayingLabel(
  el: HTMLElement
): { fileName: string; mode: 'inline' | 'full-tab' } | null {
  const raw = el.getAttribute('aria-label') ?? ''

  // Inline pane: trailing period after the filename
  const inlineMatch = raw.match(/^Displaying\s+(.+)\.$/)
  if (inlineMatch) {
    const fileName = inlineMatch[1].trim()
    return /\.md$/i.test(fileName) ? { fileName, mode: 'inline' } : null
  }

  // Full-tab: no trailing period
  const fullTabMatch = raw.match(/^Displaying\s+(.+)$/)
  if (fullTabMatch) {
    const fileName = fullTabMatch[1].trim()
    return /\.md$/i.test(fileName) ? { fileName, mode: 'full-tab' } : null
  }

  return null
}

/**
 * Resolve the file ID for the current preview.
 *
 * Inline mode: find the file row by filename first (no dependency on
 *              aria-selected timing), falling back to the selected row.
 * Full-tab:    The URL reliably contains /file/d/FILE_ID/.
 */
function resolveFileId(mode: 'inline' | 'full-tab', fileName?: string): string | null {
  if (mode === 'inline') {
    // Drive rows have no aria-label — match by text content instead.
    if (fileName) {
      const rows = document.querySelectorAll<HTMLElement>('TR[data-id]')
      for (const row of rows) {
        if ((row.textContent ?? '').includes(fileName)) {
          return row.getAttribute('data-id')
        }
      }
    }
    // Fallback: selected row
    return document.querySelector<HTMLElement>(
      'TR[data-id][aria-selected="true"]'
    )?.getAttribute('data-id') ?? null
  }

  const m = window.location.href.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  return m ? m[1] : null
}

// ─── SPA navigation interception ─────────────────────────────────────────────

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
export type FileLeftCallback = () => void

export class DriveObserver {
  private mutationObserver: MutationObserver | null = null
  private dialogWatcher: MutationObserver | null = null
  private watchedDialog: Element | null = null
  private teardownNav: (() => void) | null = null
  private lastUrl: string = ''
  private lastDetectedFileId: string = ''
  private lastDetectedFileName: string = ''
  private pendingCheck: ReturnType<typeof setTimeout> | null = null
  private readonly onDetected: DetectionCallback
  private readonly onFileLeft?: FileLeftCallback

  constructor(onDetected: DetectionCallback, onFileLeft?: FileLeftCallback) {
    this.onDetected = onDetected
    this.onFileLeft = onFileLeft
  }

  start(): void {
    this.teardownNav = interceptNavigation((url) => {
      if (url !== this.lastUrl) {
        this.lastUrl = url
        this.lastDetectedFileId = ''
        this.lastDetectedFileName = ''
        this.scheduleCheck()
      }
    })

    this.mutationObserver = new MutationObserver(() => this.scheduleCheck())
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label', 'role', 'data-id', 'aria-selected'],
    })

    const titleEl = document.querySelector('title')
    if (titleEl) {
      const titleObserver = new MutationObserver(() => this.scheduleCheck())
      titleObserver.observe(titleEl, { childList: true })
    }

    this.lastUrl = window.location.href
    this.scheduleCheck()
  }

  stop(): void {
    this.mutationObserver?.disconnect()
    this.mutationObserver = null
    this.dialogWatcher?.disconnect()
    this.dialogWatcher = null
    this.watchedDialog = null
    this.teardownNav?.()
    this.teardownNav = null
    if (this.pendingCheck !== null) {
      clearTimeout(this.pendingCheck)
      this.pendingCheck = null
    }
  }

  /**
   * Set up a targeted watcher on the preview dialog so we catch Drive
   * hiding it (via class/style/aria-hidden) without watching every element
   * on the page — which caused animation noise and spurious fileLeft() calls.
   */
  private ensureDialogWatched(dialog: Element): void {
    if (this.watchedDialog === dialog) return
    this.dialogWatcher?.disconnect()
    this.watchedDialog = dialog
    this.dialogWatcher = new MutationObserver(() => this.scheduleCheck())
    this.dialogWatcher.observe(dialog, {
      attributes: true,
      attributeFilter: ['class', 'style', 'aria-hidden'],
    })
  }

  private scheduleCheck(): void {
    if (this.pendingCheck !== null) clearTimeout(this.pendingCheck)
    this.pendingCheck = setTimeout(() => {
      this.pendingCheck = null
      this.check()
    }, 300)
  }

  /**
   * @param isFilenameSwitch true when called because the filename changed in
   *   the aria-label (file A → file B in same pane). In this case we record
   *   the stale fileId so resolveFileId can't accidentally re-emit the old
   *   file while aria-selected is still catching up.
   *   false (default) when called because the preview was actually closed —
   *   we do NOT set lastStaleFileId so the same file can be re-opened cleanly.
   */
  private fileLeft(): void {
    this.lastDetectedFileId = ''
    this.lastDetectedFileName = ''
    this.onFileLeft?.()
  }


  private check(): void {
    // Find the preview container — same selector for both modes
    const el = document.querySelector<HTMLElement>('[aria-label^="Displaying "]')

    // No preview element at all — try URL+title fallback for direct /file/d/<id>/view tabs
    if (!el) {
      const urlMatch = window.location.href.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
      const titleMatch = document.title.match(/^(.+\.md)\s*[-–—]\s*Google Drive/i)
      if (urlMatch && titleMatch) {
        const fileId  = urlMatch[1]
        const fileName = titleMatch[1].trim()
        const sameFile = fileId === this.lastDetectedFileId && fileName === this.lastDetectedFileName
        if (!sameFile || !document.querySelector('.markdrive-viewer')) {
          this.lastDetectedFileId  = fileId
          this.lastDetectedFileName = fileName
          this.emit({ fileId, fileName, previewContainer: document.body, mode: 'full-tab' })
        }
        return
      }
      if (this.lastDetectedFileId) this.fileLeft()
      return
    }

    // Drive keeps the Displaying element in the DOM when the preview pane is
    // closed (it just hides the dialog via class/style changes). Set up a
    // targeted watcher on the dialog so those changes trigger check() without
    // us having to watch every element on the page (which caused animation noise).
    const dialog = el.closest('[role="dialog"]')
    if (dialog) {
      this.ensureDialogWatched(dialog)
      const s = getComputedStyle(dialog as HTMLElement)
      if (s.display === 'none' || s.visibility === 'hidden') {
        if (this.lastDetectedFileId) this.fileLeft()
        return
      }
    }
    if (el.closest('[aria-hidden="true"]')) {
      if (this.lastDetectedFileId) this.fileLeft()
      return
    }

    const parsed = parseDisplayingLabel(el)

    // Non-MD file — remove any injected elements and reset
    if (!parsed) {
      el.querySelector('.markdrive-viewer')?.remove()
      el.querySelector('.markdrive-error')?.remove()
      el.querySelector('.markdrive-toolbar')?.remove()
      const hiddenPre = el.querySelector<HTMLElement>('pre')
      if (hiddenPre) hiddenPre.style.display = ''
      if (this.lastDetectedFileId) this.fileLeft()
      return
    }

    const { fileName, mode } = parsed

    // If the filename changed, fire fileLeft immediately so the old button is
    // removed before we resolve the new fileId.
    if (fileName !== this.lastDetectedFileName && this.lastDetectedFileName !== '') {
      this.fileLeft()
    }

    const fileId = resolveFileId(mode, fileName)
    if (!fileId) {
      console.debug(`[MarkDrive] ${mode} mode — could not resolve file ID for "${fileName}"`)
      return
    }

    if (fileId === this.lastDetectedFileId && fileName === this.lastDetectedFileName) {
      // Exactly the same file — re-emit only if Drive replaced the container
      if (!el.querySelector('.markdrive-viewer')) {
        console.debug('[MarkDrive] container refreshed for same file — re-rendering')
        this.emit({ fileId, fileName, previewContainer: el, mode })
      }
      return
    }

    this.lastDetectedFileId = fileId
    this.lastDetectedFileName = fileName
    this.emit({ fileId, fileName, previewContainer: el, mode })
  }

  private emit(event: MarkdownFileDetected): void {
    this.onDetected(event)
  }
}
