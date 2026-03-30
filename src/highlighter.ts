/**
 * Module 06 — Syntax Highlighting
 *
 * Prism.js is imported with only the languages we need — NOT 'prismjs/components'
 * which adds ~500KB. 20 languages cover the vast majority of code blocks.
 */

import Prism from 'prismjs'

// Core languages (built into prismjs)
import 'prismjs/components/prism-markup'       // HTML/XML
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-javascript'

// Extended languages (order matters — some extend others)
import 'prismjs/components/prism-typescript'   // extends javascript
import 'prismjs/components/prism-jsx'          // extends javascript
import 'prismjs/components/prism-tsx'          // extends jsx + typescript
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-php'
import 'prismjs/components/prism-ruby'
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'          // extends c
import 'prismjs/components/prism-swift'
import 'prismjs/components/prism-kotlin'
import 'prismjs/components/prism-docker'       // Dockerfile

// Aliases so common fence labels resolve correctly
const ALIASES: Record<string, string> = {
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  dockerfile: 'docker',
  htm: 'markup',
  xml: 'markup',
  md: 'markdown',
}

/**
 * Highlight a code string for a given language fence label.
 * Returns the original code if the language isn't recognised.
 */
export function highlight(code: string, lang: string): string {
  const resolved = ALIASES[lang] ?? lang
  const grammar = Prism.languages[resolved]
  if (!grammar) return code
  return Prism.highlight(code, grammar, resolved)
}

/**
 * The language label shown in the badge on each code block.
 * Falls back to the raw fence label if no alias exists.
 */
export function displayLabel(lang: string): string {
  return ALIASES[lang] ?? lang
}
