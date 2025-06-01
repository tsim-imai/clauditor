import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import electronRenderer from 'vite-plugin-electron-renderer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Main process entry point
        entry: 'electron/main.ts',
        onstart(options) {
          // Notify the Renderer process to reload the page when the Preload script build is complete
          options.reload()
        },
      },
      {
        // Preload script
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
      },
    ]),
    electronRenderer(),
  ],
  build: {
    // Ensure compatibility with Electron
    target: 'esnext',
    minify: process.env.NODE_ENV === 'production',
    rollupOptions: {
      external: ['electron'],
      output: {
        format: 'es',
      },
    },
  },
})
