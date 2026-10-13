from pathlib import Path

import numpy as np

from ..download import fetch
from ..grid import Grid, read_coarse

URL = "https://zenodo.org/records/8409647/files/GEM-GSHM_PGA-475y-rock_v2023.zip?download=1"
TIF = "v2023_1_pga_475_rock_3min.tif"
INFO = {
    "name": "GEM Global Seismic Hazard Map v2023.1 (PGA, 10% in 50 years, rock)",
    "url": "https://www.globalquakemodel.org/product/global-seismic-hazard-map",
    "license": "CC BY-NC-SA 4.0",
    "citation": "Pagani, M., Garcia-Pelaez, J., Gee, R., et al. (2023). The 2023 Global Earthquake Model (GEM) Global Seismic Hazard Map (version 2023.1). doi:10.5281/zenodo.8409647",
    "period": "version 2023.1",
    "retrieved": "2026-10-12",
}


def pga_layer(tif: str, land: np.ndarray) -> dict[str, np.ndarray]:
    return {"seismic_pga": np.where(land, read_coarse(tif), np.nan).astype(np.float32)}


def build(grid: Grid, raw_dir: Path) -> dict[str, np.ndarray]:
    zip_path = fetch(URL, raw_dir / "gem" / "GEM-GSHM_PGA-475y-rock_v2023.zip")
    return pga_layer(f"zip://{zip_path}!{TIF}", grid.land)
