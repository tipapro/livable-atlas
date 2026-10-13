import type { City, CountryName, Manifest } from '../data/format'
import type { ScoreSettings } from '../scoring/factors'
import type { MapMode } from '../scoring/modes'
import type { PointSample } from '../scoring/score'

export interface PointDetail {
  sample: PointSample
  country: number | null // index into countries; null = no country
  monthly: { tmax: number[]; tmin: number[]; prec: number[] | null } // 12 values, NaN = nodata; prec null until its lazy load succeeds
}

export type Scale = { tone: number[]; labels: number[] } // equalised palette: colour index per score, legend labels

export type ToWorker =
  | { type: 'init'; base: string }
  | { type: 'score'; id: number; settings: ScoreSettings; view: { mode: MapMode; month: number; contrast: boolean } }
  | { type: 'sample'; id: number; lat: number; lon: number; settings: ScoreSettings }
  | { type: 'detail'; id: number; lat: number; lon: number; settings: ScoreSettings }

export type FromWorker =
  | { type: 'progress'; loaded: number; total: number | null } // startup download, at most every 100 ms
  | { type: 'ready'; manifest: Manifest; cities: City[]; countries: [string, CountryName][] }
  | { type: 'scored'; id: number; pixels: Uint8ClampedArray; size: number; ms: number; top: [number, number][]; scale: Scale | null } // top: [city index, score]; scale: score map with contrast on
  | { type: 'sampled'; id: number; sample: PointSample | null } // null = ocean
  | { type: 'detailed'; id: number; detail: PointDetail | null } // null = no land cell
  | { type: 'prec'; error: string | null } // monthly/prec.bin settled (once): null = loaded, else the failure
  | { type: 'error'; message: string; fatal: boolean } // fatal = init failure
