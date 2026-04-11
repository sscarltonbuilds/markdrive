export interface MarkdownFileDetected {
  fileId: string
  fileName: string
  previewContainer: HTMLElement
  mode: 'inline' | 'full-tab'
}

export type DetectionState =
  | { status: 'idle' }
  | { status: 'detected'; event: MarkdownFileDetected }
  | { status: 'error'; reason: string }
