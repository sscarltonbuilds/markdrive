/**
 * MarkDrive — Split-view editor
 *
 * Wraps CodeMirror 6 with a Markdown-aware setup, a formatting toolbar,
 * and a status bar. The editor pane + preview pane are managed here;
 * save logic and Drive write-back live in viewer-page.ts.
 */

import { EditorView, keymap, ViewUpdate } from '@codemirror/view'
import { EditorState, EditorSelection } from '@codemirror/state'
import type { Command } from '@codemirror/view'
import { defaultKeymap, historyKeymap, history, indentWithTab } from '@codemirror/commands'
import { markdown, commonmarkLanguage } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import './styles/editor.css'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EditorController {
  mount(container: HTMLElement): void
  getValue(): string
  setValue(source: string): void
  setTheme(theme: 'light' | 'dark'): void
  getView(): EditorView | null
  focus(): void
  destroy(): void
}

export interface EditorOptions {
  initialSource: string
  theme: 'light' | 'dark'
  onChange(source: string): void
  onFirstEdit(): void
}

// ─── CodeMirror theme ────────────────────────────────────────────────────────
// Matches our CSS variables — no external theme package needed.

function buildCmTheme(theme: 'light' | 'dark') {
  const isDark = theme === 'dark'
  return EditorView.theme(
    {
      '&': {
        height: '100%',
        fontSize: '13.5px',
        fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
        backgroundColor: isDark ? '#1e1e1e' : '#f6f8fa',
        color: isDark ? '#d0d0d0' : '#24292e',
      },
      '.cm-content': {
        padding: '20px 28px 80px',
        caretColor: isDark ? '#6ba7f5' : '#1a73e8',
        lineHeight: '1.65',
      },
      '.cm-line': { padding: '0' },
      '.cm-focused': { outline: 'none' },
      '.cm-cursor': { borderLeftColor: isDark ? '#6ba7f5' : '#1a73e8', borderLeftWidth: '2px' },
      '.cm-selectionBackground': {
        background: isDark ? 'rgba(107, 167, 245, 0.25)' : 'rgba(26, 115, 232, 0.15)',
      },
      '&.cm-focused .cm-selectionBackground': {
        background: isDark ? 'rgba(107, 167, 245, 0.3)' : 'rgba(26, 115, 232, 0.2)',
      },
      '.cm-gutters': { display: 'none' },
      '.cm-activeLine': {
        backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)',
      },
      '.cm-scroller': { overflow: 'auto' },
    },
    { dark: isDark }
  )
}

// ─── Editor factory ──────────────────────────────────────────────────────────

export function createEditor(opts: EditorOptions): EditorController {
  let view: EditorView | null = null
  let firstEditFired = false
  let currentTheme = opts.theme

  function buildExtensions(theme: 'light' | 'dark') {
    return [
      history(),
      EditorView.lineWrapping,
      markdown({ base: commonmarkLanguage }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      buildCmTheme(theme),
      keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (!update.docChanged) return
        if (!firstEditFired) {
          firstEditFired = true
          opts.onFirstEdit()
        }
        opts.onChange(update.state.doc.toString())
      }),
    ]
  }

  return {
    mount(container) {
      view = new EditorView({
        state: EditorState.create({
          doc: opts.initialSource,
          extensions: buildExtensions(currentTheme),
        }),
        parent: container,
      })
    },

    getValue() {
      return view?.state.doc.toString() ?? opts.initialSource
    },

    setValue(source) {
      if (!view) return
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: source },
      })
    },

    setTheme(theme) {
      if (!view || theme === currentTheme) return
      currentTheme = theme
      const source = view.state.doc.toString()
      const sel    = view.state.selection
      const parent = view.dom.parentElement
      view.destroy()
      if (parent) {
        view = new EditorView({
          state: EditorState.create({
            doc: source,
            extensions: buildExtensions(theme),
            selection: sel,
          }),
          parent,
        })
      }
    },

    getView() {
      return view
    },

    focus() {
      view?.focus()
    },

    destroy() {
      view?.destroy()
      view = null
    },
  }
}

// ─── Formatting toolbar ──────────────────────────────────────────────────────

const isMac = navigator.platform.toUpperCase().includes('MAC')

// ── Button type definitions ───────────────────────────────────────────────────

interface DropdownItem {
  label: string
  sub?: string      // secondary label shown right (e.g. markdown syntax hint)
  command: Command
}

