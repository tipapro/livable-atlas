import { expect, test, vi } from 'vitest'
import { buildLookup, type Layer } from '../../src/data/format'
import type { ScoreSettings } from '../../src/scoring/factors'
import { CALIFORNIA } from '../../src/scoring/presets'
import type { FromWorker, ToWorker } from '../../src/worker/protocol'

const month = (v: number): Layer => ({ data: new Uint8Array(12).fill(v), scale: 1, offset: 0, nodata: 255 })
const posted: FromWorker[] = []
const loadMonthly = vi.fn()
let cityData: { cities: unknown[]; cityCells: Int32Array } = { cities: [], cityCells: new Int32Array() }
vi.mock('../../src/data/load', () => ({
  loadMonthly: (...a: unknown[]) => loadMonthly(...a),
  loadAtlas: async () => ({
    manifest: { monthly: { prec: {} } },
    n: 1,
    lookup: buildLookup(new Uint32Array([360 * 1440 + 720])), // cell at lat 0, lon 0
    layers: {
      country: { data: new Uint8Array([7]), scale: 1, offset: 0, nodata: 255 },
      elevation: { data: new Uint8Array([75]), scale: 30, offset: 0, nodata: 255 }, // 2250 m: half score under CALIFORNIA
    },
    monthly: { tmax: month(20), tmin: month(255), tdew: month(10) },
    ...cityData, countries: [],
  }),
}))
vi.stubGlobal('self', { postMessage: (m: FromWorker) => void posted.push(m), onmessage: null })

const send = async (m: ToWorker) => { await (self as unknown as { onmessage: (e: unknown) => Promise<void> }).onmessage({ data: m }) }
const detail = (id: number, lat = 0): ToWorker => ({ type: 'detail', id, lat, lon: 0.1, settings: CALIFORNIA })
const detailed = (id: number) => posted.find((m) => m.type === 'detailed' && m.id === id) as Extract<FromWorker, { type: 'detailed' }>

test('detail answers before prec resolves; the follow-up has prec bars', async () => {
  let resolve!: (l: Layer) => void
  loadMonthly.mockReturnValue(new Promise<Layer>((r) => (resolve = r)))
  await import('../../src/worker/atlas.worker')
  await send({ type: 'init', base: '/d/' })
  await send(detail(1))
  expect(detailed(1).detail!.monthly.prec).toBeNull() // posted while prec.bin is still pending
  expect(posted.filter((m) => m.type === 'prec')).toEqual([])
  resolve(month(5))
  await vi.waitFor(() => expect(posted).toContainEqual({ type: 'prec', error: null }))
  await send(detail(2))
  expect(detailed(2).detail!.monthly.prec).toEqual(Array(12).fill(5))
  expect(loadMonthly).toHaveBeenCalledTimes(1)
})

test('detail: prec failure keeps temperatures, drops prec and reports once via prec', async () => {
  vi.resetModules()
  posted.length = 0
  loadMonthly.mockReset().mockRejectedValue(new Error('prec.bin: HTTP 404'))
  await import('../../src/worker/atlas.worker')
  await send({ type: 'init', base: '/d/' })
  await send(detail(1))
  await send(detail(2))
  await vi.waitFor(() => expect(posted.filter((m) => m.type === 'prec')).toHaveLength(1))
  await send(detail(3))
  const d = detailed(3).detail!
  expect(d.country).toBe(7)
  expect(d.monthly.tmax).toEqual(Array(12).fill(20))
  expect(d.monthly.tmin.every(Number.isNaN)).toBe(true)
  expect(d.monthly.prec).toBeNull()
  expect(posted.filter((m) => m.type === 'prec')).toEqual([{ type: 'prec', error: 'prec.bin: HTTP 404' }])
  expect(posted.filter((m) => m.type === 'error')).toEqual([])
  expect(loadMonthly).toHaveBeenCalledTimes(1)
})

test('detail: no land cell gives null', async () => {
  await send(detail(4, 50))
  expect(detailed(4).detail).toBeNull()
})

test('queued samples of one point are computed once with the newest settings', async () => {
  posted.length = 0
  const noWeights = { ...CALIFORNIA, factors: Object.fromEntries(Object.entries(CALIFORNIA.factors).map(([k, f]) => [k, { ...f, weight: 0 }])) as ScoreSettings['factors'] }
  const sample = (id: number, settings: ScoreSettings): ToWorker => ({ type: 'sample', id, lat: 0, lon: 0.1, settings })
  void send(sample(10, noWeights)); void send(sample(11, noWeights)); void send(sample(12, CALIFORNIA))
  await vi.waitFor(() => expect(posted.filter((m) => m.type === 'sampled')).toHaveLength(3))
  const got = posted.filter((m) => m.type === 'sampled') as Extract<FromWorker, { type: 'sampled' }>[]
  expect(got.map((m) => m.id).sort()).toEqual([10, 11, 12])
  expect(got.every((m) => m.sample?.score === 50)).toBe(true)
  expect(got[0].sample).toBe(got[1].sample) // one computation, shared
})

test('top-list candidates skip off-land cities and those under 100k', async () => {
  posted.length = 0
  cityData = {
    cities: [['Small', null, 'XX', 0, 0.1, 5e4], ['Sea', null, 'XX', 1, 1, 2e5], ['Big', null, 'XX', 0, 0.1, 2e5]],
    cityCells: new Int32Array([0, -1, 0]),
  }
  await send({ type: 'init', base: '/d/' })
  await send({ type: 'score', id: 1, settings: CALIFORNIA, view: { mode: 'score', month: 1, contrast: true } })
  await vi.waitFor(() => expect(posted.some((m) => m.type === 'scored')).toBe(true))
  expect((posted.find((m) => m.type === 'scored') as Extract<FromWorker, { type: 'scored' }>).top).toEqual([[2, 50]])
})

test('scored carries the contrast scale only in score mode with contrast on', async () => {
  const scaleFor = async (id: number, view: Extract<ToWorker, { type: 'score' }>['view']) => {
    await send({ type: 'score', id, settings: CALIFORNIA, view })
    await vi.waitFor(() => expect(posted.some((m) => m.type === 'scored' && m.id === id)).toBe(true))
    return (posted.find((m) => m.type === 'scored' && m.id === id) as Extract<FromWorker, { type: 'scored' }>).scale
  }
  const on = await scaleFor(2, { mode: 'score', month: 1, contrast: true })
  expect(on?.tone).toHaveLength(101)
  expect(on?.labels).toEqual([50, 50, 50, 50, 50]) // one scored cell
  expect(await scaleFor(3, { mode: 'score', month: 1, contrast: false })).toBeNull()
  expect(await scaleFor(4, { mode: 'factor:elevation', month: 1, contrast: true })).toBeNull()
})
