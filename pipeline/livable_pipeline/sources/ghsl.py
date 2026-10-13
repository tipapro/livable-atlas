import zipfile
from pathlib import Path

import numpy as np

from ..download import fetch
from ..grid import Grid, cell_area_km2, coarsen_sum, read_coarse

URL = "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_POP_GLOBE_R2023A/GHS_POP_E2020_GLOBE_R2023A_4326_30ss/V1-0/GHS_POP_E2020_GLOBE_R2023A_4326_30ss_V1_0.zip"
INFO = {
    "name": "GHS-POP R2023A, epoch 2020",
    "url": "https://human-settlement.emergency.copernicus.eu/ghs_pop2023.php",
    "license": "CC BY 4.0",
    "citation": "Schiavina, M., Freire, S., Carioli, A., MacManus, K. (2023). GHS-POP R2023A – GHS population grid multitemporal (1975–2030). European Commission, Joint Research Centre. doi:10.2905/2FF68A52-5B5B-4A22-8F40-C41DA8332CFE",
    "period": "population epoch 2020 (release R2023A)",
    "retrieved": "2026-10-12",
}


def density_layer(tif: str, land: np.ndarray) -> dict[str, np.ndarray]:
    # shortcut: divides by the whole cell area, sea included, so coastal cells are under-reported; upgrade by using land area.
    d = read_coarse(tif, reduce=coarsen_sum) / cell_area_km2()[:, None]
    return {"pop_density": np.where(land, d, np.nan).astype(np.float32)}


def build(grid: Grid, raw_dir: Path) -> dict[str, np.ndarray]:
    zip_path = fetch(URL, raw_dir / "ghsl" / "GHS_POP_E2020_GLOBE_R2023A_4326_30ss_V1_0.zip")
    with zipfile.ZipFile(zip_path) as z:
        tifs = [n for n in z.namelist() if n.endswith(".tif")]
    assert len(tifs) == 1, f"expected one .tif in {zip_path}, found {tifs}"
    return density_layer(f"zip://{zip_path}!{tifs[0]}", grid.land)
