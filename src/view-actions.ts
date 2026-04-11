/**
 * View-mode quick actions.
 *
 * These let users make common edits without entering Source mode:
 *  - Checkbox toggle (click [ ] / [x] to flip)
 *
 * initViewActions() wires up all interactions on a rendered viewer element.
 * It returns a cleanup function for when the viewer is torn down.
 */

// ─── Checkbox toggle ──────────────────────────────────────────────────────────

/**
 * Toggle the Nth task-list item in `source` (0-indexed match order).
 * Returns the updated source string.
 */
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

  if (boxes.length === 0) return () => { /* nothing to clean up */ }

  const handlers: Array<() => void> = []

  boxes.forEach((box, i) => {
    // Remove disabled so the checkbox is interactive
    box.removeAttribute('disabled')
    box.style.cursor = 'pointer'

    const handler = (e: Event) => {
      e.preventDefault()          // we manage state ourselves
      const source    = getSource()
      const newSource = applyCheckboxToggle(source, i)
      if (newSource === source) return

      // Flip the visual state
      const nowChecked = newSource !== source && !box.checked
      box.checked = !box.checked

      // Animate the checkbox
      bounceCheckbox(box)

      // Style the list item text
      const li = box.closest('li')
      if (li) {
        li.classList.toggle('mdp-task-checked', box.checked)
      }

      onChange(newSource)
    }

    box.addEventListener('click', handler)
    handlers.push(() => box.removeEventListener('click', handler))

    // Reflect initial checked state on the li
    if (box.checked) box.closest('li')?.classList.add('mdp-task-checked')
  })

  return () => handlers.forEach(fn => fn())
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

  return () => cleanups.forEach(fn => fn())
}
