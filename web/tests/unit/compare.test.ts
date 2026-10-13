import { expect, test } from 'vitest'
import { bestInRow } from '../../src/ui/CompareTable'

test('bestInRow marks the maximum only when it separates the values', () => {
  expect(bestInRow([0.5, 1, null])).toEqual([false, true, false])
  expect(bestInRow([1, 1])).toEqual([false, false])
  expect(bestInRow([0.2])).toEqual([false])
  expect(bestInRow([0.3, 0.9, 0.9])).toEqual([false, true, true])
  expect(bestInRow([null, null])).toEqual([false, false])
})
