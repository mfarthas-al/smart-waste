import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:4000' }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/setupTests.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      all: true,
      include: ['src/**/*.{js,jsx}'],
      exclude: [
        'src/setupTests.js',
        'src/pages/Auth/**',
        'src/pages/Dashboards/**',
      ],
      thresholds: {
        statements: 0.8,
        branches: 0.8,
        functions: 0.8,
        lines: 0.8,
      },
    },
  },
})
