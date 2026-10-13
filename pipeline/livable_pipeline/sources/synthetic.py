from pathlib import Path

import numpy as np

from ..derive import seasonal_layers
from ..grid import LAT, LON, Grid, nearest_km

INFO = {"name": "Synthetic test data", "url": "", "license": "n/a", "citation": "Generated, not real"}


def _coast(land: np.ndarray) -> np.ndarray:
    ocean = ~land
    near_ocean = np.roll(ocean, 1, axis=1) | np.roll(ocean, -1, axis=1)  # longitude wraps
    near_ocean[1:] |= ocean[:-1]
    near_ocean[:-1] |= ocean[1:]
    return land & near_ocean


def build(grid: Grid, raw_dir: Path) -> dict[str, np.ndarray]:
    land = grid.land
    rows, cols = np.nonzero(land)
    coast_rows, coast_cols = np.nonzero(_coast(land))
    coast_dist = np.zeros(land.shape)
    coast_dist[rows, cols] = nearest_km(LAT[coast_rows], LON[coast_cols], LAT[rows], LON[cols])
    cont = np.clip(coast_dist / 1500, 0, 1)

    alat = np.abs(LAT)[:, None]
    peak = np.where(LAT >= 0, 6, 0)[:, None]
    m = np.arange(12)[:, None, None]
    T = 27 - 0.55 * np.maximum(0, alat - 12)
    A = (1 + 0.3 * alat) * (0.5 + 0.8 * cont)
    tavg = T + A * np.cos(2 * np.pi * (m - peak) / 12)
    D = 8 + 8 * cont
    tmax, tmin = tavg + D / 2, tavg - D / 2
    tdew = tmin - 2 - 10 * cont

    out = {
        **seasonal_layers(tmax, tmin, tdew),
        "precip_annual": 300 + 2200 * np.exp(-alat / 12) * (1 - 0.6 * cont) + 400 * (1 - cont),
        "sunshine": 3200 - 30 * alat,
        "wet_days": 40 + 2.5 * alat,
        "wind_mean": 2 + 3 * (1 - cont) + 0.03 * alat,
        "coast_dist": coast_dist,
        "elevation": 100 + 2000 * cont**2,
        "ruggedness": 50 + 300 * cont,
        "monthly/tmax": tmax,
        "monthly/tmin": tmin,
        "monthly/tdew": tdew,
    }
    return {k: np.where(land, v, np.nan).astype(np.float32) for k, v in out.items()}
