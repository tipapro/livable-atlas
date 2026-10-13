from pathlib import Path

import numpy as np
import xarray

from ..grid import H, W, Grid, coarsen_mean

INFO = {
    "name": "ACAG V6.GL.02.04 satellite-derived PM2.5 (2022 annual mean, 0.1°)",
    "url": "https://sites.wustl.edu/acag/datasets/surface-pm2-5/",
    "license": "Free to use with citation",
    "citation": "Shen, S., Li, C., van Donkelaar, A., et al. (2024). Enhancing global estimation of fine particulate matter concentrations by including geophysical a priori information in deep learning. ACS ES&T Air 1, 332–345.",
    "period": "2022 annual mean (global V6.GL.02.04 file; manual download)",
    "retrieved": "2026-10-12",
}
FINE = 0.05  # working resolution: 0.1° pixels are repeated 2×2, then 5×5 blocks make a 0.25° cell


def _index(edge: np.ndarray) -> np.ndarray:
    """Both 0.05° sub-pixel indices of each 0.1° pixel, given its near edge in 0.05° units from the grid edge."""
    assert np.abs(edge - np.round(edge)).max() < 0.25, "pixels are off the 0.05° grid"
    first = np.round(edge).astype(int)
    return np.stack([first, first + 1], axis=1).ravel()


def pm25_layer(pm: np.ndarray, lat: np.ndarray, lon: np.ndarray, land: np.ndarray) -> dict[str, np.ndarray]:
    assert pm.shape == (len(lat), len(lon)), f"PM25 shape {pm.shape} != ({len(lat)}, {len(lon)})"
    # float32 coordinates in the real files drift by ~1e-5 from 0.1
    assert np.allclose(np.abs(np.diff(lat)), 0.1, atol=1e-4) and np.allclose(np.diff(lon), 0.1, atol=1e-4), "not 0.1° spacing"
    assert lon.min() > -180 and lon.max() < 180, "longitudes must be -180..180"
    pm = np.where(pm < 0, np.nan, pm)  # fill value is -999
    rows, cols = _index((90 - lat - 0.05) / FINE), _index((lon + 180 - 0.05) / FINE)
    fine = np.full((H * 5, W * 5), np.nan, np.float32)
    ri, ci = (rows >= 0) & (rows < H * 5), (cols >= 0) & (cols < W * 5)  # the file may cover only part of the globe
    fine[np.ix_(rows[ri], cols[ci])] = np.repeat(np.repeat(pm, 2, 0), 2, 1)[np.ix_(ri, ci)]
    return {"pm25": np.where(land, coarsen_mean(fine, 5), np.nan).astype(np.float32)}


def build(grid: Grid, raw_dir: Path) -> dict[str, np.ndarray]:
    # only the global product: regional files (AS, EU, NA…) are other years and would leave seams
    files = sorted((raw_dir / "acag").glob("*.GL.*.nc"))
    if not files:
        print("acag: no global (*.GL.*.nc) file in pipeline/.cache/raw/acag/ — download the ACAG V6.GL.02 annual 0.1° PM2.5 netCDF (see docs/DATA-SOURCES.md)")
        return {}
    with xarray.open_dataset(files[-1]) as ds:
        return pm25_layer(ds["PM25"].values, ds["lat"].values, ds["lon"].values, grid.land)
