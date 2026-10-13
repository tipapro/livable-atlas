import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { cellAt, layerValue } from '../../src/data/format'
import { loadAtlas, type Atlas } from '../../src/data/load'
import { FACTORS } from '../../src/scoring/factors'
import { CALIFORNIA } from '../../src/scoring/presets'
import { derivedLayers, samplePoint, scoreCells } from '../../src/scoring/score'

const PLACES = {
  'San Diego': [32.7157, -117.1611],
  'Los Angeles': [34.0522, -118.2437],
  Lisbon: [38.7223, -9.1393],
  Vladivostok: [43.1155, 131.8855],
  Novosibirsk: [55.0084, 82.9357],
  Singapore: [1.3521, 103.8198],
  'Death Valley': [36.5054, -117.0794],
  // Perceived-climate places (spec §1, phase 6)
  Malaga: [36.72, -4.42], Valencia: [39.47, -0.38], Perth: [-31.95, 115.86], Adelaide: [-34.93, 138.6], Athens: [37.98, 23.73],
  London: [51.51, -0.13], Manchester: [53.48, -2.24], Hamburg: [53.55, 9.99], Seattle: [47.61, -122.33], Vancouver: [49.28, -123.12],
  Denver: [39.74, -104.99], Chicago: [41.88, -87.63], Moscow: [55.76, 37.62], 'St Petersburg': [59.94, 30.31],
  // Factor balance (spec §1, phase 7)
  Khabarovsk: [48.48, 135.08], Tomsk: [56.48, 84.95],
  // Desert vs the Volga (phase 7, human: an uninhabitable desert must not beat a Volga city)
  Kufra: [24.2, 23.3], 'Great Sand Sea': [26.5, 25.5], 'Erg Chech': [24, -2], Tamanrasset: [22.79, 5.52], Ghardaia: [32.49, 3.67], Sebha: [27.04, 14.43], Aswan: [24.09, 32.9],
  Yaroslavl: [57.63, 39.87], 'Nizhny Novgorod': [56.33, 44.0], Kazan: [55.79, 49.12], Samara: [53.2, 50.15], Saratov: [51.53, 46.03], Volgograd: [48.71, 44.51],
  Delhi: [28.61, 77.21], Bangalore: [12.97, 77.59], 'Mexico City': [19.43, -99.13], 'Cape Town': [-33.92, 18.42], Nairobi: [-1.29, 36.82],
  // Regional wealth (phase 8): points 30 and 150 km east of Moscow along 55.75° N (62.65 km per degree of longitude there)
  'Moscow +30': [55.75, 38.1], 'Moscow +150': [55.75, 40.01], Bucharest: [44.43, 26.1], Ploiesti: [44.94, 26.02],
  // Empty land with a mild climate (phase 8: "any city is better than nothing"); travel to a 50k city 1400, 1944, 949 min
  Nullarbor: [-31, 129], 'Great Victoria Desert': [-29, 128], 'Alice Springs': [-23.7, 133.88],
  // Rainy but livable (phase 8): 1700, 1100, 1200 mm a year
  Sochi: [43.6, 39.73], Brisbane: [-27.47, 153.03], Porto: [41.15, -8.61],
  // North African coast (phase 8: good climate, weak economy)
  Oran: [35.7, -0.63], Algiers: [36.75, 3.06], Tunis: [36.81, 10.18], Rabat: [34.02, -6.84],
} as const
type Place = keyof typeof PLACES

const publicDir = fileURLToPath(new URL('../../public/', import.meta.url))
const fetchFn = (async (url: string) => new Response(readFileSync(publicDir + url))) as unknown as typeof fetch

let atlas: Atlas
let layers: Atlas['layers']
// Sources behind the weighted factors (acag/pm25 is a manual download; countries produces no factor).
const REQUIRED = ['terraclimate', 'cru', 'etopo', 'coast', 'ibtracs', 'gem', 'gfed', 'jrc_flood', 'nelson', 'ghsl', 'geonames', 'ourairports', 'undp', 'worldbank', 'kummu']
const missing = (() => {
  try {
    const have = JSON.parse(readFileSync(publicDir + 'data/manifest.json', 'utf8')).sources ?? {}
    return REQUIRED.filter((id) => !(id in have))
  } catch { return REQUIRED }
})()
const real = missing.length === 0
if (!real) console.warn(`golden criteria skipped: web/public/data lacks sources ${missing.join(', ')}; run \`atlas build\``)

