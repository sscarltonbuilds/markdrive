/**
 * Standalone viewer/editor page (new-tab mode).
 *
 * Fetches a Drive file and renders it as Markdown.
 * Supports Read mode (viewer) and Edit mode (CodeMirror split pane).
 */

import { renderMarkdown, decorateViewer } from './renderer'
import { renderMermaidBlocks } from './mermaid-renderer'
import { createNavbar } from './navbar'
import type { NavbarController } from './navbar'
import { buildToc } from './toc'
import { clampTallTables } from './table-features'
import { initKeyboardShortcuts, closeShortcutsOverlay } from './keyboard'
import { initSearch } from './search'
import { createEditor, buildFormattingToolbar, buildStatusBar } from './editor'
import type { EditorController, StatusBarController } from './editor'
import { escapeHtml } from './utils'
import './styles/viewer-page.css'
import './styles/search.css'
import './styles/shortcuts.css'

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const params     = new URLSearchParams(location.search)
const fileId     = params.get('fileId')   ?? ''
const fileName   = params.get('fileName') ?? 'Untitled.md'
const driveTabId = parseInt(params.get('driveTabId') ?? '', 10)

document.title = `${fileName} — MarkDrive`

const root = document.getElementById('viewer-root')!
root.innerHTML = buildSkeleton()

// ─── Auto-refresh ─────────────────────────────────────────────────────────────

const POLL_INTERVAL = 45_000
let lastModifiedTime: string | null = null

type CheckModifiedResponse = { ok: true; modifiedTime: string } | { ok: false; error: string }

function startAutoRefresh(): void {
  if (!fileId) return
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
  return `${Math.max(1, Math.round(words / 200))} min read`
}

function getShowReadTime(): Promise<boolean> {
  return new Promise(resolve =>
    chrome.storage.local.get('markdrive_show_readtime', res =>
      resolve(res['markdrive_show_readtime'] === true)
    )
  )
}

function getAutosaveEnabled(): Promise<boolean> {
  return new Promise(resolve =>
    chrome.storage.local.get('markdrive_autosave', res =>
      resolve(res['markdrive_autosave'] === true)
    )
  )
}

// ─── Save ─────────────────────────────────────────────────────────────────────

type SaveFileResponse = { ok: true } | { ok: false; error: string }

async function performSave(
  content: string,
  navbar: NavbarController,
  skipConflictCheck = false
): Promise<void> {
  // Conflict check: if file was modified remotely, warn before overwriting
  if (!skipConflictCheck && lastModifiedTime) {
    const check = await new Promise<CheckModifiedResponse>(resolve =>
      chrome.runtime.sendMessage({ type: 'CHECK_MODIFIED', payload: { fileId } }, resolve)
    )
    if (check.ok && check.modifiedTime !== lastModifiedTime) {
      const shouldProceed = await showConflictDialog()
      if (shouldProceed === 'cancel') return
      if (shouldProceed === 'discard') { location.reload(); return }
      // 'overwrite' falls through
    }
  }

  navbar.setSaveState('saving')
  const res = await new Promise<SaveFileResponse>(resolve =>
    chrome.runtime.sendMessage({ type: 'SAVE_FILE', payload: { fileId, content } }, resolve)
  )

  if (res.ok) {
    navbar.setSaveState('saved')
    navbar.setUnsaved(false)
    // Update our stored modifiedTime after a successful save
    chrome.runtime.sendMessage(
      { type: 'CHECK_MODIFIED', payload: { fileId } },
      (r: CheckModifiedResponse) => { if (r?.ok) lastModifiedTime = r.modifiedTime }
    )
  } else {
    navbar.setSaveState('error')
    console.error('[MarkDrive] Save failed:', res.error)
  }
}

// ─── Conflict dialog ──────────────────────────────────────────────────────────

