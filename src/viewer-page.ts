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
import { initViewActions } from './view-actions'
import { escapeHtml, getSystemTheme } from './utils'
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
let autoRefreshInterval: ReturnType<typeof setInterval> | null = null

type CheckModifiedResponse = { ok: true; modifiedTime: string } | { ok: false; error: string }

function startAutoRefresh(): void {
  if (!fileId) return
  chrome.runtime.sendMessage(
    { type: 'CHECK_MODIFIED', payload: { fileId } },
    (res: CheckModifiedResponse) => {
      if (chrome.runtime.lastError) return
      if (res?.ok) lastModifiedTime = res.modifiedTime
    }
  )
  autoRefreshInterval = setInterval(() => {
    chrome.runtime.sendMessage(
      { type: 'CHECK_MODIFIED', payload: { fileId } },
      (res: CheckModifiedResponse) => {
        if (chrome.runtime.lastError) return
        if (!res?.ok || !lastModifiedTime) return
        if (res.modifiedTime !== lastModifiedTime) {
          lastModifiedTime = res.modifiedTime
          showRefreshBanner()
        }
      }
    )
  }, POLL_INTERVAL)
}

// Clean up the polling interval when the page unloads so the timer
// doesn't keep firing after the tab is closed or navigated away.
window.addEventListener('pagehide', () => {
  if (autoRefreshInterval !== null) {
    clearInterval(autoRefreshInterval)
    autoRefreshInterval = null
  }
})

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
    const check = await new Promise<CheckModifiedResponse | null>(resolve =>
      chrome.runtime.sendMessage(
        { type: 'CHECK_MODIFIED', payload: { fileId } },
        (r: CheckModifiedResponse) => {
          if (chrome.runtime.lastError) { resolve(null); return }
          resolve(r)
        }
      )
    )
    // null means the background worker was unavailable — skip conflict check
    if (check?.ok && check.modifiedTime !== lastModifiedTime) {
      const shouldProceed = await showConflictDialog()
      if (shouldProceed === 'cancel') return
      if (shouldProceed === 'discard') { location.reload(); return }
      // 'overwrite' falls through
    }
  }

  navbar.setSaveState('saving')
  const res = await new Promise<SaveFileResponse | null>(resolve =>
    chrome.runtime.sendMessage(
      { type: 'SAVE_FILE', payload: { fileId, content } },
      (r: SaveFileResponse) => {
        if (chrome.runtime.lastError) { resolve(null); return }
        resolve(r)
      }
    )
  )

  if (!res) {
    navbar.setSaveState('error')
    console.error('[MarkDrive] Save failed: Extension context unavailable')
    return
  }

  if (res.ok) {
    savedSource = content  // anchor clean state to what was just saved
    editorDirty = false
    navbar.setSaveState('saved')
    navbar.setUnsaved(false)
    // Update our stored modifiedTime after a successful save
    chrome.runtime.sendMessage(
      { type: 'CHECK_MODIFIED', payload: { fileId } },
      (r: CheckModifiedResponse) => {
        if (!chrome.runtime.lastError && r?.ok) lastModifiedTime = r.modifiedTime
      }
    )
  } else {
    navbar.setSaveState('error')
    console.error('[MarkDrive] Save failed:', res.error)
  }
}

// ─── Shared dialog helper ─────────────────────────────────────────────────────

type DialogButton<T extends string> = { label: string; value: T; modifier: string }

function showDialog<T extends string>(
  title: string,
  body: string,
  buttons: DialogButton<T>[]
): Promise<T> {
  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'mdp-conflict-overlay'
    overlay.innerHTML = `
      <div class="mdp-conflict-panel">
        <p class="mdp-conflict-title">${title}</p>
        <p class="mdp-conflict-body">${body}</p>
        <div class="mdp-conflict-actions">
          ${buttons.map(b =>
            `<button class="mdp-conflict-btn mdp-conflict-btn--${b.modifier}">${b.label}</button>`
          ).join('')}
        </div>
      </div>
    `

    function close(result: T) {
      overlay.classList.remove('mdp-conflict-overlay--open')
      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true })
      resolve(result)
    }

    buttons.forEach(b => {
      overlay.querySelector(`.mdp-conflict-btn--${b.modifier}`)!
        .addEventListener('click', () => close(b.value))
    })

    document.body.appendChild(overlay)
    void overlay.offsetHeight
    overlay.classList.add('mdp-conflict-overlay--open')
  })
}

// ─── Conflict dialog ──────────────────────────────────────────────────────────

function showConflictDialog(): Promise<'overwrite' | 'discard' | 'cancel'> {
  return showDialog(
    'File changed in Drive',
    'This file was modified in Google Drive since you opened it. Saving now will overwrite those changes.',
    [
      { label: 'Cancel',            value: 'cancel',    modifier: 'cancel'    },
      { label: 'Discard my changes',value: 'discard',   modifier: 'discard'   },
      { label: 'Save anyway',       value: 'overwrite', modifier: 'overwrite' },
    ]
  )
}

// ─── Editor mode wiring ──────────────────────────────────────────────────────

let editorInstance: EditorController | null = null
let statusBarCtrl: StatusBarController | null = null
let savedSource: string | null = null   // last-saved content; null until edit mode first mounts
let editorDirty = false                  // true when editor content !== savedSource