const sample = (name: Place) => {
  const [lat, lon] = PLACES[name]
  return samplePoint(layers, cellAt(atlas.lookup, lat, lon), CALIFORNIA)
}
const score = (name: Place) => sample(name).score

describe.skipIf(!real)('golden criteria (spec §1, real data)', () => {
  beforeAll(async () => {
    atlas = await loadAtlas('data/', fetchFn)
    layers = derivedLayers(atlas.layers, atlas.monthly, CALIFORNIA.comfort, atlas.n)
    if (!process.env.GOLDEN_TABLE) return
    // Calibration aid: per-factor value and partial score for the two reference places.
    for (const name of ['San Diego', 'Los Angeles'] as const) {
      const { score: total, factors } = sample(name)
      console.info(`${name} total=${total}`)
      console.table(Object.entries(factors).map(([factor, { value, s }]) => ({ place: name, factor, value: +value.toFixed(3), s: +s.toFixed(2) })))
    }
  })

  it('San Diego >= 85', () => expect(score('San Diego')).toBeGreaterThanOrEqual(85))
  it('Los Angeles >= 80', () => expect(score('Los Angeles')).toBeGreaterThanOrEqual(80))
  it('Lisbon >= 70', () => expect(score('Lisbon')).toBeGreaterThanOrEqual(70))
  it('Novosibirsk <= 30', () => expect(score('Novosibirsk')).toBeLessThanOrEqual(30))
  it('Singapore <= 50', () => expect(score('Singapore')).toBeLessThanOrEqual(50))
  it('Death Valley <= 30', () => expect(score('Death Valley')).toBeLessThanOrEqual(30))
  it('Lisbon > Vladivostok', () => expect(score('Lisbon')).toBeGreaterThan(score('Vladivostok')))
  // Perceived climate: sunny mild coasts high, grey rainy cities clearly lower, Denver's sunny winters beat Chicago's.
  const sunny = ['Malaga', 'Valencia', 'Perth', 'Adelaide', 'Athens'] as const
  const grey = ['London', 'Manchester', 'Hamburg', 'Seattle', 'Vancouver'] as const
  it.each(sunny)('%s >= 85', (name) => expect(score(name)).toBeGreaterThanOrEqual(85))
  it.each(grey)('%s at least 12 below Lisbon', (name) => expect(score(name)).toBeLessThanOrEqual(score('Lisbon') - 12))
  it('Denver > Chicago', () => expect(score('Denver')).toBeGreaterThan(score('Chicago')))
  it.each(['Moscow', 'St Petersburg'] as const)('%s <= 30', (name) => expect(score(name)).toBeLessThanOrEqual(30))
  // Factor balance: grey cities stay low without exclusion, cold Russia no better than grey Britain, winter sun offsets cold,
  // and development and safety pull the score down.
  it.each(['London', 'Manchester', 'Hamburg', 'Vancouver'] as const)('%s <= 55', (name) => expect(score(name)).toBeLessThanOrEqual(55))
  it('Moscow <= London', () => expect(score('Moscow')).toBeLessThanOrEqual(score('London')))
  // Same country, winter days −12.5 vs −11.5 °C; winter sunshine 59 % vs 28 %.
  it('Khabarovsk > Tomsk (winter sun offsets cold)', () => expect(score('Khabarovsk')).toBeGreaterThan(score('Tomsk')))
  it('the winter sun bonus widens the Khabarovsk - Tomsk gap', () => {
    // Measured: bonus 8 -> 29 / 17 (gap 12); bonus 0 -> 18 / 13 (gap 5).
    const noBonus = { ...CALIFORNIA, comfort: { ...CALIFORNIA.comfort, sunBonus: 0 } }
    const l0 = derivedLayers(atlas.layers, atlas.monthly, noBonus.comfort, atlas.n)
    const at0 = (n: Place) => samplePoint(l0, cellAt(atlas.lookup, PLACES[n][0], PLACES[n][1]), noBonus).score
    expect(score('Khabarovsk') - score('Tomsk')).toBeGreaterThan(at0('Khabarovsk') - at0('Tomsk'))
  })
  it.each(['Delhi', 'Bangalore', 'Mexico City', 'Cape Town'] as const)('%s <= 45', (name) => expect(score(name)).toBeLessThanOrEqual(45))
  const volga = ['Yaroslavl', 'Nizhny Novgorod', 'Kazan', 'Samara', 'Saratov', 'Volgograd'] as const
  const desert = ['Kufra', 'Great Sand Sea', 'Erg Chech', 'Tamanrasset', 'Ghardaia', 'Sebha', 'Aswan'] as const
  it.each(desert)('%s scores below every Volga city', (name) => expect(score(name)).toBeLessThan(Math.min(...volga.map(score))))
  // Map-wide: arid cells (< 100 mm a year) of Egypt, Libya and Algeria at or above the weakest Volga city stay a coastal fringe.
  it('arid Egypt, Libya and Algeria stay below the Volga', () => {
    const scores = scoreCells(layers, atlas.n, CALIFORNIA), country = atlas.layers.country!, precip = layers.precip_annual!
    const codes = new Set(['EGY', 'LBY', 'DZA'].map((c) => atlas.countries.findIndex(([k]) => k === c)))
    const floor = Math.min(...volga.map(score))
    let arid = 0, above = 0
    for (let i = 0; i < atlas.n; i++) {
      if (!codes.has(country.data[i]) || !(layerValue(precip, i) < 100)) continue
      arid++
      if (scores[i] >= floor) above++
    }
    expect(arid).toBeGreaterThan(5000)
    expect(above / arid).toBeLessThan(0.01)
  })
  it('Nairobi <= 55', () => expect(score('Nairobi')).toBeLessThanOrEqual(55))
  // Regional wealth and infrastructure (phase 8): a halo around a rich metro, and a rich metro beats a poorer one of the same climate.
  it('Moscow halo: +30 km at least 8 above +150 km', () => expect(score('Moscow +30')).toBeGreaterThanOrEqual(score('Moscow +150') + 8))
  // Before travel time became key: 78, 56, 55 (above London).
  // Before precipitation moved to a log scale the wet side took the key floor: 18, 23, 23.
  // Year-round comfort is key: sunny but snowy, swinging Denver is no California (was 83).
  it('Denver at least 20 below San Diego', () => expect(score('Denver')).toBeLessThanOrEqual(score('San Diego') - 20))
  // Wealth and development are key: a fine climate does not make up for a weak economy (were 82, 78, 63, 76).
  it.each(['Oran', 'Algiers', 'Tunis', 'Rabat'] as const)('%s <= 72', (name) => expect(score(name)).toBeLessThanOrEqual(72))
  it('Sochi >= 40 (rainy, not floored)', () => expect(score('Sochi')).toBeGreaterThanOrEqual(40))
  it.each(['Brisbane', 'Porto'] as const)('%s >= 60 (rainy, not floored)', (name) => expect(score(name)).toBeGreaterThanOrEqual(60))
  it.each(['Nullarbor', 'Great Victoria Desert', 'Alice Springs'] as const)('%s (remote) <= 30', (name) => expect(score(name)).toBeLessThanOrEqual(30))
  // gdp_pc 81 950 vs 30 330 $; climate group 37 vs 38.
  it('Moscow > Nizhny Novgorod (wealth)', () => expect(score('Moscow')).toBeGreaterThan(score('Nizhny Novgorod')))
  // gdp_pc 75 630 vs 44 950 $; climate group 60 vs 60.
  it('Bucharest > Ploiesti (wealth)', () => expect(score('Bucharest')).toBeGreaterThan(score('Ploiesti')))
  it('country and infrastructure at 0 leave only nature', () => {
    const off = { ...CALIFORNIA, groups: { ...CALIFORNIA.groups, country: 0, infrastructure: 0 } }
    const human = FACTORS.filter((f) => f.group === 'country' || f.group === 'infrastructure')
    for (const name of ['Moscow +30', 'Moscow +150'] as const) {
      const { factors } = samplePoint(layers, cellAt(atlas.lookup, PLACES[name][0], PLACES[name][1]), off)
      for (const f of human) expect(factors[f.id]?.lost ?? 0, `${name} ${f.id}`).toBe(0)
    }
  })
})