type ToolbarButton =
  | { kind: 'action';      label: string; title: string; command: Command; separator?: boolean }
  | { kind: 'dropdown';    label: string; title: string; items: DropdownItem[]; separator?: boolean }
  | { kind: 'tablePicker'; label: string; title: string; separator?: boolean }

// ── Commands ──────────────────────────────────────────────────────────────────

function wrapSelection(before: string, after = before): Command {
  return (view) => {
    const { from, to } = view.state.selection.main
    const selected = view.state.sliceDoc(from, to)
    const insert = `${before}${selected || 'text'}${after}`
    view.dispatch({
      changes: { from, to, insert },
      selection: EditorSelection.range(
        from + before.length,
        from + before.length + (selected || 'text').length
      ),
    })
    view.focus()
    return true
  }
}

function prefixLine(prefix: string): Command {
  return (view) => {
    const { from } = view.state.selection.main
    const line = view.state.doc.lineAt(from)
    const already = line.text.startsWith(prefix)
    view.dispatch({
      changes: already
        ? { from: line.from, to: line.from + prefix.length, insert: '' }
        : { from: line.from, insert: prefix },
    })
    view.focus()
    return true
  }
}

// Heading: strips any existing # prefix, then applies the new level (toggle if same)
function headingLine(level: number): Command {
  const prefix = '#'.repeat(level) + ' '
  return (view) => {
    const { from } = view.state.selection.main
    const line = view.state.doc.lineAt(from)
    const stripped = line.text.replace(/^#{1,6} /, '')
    const already   = line.text === prefix + stripped
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: already ? stripped : prefix + stripped },
    })
    view.focus()
    return true
  }
}

// Ordered list: toggles any "N. " prefix
function orderedListLine(): Command {
  return (view) => {
    const { from } = view.state.selection.main
    const line  = view.state.doc.lineAt(from)
    const match = line.text.match(/^(\d+\. )/)
    view.dispatch({
      changes: match
        ? { from: line.from, to: line.from + match[1].length, insert: '' }
        : { from: line.from, insert: '1. ' },
    })
    view.focus()
    return true
  }
}

function insertTemplate(template: string, selectFrom: number, selectTo: number): Command {
  return (view) => {
    const { from, to } = view.state.selection.main
    view.dispatch({
      changes: { from, to, insert: template },
      selection: EditorSelection.range(from + selectFrom, from + selectTo),
    })
    view.focus()
    return true
  }
}

function insertTable(cols: number, rows: number): Command {
  return (view) => {
    const header = '| ' + Array.from({ length: cols }, (_, i) => `Col ${i + 1}`).join(' | ') + ' |'
    const sep    = '| ' + Array.from({ length: cols }, () => '-----').join(' | ') + ' |'
    const row    = '| ' + Array.from({ length: cols }, () => '     ').join(' | ') + ' |'
    const table  = [header, sep, ...Array.from({ length: rows }, () => row)].join('\n')
    const { from, to } = view.state.selection.main
    const needsBefore = from > 0 && view.state.doc.sliceString(from - 1, from) !== '\n'
    const insert = (needsBefore ? '\n' : '') + table + '\n'
    view.dispatch({
      changes: { from, to, insert },
      selection: EditorSelection.cursor(from + insert.length),
    })
    view.focus()
    return true
  }
}

// ── Button definitions ────────────────────────────────────────────────────────

const TOOLBAR_BUTTONS: ToolbarButton[] = [
  { kind: 'action',   label: 'B',     title: 'Bold',        command: wrapSelection('**') },
  { kind: 'action',   label: 'I',     title: 'Italic',      command: wrapSelection('*') },
  { kind: 'action',   label: '`',     title: 'Inline code', command: wrapSelection('`') },
  {
    kind: 'dropdown', label: 'H', title: 'Heading', separator: true,
    items: [
      { label: 'Heading 1', sub: '#',      command: headingLine(1) },
      { label: 'Heading 2', sub: '##',     command: headingLine(2) },
      { label: 'Heading 3', sub: '###',    command: headingLine(3) },
      { label: 'Heading 4', sub: '####',   command: headingLine(4) },
      { label: 'Heading 5', sub: '#####',  command: headingLine(5) },
      { label: 'Heading 6', sub: '######', command: headingLine(6) },
    ],
  },
  { kind: 'action', label: '"', title: 'Blockquote', command: prefixLine('> ') },
  { kind: 'action', label: '—', title: 'Horizontal rule', command: insertTemplate('\n---\n', 1, 1), separator: true },
  { kind: 'action', label: 'Link',  title: 'Insert link',  command: insertTemplate('[text](url)',  1,  5) },
  { kind: 'action', label: 'Image', title: 'Insert image', command: insertTemplate('![alt](url)', 2, 5) },
  {
    kind: 'dropdown', label: 'List', title: 'List', separator: true,
    items: [
      { label: 'Unordered list', sub: '-',  command: prefixLine('- ') },
      { label: 'Ordered list',   sub: '1.', command: orderedListLine() },
    ],
  },
  { kind: 'tablePicker', label: 'Table', title: 'Insert table' },
]

