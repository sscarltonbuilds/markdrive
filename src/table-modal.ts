/**
 * Table expand modal — renders a table clone at full viewport size.
 * Opened by the expand button injected into each .mdp-table-wrap.
 */

import './styles/table-modal.css'
import { initModalTableFeatures } from './table-features'

export function openTableModal(table: HTMLTableElement): void {
  // ── Overlay ──────────────────────────────────────────────────────────────────

  const overlay = document.createElement('div')
  overlay.className = 'mdp-modal-overlay'
  // Inherit current theme
  const theme = document.documentElement.dataset.theme
  if (theme) overlay.dataset.theme = theme

  // ── Inner container ───────────────────────────────────────────────────────────

  const container = document.createElement('div')
  container.className = 'mdp-modal-container'
  container.setAttribute('role', 'dialog')
  container.setAttribute('aria-modal', 'true')

  // ── Header bar ───────────────────────────────────────────────────────────────

  const header = document.createElement('div')
  header.className = 'mdp-modal-header'

  const title = document.createElement('span')
  title.className = 'mdp-modal-title'
  // Try to extract a title from the first header cell
  const firstTh = table.querySelector('th')
  const colCount = table.querySelectorAll('thead th').length
  title.textContent = colCount ? `Table · ${colCount} columns` : 'Table'

  const closeBtn = document.createElement('button')
  closeBtn.className = 'mdp-modal-close'
  closeBtn.setAttribute('aria-label', 'Close table view')
  closeBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`

  header.appendChild(title)
  header.appendChild(closeBtn)

  // ── Table area ───────────────────────────────────────────────────────────────

  const tableWrap = document.createElement('div')
  tableWrap.className = 'mdp-modal-table-wrap markdrive-viewer'
  // Propagate the effective theme onto the markdrive-viewer element so its
  // CSS variables resolve correctly (prevents dark media-query variables
  // overriding a light-mode modal when system pref is dark).
  const effectiveTheme = document.documentElement.dataset.theme
    ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  tableWrap.setAttribute('data-theme', effectiveTheme)
  tableWrap.appendChild(table.cloneNode(true))

  container.appendChild(header)
  container.appendChild(tableWrap)

  // Wire sort + pagination on the cloned table
  const clonedTable = tableWrap.querySelector<HTMLTableElement>('table')!
  initModalTableFeatures(clonedTable, container)
  overlay.appendChild(container)
  document.body.appendChild(overlay)

  // Lock background scroll — compensate scrollbar width to prevent layout shift
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
  document.body.style.overflow     = 'hidden'
  document.body.style.paddingRight = scrollbarWidth > 0 ? `${scrollbarWidth}px` : ''

  // Animate in
  requestAnimationFrame(() => overlay.classList.add('mdp-modal-overlay--open'))

  // ── Close logic ──────────────────────────────────────────────────────────────

  function close() {
    overlay.classList.remove('mdp-modal-overlay--open')
    overlay.addEventListener('transitionend', () => {
      overlay.remove()
      document.body.style.overflow     = ''
      document.body.style.paddingRight = ''
    }, { once: true })
    document.removeEventListener('keydown', onKey)
  }

  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
  document.addEventListener('keydown', onKey)
  closeBtn.addEventListener('click', close)
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })
}
