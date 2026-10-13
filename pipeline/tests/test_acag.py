import numpy as np
import pytest

from livable_pipeline.grid import H, W, Grid
from livable_pipeline.sources.acag import build, pm25_layer


def test_pm25_layer_regrids_0p1():
    lat = np.array([0.05, 0.15, 0.25, 0.35, 0.45])
    lon = np.array([0.05, 0.15, 0.25, 0.35, 0.45])  # ascending lat: placed by coordinates, so no flip needed
    pm = np.full((5, 5), 10.0)
    pm[0, 0] = 20.0  # pixel 0–0.1°N, 0–0.1°E
    land = np.zeros((H, W), bool)
    land[359, 720] = True  # cell 0–0.25°N, 0–0.25°E
    out = pm25_layer(pm, lat, lon, land)["pm25"]
    assert abs(out[359, 720] - (20 * 4 + 10 * 21) / 25) < 1e-5 and np.isnan(out[0, 0])


def test_pm25_layer_partial_coverage_north_first():
    lat = np.array([20.45, 20.35, 20.25, 20.15, 20.05])  # north-first, covers 20–20.5°N only
    lon = np.array([10.05, 10.15, 10.25, 10.35, 10.45])
    land = np.zeros((H, W), bool)
    land[280, 760] = land[100, 100] = True  # 19.75–20°N (not covered), far away
    land[279, 760] = True  # 20–20.25°N, 10–10.25°E (covered)
    out = pm25_layer(np.full((5, 5), 7.0), lat, lon, land)["pm25"]
    assert out[279, 760] == 7 and np.isnan(out[280, 760]) and np.isnan(out[100, 100])


def test_pm25_layer_masks_fill_value():
    lat = np.array([0.05, 0.15, 0.25, 0.35, 0.45])
    pm = np.full((5, 5), 10.0)
    pm[0, 0] = -999.0
    land = np.zeros((H, W), bool)
    land[359, 720] = True
    assert pm25_layer(pm, lat, lat, land)["pm25"][359, 720] == 10


def test_pm25_layer_rejects_wrong_spacing():
    with pytest.raises(AssertionError):
        pm25_layer(np.zeros((3, 3)), np.array([0.05, 0.1, 0.15]), np.array([0.05, 0.15, 0.25]), np.zeros((H, W), bool))


def test_build_without_file_returns_empty(tmp_path, capsys):
    assert build(Grid(np.zeros((H, W), bool)), tmp_path) == {} and "DATA-SOURCES" in capsys.readouterr().out
