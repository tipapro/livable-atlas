// @vitest-environment jsdom
import { beforeEach, expect, test } from 'vitest'
import { en } from '../../src/i18n/en'
import { ru } from '../../src/i18n/ru'
import { t } from '../../src/i18n'
import { FACTORS, GROUPS } from '../../src/scoring/factors'
import { CALIFORNIA } from '../../src/scoring/presets'
import { SAVE_FAILED, useAtlasStore } from '../../src/state/store'

const get = useAtlasStore.getState
const initial = get()

beforeEach(() => {
  localStorage.clear()
  useAtlasStore.setState(initial, true)
})

test('defaults to California', () => {
  expect(get().presetId).toBe('california')
  expect(get().factors.warm_tmax).toEqual(CALIFORNIA.factors.warm_tmax)
  expect(get().comfort).toEqual(CALIFORNIA.comfort)
})

test('setFactor normalizes input', () => {
  get().setFactor('warm_tmax', { lo: 40 })
  expect(get().factors.warm_tmax.hi).toBe(40)
  get().setFactor('warm_tmax', { hi: 10 })
  expect(get().factors.warm_tmax.lo).toBe(10)
  get().setFactor('warm_tmax', { tol: -3, weight: 9.7 })
  expect(get().factors.warm_tmax).toMatchObject({ tol: 0, weight: 5 })
  get().setFactor('warm_tmax', { lo: NaN })
  expect(get().factors.warm_tmax.lo).toBe(10)
})

test('setComfort ignores NaN', () => {
  get().setComfort({ dayLo: 20, dewMax: NaN })
  expect(get().comfort).toEqual({ ...CALIFORNIA.comfort, dayLo: 20 })
})

test('setGroup and setStrength clamp, round and ignore NaN; user presets keep them', () => {
  get().setGroup('climate', 7); expect(get().groups.climate).toBe(5)
  get().setGroup('climate', 2.3); expect(get().groups.climate).toBe(2.5)
  get().setGroup('hazards', -1); expect(get().groups.hazards).toBe(0)
  get().setGroup('country', NaN); expect(get().groups.country).toBe(CALIFORNIA.groups.country)
  get().setStrength(0.33); expect(get().strength).toBe(0.35)
  get().setStrength(3); expect(get().strength).toBe(1)
  get().setStrength(NaN); expect(get().strength).toBe(1)
  get().savePreset('mine')
  get().applyPreset('california')
  expect(get().groups).toEqual(CALIFORNIA.groups); expect(get().strength).toBe(CALIFORNIA.strength)
  get().applyPreset('mine')
  expect(get().groups.climate).toBe(2.5); expect(get().strength).toBe(1)
})

test('presets never share references with state', () => {
  get().setFactor('warm_tmax', { weight: 0 })
  expect(CALIFORNIA.factors.warm_tmax.weight).toBe(5)
  get().savePreset('mine')
  get().setFactor('warm_tmax', { weight: 1 })
  expect(get().userPresets.mine.factors.warm_tmax.weight).toBe(0)
})

test('user presets save, apply, delete', () => {
  get().setFactor('warm_tmax', { weight: 2 })
  get().savePreset('mine')
  expect(get().presetId).toBe('mine')
  get().applyPreset('california')
  expect(get().factors.warm_tmax.weight).toBe(5)
  get().applyPreset('nope')
  expect(get().presetId).toBe('california')
  get().applyPreset('mine')
  get().setFactor('warm_tmax', { weight: 4 })
  get().resetToPreset()
  expect(get().factors.warm_tmax.weight).toBe(2)
  get().deletePreset('mine')
  expect(get().presetId).toBe('california')
  expect(get().userPresets).toEqual({})
  expect(get().factors.warm_tmax.weight).toBe(2)
})

test('savePreset ignores empty and reserved names', () => {
  get().savePreset('')
  get().savePreset('california')
  expect(get().userPresets).toEqual({})
})

test('corrupt persisted state falls back to preset', async () => {
  localStorage.setItem('livable-atlas:v1', JSON.stringify({ state: { factors: { warm_tmax: { lo: 'x' } } }, version: 1 }))
  await useAtlasStore.persist.rehydrate()
  expect(get().factors).toEqual(CALIFORNIA.factors)
})

