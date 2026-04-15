// Background service worker
// Handles requests that content scripts cannot make directly (MV3 restrictions).

// FETCH_FILE: content script asks us to fetch a Drive file via API v3.
import { getStoredToken, signIn, clearToken } from './auth'

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_FILE') {
    const { fileId } = message.payload as { fileId: string }
    handleFetchFile(fileId).then(sendResponse).catch((err: Error) => {
      sendResponse({ ok: false, error: err.message })
    })
    return true // keep message channel open for async response
  }

  if (message.type === 'FETCH_IMAGE') {
    const { fileId } = message.payload as { fileId: string }
    handleFetchImage(fileId).then(sendResponse).catch((err: Error) => {
      sendResponse({ ok: false, error: err.message })
    })
    return true
  }

  if (message.type === 'SAVE_FILE') {
    const { fileId, content } = message.payload as { fileId: string; content: string }
    handleSaveFile(fileId, content).then(sendResponse).catch((err: Error) => {
      sendResponse({ ok: false, error: err.message })
    })
    return true
  }

  if (message.type === 'CHECK_MODIFIED') {
    const { fileId } = message.payload as { fileId: string }
    handleCheckModified(fileId).then(sendResponse).catch((err: Error) => {
      sendResponse({ ok: false, error: err.message })
    })
    return true
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

async function handleSaveFile(fileId: string, content: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    let token = await getStoredToken()
    if (!token) {
      const result = await signIn()
      if ('error' in result) return { ok: false, error: result.error }
      token = result.token
    }

    const doSave = async (tok: string) => fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'text/plain; charset=utf-8' },
        body: content,
      }
    )

    let res = await doSave(token)

    // 401/403 can mean the token was issued with the old drive.readonly scope.
    // Clear it, re-auth with the new drive.file scope, and retry once.
    if (res.status === 401 || res.status === 403) {
      await clearToken()
      const result = await signIn()
      if ('error' in result) return { ok: false, error: result.error }
      res = await doSave(result.token)
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: `Drive API ${res.status}: ${body.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function handleFetchImage(fileId: string): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  try {
    let token = await getStoredToken()
    if (!token) return { ok: false, error: 'Not signed in' }
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return { ok: false, error: `Drive API ${res.status}` }
    const contentType = res.headers.get('content-type') ?? 'image/jpeg'
    const buffer = await res.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const dataUrl = `data:${contentType};base64,${btoa(binary)}`
    return { ok: true, dataUrl }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function handleCheckModified(fileId: string): Promise<{ ok: true; modifiedTime: string } | { ok: false; error: string }> {
  try {
    let token = await getStoredToken()
    if (!token) return { ok: false, error: 'Not signed in' }
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=modifiedTime`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return { ok: false, error: `Drive API ${res.status}` }
    const { modifiedTime } = await res.json() as { modifiedTime: string }
    return { ok: true, modifiedTime }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
