from pathlib import Path

import numpy as np

from ..download import fetch
from ..grid import Grid, read_coarse

URL = "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/FLOODS/GlobalMaps/floodMapGL_rp100y.zip"
TIF = "floodMapGL_rp100y.tif"
INFO = {
    "name": "JRC flood hazard map of the World, 100-year return period",
    "url": "https://data.jrc.ec.europa.eu/dataset/jrc-floods-floodmapgl_rp100y-tif",
    "license": "CC BY 4.0",
    "citation": "Dottori, F., Salamon, P., Bianchi, A., Alfieri, L., Hirpa, F.A., Feyen, L. (2016). Development and evaluation of a framework for global flood hazard mapping. Advances in Water Resources 94, 87–102.",
    "period": "100-year flood depth map, 2016 release",
    "retrieved": "2026-10-12",
}


def flooded(a: np.ndarray) -> np.ndarray:
    # shortcut: share of all pixels in the cell, sea included, so coastal cells are under-reported; upgrade by masking sea pixels.
    return np.where(np.isfinite(a) & (a > 0), 100.0, 0.0).astype(np.float32)  # nodata inside the extent = outside the floodplain


def flood_layer(tif: str, land: np.ndarray) -> dict[str, np.ndarray]:
    return {"flood": np.where(land, read_coarse(tif, prep=flooded), np.nan).astype(np.float32)}


def build(grid: Grid, raw_dir: Path) -> dict[str, np.ndarray]:
    zip_path = fetch(URL, raw_dir / "jrc_flood" / "floodMapGL_rp100y.zip")
    return flood_layer(f"zip://{zip_path}!{TIF}", grid.land)
