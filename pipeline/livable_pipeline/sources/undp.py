import csv
from pathlib import Path

import numpy as np

from ..download import fetch
from ..grid import Grid
from .countries import country_values, load_countries

URL = "https://hdr.undp.org/sites/default/files/2025_HDR/HDR25_Composite_indices_complete_time_series.csv"
INFO = {
    "name": "UNDP Human Development Report 2025, HDI",
    "url": "https://hdr.undp.org/data-center/documentation-and-downloads",
    "license": "CC BY 3.0 IGO",
    "citation": "UNDP (2025). Human Development Report 2025. United Nations Development Programme.",
    "period": "HDI 2023 (latest year per country, HDR 2025)",
    "retrieved": "2026-10-12",
}


def latest_hdi(csv_path: Path) -> dict[str, float]:
    """Latest non-empty hdi_YYYY per country; aggregate rows (iso3 ZZ*) are skipped."""
    with open(csv_path, newline="", encoding="cp1252") as f:  # the UNDP file is not UTF-8
        rows = list(csv.DictReader(f))
    cols = sorted((c for c in rows[0] if c.startswith("hdi_") and c[4:].isdigit()), reverse=True)
    out = {}
    for r in rows:
        if r["iso3"].startswith("ZZ"):
            continue
        v = next((r[c] for c in cols if r[c].strip()), None)
        if v is not None:
            out[r["iso3"]] = float(v)
    return out


def build(grid: Grid, raw_dir: Path) -> dict[str, np.ndarray]:
    path = fetch(URL, raw_dir / "undp" / "HDR25_Composite_indices_complete_time_series.csv")
    index, codes, _ = load_countries(raw_dir, grid.land)
    return {"hdi": country_values(index, codes, latest_hdi(path))}
