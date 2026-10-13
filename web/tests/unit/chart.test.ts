import { expect, test } from 'vitest'
import { chartGeometry, chartSummary } from '../../src/ui/ClimateChart'

const nums = (n: number, step = 1, from = 0) => Array.from({ length: n }, (_, i) => from + i * step)
const tmax = nums(12, 1, 10), tmin = nums(12), prec = nums(12, 10)

test('chartGeometry scales lines, bars and the temperature axis', () => {
  const g = chartGeometry({ tmax, tmin, prec }, 240, 120)
  expect(g.tmax.split(' ')).toHaveLength(12)
  expect(g.tmin.split(' ')).toHaveLength(12)
  expect(g.bars).toHaveLength(12)
  expect(g.tMin).toBe(0)
  expect(g.tMax).toBe(25)
  expect(g.pMax).toBe(110)
  expect(g.bars[11]).toMatchObject({ y: 0, h: 120 })
  expect(g.bars[0].h).toBe(0)
  expect(g.tmin.split(' ')[0].split(',')[1]).toBe('120') // tmin 0 sits on the axis floor
})

test('chartGeometry without precipitation has no bars', () => {
  expect(chartGeometry({ tmax, tmin, prec: null }, 240, 120).bars).toEqual([])
})

test('chartGeometry skips NaN months', () => {
  const m = [...tmax]
  m[3] = NaN
  expect(chartGeometry({ tmax: m, tmin, prec }, 240, 120).tmax.split(' ')).toHaveLength(11)
})

test('chartGeometry takes the axis floor from the highs when every tmin is NaN', () => {
  const g = chartGeometry({ tmax: [20, ...Array(11).fill(20)], tmin: Array(12).fill(NaN), prec: null }, 240, 100)
  expect(g.tMin).toBe(15)
})

test('chartSummary reports null for parts without finite values', () => {
  const nan = Array(12).fill(NaN)
  expect(chartSummary({ tmax, tmin: nan, prec })).toEqual({ tmax: 21, tmin: null, prec: 660 })
  expect(chartSummary({ tmax: nan, tmin: nan, prec: null })).toEqual({ tmax: null, tmin: null, prec: null })
  expect(chartSummary({ tmax: nan, tmin: nan, prec: nan })).toEqual({ tmax: null, tmin: null, prec: null })
})
