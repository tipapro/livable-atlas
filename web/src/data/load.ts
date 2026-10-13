import { buildLookup, cellAt, checkCells, checkCities, checkCountries, checkManifest, decodeLayer, type City, type CountryName, type Layer, type Manifest } from './format'

export interface Atlas {
  manifest: Manifest
  n: number
  cells: Uint32Array
  lookup: Int32Array
  layers: Record<string, Layer>
  monthly: Record<string, Layer>
  cities: City[]
  cityCells: Int32Array // cellAt of each city, -1 off land
  countries: [string, CountryName][] // country-index order
}

// The Vite dev server already decompresses *.gz (Content-Encoding); GitHub Pages serves the raw gzip.
export async function gunzipIfNeeded(buf: ArrayBuffer, file: string): Promise<ArrayBuffer> {
  const head = new Uint8Array(buf, 0, Math.min(2, buf.byteLength))
  if (head[0] !== 0x1f || head[1] !== 0x8b) return buf
  try {
    return await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
  } catch {
    throw new Error(`${file}: invalid gzip`)
  }
}

type Read = (res: Response) => Promise<ArrayBuffer>

// Reads bodies and reports bytes done / bytes expected over all sized responses.
// The total stays null until `expected` responses have arrived, so it never understates the work still to come.
// shortcut: in dev the *.gz files carry Content-Encoding (unsized), so nothing is reported there; Pages counts everything.
export function progressReader(onChange: (loaded: number, total: number | null) => void, expected = 0): Read {
  let loaded = 0
  let sized = 0
  let seen = 0
  return async (res) => {
    seen++
    const length = Number(res.headers.get('content-length'))
    if (!res.body || !length || res.headers.has('content-encoding')) return res.arrayBuffer()
    sized += length
    const chunks: Uint8Array[] = []
    const reader = res.body.getReader()
    for (let r = await reader.read(); !r.done; r = await reader.read()) {
      chunks.push(r.value)
      loaded += r.value.length
      onChange(loaded, seen >= expected ? sized : null)
    }
    const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
    chunks.reduce((at, c) => (out.set(c, at), at + c.length), 0)
    return out.buffer
  }
}

const plain: Read = (res) => res.arrayBuffer()

// Monthly layers needed at startup; the rest load on demand.
const STARTUP_MONTHLY = ['tmax', 'tmin', 'tdew']

// Absolute, because the worker resolves relative URLs against its own script (assets/), not the page.
export const dataBase = (baseUrl: string, pageHref: string) => new URL('data/', new URL(baseUrl, pageHref)).href

const getFrom = (base: string, fetchFn: typeof fetch) => async (path: string) => {
  const url = `${base}${path}`
  const res = await fetchFn(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res
}

const getBin = (get: ReturnType<typeof getFrom>, read: Read) => async (file: string) => gunzipIfNeeded(await read(await get(file)), file)

// One monthly layer (n cells x 12 months); used at startup and for lazy loads.
export async function loadMonthly(base: string, m: Manifest, name: string, n: number, fetchFn: typeof fetch = fetch, read: Read = plain): Promise<Layer> {
  const spec = m.monthly[name]
  if (!spec) throw new Error(`monthly/${name}.bin.gz: not in the manifest`)
  return decodeLayer(await getBin(getFrom(base, fetchFn), read)(spec.file), spec, n * 12)
}

export async function loadAtlas(base: string, fetchFn: typeof fetch = fetch, onProgress?: (loaded: number, total: number | null) => void): Promise<Atlas> {
  const get = getFrom(base, fetchFn)
  // Parse from text: a SPA fallback page answers 200 with HTML. JSON is tiny and not part of the progress.
  const json = async (path: string): Promise<unknown> => {
    const text = new TextDecoder().decode(await plain(await get(path)))
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(`${path}: invalid JSON`)
    }
  }
  const citiesP = json('cities.json').then(checkCities)
  const countriesP = json('countries.json').then(checkCountries)
  // Not awaited yet: if the manifest fails first, these rejections must not go unhandled.
  citiesP.catch(() => {})
  countriesP.catch(() => {})
  const manifest = checkManifest(await json('manifest.json') as Manifest)
  const n = manifest.cellCount
  const monthlyNames = STARTUP_MONTHLY.filter((k) => k in manifest.monthly)
  // cells + layers + startup monthly: the binaries that make up the progress.
  const read = onProgress ? progressReader(onProgress, 1 + Object.keys(manifest.layers).length + monthlyNames.length) : plain
  const bin = getBin(get, read)

  const entries = <T>(names: string[], f: (k: string) => Promise<T>) =>
    Promise.all(names.map(async (k) => [k, await f(k)] as const)).then(Object.fromEntries)

  // All requested together, so every header arrives before the first large body is far along.
  const [cells, layers, monthly] = await Promise.all([
    bin('cells.bin.gz').then((buf) => {
      if (buf.byteLength !== n * 4) throw new Error(`cells.bin.gz: expected ${n} values, got ${buf.byteLength / 4}`)
      return checkCells(new Uint32Array(buf))
    }),
    entries(Object.keys(manifest.layers), async (k) =>
      decodeLayer(await bin(manifest.layers[k].file), manifest.layers[k], n)),
    entries(monthlyNames, (k) => loadMonthly(base, manifest, k, n, fetchFn, read)),
  ])
  const [cities, countries] = await Promise.all([citiesP, countriesP])
  const lookup = buildLookup(cells)
  const cityCells = Int32Array.from(cities, (c) => cellAt(lookup, c[3], c[4]))
  return { manifest, n, cells, lookup, layers, monthly, cities, cityCells, countries }
}