const persistedWith = (extra: object) =>
  localStorage.setItem('livable-atlas:v1', JSON.stringify({ state: { factors: CALIFORNIA.factors, comfort: CALIFORNIA.comfort, ...extra }, version: 1 }))

test('non-object userPresets are replaced with {}', async () => {
  persistedWith({ userPresets: null, presetId: 'mine' })
  await useAtlasStore.persist.rehydrate()
  expect(get().userPresets).toEqual({})
  expect(get().presetId).toBe('california')
})

test('invalid user preset entries are dropped', async () => {
  persistedWith({ userPresets: { good: CALIFORNIA, bad: { factors: {} } }, presetId: 'bad' })
  await useAtlasStore.persist.rehydrate()
  expect(Object.keys(get().userPresets)).toEqual(['good'])
  expect(get().presetId).toBe('california')
  persistedWith({ userPresets: { good: CALIFORNIA }, presetId: 'good' })
  await useAtlasStore.persist.rehydrate()
  expect(get().presetId).toBe('good')
})

test('invalid persisted locale falls back to default', async () => {
  persistedWith({ locale: 'fr' })
  await useAtlasStore.persist.rehydrate()
  expect(get().locale).toBe(initial.locale)
})

test('setMonth rounds and clamps', () => {
  get().setMonth(13)
  expect(get().month).toBe(12)
  get().setMonth(0)
  expect(get().month).toBe(1)
  get().setMonth(5.4)
  expect(get().month).toBe(5)
})

test('a phase 3 save keeps its factors and gets default view', async () => {
  const factors = structuredClone(CALIFORNIA.factors)
  factors.warm_tmax.weight = 2
  persistedWith({ factors, presetId: 'california', userPresets: {}, locale: 'en' })
  await useAtlasStore.persist.rehydrate()
  expect(get().factors.warm_tmax.weight).toBe(2)
  expect(get().mapMode).toBe('score')
  expect(get().month).toBe(1)
})

test('mapMode and month are validated independently', async () => {
  const factors = structuredClone(CALIFORNIA.factors)
  factors.warm_tmax.weight = 2
  persistedWith({ factors, mapMode: 'factor:nope', month: 7 })
  await useAtlasStore.persist.rehydrate()
  expect(get().factors.warm_tmax.weight).toBe(2)
  expect(get().mapMode).toBe('score')
  expect(get().month).toBe(7)
  persistedWith({ factors, mapMode: 'factor:hdi', month: 13 })
  await useAtlasStore.persist.rehydrate()
  expect(get().mapMode).toBe('factor:hdi')
  expect(get().month).toBe(1)
})

test('survives reload', async () => {
  get().setFactor('warm_tmax', { weight: 1 })
  get().setLocale('ru')
  get().setMapMode('monthly:tmax')
  get().setMonth(7)
  const saved = localStorage.getItem('livable-atlas:v1')!
  useAtlasStore.setState(initial, true) // also rewrites storage, so restore the save
  localStorage.setItem('livable-atlas:v1', saved)
  await useAtlasStore.persist.rehydrate()
  expect(get().factors.warm_tmax.weight).toBe(1)
  expect(get().locale).toBe('ru')
  expect(get().mapMode).toBe('monthly:tmax')
  expect(get().month).toBe(7)
})

test('persists data only', () => {
  get().setFactor('warm_tmax', { weight: 1 })
  expect(Object.keys(JSON.parse(localStorage.getItem('livable-atlas:v1')!).state).sort())
    .toEqual(['comfort', 'contrast', 'factors', 'groups', 'locale', 'mapMode', 'month', 'pinned', 'presetId', 'strength', 'ui', 'userPresets'])
})

test('every factor and group has an RU string', () => {
  for (const k of [...FACTORS.map(f => `factor.${f.id}`), ...FACTORS.map(f => `desc.${f.id}`), ...GROUPS.map(g => `group.${g}`)]) {
    expect((en as Record<string, string>)[k]).toBeTruthy()
    expect((ru as Record<string, string>)[k]).toBeTruthy()
  }
  expect(t('ru', 'group.climate')).toBe('Климат')
  expect(t('en', 'group.climate')).toBe('Climate')
})

