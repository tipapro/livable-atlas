// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { build } from 'vite'

afterEach(() => vi.unstubAllEnvs())

async function output(siteUrl: string) {
  vi.stubEnv('SITE_URL', siteUrl)
  const result = await build({
    configFile: './vite.config.ts',
    logLevel: 'silent',
    build: { write: false },
  })
  if (Array.isArray(result) || !('output' in result)) throw new Error('Expected a single build')
  return new Map(result.output.filter(a => a.type === 'asset').map(a => [a.fileName, String(a.source)]))
}

test.each([
  ['https://example.github.io/atlas', 'https://example.github.io/atlas/'],
  ['https://example.github.io/', 'https://example.github.io/'],
  ['https://atlas.example.org', 'https://atlas.example.org/'],
])('builds crawlable pages and matching discovery URLs for %s', async (input, base) => {
  const assets = await output(input)
  const parser = new DOMParser()
  const index = parser.parseFromString(assets.get('index.html')!, 'text/html')
  expect(index.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(base)
  expect(index.querySelector('h1')?.textContent).toContain('Livable Atlas')
  const schema = JSON.parse(index.querySelector('script[type="application/ld+json"]')!.textContent!)
  expect(schema).toMatchObject({ '@type': 'WebApplication', url: base, inLanguage: ['en', 'ru'] })

  for (const [file, locale] of [['index.html', 'en'], ['about.html', 'en'], ['about-ru.html', 'ru']]) {
    const html = assets.get(file)!
    expect(html.slice(0, 1024)).toContain('<meta charset="UTF-8"')
    const doc = parser.parseFromString(html, 'text/html')
    const canonical = file === 'index.html' ? base : `${base}${file}`
    expect(doc.documentElement.lang).toBe(locale)
    expect(doc.querySelectorAll('link[rel="canonical"]')).toHaveLength(1)
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(canonical)
    expect(doc.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(canonical)
    expect(doc.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(`${base}social-preview.png`)
    expect(doc.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe('summary_large_image')
    expect(doc.querySelector('title')?.textContent?.length).toBeGreaterThan(20)
    expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')?.length).toBeGreaterThan(80)
    expect(html).not.toMatch(/%[A-Z_]+%/)
    if (file !== 'index.html') {
      expect(doc.querySelectorAll('script[src]')).toHaveLength(0)
      expect(doc.querySelectorAll('link[rel="modulepreload"]')).toHaveLength(0)
      expect(doc.querySelector('link[hreflang="en"]')?.getAttribute('href')).toBe(`${base}about.html`)
      expect(doc.querySelector('link[hreflang="ru"]')?.getAttribute('href')).toBe(`${base}about-ru.html`)
      expect(doc.querySelector('a[href="./"]')).not.toBeNull()
    }
  }
  const sitemap = parser.parseFromString(assets.get('sitemap.xml')!, 'application/xml')
  expect(sitemap.querySelector('parsererror')).toBeNull()
  expect([...sitemap.querySelectorAll('loc')].map(el => el.textContent)).toEqual([base, `${base}about.html`, `${base}about-ru.html`])
  expect(assets.get('robots.txt')).toBe(`User-agent: *\nAllow: /\n\nSitemap: ${base}sitemap.xml\n`)
}, 30_000)

test.each(['', 'not-a-url', 'http://example.com', 'https://user:secret@example.com', 'https://example.com/?q=1', 'https://example.com/#map'])(
  'rejects an invalid public SITE_URL: %s', async value => {
    await expect(output(value)).rejects.toThrow('SITE_URL')
  }, 30_000,
)
