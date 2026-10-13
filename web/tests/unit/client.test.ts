import { expect, test, vi } from 'vitest'
import type { City, CountryName, Manifest } from '../../src/data/format'
import { CALIFORNIA } from '../../src/scoring/presets'
import { AtlasClient } from '../../src/worker/client'
import type { FromWorker, ToWorker } from '../../src/worker/protocol'

function setup() {
  const sent: ToWorker[] = []
  const worker = { postMessage: (m: ToWorker) => void sent.push(m), onmessage: null as ((e: MessageEvent<FromWorker>) => void) | null }
  const reply = (m: FromWorker) => worker.onmessage!({ data: m } as MessageEvent<FromWorker>)
  return { client: new AtlasClient(worker), sent, reply }
}

const VIEW = { mode: 'score', month: 1, contrast: true } as const

const scored = (id: number, fill: number): FromWorker =>
  ({ type: 'scored', id, pixels: new Uint8ClampedArray(4).fill(fill), size: 1, ms: id, top: [[id, 50]], scale: null })

test('drops scored responses older than the last applied', () => {
  const { client, sent, reply } = setup()
  const onScored = vi.fn()
  client.onScored = onScored
  client.score(CALIFORNIA, VIEW)
  client.score(CALIFORNIA, VIEW)
  expect(sent.map((m) => m.type === 'score' && m.id)).toEqual([1, 2])
  reply(scored(2, 20))
  reply(scored(1, 10))
  expect(onScored).toHaveBeenCalledTimes(1)
  expect([...onScored.mock.calls[0][0]]).toEqual([20, 20, 20, 20])
  expect(onScored.mock.calls[0].slice(1)).toEqual([1, 2, [[2, 50]], null])
})

test('sample resolves by id', async () => {
  const { client, sent, reply } = setup()
  const a = client.sample(1, 2, CALIFORNIA)
  const b = client.sample(3, 4, CALIFORNIA)
  const [ia, ib] = sent.map((m) => (m as { id: number }).id)
  reply({ type: 'sampled', id: ib, sample: null })
  reply({ type: 'sampled', id: ia, sample: { score: 50, factors: {} } })
  expect(await a).toEqual({ score: 50, factors: {} })
  expect(await b).toBeNull()
})

test('detail resolves by id', async () => {
  const { client, sent, reply } = setup()
  const a = client.detail(1, 2, CALIFORNIA)
  const b = client.detail(3, 4, CALIFORNIA)
  expect(sent.map((m) => m.type)).toEqual(['detail', 'detail'])
  const [ia, ib] = sent.map((m) => (m as { id: number }).id)
  const detail = { sample: { score: 50, factors: {} }, country: 3, monthly: { tmax: [], tmin: [], prec: null } }
  reply({ type: 'detailed', id: ib, detail: null })
  reply({ type: 'detailed', id: ia, detail })
  expect(await a).toEqual(detail)
  expect(await b).toBeNull()
})

test('init resolves with manifest, cities and countries and rejects on fatal error', async () => {
  const ok = setup()
  const p = ok.client.init('/data/')
  expect(ok.sent).toEqual([{ type: 'init', base: '/data/' }])
  const manifest = { cellCount: 1 } as Manifest
  const cities: City[] = [['A', null, 'US', 1, 2, 3]]
  const countries: [string, CountryName][] = [['AAA', { name: 'Aaa', nameRu: null }]]
  ok.reply({ type: 'ready', manifest, cities, countries })
  expect(await p).toEqual({ manifest, cities, countries })

  const bad = setup()
  const q = bad.client.init('/data/')
  bad.reply({ type: 'error', message: 'x', fatal: true })
  await expect(q).rejects.toThrow('x')
})

test('prec messages go to onPrec, not onError', () => {
  const { client, reply } = setup()
  client.onPrec = vi.fn()
  client.onError = vi.fn()
  reply({ type: 'prec', error: 'prec.bin: HTTP 404' })
  expect(client.onPrec).toHaveBeenCalledWith('prec.bin: HTTP 404')
  expect(client.onError).not.toHaveBeenCalled()
})

test('non-fatal errors go to onError', () => {
  const { client, reply } = setup()
  client.onError = vi.fn()
  reply({ type: 'error', message: 'boom', fatal: false })
  expect(client.onError).toHaveBeenCalledWith('boom')
})

test('progress messages go to onProgress', () => {
  const { client, reply } = setup()
  client.onProgress = vi.fn()
  reply({ type: 'progress', loaded: 5, total: 10 })
  expect(client.onProgress).toHaveBeenCalledWith(5, 10)
})
