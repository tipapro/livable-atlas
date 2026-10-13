import type { City, CountryName, Manifest } from '../data/format'
import type { PointSample } from '../scoring/score'
import type { ScoreSettings } from '../scoring/factors'
import type { FromWorker, PointDetail, Scale, ToWorker } from './protocol'

export interface WorkerLike {
  postMessage(m: ToWorker, t?: Transferable[]): void
  onmessage: ((e: MessageEvent<FromWorker>) => void) | null
}

type ScoreMsg = Extract<ToWorker, { type: 'score' }>

export type Ready = { manifest: Manifest; cities: City[]; countries: [string, CountryName][] }

export class AtlasClient {
  onScored?: (pixels: Uint8ClampedArray, size: number, ms: number, top: [number, number][], scale: Scale | null) => void
  onError?: (message: string) => void
  onProgress?: (loaded: number, total: number | null) => void
  onPrec?: (error: string | null) => void
  private nextId = 0
  private lastApplied = 0
  private samples = new Map<number, (s: PointSample | null) => void>()
  private details = new Map<number, (d: PointDetail | null) => void>()
  private ready?: { resolve: (r: Ready) => void; reject: (e: Error) => void }

  private worker: WorkerLike

  constructor(worker: WorkerLike) {
    this.worker = worker
    worker.onmessage = ({ data: m }) => {
      if (m.type === 'ready') this.ready?.resolve({ manifest: m.manifest, cities: m.cities, countries: m.countries })
      else if (m.type === 'progress') this.onProgress?.(m.loaded, m.total)
      else if (m.type === 'scored') {
        if (m.id < this.lastApplied) return // a newer result was already applied
        this.lastApplied = m.id
        this.onScored?.(m.pixels, m.size, m.ms, m.top, m.scale)
      } else if (m.type === 'sampled') {
        this.samples.get(m.id)?.(m.sample)
        this.samples.delete(m.id)
      } else if (m.type === 'detailed') {
        this.details.get(m.id)?.(m.detail)
        this.details.delete(m.id)
      } else if (m.type === 'prec') this.onPrec?.(m.error)
      else if (m.fatal) this.ready?.reject(new Error(m.message))
      else this.onError?.(m.message)
    }
  }

  init(base: string): Promise<Ready> {
    return new Promise((resolve, reject) => {
      this.ready = { resolve, reject }
      this.worker.postMessage({ type: 'init', base })
    })
  }

  score(settings: ScoreSettings, view: ScoreMsg['view']): void {
    this.worker.postMessage({ type: 'score', id: ++this.nextId, settings, view })
  }

  sample(lat: number, lon: number, settings: ScoreSettings): Promise<PointSample | null> {
    const id = ++this.nextId
    return new Promise((resolve) => {
      this.samples.set(id, resolve)
      this.worker.postMessage({ type: 'sample', id, lat, lon, settings })
    })
  }

  detail(lat: number, lon: number, settings: ScoreSettings): Promise<PointDetail | null> {
    const id = ++this.nextId
    return new Promise((resolve) => {
      this.details.set(id, resolve)
      this.worker.postMessage({ type: 'detail', id, lat, lon, settings })
    })
  }
}
