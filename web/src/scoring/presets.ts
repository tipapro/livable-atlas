import type { FactorId, FactorSettings, ScoreSettings } from './factors'

const p = (lo: number, hi: number, tol: number, weight: number, critical = false): FactorSettings => ({ lo, hi, tol, weight, critical })

export const CALIFORNIA: ScoreSettings = {
  factors: {
    warm_tmax: p(22, 29, 7, 5, true),
    warm_tmin: p(13, 20, 6, 3),
    cold_feel: p(18, 30, 18, 5, true),
    cold_tmax: p(15, 24, 15, 0),
    cold_sun: p(50, 100, 40, 0),
    cold_tmin: p(5, 14, 12, 2),
    warm_tdew: p(-10, 16, 6, 4, true),
    precip_annual: p(230, 1000, 0.3, 1, true), // key: a rainless desert is not livable however sunny; 0.3 decade: floor below ~75 mm, Sochi's 1700 mm only ×0.78
    sunshine: p(2800, 4200, 1200, 5, true),
    wet_days: p(0, 60, 110, 5, true),
    wind_mean: p(0, 5, 4, 1),
    seasonality: p(0, 12, 12, 3),
    frost_months: p(0, 0, 4, 2),
    comfort_months: p(8, 12, 6, 5, true), // key: what people praise in California is weather fit to be outside all year
    coast_dist: p(0, 50, 300, 3),
    elevation: p(0, 1500, 1500, 1),
    ruggedness: p(0, 1000, 500, 0),
    cyclone_freq: p(0, 0.2, 2, 3),
    seismic_pga: p(0, 0.42, 0.5, 1),
    wildfire: p(0, 0.5, 5, 1),
    flood: p(0, 5, 30, 1),
    pm25: p(0, 11, 25, 2, true),
    travel_city: p(0, 20, 100, 3, true), // key: a mild climate with no city within hours is not livable (empty outback, Patagonia); tol 100 lets the road web around big cities show
    dist_bigcity: p(0, 30, 120, 2),
    dist_airport: p(0, 50, 150, 1),
    pop_density: p(100, 20000, 1, 1),
    hdi: p(0.85, 1, 0.15, 3, true),
    homicide: p(0, 6, 10, 2, true),
    gdp_pc: p(50000, 650000, 0.7, 3, true), // key with hdi: a fine climate does not make up for a weak economy (North African coast); log scale: tol in decades
    price_level: p(0, 1.2, 0.8, 0),
  } satisfies Record<FactorId, FactorSettings>,
  comfort: { dayLo: 18, dayHi: 31, nightMin: 8, dewMax: 18, sunBonus: 8 },
  groups: { climate: 4, country: 2.5, hazards: 1, infrastructure: 2, environment: 1, geography: 0.5 },
  strength: 0.25,
}

export const SAN_DIEGO = { lat: 32.7157, lon: -117.1611 }
