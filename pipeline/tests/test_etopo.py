import numpy as np

from livable_pipeline.sources.etopo import relief_layers


def test_coastal_cell_uses_land_pixels():
    z = np.array([[100, -50], [300, -4000]], np.float32)  # one cell, two land pixels
    out = relief_layers(z, np.array([[True]]), 2)
    assert out["elevation"][0, 0] == 200 and out["ruggedness"][0, 0] == 100
    assert all(v.dtype == np.float32 for v in out.values())


def test_below_sea_level_cell_is_negative_not_nan():
    out = relief_layers(np.full((2, 2), -28, np.float32), np.array([[True]]), 2)
    assert out["elevation"][0, 0] == -28 and out["ruggedness"][0, 0] == 0


def test_off_land_is_nan():
    out = relief_layers(np.zeros((2, 4), np.float32), np.array([[True, False]]), 2)
    assert np.isnan(out["elevation"][0, 1]) and np.isnan(out["ruggedness"][0, 1])


def test_ocean_only_cell_is_nan():
    out = relief_layers(np.full((2, 2), -3000, np.float32), np.array([[True]]), 2)
    assert np.isnan(out["elevation"][0, 0]) and np.isnan(out["ruggedness"][0, 0])
