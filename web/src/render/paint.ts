
const W = 1440
const H = 720

export const MERCATOR_COORDS: [[number, number], [number, number], [number, number], [number, number]] =
  [[-180, 85.0511], [180, 85.0511], [180, -85.0511], [-180, -85.0511]]

const STOPS = [[0x44, 0x01, 0x54], [0x3b, 0x52, 0x8b], [0x21, 0x91, 0x8c], [0x5e, 0xc9, 0x62], [0xfd, 0xe7, 0x25], [0xf5, 0x7d, 0x15]]

export const PALETTE = new Uint8ClampedArray(101 * 4)
for (let s = 0; s <= 100; s++) {
  const t = s * (STOPS.length - 1) / 100, k = Math.min(Math.floor(t), STOPS.length - 2), f = t - k
  for (let ch = 0; ch < 3; ch++) PALETTE[s * 4 + ch] = STOPS[k][ch] + f * (STOPS[k + 1][ch] - STOPS[k][ch])
  PALETTE[s * 4 + 3] = 255
}

// CSS colour of a 0–100 score, for the legend ramp and score badges.
export const scoreColor = (s: number) => `rgb(${PALETTE[s * 4]} ${PALETTE[s * 4 + 1]} ${PALETTE[s * 4 + 2]})`

// Contrast-limited equalised palette: tone[s] is the middle of score s's band in the cumulative distribution of scored
// cells (255 = no score), where no score may take more than CLIP times an even share of the ramp and the excess is spread
// evenly; dense bands stretch, but the half of the land that scores 0–10 cannot push mediocre scores into the bright end.
const CLIP = 1.5
export function contrastScale(scores: Uint8Array): { tone: Uint8Array; labels: number[] } {
  const count = new Float64Array(101)
  let total = 0
  for (let i = 0; i < scores.length; i++) if (scores[i] <= 100) { count[scores[i]]++; total++ }
  const tone = new Uint8Array(101)
  if (!total) return { tone: tone.map((_, s) => s), labels: [0, 25, 50, 75, 100] }
  const limit = CLIP * total / 101
  const extra = count.reduce((e, c) => e + Math.max(0, c - limit), 0) / 101
  let below = 0
  for (let s = 0; s <= 100; s++) {
    const w = Math.min(count[s], limit) + extra
    tone[s] = Math.round(100 * (below + w / 2) / total)
    below += w
  }
  const present = Array.from(count.keys()).filter(s => count[s] > 0)
  const first = (x: number) => present.find(s => tone[s] >= x) ?? present[present.length - 1]
  return { tone, labels: [present[0], first(25), first(50), first(75), present[present.length - 1]] }
}

// Paints the equirectangular grid into a size×size Web Mercator RGBA image (row 0 = north edge); tone recolours scores.
export function paintMercator(scores: Uint8Array, lookup: Int32Array, size = W, tone?: ArrayLike<number>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4)
  const cols = new Int32Array(size)
  for (let x = 0; x < size; x++) cols[x] = Math.floor(x * W / size)
  for (let y = 0; y < size; y++) {
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / size))) * 180 / Math.PI
    const row = Math.min(Math.max(Math.floor((90 - lat) / 0.25), 0), H - 1) * W
    for (let x = 0, o = y * size * 4; x < size; x++, o += 4) {
      const cell = lookup[row + cols[x]]
      if (cell < 0) continue
      const s = scores[cell]
      if (s <= 100) { const c = tone ? tone[s] : s; out.set(PALETTE.subarray(c * 4, c * 4 + 4), o) }
    }
  }
  return out
}
