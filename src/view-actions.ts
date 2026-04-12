/**
 * View-mode quick actions.
 *
 * These let users make common edits without entering Source mode:
 *  - Checkbox toggle   — click [ ] / [x] to flip state
 *  - Smart list badge  — hover any plain <ul> to see "⇌ Task list" badge; click to convert
 *  - Inline edit       — double-click a <p>, heading, or list item to edit in place
 *
 * initViewActions() wires up all interactions on a rendered viewer element.
 * It returns a cleanup function for when the viewer is torn down.
 */

// ─── Source location helpers ──────────────────────────────────────────────────

/**
 * Finds the source lines that correspond to a rendered element.
 * Returns the raw source block and its character start position, or null.
 */
function locateInSource(
  source: string,
  element: HTMLElement
): { block: string; start: number } | null {
  const rawText = element.textContent?.trim() ?? ''
  if (!rawText) return null

  // Use first 25 chars as anchor — long enough to be specific, short enough to survive minor edits
  const anchor = rawText.slice(0, 25)
  const tag     = element.tagName.toLowerCase()
  const lines   = source.split('\n')

  // ── Heading ────────────────────────────────────────────────────────────────
  if (/^h[1-6]$/.test(tag)) {
    const level  = parseInt(tag[1])
    const hashes = '#'.repeat(level)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line.startsWith(hashes + ' ')) continue
      const headingText = line.slice(hashes.length + 1).trim()
      // Match if the anchor matches the beginning of the heading text
      if (headingText.startsWith(anchor.slice(0, Math.min(anchor.length, headingText.length)))) {
        const charStart = lines.slice(0, i).join('\n').length + (i > 0 ? 1 : 0)
        return { block: line, start: charStart }
      }
    }
    return null
  }

  // ── List item ──────────────────────────────────────────────────────────────
  if (tag === 'li') {
    const shortAnchor = anchor.slice(0, 15)
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trimStart()
      // Match unordered or ordered list markers (with optional task checkbox)
      if (!/^[-*+] |^\d+[.)]\s/.test(trimmed)) continue
      if (!lines[i].includes(shortAnchor)) continue
      const charStart = lines.slice(0, i).join('\n').length + (i > 0 ? 1 : 0)
      return { block: lines[i], start: charStart }
    }
    return null
  }

  // ── Paragraph ──────────────────────────────────────────────────────────────
  // Find the paragraph block (consecutive non-blank lines) containing the anchor
  const shortAnchor = anchor.slice(0, 15)
  let blockStart = -1

  for (let i = 0; i <= lines.length; i++) {
    const line = i < lines.length ? lines[i] : ''
    if (line.trim() === '') {
      if (blockStart >= 0) {
        const block     = lines.slice(blockStart, i).join('\n')
        const charStart = lines.slice(0, blockStart).join('\n').length + (blockStart > 0 ? 1 : 0)
        if (block.includes(shortAnchor)) {
          return { block, start: charStart }
        }
        blockStart = -1
      }
    } else if (blockStart < 0) {
      // Skip block types that aren't paragraphs
      const trimmed = line.trimStart()
      if (/^#{1,6} |^[-*+] |^\d+[.)]\s|^>|^```|^\|/.test(trimmed)) {
        // Skip to end of this block
        while (i + 1 < lines.length && lines[i + 1].trim() !== '') i++
        continue
      }
      blockStart = i
    }
  }

  return null
}

/**
 * Replace a source block in place.
 * Uses the block's start position and length for precise replacement.
 */
function applySourceEdit(
  source: string,
  loc: { block: string; start: number },
  newBlock: string
): string {
  return (
    source.slice(0, loc.start) +
    newBlock.trim() +
    source.slice(loc.start + loc.block.length)
  )
}

// ─── Checkbox toggle ──────────────────────────────────────────────────────────

function applyCheckboxToggle(source: string, index: number): string {
  const pattern = /^(\s*[-*+] \[)([ xX])(\] )/gm
  let count = 0
  return source.replace(pattern, (match, before, checked, after) => {
    if (count++ === index) {
      return `${before}${checked.trim() === '' ? 'x' : ' '}${after}`
    }
    return match
  })
}

