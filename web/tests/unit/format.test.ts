import { expect, test } from 'vitest'
import { buildLookup, cellAt, checkCells, checkCities, checkCountries, checkManifest, decodeLayer, layerValue, type LayerSpec } from '../../src/data/format'
import { FACTORS } from '../../src/scoring/factors'
import { MONTHLY_RANGE } from '../../src/scoring/modes'
import { coordsLabel, fmt, monthNames, unitLabel } from '../../src/ui/format'

const spec = (dtype: LayerSpec['dtype'], scale: number, offset: number): LayerSpec =>
  ({ file: 'layers/x.bin.gz', dtype, scale, offset, unit: '', source: 'synthetic' })

test('decodeLayer uint16 little-endian and nodata', () => {
  const l = decodeLayer(new Uint16Array([10, 65535]).buffer, spec('uint16', 1, -500), 2)
  expect(layerValue(l, 0)).toBe(-490); expect(layerValue(l, 1)).toBeNaN()
})
test('decodeLayer rejects wrong length with file name', () => {
  expect(() => decodeLayer(new Uint8Array(3).buffer, spec('uint8', 1, 0), 2)).toThrow('layers/x.bin.gz: expected 2 values, got 3')
})
test('checkManifest rejects any version but 2', () => {
  const m = { version: 1, grid: { width: 1440, height: 720 } } as never
  expect(() => checkManifest(m)).toThrow('manifest.json: unsupported version 1, expected 2')
})
test('checkManifest rejects a grid of another resolution or origin', () => {
  const grid = { res: 0.25, width: 1440, height: 720, west: -180, north: 90 }
  for (const bad of [{ res: 0.5 }, { west: 0 }, { north: 85 }]) {
    expect(() => checkManifest({ version: 2, grid: { ...grid, ...bad } } as never)).toThrow('manifest.json: grid')
  }
  expect(() => checkManifest({ version: 2, grid } as never)).not.toThrow()
})
test('checkCells requires strictly increasing indices inside the grid', () => {
  expect(() => checkCells(new Uint32Array([0, 5, 1440 * 720 - 1]))).not.toThrow()
  expect(() => checkCells(new Uint32Array([0, 5, 5]))).toThrow('cells.bin.gz: index 2 (5) is not above the previous one')
  expect(() => checkCells(new Uint32Array([7, 3]))).toThrow('cells.bin.gz: index 1 (3) is not above the previous one')
  expect(() => checkCells(new Uint32Array([0, 1440 * 720]))).toThrow('cells.bin.gz: index 1 (1036800) is outside the grid')
})
test('decodeLayer rejects an unknown dtype', () => {
  expect(() => decodeLayer(new Uint8Array(2).buffer, spec('int16' as never, 1, 0), 2)).toThrow('layers/x.bin.gz: unsupported dtype int16')
})
test('cellAt maps, reports ocean and outside the world', () => {
  const lookup = buildLookup(new Uint32Array([0, 1439, 359 * 1440 + 720]))
  expect(cellAt(lookup, 89.9, -179.9)).toBe(0)
  expect(cellAt(lookup, 90, 179.9)).toBe(1)
  expect(cellAt(lookup, 0.1, 0.1)).toBe(2)
  expect(cellAt(lookup, -89.99, 0)).toBe(-1)
  expect(cellAt(lookup, 0, 180.5)).toBe(-1)
  expect(cellAt(lookup, 0, 180)).toBe(-1)
  expect(cellAt(lookup, 90.1, 0)).toBe(-1)
  expect(cellAt(lookup, -90.1, 0)).toBe(-1)
  expect(cellAt(lookup, 0, -180.1)).toBe(-1)
  expect(cellAt(lookup, 0, -180)).toBe(-1) // in range: ocean cell, not out of the world
  expect(cellAt(lookup, 89.9, -180)).toBe(0)
  expect(cellAt(lookup, -90, 0)).toBe(-1) // lat -90 stays in the last row
})
test('checkCities and checkCountries validate shape and name the file', () => {
  const city = ['A', null, 'US', 1, 2, 3]
  expect(checkCities([city])).toEqual([city])
  expect(() => checkCities({})).toThrow('cities.json: invalid')
  expect(() => checkCities([['A', 1, 'US', 1, 2, 3]])).toThrow('cities.json: invalid')
  expect(() => checkCities([['A', null, 'US', 1, 2]])).toThrow('cities.json: invalid')
  expect(checkCountries({ AAA: { name: 'A', nameRu: null }, BBB: { name: 'B', nameRu: 'Б' } }).map((c) => c[0])).toEqual(['AAA', 'BBB'])
  expect(() => checkCountries([])).toThrow('countries.json: invalid')
  expect(() => checkCountries({ AAA: { name: 1, nameRu: null } })).toThrow('countries.json: invalid')
})

test('unitLabel localizes every unit to Russian', () => {
  expect(unitLabel('ru', 'people/km²')).toBe('чел./км²')
  expect(unitLabel('en', 'people/km²')).toBe('people/km²')
  for (const unit of new Set([...FACTORS.map(f => f.unit), ...Object.values(MONTHLY_RANGE).map(r => r.unit)])) {
    if (!['°C', '%', 'g', '$'].includes(unit)) expect(unitLabel('ru', unit), unit).not.toBe(unit)
  }
  expect(unitLabel('ru', 'mm')).toBe('мм')
})
test('monthNames gives 12 localized names; fmt keeps 3 significant digits', () => {
  expect(monthNames('ru')).toHaveLength(12)
  expect(monthNames('ru')[0].toLowerCase()).toMatch(/^янв/)
  expect(monthNames('en')[0]).toMatch(/^Jan/)
  expect(fmt(1234.5)).toBe('1230')
  expect(fmt(0.30001)).toBe('0.3')
})
test('coordsLabel takes the hemisphere from the rounded value', () => {
  expect(coordsLabel(-0.001, -0.004, 'NSEW')).toBe('0.00° N, 0.00° E')
  expect(coordsLabel(-0.006, -0.006, 'NSEW')).toBe('0.01° S, 0.01° W')
  expect(coordsLabel(10.5, -20.25, 'NSEW')).toBe('10.50° N, 20.25° W')
})
