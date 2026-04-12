# Markdrive — Chrome Web Store Publish Prep

---

## Store Copy

### Short Description
*(132 character limit — use this exactly)*

```
Google Drive shows .md files as raw text. Markdrive opens them rendered — with syntax highlighting, TOC, and dark mode.
```
**118 characters** ✓

---

### Long Description
*(Chrome Web Store detailed description — paste as-is)*

```
Google Drive treats .md files like plain text. Open a README or a doc and you get a wall of asterisks, hashes, and backticks. That's not how markdown was meant to be read.

Markdrive fixes that.

Click the Markdrive button on any .md file in Google Drive and it opens in a clean, rendered view — in a new tab. No configuration, no extra apps.

What you get:
– Proper markdown rendering with full formatting
– Syntax highlighting for code blocks
– Auto-generated table of contents for easy navigation
– Dark mode support
– Works on any .md file in your Google Drive

How it works:
Open any .md file in Google Drive. Click the Markdrive button. The file opens in a new tab, readable and formatted the way it should be.

That's it. Free, no account needed, no data stored or sent anywhere.
```

---

### Promotional Tile Text
*(For the 440×280 small tile — short headline + subhead)*

**Headline:** Read markdown in Google Drive
**Subhead:** Rendered. Clean. Free.

---

## Screenshot Shot List

Chrome Web Store allows up to **5 screenshots at exactly 1280×800 px** (or 640×400). Shoot at 1280×800.

These are ordered by priority — if you only get 3, do shots 1, 2, and 4.

---

### Shot 1 — The Problem/Solution (Hero)
**What to show:** Side-by-side or before/after. Left: a .md file open in Google Drive showing raw text (asterisks, hashes, backtick fences visible). Right: the same file rendered beautifully in Markdrive's viewer tab.

**Direction for nano banana:** Clean split composition. Left side slightly dimmed or labeled "Before". Right side bright, the rendered output taking up most of the frame. No browser chrome needed — crop tight to the content.

**Why this is shot 1:** Communicates the entire value prop in one image. The person scanning the store page gets it immediately.

---

### Shot 2 — The Button in Context
**What to show:** Google Drive file view with a .md file selected or open, Markdrive button visible and highlighted in the toolbar. Make it obvious where to click.

**Direction:** Zoom in on the Drive toolbar area. Add a subtle highlight ring or arrow pointing to the Markdrive button. Should feel like a UI walkthrough — clean, minimal annotation.

**Why this matters:** People need to know what they're installing adds a button. Show it in place.

---

### Shot 3 — Syntax Highlighting
**What to show:** A code-heavy markdown file rendered in the viewer. Ideally a README with multiple code blocks in different languages — shows the highlighting isn't just basic coloring.

**Direction:** Fill most of the frame with the rendered content. No need to show Drive at all. Zoom in enough that the syntax colors are clearly visible. Light mode for this one.

---

### Shot 4 — Dark Mode
**What to show:** Same or similar file rendered in dark mode. Clean, polished.

**Direction:** Full viewer, dark background, rendered content looking crisp. Should feel like a deliberate design choice, not an afterthought. Works great as a standalone shot.

---

### Shot 5 — Table of Contents
**What to show:** A longer document with the auto-generated TOC visible — either as a sidebar or at the top. Shows the extension is useful for real documentation, not just short files.

**Direction:** Use a doc with at least 4-5 headings so the TOC looks substantial. Show the TOC and some body content in the same frame.

---

## Pre-Publish Checklist

Things you still need before the store listing goes live:

### Required by Chrome Web Store
- [ ] **Privacy policy URL** — *This is mandatory.* The extension accesses drive.google.com content. Even if you store nothing, you need a published privacy policy page. A simple GitHub Pages page or a Google Doc published to the web works. Needs to state what data is/isn't collected.
- [ ] **128×128 icon** — Required for the store listing. You'll also want 16×16 and 48×48.
- [ ] **Single-purpose statement** — CWS will ask you to confirm the extension has a single, clear purpose. Yours does: render markdown files from Google Drive. Keep that framing consistent everywhere.

### Strongly Recommended
- [ ] **Support URL** — Your GitHub repo URL works perfectly. Put it here so users can report issues.
- [ ] **Homepage URL** — Optional, but looks more credible. GitHub repo is fine if you don't have a site.
- [ ] **Promotional tile (440×280)** — The store shows this in listings and search results. A clean tile with the Markdrive name and a one-line description makes a big difference in click-through.

### Category & Discoverability
- **Category:** Developer Tools (best fit — your users are people who work with .md files)
- **Alternative:** Productivity (broader reach, slightly less targeted)
- **Recommendation:** Developer Tools. The people who know what a .md file is will look there first.

### Keywords to work into the description naturally
(Chrome Web Store uses description text for search indexing)
- markdown viewer
- markdown reader
- Google Drive markdown
- .md file
- render markdown
- markdown preview

### Release notes / Version
- Make sure your `manifest.json` version is set (e.g. `"version": "1.0.0"`)
- The store will ask for release notes on publish — a sentence is fine: *"Initial release."*

---

## What to Build vs. Capture

| Screenshot | Capture from real extension? | Generate with nano banana? |
|---|---|---|
| Shot 1 (before/after) | Capture "before" from Drive | Polish with nano banana for clean split |
| Shot 2 (button in context) | Capture from Drive with extension installed | Annotate/highlight button |
| Shot 3 (syntax highlighting) | Capture from viewer | Crop + clean up |
| Shot 4 (dark mode) | Capture from viewer | Crop + clean up |
| Shot 5 (TOC) | Capture from viewer | Crop + clean up |

For the **promotional tile**, you may want to create it fresh in nano banana — it's a graphic asset, not a screenshot.

---

*Prepared for Markdrive v1.0 publish — April 2026*