function showConflictDialog(): Promise<'overwrite' | 'discard' | 'cancel'> {
  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'mdp-conflict-overlay'
    overlay.innerHTML = `
      <div class="mdp-conflict-panel">
        <p class="mdp-conflict-title">File changed in Drive</p>
        <p class="mdp-conflict-body">
          This file was modified in Google Drive since you opened it.
          Saving now will overwrite those changes.
        </p>
        <div class="mdp-conflict-actions">
          <button class="mdp-conflict-btn mdp-conflict-btn--cancel">Cancel</button>
          <button class="mdp-conflict-btn mdp-conflict-btn--discard">Discard my changes</button>
          <button class="mdp-conflict-btn mdp-conflict-btn--overwrite">Save anyway</button>
        </div>
      </div>
    `

    function close(result: 'overwrite' | 'discard' | 'cancel') {
      overlay.classList.remove('mdp-conflict-overlay--open')
      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true })
      resolve(result)
    }

    overlay.querySelector('.mdp-conflict-btn--cancel')!
      .addEventListener('click', () => close('cancel'))
    overlay.querySelector('.mdp-conflict-btn--discard')!
      .addEventListener('click', () => close('discard'))
    overlay.querySelector('.mdp-conflict-btn--overwrite')!
      .addEventListener('click', () => close('overwrite'))

    document.body.appendChild(overlay)
    void overlay.offsetHeight
    overlay.classList.add('mdp-conflict-overlay--open')
  })
}

// ─── Editor mode wiring ──────────────────────────────────────────────────────

let editorInstance: EditorController | null = null
let statusBarCtrl: StatusBarController | null = null

