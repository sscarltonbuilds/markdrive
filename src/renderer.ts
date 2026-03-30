import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import DOMPurify from 'dompurify'
import './styles/viewer.css'

// ─── Parser setup ─────────────────────────────────────────────────────────────

const md = new MarkdownIt({
  html: false,       // never allow raw HTML passthrough from the .md source
  linkify: true,     // auto-link bare URLs
  typographer: true, // smart quotes, em-dashes, etc.
}).use(taskLists)

// ─── Render ───────────────────────────────────────────────────────────────────

/**
 * Parse Markdown source and return sanitized HTML.
 * DOMPurify runs even though html:false is set — belt and suspenders.
 */
export function renderMarkdown(source: string): string {
  const rawHtml = md.render(source)
  return DOMPurify.sanitize(rawHtml)
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

  // Hide Drive's <pre> without removing it — keeps Drive's restore logic quiet
  const pre = container.querySelector('pre')
  if (pre) {
    pre.style.display = 'none'
  }

  container.appendChild(viewer)

  console.log('[MarkDrive] ✓ rendered', source.length, 'chars into preview container')
}
