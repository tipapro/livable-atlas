import { expect, test } from 'vitest'
import { breakdown } from '../../src/scoring/breakdown'
import { CALIFORNIA } from '../../src/scoring/presets'

test('breakdown sorts by lost score, then weight; flags key factors', () => {
  const sample = {
    score: 70,
    factors: {
      warm_tmax: { value: 31, s: 0.5, lost: 12 },
      hdi: { value: 0.9, s: 1, lost: 0 },
      homicide: { value: 5, s: 0.8, lost: 3 },
      price_level: { value: 1.3, s: 0.2, lost: 0 },
      pm25: { value: 9, s: 0.9, lost: 3 },
    },
  }
  const f = {
    ...CALIFORNIA.factors,
    warm_tmax: { ...CALIFORNIA.factors.warm_tmax, weight: 5, critical: true },
    hdi: { ...CALIFORNIA.factors.hdi, weight: 3 },
    homicide: { ...CALIFORNIA.factors.homicide, weight: 2, critical: false },
    pm25: { ...CALIFORNIA.factors.pm25, weight: 4 },
    price_level: { ...CALIFORNIA.factors.price_level, weight: 0 },
  }
  const rows = breakdown(sample, f)
  // pm25 beats homicide on the lost tie by weight; hdi (weight 3) beats price_level (0) at lost 0
  expect(rows.map(r => r.id)).toEqual(['warm_tmax', 'pm25', 'homicide', 'hdi', 'price_level'])
  expect(rows[0]).toEqual({ id: 'warm_tmax', value: 31, s: 0.5, weight: 5, lost: 12, key: true })
  expect(rows.map(r => r.key)).toEqual([true, true, false, true, false])
})
