import gzip

import numpy as np
import pytest

from livable_pipeline.derive import daylength_hours
from livable_pipeline.grid import H, W
from livable_pipeline.sources.cru import cru_layers, fill_near, read_points, to_grid


def test_daylength_hours():
    eq, n60, s60 = daylength_hours(np.array([0.0, 60.0, -60.0])).T
    np.testing.assert_allclose(eq, 12, atol=0.01)
    assert 18 < n60[5] < 19.5 and 5 < n60[11] < 6.5  # June long, December short
    np.testing.assert_allclose(n60[5], s60[11], atol=0.3)  # hemispheres mirror


def test_read_points_and_to_grid(tmp_path):
    rows = ["  -0.083  -179.917" + "   50.0" * 12, "  -0.083  -179.833" + "   70.0" * 12, "  89.917  179.917" + "   10.0" * 12]
    path = tmp_path / "x.dat.gz"
    path.write_bytes(gzip.compress("\n".join(rows).encode()))
    lat, lon, v = read_points(path)
    assert v.shape == (3, 12) and lat[0] == -0.083
    g = to_grid(lat, lon, v)
    assert g.shape == (12, H, W)
    assert g[0, 360, 0] == 60  # both points fall in the cell just south of the equator at 180° W: mean
    assert g[3, 0, W - 1] == 10 and np.isnan(g[0, 100, 100])


def test_cru_layers():
    sunp = np.full((12, 1, 2), 50.0)
    rd0 = np.full((12, 1, 2), 3.0)
    rd0[:, 0, 1] = np.nan
    out = cru_layers(sunp, rd0, np.ones((1, 2), bool), np.array([0.0]))
    np.testing.assert_allclose(out["sunshine"][0, 0], 0.5 * 12 * 365, rtol=1e-3)  # half of 12 h days, all year
    assert out["wet_days"][0, 0] == 36 and out["wet_days"][0, 1] == 36  # the gap is filled from its neighbour
    assert all(v.dtype == np.float32 for v in out.values())


def test_cru_layers_cold_sun():
    sunp = np.zeros((12, 2, 1))
    sunp[[11, 0, 1], 0, 0] = 80.0  # north cell: Dec–Feb sunny
    sunp[[5, 6, 7], 1, 0] = 40.0  # south cell: Jun–Aug
    rd0 = np.ones((12, 2, 1))
    out = cru_layers(sunp, rd0, np.ones((2, 1), bool), np.array([45.0, -45.0]))
    assert out["cold_sun"][0, 0] == pytest.approx(80) and out["cold_sun"][1, 0] == pytest.approx(40)


def test_fill_near():
    v = np.full((1, 6), np.nan)
    v[0, 0] = 5.0
    out = fill_near(v, 2)
    assert out[0, :3].tolist() == [5, 5, 5] and np.isnan(out[0, 3:]).all()  # up to 2 cells away, no further


def test_read_points_rejects_out_of_range(tmp_path):
    path = tmp_path / "x.dat.gz"
    path.write_bytes(gzip.compress(("  10.000  180.000" + "   50.0" * 12).encode()))
    try:
        read_points(path)
    except AssertionError as e:
        assert "out of range" in str(e)
    else:
        raise AssertionError("lon = 180 accepted")
