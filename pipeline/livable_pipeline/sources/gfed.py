import re
import zipfile
from pathlib import Path

import numpy as np
import xarray

from ..download import fetch
from ..grid import H, W, Grid, cell_area_km2

URL = "https://zenodo.org/records/7668424/files/BA.zip?download=1"
YEARS = range(2001, 2021)
MEMBER = re.compile(r"BA(\d{4})(\d{2})\.nc")
INFO = {
    "name": "GFED5 burned area (2001–2020)",
    "url": "https://www.globalfiredata.org/",
    "license": "CC BY 4.0",
    "citation": "Chen, Y., Hall, J., van Wees, D., et al. (2023). Multi-decadal trends and variability in burned area from the fifth version of the Global Fire Emissions Database (GFED5). Earth System Science Data 15, 5227–5259.",
    "period": "burned area 2001–2020 (annual mean)",
    "retrieved": "2026-10-12",
}


def extract_months(zip_path: Path, out_dir: Path) -> list[Path]:
    """Extract the monthly files of YEARS (skipping ones already present); zip member paths are never used."""
    paths = []
    with zipfile.ZipFile(zip_path) as z:
        for name in z.namelist():
            base = Path(name).name
            m = MEMBER.fullmatch(base)
            if not m or int(m[1]) not in YEARS:
                continue
            dest = out_dir / base
            if not dest.exists():
                dest.write_bytes(z.read(name))
            paths.append(dest)
    return sorted(paths)


def annual_burned_km2(paths: list[Path]) -> np.ndarray:
    total = np.zeros((H, W), np.float64)
    for p in paths:
        with xarray.open_dataset(p) as ds:
            t = ds["Total"]
            assert t.shape == (1, H, W), f"{p}: Total shape {t.shape}"
            assert ds["lat"][0] < ds["lat"][-1], f"{p}: lat not ascending"
            total += t.values[0, ::-1]
    years = len({MEMBER.fullmatch(p.name)[1] for p in paths})
    return (total / years).astype(np.float32)


def wildfire_layer(km2: np.ndarray, land: np.ndarray) -> dict[str, np.ndarray]:
    return {"wildfire": np.where(land, 100 * km2 / cell_area_km2()[:, None], np.nan).astype(np.float32)}


def build(grid: Grid, raw_dir: Path) -> dict[str, np.ndarray]:
    zip_path = fetch(URL, raw_dir / "gfed" / "BA.zip")
    paths = extract_months(zip_path, raw_dir / "gfed")
    # A truncated download would average fewer months (or none) into the layer.
    assert len(paths) == 12 * len(YEARS), f"gfed: {len(paths)} monthly files, expected {12 * len(YEARS)}; delete pipeline/.cache/raw/gfed and rebuild"
    return wildfire_layer(annual_burned_km2(paths), grid.land)
