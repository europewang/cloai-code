import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/webTools/',
  plugins: [vue()],
  server: {
    port: 80,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://backend:8087',
        changeOrigin: true
      }
    }
  },
  preview: {
    host: '0.0.0.0'
  }
})
