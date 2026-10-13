import zipfile

import numpy as np
import rasterio
from rasterio.transform import from_origin

from livable_pipeline.grid import H, W
from livable_pipeline.sources.jrc_flood import TIF, flood_layer


def test_flood_share(tmp_path):
    nodata = -3.4e38
    a = np.array([[1.5, nodata], [nodata, 0.0]], np.float32)  # 2×2 pixels of 0.125° = one 0.25° cell
    with rasterio.open(
        tmp_path / TIF, "w", driver="GTiff", height=2, width=2, count=1, dtype="float32",
        crs="EPSG:4326", transform=from_origin(-180, 90, 0.125, 0.125), nodata=nodata,
    ) as dst:
        dst.write(a, 1)
    with zipfile.ZipFile(tmp_path / "f.zip", "w") as z:
        z.write(tmp_path / TIF, TIF)
    land = np.zeros((H, W), bool)
    land[0, 0] = land[5, 5] = True  # (5, 5) is land outside the raster extent
    out = flood_layer(f"zip://{tmp_path / 'f.zip'}!{TIF}", land)["flood"]
    assert out.shape == (H, W) and out.dtype == np.float32
    assert out[0, 0] == 25.0 and np.isnan(out[5, 5]) and np.isnan(out[0, 1])
