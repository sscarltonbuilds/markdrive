import { DriveObserver } from './observer'
import { fetchMarkdownContent } from './fetcher'
import { injectIntoPreview } from './renderer'
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
    // Module 05 will add the toolbar here.
  } catch (err) {
    console.error('[MarkDrive] render pipeline failed:', err)
  }
}

const observer = new DriveObserver((event) => {
  void onMarkdownFileDetected(event)
})
observer.start()
