/**
 * Module 02 — File Content Fetching
 *
 * Two strategies, split by detection mode:
 *
 * Full-tab (/file/d/ID/view)
 *   Drive renders the file content into a <pre> inside the preview container.
 *   We watch with a MutationObserver and resolve the instant content arrives.
 *
 * Inline preview pane (folder view)
 *   Drive never populates the container — it stays structurally empty.
 *   We go straight to the Drive API v3 via the background service worker
 *   (chrome.identity is not available in content scripts).
 */

// ─── Full-tab: DOM strategy ───────────────────────────────────────────────────

function extractFromDom(container: HTMLElement): string | null {
  // 1. Direct <pre>
  const pre = container.querySelector('pre')
  if (pre?.textContent?.trim()) return pre.textContent

  // 2. Same-origin iframe
  for (const iframe of container.querySelectorAll<HTMLIFrameElement>('iframe')) {
    try {
      const doc = iframe.contentDocument
      if (!doc) continue
      const text = doc.querySelector('pre')?.textContent?.trim()
        ?? doc.body?.innerText?.trim()
      if (text) return text
    } catch {
      // Cross-origin — skip
    }
  }

  return null
}

const DOM_WAIT_MS = 6000

function waitForDomContent(container: HTMLElement): Promise<string> {
  return new Promise((resolve, reject) => {
    const immediate = extractFromDom(container)
    if (immediate) { resolve(immediate); return }

    const timeoutId = setTimeout(() => {
      mo.disconnect()
      reject(new Error('Timed out waiting for <pre> content'))
    }, DOM_WAIT_MS)

    const mo = new MutationObserver(() => {
      if (!document.body.contains(container)) {
        mo.disconnect()
        clearTimeout(timeoutId)
        reject(new Error('Preview container detached'))
        return
      }
      const text = extractFromDom(container)
      if (text) { mo.disconnect(); clearTimeout(timeoutId); resolve(text) }
    })

    mo.observe(container, { childList: true, subtree: true, characterData: true })

    // Race-check: content may have arrived between the immediate check and observer setup
    const raceText = extractFromDom(container)
    if (raceText) { mo.disconnect(); clearTimeout(timeoutId); resolve(raceText) }
  })
}

// ─── Inline: Drive API v3 via background service worker ──────────────────────
//
// chrome.identity is MV3-restricted to service workers.
// The background script owns getAuthToken + the actual fetch.

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

// ─── Public API ──────────────────────────────────────────────────────────────

export async function fetchMarkdownContent(
  fileId: string,
  previewContainer: HTMLElement,
  mode: 'inline' | 'full-tab'
): Promise<string> {
  // Always fetch via the Drive API — the DOM strategy reads stale <pre> content
  // when navigating between files because Drive updates the URL/aria-label before
  // it swaps the <pre> text, so extractFromDom resolves with the previous file.
  console.debug(`[MarkDrive] fetcher: ${mode} mode → Drive API`)
  try {
    return await fetchViaBackground(fileId)
  } catch (err) {
    // Last resort: try to pull content straight from Drive's rendered <pre>.
    // Only useful if auth is missing but Drive already rendered a cached view.
    console.debug('[MarkDrive] fetcher: API failed, falling back to DOM —', (err as Error).message)
    return waitForDomContent(previewContainer)
  }
}
