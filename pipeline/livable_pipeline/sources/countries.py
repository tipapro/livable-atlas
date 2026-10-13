import json
from functools import partial
from pathlib import Path

import geopandas
import numpy as np
import shapely
import rasterio.enums
import rasterio.features
import rasterio.transform
from scipy.ndimage import distance_transform_edt

from ..download import fetch
from ..grid import H, RES, W, Grid

URL = "https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip"
INFO = {
    "name": "Natural Earth admin 0 countries (10m)",
    "url": "https://www.naturalearthdata.com/",
    "license": "Public domain",
    "citation": "Made with Natural Earth.",
    "period": "Natural Earth 5.1.1",
    "retrieved": "2026-10-12",
}


# Natural Earth territories without their own value in UNDP/World Bank take the parent's.
PARENT = {"SOL": "SOM", "CYN": "CYP", "KOS": "XKX"}


def country_code(iso_a3_eh: str, adm0_a3: str) -> str:
    return adm0_a3 if iso_a3_eh == "-99" else iso_a3_eh


def country_raster(codes: list[str], geoms: list, land: np.ndarray) -> tuple[np.ndarray, list[str]]:
    """Per-cell country index (float32, NaN off land) and the codes in index order (ascending, countries with no land cell dropped)."""
    ids = {c: i + 1 for i, c in enumerate(sorted(set(codes)))}
    shapes = [(shapely.union_all([g for cc, g in zip(codes, geoms) if cc == c]), i) for c, i in ids.items()]  # one geometry per code
    raster = partial(rasterio.features.rasterize, out_shape=(H, W), transform=rasterio.transform.from_origin(-180, 90, RES, RES), dtype="int32")
    r = raster(shapes)
    # A land cell whose centre falls in no country (a small island) takes the one country touching it, if only one does.
    touched = raster(((g, 1) for g, _ in shapes), all_touched=True, merge_alg=rasterio.enums.MergeAlg.add)
    one = land & (r == 0) & (touched == 1)
    r[one] = raster(shapes, all_touched=True)[one]
    r[~land] = 0
    # shortcut: Euclidean distance in grid units, no antimeridian wrap; upgrade if a coastal cell near ±180° gets the wrong country.
    _, (ii, jj) = distance_transform_edt(r == 0, return_indices=True)
    r = r[ii, jj]
    present = np.unique(r[land])
    assert len(present) <= 255, "country index does not fit uint8"
    remap = np.zeros(max(ids.values()) + 1, np.float32)
    remap[present] = np.arange(len(present))
    by_id = {i: c for c, i in ids.items()}
    return np.where(land, remap[r], np.nan).astype(np.float32), [by_id[i] for i in present]


def load_countries(raw_dir: Path, land: np.ndarray) -> tuple[np.ndarray, list[str], dict[str, dict]]:
    path = fetch(URL, raw_dir / "countries" / "ne_10m_admin_0_countries.zip")
    df = geopandas.read_file(f"zip://{path}")
    codes = [country_code(a, b) for a, b in zip(df.ISO_A3_EH, df.ADM0_A3)]
    index, kept = country_raster(codes, list(df.geometry), land)
    names = {}
    for c, en, ru in zip(codes, df.NAME_EN, df.NAME_RU):
        names.setdefault(c, {"name": en, "nameRu": ru if isinstance(ru, str) and ru else None})
    return index, kept, {c: names[c] for c in kept}


def country_values(index: np.ndarray, codes: list[str], values: dict[str, float]) -> np.ndarray:
    """Per-cell value of the cell's country; NaN where the country has no value or off land."""
    table = np.array([values.get(c, values.get(PARENT.get(c), np.nan)) for c in codes], np.float32)
    return np.where(np.isnan(index), np.nan, table[np.nan_to_num(index).astype(int)]).astype(np.float32)


def build(grid: Grid, raw_dir: Path) -> dict[str, np.ndarray]:
    index, _, names = load_countries(raw_dir, grid.land)
    out = raw_dir.parent / "layers"
    out.mkdir(parents=True, exist_ok=True)
    (out / "countries.json").write_text(json.dumps(names, ensure_ascii=False), encoding="utf-8")
    return {"country": index}
