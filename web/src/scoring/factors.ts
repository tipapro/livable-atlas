import type { Manifest } from '../data/format'

export type Group = 'climate' | 'geography' | 'hazards' | 'environment' | 'infrastructure' | 'country'
export type FactorId =
  | 'warm_tmax' | 'warm_tmin' | 'cold_tmax' | 'cold_tmin' | 'cold_feel' | 'cold_sun' | 'warm_tdew' | 'precip_annual' | 'sunshine' | 'wet_days' | 'wind_mean' | 'seasonality' | 'frost_months' | 'comfort_months'
  | 'coast_dist' | 'elevation' | 'ruggedness' | 'cyclone_freq' | 'seismic_pga' | 'wildfire' | 'flood' | 'pm25'
  | 'travel_city' | 'dist_bigcity' | 'dist_airport' | 'pop_density' | 'hdi' | 'homicide' | 'gdp_pc' | 'price_level'
export interface FactorDef { id: FactorId; group: Group; unit: string; min: number; max: number; step: number; log?: true }

export const GROUPS: readonly Group[] = ['climate', 'geography', 'hazards', 'environment', 'infrastructure', 'country']
export const FACTORS: readonly FactorDef[] = [
  { id: 'warm_tmax', group: 'climate', unit: '°C', min: -10, max: 50, step: 0.5 },
  { id: 'warm_tmin', group: 'climate', unit: '°C', min: -20, max: 35, step: 0.5 },
  { id: 'cold_tmax', group: 'climate', unit: '°C', min: -40, max: 35, step: 0.5 },
  { id: 'cold_tmin', group: 'climate', unit: '°C', min: -50, max: 30, step: 0.5 },
  { id: 'cold_feel', group: 'climate', unit: '°C', min: -50, max: 45, step: 0.5 },
  { id: 'cold_sun', group: 'climate', unit: '%', min: 0, max: 100, step: 1 },
  { id: 'warm_tdew', group: 'climate', unit: '°C', min: -30, max: 30, step: 0.5 },
  { id: 'precip_annual', group: 'climate', unit: 'mm', min: 10, max: 5000, step: 10, log: true }, // log: rain is felt by ratio, so a wet coast is not floored like a desert
  { id: 'sunshine', group: 'climate', unit: 'h', min: 400, max: 4200, step: 10 }, // min stays above 300 so a W/m² save is detected
  { id: 'wet_days', group: 'climate', unit: 'days', min: 0, max: 366, step: 1 },
  { id: 'wind_mean', group: 'climate', unit: 'm/s', min: 0, max: 15, step: 0.1 },
  { id: 'seasonality', group: 'climate', unit: '°C', min: 0, max: 60, step: 0.5 },
  { id: 'frost_months', group: 'climate', unit: 'mo', min: 0, max: 12, step: 1 },
  { id: 'comfort_months', group: 'climate', unit: 'mo', min: 0, max: 12, step: 1 },
  { id: 'coast_dist', group: 'geography', unit: 'km', min: 0, max: 2500, step: 5 },
  { id: 'elevation', group: 'geography', unit: 'm', min: -100, max: 5000, step: 10 },
  { id: 'ruggedness', group: 'geography', unit: 'm', min: 0, max: 2000, step: 10 },
  { id: 'cyclone_freq', group: 'hazards', unit: '/decade', min: 0, max: 10, step: 0.05 },
  { id: 'seismic_pga', group: 'hazards', unit: 'g', min: 0, max: 1.5, step: 0.01 },
  { id: 'wildfire', group: 'hazards', unit: '%', min: 0, max: 50, step: 0.1 },
  { id: 'flood', group: 'hazards', unit: '%', min: 0, max: 100, step: 1 },
  { id: 'pm25', group: 'environment', unit: 'µg/m³', min: 0, max: 100, step: 0.5 },
  { id: 'travel_city', group: 'infrastructure', unit: 'min', min: 0, max: 1440, step: 5 },
  { id: 'dist_bigcity', group: 'infrastructure', unit: 'km', min: 0, max: 3000, step: 10 },
  { id: 'dist_airport', group: 'infrastructure', unit: 'km', min: 0, max: 3000, step: 10 },
  { id: 'pop_density', group: 'infrastructure', unit: 'people/km²', min: 0.1, max: 50000, step: 0.1, log: true },
  { id: 'hdi', group: 'country', unit: 'index', min: 0.3, max: 1, step: 0.01 },
  { id: 'homicide', group: 'country', unit: '/100k', min: 0, max: 60, step: 0.5 },
  { id: 'gdp_pc', group: 'country', unit: '$', min: 500, max: 650000, step: 500, log: true },
  { id: 'price_level', group: 'country', unit: 'ratio', min: 0, max: 2.5, step: 0.01 },
]

export interface FactorSettings { lo: number; hi: number; tol: number; weight: number; critical: boolean }
export interface ComfortSettings { dayLo: number; dayHi: number; nightMin: number; dewMax: number; sunBonus: number }
export interface ScoreSettings { factors: Record<FactorId, FactorSettings>; comfort: ComfortSettings; groups: Record<Group, number>; strength: number }

export const isAvailable = (id: FactorId, m: Manifest): boolean =>
  id === 'comfort_months' ? 'tmax' in m.monthly && 'tmin' in m.monthly && 'tdew' in m.monthly
    : id === 'cold_feel' ? 'cold_tmax' in m.layers && 'cold_sun' in m.layers
    : id in m.layers
