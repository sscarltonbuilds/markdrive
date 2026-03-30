# MarkDrive — Project Reference

> Chrome extension that renders `.md` files beautifully inside Google Drive's preview pane.  
> Built for non-technical teammates first. Zero configuration. Elegant by default.

---

## Table of Contents

1. [Context & Decision](#1-context--decision)
2. [Competitive Landscape](#2-competitive-landscape)
3. [Architecture Decision: Chrome Extension vs Drive Add-on](#3-architecture-decision-chrome-extension-vs-drive-add-on)
4. [Product Concept](#4-product-concept)
5. [Roadmap](#5-roadmap)
6. [Tech Stack](#6-tech-stack)
7. [Module Build Plan](#7-module-build-plan)
8. [Development Setup](#8-development-setup)
9. [Critical Implementation Notes](#9-critical-implementation-notes)
10. [UX Principles](#10-ux-principles)

---

## 1. Context & Decision

### Problem

The Tunga team increasingly produces and shares `.md` files since moving to Claude. Google Drive shows raw Markdown as plaintext — no rendering, no formatting, no readability for non-technical teammates.

### Recommendation: Build

The market for Markdown rendering *inside* Google Drive is effectively empty. No production-ready tool renders `.md` files within Drive's own preview pane. The closest competitors either:

- Open files in a separate tab on an external domain
- Require multi-step technical setup
- Have poor reliability (OAuth bugs, loading failures)
- Have developer-oriented typography that excludes non-technical users

Google has confirmed it won't solve this natively. The engineer who built Google Docs' Markdown import/export (Tomer Aberbach) explicitly stated: *"This feature doesn't affect the preview. We don't convert a Markdown file to a Doc unless a user initiates it."* Google has strategic disincentive — native Markdown support reduces lock-in to Google Docs.

**Demand signal:** A July 2024 Hacker News thread about Google adding Markdown support received 652 upvotes and 135 comments. Users were still disappointed because Drive preview remained unaffected.

---

## 2. Competitive Landscape

### Chrome Extensions (general Markdown viewers)

| Tool | Users | Rating | Drive integration |
|------|-------|--------|-------------------|
| Markdown Viewer (simov) | 300K | 4.3★ | None |
| Markdown Preview Plus | 90K | 4.1★ | None |
| Markdown Reader | 80K | 4.6★ | None |
| MarkView | 8K | 5.0★ | None |

All four are capable renderers — but they only work on `file://` or `https://` URLs. Users must **download the file from Drive first**. None modifies the Drive interface.

### Google Workspace Marketplace apps

| Tool | Integration | Problem |
|------|-------------|---------|
| Markdown Viewer and Editor | "Open with" handler | Opens on external domain (`herokuapp.com`). Multi-account OAuth bugs. |
| Markee Markdown Editor | "Open with" handler | Cleaner UI but same reliability complaints. |
| StackEdit | Drive sync | Hides files in App Data folder — authoring tool, not a viewer. |
| MarkDrive (new) | "Open with" handler | Still opens in a separate tab, not inside Drive's pane. |

### Conversion tools (different problem)

| Tool | Installs | Notes |
|------|----------|-------|
| Docs to Markdown | 1M+ | Exports Google Docs → Markdown. Works well. Wrong direction. |
| Docs to Markdown Pro | 36K+ | $29/year. 4.9★. Bidirectional + Git publishing. |
| GdocifyMd | Growing | Imports Markdown → Google Doc. Popular for LLM output. |

Conversion tools destroy the original `.md` file and produce a lossy Google Doc. Not the same as rendering.

### The gap

The only project attempting to inject into Drive's actual preview pane — `google-drive-markdown-preview` by sirkitree on GitHub — has 1 star, 0 forks, and 1 commit. Unpublished proof-of-concept.

### Key gaps identified

1. **No tool renders inside Drive's preview pane** — the fundamental missing piece
2. **Zero-config doesn't exist** — every tool requires multi-step setup
3. **Typography is an afterthought** — all tools default to developer-oriented GitHub styling
4. **No AI integration** — no tool connects Markdown viewing with Claude or similar
5. **Reliability is poor** — OAuth bugs, loading spinners that never resolve

---

## 3. Architecture Decision: Chrome Extension vs Drive Add-on

**Decision: Chrome Extension (MV3)**

### Why not a Drive add-on

Drive add-ons can only register as "Open with" handlers. This means:

- User must right-click → "Open with" → select the app
- App opens in a **separate tab on your domain** — not inside Drive's preview pane
- There is no API for add-ons to inject into Drive's native preview container
- Multi-account OAuth bug (#69270374) breaks many Drive add-ons — known Google platform issue with no fix

Every Workspace Marketplace Markdown app works this way. Reviewers consistently complain about it.

### Why Chrome extension wins

A content script running on `drive.google.com` can:

- Intercept Drive's DOM
- Detect when a `.md` file is being previewed
- Fetch its content via Drive API
- Render it with `markdown-it`
- Inject the result directly into the existing preview container

The user clicks a `.md` file and sees rendered Markdown — **no new tab, no menu, no friction**.

### Additional advantages

- Chrome Web Store install is one click (vs Workspace Marketplace admin approval)
- Updates ship in hours (vs days for Marketplace review)
- No multi-account OAuth issues
- Team is already on Chrome

---

## 4. Product Concept

### Target users

**Primary:** Non-technical teammates who encounter `.md` files in shared Google Drive folders — product managers reading specs, designers reviewing documentation, executives opening project READMEs.

**Secondary:** Developers and technical writers who want their Markdown documents accessible to everyone without conversion.

### Core use cases

1. **Previewing documentation** — project specs, meeting notes, wikis stored in shared Drive folders
2. **Reading AI output** — users saving Claude/ChatGPT/Gemini responses as `.md` files to Drive
3. **Cross-tool workflows** — teams maintaining docs in Markdown (for GitHub, MkDocs, static sites) while collaborating in Google Workspace

### Addressable market

- Google Drive has 2+ billion monthly users
- Existing Markdown viewer extensions collectively serve ~480K users with no Drive integration
- Obsidian-to-Google-Drive sync alone creates millions of `.md` files in Drive
- AI-generated Markdown output is the fastest-growing source of `.md` files in Drive

---

## 5. Roadmap

### Phase 0 — Foundation (Weeks 1–2)

Technical spike: confirm content script can intercept Drive's preview DOM and inject rendered HTML. If Drive's DOM is too brittle, architecture switches to a sidebar panel.

**Gate:** Rendered `.md` file appears inside Drive's preview pane.

### Phase 1 — MVP: Core Rendering (Weeks 3–6)

The one job: open a `.md` file in Drive → see rendered Markdown, automatically, with no setup.

- Auto-detection of `.md` files
- GFM support (headings, lists, tables, code, blockquotes, task lists)
- Raw ↔ Rendered toggle
- Beautiful default typography
- Published to Chrome Web Store (unlisted)

**Gate:** 3 non-technical team members install and read a `.md` file without asking a question.

### Phase 2 — Polish: Rich Rendering & Design (Weeks 7–9)

- Syntax highlighting (Prism.js, 20+ languages)
- Mermaid.js diagram rendering
- Dark mode (system preference)
- Typographic refinement
- Copy-to-clipboard on code blocks
- Public Chrome Web Store listing

**Gate:** First 50 installs. At least 1 positive review from outside Tunga.

### Phase 3 — AI Layer: Claude Integration (Weeks 10–13)

- "Ask Claude" button on rendered `.md` files
- One-click summarization
- Key points extraction
- "Explain in plain English" for technical specs
- User brings own Claude API key (keeps extension free)
- Optional Pro tier with managed key ($4/month)

**Gate:** AI features used by ≥50% of weekly active users within 2 weeks of launch.

### Phase 4 — Scale (Week 14+)

- Google Workspace admin console deployment
- PDF export
- Custom themes / org-level branding
- Open source decision: open-source renderer to drive adoption, monetize AI features only

---

## 6. Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Manifest | MV3 | Required by Chrome; content scripts still work fully |
| Build tool | Vite + CRXJS | Hot reload for content scripts during dev |
| Language | TypeScript (strict) | No `any`. Catches DOM selector issues early. |
| Package manager | pnpm | Faster installs, better monorepo support |
| Markdown parser | markdown-it | Pluggable, well-maintained, GFM-compatible |
| Syntax highlight | Prism.js (bundled) | Lightweight, no CDN needed, tree-shakeable |
| Diagrams | Mermaid.js | Industry standard for flowcharts in Markdown |
| Sanitization | DOMPurify | Required before any innerHTML injection |
| AI | Claude API (user key) | Native to team's workflow; streaming support |

---

## 7. Module Build Plan

Each module must pass its gate before the next begins. One commit per gate.

### Module 00 — Project Scaffold (~1–2 hrs)

**Scope:** Directory structure, manifest, Vite config, TypeScript setup. Zero product logic.

Files to create:
```
markdrive/
├── src/
│   ├── content.ts        ← stub: logs one message
│   ├── background.ts     ← stub: empty service worker
│   └── styles/
│       └── viewer.css    ← empty
├── manifest.json
├── vite.config.ts
├── tsconfig.json
└── package.json
```

`manifest.json` permissions:
```json
{
  "manifest_version": 3,
  "name": "MarkDrive",
  "version": "0.1.0",
  "permissions": ["storage"],
  "host_permissions": [
    "https://drive.google.com/*",
    "https://www.googleapis.com/*"
  ],
  "content_scripts": [{
    "matches": ["https://drive.google.com/*"],
    "js": ["src/content.ts"],
    "run_at": "document_idle"
  }],
  "background": { "service_worker": "src/background.ts" },
  "action": { "default_popup": "popup.html" }
}
```

> ⚠️ Do not add `identity`, `tabs`, OAuth, or any Markdown libraries in this module.

**Gate:** Load `dist/` as unpacked extension. Open Drive. Stub log message appears in DevTools console. `pnpm build` produces zero TypeScript errors.

---

### Module 01 — Drive File Detection (~3–4 hrs)

**Scope:** Detect when a `.md` file is open in Drive's preview. No rendering yet.

> ⚠️ **Riskiest module.** Drive is a React/Angular SPA — the DOM mutates constantly. Use a `MutationObserver` on `document.body`. If the injection point cannot be found reliably across 5 test files, stop and report before continuing.

Files to create:
- `src/observer.ts` — `DriveObserver` class with `MutationObserver`
- `src/types.ts` — shared TypeScript interfaces
- Update `src/content.ts` to instantiate DriveObserver and log detected events

Key interface:
```typescript
export interface MarkdownFileDetected {
  fileId: string;
  fileName: string;
  previewContainer: HTMLElement;
}
```

URL patterns to handle:
- `https://drive.google.com/file/d/FILE_ID/view`
- `https://drive.google.com/open?id=FILE_ID`
- Drive folder view with preview pane open

> ⚠️ **Finding the preview container:** Open a plain `.txt` file in Drive. Open DevTools. Right-click the raw text → Inspect. Target stable attributes (`aria-*`, `role`, `data-*`). Do NOT target by class name — Drive minifies class names and they change on deploy.

**Gate:** Open 5 different `.md` files in Drive (via direct URL and folder browse). Each time confirm a `MarkdownFileDetected` event logs to console with correct `fileId` and `previewContainer` reference.

---

### Module 02 — File Content Fetching (~2–3 hrs)

**Scope:** Retrieve raw Markdown text for any detected `.md` file.

**Strategy A (try first):** Read raw text already in the preview container's DOM. If Drive renders file content in a `<pre>` or similar, extract directly — no API call needed.

**Strategy B (fallback):** Use Google Drive API.
```typescript
async function fetchFileContent(fileId: string): Promise<string> {
  const token = await getAuthToken(); // chrome.identity.getAuthToken
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Drive API ${res.status}`);
  return res.text();
}
```

If Strategy B is needed, add to `manifest.json`:
- `"identity"` to permissions
- `oauth2` block with `client_id` and scope `https://www.googleapis.com/auth/drive.readonly`

Files to create:
- `src/fetcher.ts` — exported `fetchMarkdownContent(fileId: string): Promise<string>`
- Update `src/content.ts` to call fetcher and log first 200 chars

**Gate:** Console shows first 200 characters of raw Markdown source (not rendered HTML) for a file containing headings, code blocks, and a table.

---

### Module 03 — Markdown Rendering & Injection (~3–4 hrs)

**Scope:** Parse Markdown and replace Drive's preview with rendered HTML.

Install:
```bash
pnpm add markdown-it markdown-it-task-lists dompurify
pnpm add -D @types/markdown-it @types/dompurify
```

Configure:
```typescript
import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import DOMPurify from 'dompurify'

const md = new MarkdownIt({
  html: false,      // never allow raw HTML passthrough
  linkify: true,
  typographer: true
}).use(taskLists);
```

Injection approach:
```typescript
function inject(container: HTMLElement, markdownSource: string) {
  const rawHtml = md.render(markdownSource);
  const clean = DOMPurify.sanitize(rawHtml); // always sanitize

  const viewer = document.createElement('div');
  viewer.className = 'markdrive-viewer';
  viewer.innerHTML = clean;

  container.innerHTML = ''; // clear raw text
  container.appendChild(viewer);
}
```

> ⚠️ **Do NOT replace the preview container itself.** Clear its children and inject inside it. This preserves Drive's outer layout and scroll behaviour.

> ⚠️ **Always run DOMPurify.** Even with `html: false`, always sanitize. The extension runs on every Drive file the user opens — a malicious `.md` file could contain XSS.

Files to create:
- `src/renderer.ts` — `renderMarkdown()` and `injectIntoPreview()`
- Update `src/content.ts` to wire detection → fetch → render

**Gate:** Open a `.md` file with headings (H1–H4), a table, task list, inline code, code block, and blockquote. All render correctly. Drive's navigation (breadcrumbs, sidebar, share button) remains functional.

---

### Module 04 — Typography & Base Styling (~3–4 hrs)

**Scope:** Make the rendered output genuinely pleasant to read. This is the main differentiator.

Design targets:
- Reading width: 720px max, centered
- Body: 16px, line-height 1.75
- Headings: clear hierarchy, bottom border on H1/H2
- Tables: borders, alternating row shading
- Code: monospace, 14px, background fill
- All styles scoped to `.markdrive-viewer` — never leak into Drive's UI

CSS structure:
```css
/* src/styles/viewer.css */
.markdrive-viewer {
  all: revert;                   /* reset Drive inheritance */
  font-family: 'Georgia', serif; /* editorial, not developer */
  font-size: 16px;
  line-height: 1.75;
  color: #212529;
  max-width: 720px;
  margin: 0 auto;
  padding: 32px 24px 64px;
  box-sizing: border-box;
}

/* All selectors MUST be scoped */
.markdrive-viewer h1 { ... }
.markdrive-viewer table { ... }
.markdrive-viewer code { ... }
```

Files to create:
- `src/styles/viewer.css` — all viewer styles, fully scoped
- Update `src/renderer.ts` to inject stylesheet link into `<head>` on first render

**Gate:** Show rendered output to one non-technical team member. They should read and understand a document without any instruction. Drive's own UI elements look completely unaffected. Save a before/after screenshot as `docs/typography-gate.png`.

---

### Module 05 — Raw / Rendered Toggle (~2 hrs)

**Scope:** Single button to switch between rendered view and raw Markdown source.

- Floating toolbar injected at top-right of preview container (not over Drive's own buttons)
- "Source" / "Rendered" toggle — one button
- Raw mode shows pre-formatted text, monospaced
- State persisted in `chrome.storage.local`
- Use `position: absolute` inside the container — **never `position: fixed`**

Files to create:
- `src/toolbar.ts` — `createToolbar(container, rawSource, onToggle)`
- `src/styles/toolbar.css` — scoped to `.markdrive-toolbar`
- Update `src/content.ts` to wire toolbar after rendering

**Gate:** Default view is rendered. Toggle works. State survives navigation. Toolbar doesn't overlap any Drive UI element at 1280×800 and 1920×1080.

---

### Module 06 — Syntax Highlighting (~2–3 hrs)

**Scope:** Colour-coded code blocks via Prism.js (bundled, not CDN).

Install:
```bash
pnpm add prismjs
pnpm add -D @types/prismjs
```

> ⚠️ Import only the languages you need. Do NOT `import 'prismjs/components'` — this adds ~500KB.

20 bundled languages (start here):
JavaScript, TypeScript, Python, Bash/Shell, JSON, YAML, SQL, HTML, CSS, Markdown, Java, Go, Rust, PHP, Ruby, C, C++, Swift, Kotlin, Dockerfile

Features:
- Syntax highlighting at parse time via `markdown-it`'s `highlight` option
- Copy-to-clipboard button on each code block
- Language badge (e.g. "typescript") top-right of each block

Files to create:
- `src/highlighter.ts` — Prism setup and highlight function
- `src/styles/code.css` — code block styling + copy button
- Update `src/renderer.ts` to pass highlight function to markdown-it

**Gate:** TypeScript, Python, and Bash blocks all render with distinct syntax colouring. Copy button works. Total extension bundle < 800KB (`pnpm build --report`).

---

### Module 07 — Claude AI Integration (~4–5 hrs)

**Scope:** Summarize, extract key points, and explain technical docs in plain English.

Architecture:
- User stores Claude API key in extension popup (`popup.html`) → saved to `chrome.storage.local`
- "Ask Claude" button appears in toolbar when API key is set
- Clicking opens a slide-in panel (not a modal) on the right side of the preview
- API calls go from content script → background service worker → `api.anthropic.com` (avoids CORS)
- Responses stream via `ReadableStream`

Message flow:
```typescript
// content.ts → background.ts
chrome.runtime.sendMessage({
  type: 'CLAUDE_REQUEST',
  payload: {
    action: 'summarize', // | 'keypoints' | 'explain'
    content: markdownSource,
    apiKey: storedKey
  }
});

// Model: claude-sonnet-4-6 (hardcoded — never let users change this)
// Max tokens: 1024 for summary, 512 for key points
```

Three prompts:

| Action | Output |
|--------|--------|
| **Summarize** | 2–3 sentence TL;DR. What the doc is, what it covers, who it's for. No bullets. |
| **Key Points** | 5–7 bullets covering most important decisions, requirements, or facts. |
| **Explain Simply** | Re-explain for a non-technical reader. No jargon. Concrete analogies. Short paragraph. |

> ⚠️ **Privacy notice required.** Display a one-time notice the first time a user triggers an AI action: *"This document's content will be sent to Anthropic's API to generate a response."* Store acknowledgement in `chrome.storage.local`. Never send content without this being stored.

> ⚠️ **API key security.** Key must never appear in console logs, network tab payloads, or error messages. Test with an invalid key — must show a clear error, not crash.

Files to create:
- `popup.html` + `src/popup.ts` — API key input, save, clear
- `src/ai-panel.ts` — panel UI, action buttons, streaming display
- `src/styles/ai-panel.css`
- Update `src/background.ts` — handle `CLAUDE_REQUEST`, call Anthropic, stream response back

**Gate:** All three AI actions return accurate results on a real project spec. Streaming is visible. API key never exposed. Invalid key shows a clear error message.

---

## 8. Development Setup

### Prerequisites

- macOS
- Node.js + npm (already installed)
- Git (already installed)
- Claude Code CLI (separate from Claude desktop app)

### Step 1 — Install pnpm

```bash
npm install -g pnpm
```

### Step 2 — Install Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

### Step 3 — Create the project

```bash
mkdir ~/Desktop/markdrive
cd ~/Desktop/markdrive
git init
```

### Step 4 — Set your Anthropic API key

```bash
export ANTHROPIC_API_KEY=your_key_here
```

To make it permanent, add to `~/.zshrc`:
```bash
echo 'export ANTHROPIC_API_KEY=your_key_here' >> ~/.zshrc
source ~/.zshrc
```

### Step 5 — Launch Claude Code

```bash
claude
```

Log in with your Anthropic account credentials (same as claude.ai) on first run.

### Step 6 — Load the extension in Chrome

After `pnpm build`:

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select `~/Desktop/markdrive/dist`

Reload the same folder after every build — no need to re-add it.

### Handing modules to Claude Code

Paste one module prompt at a time. Do not ask Claude Code to work ahead. Example:

> You are building a Chrome extension called MarkDrive. Work through Module 00 only: scaffold the project with Vite + CRXJS, TypeScript strict mode, and a stub content script that logs to console. Use pnpm. Create the exact directory structure from the plan. Do not install any Markdown libraries yet. Stop when the gate condition is met: `pnpm build` produces zero TypeScript errors and the extension loads in Chrome.

### Commit strategy

One commit per gate:
```bash
git commit -m "Module 00: scaffold — gate passed"
git commit -m "Module 01: drive detection — gate passed"
# etc.
```

---

## 9. Critical Implementation Notes

### Drive DOM is a moving target

Drive is a React/Angular SPA. The DOM mutates constantly. The preview container may not exist on page load. Always:

- Use `MutationObserver` on `document.body`
- Re-check on every relevant mutation
- Target by `aria-*` attributes or structural position — **never by class name** (Drive minifies these)
- If the injection point breaks after a Chrome/Drive update, the selector in `observer.ts` is the first place to look

### Never replace the preview container

Clear its children and inject inside it. Replacing the container breaks Drive's outer layout.

### DOMPurify is non-negotiable

Always sanitize before `innerHTML` injection, even with `html: false` in markdown-it.

### No CDN in the final extension

All libraries must be bundled. External CDN requests are blocked by Chrome's CSP in extensions and create privacy/reliability issues.

### Bundle size budget

Target < 800KB total. Check with `pnpm build --report`. The main risks are Prism.js (import only needed languages) and Mermaid.js (lazy load if needed).

### Toolbar positioning

Use `position: absolute` inside the preview container. Never `position: fixed` — Drive has its own fixed-position elements and z-index conflicts are hard to debug.

### TypeScript strict mode

`tsconfig.json` must have `strict: true`. No `any`. DOM selector results must be null-checked before use — Drive's DOM can change between observer callbacks.

### API key handling

- Store in `chrome.storage.local` only (never `chrome.storage.sync` — don't sync across devices)
- Never log, never include in error messages
- Pass through background service worker to avoid exposing in content script network requests

---

## 10. UX Principles

### Invisible by default

The extension must feel like Drive learned to render Markdown natively. No onboarding screen, no setup wizard, no configuration. A teammate opens a `.md` file and it just looks right.

**Test:** If a non-technical user has to ask a single question to get it working, it's not ready to ship.

### Typography first

The rendered output should feel like a document, not a developer tool. Every pixel should demonstrate care:

- Proportional fonts for prose, monospace for code
- Generous whitespace and comfortable line lengths (65–75 characters)
- Tasteful heading hierarchy
- Clean table rendering

Inspiration: iA Writer + Notion — not GitHub's developer styling.

### Progressive disclosure

Power features (AI panel, raw toggle, export) appear only when needed — tucked behind a minimal toolbar that shows on hover. Default view is clean and uncluttered.

### Non-technical users are the target

Every design and UX decision should be validated against someone who is not comfortable reading raw Markdown. If they make a face at the rendered output, keep iterating.

---

*Last updated: March 2026*  
*Status: Pre-development — Module 00 not yet started*