function bounceCheckbox(el: HTMLInputElement) {
  el.classList.remove('mdp-checkbox-bounce')
  void el.offsetWidth                            // force reflow to restart animation
  el.classList.add('mdp-checkbox-bounce')
  el.addEventListener('animationend', () => el.classList.remove('mdp-checkbox-bounce'), { once: true })
}

function attachCheckboxToggle(
  viewer: HTMLElement,
  getSource: () => string,
  onChange: (newSource: string) => void
): () => void {
  const boxes = Array.from(viewer.querySelectorAll<HTMLInputElement>(
    'input.task-list-item-checkbox'
  ))

  if (boxes.length === 0) return () => { /* nothing */ }

  const handlers: Array<() => void> = []

  boxes.forEach((box, i) => {
    box.removeAttribute('disabled')
    box.style.cursor = 'pointer'

    const handler = (e: Event) => {
      e.preventDefault()
      const source    = getSource()
      const newSource = applyCheckboxToggle(source, i)
      if (newSource === source) return

      box.checked = !box.checked
      bounceCheckbox(box)

      const li = box.closest('li')
      if (li) li.classList.toggle('mdp-task-checked', box.checked)

      onChange(newSource)
    }

    box.addEventListener('click', handler)
    handlers.push(() => box.removeEventListener('click', handler))

    if (box.checked) box.closest('li')?.classList.add('mdp-task-checked')
  })

  return () => handlers.forEach(fn => fn())
}

// ─── Smart list → task list ───────────────────────────────────────────────────

/**
 * Get direct child li text contents (excluding nested lists).
 */
function getListItemTexts(ul: HTMLElement): string[] {
  return Array.from(ul.children)
    .filter(el => el.tagName === 'LI')
    .map(li => {
      const clone = li.cloneNode(true) as HTMLElement
      clone.querySelectorAll('ul, ol').forEach(n => n.remove())
      return clone.textContent?.trim() ?? ''
    })
    .filter(Boolean)
}

/**
 * Prepend `[ ] ` to each matching plain list line in source.
 * Matches by anchoring on the first 20 chars of each item's text.
 */
function applyListToTaskConversion(source: string, itemTexts: string[]): string {
  let result = source
  for (const text of itemTexts) {
    if (!text) continue
    const anchor = text.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Match `- text` or `* text` or `+ text` that is NOT already a task item
    const pattern = new RegExp(
      `^([ \\t]*[-*+][ \\t]+)(?!\\[[ xX]\\] )(${anchor})`,
      'm'
    )
    result = result.replace(pattern, `$1[ ] $2`)
  }
  return result
}

function attachSmartListConversion(
  viewer: HTMLElement,
  getSource: () => string,
  onChange: (newSource: string) => void
): () => void {
  // Find all <ul> that do NOT already contain task checkboxes
  const lists = Array.from(viewer.querySelectorAll<HTMLElement>('ul')).filter(
    ul => ul.querySelector('input.task-list-item-checkbox') === null
  )

  if (lists.length === 0) return () => { /* nothing */ }

  const cleanups: Array<() => void> = []

  lists.forEach(ul => {
    // Badge element
    const badge = document.createElement('span')
    badge.className = 'mdp-tasklist-badge'
    badge.textContent = '⇌ Task list'
    badge.title = 'Convert to task list'
    ul.appendChild(badge)

    let badgeVisible = false

    const showBadge = () => {
      if (badgeVisible) return
      badgeVisible = true
      badge.classList.add('mdp-tasklist-badge--visible')
    }
    const hideBadge = () => {
      badgeVisible = false
      badge.classList.remove('mdp-tasklist-badge--visible')
    }

    // Show badge on hover
    ul.addEventListener('mouseenter', showBadge)
    ul.addEventListener('mouseleave', hideBadge)

    // Convert on badge click
    const clickHandler = (e: Event) => {
      e.stopPropagation()
      const itemTexts = getListItemTexts(ul)
      if (itemTexts.length === 0) return
      const source    = getSource()
      const newSource = applyListToTaskConversion(source, itemTexts)
      if (newSource === source) return
      onChange(newSource)
    }
    badge.addEventListener('click', clickHandler)

    cleanups.push(() => {
      ul.removeEventListener('mouseenter', showBadge)
      ul.removeEventListener('mouseleave', hideBadge)
      badge.removeEventListener('click', clickHandler)
      badge.remove()
    })
  })

  return () => cleanups.forEach(fn => fn())
}

