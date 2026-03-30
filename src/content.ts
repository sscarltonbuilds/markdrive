import { DriveObserver } from './observer'
import type { MarkdownFileDetected } from './types'

console.log('[MarkDrive] content script loaded on', window.location.href)

function onMarkdownFileDetected(event: MarkdownFileDetected): void {
  console.log('[MarkDrive] ✓ MarkdownFileDetected', {
    fileId: event.fileId,
    fileName: event.fileName,
    previewContainer: event.previewContainer,
  })
  // Module 02 will call the fetcher here.
  // Module 03 will call the renderer here.
}

const observer = new DriveObserver(onMarkdownFileDetected)
observer.start()
