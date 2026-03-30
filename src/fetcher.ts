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

// ─── Strategy B: Drive API v3 ────────────────────────────────────────────────
//
// Requires the manifest.json to have:
//   "permissions": [..., "identity"],
//   "oauth2": {
//     "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
//     "scopes": ["https://www.googleapis.com/auth/drive.readonly"]
//   }
//
// The client_id is obtained from Google Cloud Console → APIs & Services →
// Credentials → Create OAuth 2.0 Client ID (Chrome Extension).

async function fetchViaApi(fileId: string): Promise<string> {
  const token = await getAuthToken()
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`[MarkDrive] Drive API error ${res.status}: ${await res.text()}`)
  }
  return res.text()
}

function getAuthToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(
          new Error(
            chrome.runtime.lastError?.message ??
              'getAuthToken returned no token — OAuth2 not configured in manifest'
          )
        )
      } else {
        resolve(token)
      }
    })
  })
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch the raw Markdown source for a Drive file.
 *
 * Tries Strategy A (DOM) first. Falls back to Strategy B (Drive API) if the
 * DOM yields nothing.
 */
export async function fetchMarkdownContent(
  fileId: string,
  previewContainer: HTMLElement
): Promise<string> {
  // Strategy A
  const domText = extractFromDom(previewContainer)
  if (domText) return domText

  // Strategy B
  console.debug('[MarkDrive] fetcher: Strategy A found nothing — trying Drive API')
  return fetchViaApi(fileId)
}
