# MarkDrive

A Chrome extension that renders Markdown files beautifully inside Google Drive. Open any `.md` file and get a clean reading experience with a full split-pane editor for making changes — all without leaving your browser.

---

## Features

### Viewer

- **Rich Markdown rendering** — full CommonMark support via markdown-it: headings, paragraphs, lists, blockquotes, tables, inline code, fenced code blocks, horizontal rules, and more
- **Syntax highlighting** — 25+ languages via Prism.js with language badge and one-click copy button on every code block
- **Mermaid diagrams** — fenced ` ```mermaid ` blocks render as live SVGs (flowcharts, sequence diagrams, Gantt charts, etc.) — lazy loaded so the initial bundle stays fast
- **YAML frontmatter** — stripped from the rendered output and displayed as a clean metadata card (title, author, date, tags, etc.)
- **Task lists** — GitHub-style `- [ ]` / `- [x]` checkboxes rendered with interactive toggle (see View Actions below)
- **Footnotes** — `[^1]` style footnotes rendered with backlinks
- **Smart typographer** — straight quotes become curly, `--` becomes en-dash, `---` becomes em-dash
- **Auto-linking** — bare URLs are turned into clickable links
- **GitHub-style callouts** — `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, `> [!IMPORTANT]`, `> [!CAUTION]` render as styled callout blocks
- **Image proxying** — Drive-hosted images load correctly through the extension's image proxy
- **Link preview tooltips** — hover any external link to see the destination URL
- **DOMPurify sanitisation** — all rendered HTML is sanitised before injection

### Tables

- **Tall table clamping** — tables taller than ~10 rows are clamped with a gradient fade and a "View full table" button
- **Expand modal** — click "View full table" to open the full table in a scrollable modal overlay with keyboard dismiss
- **Column sorting** — click any column header to sort ascending/descending; click again to cycle; a third click restores original order
- **Pagination** — the modal paginates large tables (50 rows per page) with prev/next controls

### Navigation & Layout

- **Table of contents sidebar** — auto-generated from H1–H4 headings; slides in from the left; highlights the active section as you scroll via `IntersectionObserver`; state persisted across sessions
- **Heading anchors** — every heading gets a hoverable `#` link for deep linking
- **Persistent scroll position** — scroll position is saved per file and restored on re-open
- **Auto-refresh banner** — polls Drive every 45 seconds; if the file changes externally a banner prompts you to reload
- **Reading time badge** — estimated reading time shown in the navbar (optional, toggle in popup)

### View-Mode Quick Actions

Edit without switching to Source mode:

- **Checkbox toggle** — click any `[ ]` or `[x]` task item to flip its state; the change saves automatically with a 1.5 s debounce; animated with a satisfying bounce
- **Smart list → task list** — hover any plain `<ul>` to reveal a subtle `⇌ Task list` badge; click it to prepend `[ ] ` to every item and convert the list in one action
- **Double-click inline edit** — double-click any paragraph, heading, or list item to edit its raw Markdown source in place; a monospace textarea appears pre-filled with the source block; **Esc** cancels, **Ctrl/Cmd+Enter** or clicking away commits; the viewer re-renders immediately

### Source Editor

Switch to **Source** mode for full editing:

- **CodeMirror 6** — battle-tested editor with proper cursor, selection, undo/redo, and keyboard navigation
- **Markdown syntax highlighting** — custom light and dark highlight themes using `@lezer/highlight` tags (headings, links, code, emphasis, blockquotes — all distinct)
- **Split-pane layout** — editor on the left, live preview on the right, scrolling independently
- **Draggable divider** — drag the centre bar to any split ratio; snaps between 30/50/70%; ratio persisted in `sessionStorage`
- **Live preview** — the preview re-renders 250 ms after the last keystroke with a subtle opacity pulse
- **Mermaid lazy re-render** — diagram blocks update 2 s after typing stops to avoid expensive re-renders on every keystroke

### Formatting Toolbar

A fixed toolbar between the navbar and the editor (Source mode only) with one-click Markdown helpers:

