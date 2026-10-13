import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

// macOS privacy rules block Firefox's real profile dir for the Claude app; a project-local home is harmless elsewhere.
const ffHome = fileURLToPath(new URL('./.ffhome', import.meta.url))
mkdirSync(ffHome, { recursive: true })

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  use: { baseURL: 'http://127.0.0.1:5173', locale: 'en-US' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox', launchOptions: { env: { ...process.env, CFFIXED_USER_HOME: ffHome } } } },
  ],
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
})
