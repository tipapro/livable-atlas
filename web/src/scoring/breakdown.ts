import { FACTORS, type FactorId, type FactorSettings } from './factors'
import type { PointSample } from './score'

export interface BreakdownRow { id: FactorId; value: number; s: number; weight: number; lost: number; key: boolean }

// Factors of a sampled point, biggest score loss first (the worker computes it); ties by weight, then FACTORS order.
export function breakdown(sample: PointSample, f: Record<FactorId, FactorSettings>): BreakdownRow[] {
  return FACTORS.flatMap((d) => {
    const x = sample.factors[d.id]
    return x ? [{ id: d.id, value: x.value, s: x.s, weight: f[d.id].weight, lost: x.lost, key: f[d.id].critical }] : []
  }).sort((a, b) => b.lost - a.lost || b.weight - a.weight) // stable: FACTORS order breaks the rest
}
