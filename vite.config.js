import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Two pages: index.html (reasoning-path demo) and console.html (AutoResearch console).
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: { input: { main: 'index.html', console: 'console.html' } },
  },
})