function mountEditMode(
  source: string,
  navbar: NavbarController,
  autosaveEnabled: boolean
): void {
  // Build split container
  const split = document.createElement('div')
  split.className = 'mdp-split'

  const editorPane = document.createElement('div')
  editorPane.className = 'mdp-editor-pane'

  const divider = document.createElement('div')
  divider.className = 'mdp-editor-divider'
  divider.setAttribute('aria-hidden', 'true')

  const previewPane = document.createElement('div')
  previewPane.className = 'mdp-preview-pane'

  // Preview viewer element
  const previewViewer = document.createElement('div')
  previewViewer.className = 'markdrive-viewer'
  previewViewer.dataset.mode = 'page'
  previewViewer.dataset.rawSource = source
  previewViewer.setAttribute('data-theme', activeTheme)
  previewViewer.innerHTML = renderMarkdown(source)
  decorateViewer(previewViewer)
  previewPane.appendChild(previewViewer)
  clampTallTables(previewViewer)
  void renderMermaidBlocks(previewViewer)

  split.appendChild(editorPane)
  split.appendChild(divider)
  split.appendChild(previewPane)
  root.appendChild(split)

  // Editor
  let hasUnsaved = false
  let autosaveTimer: ReturnType<typeof setTimeout>
  let mermaidDebounce: ReturnType<typeof setTimeout>
  let previewDebounce: ReturnType<typeof setTimeout>

  // Read theme from the HTML attribute — always current, set synchronously by applyTheme()
  const activeTheme = (document.documentElement.dataset['theme'] as 'light' | 'dark' | undefined) === 'dark' ? 'dark' : 'light'

  const editor = createEditor({
    initialSource: source,
    theme: activeTheme,
    onChange(newSource) {
      if (!hasUnsaved) {
        hasUnsaved = true
        navbar.setUnsaved(true)
        navbar.setSaveState('idle')
        showSaveHint()
      }
      const cmView = editor.getView()
      if (cmView) statusBarCtrl?.update(cmView, hasUnsaved)

      // Live preview update (debounced)
      clearTimeout(previewDebounce)
      previewDebounce = setTimeout(() => {
        previewViewer.style.opacity = '0.85'
        previewViewer.innerHTML = renderMarkdown(newSource)
        previewViewer.dataset.rawSource = newSource
        previewViewer.setAttribute('data-theme', activeTheme)
        decorateViewer(previewViewer)
        clampTallTables(previewViewer)
        requestAnimationFrame(() => { previewViewer.style.opacity = '' })

        // Mermaid only after 2s of inactivity
        clearTimeout(mermaidDebounce)
        mermaidDebounce = setTimeout(() => void renderMermaidBlocks(previewViewer), 2000)
      }, 250)

      // Autosave
      if (autosaveEnabled) {
        clearTimeout(autosaveTimer)
        autosaveTimer = setTimeout(async () => {
          await performSave(editor.getValue(), navbar, true)
          hasUnsaved = false
          navbar.setUnsaved(false)
        }, 30_000)
      }
    },
    onFirstEdit() {
      // hint is shown via showSaveHint() which is called in onChange
    },
  })

  editor.mount(editorPane)
  editorInstance = editor

  // Keep CodeMirror theme in sync with the navbar theme toggle
  _themeChangeListener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: string
  ) => {
    if (area === 'local' && changes['markdrive_theme']) {
      const stored = changes['markdrive_theme'].newValue as string | undefined
      const effective = stored === 'dark' ? 'dark'
        : stored === 'light' ? 'light'
        : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      editor.setTheme(effective)
    }
  }
  chrome.storage.onChanged.addListener(_themeChangeListener)

  // Status bar
  const { el: statusBarEl, controller: sbCtrl } = buildStatusBar()
  statusBarCtrl = sbCtrl
  document.body.appendChild(statusBarEl)

  // Formatting toolbar
  const toolbar = buildFormattingToolbar(() => editorInstance?.getView() ?? null)
  document.body.insertBefore(toolbar, document.body.querySelector('.mdp-search-bar') ?? null)

  // Reveal with animation
  document.body.classList.add('mdp-edit-mode')
  void split.offsetHeight
  split.classList.add('mdp-split--visible')
  void toolbar.offsetHeight
  toolbar.classList.add('mdp-fmt-toolbar--visible')
  void statusBarEl.offsetHeight
  statusBarEl.classList.add('mdp-status-bar--visible')

  // Restore divider ratio
  const savedRatio = sessionStorage.getItem(`mdp-split-${fileId}`)
  if (savedRatio) split.style.setProperty('--split-left', savedRatio)

  // Draggable divider
  let isResizing = false
  divider.addEventListener('mousedown', () => {
    isResizing = true
    divider.classList.add('mdp-editor-divider--dragging')
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
  })
  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return
    const rect = split.getBoundingClientRect()
    const pct = Math.min(70, Math.max(30, ((e.clientX - rect.left) / rect.width) * 100))
    split.style.setProperty('--split-left', `${pct}%`)
  })
  document.addEventListener('mouseup', () => {
    if (!isResizing) return
    isResizing = false
    divider.classList.remove('mdp-editor-divider--dragging')
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    const currentRatio = split.style.getPropertyValue('--split-left')
    if (currentRatio) sessionStorage.setItem(`mdp-split-${fileId}`, currentRatio)
  })

  // Unsaved changes warning
  window.addEventListener('beforeunload', (e) => {
    if (hasUnsaved) {
      e.preventDefault()
      e.returnValue = 'You have unsaved changes. Leave anyway?'
    }
  })

  editor.focus()
}

let _themeChangeListener: ((changes: { [key: string]: chrome.storage.StorageChange }, area: string) => void) | null = null

function unmountEditMode(): void {
  if (_themeChangeListener) {
    chrome.storage.onChanged.removeListener(_themeChangeListener)
    _themeChangeListener = null
  }
  editorInstance?.destroy()
  editorInstance = null
  statusBarCtrl?.destroy()
  statusBarCtrl = null

  document.body.classList.remove('mdp-edit-mode')
  document.querySelector('.mdp-split')?.remove()
  document.querySelector('.mdp-fmt-toolbar')?.remove()
  document.querySelector('.mdp-status-bar')?.remove()
}

// ─── Save hint toast ──────────────────────────────────────────────────────────

let saveHintShown = false

