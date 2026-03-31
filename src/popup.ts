// Popup — API key management
// Key is stored in chrome.storage.local only (never sync — don't leak across devices)

const keyInput = document.getElementById('api-key') as HTMLInputElement
const saveBtn = document.getElementById('save-btn') as HTMLButtonElement
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement
const status = document.getElementById('status') as HTMLElement

function setStatus(msg: string, type: 'success' | 'error' | 'info'): void {
  status.textContent = msg
  status.className = `status status--${type}`
  status.style.display = 'block'
}

function maskKey(key: string): string {
  return key.length > 8 ? `sk-ant-...${key.slice(-6)}` : '••••••••'
}

// Load existing key state on open
chrome.storage.local.get('markdrive_api_key', (result) => {
  const key = result['markdrive_api_key'] as string | undefined
  if (key) {
    keyInput.placeholder = maskKey(key)
    clearBtn.style.display = 'inline-block'
    setStatus('API key saved', 'success')
  }
})

saveBtn.addEventListener('click', () => {
  const key = keyInput.value.trim()
  if (!key) {
    setStatus('Enter an API key first', 'error')
    return
  }
  if (!key.startsWith('sk-ant-')) {
    setStatus('Key should start with sk-ant-', 'error')
    return
  }
  chrome.storage.local.set({ markdrive_api_key: key }, () => {
    keyInput.value = ''
    keyInput.placeholder = maskKey(key)
    clearBtn.style.display = 'inline-block'
    setStatus('Saved', 'success')
  })
})

clearBtn.addEventListener('click', () => {
  chrome.storage.local.remove('markdrive_api_key', () => {
    keyInput.value = ''
    keyInput.placeholder = 'sk-ant-...'
    clearBtn.style.display = 'none'
    setStatus('API key removed', 'info')
  })
})

// Save on Enter
keyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveBtn.click()
})
