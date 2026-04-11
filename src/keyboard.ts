/**
 * Keyboard shortcuts for the standalone viewer page.
 *
 *   r           — toggle raw / rendered
 *   t           — toggle TOC
 *   Ctrl/Cmd+F  — open search
 *   /           — open search
 *   ?           — show / hide shortcuts cheat sheet
 *   Escape      — close search / overlay
 */

export interface ShortcutHandlers {
  onToggleRaw:  () => void
  onToggleToc:  (() => void) | null
  onOpenSearch: () => void
  onSave:       (() => void) | null
  onEscape:     () => void
}

export function initKeyboardShortcuts(handlers: ShortcutHandlers): void {
  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) return

    // Ctrl/Cmd+S → save
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handlers.onSave?.()
      return
    }

    // Ctrl/Cmd+F or / → search
    if ((e.key === 'f' && (e.ctrlKey || e.metaKey)) || e.key === '/') {
      e.preventDefault()
      handlers.onOpenSearch()
      return
    }

    // Escape → close overlays
    if (e.key === 'Escape') {
      handlers.onEscape()
      return
    }

    // Single-key shortcuts — no modifiers
    if (e.ctrlKey || e.metaKey || e.altKey) return

    switch (e.key) {
      case 'r': handlers.onToggleRaw(); break
      case 't': handlers.onToggleToc?.(); break
      case '?': toggleShortcutsOverlay(); break
    }
  })
}

// ─── Shortcuts overlay ────────────────────────────────────────────────────────

const SHORTCUTS = [
  { key: 'r',        desc: 'Toggle Read / Edit mode' },
  { key: 't',        desc: 'Toggle table of contents' },
  { key: 'Ctrl + S', desc: 'Save file' },
  { key: 'Ctrl + F', desc: 'Search in document' },
  { key: '/',        desc: 'Search in document' },
  { key: '?',        desc: 'Show / hide shortcuts' },
  { key: 'Esc',      desc: 'Close search / overlays' },
]

let overlayEl: HTMLElement | null = null

export function closeShortcutsOverlay(): void {
  if (!overlayEl) return
  overlayEl.classList.remove('mdp-shortcuts-overlay--open')
  const el = overlayEl
  overlayEl = null
  el.addEventListener('transitionend', () => el.remove(), { once: true })
}

function toggleShortcutsOverlay(): void {
  if (overlayEl) { closeShortcutsOverlay(); return }

  overlayEl = document.createElement('div')
  overlayEl.className = 'mdp-shortcuts-overlay'
  overlayEl.innerHTML = `
    <div class="mdp-shortcuts-panel">
      <div class="mdp-shortcuts-header">
        <span>Keyboard shortcuts</span>
        <button class="mdp-shortcuts-close" aria-label="Close">✕</button>
      </div>
      <dl class="mdp-shortcuts-list">
        ${SHORTCUTS.map(s => `
          <div class="mdp-shortcuts-row">
            <dt><kbd>${s.key}</kbd></dt>
            <dd>${s.desc}</dd>
          </div>
        `).join('')}
      </dl>
    </div>
  `

  overlayEl.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    if (t === overlayEl || t.classList.contains('mdp-shortcuts-close')) {
      closeShortcutsOverlay()
    }
  })

  document.body.appendChild(overlayEl)
  void overlayEl.offsetHeight  // force reflow so transition fires
  overlayEl.classList.add('mdp-shortcuts-overlay--open')
}
