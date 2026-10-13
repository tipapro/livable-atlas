import { expect, test } from 'vitest'
import { dataBase, loadAtlas, loadMonthly, progressReader } from '../../src/data/load'
import type { LayerSpec, Manifest } from '../../src/data/format'

const spec = (file: string): LayerSpec =>
  ({ file, dtype: 'uint8', scale: 0.5, offset: -60, unit: '°C', source: 'synthetic' })

const manifest: Manifest = {
  version: 2,
  grid: { res: 0.25, width: 1440, height: 720, west: -180, north: 90 },
  cellCount: 2,
  layers: { warm_tmax: spec('layers/x.bin.gz') },
  monthly: { tmax: spec('monthly/tmax.bin.gz'), tmin: spec('monthly/tmin.bin.gz'), tdew: spec('monthly/tdew.bin.gz'), prec: spec('monthly/prec.bin.gz') },
  sources: {},
  builtAt: '2026-01-01T00:00:00Z',
}

const cities = [['Zero', 'Ноль', 'AA', 89.9, -179.9, 1000], ['Sea', null, 'BB', 0, 0, 500]]
const countries = { AAA: { name: 'Aaa', nameRu: null }, BBB: { name: 'Bbb', nameRu: 'Ббб' } }
const extra = { '/d/cities.json': JSON.stringify(cities), '/d/countries.json': JSON.stringify(countries) }

const gz = async (b: BufferSource) => new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer())

function fakeFetch(files: Record<string, BodyInit>, requested: string[] = []): typeof fetch {
  return (async (url: string) => {
    requested.push(url)
    const body = files[url]
    return body === undefined ? new Response(null, { status: 404 }) : new Response(body)
  }) as typeof fetch
}

test('gzip binaries decode; an already-decompressed body (Vite dev) passes through', async () => {
  const month = new Uint8Array(24).fill(120)
  const fetchFn = fakeFetch({
    '/d/manifest.json': JSON.stringify(manifest),
    '/d/cells.bin.gz': await gz(new Uint32Array([0, 1439])),
    '/d/layers/x.bin.gz': new Uint8Array([100, 255]), // plain: the dev server sends Content-Encoding: gzip
    '/d/monthly/tmax.bin.gz': await gz(month),
    '/d/monthly/tmin.bin.gz': await gz(month),
    '/d/monthly/tdew.bin.gz': await gz(month),
    ...extra,
  })
  const atlas = await loadAtlas('/d/', fetchFn)
  expect(Array.from(atlas.cells)).toEqual([0, 1439])
  expect(Array.from(atlas.layers.warm_tmax.data)).toEqual([100, 255])
  expect(atlas.monthly.tmax.data.length).toBe(24)
})

test('the length check applies to decompressed bytes; a truncated gzip names the file', async () => {
  const month = await gz(new Uint8Array(24))
  const base = {
    '/d/manifest.json': JSON.stringify(manifest),
    '/d/cells.bin.gz': await gz(new Uint32Array([0, 1439])),
    '/d/monthly/tmax.bin.gz': month,
    '/d/monthly/tmin.bin.gz': month,
    '/d/monthly/tdew.bin.gz': month,
    ...extra,
  }
  await expect(loadAtlas('/d/', fakeFetch({ ...base, '/d/layers/x.bin.gz': await gz(new Uint8Array(3)) })))
    .rejects.toThrow('layers/x.bin.gz: expected 2 values, got 3')
  const truncated = (await gz(new Uint8Array(1000).map((_, i) => i * 7))).slice(0, 12)
  await expect(loadAtlas('/d/', fakeFetch({ ...base, '/d/layers/x.bin.gz': truncated })))
    .rejects.toThrow('layers/x.bin.gz: invalid gzip')
})

