import numpy as np
import rasterio
from rasterio.transform import from_origin

from livable_pipeline.grid import H, W, cell_area_km2
from livable_pipeline.sources.ghsl import density_layer


def test_density_layer(tmp_path):
    with rasterio.open(
        tmp_path / "p.tif", "w", driver="GTiff", height=2, width=2, count=1, dtype="float64",
        crs="EPSG:4326", transform=from_origin(-180, 90 - 360 * 0.25, 0.125, 0.125),
    ) as dst:
        dst.write(np.full((2, 2), 100.0), 1)
    land = np.zeros((H, W), bool)
    land[360, 0] = land[0, 0] = True  # (0, 0) is land outside the raster extent
    out = density_layer(str(tmp_path / "p.tif"), land)["pop_density"]
    assert out.shape == (H, W) and out.dtype == np.float32
    assert np.isclose(out[360, 0], 400 / cell_area_km2()[360], rtol=1e-6)
    assert np.isnan(out[0, 0]) and np.isnan(out[360, 1])
