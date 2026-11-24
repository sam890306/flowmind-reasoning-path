import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Two pages: index.html (reasoning-path demo) and console.html (AutoResearch console).
// In dev, /api is proxied to the local API server (server/dev.js).
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { proxy: { '/api': `http://localhost:${process.env.API_PORT || 8787}` } },
  build: {
    rollupOptions: { input: { main: 'index.html', console: 'console.html' } },
  },
})
