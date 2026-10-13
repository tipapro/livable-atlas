export type Dtype = 'uint8' | 'uint16'

export interface LayerSpec { file: string; dtype: Dtype; scale: number; offset: number; unit: string; source: string }
export interface SourceInfo { name: string; url: string; license: string; citation: string; period: string; retrieved: string } // retrieved: YYYY-MM-DD
export interface Manifest {
  version: 2
  grid: { res: number; width: number; height: number; west: number; north: number }
  cellCount: number
  layers: Record<string, LayerSpec>
  monthly: Record<string, LayerSpec>
  sources: Record<string, SourceInfo>
  builtAt: string
}
export interface Layer { data: Uint8Array | Uint16Array; scale: number; offset: number; nodata: number }

const W = 1440
const H = 720
const RES = 0.25

export function checkManifest(m: Manifest): Manifest {
  if (m?.version !== 2) throw new Error(`manifest.json: unsupported version ${m?.version}, expected 2`)
  const g = m.grid
  if (g?.width !== W || g?.height !== H || g?.res !== RES || g?.west !== -180 || g?.north !== 90)
    throw new Error(`manifest.json: grid ${g?.width}x${g?.height} at ${g?.res}° from ${g?.west}, ${g?.north}; expected ${W}x${H} at ${RES}° from -180, 90`)
  return m
}

export function decodeLayer(buf: ArrayBuffer, spec: LayerSpec, expected: number): Layer {
  if (spec.dtype !== 'uint8' && spec.dtype !== 'uint16') throw new Error(`${spec.file}: unsupported dtype ${spec.dtype}`)
  const u16 = spec.dtype === 'uint16'
  const m = buf.byteLength / (u16 ? 2 : 1)
  if (m !== expected) throw new Error(`${spec.file}: expected ${expected} values, got ${m}`)
  return { data: u16 ? new Uint16Array(buf) : new Uint8Array(buf), scale: spec.scale, offset: spec.offset, nodata: u16 ? 65535 : 255 }
}

export function layerValue(l: Layer, i: number): number {
  const q = l.data[i]
  return q === l.nodata ? NaN : l.offset + q * l.scale
}

// The data contract: land-cell flat indices, strictly increasing, inside the grid (a bad file would mis-map every layer).
export function checkCells(cells: Uint32Array): Uint32Array {
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] >= W * H) throw new Error(`cells.bin.gz: index ${i} (${cells[i]}) is outside the grid`)
    if (i > 0 && cells[i] <= cells[i - 1]) throw new Error(`cells.bin.gz: index ${i} (${cells[i]}) is not above the previous one`)
  }
  return cells
}

export function buildLookup(cells: Uint32Array): Int32Array {
  const lookup = new Int32Array(W * H).fill(-1)
  cells.forEach((flat, i) => { lookup[flat] = i })
  return lookup
}

// Flat grid index (row * W + col) of the cell holding the point; -1 outside the grid.
export function flatIndex(lat: number, lon: number): number {
  if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon < 180)) return -1 // also NaN
  const r = Math.min(Math.floor((90 - lat) / RES), H - 1) // lat -90 belongs to the last row
  return r * W + Math.floor((lon + 180) / RES)
}

export function cellAt(lookup: Int32Array, lat: number, lon: number): number {
  const f = flatIndex(lat, lon)
  return f < 0 ? -1 : lookup[f]
}

export type City = [name: string, nameRu: string | null, iso2: string, lat: number, lon: number, population: number]
export interface CountryName { name: string; nameRu: string | null }

const str = (v: unknown) => typeof v === 'string'

export function checkCities(x: unknown): City[] {
  const ok = Array.isArray(x) && x.every((c) =>
    Array.isArray(c) && c.length === 6 && str(c[0]) && (c[1] === null || str(c[1])) && str(c[2]) &&
    typeof c[3] === 'number' && typeof c[4] === 'number' && typeof c[5] === 'number')
  if (!ok) throw new Error('cities.json: invalid')
  return x as City[]
}

export function checkCountries(x: unknown): [string, CountryName][] {
  const e = typeof x === 'object' && x !== null && !Array.isArray(x) ? Object.entries(x) : null
  if (!e || !e.every(([, v]) => str(v?.name) && (v.nameRu === null || str(v.nameRu)))) throw new Error('countries.json: invalid')
  return e
}
