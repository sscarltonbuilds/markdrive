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
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
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
}

// ─── Syntax highlight styles ─────────────────────────────────────────────────
// One per theme — defaultHighlightStyle colours are designed for white backgrounds.

const LIGHT_HL = HighlightStyle.define([
  { tag: [tags.heading1, tags.heading2, tags.heading3,
          tags.heading4,  tags.heading5, tags.heading6],
    color: '#111', fontWeight: '600' },
  { tag: tags.heading1, fontSize: '1.1em' },
  { tag: tags.heading2, fontSize: '1.04em' },
  { tag: [tags.link, tags.url],   color: '#1a73e8' },
  { tag: tags.emphasis,            fontStyle: 'italic', color: '#333' },
  { tag: tags.strong,              fontWeight: '700',   color: '#111' },
  { tag: tags.monospace,           color: '#c0392b',
    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace" },
  { tag: tags.quote,               color: '#555', fontStyle: 'italic' },
  { tag: [tags.meta, tags.comment, tags.processingInstruction], color: '#999' },
  { tag: tags.punctuation,         color: '#aaa' },
  { tag: tags.invalid,             color: '#dc2626' },
])

const DARK_HL = HighlightStyle.define([
  { tag: [tags.heading1, tags.heading2, tags.heading3,
          tags.heading4,  tags.heading5, tags.heading6],
    color: '#e2e8f0', fontWeight: '600' },
  { tag: tags.heading1, fontSize: '1.1em' },
  { tag: tags.heading2, fontSize: '1.04em' },
  { tag: [tags.link, tags.url],   color: '#7db5f7' },
  { tag: tags.emphasis,            fontStyle: 'italic', color: '#c8c8c8' },
  { tag: tags.strong,              fontWeight: '700',   color: '#e8e8e8' },
  { tag: tags.monospace,           color: '#f08080',
    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace" },
  { tag: tags.quote,               color: '#8b9bb4', fontStyle: 'italic' },
  { tag: [tags.meta, tags.comment, tags.processingInstruction], color: '#6b7280' },
  { tag: tags.punctuation,         color: '#555' },
  { tag: tags.invalid,             color: '#f87171' },
])

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
  let currentTheme = opts.theme

  function buildExtensions(theme: 'light' | 'dark') {
    return [
      history(),
      EditorView.lineWrapping,
      markdown({ base: commonmarkLanguage }),
      syntaxHighlighting(theme === 'dark' ? DARK_HL : LIGHT_HL, { fallback: true }),
      buildCmTheme(theme),
      keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (!update.docChanged) return
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

function insertCodeBlock(lang: string): Command {
  return (view) => {
    const { from, to } = view.state.selection.main
    const selected = view.state.sliceDoc(from, to)
    const needsBefore = from > 0 && view.state.doc.sliceString(from - 1, from) !== '\n'
    const fence = `\`\`\`${lang}\n${selected}\n\`\`\``
    const insert = (needsBefore ? '\n' : '') + fence + '\n'
    // Place cursor on the blank line inside the fence if no selection
    const innerStart = from + (needsBefore ? 1 : 0) + lang.length + 4
    view.dispatch({
      changes: { from, to, insert },
      selection: EditorSelection.cursor(selected ? from + insert.length - 4 : innerStart),
    })
    view.focus()
    return true
  }
}

function clearFormatting(): Command {
  return (view) => {
    const { from, to } = view.state.selection.main
    if (from === to) return false
    const selected = view.state.sliceDoc(from, to)
    const cleaned = selected
      .replace(/\*\*(.+?)\*\*/gs, '$1')
      .replace(/\*(.+?)\*/gs,     '$1')
      .replace(/~~(.+?)~~/gs,     '$1')
      .replace(/`(.+?)`/gs,       '$1')
      .replace(/__(.+?)__/gs,     '$1')
      .replace(/_(.+?)_/gs,       '$1')
    if (cleaned === selected) return false
    view.dispatch({
      changes: { from, to, insert: cleaned },
      selection: EditorSelection.range(from, from + cleaned.length),
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
  { kind: 'action', label: 'B',  title: 'Bold',          command: wrapSelection('**') },
  { kind: 'action', label: 'I',  title: 'Italic',         command: wrapSelection('*') },
  { kind: 'action', label: 'S',  title: 'Strikethrough',  command: wrapSelection('~~') },
  { kind: 'action', label: '`',  title: 'Inline code',    command: wrapSelection('`') },
  { kind: 'action', label: '✕',  title: 'Clear formatting (requires selection)', command: clearFormatting(), separator: true },
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
  { kind: 'action', label: '"',  title: 'Blockquote',     command: prefixLine('> ') },
  { kind: 'action', label: '—',  title: 'Horizontal rule', command: insertTemplate('\n---\n', 1, 1), separator: true },
  { kind: 'action', label: 'Link',  title: 'Insert link',  command: insertTemplate('[text](url)',  1,  5) },
  { kind: 'action', label: 'Image', title: 'Insert image', command: insertTemplate('![alt](url)', 2, 5) },
  {
    kind: 'dropdown', label: 'List', title: 'List', separator: true,
    items: [
      { label: 'Unordered list', sub: '-',   command: prefixLine('- ')      },
      { label: 'Ordered list',   sub: '1.',  command: orderedListLine()      },
      { label: 'Task item',      sub: '[ ]', command: prefixLine('- [ ] ')  },
    ],
  },
  {
    kind: 'dropdown', label: '</>',  title: 'Code block', separator: true,
    items: [
      { label: 'Plain',       sub: '```',    command: insertCodeBlock('')         },
      { label: 'JavaScript',  sub: 'js',     command: insertCodeBlock('js')       },
      { label: 'TypeScript',  sub: 'ts',     command: insertCodeBlock('ts')       },
      { label: 'Python',      sub: 'py',     command: insertCodeBlock('python')   },
      { label: 'Bash / Shell', sub: 'sh',    command: insertCodeBlock('bash')     },
      { label: 'JSON',        sub: 'json',   command: insertCodeBlock('json')     },
      { label: 'SQL',         sub: 'sql',    command: insertCodeBlock('sql')      },
      { label: 'CSS',         sub: 'css',    command: insertCodeBlock('css')      },
      { label: 'HTML',        sub: 'html',   command: insertCodeBlock('html')     },
      { label: 'Markdown',    sub: 'md',     command: insertCodeBlock('markdown') },
    ],
  },
  { kind: 'tablePicker', label: 'Table', title: 'Insert table' },
]

// ── Dropdown / picker state ───────────────────────────────────────────────────

let activePanel: HTMLElement | null = null
let hoverCloseTimer: ReturnType<typeof setTimeout> | null = null

function cancelHoverClose() {
  if (hoverCloseTimer) { clearTimeout(hoverCloseTimer); hoverCloseTimer = null }
}

function scheduleHoverClose() {
  cancelHoverClose()
  hoverCloseTimer = setTimeout(() => { closeActivePanel(); hoverCloseTimer = null }, 120)
}

function closeActivePanel() {
  if (!activePanel) return
  const closing = activePanel   // capture — activePanel may change before transitionend
  activePanel = null
  closing.classList.remove('mdp-fmt-panel--open')
  const cleanup = () => { if (!closing.classList.contains('mdp-fmt-panel--open')) closing.remove() }
  closing.addEventListener('transitionend', cleanup, { once: true })
  setTimeout(cleanup, 200)
}

function openPanelFor(triggerEl: HTMLElement, panel: HTMLElement) {
  cancelHoverClose()
  if (activePanel === panel) return
  closeActivePanel()
  const rect = triggerEl.getBoundingClientRect()
  panel.style.left = `${rect.left}px`
  panel.style.top  = `${rect.bottom + 4}px`
  document.body.appendChild(panel)
  void panel.offsetHeight
  panel.classList.add('mdp-fmt-panel--open')
  activePanel = panel
}

function attachHover(el: HTMLElement, panel: HTMLElement) {
  el.addEventListener('mouseenter', () => openPanelFor(el, panel))
  el.addEventListener('mouseleave', scheduleHoverClose)
  panel.addEventListener('mouseenter', cancelHoverClose)
  panel.addEventListener('mouseleave', scheduleHoverClose)
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
      el.dataset.tooltip = btn.title
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
      el.innerHTML = `${btn.label}<svg class="mdp-fmt-caret" width="8" height="5" viewBox="0 0 8 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1,1 4,4 7,1"/></svg>`
      el.dataset.tooltip = btn.title
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
        e.stopPropagation()
        if (activePanel === panel) { closeActivePanel(); return }
        openPanelFor(el, panel)
      })
      attachHover(el, panel)

      wrap.appendChild(el)
      bar.appendChild(wrap)

    } else if (btn.kind === 'tablePicker') {
      const wrap = document.createElement('div')
      wrap.className = 'mdp-fmt-dropdown-wrap'

      const el = document.createElement('button')
      el.className = 'mdp-fmt-btn mdp-fmt-btn--dropdown'
      el.innerHTML = `${btn.label}<svg class="mdp-fmt-caret" width="8" height="5" viewBox="0 0 8 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1,1 4,4 7,1"/></svg>`
      el.dataset.tooltip = btn.title
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
        e.stopPropagation()
        if (activePanel === panel) { closeActivePanel(); return }
        openPanelFor(el, panel)
      })
      attachHover(el, panel)

      wrap.appendChild(el)
      bar.appendChild(wrap)
    }
  }

  // Close panel when clicking anywhere outside it (button clicks are stopped before reaching here)
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
