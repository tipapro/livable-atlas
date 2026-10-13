import { create } from 'zustand'
import { flatIndex } from '../data/format'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { FACTORS, GROUPS, type ComfortSettings, type Group, type FactorId, type FactorSettings, type ScoreSettings } from '../scoring/factors'
import { parseMode, type MapMode } from '../scoring/modes'
import { CALIFORNIA } from '../scoring/presets'

export type Locale = 'en' | 'ru'

export interface LatLon { lat: number; lon: number }
export const MAX_PINNED = 3

export type Tab = 'settings' | 'cities' | 'compare'
export const TABS: Tab[] = ['settings', 'cities', 'compare']
export interface UiState { panel: 'open' | 'rail'; tab: Tab }

export interface AppState extends ScoreSettings {
  presetId: string
  userPresets: Record<string, ScoreSettings>
  locale: Locale
  mapMode: MapMode
  month: number
  contrast: boolean // equalised score palette; a view setting, not part of ScoreSettings or presets
  pinned: LatLon[]
  ui: UiState
  setFactor(id: FactorId, patch: Partial<FactorSettings>): void
  setComfort(patch: Partial<ComfortSettings>): void
  setGroup(g: Group, w: number): void
  setStrength(k: number): void
  applyPreset(id: string): void
  resetToPreset(): void
  savePreset(name: string): void
  deletePreset(name: string): void
  setLocale(l: Locale): void
  setMapMode(m: MapMode): void
  setMonth(m: number): void
  setContrast(on: boolean): void
  pin(p: LatLon): void
  unpin(index: number): void
  setPanel(p: UiState['panel']): void
  setTab(t: Tab): void
}

const defaults = () => ({
  presetId: 'california',
  ...structuredClone(CALIFORNIA),
  userPresets: {},
  mapMode: 'score' as MapMode,
  month: 1,
  contrast: true,
  pinned: [] as LatLon[],
  ui: { panel: 'open', tab: 'settings' } as UiState,
  locale: (globalThis.navigator?.language?.startsWith('ru') ? 'ru' : 'en') as Locale,
})

// Drops NaN and undefined so a half-typed input never overwrites a valid value.
const clean = <T extends object>(patch: T): Partial<T> =>
  Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && !Number.isNaN(v))) as Partial<T>

const clampMonth = (m: number) => Math.min(12, Math.max(1, Math.round(m)))
const toGroup = (w: number) => Math.min(5, Math.max(0, Math.round(w * 2) / 2))
const toStrength = (k: number) => Math.min(1, Math.max(0, Math.round(k * 20) / 20))
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

const isNum = (o: unknown, keys: string[]) => keys.every(k => typeof (o as Record<string, unknown>)?.[k] === 'number')
// sunBonus must be a number: undefined makes the felt-winter layer NaN, and every cell would take the key floor.
const isValid = (p: any) =>
  FACTORS.every(f => isNum(p?.factors?.[f.id], ['lo', 'hi', 'tol', 'weight'])) && isNum(p?.comfort, ['dayLo', 'dayHi', 'nightMin', 'dewMax', 'sunBonus'])

