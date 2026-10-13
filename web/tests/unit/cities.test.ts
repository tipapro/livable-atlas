import { expect, test } from 'vitest'
import type { City } from '../../src/data/format'
import { nearestCity, searchCities, topCities } from '../../src/data/cities'

test('nearestCity', () => {
  const cities: City[] = [['A', null, 'XX', 0, 0, 1], ['B', null, 'XX', 0, 1, 1]]
  const r = nearestCity(cities, 0, 0.6)
  expect(r.index).toBe(1); expect(r.km).toBeCloseTo(44.48, 1)
})

test('topCities', () => {
  const scores = new Uint8Array([90, 0, 70, 255, 95])
  const cells = new Int32Array([0, 1, 2, 3, 4]), cand = new Int32Array([0, 1, 2, 3, 4])
  expect(topCities(scores, cells, cand, 3)).toEqual([[4, 95], [0, 90], [2, 70]])
  expect(topCities(scores, cells, cand, 5)).toEqual([[4, 95], [0, 90], [2, 70], [1, 0]])
})

test('topCities keeps population order on equal scores', () => {
  const scores = new Uint8Array([80, 80, 90, 80])
  const cells = new Int32Array([0, 1, 2, 3])
  expect(topCities(scores, cells, new Int32Array([3, 0, 2, 1]), 4)).toEqual([[2, 90], [3, 80], [0, 80], [1, 80]])
})

test('searchCities', () => {
  const cities: City[] = [['Lisbon', 'Лиссабон', 'PT', 38.7, -9.1, 5e5], ['Lismore', null, 'AU', -28.8, 153.3, 3e4], ['Moscow', 'Москва', 'RU', 55.8, 37.6, 1e7]]
  expect(searchCities(cities, '  LIS ')).toEqual([0, 1])
  expect(searchCities(cities, 'лис')).toEqual([0])
  expect(searchCities(cities, 'мос')).toEqual([2])
  expect(searchCities(cities, '')).toEqual([])
  expect(searchCities(cities, 'li', 1)).toEqual([0])
})

test('search folds case, diacritics and ё/е', () => {
  const cities: City[] = [['Orel', 'Орёл', 'RU', 52.97, 36.06, 3e5], ['São Paulo', 'Сан-Паулу', 'BR', -23.5, -46.6, 1e7], ['Zürich', 'Цюрих', 'CH', 47.4, 8.5, 4e5], ['Yoshkar-Ola', 'Йошкар-Ола', 'RU', 56.6, 47.9, 2.5e5]]
  expect(searchCities(cities, 'орел')).toEqual([0])
  expect(searchCities(cities, 'ОРЁЛ')).toEqual([0])
  expect(searchCities(cities, 'sao p')).toEqual([1])
  expect(searchCities(cities, 'zur')).toEqual([2])
  expect(searchCities(cities, 'йошк')).toEqual([3])
})
