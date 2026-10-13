from pathlib import Path

import numpy as np
import rasterio

from ..download import fetch
from ..grid import Grid, read_coarse

URL = "https://zenodo.org/api/records/18429133/files/rast_adm2_gdp_perCapita_1990_2024.tif/content"
INFO = {
    "name": "Kummu et al. 2025 GDP per capita (PPP), admin 2, 2024",
    "url": "https://doi.org/10.5281/zenodo.10976733",
    "license": "CC BY 4.0",
    "citation": "Kummu, M., Kosonen, M., Masoumzadeh Sayyar, S. (2025). Downscaled gridded global dataset for gross domestic product (GDP) per capita at purchasing power parity (PPP) over 1990–2022. Scientific Data. doi:10.1038/s41597-025-04487-x",
    "period": "2024 (last band of 1990–2024; Zenodo version of 2026-03-13)",
    "retrieved": "2026-10-13",
}


def gdp_layer(tif: str, land: np.ndarray) -> dict[str, np.ndarray]:
    with rasterio.open(tif) as src:
        assert src.count == 35, f"{tif}: {src.count} bands, expected 35 (1990-2024)"
    g = read_coarse(tif, band=35)  # the latest year, 2024
    return {"gdp_pc": np.where(land, g, np.nan).astype(np.float32)}


def build(grid: Grid, raw_dir: Path) -> dict[str, np.ndarray]:
    return gdp_layer(str(fetch(URL, raw_dir / "kummu" / "rast_adm2_gdp_perCapita_1990_2024.tif")), grid.land)
