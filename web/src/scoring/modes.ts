import { isAvailable, FACTORS, type FactorId } from './factors'
import type { Layer, Manifest } from '../data/format'

export type MonthlyVar = 'tmax' | 'tmin' | 'tdew' | 'prec'
export type MapMode = 'score' | `factor:${FactorId}` | `monthly:${MonthlyVar}`

export const MONTHLY_RANGE: Record<MonthlyVar, { min: number; max: number; unit: string }> = {
  tmax: { min: -40, max: 45, unit: '°C' },
  tmin: { min: -40, max: 45, unit: '°C' },
  tdew: { min: -40, max: 45, unit: '°C' },
  prec: { min: 0, max: 400, unit: 'mm' },
}

export function parseMode(s: unknown): MapMode | null {
  if (s === 'score') return 'score'
  if (typeof s !== 'string') return null
  const [kind, id, ...rest] = s.split(':')
  if (rest.length) return null
  if (kind === 'factor' && FACTORS.some((f) => f.id === id)) return s as MapMode
  if (kind === 'monthly' && Object.hasOwn(MONTHLY_RANGE, id)) return s as MapMode
  return null
}

export function modeRange(mode: Exclude<MapMode, 'score'>): { min: number; max: number; unit: string; log: boolean } {
  const [kind, id] = mode.split(':')
  if (kind === 'monthly') return { ...MONTHLY_RANGE[id as MonthlyVar], log: false }
  const { min, max, unit, log } = FACTORS.find((f) => f.id === id)!
  return { min, max, unit, log: log === true }
}

// Raw layer values mapped to 0-100 over [min, max] (log10 axis when log); nodata -> 255. With month (1-12) the layer is cell-major monthly.
export function classify(layer: Layer, n: number, min: number, max: number, log: boolean, month?: number): Uint8Array {
  const f = log ? (v: number) => Math.log10(Math.max(v, 1e-6)) : (v: number) => v
  const lo = f(min), span = f(max) - lo
  const { data, scale, offset, nodata } = layer
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const q = data[month ? i * 12 + month - 1 : i]
    out[i] = q === nodata ? 255 : Math.min(100, Math.max(0, Math.round((100 * (f(offset + q * scale) - lo)) / span)))
  }
  return out
}

export const isModeAvailable = (mode: MapMode, m: Manifest): boolean => {
  if (mode === 'score') return true
  const id = mode.split(':')[1]
  return mode.startsWith('factor:') ? isAvailable(id as FactorId, m) : id in m.monthly
}
