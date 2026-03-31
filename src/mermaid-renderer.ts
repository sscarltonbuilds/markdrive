/**
 * Mermaid.js diagram rendering — lazy loaded to keep the initial bundle lean.
 *
 * markdown-it's highlight callback emits `.markdrive-mermaid` divs (not <pre>)
 * for fenced ```mermaid blocks. This module finds those placeholders and
 * replaces them with rendered SVG.
 */

export async function renderMermaidBlocks(viewer: HTMLElement): Promise<void> {
  const blocks = viewer.querySelectorAll<HTMLElement>('.markdrive-mermaid')
  if (blocks.length === 0) return

  const { default: mermaid } = await import('mermaid')
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches

  mermaid.initialize({
    startOnLoad: false,
    theme: dark ? 'dark' : 'default',
    securityLevel: 'strict',
  })

  let idx = 0
  for (const block of blocks) {
    const source = block.textContent ?? ''
    if (!source.trim()) continue

    const id = `markdrive-mermaid-${Date.now()}-${idx++}`
    try {
      const { svg } = await mermaid.render(id, source.trim())
      block.innerHTML = svg
      block.classList.add('markdrive-mermaid--rendered')
    } catch {
      block.classList.add('markdrive-mermaid--error')
      const msg = document.createElement('p')
      msg.textContent = 'Diagram could not be rendered — check the Mermaid syntax.'
      block.replaceChildren(msg)
    }
  }
}
