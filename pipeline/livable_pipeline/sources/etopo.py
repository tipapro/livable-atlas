from pathlib import Path

import numpy as np
import xarray

from ..download import fetch
from ..grid import Grid

URL = "https://www.ngdc.noaa.gov/thredds/fileServer/global/ETOPO2022/60s/60s_surface_elev_netcdf/ETOPO_2022_v1_60s_N90W180_surface.nc"
MIN_LAND_MEAN = -500  # a no-dry-pixel cell deeper than this is ocean (deepest real land, Dead Sea shore, is ~-430 m)
INFO = {
    "name": "ETOPO 2022 Global Relief Model (60 arc-second)",
    "url": "https://www.ncei.noaa.gov/products/etopo-global-relief-model",
    "license": "Public domain (NOAA NCEI)",
    "citation": "NOAA National Centers for Environmental Information (2022). ETOPO 2022 15 Arc-Second Global Relief Model. doi:10.25921/fd45-gt74",
    "period": "ETOPO 2022 v1",
    "retrieved": "2026-10-12",
}


def relief_layers(z: np.ndarray, land: np.ndarray, k: int) -> dict[str, np.ndarray]:
    h, w = land.shape
    # shortcut: whole-array float64 processing peaks at ~6-8 GB RAM; process in row strips if the build must run on a small machine/CI
    b = z.reshape(h, k, w, k).astype(np.float64)  # float64: mean(x²) − mean(x)² cancels badly in float32
    dry = b >= 0
    wet = dry.sum(axis=(1, 3)) == 0
    use = np.where(wet[:, None, :, None], True, dry)  # cells with no dry pixel (Caspian depression) use all pixels
    n = use.sum(axis=(1, 3))
    x = np.where(use, b, 0)
    mean = x.sum(axis=(1, 3)) / n
    land = land & ~(wet & (mean < MIN_LAND_MEAN))
    var = (x * x).sum(axis=(1, 3)) / n - mean**2
    out = {"elevation": mean, "ruggedness": np.sqrt(np.maximum(var, 0))}
    return {key: np.where(land, v, np.nan).astype(np.float32) for key, v in out.items()}


def build(grid: Grid, raw_dir: Path) -> dict[str, np.ndarray]:
    path = fetch(URL, raw_dir / "etopo" / "ETOPO_2022_v1_60s_N90W180_surface.nc")
    with xarray.open_dataset(path) as ds:
        da = ds["z"]
        assert da.shape == (10800, 21600), da.shape
        assert ds.lat[0] < ds.lat[-1] and ds.lon[0] < ds.lon[-1], "unexpected axis order"
        z = da.values[::-1]  # file is south-first
    return relief_layers(z, grid.land, 15)
