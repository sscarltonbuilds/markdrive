import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig({
  base: '',
  plugins: [
    crx({ manifest }),
  ],
  build: {
    outDir: 'dist',
    minify: false, // keep readable during dev; flip to true before Web Store submission
    sourcemap: true,
    rollupOptions: {
      input: {
        // Explicit entry so CRXJS bundles viewer-page.ts into the HTML
        viewer: 'viewer.html',
      },
      output: {
        manualChunks: undefined,
      },
    },
  },
})
