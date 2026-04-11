import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import footnote from 'markdown-it-footnote'
import DOMPurify from 'dompurify'
import { highlight, displayLabel } from './highlighter'
import { escapeHtml } from './utils'
import { renderMermaidBlocks } from './mermaid-renderer'
import { openTableModal } from './table-modal'
import { initTableSort, clampTallTables } from './table-features'
import './styles/viewer.css'
import './styles/code.css'
import './styles/frontmatter.css'
import './styles/footnotes.css'
import './styles/link-preview.css'

// ─── Parser setup ─────────────────────────────────────────────────────────────

const md = new MarkdownIt({
  html: false,       // never allow raw HTML passthrough from the .md source
  linkify: true,     // auto-link bare URLs
  typographer: true, // smart quotes, em-dashes, etc.
  highlight(code, lang) {
    // Mermaid diagrams get a placeholder div — rendered async after parse
    if (lang === 'mermaid') {
      return `<div class="markdrive-mermaid">${escapeHtml(code)}</div>`
    }
    const highlighted = highlight(code, lang)
    const label = lang ? displayLabel(lang) : ''
    return `<pre class="markdrive-code-block" data-lang="${label}"><code class="language-${lang}">${highlighted}</code></pre>`
  },
}).use(taskLists).use(footnote)

// ─── Frontmatter ─────────────────────────────────────────────────────────────

type FrontmatterValue = string | string[] | boolean

interface FrontmatterData {
  [key: string]: FrontmatterValue
}

/**
 * Strip YAML frontmatter (--- blocks) from source and parse key/value pairs.
 * Handles strings, inline arrays ([a, b, c]), and booleans.
 */
function parseFrontmatter(source: string): { data: FrontmatterData; body: string } {
  const m = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { data: {}, body: source }

  const body = source.slice(m[0].length)
  const data: FrontmatterData = {}

  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.+)$/)
    if (!kv) continue
    const [, key, raw] = kv
    const val = raw.trim()
    if (val.startsWith('[') && val.endsWith(']')) {
      data[key] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''))
    } else if (val === 'true') {
      data[key] = true
    } else if (val === 'false') {
      data[key] = false
    } else {
      data[key] = val.replace(/^["']|["']$/g, '')
    }
  }

  return { data, body }
}

function buildFrontmatterCard(data: FrontmatterData): HTMLElement | null {
  const entries = Object.entries(data)
  if (entries.length === 0) return null

  const card = document.createElement('div')
  card.className = 'mdp-frontmatter'

  for (const [key, val] of entries) {
    const row = document.createElement('div')
    row.className = 'mdp-frontmatter__row'

    const label = document.createElement('span')
    label.className = 'mdp-frontmatter__key'
    label.textContent = key

    const value = document.createElement('span')
    value.className = 'mdp-frontmatter__val'

    if (Array.isArray(val)) {
      val.forEach(tag => {
        const pill = document.createElement('span')
        pill.className = 'mdp-frontmatter__tag'
        pill.textContent = tag
        value.appendChild(pill)
      })
    } else {
      value.textContent = String(val)
    }

    row.appendChild(label)
    row.appendChild(value)
    card.appendChild(row)
  }

  return card
}

function processFrontmatter(viewer: HTMLElement): void {
  const raw = viewer.dataset.rawSource
  if (!raw) return
  const { data } = parseFrontmatter(raw)
  const card = buildFrontmatterCard(data)
  if (card) viewer.prepend(card)
}

// ─── Link previews ────────────────────────────────────────────────────────────

/**
 * Adds URL preview tooltips to all non-anchor links via a CSS ::after tooltip.
 * External links also get target="_blank" + rel="noopener noreferrer".
 */