// ── Dropdown / picker state ───────────────────────────────────────────────────

let activePanel: HTMLElement | null = null

function closeActivePanel() {
  if (!activePanel) return
  activePanel.classList.remove('mdp-fmt-panel--open')
  activePanel.addEventListener('transitionend', () => activePanel?.remove(), { once: true })
  activePanel = null
}

// ── Toolbar builder ───────────────────────────────────────────────────────────

export function buildFormattingToolbar(getView: () => EditorView | null): HTMLElement {
  const bar = document.createElement('div')
  bar.className = 'mdp-fmt-toolbar'
  bar.setAttribute('aria-label', 'Formatting toolbar')

  for (const btn of TOOLBAR_BUTTONS) {
    if (btn.separator) {
      const sep = document.createElement('span')
      sep.className = 'mdp-fmt-sep'
      bar.appendChild(sep)
    }

    if (btn.kind === 'action') {
      const el = document.createElement('button')
      el.className = 'mdp-fmt-btn'
      el.textContent = btn.label
      el.title = btn.title
      el.setAttribute('aria-label', btn.title)
      el.setAttribute('type', 'button')
      el.addEventListener('mousedown', (e) => {
        e.preventDefault()
        closeActivePanel()
        const view = getView()
        if (view) btn.command(view)
      })
      bar.appendChild(el)

    } else if (btn.kind === 'dropdown') {
      const wrap = document.createElement('div')
      wrap.className = 'mdp-fmt-dropdown-wrap'

      const el = document.createElement('button')
      el.className = 'mdp-fmt-btn mdp-fmt-btn--dropdown'
      el.innerHTML = `${btn.label}<span class="mdp-fmt-caret" aria-hidden="true">▾</span>`
      el.title = btn.title
      el.setAttribute('aria-label', btn.title)
      el.setAttribute('type', 'button')

      const panel = document.createElement('div')
      panel.className = 'mdp-fmt-panel'

      for (const item of btn.items) {
        const row = document.createElement('button')
        row.className = 'mdp-fmt-panel__item'
        row.setAttribute('type', 'button')
        row.innerHTML = `<span class="mdp-fmt-panel__label">${item.label}</span>${
          item.sub ? `<span class="mdp-fmt-panel__sub">${item.sub}</span>` : ''
        }`
        row.addEventListener('mousedown', (e) => {
          e.preventDefault()
          closeActivePanel()
          const view = getView()
          if (view) item.command(view)
        })
        panel.appendChild(row)
      }

      el.addEventListener('mousedown', (e) => {
        e.preventDefault()
        if (activePanel === panel) { closeActivePanel(); return }
        closeActivePanel()

        const rect = el.getBoundingClientRect()
        panel.style.left = `${rect.left}px`
        panel.style.top  = `${rect.bottom + 4}px`
        document.body.appendChild(panel)
        void panel.offsetHeight
        panel.classList.add('mdp-fmt-panel--open')
        activePanel = panel
      })

      wrap.appendChild(el)
      bar.appendChild(wrap)

    } else if (btn.kind === 'tablePicker') {
      const wrap = document.createElement('div')
      wrap.className = 'mdp-fmt-dropdown-wrap'

      const el = document.createElement('button')
      el.className = 'mdp-fmt-btn mdp-fmt-btn--dropdown'
      el.innerHTML = `${btn.label}<span class="mdp-fmt-caret" aria-hidden="true">▾</span>`
      el.title = btn.title
      el.setAttribute('aria-label', btn.title)
      el.setAttribute('type', 'button')

      const panel = document.createElement('div')
      panel.className = 'mdp-fmt-panel mdp-fmt-panel--table'

      const COLS = 6, ROWS = 5
      const grid = document.createElement('div')
      grid.className = 'mdp-fmt-table-grid'
      grid.style.gridTemplateColumns = `repeat(${COLS}, 22px)`

      const label = document.createElement('div')
      label.className = 'mdp-fmt-table-label'
      label.textContent = 'Insert table'

      const cells: HTMLElement[][] = []
      for (let r = 0; r < ROWS; r++) {
        cells[r] = []
        for (let c = 0; c < COLS; c++) {
          const cell = document.createElement('div')
          cell.className = 'mdp-fmt-table-cell'
          cell.dataset['row'] = String(r)
          cell.dataset['col'] = String(c)
          cells[r][c] = cell
          grid.appendChild(cell)
        }
      }

      function highlightCells(maxR: number, maxC: number) {
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++)
            cells[r][c].classList.toggle('mdp-fmt-table-cell--active', r <= maxR && c <= maxC)
        label.textContent = `${maxC + 1} × ${maxR + 1} table`
      }

      grid.addEventListener('mouseover', (e) => {
        const cell = (e.target as HTMLElement).closest<HTMLElement>('.mdp-fmt-table-cell')
        if (!cell) return
        highlightCells(parseInt(cell.dataset['row']!), parseInt(cell.dataset['col']!))
      })

      grid.addEventListener('mouseleave', () => {
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++)
            cells[r][c].classList.remove('mdp-fmt-table-cell--active')
        label.textContent = 'Insert table'
      })

      grid.addEventListener('mousedown', (e) => {
        e.preventDefault()
        const cell = (e.target as HTMLElement).closest<HTMLElement>('.mdp-fmt-table-cell')
        if (!cell) return
        const cols = parseInt(cell.dataset['col']!) + 1
        const rows = parseInt(cell.dataset['row']!) + 1
        closeActivePanel()
        const view = getView()
        if (view) insertTable(cols, rows)(view)
      })

      panel.appendChild(grid)
      panel.appendChild(label)

      el.addEventListener('mousedown', (e) => {
        e.preventDefault()
        if (activePanel === panel) { closeActivePanel(); return }
        closeActivePanel()

        const rect = el.getBoundingClientRect()
        panel.style.left = `${rect.left}px`
        panel.style.top  = `${rect.bottom + 4}px`
        document.body.appendChild(panel)
        void panel.offsetHeight
        panel.classList.add('mdp-fmt-panel--open')
        activePanel = panel
      })

      wrap.appendChild(el)
      bar.appendChild(wrap)
    }
  }

  // Close panels when clicking outside the toolbar
  document.addEventListener('mousedown', (e) => {
    if (activePanel && !activePanel.contains(e.target as Node)) {
      closeActivePanel()
    }
  })

  // Keyboard hint (right-aligned)
  const hint = document.createElement('span')
  hint.className = 'mdp-fmt-hint'
  hint.textContent = `${isMac ? '⌘' : 'Ctrl'}+S to save  ·  ? for shortcuts`
  bar.appendChild(hint)

  return bar
}

