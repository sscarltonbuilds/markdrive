import { DriveObserver } from './observer'
import { fetchMarkdownContent } from './fetcher'
import type { MarkdownFileDetected } from './types'

console.log('[MarkDrive] content script loaded on', window.location.href)

async function onMarkdownFileDetected(event: MarkdownFileDetected): Promise<void> {
  console.log('[MarkDrive] ✓ MarkdownFileDetected', {
    fileId: event.fileId,
    fileName: event.fileName,
    previewContainer: event.previewContainer,
  })

  try {
    const source = await fetchMarkdownContent(event.fileId, event.previewContainer)
    console.log(`[MarkDrive] ✓ fetched ${source.length} chars — first 200:`)
    console.log(source.slice(0, 200))
  } catch (err) {
    console.error('[MarkDrive] fetch failed:', err)
  }

  // Module 03 will call the renderer here.
}

const observer = new DriveObserver((event) => {
  void onMarkdownFileDetected(event)
})
observer.start()
