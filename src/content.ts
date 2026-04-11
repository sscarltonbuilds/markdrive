import { DriveObserver } from './observer'
import type { MarkdownFileDetected } from './types'
import './styles/trigger.css'

function isInvalidatedContext(err: unknown): boolean {
  return err instanceof Error && err.message.includes('Extension context invalidated')
}

/**
 * Inject a floating "View as Markdown" button into the preview container itself.
 * position:absolute bottom-right — always visible, no Drive toolbar hacking needed.
 * Removes any existing button first so file-switching always shows the correct file.
 */
function injectTriggerButton(): void {
  // Always remove first — handles switching between two .md files
  document.getElementById('markdrive-trigger')?.remove()

  const btn = document.createElement('button')
  btn.id = 'markdrive-trigger'
  btn.type = 'button'
  btn.setAttribute('aria-label', 'Open in MarkDrive')
  btn.innerHTML = `
    <img class="mdtrig__icon" src="${chrome.runtime.getURL('icon-128.png')}" width="16" height="16" alt="" />
    <span>Open in MarkDrive</span>
    <svg class="mdtrig__arrow" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M3 1.5h5.5v5.5M8.5 1.5L2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`

  btn.addEventListener('click', () => {
    // Read state fresh from the DOM at click time — no stale closures.
    // By the time the user clicks, Drive has fully settled on the active file.
    const displaying = document.querySelector('[aria-label^="Displaying "]')
    const label = displaying?.getAttribute('aria-label') ?? ''
    // Strip the trailing period (inline mode marker)
    const fileNameMatch = label.match(/^Displaying\s+(.+?)\.?$/)
    const fileName = fileNameMatch?.[1]?.trim() ?? ''

    // Drive rows have no aria-label — match by text content instead.
    // By click time Drive has fully settled, so textContent is reliable.
    let fileId = ''
    if (fileName) {
      const rows = document.querySelectorAll<HTMLElement>('TR[data-id]')
      for (const row of rows) {
        if ((row.textContent ?? '').includes(fileName)) {
          fileId = row.getAttribute('data-id') ?? ''
          break
        }
      }
    }
    // Fallback: aria-selected row or URL (full-tab mode)
    if (!fileId) {
      const selectedRow = document.querySelector<HTMLElement>('TR[data-id][aria-selected="true"]')
      const urlMatch = location.href.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
      fileId = selectedRow?.getAttribute('data-id') ?? urlMatch?.[1] ?? ''
    }

    if (fileId && fileName) {
      try {
        chrome.runtime.sendMessage({ type: 'OPEN_VIEWER', payload: { fileId, fileName } })
      } catch (err) {
        if (isInvalidatedContext(err)) {
          // Extension was reloaded — remove stale button so it's not clickable anymore
          removeTriggerButton()
        }
      }
    } else {
      console.warn('[MarkDrive] could not resolve fileId at click time', { label, fileId, fileName })
    }
  })

  // position:fixed so it's viewport-relative regardless of container height:0
  document.body.appendChild(btn)
}

function removeTriggerButton(): void {
  document.getElementById('markdrive-trigger')?.remove()
}

/**
 * Hidden sentinel — keeps the observer's re-trigger guard happy so it doesn't
 * re-emit the same file when the button is the only element we added.
 */
function injectSentinel(container: HTMLElement): void {
  if (!container.querySelector('.markdrive-viewer')) {
    const s = document.createElement('div')
    s.className = 'markdrive-viewer'
    s.setAttribute('aria-hidden', 'true')
    s.style.display = 'none'
    container.appendChild(s)
  }
}

async function onMarkdownFileDetected(event: MarkdownFileDetected): Promise<void> {
  try {
    injectSentinel(event.previewContainer)
    injectTriggerButton()
  } catch (err) {
    if (isInvalidatedContext(err)) {
      console.warn('[MarkDrive] Extension context invalidated — reload the Drive tab.')
      observer.stop()
    }
  }
}

const observer = new DriveObserver(
  (event) => { void onMarkdownFileDetected(event) },
  removeTriggerButton,
)
observer.start()