function showSaveHint(): void {
  if (saveHintShown) return
  saveHintShown = true

  const isMac = navigator.platform.toUpperCase().includes('MAC')
  const banner = document.createElement('div')
  banner.className = 'mdp-refresh-banner'
  banner.innerHTML = `<span>${isMac ? '⌘' : 'Ctrl'}+S to save</span>
    <button class="mdp-refresh-banner__dismiss" aria-label="Dismiss">✕</button>`
  banner.querySelector('.mdp-refresh-banner__dismiss')!
    .addEventListener('click', () => banner.remove())
  document.body.appendChild(banner)
  setTimeout(() => banner.remove(), 3000)
}

// ─── Main render ──────────────────────────────────────────────────────────────

async function renderContent(source: string): Promise<void> {
  root.innerHTML = ''

  const viewer = document.createElement('div')
  viewer.className = 'markdrive-viewer'
  viewer.dataset.mode = 'page'
  viewer.dataset.rawSource = source
  viewer.innerHTML = renderMarkdown(source)
  decorateViewer(viewer)
  root.appendChild(viewer)
  clampTallTables(viewer)

  const tocToggle = buildToc(viewer)
  const showReadTime = await getShowReadTime()
  const autosaveEnabled = await getAutosaveEnabled()
  const readTime = showReadTime ? calcReadTime(source) : undefined
  const { open: openSearch, close: closeSearch } = initSearch(viewer)

  const navbar = createNavbar({
    fileName,
    readTime,
    onBack() {
      if (!isNaN(driveTabId)) {
        chrome.runtime.sendMessage({ type: 'SWITCH_TO_TAB', payload: { tabId: driveTabId } })
      }
      window.close()
    },
    onModeChange(mode) {
      if (mode === 'edit') {
        // Hide read mode view
        viewer.style.display = 'none'
        mountEditMode(
          editorInstance ? editorInstance.getValue() : source,
          navbar,
          autosaveEnabled
        )
      } else {
        // Return to read mode — pick up any edits
        const editedSource = editorInstance?.getValue() ?? source
        unmountEditMode()
        viewer.style.display = ''
        // Re-render with latest content
        viewer.innerHTML = renderMarkdown(editedSource)
        viewer.dataset.rawSource = editedSource
        decorateViewer(viewer)
        clampTallTables(viewer)
        void renderMermaidBlocks(viewer)
      }
    },
    onSave() {
      if (editorInstance) {
        void performSave(editorInstance.getValue(), navbar)
      }
    },
    tocToggle,
  })

  initKeyboardShortcuts({
    onToggleRaw:  () => navbar.toggleView(),
    onToggleToc:  tocToggle,
    onOpenSearch: openSearch,
    onSave: () => {
      if (editorInstance) void performSave(editorInstance.getValue(), navbar)
    },
    onEscape: () => {
      closeShortcutsOverlay()
      closeSearch()
    },
  })

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
    { w: '55%', h: '28px', mb: '24px' },
    { w: '100%', h: '14px', mb: '10px' },
    { w: '100%', h: '14px', mb: '10px' },
    { w: '80%',  h: '14px', mb: '24px' },
    { w: '40%',  h: '20px', mb: '16px' },
    { w: '100%', h: '14px', mb: '10px' },
    { w: '100%', h: '14px', mb: '10px' },
    { w: '60%',  h: '14px', mb: '24px' },
    { w: '100%', h: '80px', mb: '24px' },
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

function crossfade(outEl: HTMLElement, inEl: HTMLElement): void {
  const DURATION = 120
  outEl.style.transition = `opacity ${DURATION}ms ease`
  outEl.style.opacity = '0'
  setTimeout(() => {
    outEl.style.display = 'none'
    outEl.style.transition = ''
    outEl.style.opacity = ''
    inEl.style.opacity = '0'
    inEl.style.display = inEl.tagName === 'PRE' ? 'block' : ''
    void inEl.offsetHeight
    inEl.style.transition = `opacity ${DURATION}ms ease`
    inEl.style.opacity = '1'
    setTimeout(() => {
      inEl.style.transition = ''
      inEl.style.opacity = ''
    }, DURATION)
  }, DURATION)
}

// crossfade is kept for possible future use (raw pre toggle)
void crossfade

// ─── Fetch & bootstrap ────────────────────────────────────────────────────────

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
