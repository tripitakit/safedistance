import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3031,
    host: true,
    open: true
  },
  preview: {
    port: 3031,
    host: true
  }
})