test('loadAtlas fetches manifest, cells, layers, startup monthly only', async () => {
  const requested: string[] = []
  const month = new Uint8Array(24).fill(120) // 2 cells x 12 months
  const fetchFn = fakeFetch({
    '/d/manifest.json': JSON.stringify(manifest),
    '/d/cells.bin.gz': new Uint32Array([0, 1439]),
    '/d/layers/x.bin.gz': new Uint8Array([100, 255]),
    '/d/monthly/tmax.bin.gz': month,
    '/d/monthly/tmin.bin.gz': month,
    '/d/monthly/tdew.bin.gz': month,
    ...extra,
  }, requested)

  const atlas = await loadAtlas('/d/', fetchFn)

  expect(atlas.n).toBe(2)
  expect(Array.from(atlas.cells)).toEqual([0, 1439])
  expect(atlas.lookup[0]).toBe(0)
  expect(atlas.lookup[1439]).toBe(1)
  expect(Array.from(atlas.layers.warm_tmax.data)).toEqual([100, 255])
  expect(atlas.layers.warm_tmax.scale).toBe(0.5)
  expect(Object.keys(atlas.monthly).sort()).toEqual(['tdew', 'tmax', 'tmin'])
  expect(atlas.monthly.tmax.data.length).toBe(24)
  expect(requested).not.toContain('/d/monthly/prec.bin.gz')
  expect(atlas.cities).toEqual(cities)
  expect(Array.from(atlas.cityCells)).toEqual([0, -1])
  expect(atlas.countries.map((c) => c[0])).toEqual(['AAA', 'BBB'])
  expect(requested).toHaveLength(8)
})

test('loadAtlas rejects a malformed cities.json or countries.json by name', async () => {
  const files = {
    '/d/manifest.json': JSON.stringify(manifest),
    '/d/cells.bin.gz': new Uint32Array([0, 1439]),
    '/d/layers/x.bin.gz': new Uint8Array([100, 255]),
    '/d/monthly/tmax.bin.gz': new Uint8Array(24),
    '/d/monthly/tmin.bin.gz': new Uint8Array(24),
    '/d/monthly/tdew.bin.gz': new Uint8Array(24),
    ...extra,
  }
  await expect(loadAtlas('/d/', fakeFetch({ ...files, '/d/cities.json': '{}' }))).rejects.toThrow(/cities\.json/)
  await expect(loadAtlas('/d/', fakeFetch({ ...files, '/d/cities.json': '<html>' }))).rejects.toThrow('cities.json: invalid JSON')
  await expect(loadAtlas('/d/', fakeFetch({ ...files, '/d/countries.json': '[]' }))).rejects.toThrow(/countries\.json/)
})

test('loadAtlas surfaces HTTP errors', async () => {
  const fetchFn = (async () => new Response(null, { status: 500 })) as typeof fetch
  await expect(loadAtlas('/d/', fetchFn)).rejects.toThrow('manifest.json: HTTP 500')
})

test('loadAtlas rejects a cells.bin of the wrong size', async () => {
  const rest = {
    '/d/manifest.json': JSON.stringify(manifest),
    '/d/layers/x.bin.gz': new Uint8Array([100, 255]),
    '/d/monthly/tmax.bin.gz': new Uint8Array(24),
    '/d/monthly/tmin.bin.gz': new Uint8Array(24),
    '/d/monthly/tdew.bin.gz': new Uint8Array(24),
    ...extra,
  }
  const fetchFn = fakeFetch({ ...rest, '/d/cells.bin.gz': new Uint32Array([0, 1, 2]) })
  await expect(loadAtlas('/d/', fetchFn)).rejects.toThrow('cells.bin.gz: expected 2 values, got 3')
  const odd = fakeFetch({ ...rest, '/d/cells.bin.gz': new Uint8Array(7) })
  await expect(loadAtlas('/d/', odd)).rejects.toThrow('cells.bin.gz: expected 2 values')
})

test('loadAtlas rejects a mismatched manifest', async () => {
  const load = (m: unknown) => loadAtlas('/d/', fakeFetch({ '/d/manifest.json': JSON.stringify(m) }))
  await expect(load({ ...manifest, version: 1 })).rejects.toThrow('manifest.json: unsupported version 1, expected 2')
  await expect(load({ ...manifest, grid: { ...manifest.grid, width: 720 } })).rejects.toThrow('manifest.json: grid 720x720 at 0.25° from -180, 90; expected 1440x720')
})

test('loadAtlas rejects a non-JSON manifest', async () => {
  const fetchFn = fakeFetch({ '/d/manifest.json': '<!doctype html><html></html>' })
  await expect(loadAtlas('/d/', fetchFn)).rejects.toThrow('manifest.json: invalid JSON')
})