// ─── Double-click inline edit ─────────────────────────────────────────────────

const INLINE_EDIT_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'])

/**
 * Auto-resize a textarea to fit its content.
 */
function autoResize(ta: HTMLTextAreaElement) {
  ta.style.height = 'auto'
  ta.style.height = `${ta.scrollHeight}px`
}

function attachInlineEdit(
  viewer: HTMLElement,
  getSource: () => string,
  onChange: (newSource: string) => void
): () => void {
  const cleanups: Array<() => void> = []

  // Collect candidate elements
  const candidates = Array.from(
    viewer.querySelectorAll<HTMLElement>(
      'p, h1, h2, h3, h4, h5, h6, li'
    )
  ).filter(el => {
    // Skip task list items (they use checkbox toggle instead)
    if (el.tagName === 'LI' && el.classList.contains('task-list-item')) return false
    // Skip empty elements
    if (!el.textContent?.trim()) return false
    return true
  })

  candidates.forEach(el => {
    el.classList.add('mdp-inline-editable')

    const dblClickHandler = (e: MouseEvent) => {
      // Don't intercept clicks on links, checkboxes, etc.
      const target = e.target as HTMLElement
      if (target.tagName === 'A' || target.tagName === 'INPUT' || target.tagName === 'CODE') return

      e.preventDefault()
      e.stopPropagation()

      openInlineEditor(el, getSource, onChange)
    }

    el.addEventListener('dblclick', dblClickHandler)
    cleanups.push(() => {
      el.removeEventListener('dblclick', dblClickHandler)
      el.classList.remove('mdp-inline-editable')
    })
  })

  return () => cleanups.forEach(fn => fn())
}

/**
 * Replace an element's content with an inline textarea for editing.
 */
function openInlineEditor(
  el: HTMLElement,
  getSource: () => string,
  onChange: (newSource: string) => void
): void {
  // Bail if already editing
  if (el.querySelector('.mdp-inline-ta')) return

  const source = getSource()
  const loc    = locateInSource(source, el)
  if (!loc) {
    // Could not locate in source — flash a quick visual hint
    el.classList.add('mdp-inline-not-found')
    setTimeout(() => el.classList.remove('mdp-inline-not-found'), 600)
    return
  }

  const originalHTML = el.innerHTML

  // Create textarea
  const ta = document.createElement('textarea')
  ta.className = 'mdp-inline-ta'
  ta.value = loc.block
  ta.spellcheck = false

  // Replace element content
  el.innerHTML = ''
  el.classList.add('mdp-inline-editing')
  el.appendChild(ta)

  // Size it
  requestAnimationFrame(() => {
    autoResize(ta)
    ta.focus()
    ta.select()
  })

  ta.addEventListener('input', () => autoResize(ta))

  let committed = false

  function cancel() {
    if (committed) return
    committed = true
    el.innerHTML = originalHTML
    el.classList.remove('mdp-inline-editing')
  }

  function commit() {
    if (committed) return
    committed = true
    const newBlock  = ta.value
    const newSource = applySourceEdit(source, loc, newBlock)
    el.classList.remove('mdp-inline-editing')
    if (newSource !== source) {
      onChange(newSource)
      // onChange triggers a full re-render, so el will be replaced — no need to restore HTML
    } else {
      el.innerHTML = originalHTML
    }
  }

  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      cancel()
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      commit()
    }
  })

  // Blur commits (clicking away)
  ta.addEventListener('blur', () => {
    // Small delay so Escape keydown fires before blur
    setTimeout(() => { if (!committed) commit() }, 80)
  })
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ViewActionsOptions {
  getSource: () => string
  onChange:  (newSource: string) => void
}

/**
 * Wire up all View-mode quick actions on `viewer`.
 * Returns a cleanup function — call it before replacing/removing the viewer.
 */
export function initViewActions(
  viewer: HTMLElement,
  opts: ViewActionsOptions
): () => void {
  const cleanups: Array<() => void> = []

  cleanups.push(attachCheckboxToggle(viewer, opts.getSource, opts.onChange))
  cleanups.push(attachSmartListConversion(viewer, opts.getSource, opts.onChange))
  cleanups.push(attachInlineEdit(viewer, opts.getSource, opts.onChange))

  return () => cleanups.forEach(fn => fn())
}
