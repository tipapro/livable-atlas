import zipfile

import numpy as np
import rasterio
from rasterio.transform import from_origin

from livable_pipeline.grid import H, W
from livable_pipeline.sources.gem import TIF, pga_layer


def test_pga_layer_masks_to_land_and_nodata(tmp_path):
    nodata = 1.797e308
    a = np.full((10, 10), 0.4)
    a[:5, :5] = np.arange(25).reshape(5, 5) / 100  # mean 0.12
    a[:5, 5:] = nodata  # a land cell with no data
    with rasterio.open(
        tmp_path / TIF, "w", driver="GTiff", height=10, width=10, count=1, dtype="float64",
        crs="EPSG:4326", transform=from_origin(-180, 89.99, 0.05, 0.0499967), nodata=nodata,
    ) as dst:
        dst.write(a, 1)
    with zipfile.ZipFile(tmp_path / "gem.zip", "w") as z:
        z.write(tmp_path / TIF, TIF)
    land = np.zeros((H, W), bool)
    land[0, 0] = land[0, 1] = land[1, 0] = True  # (1, 1) is covered by the raster but not land
    out = pga_layer(f"zip://{tmp_path / 'gem.zip'}!{TIF}", land)["seismic_pga"]
    assert out.shape == (H, W) and out.dtype == np.float32
    assert np.isclose(out[0, 0], 0.12) and np.isclose(out[1, 0], 0.4)
    assert np.isnan(out[0, 1]) and np.isnan(out[1, 1]) and np.isnan(out[5, 5])