test('loadMonthly loads one layer and names the file on failure', async () => {
  const ok = fakeFetch({ '/d/monthly/prec.bin.gz': new Uint8Array(24) })
  expect((await loadMonthly('/d/', manifest, 'prec', 2, ok)).data.length).toBe(24)
  await expect(loadMonthly('/d/', manifest, 'prec', 2, fakeFetch({}))).rejects.toThrow(/monthly\/prec\.bin\.gz/)
})

test('loadMonthly names the layer when the manifest lacks it', async () => {
  await expect(loadMonthly('/d/', manifest, 'nope', 2, fakeFetch({}))).rejects.toThrow(/monthly\/nope\.bin/)
})

test('progressReader counts only sized, unencoded responses', async () => {
  const seen: [number, number | null][] = []
  const read = progressReader((l, t) => seen.push([l, t]))
  const sized = (n: number) => new Response(new Uint8Array(n), { headers: { 'content-length': String(n) } })
  expect((await read(new Response(new Uint8Array(5)))).byteLength).toBe(5)
  expect(seen).toEqual([])
  await read(sized(10))
  await read(new Response(new Uint8Array(7), { headers: { 'content-length': '3', 'content-encoding': 'gzip' } }))
  expect(seen.at(-1)).toEqual([10, 10])
})

test('loadAtlas reports progress through every fetch and ends at loaded === total', async () => {
  const month = new Uint8Array(24).fill(120)
  const files: Record<string, string | Uint8Array<ArrayBuffer>> = {
    '/d/manifest.json': JSON.stringify(manifest),
    '/d/cells.bin.gz': await gz(new Uint32Array([0, 1439])),
    '/d/layers/x.bin.gz': await gz(new Uint8Array([100, 255])),
    '/d/monthly/tmax.bin.gz': await gz(month),
    '/d/monthly/tmin.bin.gz': await gz(month),
    '/d/monthly/tdew.bin.gz': await gz(month),
    ...extra,
  }
  const fetchFn = (async (url: string) => {
    const body = files[url]
    const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
    return new Response(bytes, { headers: { 'content-length': String(bytes.length) } })
  }) as typeof fetch
  const seen: [number, number | null][] = []
  await loadAtlas('/d/', fetchFn, (l, t) => seen.push([l, t]))
  const bins = Object.entries(files).filter(([k]) => k.endsWith('.gz')).reduce((n, [, b]) => n + (b as Uint8Array).length, 0)
  expect(seen.at(-1)).toEqual([bins, bins])
})

test('no total is reported until every startup binary has answered', async () => {
  const month = await gz(new Uint8Array(24))
  const files: Record<string, string | Uint8Array<ArrayBuffer>> = {
    '/d/manifest.json': JSON.stringify(manifest),
    '/d/cells.bin.gz': await gz(new Uint32Array([0, 1439])),
    '/d/layers/x.bin.gz': await gz(new Uint8Array([100, 255])),
    '/d/monthly/tmax.bin.gz': month,
    '/d/monthly/tmin.bin.gz': month,
    '/d/monthly/tdew.bin.gz': month,
    ...extra,
  }
  const headers = new Set<string>()
  const gate = new Promise<void>((r) => setTimeout(r, 20))
  const seen: [number, number | null, number][] = []
  const fetchFn = (async (url: string) => {
    const body = files[url]
    const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
    // monthly/tdew answers late: everything else is complete before its headers arrive
    if (url.endsWith('tdew.bin.gz')) await gate
    if (url.endsWith('.gz')) headers.add(url)
    return new Response(bytes, { headers: { 'content-length': String(bytes.length) } })
  }) as typeof fetch
  await loadAtlas('/d/', fetchFn, (l, t) => seen.push([l, t, headers.size]))
  expect(seen.some(([, , h]) => h < 5)).toBe(true) // the other four report while tdew is pending
  for (const [, total, h] of seen) if (h < 5) expect(total).toBeNull()
  const [l, t] = seen.at(-1)!
  expect(t).not.toBeNull()
  expect(l).toBe(t)
})

test('dataBase resolves against the page, so the worker script location does not matter', () => {
  expect(dataBase('./', 'https://u.github.io/repo/')).toBe('https://u.github.io/repo/data/')
  expect(dataBase('/', 'http://localhost:5173/')).toBe('http://localhost:5173/data/')
})
