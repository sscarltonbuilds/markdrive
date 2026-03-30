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
 * Replace the contents of `container` with rendered Markdown.
 *
 * ⚠️  We clear children and inject INSIDE the container — never replace the
 *     container element itself. Replacing it breaks Drive's outer layout.
 */
export function injectIntoPreview(container: HTMLElement, source: string): void {

  const html = renderMarkdown(source)

  const viewer = document.createElement('div')
  viewer.className = 'markdrive-viewer'
  viewer.innerHTML = html

  // Store the raw source on the element so the toolbar (Module 05) can access it
  viewer.dataset.rawSource = source

  container.innerHTML = ''
  container.appendChild(viewer)

  console.log('[MarkDrive] ✓ rendered', source.length, 'chars into preview container')
}