// Past California values (phases 5 and 6) that a later phase recalibrated: a save still holding one exactly was never edited there.
const OLD_PRESET: Partial<Record<FactorId, FactorSettings[]>> = {
  cold_tmax: [
    { lo: 15, hi: 24, tol: 10, weight: 4, critical: false },
    { lo: 15, hi: 24, tol: 15, weight: 5, critical: true },
  ],
  cold_tmin: [{ lo: 5, hi: 14, tol: 12, weight: 4, critical: true }],
  precip_annual: [{ lo: 230, hi: 1000, tol: 700, weight: 2, critical: false }],
  seasonality: [{ lo: 0, hi: 12, tol: 12, weight: 2, critical: false }],
  comfort_months: [{ lo: 6, hi: 12, tol: 7, weight: 4, critical: false }],
  sunshine: [{ lo: 2800, hi: 4200, tol: 1200, weight: 5, critical: false }],
  wet_days: [{ lo: 0, hi: 60, tol: 110, weight: 5, critical: false }],
  pm25: [{ lo: 0, hi: 11, tol: 25, weight: 2, critical: false }],
  hdi: [{ lo: 0.85, hi: 1, tol: 0.25, weight: 3, critical: false }],
  homicide: [{ lo: 0, hi: 6, tol: 10, weight: 2, critical: false }],
}
const pf = (lo: number, hi: number, tol: number, weight: number): FactorSettings => ({ lo, hi, tol, weight, critical: false })
// Values a persist version recalibrated: a save older than `before` still holding one exactly was never edited there.
const RECALIBRATED: { before: number; factors: Partial<Record<FactorId, FactorSettings>>; groups?: Partial<Record<Group, number>> }[] = [
  { before: 3, factors: { travel_city: pf(0, 30, 120, 3), dist_bigcity: pf(0, 100, 400, 2), dist_airport: pf(0, 100, 300, 1), pop_density: pf(100, 3000, 1, 1) }, groups: { infrastructure: 1 } }, // phase 7
  { before: 4, factors: { travel_city: pf(0, 20, 60, 3) } }, // phase 8.0, before travel time became key
  { before: 6, factors: { comfort_months: pf(8, 12, 6, 5), gdp_pc: pf(50000, 650000, 0.7, 3), hdi: { ...pf(0.85, 1, 0.25, 3), critical: true } } }, // phase 8, before comfort and GDP became key
  { before: 7, factors: { travel_city: { ...pf(0, 20, 120, 3), critical: true } } }, // phase 8, before the travel-time tolerance went 120 → 100
]
const VERSION = 7
// Factors whose scale became log before this version: an older tolerance was in units, not decades, so the preset replaces it.
const NOW_LOG: Partial<Record<FactorId, number>> = { precip_annual: 5 }
const OLD_COMFORT: Omit<ComfortSettings, 'sunBonus'> = { dayLo: 18, dayHi: 30, nightMin: 8, dewMax: 17 }
const same = (a: object, b: object) => Object.entries(b).every(([k, v]) => (a as Record<string, unknown>)[k] === v)

// A save from an older release gets the current preset for factors added since, for ones whose bounds no
// longer fit the slider (the unit changed, e.g. sunshine W/m² → hours) and for untouched recalibrated values.
const upgrade = (s: any, version: number) => {
  // Phase-7 saves always carry `groups`; only older ones may hold past preset values unedited (a phase-7 edit can equal one).
  const old = s?.groups === undefined
  return s?.factors && typeof s.factors === 'object'
    ? {
        ...s,
        factors: Object.fromEntries(FACTORS.map(f => {
          const v = s.factors[f.id]
          const keep = isNum(v, ['lo', 'hi', 'tol', 'weight']) && v.lo >= f.min && v.hi <= f.max && !(old && OLD_PRESET[f.id]?.some(o => same(v, o))) && !RECALIBRATED.some(r => version < r.before && r.factors[f.id] && same(v, r.factors[f.id]!)) && !(version < (NOW_LOG[f.id] ?? 0))
          // A missing or non-boolean key flag would silently switch the key penalty off: it takes the preset flag.
          return [f.id, keep ? { ...v, critical: typeof v.critical === 'boolean' ? v.critical : CALIFORNIA.factors[f.id].critical } : structuredClone(CALIFORNIA.factors[f.id])]
        })),
        comfort: !s.comfort || typeof s.comfort !== 'object' ? s.comfort
          : old && same(s.comfort, OLD_COMFORT) ? { ...CALIFORNIA.comfort }
          : { ...s.comfort, sunBonus: fin(s.comfort.sunBonus) ? s.comfort.sunBonus : CALIFORNIA.comfort.sunBonus },
        groups: Object.fromEntries(GROUPS.map(g => [g, fin(s.groups?.[g]) && !RECALIBRATED.some(r => version < r.before && r.groups?.[g] === s.groups[g]) ? toGroup(s.groups[g]) : CALIFORNIA.groups[g]])),
        strength: fin(s.strength) ? toStrength(s.strength) : CALIFORNIA.strength,
      }
    : s
}

// A full or blocked localStorage must not break the app: the change stays in memory and the UI says it was not saved.
export const SAVE_FAILED = 'atlas:save-failed'
const safeStorage = (): StateStorage => ({
  getItem: k => localStorage.getItem(k),
  removeItem: k => localStorage.removeItem(k),
  setItem: (k, v) => {
    try { localStorage.setItem(k, v) } catch { globalThis.dispatchEvent?.(new Event(SAVE_FAILED)) }
  },
})

