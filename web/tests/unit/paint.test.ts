import { expect, test } from 'vitest'
import { buildLookup } from '../../src/data/format'
import { NODATA } from '../../src/scoring/score'
import { MERCATOR_COORDS, PALETTE, contrastScale, paintMercator } from '../../src/render/paint'

const px = (img: Uint8ClampedArray, size: number, x: number, y: number) => [...img.slice((y * size + x) * 4, (y * size + x) * 4 + 4)]

test('palette ends', () => {
  expect([...PALETTE.slice(0, 4)]).toEqual([0x44, 0x01, 0x54, 255])
  expect([...PALETTE.slice(320, 324)]).toEqual([0xfd, 0xe7, 0x25, 255]) // yellow at 80
  expect([...PALETTE.slice(400, 404)]).toEqual([0xf5, 0x7d, 0x15, 255]) // orange at the top (phase 8: one more hue to tell scores apart)
})

test('mercator corners match the painted extent', () => {
  expect(MERCATOR_COORDS).toEqual([[-180, 85.0511], [180, 85.0511], [180, -85.0511], [-180, -85.0511]])
})

test('mercator rows map to grid rows', () => {
  // grid row 19 (85.25–85.0°N) is the top of the Mercator square; grid row 359 is just north of the equator
  const lookup = buildLookup(new Uint32Array([19 * 1440, 359 * 1440]))
  const size = 1440
  const img = paintMercator(new Uint8Array([0, 100]), lookup, size)
  expect(px(img, size, 0, 0)).toEqual([0x44, 0x01, 0x54, 255])
  expect(px(img, size, 0, size / 2 - 1)).toEqual([0xf5, 0x7d, 0x15, 255])
  expect(px(img, size, 0, size / 2)[3]).toBe(0) // grid row 360 is ocean
  expect(px(img, size, 1, 0)[3]).toBe(0) // column 1 is ocean
})

test('columns scale with size', () => {
  const lookup = buildLookup(new Uint32Array([359 * 1440 + 2]))
  const size = 720, y = size / 2 - 1
  const img = paintMercator(new Uint8Array([100]), lookup, size)
  expect(img.length).toBe(size * size * 4)
  // x → column floor(2x): only x=1 hits column 2
  expect([0, 1, 2].map(x => px(img, size, x, y)[3])).toEqual([0, 255, 0])
})

test('ocean transparent, nodata transparent, scores painted', () => {
  const lookup = buildLookup(new Uint32Array([359 * 1440, 359 * 1440 + 1, 359 * 1440 + 2]))
  const size = 1440, y = size / 2 - 1
  const img = paintMercator(new Uint8Array([254, NODATA, 50]), lookup, size) // 254 is no longer special
  expect(px(img, size, 0, y)[3]).toBe(0)
  expect(px(img, size, 1, y)[3]).toBe(0)
  expect(px(img, size, 2, y)[3]).toBe(255)
  expect(px(img, size, 3, y)[3]).toBe(0) // lookup −1
})

const cells = (...runs: [score: number, n: number][]) => Uint8Array.from(runs.flatMap(([s, n]) => Array<number>(n).fill(s)))

test('contrastScale stretches a dense band but at most 1.5x its share of the ramp', () => {
  const { tone, labels } = contrastScale(cells(...[20, 21, 22, 23, 24, 25, 26, 27, 28, 29].map(s => [s, 9] as [number, number]), [90, 10]))
  // Linear would give the band 9 tone steps, full equalisation ~80; the clip allows ~21.
  expect(tone[29] - tone[20]).toBeGreaterThan(15)
  expect(tone[29] - tone[20]).toBeLessThan(25)
  expect(tone[90]).toBeGreaterThanOrEqual(85)
  expect(tone.every((v, s) => s === 0 || v >= tone[s - 1])).toBe(true)
  expect(labels[0]).toBe(20)
  expect(labels[4]).toBe(90)
})

test('contrastScale keeps room at the top when most cells score low', () => {
  // Half the land at 0-9 (deserts, tundra) must not push mediocre scores into the bright end.
  const { tone } = contrastScale(cells(...Array.from({ length: 10 }, (_, s) => [s, 500] as [number, number]), ...Array.from({ length: 91 }, (_, s) => [s + 10, 50] as [number, number])))
  expect(tone[40]).toBeLessThan(60)
  expect(tone[75]).toBeLessThan(85)
  expect(tone[100]).toBeGreaterThanOrEqual(99)
})

test('contrastScale ignores 255', () => {
  const base = cells([20, 50], [60, 50])
  expect(contrastScale(cells([20, 50], [60, 50], [255, 1000]))).toEqual(contrastScale(base))
})

test('contrastScale with no scored cell is linear', () => {
  const { tone, labels } = contrastScale(cells([255, 5]))
  expect([...tone]).toEqual(Array.from({ length: 101 }, (_, s) => s))
  expect(labels).toEqual([0, 25, 50, 75, 100])
})

test('contrastScale labels are non-decreasing on a flat distribution', () => {
  const flat = contrastScale(cells([37, 1000]))
  expect(flat.tone.every((v, s) => Math.abs(v - s) <= 2)).toBe(true) // nothing to stretch: about linear
  expect(flat.labels).toEqual([37, 37, 37, 37, 37])
  const { labels } = contrastScale(cells([37, 999], [80, 1]))
  expect(labels.every((v, i) => Number.isInteger(v) && (i === 0 || v >= labels[i - 1]))).toBe(true)
})

test('paintMercator uses the tone map when given', () => {
  const lookup = buildLookup(new Uint32Array([359 * 1440]))
  const tone = Array.from({ length: 101 }, (_, s) => s)
  tone[10] = 90
  const img = paintMercator(new Uint8Array([10]), lookup, 1440, tone)
  expect(px(img, 1440, 0, 719)).toEqual([...PALETTE.slice(360, 364)])
})
