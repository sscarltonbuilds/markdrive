import './styles/toolbar.css'

type ToggleCallback = (showingSource: boolean) => void
type Theme = 'light' | 'dark'

/**
 * Inject a minimal floating toolbar into `container`.
 *
 * The toolbar sits at the top-right of the preview container using
 * position:absolute — never position:fixed (avoids Drive z-index conflicts).
 *
 * State (rendered vs source, light vs dark) is persisted in chrome.storage.local
 * so it survives navigation within the same Drive session.
 */
export function createToolbar(
  container: HTMLElement,
  _rawSource: string,
  onToggle: ToggleCallback
): void {
  // Remove any existing toolbar (e.g. re-render after navigation)
  container.querySelector('.markdrive-toolbar')?.remove()

  const toolbar = document.createElement('div')
  toolbar.className = 'markdrive-toolbar'

  const sourceBtn = document.createElement('button')
  sourceBtn.className = 'markdrive-toolbar__btn'

  const themeBtn = document.createElement('button')
  themeBtn.className = 'markdrive-toolbar__btn'

  toolbar.appendChild(sourceBtn)
  toolbar.appendChild(themeBtn)
  container.appendChild(toolbar)

  // Ensure container is positioned so our absolute toolbar lands correctly
  const currentPosition = getComputedStyle(container).position
  if (currentPosition === 'static') {
    container.style.position = 'relative'
  }

  const viewer = container.querySelector<HTMLElement>('.markdrive-viewer')

  // ── Source / Rendered toggle ────────────────────────────────────────────────

  let showingSource = false

  function applySource(source: boolean): void {
    showingSource = source
    sourceBtn.textContent = source ? 'Rendered' : 'Source'
    sourceBtn.setAttribute('aria-label', source ? 'Switch to rendered view' : 'Switch to source view')
    sourceBtn.setAttribute('aria-pressed', String(source))
    onToggle(source)
  }

  chrome.storage.local.get('markdrive_show_source', (result) => {
    applySource(result['markdrive_show_source'] === true)
  })

  sourceBtn.addEventListener('click', () => {
    const next = !showingSource
    chrome.storage.local.set({ markdrive_show_source: next })
    applySource(next)
  })

  // ── Light / Dark toggle ─────────────────────────────────────────────────────

  function getSystemTheme(): Theme {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  function applyTheme(theme: Theme): void {
    if (viewer) viewer.dataset.theme = theme
    const isDark = theme === 'dark'
    toolbar.classList.toggle('markdrive-toolbar--dark', isDark)
    themeBtn.textContent = isDark ? '☀ Light' : '☾ Dark'
    themeBtn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode')
  }

  chrome.storage.local.get('markdrive_theme', (result) => {
    const stored = result['markdrive_theme'] as Theme | undefined
    applyTheme(stored ?? getSystemTheme())
  })

  themeBtn.addEventListener('click', () => {
    const current = (viewer?.dataset.theme as Theme | undefined) ?? getSystemTheme()
    const next: Theme = current === 'dark' ? 'light' : 'dark'
    chrome.storage.local.set({ markdrive_theme: next })
    applyTheme(next)
  })
}