test('pin keeps at most three distinct points; unpin removes by index', () => {
  for (const lat of [1, 2, 3, 4]) get().pin({ lat, lon: 0 })
  expect(get().pinned).toHaveLength(3)
  get().unpin(0)
  expect(get().pinned.map(p => p.lat)).toEqual([2, 3])
  get().pin({ lat: 2, lon: 0 })
  expect(get().pinned).toHaveLength(2)
})

test('pin rejects a point in an already pinned grid cell', () => {
  get().pin({ lat: 10.01, lon: 20.01 })
  get().pin({ lat: 10.2, lon: 20.2 }) // same 0.25° cell
  expect(get().pinned).toHaveLength(1)
  get().pin({ lat: 10.3, lon: 20.2 })
  expect(get().pinned).toHaveLength(2)
})

test('pinned persists; a phase 3 save without it keeps factors and gets []', async () => {
  get().pin({ lat: 5, lon: 6 })
  const saved = JSON.parse(localStorage.getItem('livable-atlas:v1')!)
  expect(saved.state.pinned).toEqual([{ lat: 5, lon: 6 }])
  const factors = structuredClone(get().factors)
  factors.warm_tmax.weight = 2
  const { pinned: _, ...rest } = saved.state
  const save = (pinned?: unknown) => {
    localStorage.setItem('livable-atlas:v1', JSON.stringify({ ...saved, state: { ...rest, factors, ...(pinned === undefined ? {} : { pinned }) } }))
    return useAtlasStore.persist.rehydrate()
  }
  await save()
  expect(get().factors.warm_tmax.weight).toBe(2)
  expect(get().pinned).toEqual([])
  for (const bad of ['x', [{ lat: 1, lon: 'a' }], [{ lat: NaN, lon: 1 }], [1, 2, 3, 4].map(lat => ({ lat, lon: 0 }))]) {
    await save(bad)
    expect(get().factors.warm_tmax.weight).toBe(2)
    expect(get().pinned).toEqual([])
  }
  await save([{ lat: 1, lon: 2 }])
  expect(get().pinned).toEqual([{ lat: 1, lon: 2 }])
})

test('a phase 4 save (no ui) keeps factors and gets the ui defaults', async () => {
  const factors = structuredClone(CALIFORNIA.factors)
  factors.warm_tmax.weight = 2
  persistedWith({ factors, presetId: 'california', userPresets: {}, locale: 'en', mapMode: 'score', month: 1, pinned: [{ lat: 1, lon: 2 }] })
  await useAtlasStore.persist.rehydrate()
  expect(get().factors.warm_tmax.weight).toBe(2)
  expect(get().pinned).toEqual([{ lat: 1, lon: 2 }])
  expect(get().ui).toEqual({ panel: 'open', tab: 'settings' })
})

test('an invalid ui.tab falls back alone', async () => {
  persistedWith({ ui: { panel: 'rail', tab: 'nope' } })
  await useAtlasStore.persist.rehydrate()
  expect(get().ui).toEqual({ panel: 'rail', tab: 'settings' })
  persistedWith({ ui: { panel: 'x', tab: 'compare' } })
  await useAtlasStore.persist.rehydrate()
  expect(get().ui).toEqual({ panel: 'open', tab: 'compare' })
})

test('setTab opens the panel', () => {
  get().setPanel('rail')
  expect(get().ui).toEqual({ panel: 'rail', tab: 'settings' })
  get().setTab('cities')
  expect(get().ui).toEqual({ panel: 'open', tab: 'cities' })
})

