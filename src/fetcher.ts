/**
 * Module 02 — File Content Fetching
 *
 * Strategy A: Read raw text from Drive's preview DOM (no API call needed).
 *   Drive renders text files directly in the preview container. We walk the
 *   element looking for a <pre> or dense text node.
 *
 * Strategy B: Drive API v3 via chrome.identity (fallback).
 *   Used if Strategy A finds nothing, or if the text in the DOM is clearly
 *   truncated (Drive sometimes shows only the first ~N lines in preview).
 *   Requires manifest.json oauth2 block — see notes below.
 */

// ─── Strategy A: DOM extraction ──────────────────────────────────────────────

/**
 * Walk `container` looking for a <pre> element or an iframe whose document
 * contains a <pre> or <body> with plain text.
 */
function extractFromDom(container: HTMLElement): string | null {
  // 1. Direct <pre> inside the container
  const pre = container.querySelector('pre')
  if (pre?.textContent) {
    const text = pre.textContent
    if (text.trim().length > 0) {
      console.debug('[MarkDrive] fetcher: Strategy A — found <pre> in container')
      return text
    }
  }

  // 2. Same-origin iframe (Drive's "texmex" text viewer loads in an iframe)
  const iframes = container.querySelectorAll<HTMLIFrameElement>('iframe')
  for (const iframe of iframes) {
    try {
      const doc = iframe.contentDocument
      if (!doc) continue

      const iframePre = doc.querySelector('pre')
      if (iframePre?.textContent?.trim()) {
        console.debug('[MarkDrive] fetcher: Strategy A — found <pre> in iframe')
        return iframePre.textContent
      }

      // Some viewers wrap content in <body> with no <pre>
      const body = doc.body
      if (body?.innerText?.trim()) {
        console.debug('[MarkDrive] fetcher: Strategy A — found body text in iframe')
        return body.innerText
      }
    } catch {
      // Cross-origin iframe — skip silently
    }
  }

  // 3. Walk immediate children of the container for dense text nodes
  //    (Drive sometimes renders text directly without a <pre>)
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const chunks: string[] = []
  let node: Node | null
  while ((node = walker.nextNode()) !== null) {
    const text = node.textContent
    if (text && text.trim().length > 10) chunks.push(text)
  }
  if (chunks.length > 0) {
    const combined = chunks.join('')
    // Sanity check: Markdown files will have at least one # or - or ` character
    if (/[#\-`*\[\]]/.test(combined)) {
      console.debug('[MarkDrive] fetcher: Strategy A — assembled text from DOM text nodes')
      return combined
    }
  }

  return null
}

// ─── Strategy B: Drive API v3 (via background service worker) ────────────────
//
// chrome.identity is NOT available in content scripts (MV3 restriction).
// The background service worker handles the actual fetch. See background.ts.
//
// If Strategy B is ever needed in production, add to manifest.json:
//   "permissions": [..., "identity"],
//   "oauth2": {
//     "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
//     "scopes": ["https://www.googleapis.com/auth/drive.readonly"]
//   }
//
// The client_id comes from Google Cloud Console → APIs & Services →
// Credentials → Create OAuth 2.0 Client ID (Chrome Extension).

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch the raw Markdown source for a Drive file.
 *
 * Tries Strategy A (DOM) up to MAX_RETRIES times. Drive renders the container
 * before asynchronously populating the <pre> with content, so we need to wait
 * for the text to arrive. Falls back to Strategy B (Drive API via background
 * service worker) only if the DOM never populates.
 */
const MAX_RETRIES = 6
const RETRY_DELAY_MS = 400

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchMarkdownContent(
  fileId: string,
  previewContainer: HTMLElement
): Promise<string> {
  // Strategy A — retry loop: Drive fills the <pre> asynchronously after the
  // container appears, so the first attempt may find an empty element.
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const domText = extractFromDom(previewContainer)
    if (domText) return domText
    console.debug(`[MarkDrive] fetcher: Strategy A attempt ${attempt}/${MAX_RETRIES} — pre empty, waiting…`)
    await wait(RETRY_DELAY_MS)
  }

  // Strategy B — chrome.identity is not available in content scripts (MV3
  // restriction), so route the request through the background service worker.
  console.debug('[MarkDrive] fetcher: Strategy A exhausted — falling back to Drive API via background')
  return fetchViaBackground(fileId)
}

/**
 * Ask the background service worker to fetch the file via Drive API v3.
 * The background script has access to chrome.identity; the content script does not.
 */
function fetchViaBackground(fileId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'FETCH_FILE', payload: { fileId } },
      (response: { ok: true; content: string } | { ok: false; error: string }) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
        } else if (!response.ok) {
          reject(new Error(response.error))
        } else {
          resolve(response.content)
        }
      }
    )
  })
}
