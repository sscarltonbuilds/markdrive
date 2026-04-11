/**
 * Table enhancements:
 *   1. clampTallTables  — inline height clamp + gradient fade + CTA (post-DOM-append)
 *   2. initTableSort    — clickable column headers with ↑↓ indicators
 *   3. initModalTableFeatures — composes sort + pagination for the expand modal
 */

import { openTableModal } from './table-modal'

// ─── Constants ────────────────────────────────────────────────────────────────

const CLAMP_HEIGHT = 380   // px — ~10 rows before clamping inline

// Sort indicator SVGs — single stroke chevrons only (no double/neutral)
const SORT_ICON_ASC = `
  <svg width="8" height="6" viewBox="0 0 8 6" fill="none" aria-hidden="true">
    <path d="M1 5L4 2L7 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`

const SORT_ICON_DESC = `
  <svg width="8" height="6" viewBox="0 0 8 6" fill="none" aria-hidden="true">
    <path d="M1 1L4 4L7 1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`

// ─── Sort state ───────────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc'
interface SortState { colIndex: number; dir: SortDir }
const sortStates    = new WeakMap<HTMLTableElement, SortState>()
const originalOrders = new WeakMap<HTMLTableElement, HTMLTableRowElement[]>()

// ─── Feature 1: Inline height clamp ──────────────────────────────────────────

/**
 * Call AFTER the viewer has been appended to the DOM.
 * For each table whose content height exceeds CLAMP_HEIGHT, adds a max-height
 * clamp, a gradient fade overlay, and a "View full table" pill CTA.
 */
export function clampTallTables(viewer: HTMLElement): void {
  for (const wrap of [...viewer.querySelectorAll<HTMLElement>('.mdp-table-wrap')]) {
    // Guard against double-call
    if (wrap.classList.contains('mdp-table-wrap--clamped')) continue

    const scroll = wrap.querySelector<HTMLElement>('.mdp-table-scroll')
    if (!scroll || scroll.scrollHeight <= CLAMP_HEIGHT) continue

    wrap.classList.add('mdp-table-wrap--clamped')

    // CTA pill — click opens modal (same as the ⤢ button)
    const cta = document.createElement('button')
    cta.className = 'mdp-table-cta'
    cta.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
        <path d="M1.5 5.5V1.5H9.5V9.5H5.5M1.5 9.5L5 6" stroke="currentColor"
          stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      View full table`
    cta.addEventListener('click', () => {
      const table = scroll.querySelector<HTMLTableElement>('table')
      if (table) openTableModal(table)
    })
    wrap.appendChild(cta)
  }
}

// ─── Feature 2: Column sorting ────────────────────────────────────────────────

/**
 * Attaches sort click handlers to all th elements.
 * onSortComplete is called after each sort (used by pagination to reset to page 1).
 */
export function initTableSort(
  table: HTMLTableElement,
  onSortComplete?: () => void,
): void {
  if (table.tHead?.rows.length !== 1) return  // only simple single-row headers

  const headerRow = table.tHead.rows[0]
  const headers   = [...headerRow.cells]
  if (headers.length === 0) return

  // Snapshot original row order so we can restore on "off"
  const tbody = table.tBodies[0]
  if (tbody && !originalOrders.has(table)) {
    originalOrders.set(table, [...tbody.rows])
  }

  headers.forEach((th, colIdx) => {
    th.classList.add('mdp-sortable')
    th.setAttribute('aria-sort', 'none')

    // Wrap existing text so indicator sits cleanly beside it
    if (!th.querySelector('.mdp-sort-label')) {
      const label = document.createElement('span')
      label.className = 'mdp-sort-label'
      label.innerHTML = th.innerHTML
      th.innerHTML = ''
      th.appendChild(label)
    }

    // Reuse existing indicator if present (e.g. cloned from an already-decorated
    // inline table) — avoids double indicators in the modal
    let indicator = th.querySelector<HTMLElement>('.mdp-sort-indicator')
    if (!indicator) {
      indicator = document.createElement('span')
      indicator.className = 'mdp-sort-indicator'
      indicator.setAttribute('aria-hidden', 'true')
      indicator.innerHTML = SORT_ICON_ASC
      th.appendChild(indicator)
    }

    th.addEventListener('click', () => {
      const prev = sortStates.get(table)

      // Three-state cycle: asc → desc → off
      let nextDir: SortDir | null
      if (!prev || prev.colIndex !== colIdx) {
        nextDir = 'asc'
      } else if (prev.dir === 'asc') {
        nextDir = 'desc'
      } else {
        nextDir = null  // off — restore original order
      }

      if (nextDir === null) {
        sortStates.delete(table)
        restoreOriginalOrder(table)
      } else {
        sortStates.set(table, { colIndex: colIdx, dir: nextDir })
        sortTableByColumn(table, colIdx, nextDir)
      }

      // Update all header indicators + aria-sort
      headers.forEach((h, i) => {
        const ind = h.querySelector<HTMLElement>('.mdp-sort-indicator')
        if (i === colIdx && nextDir !== null) {
          h.setAttribute('aria-sort', nextDir === 'asc' ? 'ascending' : 'descending')
          if (ind) ind.innerHTML = nextDir === 'asc' ? SORT_ICON_ASC : SORT_ICON_DESC
        } else {
          h.setAttribute('aria-sort', 'none')
          if (ind) ind.innerHTML = SORT_ICON_ASC  // single faint up-chevron on hover
        }
      })

      onSortComplete?.()
    })
  })
}

function restoreOriginalOrder(table: HTMLTableElement): void {
  const tbody    = table.tBodies[0]
  const original = originalOrders.get(table)
  if (!tbody || !original) return
  original.forEach(row => tbody.appendChild(row))
}

function isNumericColumn(table: HTMLTableElement, colIdx: number): boolean {
  const rows   = [...table.tBodies[0]?.rows ?? []]
  const texts  = rows.map(r => r.cells[colIdx]?.textContent?.trim() ?? '').filter(Boolean)
  if (texts.length < 2) return false
  const numericCount = texts.filter(t => isFinite(parseFloat(t))).length
  return numericCount / texts.length >= 0.8
}

function sortTableByColumn(
  table: HTMLTableElement,
  colIdx: number,
  dir: 'asc' | 'desc',
): void {
  const tbody = table.tBodies[0]
  if (!tbody) return

  const rows      = [...tbody.rows]
  const isNumeric = isNumericColumn(table, colIdx)

  rows.sort((a, b) => {
    const aText = a.cells[colIdx]?.textContent?.trim() ?? ''
    const bText = b.cells[colIdx]?.textContent?.trim() ?? ''
    const cmp   = isNumeric
      ? parseFloat(aText) - parseFloat(bText)
      : aText.localeCompare(bText, undefined, { sensitivity: 'base', numeric: true })
    return dir === 'asc' ? cmp : -cmp
  })

  rows.forEach(r => tbody.appendChild(r))
}

// ─── Feature 3: Modal table features ─────────────────────────────────────────

/**
 * Wires sort onto the modal's cloned table.
 * Full vertical scroll + sticky header handles long tables — no pagination needed.
 */
export function initModalTableFeatures(
  table: HTMLTableElement,
  _container: HTMLElement,
): void {
  initTableSort(table)
}