test('a phase 5 save upgrades untouched and re-unit values, keeping the user\'s edits', async () => {
  const { wet_days: _, ...phase5 } = {
    ...CALIFORNIA.factors,
    sunshine: { lo: 190, hi: 300, tol: 70, weight: 2, critical: false },
    cold_tmax: { lo: 15, hi: 24, tol: 10, weight: 4, critical: false },
    cold_tmin: { lo: 5, hi: 14, tol: 12, weight: 4, critical: true },
    precip_annual: { lo: 230, hi: 1000, tol: 700, weight: 2, critical: false },
    seasonality: { lo: 0, hi: 12, tol: 12, weight: 3, critical: false }, // edited by the user: weight 3
    comfort_months: { lo: 6, hi: 12, tol: 7, weight: 4, critical: false },
    warm_tmax: { ...CALIFORNIA.factors.warm_tmax, weight: 1 },
  }
  const comfort = { dayLo: 18, dayHi: 30, nightMin: 8, dewMax: 17 }
  persistedWith({ factors: phase5, comfort, userPresets: { mine: { factors: phase5, comfort } }, presetId: 'mine' })
  await useAtlasStore.persist.rehydrate()
  expect(get().factors).toEqual({ ...CALIFORNIA.factors, seasonality: phase5.seasonality, warm_tmax: phase5.warm_tmax })
  expect(get().comfort).toEqual(CALIFORNIA.comfort)
  expect(get().userPresets.mine.factors.cold_tmax).toEqual(CALIFORNIA.factors.cold_tmax)
  expect(get().presetId).toBe('mine')
})

test('every preset value fits its slider, so the save upgrade never resets an untouched factor', () => {
  for (const f of FACTORS) expect([f.id, CALIFORNIA.factors[f.id].lo >= f.min && CALIFORNIA.factors[f.id].hi <= f.max]).toEqual([f.id, true])
})

// A phase 6 save: the phase-6 preset values (as in `main` before phase 7), no groups/strength, comfort without sunBonus.
const phase6 = () => {
  const { cold_feel: _f, cold_sun: _s, ...rest } = structuredClone(CALIFORNIA.factors)
  const { sunBonus: _b, ...comfort } = CALIFORNIA.comfort
  return {
    factors: {
      ...rest,
      cold_tmax: { lo: 15, hi: 24, tol: 15, weight: 5, critical: true },
      sunshine: { ...CALIFORNIA.factors.sunshine, critical: false },
      wet_days: { ...CALIFORNIA.factors.wet_days, critical: false },
      pm25: { ...CALIFORNIA.factors.pm25, critical: false },
      hdi: { ...CALIFORNIA.factors.hdi, critical: false },
      homicide: { ...CALIFORNIA.factors.homicide, critical: false, weight: 4 }, // edited by the user
    },
    comfort,
  }
}

test('a phase 6 save upgrades untouched values and keeps edits', async () => {
  persistedWith({ ...phase6(), userPresets: {}, presetId: 'california' })
  await useAtlasStore.persist.rehydrate()
  const f = get().factors
  expect(f.cold_tmax).toEqual(CALIFORNIA.factors.cold_tmax)
  expect(f.sunshine.critical).toBe(true)
  expect(f.homicide).toEqual({ ...CALIFORNIA.factors.homicide, critical: false, weight: 4 })
  expect(f.cold_feel).toEqual(CALIFORNIA.factors.cold_feel)
  expect(get().groups).toEqual(CALIFORNIA.groups)
  expect(get().strength).toBe(CALIFORNIA.strength)
  expect(get().comfort).toEqual(CALIFORNIA.comfort)
  expect(get().presetId).toBe('california')
})

test('a phase 6 user preset is upgraded the same way', async () => {
  persistedWith({ ...phase6(), userPresets: { mine: phase6() }, presetId: 'mine' })
  await useAtlasStore.persist.rehydrate()
  const m = get().userPresets.mine
  expect(m.factors.cold_tmax).toEqual(CALIFORNIA.factors.cold_tmax)
  expect(m.factors.homicide.weight).toBe(4)
  expect([m.groups, m.strength, m.comfort.sunBonus]).toEqual([CALIFORNIA.groups, CALIFORNIA.strength, CALIFORNIA.comfort.sunBonus])
  expect(get().presetId).toBe('mine')
})

