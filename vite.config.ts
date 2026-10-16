import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/mcp': 'http://127.0.0.1:5174',
      '/api/mcp': 'http://127.0.0.1:5174',
      '/api/firmware': 'http://127.0.0.1:5174',
    },
    allowedHosts: ['acer-gnmd.merino-ayu.ts.net'],
  },
  build: { chunkSizeWarningLimit: 2000 },
})
