import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import DOMPurify from 'dompurify'
import { highlight, displayLabel } from './highlighter'
import { renderMermaidBlocks } from './mermaid-renderer'
import './styles/viewer.css'
import './styles/code.css'

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
}).use(taskLists)

// ─── Render ───────────────────────────────────────────────────────────────────

/**
 * Parse Markdown source and return sanitized HTML.
 * DOMPurify runs even though html:false is set — belt and suspenders.
 */
export function renderMarkdown(source: string): string {
  const rawHtml = md.render(source)
  return DOMPurify.sanitize(rawHtml, {
    ADD_ATTR: ['data-lang'],
    // Allow the mermaid placeholder div and anchor ids through
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

// ─── Error injection ──────────────────────────────────────────────────────────

/**
 * Inject a clean error notice into `container` when fetching or rendering fails.
 * Uses the same `.markdrive-viewer` wrapper so error styles are consistent.
 */
export function injectError(container: HTMLElement, message: string): void {
  if (container.querySelector('.markdrive-error')) return

  const box = document.createElement('div')
  box.className = 'markdrive-viewer markdrive-error'

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

// ─── Utility ──────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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
export function injectIntoPreview(container: HTMLElement, source: string): void {
  // Bail out if we've already injected (guard against duplicate calls)
  if (container.querySelector('.markdrive-viewer')) return

  const html = renderMarkdown(source)

  const viewer = document.createElement('div')
  viewer.className = 'markdrive-viewer'
  viewer.innerHTML = html

  // Store the raw source on the element so the toolbar can access it
  viewer.dataset.rawSource = source

  // Add copy buttons + language badges to all code blocks
  addCopyButtons(viewer)

  // Add # anchor links to headings
  addHeadingAnchors(viewer)

  // Hide Drive's <pre> without removing it — keeps Drive's restore logic quiet
  const pre = container.querySelector('pre')
  if (pre) {
    pre.style.display = 'none'
  }

  container.appendChild(viewer)

  // Render mermaid diagrams asynchronously (lazy-loads mermaid bundle)
  void renderMermaidBlocks(viewer)

  console.log('[MarkDrive] ✓ rendered', source.length, 'chars into preview container')
}