| Button | Action |
|--------|--------|
| **B** | Wrap selection in `**bold**` |
| *I* | Wrap in `*italic*` |
| ~~S~~ | Wrap in `~~strikethrough~~` |
| `` ` `` | Wrap in `` `inline code` `` |
| **H ▾** | Dropdown — insert `#` / `##` / `###` / `####` heading prefix |
| `"` | Prefix line with `> ` blockquote |
| `—` | Insert `---` horizontal rule |
| **List ▾** | Dropdown — unordered `- `, ordered `1. `, or task `- [ ] ` list item |
| **Table** | Grid picker (up to 6×6) — inserts a Markdown table scaffold |
| `</>` **▾** | Code block dropdown — inserts a fenced block for 10 common languages (JS, TS, Python, Rust, Go, Bash, JSON, YAML, CSS, HTML) |
| ✕ | Clear formatting — strips `**`, `*`, `` ` ``, `~~` from selection |

All toolbar buttons show fast CSS tooltips (250 ms delay, no browser `title` lag). Heading and list buttons open on hover with a 120 ms close delay so they don't vanish accidentally.

### Save & Conflict Handling

- **Manual save** — Ctrl/Cmd+S or the **Save** button in the navbar
- **Save states** — the button cycles through: `Save` → spinner `Saving…` → `Saved ✓` (fades back to `Save` after 2 s) → `Save failed` (red, persists until next attempt)
- **Primary blue button** — the Save button turns solid blue when there are unsaved changes
- **Unsaved dot** — a faint dot appears next to the filename in the navbar when the document is dirty; clears automatically if you undo back to the saved state
- **Undo-aware dirty tracking** — uses string comparison against the last-saved source, so undo all the way back clears the unsaved indicator without saving
- **Leave guard** — switching from Source to View mode with unsaved changes shows a dialog: **Keep editing** / **Discard** / **Save**
- **Conflict detection** — before every save, Drive metadata is checked; if the file was modified elsewhere since you opened it, a dialog offers: **Save anyway** / **Discard my changes** / **Cancel**
- **Autosave** — optional; saves 30 s after the last keystroke without a conflict check (toggle in popup); shows "Autosaved" briefly
- **Tab close guard** — browser `beforeunload` warning if you try to close the tab with unsaved changes
- **Auto-retry on auth errors** — if a save returns 401/403 the extension re-authenticates silently and retries once

### Find & Replace

- **Ctrl/Cmd+F** — opens the search bar; highlights all matches; navigate with Enter / Shift+Enter or the arrow buttons
- **Ctrl/Cmd+H** — opens search bar in replace mode (also accessible via the `⇌` toggle button)
- **Replace** — swaps the currently highlighted match in the Markdown source and re-renders the viewer
- **Replace All** — replaces every occurrence globally
- Debounced search (120 ms) so highlighting keeps up with fast typing
- Full dark mode support

### Theme System

- **Light / Dark / System** — three-way toggle in the popup; system mode follows `prefers-color-scheme`
- **Manual toggle** — the `☾`/`☀` button in the navbar cycles between light and dark immediately
- All UI elements respect the theme: navbar, editor, toolbar, status bar, TOC, search bar, table modal, dialogs, code blocks
- Theme persisted in `chrome.storage.local` and synced across all open viewer tabs in real time

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `r` | Toggle View / Source mode |
| `t` | Toggle table of contents |
| `Ctrl/Cmd+S` | Save file |
| `Ctrl/Cmd+F` | Open search |
| `Ctrl/Cmd+H` | Open find & replace |
| `/` | Open search |
| `?` | Show / hide shortcuts cheat sheet |
| `Esc` | Close search / overlays |

### Status Bar (Source mode)

A thin bar at the bottom of the screen showing:

- Current line and column number (updates as the cursor moves)
- Word count
- Unsaved changes indicator (amber dot)

---

## Extension Popup

Click the MarkDrive icon in the Chrome toolbar to:

- **Sign in / out** with Google (displays avatar, name, and email when signed in)
- Set **theme**: System / Light / Dark
- Toggle **table of contents** open by default
- Toggle **reading time** badge in the navbar
- Toggle **autosave** while editing

---

## Authentication

MarkDrive uses OAuth 2.0 PKCE via `chrome.identity.launchWebAuthFlow`. The `drive` scope is requested so that the extension can both read and write any file in the user's Drive. The token is stored in `chrome.storage.local` and refreshed automatically on expiry.

---

## Tech Stack

| Layer | Library / API |
|-------|--------------|
| Extension platform | Chrome MV3, CRXJS Vite plugin |
| Build tool | Vite + TypeScript |
| Markdown parsing | markdown-it + markdown-it-task-lists + markdown-it-footnote |
| Syntax highlighting | Prism.js |
| Diagram rendering | Mermaid.js (lazy-loaded) |
| HTML sanitisation | DOMPurify |
| Code editor | CodeMirror 6 (`@codemirror/view`, `@codemirror/state`, `@codemirror/lang-markdown`, `@codemirror/commands`) |
| Syntax highlight tokens | `@lezer/highlight` |
| Drive API | REST v3 (`files.get`, `files.update` PATCH media upload) |

---

## Project Structure

```
src/
├── background.ts        # Service worker — fetch, save, tab management
├── content.ts           # Injected into Drive — detects .md files, injects trigger button
├── observer.ts          # MutationObserver watching Drive for file navigation
├── auth.ts              # OAuth 2.0 PKCE flow, token storage
├── fetcher.ts           # Drive file fetch helpers
├── viewer-page.ts       # Standalone viewer tab — orchestrates all modes
├── renderer.ts          # markdown-it pipeline, frontmatter, callouts, anchors
├── editor.ts            # CodeMirror 6 setup, toolbar, status bar
├── navbar.ts            # Top navigation bar controller
├── toc.ts               # TOC sidebar + IntersectionObserver active tracking
├── search.ts            # Find & replace bar
├── view-actions.ts      # View-mode quick actions (checkbox, smart list, inline edit)
├── keyboard.ts          # Global keyboard shortcut bindings
├── table-features.ts    # Table clamp, sort, pagination
├── table-modal.ts       # Full-table expand modal
├── mermaid-renderer.ts  # Async Mermaid diagram renderer
├── highlighter.ts       # Prism.js wrapper
├── image-proxy.ts       # Drive image URL rewriting
├── popup.ts             # Extension popup UI
├── utils.ts             # Shared utilities (escapeHtml, etc.)
└── styles/
    ├── viewer.css        # All markdown content styles + theme variables
    ├── viewer-page.css   # Page chrome (body, navbar padding, skeleton, banners)
    ├── editor.css        # Split pane, toolbar, status bar, divider
    ├── navbar.css        # Top bar layout and save button states
    ├── toc.css           # Sidebar layout and link styles
    ├── search.css        # Search + replace bar
    ├── shortcuts.css     # Keyboard shortcuts overlay
    ├── table-modal.css   # Full-table modal overlay
    ├── code.css          # Code block chrome (copy button, language badge)
    ├── frontmatter.css   # Frontmatter metadata card
    ├── footnotes.css     # Footnote list styles
    ├── link-preview.css  # Hover URL tooltip
    ├── image.css         # Image rendering
    └── trigger.css       # "Open in MarkDrive" button injected into Drive
```

---

## Development

```bash
pnpm install
pnpm dev       # Vite dev server with HMR (CRXJS handles extension reloading)
pnpm build     # Production build → dist/
pnpm type-check
```

Load the unpacked extension from `dist/` in `chrome://extensions` with Developer Mode on.

---

## Permissions

| Permission | Reason |
|------------|--------|
| `storage` | Persist theme, TOC state, auth token, scroll position |
| `identity` | OAuth 2.0 Google sign-in |
| `tabs` | Switch back to the Drive tab after closing the viewer |
| `https://drive.google.com/*` | Inject the trigger button into Drive |
| `https://www.googleapis.com/*` | Drive API calls (fetch file content, save, check modified time) |