function mountEditMode(
  source: string,
  navbar: NavbarController,
  autosaveEnabled: boolean
): void {
  // Read theme from the HTML attribute — always current, set synchronously by applyTheme()
  const activeTheme = (document.documentElement.dataset['theme'] as 'light' | 'dark' | undefined) === 'dark' ? 'dark' : 'light'

  // Anchor the "clean" state so undo back to this exact content clears the dirty flag
  savedSource = source
  editorDirty = false

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
  let autosaveTimer: ReturnType<typeof setTimeout>
  let mermaidDebounce: ReturnType<typeof setTimeout>
  let previewDebounce: ReturnType<typeof setTimeout>

  const editor = createEditor({
    initialSource: source,
    theme: activeTheme,
    onChange(newSource) {
      // Compare against saved state so undo back to clean removes the dirty flag
      const dirty = newSource !== savedSource
      if (dirty !== editorDirty) {
        editorDirty = dirty
        navbar.setUnsaved(dirty)
        if (dirty) {
          navbar.setSaveState('idle')
          showSaveHint()
        }
      }
      const cmView = editor.getView()
      if (cmView) statusBarCtrl?.update(cmView, editorDirty)

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
        autosaveTimer = setTimeout(() => void performSave(editor.getValue(), navbar, true), 30_000)
      }
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
        : getSystemTheme()
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

  // Unsaved changes warning (closing tab/browser)
  window.addEventListener('beforeunload', (e) => {
    if (editorDirty) {
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
  editorDirty = false

  document.body.classList.remove('mdp-edit-mode')
  document.querySelector('.mdp-split')?.remove()
  document.querySelector('.mdp-fmt-toolbar')?.remove()
  document.querySelector('.mdp-status-bar')?.remove()
}

// ─── Leave-without-saving dialog ─────────────────────────────────────────────

function showLeaveDialog(): Promise<'save' | 'discard' | 'cancel'> {
  return showDialog(
    'Unsaved changes',
    'You have unsaved changes. Save them before switching to Read mode?',
    [
      { label: 'Keep editing', value: 'cancel',  modifier: 'cancel'    },
      { label: 'Discard',      value: 'discard', modifier: 'discard'   },
      { label: 'Save',         value: 'save',    modifier: 'overwrite' },
    ]
  )
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

let viewActionSaveTimer: ReturnType<typeof setTimeout>
let cleanupViewActions: (() => void) | null = null

async function renderContent(source: string): Promise<void> {
  root.innerHTML = ''

  // Mutable ref — updated by View-mode quick actions (checkbox toggle etc.)
  // so that switching to Source mode picks up any in-place edits.
  let liveSource = source

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
  function handleSourceChange(newSource: string) {
    liveSource = newSource
    viewer.innerHTML = renderMarkdown(newSource)
    viewer.dataset.rawSource = newSource
    decorateViewer(viewer)
    clampTallTables(viewer)
    void renderMermaidBlocks(viewer)
    cleanupViewActions?.()
    cleanupViewActions = initViewActions(viewer, {
      getSource: () => liveSource,
      onChange:  handleViewActionChange,
    })
    navbar.setUnsaved(true)
    clearTimeout(viewActionSaveTimer)
    viewActionSaveTimer = setTimeout(async () => {
      await performSave(newSource, navbar, true)
    }, 1500)
  }

  const { open: openSearch, close: closeSearch, openReplace } = initSearch(viewer, {
    getSource:  () => liveSource,
    onReplace:  handleSourceChange,
  })

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
        viewer.style.display = 'none'
        mountEditMode(editorInstance ? editorInstance.getValue() : liveSource, navbar, autosaveEnabled)
        return
      }

      // ── Switching to Read ──────────────────────────────────────────────────
      function applyReadMode(displaySource: string) {
        unmountEditMode()
        liveSource = displaySource
        viewer.style.display = ''
        viewer.innerHTML = renderMarkdown(displaySource)
        viewer.dataset.rawSource = displaySource
        decorateViewer(viewer)
        clampTallTables(viewer)
        void renderMermaidBlocks(viewer)
        // Re-attach view actions to the refreshed viewer
        cleanupViewActions?.()
        cleanupViewActions = initViewActions(viewer, {
          getSource: () => liveSource,
          onChange:  handleViewActionChange,
        })
      }

      if (editorDirty) {
        void showLeaveDialog().then(async result => {
          if (result === 'cancel') {
            navbar.setActiveMode('edit')   // revert segmented control
            return
          }
          if (result === 'save') {
            const content = editorInstance!.getValue()
            await performSave(content, navbar)
            if (editorDirty) { navbar.setActiveMode('edit'); return } // save failed
            applyReadMode(content)
          } else {
            // discard — revert to last saved state
            applyReadMode(savedSource ?? source)
          }
        })
      } else {
        applyReadMode(editorInstance?.getValue() ?? source)
      }
    },
    onSave() {
      if (editorInstance) {
        void performSave(editorInstance.getValue(), navbar)
      }
    },
    tocToggle,
  })

  // ── View-mode quick-action save handler ───────────────────────────────────
  function handleViewActionChange(newSource: string) {
    liveSource = newSource
    savedSource = newSource   // optimistically mark as saved anchor (save is debounced)
    viewer.dataset.rawSource = newSource
    navbar.setUnsaved(true)

    clearTimeout(viewActionSaveTimer)
    viewActionSaveTimer = setTimeout(async () => {
      await performSave(newSource, navbar, true)  // skip conflict check for quick actions
    }, 1500)
  }

  cleanupViewActions = initViewActions(viewer, {
    getSource: () => liveSource,
    onChange:  handleViewActionChange,
  })

  initKeyboardShortcuts({
    onToggleRaw:   () => navbar.toggleView(),
    onToggleToc:   tocToggle,
    onOpenSearch:  openSearch,
    onOpenReplace: openReplace,
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
