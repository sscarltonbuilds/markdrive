import './styles/toolbar.css'

type ToggleCallback = (showingSource: boolean) => void

/**
 * Inject a minimal floating toolbar into `container`.
 *
 * The toolbar sits at the top-right of the preview container using
 * position:absolute — never position:fixed (avoids Drive z-index conflicts).
 *
 * State (rendered vs source) is persisted in chrome.storage.local so it
 * survives navigation within the same Drive session.
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

  const btn = document.createElement('button')
  btn.className = 'markdrive-toolbar__btn'
  toolbar.appendChild(btn)
  container.appendChild(toolbar)

  // Ensure container is positioned so our absolute toolbar lands correctly
  const currentPosition = getComputedStyle(container).position
  if (currentPosition === 'static') {
    container.style.position = 'relative'
  }

  // ── State ──────────────────────────────────────────────────────────────────

  let showingSource = false

  function applyState(source: boolean): void {
    showingSource = source
    btn.textContent = source ? 'Rendered' : 'Source'
    btn.setAttribute('aria-label', source ? 'Switch to rendered view' : 'Switch to source view')
    btn.setAttribute('aria-pressed', String(source))
    onToggle(source)
  }

  // Load persisted state
  chrome.storage.local.get('markdrive_show_source', (result) => {
    applyState(result['markdrive_show_source'] === true)
  })

  // ── Click handler ───────────────────────────────────────────────────────────

  btn.addEventListener('click', () => {
    const next = !showingSource
    chrome.storage.local.set({ markdrive_show_source: next })
    applyState(next)
  })
}
