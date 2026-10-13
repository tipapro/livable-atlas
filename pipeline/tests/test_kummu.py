import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

from livable_pipeline.grid import H, W
from livable_pipeline.sources.kummu import gdp_layer


def _write(path, count):
    a = np.full((count, 6, 6), 5000, np.float32)  # 6×6 pixels of 1/12° = 2×2 cells
    a[0] = 7  # band 1 (1990) must not be read
    a[count - 1, :3, 3:] = -1  # cell (0, 1): no valid pixel
    a[count - 1, :3, :3] = [[30000, -1, 30000], [60000, 60000, -1], [-1, -1, -1]]
    with rasterio.open(
        path, "w", driver="GTiff", height=6, width=6, count=count, dtype="float32",
        crs="EPSG:4326", transform=from_origin(-180, 90, 1 / 12, 1 / 12), nodata=-1,
    ) as dst:
        dst.write(a)


def test_gdp_layer_averages_valid_pixels_and_keeps_nodata(tmp_path):
    _write(tmp_path / "g.tif", 35)
    land = np.zeros((H, W), bool)
    land[0, 0] = land[0, 1] = land[5, 5] = True  # (0, 1) is all nodata; (5, 5) is land outside the raster
    out = gdp_layer(str(tmp_path / "g.tif"), land)["gdp_pc"]
    assert out.shape == (H, W) and out.dtype == np.float32
    assert out[0, 0] == 45000 and np.isnan(out[0, 1]) and np.isnan(out[5, 5])
    assert np.isnan(out[1, 0])  # not land, although the raster has data there


def test_gdp_layer_rejects_wrong_band_count(tmp_path):
    _write(tmp_path / "g.tif", 34)
    with pytest.raises(AssertionError):
        gdp_layer(str(tmp_path / "g.tif"), np.ones((H, W), bool))
