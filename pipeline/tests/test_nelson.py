import numpy as np
import rasterio
from rasterio.transform import from_origin

from livable_pipeline.grid import H, W
from livable_pipeline.sources.nelson import travel_layer


def test_travel_layer_ignores_nodata(tmp_path):
    a = np.array([[30, 65535], [60, 90]], np.uint16)  # 2×2 pixels of 0.125° = one cell; the real file has no nodata tag
    with rasterio.open(
        tmp_path / "t.tif", "w", driver="GTiff", height=2, width=2, count=1, dtype="uint16",
        crs="EPSG:4326", transform=from_origin(-180, 90, 0.125, 0.125),
    ) as dst:
        dst.write(a, 1)
    land = np.zeros((H, W), bool)
    land[0, 0] = land[5, 5] = True  # (5, 5) is land outside the raster extent
    out = travel_layer(str(tmp_path / "t.tif"), land)["travel_city"]
    assert out.shape == (H, W) and out.dtype == np.float32
    assert out[0, 0] == 60 and np.isnan(out[5, 5]) and np.isnan(out[0, 1])