// ─── Status bar ───────────────────────────────────────────────────────────────

export interface StatusBarController {
  update(view: EditorView, hasUnsaved: boolean): void
  destroy(): void
}

export function buildStatusBar(): { el: HTMLElement; controller: StatusBarController } {
  const el = document.createElement('div')
  el.className = 'mdp-status-bar'

  const posEl = document.createElement('span')
  posEl.className = 'mdp-status-pos'
  posEl.textContent = 'Line 1, Col 1'

  const sep1 = document.createElement('span')
  sep1.className = 'mdp-status-sep'
  sep1.textContent = '·'

  const wordsEl = document.createElement('span')
  wordsEl.className = 'mdp-status-words'
  wordsEl.textContent = '0 words'

  const unsavedEl = document.createElement('span')
  unsavedEl.className = 'mdp-status-unsaved'
  unsavedEl.textContent = '● Unsaved changes'

  el.appendChild(posEl)
  el.appendChild(sep1)
  el.appendChild(wordsEl)
  el.appendChild(unsavedEl)

  const controller: StatusBarController = {
    update(view, hasUnsaved) {
      const head = view.state.selection.main.head
      const line = view.state.doc.lineAt(head)
      posEl.textContent = `Line ${line.number}, Col ${head - line.from + 1}`

      const text = view.state.doc.toString()
      const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length
      wordsEl.textContent = `${wordCount.toLocaleString()} word${wordCount !== 1 ? 's' : ''}`

      unsavedEl.classList.toggle('mdp-status-unsaved--visible', hasUnsaved)
    },
    destroy() {
      el.remove()
    },
  }

  return { el, controller }
}