export const useAtlasStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...defaults(),
      setFactor: (id, patch) =>
        set(s => {
          const p = clean(patch)
          const f = { ...s.factors[id], ...p }
          f.tol = Math.max(0, f.tol)
          f.weight = Math.min(5, Math.max(0, Math.round(f.weight)))
          // The bound the user just edited wins; the other one follows.
          if (f.lo > f.hi) p.lo !== undefined ? (f.hi = f.lo) : (f.lo = f.hi)
          return { factors: { ...s.factors, [id]: f } }
        }),
      setComfort: patch => set(s => ({ comfort: { ...s.comfort, ...clean(patch) } })),
      setGroup: (g, w) => {
        if (Number.isNaN(w)) return
        set(s => ({ groups: { ...s.groups, [g]: toGroup(w) } }))
      },
      setStrength: k => {
        if (Number.isNaN(k)) return
        set({ strength: toStrength(k) })
      },
      applyPreset: id => {
        const { userPresets } = get()
        const preset = id === 'california' ? CALIFORNIA : Object.hasOwn(userPresets, id) ? userPresets[id] : undefined
        if (preset) set({ presetId: id, ...structuredClone(preset) })
      },
      resetToPreset: () => get().applyPreset(get().presetId),
      savePreset: name => {
        const n = name.trim()
        if (!n || n === 'california') return
        const { factors, comfort, groups, strength } = get()
        set(s => ({ presetId: n, userPresets: { ...s.userPresets, [n]: structuredClone({ factors, comfort, groups, strength }) } }))
      },
      deletePreset: name =>
        set(s => {
          const { [name]: _, ...userPresets } = s.userPresets
          return { userPresets, presetId: s.presetId === name ? 'california' : s.presetId }
        }),
      setLocale: locale => set({ locale }),
      setMapMode: mapMode => set({ mapMode }),
      setMonth: m => set({ month: clampMonth(m) }),
      setContrast: contrast => set({ contrast }),
      pin: p =>
        set(s => (s.pinned.length >= MAX_PINNED || s.pinned.some(q => flatIndex(q.lat, q.lon) === flatIndex(p.lat, p.lon)) ? s : { pinned: [...s.pinned, { lat: p.lat, lon: p.lon }] })),
      unpin: i => set(s => ({ pinned: s.pinned.filter((_, k) => k !== i) })),
      setPanel: panel => set(s => ({ ui: { ...s.ui, panel } })),
      setTab: tab => set({ ui: { panel: 'open', tab } }),
    }),
    {
      name: 'livable-atlas:v1',
      version: VERSION,
      storage: createJSONStorage(safeStorage),
      partialize: ({ presetId, factors, comfort, groups, strength, userPresets, locale, mapMode, month, contrast, pinned, ui }) => ({ presetId, factors, comfort, groups, strength, userPresets, locale, mapMode, month, contrast, pinned, ui }),
      // Saves from older versions keep their data; `merge` upgrades them, told apart by `savedVersion`.
      migrate: (s, v) => ({ ...(s as object), savedVersion: v }) as unknown as AppState,
      // shortcut: a save `upgrade` cannot repair (no factors object, bad comfort) resets all settings, not just the bad field.
      merge: (saved, current) => {
        const { savedVersion = VERSION, ...rest } = (saved ?? {}) as { savedVersion?: number }
        const persisted = upgrade(rest, savedVersion)
        if (!isValid(persisted)) return { ...current, ...defaults() }
        const p = persisted as Partial<AppState>
        const raw = p.userPresets
        const userPresets = Object.fromEntries(
          Object.entries(raw && typeof raw === 'object' ? raw : {}).map(([k, v]) => [k, upgrade(v, savedVersion)]).filter(([, v]) => isValid(v)),
        )
        const presetId = p.presetId === 'california' || (typeof p.presetId === 'string' && Object.hasOwn(userPresets, p.presetId)) ? p.presetId : 'california'
        const locale = p.locale === 'en' || p.locale === 'ru' ? p.locale : current.locale
        const mapMode = parseMode(p.mapMode) ?? defaults().mapMode
        const month = typeof p.month === 'number' && p.month >= 1 && p.month <= 12 ? clampMonth(p.month) : defaults().month
        const contrast = typeof p.contrast === 'boolean' ? p.contrast : defaults().contrast
        const pinned = Array.isArray(p.pinned) && p.pinned.length <= MAX_PINNED && p.pinned.every(q => Number.isFinite(q?.lat) && Number.isFinite(q?.lon))
          ? p.pinned.map(({ lat, lon }) => ({ lat, lon }))
          : []
        const ui: UiState = {
          panel: p.ui?.panel === 'open' || p.ui?.panel === 'rail' ? p.ui.panel : defaults().ui.panel,
          tab: TABS.includes(p.ui?.tab as Tab) ? p.ui!.tab : defaults().ui.tab,
        }
        return { ...current, ...p, userPresets, presetId, locale, mapMode, month, contrast, pinned, ui }
      },
    },
  ),
)
