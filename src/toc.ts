/**
 * Table of Contents — fixed sidebar generated from heading anchors.
 *
 * Returns a toggle function (or null if the document has fewer than 3 headings).
 * The toggle is wired up by toolbar.ts via viewer-page.ts.
 */

import './styles/toc.css'

const TOC_STORAGE_KEY = 'markdrive_toc_open'
const TOC_MIN_HEADINGS = 3
const TOC_LEVELS = ['H1', 'H2', 'H3', 'H4']

export function buildToc(viewer: HTMLElement): (() => void) | null {
  const headings = [...viewer.querySelectorAll<HTMLElement>(TOC_LEVELS.join(','))]
    .filter(h => h.id)

  if (headings.length < TOC_MIN_HEADINGS) return null

  // ── Build sidebar ──────────────────────────────────────────────────────────

  const nav = document.createElement('nav')
  nav.className = 'mdp-toc'
  nav.setAttribute('aria-label', 'Table of contents')

  const list = document.createElement('ol')
  list.className = 'mdp-toc__list'

  for (const h of headings) {
    const level = parseInt(h.tagName[1], 10) // 1–4
    const link = document.createElement('a')
    link.className = 'mdp-toc__link'
    link.href = `#${h.id}`
    link.textContent = h.textContent?.replace(/\s*#\s*$/, '').trim() ?? ''
    link.dataset.id = h.id

    link.addEventListener('click', (e) => {
      e.preventDefault()
      h.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActive(h.id)
    })

    const item = document.createElement('li')
    item.className = `mdp-toc__item mdp-toc__item--h${level}`
    item.appendChild(link)
    list.appendChild(item)
  }

  nav.appendChild(list)
  document.body.appendChild(nav)

  // ── Active heading via IntersectionObserver ────────────────────────────────

  function setActive(id: string) {
    nav.querySelectorAll<HTMLElement>('.mdp-toc__link').forEach(a => {
      a.classList.toggle('mdp-toc__link--active', a.dataset.id === id)
    })
  }

  const io = new IntersectionObserver(
    (entries) => {
      // Pick the topmost intersecting heading
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible.length) setActive(visible[0].target.id)
    },
    { rootMargin: '-8% 0px -80% 0px', threshold: 0 }
  )
  headings.forEach(h => io.observe(h))

  // Highlight first heading immediately
  if (headings[0]?.id) setActive(headings[0].id)

  // ── Toggle ─────────────────────────────────────────────────────────────────

  let isOpen = false

  function applyOpen(open: boolean) {
    isOpen = open
    document.body.classList.toggle('mdp-toc-open', open)
    nav.classList.toggle('mdp-toc--open', open)
  }

  // Restore persisted state
  chrome.storage.local.get(TOC_STORAGE_KEY, (result) => {
    applyOpen(result[TOC_STORAGE_KEY] === true)
  })

  function toggle() {
    const next = !isOpen
    chrome.storage.local.set({ [TOC_STORAGE_KEY]: next })
    applyOpen(next)
  }

  return toggle
}
