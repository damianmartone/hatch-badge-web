import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev the Vite server (5173) proxies /api to the companion server (8787),
// which is the only thing that can reach the laptop's printers.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true } },
  },
  build: { outDir: 'dist', sourcemap: true },
})
