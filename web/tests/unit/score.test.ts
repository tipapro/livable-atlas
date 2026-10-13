import { expect, test } from 'vitest'
import type { Layer, Manifest } from '../../src/data/format'
import { FACTORS, GROUPS, isAvailable, type FactorId, type FactorSettings, type ScoreSettings } from '../../src/scoring/factors'
import { CALIFORNIA } from '../../src/scoring/presets'
import { KEY_FLOOR, coldFeel, comfortMonths, derivedLayers, factorScore, keyPenalty, samplePoint, scoreCells } from '../../src/scoring/score'
import { layerValue } from '../../src/data/format'

const f = (lo: number, hi: number, tol: number, extra = {}): FactorSettings => ({ lo, hi, tol, weight: 1, critical: false, ...extra })
const u8 = (...q: number[]): Layer => ({ data: Uint8Array.from(q), scale: 1, offset: 0, nodata: 255 })
// Every factor off except the given ones.
const only = (on: Partial<Record<FactorId, FactorSettings>>) => {
  const all = Object.fromEntries(FACTORS.map(d => [d.id, { ...f(0, 0, 0), weight: 0 }])) as Record<FactorId, FactorSettings>
  return { ...all, ...on }
}

const ones = Object.fromEntries(GROUPS.map(g => [g, 1])) as ScoreSettings['groups']
const settings = (factors: Record<FactorId, FactorSettings>, extra: Partial<ScoreSettings> = {}): ScoreSettings =>
  ({ factors, comfort: CALIFORNIA.comfort, groups: ones, strength: 0.25, ...extra })