test('invalid groups, strength and sunBonus fall back field by field', async () => {
  const p = phase6()
  persistedWith({ ...p, comfort: { ...p.comfort, sunBonus: null }, groups: { climate: 'x', country: 9 }, strength: -1 })
  await useAtlasStore.persist.rehydrate()
  expect(get().groups).toEqual({ ...CALIFORNIA.groups, country: 5 })
  expect(get().strength).toBe(0)
  expect(get().comfort.sunBonus).toBe(CALIFORNIA.comfort.sunBonus)
  expect(get().factors.homicide.weight).toBe(4)
  persistedWith({ ...p, strength: 'a' })
  await useAtlasStore.persist.rehydrate()
  expect(get().strength).toBe(CALIFORNIA.strength)
})

test('savePreset stores groups and strength', () => {
  get().setGroup('hazards', 3); get().setStrength(0.5)
  get().savePreset('mine')
  expect(get().userPresets.mine.groups.hazards).toBe(3)
  expect(get().userPresets.mine.strength).toBe(0.5)
})

test('a phase 7 save is not reverted to the preset by the past-value replacement', async () => {
  const edited = {
    factors: {
      ...CALIFORNIA.factors,
      sunshine: { ...CALIFORNIA.factors.sunshine, critical: false }, // equals the phase-6 preset
      cold_tmax: { lo: 15, hi: 24, tol: 15, weight: 5, critical: true }, // equals the phase-6 preset
    },
    comfort: { dayLo: 18, dayHi: 30, nightMin: 8, dewMax: 17, sunBonus: 8 }, // equals the phase-5 comfort
    groups: CALIFORNIA.groups,
  }
  persistedWith({ ...edited, userPresets: { mine: edited }, presetId: 'mine' })
  await useAtlasStore.persist.rehydrate()
  for (const s of [get(), get().userPresets.mine]) {
    expect(s.factors.sunshine.critical).toBe(false)
    expect(s.factors.cold_tmax.weight).toBe(5)
    expect(s.comfort).toEqual(edited.comfort)
  }
})

test('a phase 6 save keeps an edited critical flag on an otherwise untouched factor', async () => {
  const p = phase6()
  p.factors.warm_tmin = { ...p.factors.warm_tmin, critical: true }
  persistedWith({ ...p, userPresets: { mine: p }, presetId: 'mine' })
  await useAtlasStore.persist.rehydrate()
  expect(get().factors.warm_tmin.critical).toBe(true)
  expect(get().userPresets.mine.factors.warm_tmin.critical).toBe(true)
})

test('a phase 7.0 save (persist version 1) takes the recalibrated precipitation preset; a version-5 edit is kept', async () => {
  const precip70 = { lo: 230, hi: 1000, tol: 700, weight: 1, critical: false } // the phase-7.0 preset value
  const save = (precip: object, version: number) => {
    const s = { factors: { ...CALIFORNIA.factors, precip_annual: precip }, comfort: CALIFORNIA.comfort, groups: CALIFORNIA.groups, strength: CALIFORNIA.strength }
    localStorage.setItem('livable-atlas:v1', JSON.stringify({ state: { ...s, userPresets: { mine: s }, presetId: 'mine' }, version }))
  }
  save(precip70, 1)
  await useAtlasStore.persist.rehydrate()
  expect(get().factors.precip_annual).toEqual(CALIFORNIA.factors.precip_annual)
  expect(get().userPresets.mine.factors.precip_annual).toEqual(CALIFORNIA.factors.precip_annual)
  expect(get().presetId).toBe('mine')
  // Since version 5 the tolerance is in decades (log scale), so only a version-5 edit survives.
  const edited = { ...CALIFORNIA.factors.precip_annual, weight: 3 }
  save(edited, 5)
  await useAtlasStore.persist.rehydrate()
  expect(get().factors.precip_annual).toEqual(edited)
  expect(get().userPresets.mine.factors.precip_annual).toEqual(edited)
})

