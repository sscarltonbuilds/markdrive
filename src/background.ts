// Background service worker
// Handles requests that content scripts cannot make directly (MV3 restrictions).

// FETCH_FILE: content script asks us to fetch a Drive file via API v3.
// chrome.identity is only available here, not in content scripts.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'FETCH_FILE') {
    const { fileId } = message.payload as { fileId: string }
    handleFetchFile(fileId).then(sendResponse).catch((err: Error) => {
      sendResponse({ ok: false, error: err.message })
    })
    return true // keep message channel open for async response
  }
  // CLAUDE_REQUEST will be added in Module 07
})

async function handleFetchFile(fileId: string): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  try {
    const token = await getAuthToken()
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`Drive API ${res.status}`)
    const content = await res.text()
    return { ok: true, content }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function getAuthToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message ?? 'No auth token'))
      } else {
        resolve(token)
      }
    })
  })
}

export {}
