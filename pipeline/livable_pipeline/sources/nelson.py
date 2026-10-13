from pathlib import Path

import numpy as np

from ..download import fetch
from ..grid import Grid, read_coarse

URL = "https://ndownloader.figshare.com/files/14189849"
INFO = {
    "name": "Travel time to cities ≥ 50,000 (2015)",
    "url": "https://figshare.com/articles/dataset/Travel_time_to_cities_and_ports_in_the_year_2015/7638134",
    "license": "CC BY 4.0",
    "citation": "Nelson, A., Weiss, D.J., van Etten, J., et al. (2019). A suite of global accessibility indicators. Scientific Data 6, 266.",
    "period": "2015",
    "retrieved": "2026-10-12",
}


def travel_layer(tif: str, land: np.ndarray) -> dict[str, np.ndarray]:
    # shortcut: plain mean over all pixels of the cell, not population-weighted; upgrade if rural cells in big cells matter.
    # The file carries no nodata tag, so 65535 (sea) must be masked here.
    t = read_coarse(tif, prep=lambda s: np.where(s == 65535, np.nan, s))
    return {"travel_city": np.where(land, t, np.nan).astype(np.float32)}


def build(grid: Grid, raw_dir: Path) -> dict[str, np.ndarray]:
    return travel_layer(str(fetch(URL, raw_dir / "nelson" / "travel_time_to_cities_11.tif")), grid.land)
