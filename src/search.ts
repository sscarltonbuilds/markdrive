/**
 * In-document search — highlights all matches and lets you navigate between
 * them. Opens with Ctrl/Cmd+F or /. Navigate with Enter/Shift+Enter or buttons.
 */

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ─── Mark / unmark ────────────────────────────────────────────────────────────

function findAndMarkText(viewer: HTMLElement, query: string): HTMLElement[] {
  const marks: HTMLElement[] = []
  if (!query) return marks

  const re = new RegExp(escapeRegex(query), 'gi')

  const walker = document.createTreeWalker(
    viewer,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const p = node.parentElement
        if (!p) return NodeFilter.FILTER_REJECT
        const tag = p.tagName.toLowerCase()
        if (['script', 'style', 'noscript'].includes(tag)) return NodeFilter.FILTER_REJECT
        if (p.classList.contains('mdp-search-mark')) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      },
    }
  )

  const textNodes: Text[] = []
  let node: Node | null
  while ((node = walker.nextNode())) textNodes.push(node as Text)

  for (const textNode of textNodes) {
    const text = textNode.nodeValue ?? ''
    const segments: Array<string | HTMLElement> = []
    let last = 0
    re.lastIndex = 0
    let m: RegExpExecArray | null

    while ((m = re.exec(text)) !== null) {
      if (m.index > last) segments.push(text.slice(last, m.index))
      const mark = document.createElement('mark')
      mark.className = 'mdp-search-mark'
      mark.textContent = m[0]
      segments.push(mark)
      marks.push(mark)
      last = m.index + m[0].length
    }

    if (!segments.length) continue
    if (last < text.length) segments.push(text.slice(last))

    const frag = document.createDocumentFragment()
    for (const seg of segments) {
      frag.appendChild(
        typeof seg === 'string' ? document.createTextNode(seg) : seg
      )
    }
    textNode.parentNode!.replaceChild(frag, textNode)
  }

  return marks
}

function clearMarks(viewer: HTMLElement): void {
  for (const mark of [...viewer.querySelectorAll('.mdp-search-mark')]) {
    const parent = mark.parentNode
    if (!parent) continue
    parent.replaceChild(document.createTextNode(mark.textContent ?? ''), mark)
    parent.normalize()
  }
}

// ─── Search bar ───────────────────────────────────────────────────────────────

export interface SearchController {
  open:  () => void
  close: () => void
}

export function initSearch(viewer: HTMLElement): SearchController {
  const bar = document.createElement('div')
  bar.className = 'mdp-search-bar'
  bar.setAttribute('role', 'search')
  bar.innerHTML = `
    <input class="mdp-search-input" type="search"
      placeholder="Find in document…" autocomplete="off" spellcheck="false" />
    <span class="mdp-search-count"></span>
    <button class="mdp-search-nav" data-dir="-1" aria-label="Previous match">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2 7.5L6 3.5L10 7.5"
          stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <button class="mdp-search-nav" data-dir="1" aria-label="Next match">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2 4.5L6 8.5L10 4.5"
          stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <button class="mdp-search-close" aria-label="Close search">✕</button>
  `
  document.body.appendChild(bar)

  const input   = bar.querySelector<HTMLInputElement>('.mdp-search-input')!
  const countEl = bar.querySelector<HTMLElement>('.mdp-search-count')!
  const navBtns = [...bar.querySelectorAll<HTMLButtonElement>('.mdp-search-nav')]
  const closeBtn = bar.querySelector<HTMLButtonElement>('.mdp-search-close')!

  let marks: HTMLElement[] = []
  let currentIdx = -1

  function updateCount() {
    countEl.textContent = marks.length
      ? `${currentIdx + 1} / ${marks.length}`
      : input.value ? 'No results' : ''
  }

  function goTo(idx: number) {
    marks[currentIdx]?.classList.remove('mdp-search-mark--current')
    currentIdx = ((idx % marks.length) + marks.length) % marks.length
    marks[currentIdx].classList.add('mdp-search-mark--current')
    marks[currentIdx].scrollIntoView({ behavior: 'smooth', block: 'center' })
    updateCount()
  }

  function runSearch() {
    clearMarks(viewer)
    marks = findAndMarkText(viewer, input.value.trim())
    currentIdx = -1
    if (marks.length) goTo(0)
    else updateCount()
  }

  let debounceTimer: ReturnType<typeof setTimeout>
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(runSearch, 120)
  })

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && marks.length) {
      e.preventDefault()
      goTo(e.shiftKey ? currentIdx - 1 : currentIdx + 1)
    }
  })

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (marks.length) goTo(currentIdx + parseInt(btn.dataset.dir ?? '1', 10))
    })
  })

  function open() {
    bar.classList.add('mdp-search-bar--open')
    input.focus()
    input.select()
  }

  function close() {
    bar.classList.remove('mdp-search-bar--open')
    clearMarks(viewer)
    marks = []
    currentIdx = -1
    countEl.textContent = ''
    input.value = ''
  }

  closeBtn.addEventListener('click', close)

  return { open, close }
}
