from pathlib import Path

import numpy as np

from livable_pipeline.grid import H, W, Grid
from livable_pipeline.sources import synthetic

KEYS = {
    "warm_tmax", "warm_tmin", "cold_tmax", "cold_tmin", "warm_tdew", "seasonality", "frost_months",
    "precip_annual", "sunshine", "wet_days", "wind_mean", "coast_dist", "elevation", "ruggedness",
    "monthly/tmax", "monthly/tmin", "monthly/tdew",
}  # fmt: skip


def band_grid():
    land = np.zeros((H, W), bool)
    land[100:500, 600:800] = True
    return Grid(land)


def test_synthetic_keys_and_shapes():
    out = synthetic.build(band_grid(), Path("/nonexistent"))
    assert set(out) == KEYS
    assert out["monthly/tmax"].shape == (12, H, W)
    assert all(v.dtype == np.float32 for v in out.values())
    assert np.isnan(out["warm_tmax"][0, 0])  # ocean


def test_synthetic_plausible():
    out = synthetic.build(band_grid(), Path("/nonexistent"))
    eq, north = 359, 119  # ~0° and ~60°N, column 700
    assert out["warm_tmax"][eq, 700] > out["warm_tmax"][north, 700]
    assert np.nanargmax(out["monthly/tmax"][:, north, 700]) == 6
    assert out["coast_dist"][300, 600] == 0 and out["coast_dist"][300, 700] > 500
