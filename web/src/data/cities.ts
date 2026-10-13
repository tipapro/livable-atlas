import type { City } from './format'

const R = 6371.0088 // km
const rad = Math.PI / 180

// Great-circle (haversine) distance to the closest city; linear scan.
export function nearestCity(cities: City[], lat: number, lon: number): { index: number; km: number } {
  let index = -1, best = Infinity
  cities.forEach((c, k) => {
    const h = Math.sin((c[3] - lat) * rad / 2) ** 2 + Math.cos(lat * rad) * Math.cos(c[3] * rad) * Math.sin((c[4] - lon) * rad / 2) ** 2
    if (h < best) { best = h; index = k }
  })
  return { index, km: 2 * R * Math.asin(Math.sqrt(Math.min(best, 1))) }
}

export const TOP_MIN_POP = 100_000
export const TOP_N = 20

// Best cities by the score of their cell: 255 (nodata) is left out; ties keep population order.
export function topCities(scores: Uint8Array, cityCells: Int32Array, candidates: Int32Array, k: number): [number, number][] {
  const out: [number, number][] = []
  for (const c of candidates) {
    const s = scores[cityCells[c]]
    if (s !== 255) out.push([c, s])
  }
  return out.sort((a, b) => b[1] - a[1]).slice(0, k)
}

// NFD already folds ё→е and й→и; done the same way for the query and the names, so it only adds matches.
export const normalizeName = (s: string) => s.trim().toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ё/g, 'е')

const normalized = new WeakMap<City[], [string, string][]>()

// Prefix match on either name, case/diacritics/ё-insensitive, in file (population) order.
export function searchCities(cities: City[], query: string, limit = 10): number[] {
  const q = normalizeName(query)
  const out: number[] = []
  if (!q) return out
  let names = normalized.get(cities)
  if (!names) normalized.set(cities, (names = cities.map(c => [normalizeName(c[0]), normalizeName(c[1] ?? '')])))
  for (let i = 0; i < cities.length && out.length < limit; i++) {
    if (names[i][0].startsWith(q) || names[i][1].startsWith(q)) out.push(i)
  }
  return out
}
