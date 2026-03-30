import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import DOMPurify from 'dompurify'
import { highlight, displayLabel } from './highlighter'
import './styles/viewer.css'
import './styles/code.css'

// ─── Parser setup ─────────────────────────────────────────────────────────────

const md = new MarkdownIt({
  html: false,       // never allow raw HTML passthrough from the .md source
  linkify: true,     // auto-link bare URLs
  typographer: true, // smart quotes, em-dashes, etc.
  highlight(code, lang) {
    const highlighted = highlight(code, lang)
    const label = lang ? displayLabel(lang) : ''
    // Wrap in a container that we'll use for the copy button (added post-render)
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
  // Allow data-lang attribute through DOMPurify (used for language badges)
  return DOMPurify.sanitize(rawHtml, { ADD_ATTR: ['data-lang'] })
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

  // Store the raw source on the element so the toolbar (Module 05) can access it
  viewer.dataset.rawSource = source

  // Add copy buttons + language badges to all code blocks
  addCopyButtons(viewer)

  // Hide Drive's <pre> without removing it — keeps Drive's restore logic quiet
  const pre = container.querySelector('pre')
  if (pre) {
    pre.style.display = 'none'
  }

  container.appendChild(viewer)

  console.log('[MarkDrive] ✓ rendered', source.length, 'chars into preview container')
}