// The phase-7 preset values phase 8 replaced; `gdp_pc` and `contrast` did not exist then.
const phase7Save = (version: number) => {
  const { gdp_pc: _, ...factors } = CALIFORNIA.factors
  const f = (lo: number, hi: number, tol: number, weight: number) => ({ lo, hi, tol, weight, critical: false })
  const s = {
    factors: { ...factors, travel_city: f(0, 30, 120, 3), dist_bigcity: f(0, 100, 400, 4), dist_airport: f(0, 100, 300, 1), pop_density: f(100, 3000, 1, 1) },
    comfort: CALIFORNIA.comfort, groups: { ...CALIFORNIA.groups, infrastructure: 1 }, strength: CALIFORNIA.strength,
  }
  localStorage.setItem('livable-atlas:v1', JSON.stringify({ state: { ...s, userPresets: { mine: s }, presetId: 'mine' }, version }))
}

test('a version 2 save upgrades untouched phase-7 values and keeps edits', async () => {
  phase7Save(2)
  await useAtlasStore.persist.rehydrate()
  for (const s of [get(), get().userPresets.mine]) {
    for (const id of ['travel_city', 'dist_airport', 'pop_density', 'gdp_pc'] as const) expect(s.factors[id]).toEqual(CALIFORNIA.factors[id])
    expect(s.factors.dist_bigcity.weight).toBe(4)
    expect(s.groups.infrastructure).toBe(CALIFORNIA.groups.infrastructure)
  }
  expect(get().contrast).toBe(true)
})

test('a version 3 save keeps phase-7 values', async () => {
  phase7Save(3)
  await useAtlasStore.persist.rehydrate()
  for (const s of [get(), get().userPresets.mine]) {
    expect(s.factors.travel_city).toEqual({ lo: 0, hi: 30, tol: 120, weight: 3, critical: false })
    expect(s.factors.pop_density.hi).toBe(3000)
    expect(s.groups.infrastructure).toBe(1)
  }
})

test('a version 3 save upgrades the untouched phase-8.0 travel time and keeps an edited one', async () => {
  const s = { factors: { ...CALIFORNIA.factors, travel_city: { lo: 0, hi: 20, tol: 60, weight: 3, critical: false } }, comfort: CALIFORNIA.comfort, groups: CALIFORNIA.groups, strength: CALIFORNIA.strength }
  const edited = { ...s, factors: { ...s.factors, travel_city: { lo: 0, hi: 20, tol: 60, weight: 5, critical: false } } }
  localStorage.setItem('livable-atlas:v1', JSON.stringify({ state: { ...s, userPresets: { mine: edited } }, version: 3 }))
  await useAtlasStore.persist.rehydrate()
  expect(get().factors.travel_city).toEqual(CALIFORNIA.factors.travel_city)
  expect(get().userPresets.mine.factors.travel_city.weight).toBe(5)
})

test('a version 4 save takes the log-scale precipitation, edited or not (its tolerance was in mm)', async () => {
  const s = { factors: { ...CALIFORNIA.factors, precip_annual: { lo: 230, hi: 1000, tol: 80, weight: 1, critical: true } }, comfort: CALIFORNIA.comfort, groups: CALIFORNIA.groups, strength: CALIFORNIA.strength }
  const edited = { ...s, factors: { ...s.factors, precip_annual: { lo: 300, hi: 900, tol: 200, weight: 3, critical: true } } }
  localStorage.setItem('livable-atlas:v1', JSON.stringify({ state: { ...s, userPresets: { mine: edited } }, version: 4 }))
  await useAtlasStore.persist.rehydrate()
  expect(get().factors.precip_annual).toEqual(CALIFORNIA.factors.precip_annual)
  expect(get().userPresets.mine.factors.precip_annual).toEqual(CALIFORNIA.factors.precip_annual)
})

