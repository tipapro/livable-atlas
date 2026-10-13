import { TOP_MIN_POP, TOP_N, topCities } from '../data/cities'
import { cellAt, layerValue, type Layer } from '../data/format'
import { loadAtlas, loadMonthly, type Atlas } from '../data/load'
import { contrastScale, paintMercator } from '../render/paint'
import { classify, modeRange } from '../scoring/modes'
import { derivedLayers, samplePoint, scoreCells } from '../scoring/score'
import type { ComfortSettings, FactorId } from '../scoring/factors'
import type { FromWorker, ToWorker } from './protocol'

// The app tsconfig has the DOM lib, not WebWorker, so type the worker global by hand.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null
  postMessage(m: FromWorker, t?: Transferable[]): void
}

const SIZE = 1440
type Layers = Partial<Record<FactorId, Layer>>
type ScoreMsg = Extract<ToWorker, { type: 'score' }>

let atlas: Atlas | null = null
let candidates = new Int32Array() // top-list cities: big enough, on land, in population order
let pending: ScoreMsg | null = null
let latest = 0 // id of the newest score request; a run that finds itself older drops its result
let timer: ReturnType<typeof setTimeout> | undefined
let comfortKey = ''
let layers: Layers = {}
let base = ''
let precLoad: Promise<void> | undefined // monthly:prec is fetched once, on first use; a failure is cached, not retried

// atlas.layers plus comfort_months and cold_feel, rebuilt only when the comfort parameters change.
function layersFor(a: Atlas, comfort: ComfortSettings): Layers {
  const key = JSON.stringify(comfort)
  if (key !== comfortKey) {
    layers = derivedLayers(a.layers, a.monthly, comfort, a.n)
    comfortKey = key
  }
  return layers
}

const fail = (e: unknown, fatal: boolean) =>
  ctx.postMessage({ type: 'error', message: e instanceof Error ? e.message : String(e), fatal })

// a.monthly.prec is set only on success; the app learns the outcome from the one 'prec' message.
function loadPrec(a: Atlas) {
  precLoad ??= !a.manifest.monthly.prec ? Promise.resolve() : loadMonthly(base, a.manifest, 'prec', a.n).then(
    (l) => { a.monthly.prec = l; return null },
    (e) => (e instanceof Error ? e.message : String(e)),
  ).then((error) => ctx.postMessage({ type: 'prec', error }))
  return precLoad
}

// Raw values of the chosen mode as 0-100 classes, or null when the score should be shown instead.
function viewCells(a: Atlas, { mode, month }: ScoreMsg['view'], comfort: ComfortSettings): Uint8Array | null {
  if (mode === 'score') return null
  const [kind, id] = mode.split(':')
  const layer = kind === 'monthly' ? a.monthly[id] : layersFor(a, comfort)[id as FactorId]
  if (!layer) return null
  const { min, max, log } = modeRange(mode)
  return classify(layer, a.n, min, max, log, kind === 'monthly' ? month : undefined)
}

async function runScore() {
  timer = undefined
  const m = pending
  if (!m || !atlas) return
  pending = null
  try {
    const t0 = performance.now()
    if (m.view.mode === 'monthly:prec') await loadPrec(atlas)
    if (m.id !== latest) return // superseded while the prec file loaded
    const scores = scoreCells(layersFor(atlas, m.settings.comfort), atlas.n, m.settings) // the top list is by score in every mode
    const shown = viewCells(atlas, m.view, m.settings.comfort)
    const scale = m.view.mode === 'score' && m.view.contrast ? contrastScale(scores) : null // factor and monthly maps stay linear
    const pixels = paintMercator(shown ?? scores, atlas.lookup, SIZE, scale?.tone)
    const top = topCities(scores, atlas.cityCells, candidates, TOP_N)
    ctx.postMessage({ type: 'scored', id: m.id, pixels, size: SIZE, ms: performance.now() - t0, top, scale: scale && { tone: Array.from(scale.tone), labels: scale.labels } }, [pixels.buffer])
  } catch (e) {
    fail(e, false)
  }
}

// Samples queue for one macrotask: requests for the same point are answered once, with the newest settings.
type SampleMsg = Extract<ToWorker, { type: 'sample' }>
let sampleQueue = new Map<string, { ids: number[]; m: SampleMsg }>()

function flushSamples() {
  const queue = sampleQueue
  sampleQueue = new Map()
  for (const { ids, m } of queue.values()) {
    let sample = null
    try {
      const i = atlas ? cellAt(atlas.lookup, m.lat, m.lon) : -1
      sample = atlas && i >= 0 ? samplePoint(layersFor(atlas, m.settings.comfort), i, m.settings) : null
    } catch (e) {
      fail(e, false) // the answers below still settle the clients' promises
    }
    for (const id of ids) ctx.postMessage({ type: 'sampled', id, sample })
  }
}

async function detail(m: Extract<ToWorker, { type: 'detail' }>) {
  try {
    const a = atlas
    const i = a ? cellAt(a.lookup, m.lat, m.lon) : -1
    if (!a || i < 0) return void ctx.postMessage({ type: 'detailed', id: m.id, detail: null })
    void loadPrec(a) // not awaited: the card answers at once and the app re-asks when 'prec' arrives
    const series = (l: Layer | undefined) => Array.from({ length: 12 }, (_, k) => (l ? layerValue(l, i * 12 + k) : NaN))
    const c = a.layers.country?.data[i]
    ctx.postMessage({
      type: 'detailed', id: m.id,
      detail: {
        sample: samplePoint(layersFor(a, m.settings.comfort), i, m.settings),
        country: c === undefined || c === 255 ? null : c,
        monthly: { tmax: series(a.monthly.tmax), tmin: series(a.monthly.tmin), prec: a.monthly.prec ? series(a.monthly.prec) : null },
      },
    })
  } catch (e) {
    fail(e, false)
    ctx.postMessage({ type: 'detailed', id: m.id, detail: null }) // settle the client's promise
  }
}

ctx.onmessage = async ({ data: m }) => {
  if (m.type === 'init') {
    try {
      base = m.base
      let last = 0
      const a = (atlas = await loadAtlas(base, fetch, (loaded, total) => {
        const now = performance.now()
        if (now - last < 100 && loaded !== total) return // the final report always goes out
        last = now
        ctx.postMessage({ type: 'progress', loaded, total })
      }))
      candidates = Int32Array.from(a.cities.flatMap((c, i) => (c[5] >= TOP_MIN_POP && a.cityCells[i] >= 0 ? [i] : [])))
      ctx.postMessage({ type: 'ready', manifest: atlas.manifest, cities: atlas.cities, countries: atlas.countries })
      if (pending) timer = setTimeout(runScore, 0)
    } catch (e) {
      fail(e, true)
    }
  } else if (m.type === 'score') {
    latest = m.id
    pending = m // latest wins: earlier unprocessed requests are dropped
    if (atlas && timer === undefined) timer = setTimeout(runScore, 0)
  } else if (m.type === 'sample') {
    const key = `${m.lat},${m.lon}`
    const q = sampleQueue.get(key)
    if (q) { q.ids.push(m.id); q.m = m } else {
      if (!sampleQueue.size) setTimeout(flushSamples, 0)
      sampleQueue.set(key, { ids: [m.id], m })
    }
  } else if (m.type === 'detail') {
    void detail(m)
  }
}
