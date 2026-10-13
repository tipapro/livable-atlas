import { basename } from 'node:path'
import type { HtmlTagDescriptor, Plugin } from 'vite'

const pages = {
  'index.html': {
    path: '', lang: 'en',
    title: 'Livable Atlas — World Map of the Best Places to Live',
    description: 'Explore a world livability map. Compare climate, air quality, safety, infrastructure and economy across 30 factors, with weights you control.',
  },
  'about.html': {
    path: 'about.html', lang: 'en',
    title: 'How Livable Atlas Scores Places to Live',
    description: 'Learn how Livable Atlas compares places using 30 climate, environment, infrastructure and economy factors. Understand scores, data sources and limitations.',
  },
  'about-ru.html': {
    path: 'about-ru.html', lang: 'ru',
    title: 'Где лучше жить: как устроена карта Livable Atlas',
    description: 'Как сравнивать места для жизни по климату, экологии, безопасности, инфраструктуре и экономике. 30 факторов, свои настройки и открытые источники данных.',
  },
} as const

export function seo(siteUrl = 'https://tipapro.github.io/livable-atlas/'): Plugin {
  let site: URL
  try {
    site = new URL(siteUrl)
    if (site.protocol !== 'https:' || site.username || site.password || site.search || site.hash) throw new Error()
  } catch {
    throw new Error('SITE_URL must be an absolute HTTPS URL without credentials, query or fragment')
  }
  site.pathname = `${site.pathname.replace(/\/+$/, '')}/`
  const url = (path: string) => new URL(path, site).href
  const xml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

  return {
    name: 'atlas-seo',
    transformIndexHtml(_html, context) {
      const page = pages[basename(context.filename) as keyof typeof pages]
      if (!page) return []
      const canonical = url(page.path)
      const image = url('social-preview.png')
      const imageAlt = page.lang === 'ru' ? 'Карта Livable Atlas с оценками мест для жизни' : 'Livable Atlas world map with livability scores'
      const meta = (key: string, value: string): HtmlTagDescriptor => ({
        tag: 'meta', attrs: { [key.startsWith('og:') ? 'property' : 'name']: key, content: value },
      })
      const tags: HtmlTagDescriptor[] = [
        { tag: 'title', children: page.title },
        meta('description', page.description),
        { tag: 'link', attrs: { rel: 'canonical', href: canonical } },
        { tag: 'link', attrs: { rel: 'sitemap', type: 'application/xml', href: url('sitemap.xml') } },
        meta('robots', 'index, follow, max-image-preview:large'),
        meta('theme-color', '#f4f6f8'),
        meta('og:type', 'website'),
        meta('og:site_name', 'Livable Atlas'),
        meta('og:title', page.title),
        meta('og:description', page.description),
        meta('og:url', canonical),
        meta('og:locale', page.lang === 'ru' ? 'ru_RU' : 'en_US'),
        meta('og:image', image),
        meta('og:image:type', 'image/png'),
        meta('og:image:width', '1200'),
        meta('og:image:height', '630'),
        meta('og:image:alt', imageAlt),
        meta('twitter:card', 'summary_large_image'),
        meta('twitter:title', page.title),
        meta('twitter:description', page.description),
        meta('twitter:image', image),
        meta('twitter:image:alt', imageAlt),
      ]
      if (page.path) {
        for (const [lang, path] of [['en', 'about.html'], ['ru', 'about-ru.html'], ['x-default', 'about.html']]) {
          tags.push({ tag: 'link', attrs: { rel: 'alternate', hreflang: lang, href: url(path) } })
        }
      } else {
        tags.push({ tag: 'link', attrs: { rel: 'preconnect', href: 'https://tiles.openfreemap.org', crossorigin: '' } })
        tags.push({
          tag: 'script', attrs: { type: 'application/ld+json' },
          children: JSON.stringify({
            '@context': 'https://schema.org', '@type': 'WebApplication',
            name: 'Livable Atlas', url: canonical, description: page.description,
            applicationCategory: 'LifestyleApplication', operatingSystem: 'Any',
            browserRequirements: 'Requires JavaScript and WebGL',
            isAccessibleForFree: true, inLanguage: ['en', 'ru'], image,
          }).replaceAll('<', '\\u003c'),
        })
      }
      return tags.map(tag => ({ ...tag, injectTo: 'head' as const }))
    },
    generateBundle() {
      this.emitFile({
        type: 'asset', fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Object.values(pages).map(page => `  <url><loc>${xml(url(page.path))}</loc></url>`).join('\n')}\n</urlset>\n`,
      })
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\n\nSitemap: ${url('sitemap.xml')}\n` })
    },
  }
}