test('a version 5 save takes the untouched pre-key comfort months, GDP and HDI values and keeps edits', async () => {
  const old = { comfort_months: { lo: 8, hi: 12, tol: 6, weight: 5, critical: false }, gdp_pc: { lo: 50000, hi: 650000, tol: 0.7, weight: 3, critical: false }, hdi: { lo: 0.85, hi: 1, tol: 0.25, weight: 3, critical: true } }
  const s = { factors: { ...CALIFORNIA.factors, ...old }, comfort: CALIFORNIA.comfort, groups: CALIFORNIA.groups, strength: CALIFORNIA.strength }
  const edited = { ...s, factors: { ...s.factors, hdi: { ...old.hdi, weight: 5 } } }
  localStorage.setItem('livable-atlas:v1', JSON.stringify({ state: { ...s, userPresets: { mine: edited } }, version: 5 }))
  await useAtlasStore.persist.rehydrate()
  for (const id of ['comfort_months', 'gdp_pc', 'hdi'] as const) expect(get().factors[id]).toEqual(CALIFORNIA.factors[id])
  expect(get().userPresets.mine.factors.hdi.weight).toBe(5)
  expect(get().userPresets.mine.factors.gdp_pc).toEqual(CALIFORNIA.factors.gdp_pc)
})

test('a version 6 save takes the untouched travel-time tolerance 100 and keeps an edit', async () => {
  const old = { lo: 0, hi: 20, tol: 120, weight: 3, critical: true }
  const s = { factors: { ...CALIFORNIA.factors, travel_city: old }, comfort: CALIFORNIA.comfort, groups: CALIFORNIA.groups, strength: CALIFORNIA.strength }
  const edited = { ...s, factors: { ...s.factors, travel_city: { ...old, tol: 150 } } }
  localStorage.setItem('livable-atlas:v1', JSON.stringify({ state: { ...s, userPresets: { mine: edited } }, version: 6 }))
  await useAtlasStore.persist.rehydrate()
  expect(get().factors.travel_city).toEqual(CALIFORNIA.factors.travel_city)
  expect(get().userPresets.mine.factors.travel_city.tol).toBe(150)
})

test('a saved factor without a boolean key flag takes the preset flag and keeps its numbers', async () => {
  const { critical: _, ...noFlag } = { ...CALIFORNIA.factors.warm_tmax, weight: 2 }
  const s = { factors: { ...CALIFORNIA.factors, warm_tmax: noFlag, pm25: { ...CALIFORNIA.factors.pm25, critical: 'yes' } }, comfort: CALIFORNIA.comfort, groups: CALIFORNIA.groups, strength: CALIFORNIA.strength }
  localStorage.setItem('livable-atlas:v1', JSON.stringify({ state: { ...s, userPresets: { mine: s } }, version: 7 }))
  await useAtlasStore.persist.rehydrate()
  for (const st of [get(), get().userPresets.mine]) {
    expect(st.factors.warm_tmax).toEqual({ ...CALIFORNIA.factors.warm_tmax, weight: 2 })
    expect(st.factors.pm25.critical).toBe(true)
  }
})

test('a full or blocked localStorage keeps the change in memory and reports it', () => {
  const real = Storage.prototype.setItem
  Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError') }
  let failed = 0
  const onFail = () => failed++
  globalThis.addEventListener(SAVE_FAILED, onFail)
  try {
    expect(() => get().setFactor('warm_tmax', { weight: 1 })).not.toThrow()
    expect(() => get().savePreset('mine')).not.toThrow()
  } finally {
    Storage.prototype.setItem = real
    globalThis.removeEventListener(SAVE_FAILED, onFail)
  }
  expect(get().factors.warm_tmax.weight).toBe(1)
  expect(get().userPresets.mine).toBeDefined()
  expect(failed).toBeGreaterThan(0)
})

test('contrast defaults to true, persists, and a non-boolean falls back to true', async () => {
  expect(get().contrast).toBe(true)
  get().setContrast(false)
  const saved = localStorage.getItem('livable-atlas:v1')!
  expect(JSON.parse(saved).state.contrast).toBe(false)
  useAtlasStore.setState(initial, true)
  localStorage.setItem('livable-atlas:v1', saved)
  await useAtlasStore.persist.rehydrate()
  expect(get().contrast).toBe(false)
  const bad = JSON.parse(saved)
  bad.state.contrast = 'no'
  localStorage.setItem('livable-atlas:v1', JSON.stringify(bad))
  await useAtlasStore.persist.rehydrate()
  expect(get().contrast).toBe(true)
})
