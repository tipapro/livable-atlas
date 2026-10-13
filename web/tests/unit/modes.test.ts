import { expect, test } from 'vitest'
import type { Manifest } from '../../src/data/format'
import { classify, isModeAvailable, modeRange, parseMode } from '../../src/scoring/modes'

test('classify linear and nodata', () => {
  const layer = { data: new Uint8Array([0, 85, 170, 255]), scale: 0.5, offset: -40, nodata: 255 } // -40, 2.5, 45, nodata
  expect([...classify(layer, 4, -40, 45, false)]).toEqual([0, 50, 100, 255])
})

test('classify clamps out-of-range values', () => {
  const layer = { data: new Uint8Array([0, 200]), scale: 0.5, offset: -40, nodata: 255 } // -40, 60
  expect([...classify(layer, 2, -30, 45, false)]).toEqual([0, 100])
})

test('classify log', () => {
  const layer = { data: new Uint16Array([0, 50000, 71]), scale: 1, offset: 0.1, nodata: 65535 }
  expect([...classify(layer, 3, 0.1, 50000, true)]).toEqual([0, 100, 50])
})

test('classify monthly reads the requested month', () => {
  const data = new Uint8Array(24); data[2] = 170; data[14] = 85 // cell 0 March = 45, cell 1 March = 2.5
  expect([...classify({ data, scale: 0.5, offset: -40, nodata: 255 }, 2, -40, 45, false, 3)]).toEqual([100, 50])
})

test('parseMode', () => {
  expect(parseMode('score')).toBe('score')
  expect(parseMode('factor:hdi')).toBe('factor:hdi')
  expect(parseMode('factor:nope')).toBeNull()
  expect(parseMode('monthly:prec')).toBe('monthly:prec')
  expect(parseMode('monthly:wind')).toBeNull()
  expect(parseMode('factor:hdi:x')).toBeNull()
  expect(parseMode(5)).toBeNull()
})

test('modeRange', () => {
  expect(modeRange('monthly:prec')).toEqual({ min: 0, max: 400, unit: 'mm', log: false })
  expect(modeRange('factor:pop_density')).toEqual({ min: 0.1, max: 50000, unit: 'people/km²', log: true })
  expect(modeRange('factor:hdi')).toMatchObject({ min: 0.3, max: 1, log: false })
})

test('isModeAvailable', () => {
  const m = { layers: { hdi: {} }, monthly: { prec: {} } } as unknown as Manifest
  expect(isModeAvailable('score', m)).toBe(true)
  expect(isModeAvailable('factor:hdi', m)).toBe(true)
  expect(isModeAvailable('factor:pm25', m)).toBe(false)
  expect(isModeAvailable('monthly:prec', m)).toBe(true)
  expect(isModeAvailable('monthly:tmax', m)).toBe(false)
})
