import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3031,
    host: true,
    open: true,
    allowedHosts: ['safedistance.tripitak.it']
  },
  preview: {
    port: 3031,
    host: true,
    allowedHosts: ['safedistance.tripitak.it']
  }
})
