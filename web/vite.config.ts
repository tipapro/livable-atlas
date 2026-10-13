import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { seo } from './seo.ts'

// https://vite.dev/config/
export default defineConfig({
  base: './', // works under any GitHub Pages sub-path (/<repo>/)
  plugins: [react(), seo(process.env.SITE_URL)],
  build: {
    rolldownOptions: {
      input: ['index.html', 'about.html', 'about-ru.html'],
      output: { codeSplitting: { groups: [{ name: 'maplibre', test: /node_modules[\\/]maplibre-gl/ }] } },
    },
    chunkSizeWarningLimit: 1100, // maplibre-gl is one ~1 MB module and cannot split further
  },
})
