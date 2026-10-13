import numpy as np

from livable_pipeline.derive import dewpoint
from livable_pipeline.sources.terraclimate import climate_layers

KEYS = {
    "warm_tmax", "warm_tmin", "cold_tmax", "cold_tmin", "warm_tdew", "seasonality", "frost_months",
    "precip_annual", "wind_mean", "monthly/tmax", "monthly/tmin", "monthly/tdew", "monthly/prec",
}  # fmt: skip


def _monthly(shape=(1, 3)):
    t = 15 + 15 * np.cos(2 * np.pi * (np.arange(12) - 6) / 12)[:, None, None] * np.ones((12, *shape))
    return {"tmax": t + 5, "tmin": t - 5, "ppt": np.full((12, *shape), 10.0), "vap": np.full((12, *shape), 1.0),
            "ws": np.full((12, *shape), 3.0)}  # fmt: skip


def test_climate_layers_keys_and_values():
    land = np.array([[True, True, False]])
    out = climate_layers(_monthly(), land)
    assert set(out) == KEYS
    assert all(v.dtype == np.float32 for v in out.values())
    assert out["precip_annual"][0, 0] == 120 and out["wind_mean"][0, 0] == 3
    np.testing.assert_allclose(out["monthly/tdew"][:, 0, :2], dewpoint(1.0), rtol=1e-5)
    assert out["monthly/prec"].shape == (12, 1, 3)
    assert all(np.isnan(v[..., 2]).all() and np.isfinite(v[..., :2]).all() for v in out.values())


def test_land_without_data_stays_nan():
    m = _monthly()
    for v in m.values():
        v[:, :, 1] = np.nan
    out = climate_layers(m, np.ones((1, 3), bool))
    assert all(np.isnan(v[..., 1]).all() and np.isfinite(v[..., 0]).all() for v in out.values())