function processLinks(viewer: HTMLElement): void {
  for (const a of viewer.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = a.getAttribute('href') ?? ''
    if (!href || href.startsWith('#')) continue

    let display = href
    try {
      const url = new URL(href)
      display = url.hostname + url.pathname.replace(/\/$/, '')
      if (url.search) display += url.search
    } catch {
      // relative URL — show as-is
    }

    a.classList.add('mdp-link')
    a.dataset.preview = display

    if (href.startsWith('http')) {
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
    }
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────

/**
 * Parse Markdown source and return sanitized HTML.
 * Strips YAML frontmatter before rendering — the card is injected by decorateViewer.
 * DOMPurify runs even though html:false is set — belt and suspenders.
 */
export function renderMarkdown(source: string): string {
  const { body } = parseFrontmatter(source)
  const rawHtml = md.render(body)
  return DOMPurify.sanitize(rawHtml, {
    ADD_ATTR: ['data-lang', 'data-preview'],
    FORCE_BODY: false,
  })
}

// ─── Copy buttons ─────────────────────────────────────────────────────────────

/**
 * Add a copy-to-clipboard button and language badge to every code block
 * inside `viewer`. Called after innerHTML is set so the DOM exists.
 */
function addCopyButtons(viewer: HTMLElement): void {
  const blocks = viewer.querySelectorAll<HTMLElement>('pre.markdrive-code-block')
  blocks.forEach((block) => {
    const code = block.querySelector('code')
    if (!code) return

    // Language badge
    const lang = block.dataset.lang
    if (lang) {
      const badge = document.createElement('span')
      badge.className = 'markdrive-code-badge'
      badge.textContent = lang
      block.appendChild(badge)
    }

    // Copy button
    const btn = document.createElement('button')
    btn.className = 'markdrive-code-copy'
    btn.textContent = 'Copy'
    btn.setAttribute('aria-label', 'Copy code to clipboard')

    btn.addEventListener('click', () => {
      void navigator.clipboard.writeText(code.innerText).then(() => {
        btn.textContent = 'Copied!'
        btn.classList.add('markdrive-code-copy--success')
        setTimeout(() => {
          btn.textContent = 'Copy'
          btn.classList.remove('markdrive-code-copy--success')
        }, 2000)
      })
    })

    block.appendChild(btn)
  })
}

// ─── Heading anchors ──────────────────────────────────────────────────────────

/**
 * Add an id and a hoverable # anchor link to every heading.
 * Lets users link to specific sections.
 */
function addHeadingAnchors(viewer: HTMLElement): void {
  const headings = viewer.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')
  headings.forEach((heading) => {
    const id = slugify(heading.textContent ?? '')
    if (!id) return
    heading.id = id

    const anchor = document.createElement('a')
    anchor.className = 'markdrive-anchor'
    anchor.href = `#${id}`
    anchor.setAttribute('aria-label', 'Link to section')
    anchor.textContent = '#'
    heading.appendChild(anchor)
  })
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// ─── Callout blocks ───────────────────────────────────────────────────────────
//
// GitHub-flavoured callouts: > [!NOTE], > [!TIP], > [!WARNING], etc.
// Converts matching blockquotes into styled callout divs.

const CALLOUT_DEFS: Record<string, { icon: string; label: string }> = {
  NOTE:      { icon: 'ℹ',  label: 'Note'      },
  TIP:       { icon: '💡', label: 'Tip'       },
  IMPORTANT: { icon: '❗', label: 'Important' },
  WARNING:   { icon: '⚠',  label: 'Warning'   },
  CAUTION:   { icon: '🚫', label: 'Caution'   },
}

function processCallouts(viewer: HTMLElement): void {
  for (const bq of [...viewer.querySelectorAll('blockquote')]) {
    // The marker can appear as the entire first paragraph, or as the first
    // text node inside a paragraph followed by a <br>.
    const firstP = bq.querySelector('p')
    if (!firstP) continue

    const raw = firstP.textContent ?? ''
    const match = raw.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/)
    if (!match) continue

    const type  = match[1]
    const def   = CALLOUT_DEFS[type]

    const callout = document.createElement('div')
    callout.className = `md-callout md-callout--${type.toLowerCase()}`

    // Header row: icon + label
    const header = document.createElement('div')
    header.className = 'md-callout__header'
    header.innerHTML = `<span class="md-callout__icon" aria-hidden="true">${def.icon}</span>`
                     + `<span class="md-callout__label">${def.label}</span>`
    callout.appendChild(header)

    // Body: strip the [!TYPE] marker line, keep the rest
    const body = document.createElement('div')
    body.className = 'md-callout__body'

    // Strip marker from the first <p>
    // The marker may be the whole paragraph, or followed by a <br> + more text
    const markerRe = /\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(<br\s*\/?>)?\s*/i
    const cleanedP = firstP.innerHTML.replace(markerRe, '').trim()

    if (cleanedP) {
      const p = document.createElement('p')
      p.innerHTML = cleanedP
      body.appendChild(p)
    }

    // Append remaining sibling elements (paragraphs, lists, etc.)
    for (const child of [...bq.children]) {
      if (child !== firstP) body.appendChild(child.cloneNode(true))
    }

    callout.appendChild(body)
    bq.replaceWith(callout)
  }
}

// ─── Table wrapping ───────────────────────────────────────────────────────────

const EXPAND_SVG = `
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
    <path d="M1.5 5V1.5H5M8 1.5h3.5V5M11.5 8v3.5H8M5 11.5H1.5V8"
      stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`

function processTables(viewer: HTMLElement): void {
  for (const table of [...viewer.querySelectorAll<HTMLTableElement>('table')]) {
    // Outer wrapper: position:relative so expand button can be placed above the scroll layer
    const wrap = document.createElement('div')
    wrap.className = 'mdp-table-wrap'

    // Scroll layer: overflow-x:auto keeps the expand button outside the clipping rect
    const scroll = document.createElement('div')
    scroll.className = 'mdp-table-scroll'

    table.parentNode!.insertBefore(wrap, table)
    scroll.appendChild(table)
    wrap.appendChild(scroll)

    // Expand button
    const expandBtn = document.createElement('button')
    expandBtn.className = 'mdp-table-expand'
    expandBtn.setAttribute('aria-label', 'Expand table')
    expandBtn.title = 'Expand table'
    expandBtn.innerHTML = EXPAND_SVG
    expandBtn.addEventListener('click', () => openTableModal(table))
    wrap.appendChild(expandBtn)

    // Sort handlers on the inline table
    initTableSort(table)
  }
}

// ─── Decorator (public) ───────────────────────────────────────────────────────

/**
 * Add copy buttons + heading anchors + callouts + table wrappers to a rendered
 * viewer element. Called by injectIntoPreview, overlay, and the standalone viewer page.
 */
export function decorateViewer(viewer: HTMLElement): void {
  processFrontmatter(viewer)
  processCallouts(viewer)
  processTables(viewer)
  processLinks(viewer)
  addCopyButtons(viewer)
  addHeadingAnchors(viewer)
}

// ─── Error injection ──────────────────────────────────────────────────────────

/**
 * Inject a clean error notice into `container` when fetching or rendering fails.
 * Uses the same `.markdrive-viewer` wrapper so error styles are consistent.
 */
export function injectError(
  container: HTMLElement,
  message: string,
  mode: 'inline' | 'full-tab' = 'inline'
): void {
  // Clear any previous render or error so we're always on top
  container.querySelector('.markdrive-viewer')?.remove()
  container.querySelector('.markdrive-error')?.remove()

  const box = document.createElement('div')
  box.className = 'markdrive-viewer markdrive-error'
  box.dataset.mode = mode

  const inner = document.createElement('div')
  inner.className = 'markdrive-error__box'

  const icon = document.createElement('span')
  icon.className = 'markdrive-error__icon'
  icon.textContent = '⚠'

  const msg = document.createElement('p')
  msg.className = 'markdrive-error__msg'
  msg.textContent = message

  inner.appendChild(icon)
  inner.appendChild(msg)
  box.appendChild(inner)
  container.appendChild(box)
}

// ─── Injection ────────────────────────────────────────────────────────────────

/**
 * Inject rendered Markdown into `container`, hiding (not removing) Drive's
 * original <pre> element.
 *
 * ⚠️  We must NOT remove the <pre> from the DOM. Drive's own MutationObserver
 *     watches for removed children and immediately restores them. Instead we
 *     hide the <pre> in-place and insert our viewer as a sibling — Drive sees
 *     the <pre> still present and leaves it alone.
 */
export function injectIntoPreview(
  container: HTMLElement,
  source: string,
  mode: 'inline' | 'full-tab'
): void {
  // Remove any previous MarkDrive render — Drive reuses the same container
  // element when switching between files in the preview pane.
  container.querySelector('.markdrive-viewer')?.remove()
  container.querySelector('.markdrive-error')?.remove()

  const html = renderMarkdown(source)

  const viewer = document.createElement('div')
  viewer.className = 'markdrive-viewer'
  // Tell CSS which layout mode to use
  viewer.dataset.mode = mode
  viewer.innerHTML = html

  // Store the raw source on the element so the toolbar can access it
  viewer.dataset.rawSource = source

  // Add copy buttons, language badges, and heading anchors
  decorateViewer(viewer)

  // Hide Drive's <pre> without removing it — keeps Drive's restore logic quiet
  const pre = container.querySelector('pre')
  if (pre) {
    pre.style.display = 'none'
  }

  container.appendChild(viewer)

  // Clamp tall tables — must run after append so scrollHeight is available
  clampTallTables(viewer)

  // Render mermaid diagrams asynchronously (lazy-loads mermaid bundle)
  void renderMermaidBlocks(viewer)

}
