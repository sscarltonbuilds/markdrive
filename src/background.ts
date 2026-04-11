// Background service worker
// Handles requests that content scripts cannot make directly (MV3 restrictions).

// FETCH_FILE: content script asks us to fetch a Drive file via API v3.
import { getStoredToken, signIn } from './auth'

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_FILE') {
    const { fileId } = message.payload as { fileId: string }
    handleFetchFile(fileId).then(sendResponse).catch((err: Error) => {
      sendResponse({ ok: false, error: err.message })
    })
    return true // keep message channel open for async response
  }

  if (message.type === 'OPEN_VIEWER') {
    const { fileId, fileName } = message.payload as { fileId: string; fileName: string }
    const driveTabId = sender.tab?.id
    let url = chrome.runtime.getURL('viewer.html') +
      `?fileId=${encodeURIComponent(fileId)}&fileName=${encodeURIComponent(fileName)}`
    if (driveTabId !== undefined) url += `&driveTabId=${driveTabId}`
    void chrome.tabs.create({ url })
    sendResponse({ ok: true })
    return true
  }

  if (message.type === 'SWITCH_TO_TAB') {
    const { tabId } = message.payload as { tabId: number }
    void chrome.tabs.update(tabId, { active: true })
    sendResponse({ ok: true })
    return true
  }
})

async function handleFetchFile(fileId: string): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  try {
    let token = await getStoredToken()
    if (!token) {
      const result = await signIn()
      if ('error' in result) throw new Error(result.error)
      token = result.token
    }
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`Drive API ${res.status}`)
    const content = await res.text()
    return { ok: true, content }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export {}
