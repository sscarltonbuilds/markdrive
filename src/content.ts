import { DriveObserver } from './observer'
import { fetchMarkdownContent } from './fetcher'
import { injectIntoPreview, injectError } from './renderer'
import { createToolbar } from './toolbar'
import type { MarkdownFileDetected } from './types'

console.log('[MarkDrive] content script loaded on', window.location.href)

async function onMarkdownFileDetected(event: MarkdownFileDetected): Promise<void> {
  console.log('[MarkDrive] ✓ MarkdownFileDetected', {
    fileId: event.fileId,
    fileName: event.fileName,
  })

  try {
    const source = await fetchMarkdownContent(event.fileId, event.previewContainer)
    injectIntoPreview(event.previewContainer, source)

    const viewer = event.previewContainer.querySelector<HTMLElement>('.markdrive-viewer')
    const pre = event.previewContainer.querySelector<HTMLElement>('pre')

    createToolbar(event.previewContainer, source, (showingSource) => {
      if (showingSource) {
        // Raw source mode: show the original <pre>, hide our viewer
        if (pre) pre.style.display = ''
        if (viewer) viewer.style.display = 'none'
      } else {
        // Rendered mode: hide <pre>, show our viewer
        if (pre) pre.style.display = 'none'
        if (viewer) viewer.style.display = ''
      }
    })
  } catch (err) {
    console.error('[MarkDrive] render pipeline failed:', err)
    const message = err instanceof Error ? err.message : 'Could not load this Markdown file.'
    injectError(event.previewContainer, `MarkDrive: ${message}`)
  }
}

const observer = new DriveObserver((event) => {
  void onMarkdownFileDetected(event)
})
observer.start()
