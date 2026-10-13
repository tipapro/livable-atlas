import { layerValue, type Layer } from '../data/format'
import { FACTORS, GROUPS, type ComfortSettings, type FactorId, type FactorSettings, type ScoreSettings } from './factors'

export const KEY_FLOOR = 0.3 // no single key factor removes more than 70 % of the score
export const NODATA = 255

export type Layers = Partial<Record<FactorId, Layer>>
const EPS = 1e-6
const log10 = (v: number) => Math.log10(Math.max(v, EPS))

const trapezoid = (x: number, lo: number, hi: number, tol: number) => {
  const d = Math.max(lo - x, 0, x - hi)
  return tol > 0 ? Math.max(0, 1 - d / tol) : d === 0 ? 1 : 0
}

export function factorScore(v: number, f: FactorSettings, log: boolean): number {
  return log ? trapezoid(log10(v), log10(f.lo), log10(f.hi), f.tol) : trapezoid(v, f.lo, f.hi, f.tol)
}

// Months (cell-major, i*12+m) where tmax is in [dayLo, dayHi], tmin >= nightMin and tdew <= dewMax.
export function comfortMonths(tmax: Layer, tmin: Layer, tdew: Layer, c: ComfortSettings, n: number): Layer {
  // Raw arrays and scalars hoisted out of the loop: layerValue per month costs ~3x here.
  const { data: xd, offset: xo, scale: xs, nodata: xn } = tmax
  const { data: nd, offset: no, scale: ns, nodata: nn } = tmin
  const { data: dd, offset: doff, scale: ds, nodata: dn } = tdew
  const data = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    let count = 0, bad = false
    for (let k = i * 12, end = k + 12; k < end; k++) {
      const qx = xd[k], qn = nd[k], qd = dd[k]
      if (qx === xn || qn === nn || qd === dn) { bad = true; break }
      const hi = xo + qx * xs
      if (hi >= c.dayLo && hi <= c.dayHi && no + qn * ns >= c.nightMin && doff + qd * ds <= c.dewMax) count++
    }
    data[i] = bad ? NODATA : count
  }
  return { data, scale: 1, offset: 0, nodata: NODATA }
}

// Multiplier for a key factor lying d outside its range (log10 units for log factors): 1 inside, 1 − k at the edge of the tolerance, KEY_FLOOR at the lowest.
export const keyPenalty = (d: number, tol: number, k: number): number =>
  k === 0 ? 1 : tol > 0 ? Math.max(KEY_FLOOR, 1 - k * (d / tol) ** 2) : d === 0 ? 1 : KEY_FLOOR

// cold_feel = cold_tmax + bonus · cold_sun / 100, quantised like the TerraClimate temperatures (0.5 °C from −60).
export function coldFeel(coldTmax: Layer, coldSun: Layer, bonus: number, n: number): Layer {
  const { data: xd, offset: xo, scale: xs, nodata: xn } = coldTmax
  const { data: sd, offset: so, scale: ss, nodata: sn } = coldSun
  const data = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    data[i] = xd[i] === xn || sd[i] === sn ? NODATA : Math.min(254, Math.max(0, Math.round((xo + xd[i] * xs + bonus * (so + sd[i] * ss) / 100 + 60) / 0.5)))
  }
  return { data, scale: 0.5, offset: -60, nodata: NODATA }
}

// The layers plus the ones computed in the browser from the settings: comfort_months and cold_feel.
export function derivedLayers(layers: Layers, monthly: Partial<Record<'tmax' | 'tmin' | 'tdew', Layer>>, comfort: ComfortSettings, n: number): Layers {
  const out = { ...layers }
  const { tmax, tmin, tdew } = monthly
  if (tmax && tmin && tdew) out.comfort_months = comfortMonths(tmax, tmin, tdew, comfort, n)
  if (layers.cold_tmax && layers.cold_sun) out.cold_feel = coldFeel(layers.cold_tmax, layers.cold_sun, comfort.sunBonus, n)
  return out
}

// Factors that take part in the score (weight > 0 and a layer), with log-scale bounds precomputed.
function activeFactors(layers: Layers, f: Record<FactorId, FactorSettings>) {
  const active = []
  for (const d of FACTORS) {
    const layer = layers[d.id], s = f[d.id]
    if (!layer || s.weight <= 0) continue
    const log = d.log === true
    active.push({ id: d.id, layer, log, lo: log ? log10(s.lo) : s.lo, hi: log ? log10(s.hi) : s.hi, tol: s.tol, weight: s.weight, key: s.critical, group: GROUPS.indexOf(d.group) })
  }
  return active
}
type Active = ReturnType<typeof activeFactors>

// Per-group sums, reused so the per-cell loop allocates nothing.
const gSum = new Float64Array(GROUPS.length), gWeight = new Float64Array(GROUPS.length)

// Group means weighted by group, times the key penalties (none from a zero-weight group); NODATA when no group has data and weight.
function cellScore(i: number, active: Active, groupW: Float64Array, k: number): number {
  gSum.fill(0); gWeight.fill(0)
  let penalty = 1
  for (const a of active) {
    const q = a.layer.data[i]
    if (q === a.layer.nodata) continue
    const v = a.layer.offset + q * a.layer.scale
    const x = a.log ? log10(v) : v
    const d = Math.max(a.lo - x, 0, x - a.hi)
    gSum[a.group] += a.weight * (a.tol > 0 ? Math.max(0, 1 - d / a.tol) : d === 0 ? 1 : 0)
    gWeight[a.group] += a.weight
    if (a.key && groupW[a.group] > 0) penalty *= keyPenalty(d, a.tol, k)
  }
  let num = 0, den = 0
  for (let g = 0; g < groupW.length; g++) {
    if (gWeight[g] === 0) continue
    num += groupW[g] * gSum[g] / gWeight[g]
    den += groupW[g]
  }
  return den === 0 ? NODATA : Math.round(100 * num / den * penalty)
}

const groupWeights = (s: ScoreSettings) => Float64Array.from(GROUPS, g => s.groups[g])

export function scoreCells(layers: Layers, n: number, s: ScoreSettings): Uint8Array {
  const active = activeFactors(layers, s.factors), w = groupWeights(s), out = new Uint8Array(n)
  for (let i = 0; i < n; i++) out[i] = cellScore(i, active, w, s.strength)
  return out
}

// lost: what the score would gain if this factor were perfect (s = 1, no penalty).
export interface PointSample { score: number; factors: Partial<Record<FactorId, { value: number; s: number; lost: number }>> }

// Reports every factor with data (even weight 0, for reference); score uses weight > 0 only.
export function samplePoint(layers: Layers, i: number, s: ScoreSettings): PointSample {
  const active = activeFactors(layers, s.factors), w = groupWeights(s)
  const score = cellScore(i, active, w, s.strength)
  const factors: PointSample['factors'] = {}
  for (const d of FACTORS) {
    const layer = layers[d.id]
    if (!layer) continue
    const value = layerValue(layer, i)
    if (value !== value) continue
    let lost = 0
    const a = active.find(x => x.id === d.id)
    if (a && score !== NODATA) {
      // Open the range directly: log10(-Infinity) would be clamped to a finite number.
      const { lo, hi } = a
      a.lo = -Infinity; a.hi = Infinity
      lost = cellScore(i, active, w, s.strength) - score
      a.lo = lo; a.hi = hi
    }
    factors[d.id] = { value, s: factorScore(value, s.factors[d.id], d.log === true), lost }
  }
  return { score, factors }
}
