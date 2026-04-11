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

interface ToolbarButton {
  label: string
  title: string
  command: Command
  separator?: boolean
}

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

const TOOLBAR_BUTTONS: ToolbarButton[] = [
  {
    label: 'B',
    title: 'Bold (wrap in **)',
    command: wrapSelection('**'),
  },
  {
    label: 'I',
    title: 'Italic (wrap in *)',
    command: wrapSelection('*'),
  },
  {
    label: '`',
    title: 'Inline code',
    command: wrapSelection('`'),
  },
  {
    label: 'H',
    title: 'Heading (prefix ##)',
    command: prefixLine('## '),
    separator: true,
  },
  {
    label: '"',
    title: 'Blockquote (prefix >)',
    command: prefixLine('> '),
  },
  {
    label: '—',
    title: 'Horizontal rule',
    command: insertTemplate('\n---\n', 1, 1),
    separator: true,
  },
  {
    label: 'Link',
    title: 'Insert link',
    command: insertTemplate('[text](url)', 1, 5),
  },
  {
    label: 'Image',
    title: 'Insert image',
    command: insertTemplate('![alt](url)', 2, 5),
  },
  {
    label: 'List',
    title: 'Unordered list item',
    command: prefixLine('- '),
  },
]

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

    const el = document.createElement('button')
    el.className = 'mdp-fmt-btn'
    el.textContent = btn.label
    el.title = btn.title
    el.setAttribute('aria-label', btn.title)
    el.setAttribute('type', 'button')
    el.addEventListener('mousedown', (e) => {
      // Prevent focus leaving the editor
      e.preventDefault()
      const view = getView()
      if (view) btn.command(view)
    })
    bar.appendChild(el)
  }

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
