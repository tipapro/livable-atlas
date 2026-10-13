import numpy as np
from shapely.geometry import box

from livable_pipeline.grid import H, RES, W
from livable_pipeline.sources.countries import country_code, country_raster, country_values


def _cell_bounds(r, c):
    west, north = -180 + c * RES, 90 - r * RES
    return west, north - RES, west + RES, north


def test_country_raster():
    land = np.zeros((H, W), bool); land[100, 100] = land[100, 103] = land[100, 104] = True
    a = box(*_cell_bounds(100, 100)); b = box(*_cell_bounds(100, 104)); c = box(*_cell_bounds(500, 500))  # c covers no land
    index, kept = country_raster(["BBB", "AAA", "CCC"], [b, a, c], land)
    assert kept == ["AAA", "BBB"]
    assert index[100, 100] == 0 and index[100, 104] == 1 and index[100, 103] == 1  # 103: centre in no polygon → nearest (104)
    assert np.isnan(index[0, 0])


def test_country_code():
    assert country_code("-99", "KOS") == "KOS" and country_code("FRA", "FRA") == "FRA"


def test_country_values_parent_fallback():
    index = np.array([[0.0, 1.0, np.nan]])
    out = country_values(index, ["SOL", "FRA"], {"SOM": 0.4, "FRA": 0.9})
    assert out[0, 0] == np.float32(0.4) and out[0, 1] == np.float32(0.9) and np.isnan(out[0, 2])


def test_country_raster_keeps_small_islands():
    # An island touching a land cell without covering its centre takes that cell, not the nearest big country;
    # a centre-less cell touched by two countries still takes the nearest one.
    land = np.zeros((H, W), bool); land[200, 200] = land[200, 202] = land[300, 300] = land[300, 301] = True
    w, s, e, n = _cell_bounds(200, 200)
    island = box(w + 0.01, s + 0.01, w + 0.05, s + 0.05)
    big = box(*_cell_bounds(200, 202))
    w, s, e, n = _cell_bounds(300, 300)
    x_corner, y_corner = box(w + 0.01, s + 0.01, w + 0.05, s + 0.05), box(e - 0.05, n - 0.05, e - 0.01, n - 0.01)
    y_cell = box(*_cell_bounds(300, 301))
    index, kept = country_raster(["BIG", "ISL", "XXX", "YYY", "YYY"], [big, island, x_corner, y_corner, y_cell], land)
    assert kept[int(index[200, 200])] == "ISL" and kept[int(index[200, 202])] == "BIG"
    assert kept[int(index[300, 300])] == "YYY"
