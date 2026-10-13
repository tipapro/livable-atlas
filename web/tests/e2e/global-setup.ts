import { existsSync } from 'node:fs'

export default function globalSetup() {
  if (!existsSync('public/data/manifest.json')) throw new Error('Run: cd pipeline && uv run atlas build')
}
