import json
from pathlib import Path

import numpy as np

from ..download import fetch
from ..grid import Grid
from .countries import country_values, load_countries

URL = "https://api.worldbank.org/v2/country/all/indicator/{ind}?format=json&per_page=20000&mrnev=5"
INDICATORS = ("VC.IHR.PSRC.P5", "PA.NUS.PPP", "PA.NUS.FCRF")
INFO = {
    "name": "World Bank World Development Indicators",
    "url": "https://data.worldbank.org/",
    "license": "CC BY 4.0",
    "citation": "World Bank, World Development Indicators: VC.IHR.PSRC.P5, PA.NUS.PPP, PA.NUS.FCRF.",
    "period": "latest of the 5 most recent values per country: homicide mostly 2015–2023, price level mostly 2025 (WDI update of 2026-10-08)",
    "retrieved": "2026-10-12",
}


def by_year(json_path: Path) -> dict[str, dict[str, float]]:
    """countryiso3code -> {year: value}, skipping empty codes and null values."""
    out: dict[str, dict[str, float]] = {}
    for r in json.loads(json_path.read_text(encoding="utf-8"))[1]:
        if r["countryiso3code"] and r["value"] is not None:
            out.setdefault(r["countryiso3code"], {})[r["date"]] = r["value"]
    return out


def latest_values(json_path: Path) -> dict[str, float]:
    return {c: v[max(v)] for c, v in by_year(json_path).items()}


def price_level(ppp: dict[str, dict[str, float]], fcrf: dict[str, dict[str, float]]) -> dict[str, float]:
    """PPP / exchange rate at the latest year where both exist (currencies redenominate, so years must match)."""
    out = {}
    for c, p in ppp.items():
        years = [y for y in p.keys() & fcrf.get(c, {}).keys() if fcrf[c][y]]
        if years:
            out[c] = p[max(years)] / fcrf[c][max(years)]
    return out


def build(grid: Grid, raw_dir: Path) -> dict[str, np.ndarray]:
    path = {ind: fetch(URL.format(ind=ind), raw_dir / "worldbank" / f"{ind}.json") for ind in INDICATORS}
    index, codes, _ = load_countries(raw_dir, grid.land)
    price = price_level(by_year(path["PA.NUS.PPP"]), by_year(path["PA.NUS.FCRF"]))
    return {"homicide": country_values(index, codes, latest_values(path["VC.IHR.PSRC.P5"])), "price_level": country_values(index, codes, price)}
