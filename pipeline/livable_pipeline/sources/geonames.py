import csv
import json
import zipfile
from io import TextIOWrapper
from pathlib import Path

import numpy as np
from scipy.sparse import coo_array
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

from ..download import fetch
from ..grid import R_KM, Grid, land_distance_km, unit_vectors

URL = "https://download.geonames.org/export/dump/cities15000.zip"
ALT_URL = "https://download.geonames.org/export/dump/alternateNamesV2.zip"
MIN_POP = 1_000_000
AGGLO_KM = 30
MIN_CITY_POP = 15_000
INFO = {
    "name": "GeoNames cities15000",
    "url": "https://www.geonames.org/",
    "license": "CC BY 4.0",
    "citation": "GeoNames geographical database (geonames.org).",
    "period": "database snapshot of the retrieval date",
    "retrieved": "2026-10-12",
}


def _tsv(zip_path: Path, member: str):
    with zipfile.ZipFile(zip_path) as zf, zf.open(member) as f:
        yield from csv.reader(TextIOWrapper(f, "utf-8"), delimiter="\t", quoting=csv.QUOTE_NONE)


def _clusters(lat: np.ndarray, lon: np.ndarray, link_km: float) -> np.ndarray:
    """Single-linkage cluster label per point: points within link_km of each other (transitively) share one."""
    pairs = cKDTree(unit_vectors(lat, lon)).query_pairs(2 * np.sin(link_km / (2 * R_KM)), output_type="ndarray")
    graph = coo_array((np.ones(len(pairs)), (pairs[:, 0], pairs[:, 1])), shape=(len(lat),) * 2)
    return connected_components(graph, directed=False)[1]


def metro_members(lat, lon, pop, link_km: float = AGGLO_KM, min_pop: int = MIN_POP) -> np.ndarray:
    """Mask of points in a single-linkage cluster whose population sum reaches min_pop."""
    labels = _clusters(lat, lon, link_km)
    return np.bincount(labels, weights=pop)[labels] >= min_pop


def _points(zip_path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    # PPLX rows are sections of a city that are already counted in their parent's population.
    rows = [r for r in _tsv(zip_path, "cities15000.txt") if r[7] != "PPLX"]
    return tuple(np.array([float(r[i]) for r in rows]) for i in (4, 5, 14))


def big_cities(zip_path: Path) -> tuple[np.ndarray, np.ndarray]:
    lat, lon, pop = _points(zip_path)
    keep = metro_members(lat, lon, pop)
    return lat[keep], lon[keep]


def russian_names(alt_zip: Path, ids: set[str]) -> dict[str, str]:
    cyr = lambda n: any("\u0400" <= ch <= "\u04ff" for ch in n)  # some "ru" rows are Latin transliterations
    names = {}
    for r in _tsv(alt_zip, "alternateNamesV2.txt"):
        if r[2] == "ru" and r[1] in ids and r[6] != "1" and r[7] != "1":
            old = names.get(r[1])
            # first row wins; a Cyrillic row beats a Latin one; among equal scripts a preferred row replaces
            if old is None or (cyr(r[3]), r[4] == "1") > (cyr(old), False):
                names[r[1]] = r[3]
    return names


def cities(zip_path: Path, ru: dict[str, str]) -> list[list]:
    rows = [r for r in _tsv(zip_path, "cities15000.txt") if int(r[14]) >= MIN_CITY_POP]
    out = [[r[1], ru.get(r[0]), r[8], round(float(r[4]), 4), round(float(r[5]), 4), int(r[14])] for r in rows]
    return sorted(out, key=lambda c: (-c[5], c[0]))


def build(grid: Grid, raw_dir: Path) -> dict[str, np.ndarray]:
    path = fetch(URL, raw_dir / "geonames" / "cities15000.zip")
    alt = fetch(ALT_URL, raw_dir / "geonames" / "alternateNamesV2.zip")
    ids = {r[0] for r in _tsv(path, "cities15000.txt")}
    out = raw_dir.parent / "layers"
    out.mkdir(parents=True, exist_ok=True)
    table = cities(path, russian_names(alt, ids))
    (out / "cities.json").write_text(json.dumps(table, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    lat, lon, pop = _points(path)
    labels = _clusters(lat, lon, AGGLO_KM)
    sums = np.bincount(labels, weights=pop)
    print(f"geonames: largest agglomeration {sums.max():,.0f} people, {np.sum(labels == sums.argmax())} cities")
    lat, lon = big_cities(path)
    return {"dist_bigcity": land_distance_km(lat, lon, grid.land)}