test('trapezoid', () => {
  const t = f(22, 29, 7)
  expect(factorScore(25, t, false)).toBe(1); expect(factorScore(32.5, t, false)).toBe(0.5)
  expect(factorScore(18.5, t, false)).toBe(0.5); expect(factorScore(36, t, false)).toBe(0)
  expect(factorScore(NaN, t, false)).toBeNaN()
})
test('tol 0 is a hard step', () => {
  expect(factorScore(0, f(0, 0, 0), false)).toBe(1); expect(factorScore(1, f(0, 0, 0), false)).toBe(0)
})
test('log factor uses decades', () => {
  const p = f(100, 3000, 1)
  expect(factorScore(1000, p, true)).toBe(1); expect(factorScore(10, p, true)).toBe(0)
  expect(factorScore(10 ** 1.5, p, true)).toBeCloseTo(0.5)
})
test('weighted mean within a group, missing data', () => {
  // A = warm_tmax, range 10..10 tol 0: s=1 for q=10. B = warm_tmin, range 10..10 tol 0: s=1 for q=10, else 0.
  const A = u8(10, 10, 10, 255, 255), B = u8(10, 0, 255, 10, 255)
  const a = f(10, 10, 0, { weight: 3 }), b = f(10, 10, 0, { weight: 1 })
  const layers = { warm_tmax: A, warm_tmin: B }
  expect(Array.from(scoreCells(layers, 5, settings(only({ warm_tmax: a, warm_tmin: b }))))).toEqual([
    100, // both s=1
    75, // A s=1 w=3, B s=0 w=1
    100, // B nodata: A only
    100, // A nodata: B only
    255, // no data at all
  ])
  // weight 0 ignores the factor
  expect(Array.from(scoreCells(layers, 5, settings(only({ warm_tmax: a, warm_tmin: { ...b, weight: 0 } }))))).toEqual([100, 100, 100, 255, 255])
  // weight > 0 but no layer -> skipped
  expect(Array.from(scoreCells({ warm_tmax: A }, 3, settings(only({ warm_tmax: a, warm_tmin: b }))))).toEqual([100, 100, 100])
  // no factor has a layer -> nodata
  expect(Array.from(scoreCells({}, 2, settings(only({ warm_tmax: a }))))).toEqual([255, 255])
})
test('group mean then group weights', () => {
  // warm_tmax (climate) s=1, hdi (country) s=0; climate W=3, country W=1 -> 75
  const layers = { warm_tmax: u8(10), hdi: u8(0) }
  const s = settings(only({ warm_tmax: f(10, 10, 0), hdi: f(10, 10, 0) }), { groups: { ...ones, climate: 3, country: 1 } })
  expect(Array.from(scoreCells(layers, 1, s))).toEqual([75])
})
test('many factors in one group do not outweigh another group', () => {
  const layers = { warm_tmax: u8(10), warm_tmin: u8(10), cold_tmax: u8(10), hdi: u8(0) }
  const on = f(10, 10, 0)
  expect(Array.from(scoreCells(layers, 1, settings(only({ warm_tmax: on, warm_tmin: on, cold_tmax: on, hdi: on }), { groups: { ...ones, climate: 2, country: 2 } })))).toEqual([50])
})
test('a group without data is skipped; all group weights 0 gives nodata', () => {
  const layers = { warm_tmax: u8(10) }
  const on = only({ warm_tmax: f(10, 10, 0), hdi: f(10, 10, 0) })
  expect(Array.from(scoreCells(layers, 1, settings(on)))).toEqual([100]) // hdi has no layer
  expect(Array.from(scoreCells(layers, 1, settings(on, { groups: { ...ones, climate: 0 } })))).toEqual([255])
  expect(Array.from(scoreCells(layers, 1, settings(on, { groups: Object.fromEntries(GROUPS.map(g => [g, 0])) as ScoreSettings['groups'] })))).toEqual([255])
})
test('key penalty shape', () => {
  expect(keyPenalty(0, 7, 0.25)).toBe(1)
  expect(keyPenalty(7, 7, 0.25)).toBeCloseTo(0.75)
  expect(keyPenalty(70, 7, 0.25)).toBe(KEY_FLOOR)
})
test('key penalty with tol 0', () => {
  expect(keyPenalty(0, 0, 0.25)).toBe(1); expect(keyPenalty(1, 0, 0.25)).toBe(KEY_FLOOR)
  expect(keyPenalty(1, 0, 0)).toBe(1) // strength 0 disables every key penalty (R1)
})
test('key factor multiplies the score; nodata or weight 0 does not', () => {
  // warm_tmax key, range 10..10 tol 10, value 20 -> s=0, m=0.75; warm_tmin s=1 in the same group -> base 0.5 x 0.75 = 37.5
  const key = f(10, 10, 10, { critical: true })
  const layers = { warm_tmax: u8(20), warm_tmin: u8(10) }
  const on = f(10, 10, 0)
  expect(Array.from(scoreCells(layers, 1, settings(only({ warm_tmax: key, warm_tmin: on }))))).toEqual([38])
  expect(Array.from(scoreCells(layers, 1, settings(only({ warm_tmax: key }))))).toEqual([0])
  expect(Array.from(scoreCells({ warm_tmax: u8(255), warm_tmin: u8(10) }, 1, settings(only({ warm_tmax: key, warm_tmin: on }))))).toEqual([100])
  expect(Array.from(scoreCells(layers, 1, settings(only({ warm_tmax: { ...key, weight: 0 }, warm_tmin: on }))))).toEqual([100])
  // strength 0 turns the penalty off
  expect(Array.from(scoreCells(layers, 1, settings(only({ warm_tmax: key, warm_tmin: on }), { strength: 0 })))).toEqual([50])
})
test('a key factor in a zero-weight group does not penalise (R4)', () => {
  const key = f(10, 10, 0, { critical: true }) // tol 0, value 20: far outside
  const layers = { warm_tmax: u8(20), hdi: u8(10) }
  const on = only({ warm_tmax: key, hdi: f(10, 10, 0) })
  expect(Array.from(scoreCells(layers, 1, settings(on, { groups: { ...ones, climate: 0 } })))).toEqual([100]) // country only
  expect(Array.from(scoreCells(layers, 1, settings(on)))).toEqual([15]) // 0.5 x KEY_FLOOR
})
test('log key factor measures distance in decades', () => {
  // pop_density key, lo=hi=100, tol 1 decade, value 1000 -> s=0, m=0.75; travel_city s=1 in the same group
  const layers = { pop_density: { data: Uint8Array.of(250), scale: 4, offset: 0, nodata: 255 }, travel_city: u8(10) }
  const s = settings(only({ pop_density: f(100, 100, 1, { critical: true }), travel_city: f(10, 10, 0) }))
  expect(Array.from(scoreCells(layers, 1, s))).toEqual([38])
})
test('no code 254 is ever produced', () => {
  const s = settings(only({ warm_tmax: f(10, 10, 0, { critical: true }), warm_tmin: f(10, 10, 0) }))
  const out = Array.from(scoreCells({ warm_tmax: u8(200), warm_tmin: u8(10) }, 1, s))
  expect(out[0]).toBeLessThanOrEqual(100)
  expect(out[0]).toBe(15) // base 0.5 x floor 0.3
})
test('coldFeel clamps and propagates nodata', () => {
  const tmax: Layer = { data: Uint8Array.from([120, 255, 120, 250]), scale: 0.5, offset: -60, nodata: 255 } // 0 °C, nodata, 0 °C, 65 °C
  const sun: Layer = { data: Uint8Array.from([100, 100, 255, 200]), scale: 0.5, offset: 0, nodata: 255 } // 50 %, 50 %, nodata, 100 %
  const out = coldFeel(tmax, sun, 8, 4)
  expect(Array.from({ length: 4 }, (_, i) => layerValue(out, i))).toEqual([4, NaN, NaN, 67]) // 65 + 8 clamps to 67
  expect(out).toMatchObject({ scale: 0.5, offset: -60, nodata: 255 })
})
test('derivedLayers adds comfort_months and cold_feel only when inputs exist', () => {
  const c = CALIFORNIA.comfort
  const m12 = u8(...Array(12).fill(20))
  const tmax: Layer = { data: Uint8Array.of(120), scale: 0.5, offset: -60, nodata: 255 }
  const sun: Layer = { data: Uint8Array.of(100), scale: 0.5, offset: 0, nodata: 255 }
  expect(Object.keys(derivedLayers({}, {}, c, 1))).toEqual([])
  expect(Object.keys(derivedLayers({ cold_tmax: tmax }, { tmax: m12 }, c, 1))).toEqual(['cold_tmax'])
  const all = derivedLayers({ cold_tmax: tmax, cold_sun: sun }, { tmax: m12, tmin: m12, tdew: m12 }, c, 1)
  expect(Object.keys(all).sort()).toEqual(['cold_feel', 'cold_sun', 'cold_tmax', 'comfort_months'])
  expect(layerValue(all.cold_feel!, 0)).toBe(0 + c.sunBonus * 0.5)
})
test('samplePoint reports every factor with data, scores like scoreCells', () => {
  const layers = { warm_tmax: u8(10, 0), warm_tmin: u8(10, 255), hdi: u8(5, 5) }
  const s = settings(only({ warm_tmax: f(10, 10, 0, { weight: 3 }), warm_tmin: f(10, 10, 0), hdi: f(5, 5, 0, { weight: 0 }) }))
  expect(samplePoint(layers, 0, s)).toEqual({ score: 100, factors: { warm_tmax: { value: 10, s: 1, lost: 0 }, warm_tmin: { value: 10, s: 1, lost: 0 }, hdi: { value: 5, s: 1, lost: 0 } } })
  const p = samplePoint(layers, 1, s) // warm_tmin nodata, warm_tmax s=0
  expect(p.score).toBe(0)
  expect(p.factors).toEqual({ warm_tmax: { value: 0, s: 0, lost: 100 }, hdi: { value: 5, s: 1, lost: 0 } })
  expect(samplePoint({ hdi: u8(5) }, 0, s).score).toBe(255)
})
test('samplePoint lost is the gain from making that factor perfect', () => {
  const layers = { warm_tmax: u8(10), warm_tmin: u8(0) }
  const s = settings(only({ warm_tmax: f(10, 10, 0), warm_tmin: f(10, 10, 0) }))
  const p = samplePoint(layers, 0, s)
  expect(p.score).toBe(50)
  expect(p.factors.warm_tmin!.lost).toBe(50); expect(p.factors.warm_tmax!.lost).toBe(0)
  expect(p.score).toBe(scoreCells(layers, 1, s)[0])
  // a key factor's lost includes its penalty; log factors open up without going through log10(-Infinity)
  const key = settings(only({ pop_density: f(100, 100, 1, { critical: true }), travel_city: f(10, 10, 0) }))
  const lg = { pop_density: { data: Uint8Array.of(250), scale: 4, offset: 0, nodata: 255 }, travel_city: u8(10) }
  expect(samplePoint(lg, 0, key).factors.pop_density!.lost).toBe(62) // 100 with the factor perfect (s=1, m=1) minus 38
})
test('scoreCells scores log factors in decades', () => {
  const s = settings(only({ pop_density: f(100, 3000, 1) }))
  expect(Array.from(scoreCells({ pop_density: u8(10, 100, 100) }, 3, s))).toEqual([0, 100, 100])
  expect(Array.from(scoreCells({ pop_density: { data: Uint8Array.of(31), scale: 1, offset: 0, nodata: 255 } }, 1, s))).toEqual([Math.round(100 * (1 - (2 - Math.log10(31))))])
})
test('comfortMonths counts months within comfort', () => {
  const c = { dayLo: 18, dayHi: 30, nightMin: 8, dewMax: 17, sunBonus: 0 }
  const month = (fill: number[]) => u8(...fill)
  const tmax0 = [10, 18, 30, 31, 18, 18, 18, 18, 18, 18, 18, 18]
  const tmin0 = [20, 20, 20, 20, 7, 20, 20, 20, 20, 20, 20, 20] // month 4 too cold at night
  const tdew0 = [0, 0, 0, 0, 0, 18, 0, 0, 0, 0, 0, 0] // month 5 too muggy
  // cell 1: month 0 has nodata tmax -> 255
  const tmax1 = [255, ...Array(11).fill(20)]
  const out = comfortMonths(month([...tmax0, ...tmax1]), month([...tmin0, ...Array(12).fill(20)]), month([...tdew0, ...Array(12).fill(0)]), c, 2)
  // cell 0: month 0 too cold by day, 3 too hot, 4 too cold at night, 5 too muggy; months 1, 2 and 6..11 pass
  expect(Array.from(out.data)).toEqual([8, 255])
  // bounds are inclusive: tmin == nightMin and tdew == dewMax count
  expect(comfortMonths(u8(...Array(12).fill(20)), u8(...Array(12).fill(8)), u8(...Array(12).fill(17)), c, 1).data[0]).toBe(12)
  expect(out).toMatchObject({ scale: 1, offset: 0, nodata: 255 })
  expect(out.data).toBeInstanceOf(Uint8Array)
})
test('CALIFORNIA covers every factor', () => {
  expect(Object.keys(CALIFORNIA.factors).sort()).toEqual(FACTORS.map(d => d.id).sort())
})
test('isAvailable', () => {
  const spec = { file: '', dtype: 'uint8' as const, scale: 1, offset: 0, unit: '', source: '' }
  const m = { layers: { hdi: spec }, monthly: { tmax: spec, tmin: spec } } as unknown as Manifest
  expect(isAvailable('hdi', m)).toBe(true); expect(isAvailable('pm25', m)).toBe(false)
  expect(isAvailable('comfort_months', m)).toBe(false)
  expect(isAvailable('comfort_months', { ...m, monthly: { ...m.monthly, tdew: spec } })).toBe(true)
})

test('gdp_pc scores on a log trapezoid (full 50k–650k, zero 0.7 decades below)', () => {
  const g = CALIFORNIA.factors.gdp_pc
  expect(factorScore(650000, g, true)).toBe(1)
  expect(factorScore(633470, g, true)).toBe(1) // the real data maximum
  expect(factorScore(50000, g, true)).toBe(1); expect(factorScore(9000, g, true)).toBe(0)
  const mid = factorScore(25000, g, true)
  expect(mid).toBeGreaterThan(0.5); expect(mid).toBeLessThan(0.6)
})
