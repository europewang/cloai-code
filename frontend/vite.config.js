import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import conversationsApi from './plugins/conversationsApi.js'

const backendUrl = process.env.VITE_BACKEND_URL || 'http://brain-server:8091'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), conversationsApi()],
  build: {
    minify: false,
    terserOptions: {
      compress: false,
      mangle: false
    }
  },
  server: {
    port: parseInt(process.env.VITE_DEV_PORT) || 3000,
    host: '0.0.0.0',
    proxy: {
      '/api/user/conversations': false,
      '/user/conversations': false,
      '/v1/agent/chat/stream': {
        target: backendUrl,
        changeOrigin: true,
        ws: true,
        rewrite: (path) => '/api/v1/brain/query'
      },
      '/api/v1/agent/chat/stream': {
        target: backendUrl,
        changeOrigin: true,
        ws: true,
        rewrite: (path) => '/api/v1/brain/query'
      },
      '/v1/': {
        target: backendUrl,
        changeOrigin: true,
        rewrite: (path) => `/api${path}`
      },
      '/api/v1/': {
        target: backendUrl,
        changeOrigin: true,
        rewrite: (path) => path
      },
      '/admin/': {
        target: backendUrl,
        changeOrigin: true,
        rewrite: (path) => `/api${path}`
      },
      '/api': {
        target: backendUrl,
        changeOrigin: true
      }
    }
  }
})
