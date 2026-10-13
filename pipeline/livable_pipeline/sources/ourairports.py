import csv
from pathlib import Path

import numpy as np

from ..download import fetch
from ..grid import Grid, land_distance_km

URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
INFO = {
    "name": "OurAirports (large airports)",
    "url": "https://ourairports.com/data/",
    "license": "Public domain",
    "citation": "OurAirports open data (ourairports.com).",
    "period": "database snapshot of the retrieval date",
    "retrieved": "2026-10-12",
}


def large_airports(csv_path: Path) -> tuple[np.ndarray, np.ndarray]:
    with open(csv_path, newline="", encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if r["type"] == "large_airport"]
    return np.array([float(r["latitude_deg"]) for r in rows]), np.array([float(r["longitude_deg"]) for r in rows])


def build(grid: Grid, raw_dir: Path) -> dict[str, np.ndarray]:
    path = fetch(URL, raw_dir / "ourairports" / "airports.csv")
    return {"dist_airport": land_distance_km(*large_airports(path), grid.land)}
